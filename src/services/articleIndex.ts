import type { Article } from "../types";

export interface ArticleLookup {
  byId: Map<string, Article>;
}

/** Build lightweight references into the canonical article array. */
export function buildArticleLookup(articles: Article[]): ArticleLookup {
  return { byId: new Map(articles.map((article) => [article.id, article])) };
}

export function derivePlayablePlaylist(
  playlistIds: string[],
  lookup: ArticleLookup,
): { ids: string[]; articles: Article[] } {
  const ids: string[] = [];
  const articles: Article[] = [];
  playlistIds.forEach((id) => {
    const article = lookup.byId.get(id);
    if (!article?.audioUrl?.trim()) return;
    ids.push(id);
    articles.push(article);
  });
  return { ids, articles };
}

export function buildArticleIndexById(articles: Article[]): Map<string, number> {
  return new Map(articles.map((article, index) => [article.id, index]));
}
