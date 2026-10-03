import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Header } from "../src/components/Header";
import { useReaderDerivedState } from "../src/hooks/useReaderDerivedState";
import type { Article } from "../src/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
type Options = Parameters<typeof useReaderDerivedState>[0];
const feeds = [
  { id: "article-feed", title: "文章源", feedUrl: "https://example.com/articles", siteUrl: "https://example.com", category: "文件夹", unreadCount: 1 },
  { id: "podcast-feed", title: "播客源", feedUrl: "https://example.com/podcasts", siteUrl: "https://example.com", category: "文件夹", unreadCount: 1 },
];
const articles: Article[] = feeds.map((feed) => ({
  id: feed.id, feedId: feed.id, feedTitle: feed.title, title: feed.title,
  link: feed.siteUrl, pubDate: new Date(Date.now() - 60000).toISOString(),
  snippet: "", content: "", read: false, starred: false,
  ...(feed.id === "podcast-feed" ? { audioUrl: "https://example.com/audio.mp3" } : {}),
}));
const baseOptions: Options = {
  feeds, articles, activeTab: "feeds", filterType: "all", contentType: "all",
  selectedFeedId: null, selectedCategory: null, selectedArticleId: null,
  searchQuery: "", historyWindowDays: 30, timelineSortOrder: "newest",
};

function Harness({ options }: { options: Partial<Options> }) {
  const state = useReaderDerivedState({ ...baseOptions, ...options });
  return <>
    <Header activeTab={options.activeTab || "feeds"} filterType={options.filterType || "all"}
      currentTitle="列表" setFilterType={vi.fn()} onRefresh={vi.fn()} onMarkAllRead={vi.fn()}
      isRefreshing={false} onToggleMobileMenu={vi.fn()} unreadCount={state.visibleUnreadCount}
      showTimelineFilters={state.showTimelineFilters} contentType={state.effectiveContentType} />
    <output>{state.visibleArticles.map((article) => article.id).join(",")}</output>
  </>;
}

describe("reader content-type filter scopes", () => {
  it.each([
    { options: {}, shown: true },
    { options: { selectedCategory: "文件夹" }, shown: true },
    { options: { selectedFeedId: "article-feed" }, shown: false },
    { options: { selectedFeedId: "podcast-feed" }, shown: false },
    { options: { activeTab: "feeds", filterType: "starred" }, shown: false },
    { options: { activeTab: "search" }, shown: false },
    { options: { activeTab: "notes" }, shown: false },
    { options: { activeTab: "playlist" }, shown: false },
  ] satisfies Array<{ options: Partial<Options>; shown: boolean }>)("shows filters=$shown for $options", async ({ options, shown }) => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(() => root.render(<Harness options={options} />));
    expect(Boolean(container.querySelector('.wreader-timeline-type-switch'))).toBe(shown);
    await act(() => root.unmount());
  });

  it("filters folders and bypasses the inherited filter for a single feed", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(() => root.render(<Harness options={{ selectedCategory: "文件夹", contentType: "podcast" }} />));
    expect(container.querySelector('output')?.textContent).toBe("podcast-feed");
    expect(container.querySelector('[aria-pressed="true"]')?.textContent).toBe("播客");

    await act(() => root.render(<Harness options={{ selectedFeedId: "article-feed", contentType: "podcast" }} />));
    expect(container.querySelector('.wreader-timeline-type-switch')).toBeNull();
    expect(container.querySelector('output')?.textContent).toBe("article-feed");

    await act(() => root.render(<Harness options={{ selectedCategory: "文件夹", contentType: "article" }} />));
    expect(container.querySelector('output')?.textContent).toBe("article-feed");
    expect(container.querySelector('[aria-pressed="true"]')?.textContent).toBe("文章");
    await act(() => root.unmount());
  });
});
