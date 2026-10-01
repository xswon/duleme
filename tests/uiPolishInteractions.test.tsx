import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ArticleList } from "../src/components/ArticleList";
import { FeedAvatar } from "../src/components/Sidebar";
import type { Article, Feed } from "../src/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("UI polish interactions", () => {
  it("opens a focused article with Enter or Space and exposes selection", async () => {
    const article: Article = { id: "a", feedId: "f", feedTitle: "来源", title: "标题", link: "https://example.test", content: "<p>正文</p>", snippet: "正文", pubDate: "2026-10-01", read: false, starred: false };
    const select = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(() => root.render(<ArticleList articles={[article]} selectedArticleId="a" onSelectArticle={select} onToggleStar={vi.fn()} onToggleRead={vi.fn()} onSummarizeAI={vi.fn()} />));
    const row = container.querySelector("article")!;
    expect(row.tabIndex).toBe(0);
    expect(row.getAttribute("aria-current")).toBe("true");
    for (const key of ["Enter", " "]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      await act(() => row.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(true);
    }
    expect(select).toHaveBeenCalledTimes(2);
    expect(select).toHaveBeenLastCalledWith(article);
    await act(() => row.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(select).toHaveBeenCalledTimes(2);
    await act(() => root.unmount());
    container.remove();
  });

  it("renders the supplied favicon and falls back on failure", async () => {
    const feed: Feed = { id: "f", title: "中文来源", feedUrl: "https://example.test/feed", siteUrl: "https://example.test", unreadCount: 0, category: "播客", favicon: "https://example.test/favicon.png" };
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(() => root.render(<FeedAvatar feed={feed} />));
    const image = container.querySelector("img")!;
    expect(image.src).toContain("favicon.png");
    expect(image.alt).toBe("");
    await act(() => image.dispatchEvent(new Event("error")));
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("中");
    await act(() => root.unmount());
  });
});
