import type { ActiveTab, Article, Feed, FilterType } from "../types";
import type { TimelineContentFilter } from "./router";
import { matchesSearchQuery } from "./searchService";

export const DEFAULT_HISTORY_WINDOW_DAYS = 30;
export const HISTORY_WINDOW_STEP_DAYS = 30;

export interface LocalCalendarDayWindow {
  start: number;
  end: number;
  days: number;
}

function normalizeWindowDays(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_HISTORY_WINDOW_DAYS;
  return Math.max(DEFAULT_HISTORY_WINDOW_DAYS, Math.floor(days));
}

/**
 * Return an inclusive local-calendar-day window. A 30-day window starts at
 * local midnight 29 dates before `now`, rather than 720 hours before `now`.
 * Using calendar setters is intentional: it remains correct across DST.
 */
export function getLocalCalendarDayWindow(
  days = DEFAULT_HISTORY_WINDOW_DAYS,
  now = Date.now(),
): LocalCalendarDayWindow | null {
  if (!Number.isFinite(now)) return null;

  const normalizedDays = normalizeWindowDays(days);
  const startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (normalizedDays - 1));
  const start = startDate.getTime();
  if (!Number.isFinite(start)) return null;

  return { start, end: now, days: normalizedDays };
}

function publicationTimestamp(pubDate: string): number | null {
  const publishedAt = new Date(pubDate).getTime();
  return Number.isFinite(publishedAt) ? publishedAt : null;
}

/**
 * The single date-scope rule used by navigation unread counts:
 * valid publication dates from the inclusive 30-day cutoff through `now`.
 * Invalid and future dates are excluded conservatively.
 */
export function isWithinRecencyWindow(pubDate: string, now = Date.now()): boolean {
  return isWithinHistoryWindow(pubDate, DEFAULT_HISTORY_WINDOW_DAYS, now);
}

/** Shared predicate for recent unread navigation counts. */
export function isRecentUnreadArticle(
  article: Pick<Article, "read" | "pubDate">,
  now = Date.now(),
): boolean {
  return !article.read && isWithinRecencyWindow(article.pubDate, now);
}

export function isRecencyLimitedTab(activeTab: ActiveTab): boolean {
  return activeTab === "feeds";
}

export function isOlderThanRecencyWindow(pubDate: string, now = Date.now()): boolean {
  return isOlderThanHistoryWindow(pubDate, DEFAULT_HISTORY_WINDOW_DAYS, now);
}

export function isWithinHistoryWindow(pubDate: string, days: number, now = Date.now()): boolean {
  const publishedAt = publicationTimestamp(pubDate);
  const window = getLocalCalendarDayWindow(days, now);
  if (publishedAt === null || !window) return false;
  return publishedAt >= window.start && publishedAt <= window.end;
}

/** Feed timelines use the same conservative date scope as navigation counts. */
export function isVisibleInHistoryWindow(pubDate: string, days: number, now = Date.now()): boolean {
  return isWithinHistoryWindow(pubDate, days, now);
}

export function isOlderThanHistoryWindow(pubDate: string, days: number, now = Date.now()): boolean {
  const publishedAt = publicationTimestamp(pubDate);
  const window = getLocalCalendarDayWindow(days, now);
  return publishedAt !== null && !!window && publishedAt < window.start;
}

export function countOlderArticles(
  articles: Article[],
  feeds: Feed[],
  selectedFeedId?: string | null,
  selectedCategory?: string | null,
  options: { filterType?: FilterType; contentType?: TimelineContentFilter; searchQuery?: string; historyWindowDays?: number } = {},
  now = Date.now(),
): number {
  const categoryFeedIds = selectedCategory
    ? new Set(feeds.filter((feed) => feed.category === selectedCategory).map((feed) => feed.id))
    : null;
  const query = options.searchQuery?.trim() || "";
  const windowDays = options.historyWindowDays ?? DEFAULT_HISTORY_WINDOW_DAYS;
  return articles.filter((article) =>
    isOlderThanHistoryWindow(article.pubDate, windowDays, now) &&
    (!selectedFeedId || article.feedId === selectedFeedId) &&
    (!categoryFeedIds || categoryFeedIds.has(article.feedId)) &&
    (options.filterType !== "unread" || !article.read) &&
    (options.filterType !== "starred" || article.starred) &&
    (options.filterType === "starred" || options.contentType !== "podcast" || !!article.audioUrl?.trim()) &&
    (options.filterType === "starred" || options.contentType !== "article" || !article.audioUrl?.trim()) &&
    (!query || matchesSearchQuery(article, query))
  ).length;
}

/** Batch actions consume the already-rendered collection, never the backing store. */
export function getUnreadArticleIds(visibleArticles: Article[]): string[] {
  return visibleArticles.filter((article) => !article.read).map((article) => article.id);
}

/** Sort a rendered feed timeline newest-first without mutating its source array. */
export function sortArticlesByPubDate<T extends { pubDate?: string | null }>(articles: T[]): T[] {
  return articles
    .map((article, index) => ({ article, index, timestamp: article.pubDate ? new Date(article.pubDate).getTime() : Number.NaN }))
    .sort((a, b) => {
      const aValid = Number.isFinite(a.timestamp);
      const bValid = Number.isFinite(b.timestamp);
      if (aValid && bValid) return b.timestamp - a.timestamp || a.index - b.index;
      if (aValid !== bValid) return aValid ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ article }) => article);
}

export function canAutoMarkRead(article: Article, now = Date.now()): boolean {
  return !article.read && isWithinRecencyWindow(article.pubDate, now);
}
