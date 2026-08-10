import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { XMLParser } from "fast-xml-parser";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "5mb" }));

// Initialize XML Parser
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseAttributeValue: true,
  trimValues: true,
});

// Helper to decode HTML entities
function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

// Helper to extract image URL from any nested object/array structure
function getImgUrlFromObject(obj: any): string | undefined {
  if (!obj) return undefined;
  if (typeof obj === "string" && obj.startsWith("http")) return obj;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const url = getImgUrlFromObject(item);
      if (url) return url;
    }
    return undefined;
  }
  if (typeof obj === "object") {
    // 1. Check all direct properties for http string matching image/href/url/src/#text
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === "string" && val.startsWith("http")) {
        const k = key.toLowerCase();
        if (k.includes("href") || k.includes("url") || k.includes("src") || k.includes("text") || k.includes("image")) {
          return val;
        }
      }
    }
    // 2. Check any string value matching image CDNs or formats
    for (const val of Object.values(obj)) {
      if (typeof val === "string" && val.startsWith("http")) {
        if (/(?:xyzcdn\.net|qiniucdn\.com|aliyuncs\.com|\.(?:jpg|jpeg|png|webp|svg|gif))/i.test(val)) {
          return val;
        }
      }
    }
    // 3. Recurse into nested objects
    for (const val of Object.values(obj)) {
      if (typeof val === "object") {
        const nested = getImgUrlFromObject(val);
        if (nested) return nested;
      }
    }
  }
  return undefined;
}

// Helper to extract clean image URL from text HTML, markdown or enclosures
function extractImageFromHtml(html?: string, baseUrl?: string): string | undefined {
  if (!html) return undefined;
  const unescaped = typeof html === "string" ? html.replace(/\\"/g, '"').replace(/\\\//g, "/") : String(html);
  const decoded = decodeHtmlEntities(unescaped);

  // 1. Match HTML <img ...> src / data-src / srcset / data-original
  const imgRegex = /<img[^>]+(?:src|data-src|srcset|data-original)=["']([^"'\s>]+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = imgRegex.exec(decoded)) !== null) {
    let imgUrl = match[1];

    if (
      imgUrl.includes("1x1") ||
      imgUrl.includes("feedburner") ||
      imgUrl.includes("pixel") ||
      imgUrl.includes("stat") ||
      imgUrl.includes("badge") ||
      imgUrl.endsWith(".gif")
    ) {
      continue;
    }

    if (imgUrl.startsWith("//")) {
      imgUrl = "https:" + imgUrl;
    } else if (imgUrl.startsWith("/") && baseUrl) {
      try {
        const origin = new URL(baseUrl).origin;
        imgUrl = origin + imgUrl;
      } catch (e) {
        // ignore
      }
    }

    if (imgUrl.startsWith("http://") || imgUrl.startsWith("https://")) {
      return imgUrl;
    }
  }

  // 2. Match Markdown image: ![alt](url)
  const mdRegex = /!\[[^\]]*\]\((https?:\/\/[^\s\)]+)\)/i;
  const mdMatch = decoded.match(mdRegex);
  if (mdMatch) {
    return mdMatch[1];
  }

  // 3. Match plain CDN image URLs
  const cdnRegex = /(https?:\/\/[^\s"'\)<>\\]+(?:xyzcdn\.net|qiniucdn\.com|aliyuncs\.com|unsplash\.com|36krcdn\.com|sspai\.com|\.(?:jpg|jpeg|png|webp|svg))[^\s"'\)<>\\]*)/i;
  const cdnMatch = decoded.match(cdnRegex);
  if (cdnMatch) {
    return cdnMatch[1];
  }

  return undefined;
}

// Helper to extract best available thumbnail from item object
function extractItemThumbnail(item: any, content: string, channel: any, feedUrl: string): string | undefined {
  // 1. Check media:thumbnail
  const mediaThumbUrl = getImgUrlFromObject(item["media:thumbnail"]);
  if (mediaThumbUrl) return mediaThumbUrl;

  // 2. Check media:content
  const mediaContentUrl = getImgUrlFromObject(item["media:content"]);
  if (mediaContentUrl) return mediaContentUrl;

  // 3. Check iTunes image (Podcasts) on item
  const itunesItemImg = getImgUrlFromObject(item["itunes:image"]);
  if (itunesItemImg) return itunesItemImg;

  // 4. Check podcast:image, image, cover on item
  const podcastImg = getImgUrlFromObject(item["podcast:image"]) || getImgUrlFromObject(item["image"]) || getImgUrlFromObject(item["cover"]);
  if (podcastImg) return podcastImg;

  // 5. Check enclosure
  let enclosure = item.enclosure;
  if (enclosure) {
    const encArray = Array.isArray(enclosure) ? enclosure : [enclosure];
    for (const enc of encArray) {
      const encUrl = getImgUrlFromObject(enc);
      const encType = enc?.["@_type"] || enc?.type || "";
      if (encUrl && (encType.startsWith("image") || /(?:xyzcdn\.net|\.(?:jpg|jpeg|png|webp|svg|gif))/i.test(encUrl))) {
        return encUrl;
      }
    }
  }

  // 6. Check content HTML or description on item
  const contentImg = extractImageFromHtml(content, item.link || feedUrl);
  if (contentImg) return contentImg;

  // 7. Regex scan over entire item object string
  try {
    const itemStr = JSON.stringify(item);
    const itemImgMatch = itemStr.match(/(https?:\/\/[^\s"'\)<>\\]+(?:xyzcdn\.net|qiniucdn\.com|aliyuncs\.com|unsplash\.com|phobos\.apple\.com|mzstatic\.com|qpic\.cn|\.(?:jpg|jpeg|png|webp|svg))[^\s"'\)<>\\]*)/i);
    if (itemImgMatch) return itemImgMatch[1];
  } catch (e) {
    // ignore
  }

  // 8. Fallback: Check channel-level iTunes or feed image
  const channelItunesImg = getImgUrlFromObject(channel?.["itunes:image"]) || getImgUrlFromObject(channel?.["image"]);
  if (channelItunesImg) return channelItunesImg;

  // 9. Regex scan over channel object string
  if (channel) {
    try {
      const channelStr = JSON.stringify(channel);
      const channelImgMatch = channelStr.match(/(https?:\/\/[^\s"'\)<>\\]+(?:xyzcdn\.net|qiniucdn\.com|aliyuncs\.com|unsplash\.com|phobos\.apple\.com|mzstatic\.com|qpic\.cn|\.(?:jpg|jpeg|png|webp|svg))[^\s"'\)<>\\]*)/i);
      if (channelImgMatch) return channelImgMatch[1];
    } catch (e) {
      // ignore
    }
  }

  return undefined;
}

// Helper to extract audio URL and duration
function extractItemAudio(item: any, content: string): { audioUrl?: string; duration?: string } {
  let audioUrl: string | undefined;

  // 1. Check enclosure
  let enclosures = item.enclosure;
  if (enclosures) {
    const encArray = Array.isArray(enclosures) ? enclosures : [enclosures];
    const audioEnc = encArray.find(
      (e: any) =>
        e?.["@_type"]?.startsWith("audio") ||
        (e?.["@_url"] && /\.(mp3|m4a|aac|wav|ogg)($|\?)/i.test(e["@_url"]))
    );
    if (audioEnc?.["@_url"]) audioUrl = audioEnc["@_url"];
  }

  // 2. Check media:content
  if (!audioUrl && item["media:content"]) {
    const mediaArray = Array.isArray(item["media:content"]) ? item["media:content"] : [item["media:content"]];
    const audioMedia = mediaArray.find(
      (m: any) =>
        m?.["@_type"]?.startsWith("audio") ||
        m?.["@_medium"] === "audio" ||
        (m?.["@_url"] && /\.(mp3|m4a|aac|wav|ogg)($|\?)/i.test(m["@_url"]))
    );
    if (audioMedia?.["@_url"]) audioUrl = audioMedia["@_url"];
  }

  // 3. Check HTML content <audio src="..."> or <source src="...">
  if (!audioUrl && content) {
    const audioMatch = content.match(/<audio[^>]+src=["']([^"']+)["']/i) || content.match(/<source[^>]+src=["']([^"']+)["']/i);
    if (audioMatch) audioUrl = audioMatch[1];
  }

  // Extract iTunes duration
  let durationRaw = item["itunes:duration"]?.["#text"] || item["itunes:duration"];
  let duration: string | undefined;
  if (typeof durationRaw === "string" || typeof durationRaw === "number") {
    duration = String(durationRaw).trim();
  }

  return { audioUrl, duration };
}

// Helper to strip HTML tags for snippet
function stripHtml(html?: string): string {
  if (!html) return "";
  const decoded = decodeHtmlEntities(html);
  return decoded.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// API: Proxy Image to bypass CORS / Referer / Hotlinking protection (e.g. Xiaoyuzhou xyzcdn.net)
app.get("/api/proxy-image", async (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl || !imageUrl.startsWith("http")) {
    return res.status(400).send("Invalid or missing image URL");
  }

  // Construct target URLs to try: 1. original imageUrl, 2. clean imageUrl without @suffix if present
  const urlsToTry = [imageUrl];
  if (imageUrl.includes("@")) {
    const cleanUrl = imageUrl.replace(/@[^/]+$/, "");
    if (cleanUrl !== imageUrl) {
      urlsToTry.push(cleanUrl);
    }
  }

  for (const targetUrl of urlsToTry) {
    let referer = "";
    if (targetUrl.includes("xyzcdn.net") || targetUrl.includes("xiaoyuzhoufm.com") || targetUrl.includes("xyzfm")) {
      referer = "https://www.xiaoyuzhoufm.com/";
    } else if (targetUrl.includes("sspai.com")) {
      referer = "https://sspai.com/";
    } else if (targetUrl.includes("36kr.com")) {
      referer = "https://36kr.com/";
    } else if (targetUrl.includes("qpic.cn") || targetUrl.includes("weixin")) {
      referer = "https://mp.weixin.qq.com/";
    } else if (targetUrl.includes("qiniucdn.com") || targetUrl.includes("aliyuncs.com")) {
      try {
        referer = new URL(targetUrl).origin + "/";
      } catch {
        referer = "";
      }
    }

    const headersOptions: Record<string, string>[] = [];
    if (referer) {
      headersOptions.push({
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: referer,
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      });
    }
    // Clean headers option (no referer)
    headersOptions.push({
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    });

    for (const headers of headersOptions) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch(targetUrl, {
          signal: controller.signal,
          headers,
          redirect: "follow",
        });
        clearTimeout(timeout);
        if (resp.ok) {
          let contentType = resp.headers.get("content-type") || "";
          if (!contentType || contentType.includes("text/") || contentType.includes("json")) {
            if (targetUrl.match(/\.(png|jpeg|jpg|webp|gif|svg)/i)) {
              const ext = targetUrl.match(/\.(png|jpeg|jpg|webp|gif|svg)/i)![1].toLowerCase();
              contentType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
            } else {
              contentType = "image/jpeg";
            }
          }

          const arrayBuffer = await resp.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          if (buffer.length > 0) {
            res.writeHead(200, {
              "Content-Type": contentType,
              "Content-Length": buffer.length.toString(),
              "Cache-Control": "public, max-age=86400, s-maxage=86400",
              "Access-Control-Allow-Origin": "*",
            });
            return res.end(buffer);
          }
        }
      } catch (e) {
        clearTimeout(timeout);
      }
    }
  }

  // Fallback: Redirect to original image URL
  return res.redirect(imageUrl);
});

// API: Parse RSS/Atom Feed from URL
app.get("/api/rss/parse", async (req, res) => {
  const feedUrl = req.query.url as string;

  if (!feedUrl) {
    return res.status(400).json({ error: "Missing feed URL parameter" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Inoreader/1.0 Bot",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xmlText = await response.text();
    const parsed = xmlParser.parse(xmlText);

    let title = "Untitled Feed";
    let description = "";
    let link = feedUrl;
    let items: any[] = [];

    // Parse RSS 2.0 / RDF
    if (parsed.rss?.channel || parsed["rdf:RDF"]) {
      const channel = parsed.rss?.channel || parsed["rdf:RDF"]?.channel;
      title = channel?.title?.["#text"] || channel?.title || title;
      description = channel?.description?.["#text"] || channel?.description || "";
      link = channel?.link?.["#text"] || channel?.link || feedUrl;

      const rawItems = channel?.item || parsed["rdf:RDF"]?.item || [];
      const itemArray = Array.isArray(rawItems) ? rawItems : [rawItems];

      items = itemArray.map((item: any, idx: number) => {
        const itemTitle = item.title?.["#text"] || item.title || "Untitled Article";
        const itemLink =
          item.link?.["#text"] ||
          item.link ||
          (typeof item.link === "string" ? item.link : feedUrl);
        const itemGuid =
          item.guid?.["#text"] ||
          item.guid ||
          itemLink ||
          `${feedUrl}-${idx}-${Date.now()}`;
        const pubDateStr =
          item.pubDate?.["#text"] || item.pubDate || item["dc:date"] || new Date().toISOString();

        const rawContent =
          item["content:encoded"]?.["#text"] ||
          item["content:encoded"] ||
          item.description?.["#text"] ||
          item.description ||
          "";

        const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

        // Thumbnail detection using enhanced helper
        let thumbnail = extractItemThumbnail(item, content, channel, feedUrl);
        if (thumbnail) thumbnail = decodeHtmlEntities(thumbnail);
        const { audioUrl, duration } = extractItemAudio(item, content);

        const author =
          item["dc:creator"]?.["#text"] ||
          item["dc:creator"] ||
          item.author?.name ||
          item.author ||
          title;

        return {
          id: String(itemGuid),
          title: stripHtml(String(itemTitle)),
          link: String(itemLink),
          content: content,
          snippet: stripHtml(content).slice(0, 240),
          pubDate: pubDateStr,
          author: typeof author === "string" ? author : title,
          thumbnail: thumbnail,
          audioUrl: audioUrl,
          duration: duration,
          read: false,
          starred: false,
        };
      });
    } else if (parsed.feed) {
      // Parse Atom Feed
      const feed = parsed.feed;
      title = feed.title?.["#text"] || feed.title || title;
      description = feed.subtitle?.["#text"] || feed.subtitle || "";

      let linkObj = Array.isArray(feed.link) ? feed.link[0] : feed.link;
      link = linkObj?.["@_href"] || feedUrl;

      const rawEntries = feed.entry || [];
      const entryArray = Array.isArray(rawEntries) ? rawEntries : [rawEntries];

      items = entryArray.map((entry: any, idx: number) => {
        const entryTitle = entry.title?.["#text"] || entry.title || "Untitled Article";

        let entryLink = feedUrl;
        if (Array.isArray(entry.link)) {
          const altLink = entry.link.find((l: any) => l["@_rel"] === "alternate") || entry.link[0];
          entryLink = altLink?.["@_href"] || feedUrl;
        } else if (entry.link?.["@_href"]) {
          entryLink = entry.link["@_href"];
        }

        const entryId = entry.id?.["#text"] || entry.id || entryLink || `${feedUrl}-${idx}`;
        const pubDateStr =
          entry.published?.["#text"] ||
          entry.published ||
          entry.updated?.["#text"] ||
          entry.updated ||
          new Date().toISOString();

        const rawContent =
          entry.content?.["#text"] ||
          entry.content ||
          entry.summary?.["#text"] ||
          entry.summary ||
          "";

        const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

        let thumbnail = extractItemThumbnail(entry, content, feed, feedUrl);
        const { audioUrl, duration } = extractItemAudio(entry, content);

        const author = entry.author?.name?.["#text"] || entry.author?.name || title;

        return {
          id: String(entryId),
          title: stripHtml(String(entryTitle)),
          link: String(entryLink),
          content: content,
          snippet: stripHtml(content).slice(0, 240),
          pubDate: pubDateStr,
          author: typeof author === "string" ? author : title,
          thumbnail: thumbnail,
          audioUrl: audioUrl,
          duration: duration,
          read: false,
          starred: false,
        };
      });
    }

    // Fallback: If not standard RSS/Atom (e.g. single webpage or episode URL like Xiaoyuzhou episode)
    if (items.length === 0 && xmlText) {
      // Extract OG tags & HTML metadata
      const ogTitleMatch = xmlText.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                           xmlText.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ||
                           xmlText.match(/<title>([^<]+)<\/title>/i);
      const ogImgMatch = xmlText.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                         xmlText.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
                         xmlText.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
      const ogDescMatch = xmlText.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
                          xmlText.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ||
                          xmlText.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);

      const htmlTitle = ogTitleMatch ? decodeHtmlEntities(ogTitleMatch[1]) : "网页文章";
      const htmlImg = ogImgMatch ? ogImgMatch[1] : extractImageFromHtml(xmlText, feedUrl);
      const htmlDesc = ogDescMatch ? decodeHtmlEntities(ogDescMatch[1]) : "";

      if (ogTitleMatch || ogImgMatch) {
        title = htmlTitle;
        description = htmlDesc;
        items = [
          {
            id: `webpage-${Date.now()}`,
            title: stripHtml(htmlTitle),
            link: feedUrl,
            content: htmlDesc || xmlText.slice(0, 1000),
            snippet: stripHtml(htmlDesc || xmlText).slice(0, 240),
            pubDate: new Date().toISOString(),
            author: "Web Article",
            thumbnail: htmlImg,
            read: false,
            starred: false,
          },
        ];
      }
    }

    // Filter out very old articles only if we have plenty of items
    if (items.length > 20) {
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - SEVEN_DAYS_MS;
      const recentItems = items.filter((item) => {
        const pubTime = new Date(item.pubDate).getTime();
        return isNaN(pubTime) || pubTime >= cutoffTime;
      });
      if (recentItems.length >= 5) {
        items = recentItems;
      } else {
        items = items.slice(0, 30);
      }
    }

    // Favicon helper
    let favicon = "";
    try {
      const parsedUrl = new URL(link);
      favicon = `https://www.google.com/s2/favicons?domain=${parsedUrl.hostname}&sz=64`;
    } catch {
      favicon = "";
    }

    return res.json({
      title: stripHtml(title),
      description: stripHtml(description),
      link,
      feedUrl,
      favicon,
      itemCount: items.length,
      items,
    });
  } catch (error: any) {
    console.error("Error parsing feed:", error);
    return res.status(500).json({
      error: `Failed to fetch or parse RSS feed: ${error.message || "Unknown error"}`,
    });
  }
});

// API: AI Article Summary using Gemini API
app.post("/api/ai/summarize", async (req, res) => {
  const { title, content, snippet } = req.body;

  if (!title && !content) {
    return res.status(400).json({ error: "Missing article title or content" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is not configured in secrets.",
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const promptText = `You are an expert news and RSS article assistant for Inoreader.
Please analyze the following article and provide:
1. A concise 2-3 sentence executive summary.
2. 3 key takeaways (bullet points).
3. Estimated reading time in minutes.

Article Title: ${title || "Untitled"}
Article Excerpt / Content: ${content ? content.slice(0, 3000) : snippet || ""}

Respond in clean markdown formatted with bullet points.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: promptText,
    });

    return res.json({
      summary: response.text || "Could not generate summary.",
    });
  } catch (err: any) {
    console.error("AI Summary error:", err);
    return res.status(500).json({
      error: `AI Generation failed: ${err.message || "Unknown error"}`,
    });
  }
});

async function startServer() {
  // Vite middleware for development vs static in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Inoreader server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
