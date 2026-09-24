import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Article } from "../src/types";
import { ArticleList } from "../src/components/ArticleList";
import { SearchView } from "../src/components/SearchView";
import { VirtualWindow } from "../src/components/VirtualWindow";
import { searchArticles } from "../src/services/searchService";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const articles = Array.from({ length: 50_000 }, (_, index): Article => ({
  id: `article-${index}`,
  feedId: `feed-${index % 500}`,
  feedTitle: `Feed ${index % 500}`,
  title: `Needle item ${index}`,
  link: `https://example.com/${index}`,
  content: "<p>Needle body</p>",
  snippet: "Needle summary",
  pubDate: "2026-09-24T00:00:00Z",
  read: false,
  starred: false,
}));

const listProps = {
  onSelectArticle: vi.fn(),
  onToggleStar: vi.fn(),
  onToggleRead: vi.fn(),
  onSummarizeAI: vi.fn(),
};

describe("large-list virtualization", () => {
  it("bounds timeline DOM rows and keeps the older control reachable", () => {
    const html = renderToStaticMarkup(
      <ArticleList {...listProps} articles={articles} olderArticleCount={20} onShowOlder={vi.fn()} />,
    );
    expect((html.match(/data-article-id=/g) || []).length).toBeLessThan(200);
    expect(html).toContain('data-virtual-count="50000"');
    expect(html).toContain("继续加载 30 天");
  });

  it("bounds search rows while preserving mounted-row highlighting", () => {
    const results = searchArticles(articles, "needle");
    const html = renderToStaticMarkup(
      <SearchView
        results={results}
        feeds={[]}
        searchQuery="needle"
        setSearchQuery={vi.fn()}
        onSelectArticle={vi.fn()}
        onToggleStar={vi.fn()}
        onToggleRead={vi.fn()}
        onSummarizeAI={vi.fn()}
      />,
    );
    expect((html.match(/wreader-search-result"/g) || []).length).toBeLessThan(200);
    expect(html).toContain('data-virtual-count="50000"');
    expect(html).toContain("<mark");
  });

  it("changes the mounted window on scroll", async () => {
    const scroller = document.createElement("div");
    scroller.className = "wreader-master-scroll";
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 400 },
      offsetHeight: { configurable: true, value: 400 },
      offsetWidth: { configurable: true, value: 600 },
    });
    scroller.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 600, bottom: 400, width: 600, height: 400, toJSON: () => ({}) });
    document.body.appendChild(scroller);
    const root = createRoot(scroller);
    await act(async () => {
      root.render(<VirtualWindow count={50_000} estimateSize={40} renderItem={(index) => <span data-row={index}>{index}</span>} />);
    });
    const before = Array.from(scroller.querySelectorAll("[data-row]")).map((node) => Number(node.getAttribute("data-row")));
    await act(async () => {
      scroller.scrollTop = 20_000;
      scroller.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const after = Array.from(scroller.querySelectorAll("[data-row]")).map((node) => Number(node.getAttribute("data-row")));
    expect(before[0]).toBeLessThan(20);
    expect(Math.min(...after)).toBeGreaterThan(100);
    expect(after.length).toBeLessThan(200);
    await act(async () => root.unmount());
    scroller.remove();
  });

  it("opens the correct article from a mounted virtual row", async () => {
    const onSelectArticle = vi.fn();
    const scroller = document.createElement("div");
    scroller.className = "wreader-master-scroll";
    Object.defineProperties(scroller, {
      offsetHeight: { configurable: true, value: 800 },
      offsetWidth: { configurable: true, value: 600 },
    });
    document.body.appendChild(scroller);
    const root = createRoot(scroller);
    await act(async () => {
      root.render(<ArticleList {...listProps} onSelectArticle={onSelectArticle} articles={articles} />);
    });
    const row = scroller.querySelector<HTMLElement>("[data-article-id]");
    const id = row?.dataset.articleId;
    await act(async () => row?.click());
    expect(onSelectArticle).toHaveBeenCalledWith(expect.objectContaining({ id }));
    await act(async () => root.unmount());
    scroller.remove();
  });
});
