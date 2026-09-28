import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CURATED_FEEDS } from "../src/data/defaultFeeds";
import { useFeedManagement } from "../src/hooks/useFeedManagement";
import type { Feed } from "../src/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("OPML import enrichment", () => {
  it("adds explicit enrichment fields for known RSS URLs without matching unknown feed titles", async () => {
    const known = CURATED_FEEDS.find((feed) => feed.bidclubFeedUrl)!;
    const setFeeds = vi.fn();
    const queueRefresh = vi.fn();
    let importOpmlFile: ReturnType<typeof useFeedManagement>["importOpmlFile"] = async () => false;
    function Harness() {
      ({ importOpmlFile } = useFeedManagement({
        feeds: [], setFeeds, feedsRef: { current: [] },
        setArticles: vi.fn(), categories: [], setCategories: vi.fn(), setFeedOrderByFolder: vi.fn(),
        selectedFeedId: null, setSelectedFeedId: vi.fn(), selectedCategory: null, setSelectedCategory: vi.fn(),
        selectedArticle: null, setSelectedArticleId: vi.fn(), isSettingsOpen: false,
        navigateToRoute: vi.fn(), queueRefresh, invalidateRefresh: vi.fn(), showToast: vi.fn(),
      }));
      return null;
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<Harness />));
    const xml = `<opml><body><outline title="${known.title}" xmlUrl="${known.feedUrl}"/><outline title="${known.title}" xmlUrl="https://unknown.example/rss.xml"/></body></opml>`;
    const file = new File([xml], "feeds.opml", { type: "text/xml" });
    Object.defineProperty(file, "text", { value: async () => xml });

    await act(async () => expect(await importOpmlFile(file)).toBe(true));

    const saved = setFeeds.mock.calls[0][0]([]) as Feed[];
    expect(saved[0]).toMatchObject({ feedUrl: known.feedUrl, bidclubFeedUrl: known.bidclubFeedUrl, bidclubShowSlug: known.bidclubShowSlug });
    expect(saved[1]).toMatchObject({ feedUrl: "https://unknown.example/rss.xml" });
    expect(saved[1].bidclubFeedUrl).toBeUndefined();
    expect(queueRefresh).toHaveBeenCalledWith(saved.map((feed) => feed.id));
    await act(async () => root.unmount());
  });
});
