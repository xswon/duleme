import { Article, Feed, RssParseResponse } from "../types";
import { DEFAULT_FEEDS, INITIAL_ARTICLES } from "../data/defaultFeeds";

const STORAGE_KEY_FEEDS = "inoreader_feeds_v1";
const STORAGE_KEY_ARTICLES = "inoreader_articles_v1";

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
          if (!a.thumbnail) {
            if (a.feedTitle?.includes("苔藓") || a.title?.includes("办公Agent")) {
              return { ...a, thumbnail: "https://image.xyzcdn.net/FrZIT1qUXdDaKAbF0wUSZ-oYfDr-.jpeg@small" };
            }
            if (a.feedTitle?.includes("跨国串门")) {
              return { ...a, thumbnail: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80" };
            }
            if (a.feedTitle?.includes("十字路口")) {
              return { ...a, thumbnail: "https://image.xyzcdn.net/FrZIT1qUXdDaKAbF0wUSZ-oYfDr-.jpeg@small" };
            }
            if (a.feedTitle?.includes("42章经")) {
              return { ...a, thumbnail: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=600&q=80" };
            }
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
