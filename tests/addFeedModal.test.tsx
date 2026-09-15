import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RssParseResponse } from "../src/types";

const serviceMocks = vi.hoisted(() => ({
  fetchRssFeed: vi.fn(),
  matchBidclubItems: vi.fn(),
}));

vi.mock("../src/services/rssService", () => ({
  fetchRssFeed: serviceMocks.fetchRssFeed,
  matchBidclubItems: serviceMocks.matchBidclubItems,
}));

import { AddFeedModal } from "../src/components/AddFeedModal";
import { CURATED_FEEDS } from "../src/data/defaultFeeds";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const parsedFeed: RssParseResponse = {
  title: "Example",
  description: "Example feed",
  link: "https://example.com",
  feedUrl: CURATED_FEEDS[0].feedUrl,
  favicon: "https://example.com/favicon.ico",
  itemCount: 1,
  items: [{
    id: "item-1",
    title: "First item",
    link: "https://example.com/item-1",
    content: "Content",
    snippet: "Snippet",
    pubDate: "2026-08-31T00:00:00Z",
  }],
};

async function renderModal(onAddFeed = vi.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <AddFeedModal
        isOpen
        onClose={vi.fn()}
        existingFeeds={[]}
        onAddFeed={onAddFeed}
        onImportOpmlFile={vi.fn()}
      />
    );
  });
  return { container, root, onAddFeed };
}

function buttonWithText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes(text)
  );
}

beforeEach(() => {
  serviceMocks.fetchRssFeed.mockReset();
  serviceMocks.matchBidclubItems.mockReset();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("AddFeedModal curated subscriptions", () => {
  it("does not create an empty subscription when fetching a recommendation fails", async () => {
    serviceMocks.fetchRssFeed.mockRejectedValueOnce(new Error("源暂时不可用"));
    const { container, root, onAddFeed } = await renderModal();

    await act(async () => buttonWithText(container, "推荐源")?.click());
    await act(async () => buttonWithText(container, "订阅")?.click());

    expect(onAddFeed).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("源暂时不可用");
    expect(buttonWithText(container, "重试")).toBeTruthy();
    serviceMocks.fetchRssFeed.mockResolvedValueOnce(parsedFeed);
    await act(async () => buttonWithText(container, "重试")?.click());
    expect(onAddFeed).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it("does not create a recommendation whose successful response has no articles", async () => {
    serviceMocks.fetchRssFeed.mockResolvedValueOnce({ ...parsedFeed, items: [], itemCount: 0 });
    const { container, root, onAddFeed } = await renderModal();

    await act(async () => buttonWithText(container, "推荐源")?.click());
    await act(async () => buttonWithText(container, "订阅")?.click());

    expect(onAddFeed).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("未创建订阅");
    await act(async () => root.unmount());
  });

  it("creates a recommendation only after a successful non-empty fetch", async () => {
    serviceMocks.fetchRssFeed.mockResolvedValueOnce(parsedFeed);
    const { container, root, onAddFeed } = await renderModal();

    await act(async () => buttonWithText(container, "推荐源")?.click());
    await act(async () => buttonWithText(container, "订阅")?.click());

    expect(onAddFeed).toHaveBeenCalledTimes(1);
    expect(onAddFeed.mock.calls[0][1]).toHaveLength(1);
    await act(async () => root.unmount());
  });
});
