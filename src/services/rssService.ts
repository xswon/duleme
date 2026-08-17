import { Article, Feed, RssParseResponse, BidclubEpisode } from "../types";
import { DEFAULT_FEEDS, INITIAL_ARTICLES } from "../data/defaultFeeds";

const STORAGE_KEY_FEEDS = "inoreader_feeds_v2";
const STORAGE_KEY_ARTICLES = "inoreader_articles_v2";

export function getStoredFeeds(): Feed[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FEEDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to load stored feeds:", e);
  }
  return DEFAULT_FEEDS;
}

export function saveStoredFeeds(feeds: Feed[]) {
  try {
    localStorage.setItem(STORAGE_KEY_FEEDS, JSON.stringify(feeds));
  } catch (e) {
    console.error("Failed to save feeds to localStorage:", e);
  }
}

export function getStoredArticles(): Article[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ARTICLES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Map over stored items to update thumbnails & refresh pubDate for initial seed articles
        const updated = parsed.map((a: Article) => {
          // Strip legacy demo audio URLs (SoundHelix placeholders)
          if (a.audioUrl && a.audioUrl.includes("soundhelix.com")) {
            a = { ...a, audioUrl: undefined, duration: undefined };
          }
          // Strip the legacy hardcoded shared cover (was wrongly applied to
          // every 十字路口/42章经 article without its own thumbnail)
          if (
            a.thumbnail &&
            a.thumbnail.includes("FrZIT1qUXdDaKAbF0wUSZ") &&
            !a.feedTitle?.includes("苔藓")
          ) {
            a = { ...a, thumbnail: undefined };
          }
          // Strip legacy Unsplash stock photos used as fake seed covers
          if (a.thumbnail && a.thumbnail.includes("images.unsplash.com")) {
            a = { ...a, thumbnail: undefined };
          }
          const initMatch = INITIAL_ARTICLES.find(
            (ia) => ia.id === a.id || (ia.title && a.title && ia.title.trim() === a.title.trim())
          );
          if (initMatch) {
            return {
              ...a,
              pubDate: initMatch.pubDate,
              thumbnail: initMatch.thumbnail || a.thumbnail,
            };
          }
          return a;
        });

        return updated;
      }
    }
  } catch (e) {
    console.warn("Failed to load stored articles:", e);
  }
  return INITIAL_ARTICLES;
}

export function saveStoredArticles(articles: Article[]) {
  try {
    localStorage.setItem(STORAGE_KEY_ARTICLES, JSON.stringify(articles));
  } catch (e) {
    console.error("Failed to save articles to localStorage:", e);
  }
}

// Fetch single RSS feed from server API
export async function fetchRssFeed(feedUrl: string): Promise<RssParseResponse> {
  const encodeUrl = encodeURIComponent(feedUrl);
  const response = await fetch(`/api/rss/parse?url=${encodeUrl}`);
  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.error || `HTTP ${response.status}: Failed to parse RSS feed`);
  }
  return await response.json();
}

export function normalizeEpisodeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\[[^\]]*\]|【[^】]*】/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .replace(/^(ep|episode|第)\d+/i, "");
}

function getEpisodeNumber(title: string): string | undefined {
  return title.match(/(?:第\s*|ep(?:isode)?\s*)?(\d{1,4})(?:集|期)?\b/i)?.[1];
}

function getBidclubReference(item: { link?: string }): { url?: string; slug?: string } {
  const link = item.link?.trim();
  if (!link) return {};
  try {
    const parsed = new URL(link);
    const match = parsed.pathname.match(/\/e\/([^/]+)/);
    if (match) return { url: link, slug: match[1] };
  } catch {
    // Keep supporting bare slugs in hand-authored mappings.
  }
  return { slug: link };
}

function parseDurationSeconds(value?: string): number | undefined {
  if (!value) return undefined;
  const parts = value.split(":").map(Number);
  if (parts.some(Number.isNaN)) return undefined;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

/** Match primary RSS episodes to a BidClub feed without replacing primary audio metadata. */
export function attachBidclubMatches<T extends { title: string; pubDate: string; duration?: string }>(
  primaryItems: T[],
  bidclubItems: Array<{ title: string; pubDate: string; link: string; duration?: string }>
): (T & { bidclubUrl?: string; bidclubSlug?: string })[] {
  const used = new Set<number>();
  return primaryItems.map((item) => {
    const title = normalizeEpisodeTitle(item.title);
    const number = getEpisodeNumber(item.title);
    const pubTime = new Date(item.pubDate).getTime();
    let best: { index: number; score: number } | undefined;

    bidclubItems.forEach((candidate, index) => {
      if (used.has(index)) return;
      const candidateTitle = normalizeEpisodeTitle(candidate.title);
      const titleMatch = title === candidateTitle || title.includes(candidateTitle) || candidateTitle.includes(title);
      const numberMatch = !!number && number === getEpisodeNumber(candidate.title);
      if (!titleMatch && !numberMatch) return;
      const candidateTime = new Date(candidate.pubDate).getTime();
      const daysApart = Number.isFinite(pubTime) && Number.isFinite(candidateTime)
        ? Math.abs(pubTime - candidateTime) / 86_400_000
        : 0;
      if (daysApart > 14) return;
      const durationA = parseDurationSeconds(item.duration);
      const durationB = parseDurationSeconds(candidate.duration);
      const durationMatch = durationA !== undefined && durationB !== undefined && Math.abs(durationA - durationB) <= 180;
      const score = (title === candidateTitle ? 100 : titleMatch ? 70 : 40) + (durationMatch ? 15 : 0) - daysApart;
      if (!best || score > best.score) best = { index, score };
    });

    if (!best) return item;
    used.add(best.index);
    const reference = getBidclubReference(bidclubItems[best.index]);
    return { ...item, bidclubUrl: reference.url, bidclubSlug: reference.slug };
  });
}

// Fetch full BidClub episode detail (TL;DR + digest + transcript) from server proxy
export async function fetchBidclubEpisode(episodeUrl: string): Promise<BidclubEpisode> {
  const encodeUrl = encodeURIComponent(episodeUrl);
  const response = await fetch(`/api/bidclub/episode?url=${encodeUrl}`);
  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.error || `HTTP ${response.status}: Failed to fetch BidClub episode`);
  }
  return await response.json();
}

// Summarize article via server Gemini AI
export async function summarizeArticleWithAI(
  title: string,
  content: string,
  snippet: string
): Promise<string> {
  const response = await fetch("/api/ai/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content, snippet }),
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.error || "Failed to generate AI summary.");
  }

  const data = await response.json();
  return data.summary;
}

// Export OPML file
export function exportOpml(feeds: Feed[]) {
  const xmlLines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<opml version="2.0">`,
    `  <head>`,
    `    <title>Inoreader Subscriptions Export</title>`,
    `    <dateCreated>${new Date().toUTCString()}</dateCreated>`,
    `  </head>`,
    `  <body>`,
  ];

  // Group by categories
  const categoriesMap = new Map<string, Feed[]>();
  feeds.forEach((feed) => {
    const cat = feed.category || "Uncategorized";
    if (!categoriesMap.has(cat)) categoriesMap.set(cat, []);
    categoriesMap.get(cat)!.push(feed);
  });

  categoriesMap.forEach((categoryFeeds, catName) => {
    xmlLines.push(`    <outline text="${escapeXml(catName)}" title="${escapeXml(catName)}">`);
    categoryFeeds.forEach((f) => {
      xmlLines.push(
        `      <outline type="rss" text="${escapeXml(f.title)}" title="${escapeXml(
          f.title
        )}" xmlUrl="${escapeXml(f.feedUrl)}" htmlUrl="${escapeXml(f.siteUrl || "")}" />`
      );
    });
    xmlLines.push(`    </outline>`);
  });

  xmlLines.push(`  </body>`, `</opml>`);

  const blob = new Blob([xmlLines.join("\n")], { type: "text/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inoreader_export_${new Date().toISOString().slice(0, 10)}.opml`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
