export type FilterType = "all" | "unread" | "starred";

export type ActiveTab = "feeds" | "saved" | "search";

export interface Article {
  id: string;
  feedId: string;
  feedTitle: string;
  feedFavicon?: string;
  title: string;
  link: string;
  content: string;
  snippet: string;
  pubDate: string;
  author?: string;
  thumbnail?: string;
  read: boolean;
  starred: boolean;
  savedAt?: string;
  aiSummary?: string;
  audioUrl?: string;
  duration?: string;
  bidclubUrl?: string;
  bidclubSlug?: string;
}

export interface Feed {
  id: string;
  title: string;
  feedUrl: string;
  siteUrl: string;
  favicon?: string;
  category: string;
  description?: string;
  unreadCount: number;
  lastUpdated?: string;
  error?: string;
  bidclubFeedUrl?: string;
  bidclubShowSlug?: string;
}

export interface Folder {
  id: string;
  name: string;
  feedIds: string[];
}

export interface RssParseResponse {
  title: string;
  description: string;
  link: string;
  feedUrl: string;
  favicon: string;
  itemCount: number;
  items: Array<{
    id: string;
    title: string;
    link: string;
    content: string;
    snippet: string;
    pubDate: string;
    author?: string;
    thumbnail?: string;
    audioUrl?: string;
    duration?: string;
    bidclubUrl?: string;
    bidclubSlug?: string;
  }>;
}

export interface CuratedFeedOption {
  id: string;
  title: string;
  feedUrl: string;
  category: string;
  description: string;
  favicon: string;
}

export interface BidclubEpisode {
  title: string;
  dek: string;
  lang: string;
  langAlt: string;
  tldrHtml: string;
  digestHtml: string;
  transcriptHtml: string;
  tldrAltHtml: string;
  digestAltHtml: string;
  chapters: { id: string; title: string }[];
  sourceUrl?: string;
  sourceLabel?: string;
  thumbnailUrl?: string;
  durationMin?: number | null;
  showName?: string;
  hosts?: string;
  chips?: string[];
}
