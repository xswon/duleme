import { Article } from "../types";

export type SearchField = "title" | "content" | "summary" | "source" | "author";

export type SearchReadFilter = "ALL" | "UNREAD" | "READ";

export interface SearchFilters {
  feedId?: string;
  read?: SearchReadFilter;
  starredOnly?: boolean;
}

export interface SearchResult {
  article: Article;
  matchedFields: SearchField[];
}

export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

/** Convert feed HTML into searchable/displayable text without executing markup. */
export function stripHtml(value: string | undefined | null): string {
  if (!value) return "";

  const withoutInvisibleContent = value.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ");
  const withSpacing = withoutInvisibleContent
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<\s*\/\s*(p|div|li|section|article|h[1-6])\s*>/gi, " ");
  const withoutTags = withSpacing.replace(/<[^>]*>/g, " ");

  return decodeHtmlEntities(withoutTags).replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  const decodeCodePoint = (entity: string, valueToParse: string, radix: number) => {
    const parsed = Number.parseInt(valueToParse, radix);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff ? String.fromCodePoint(parsed) : entity;
  };

  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][\da-z]+);/gi, (entity, code: string) => {
    if (code.toLowerCase().startsWith("#x")) {
      return decodeCodePoint(entity, code.slice(2), 16);
    }
    if (code.startsWith("#")) {
      return decodeCodePoint(entity, code.slice(1), 10);
    }
    return namedEntities[code.toLowerCase()] ?? entity;
  });
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

export function tokenizeSearchQuery(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

export function getSearchableFields(article: Article): Record<SearchField, string> {
  return {
    title: stripHtml(article.title),
    content: stripHtml(article.content),
    summary: [article.snippet, article.aiSummary].filter(Boolean).map((value) => stripHtml(value)).join(" "),
    source: stripHtml(article.feedTitle),
    author: stripHtml(article.author),
  };
}

function fieldContainsTerms(value: string, terms: string[]): boolean {
  const normalizedValue = normalize(value);
  return terms.every((term) => normalizedValue.includes(term));
}

export function matchesSearchQuery(article: Article, query: string): boolean {
  const terms = tokenizeSearchQuery(query);
  if (terms.length === 0) return true;

  const searchableText = Object.values(getSearchableFields(article)).join(" ");
  return fieldContainsTerms(searchableText, terms);
}

export function searchArticles(
  articles: Article[],
  query: string,
  filters: SearchFilters = {},
): SearchResult[] {
  const terms = tokenizeSearchQuery(query);

  return articles
    .filter((article) => {
      if (terms.length > 0 && !matchesSearchQuery(article, query)) return false;
      if (filters.feedId && article.feedId !== filters.feedId) return false;
      if (filters.read === "UNREAD" && article.read) return false;
      if (filters.read === "READ" && !article.read) return false;
      if (filters.starredOnly && !article.starred) return false;
      return true;
    })
    .map((article) => ({
      article,
      matchedFields:
        terms.length === 0
          ? []
          : (Object.entries(getSearchableFields(article)) as [SearchField, string][])
              .filter(([, value]) => terms.some((term) => normalize(value).includes(term)))
              .map(([field]) => field),
    }));
}

/** Split plain text into safe React-renderable pieces; callers should render pieces as text nodes. */
export function getHighlightSegments(text: string | undefined | null, query: string): HighlightSegment[] {
  const value = text ?? "";
  const terms = tokenizeSearchQuery(query).sort((a, b) => b.length - a.length);
  if (!value || terms.length === 0) return value ? [{ text: value, highlighted: false }] : [];

  // Search terms are whitespace-delimited, so matching against the original
  // spacing keeps segment offsets aligned with the text rendered by React.
  const normalizedValue = value.toLocaleLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    let start = normalizedValue.indexOf(term);
    while (start !== -1) {
      const end = start + term.length;
      if (!ranges.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart)) {
        ranges.push([start, end]);
      }
      start = normalizedValue.indexOf(term, start + term.length);
    }
  }

  if (ranges.length === 0) return [{ text: value, highlighted: false }];
  ranges.sort((a, b) => a[0] - b[0]);

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) segments.push({ text: value.slice(cursor, start), highlighted: false });
    segments.push({ text: value.slice(start, end), highlighted: true });
    cursor = end;
  }
  if (cursor < value.length) segments.push({ text: value.slice(cursor), highlighted: false });
  return segments;
}

export function getSearchExcerpt(article: Article, query: string, maxLength = 220): string {
  const fields = getSearchableFields(article);
  const terms = tokenizeSearchQuery(query);
  const candidates = [fields.content, fields.summary, fields.title].filter(Boolean);
  const candidate = terms.length
    ? candidates.find((value) => terms.some((term) => normalize(value).includes(term))) ?? candidates[0] ?? ""
    : candidates[0] ?? "";

  if (candidate.length <= maxLength) return candidate;
  const normalizedCandidate = normalize(candidate);
  const firstMatch = terms
    .map((term) => normalizedCandidate.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const start = Math.max(0, (firstMatch ?? 0) - Math.floor(maxLength / 3));
  const excerpt = candidate.slice(start, start + maxLength).trim();
  return `${start > 0 ? "…" : ""}${excerpt}${start + maxLength < candidate.length ? "…" : ""}`;
}
