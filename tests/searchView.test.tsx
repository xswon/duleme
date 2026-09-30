import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SearchView } from "../src/components/SearchView";
import { searchArticles } from "../src/services/searchService";
import type { Article, Feed } from "../src/types";

const feed: Feed = {
  id: "feed-1",
  title: "Example Source",
  feedUrl: "https://example.com/rss",
  siteUrl: "https://example.com",
  category: "Tech",
  unreadCount: 0,
};

const article: Article = {
  id: "article-1",
  feedId: feed.id,
  feedTitle: feed.title,
  title: "Safe <em>search</em> title",
  link: "https://example.com/item",
  content: "<p>A body containing needle</p>",
  snippet: "Summary",
  pubDate: "2026-08-18T00:00:00Z",
  author: "Ada",
  read: false,
  starred: false,
};

function render(query = "search") {
  return renderToStaticMarkup(
    <SearchView
      results={searchArticles([article], query)}
      feeds={[feed]}
      searchQuery={query}
      setSearchQuery={vi.fn()}
      onSelectArticle={vi.fn()}
      onToggleStar={vi.fn()}
      onToggleRead={vi.fn()}
      onSummarizeAI={vi.fn()}
    />,
  );
}

describe("SearchView", () => {
  it("matches the prototype heading and compact search control", () => {
    const html = render("");
    expect(html).toContain("<span>工具</span><h2>搜索</h2>");
    expect(html).toContain("在全部订阅源中查找文章、播客和摘要。");
    expect(html).toContain('placeholder="搜索标题、正文、摘要、作者或来源…"');
    expect(html).toContain("找到 1 条结果");
    expect(html).toContain("<kbd>⌘K</kbd>");
  });

  it("renders highlights as mark elements and keeps article HTML escaped", () => {
    const html = render();
    expect(html).toContain("<mark");
    expect(html).not.toContain("<em>search</em>");
    expect(html).toContain("Safe ");
    expect(html).toContain("search</mark> title");
  });

  it("uses compact document rows and marks the selected result", () => {
    const html = renderToStaticMarkup(
      <SearchView
        results={searchArticles([article], "search")}
        feeds={[feed]}
        searchQuery="search"
        setSearchQuery={vi.fn()}
        onSelectArticle={vi.fn()}
        onToggleStar={vi.fn()}
        onToggleRead={vi.fn()}
        onSummarizeAI={vi.fn()}
        selectedArticleId={article.id}
      />
    );
    expect(html).toContain("lucide-file-text");
    expect(html).toContain('class="wreader-search-result is-selected"');
    expect(html).toContain("Summary");
    expect(html).toContain("· 文章");
    expect(html).not.toContain("lucide-bookmark");
  });

  it("shows podcast metadata without making podcast-only fields part of the search prompt", () => {
    const podcast = { ...article, id: "podcast-1", audioUrl: "https://example.com/audio.mp3", duration: "3600" };
    const html = renderToStaticMarkup(
      <SearchView
        results={searchArticles([podcast], "search")}
        feeds={[feed]}
        searchQuery="search"
        setSearchQuery={vi.fn()}
        onSelectArticle={vi.fn()}
        onToggleStar={vi.fn()}
        onToggleRead={vi.fn()}
        onSummarizeAI={vi.fn()}
      />
    );
    expect(html).toContain("lucide-headphones");
    expect(html).toContain("· 播客");
    expect(html).toContain("60 min");
    expect(html).not.toContain("嘉宾");
  });
});
