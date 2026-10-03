import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Article, Feed } from "../src/types";
import {
  fetchRssFeed,
  summarizeFeedRefreshResults,
} from "../src/services/rssService";

const feed = (id: string): Feed => ({
  id,
  title: id,
  feedUrl: `https://example.com/${id}.xml`,
  siteUrl: "https://example.com",
  category: "未分类",
  unreadCount: 0,
});

const article = (feedId: string, id: string): Pick<Article, "id" | "feedId"> => ({
  feedId,
  id,
});

describe("RSS service refresh feedback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces server errors instead of returning an empty feed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: vi.fn().mockResolvedValue({ code: "rss_invalid_feed", error: "上游源不可用", retryable: false }),
    }));

    await expect(fetchRssFeed("https://example.com/feed.xml")).rejects.toThrow("上游源不可用");
  });

  it("does not hold the foreground refresh open with repeated transient retries", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "rss_network_error", error: "temporary", retryable: true }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Recovered feed", items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRssFeed("https://example.com/feed.xml")).rejects.toThrow("temporary");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts a foreground request at its deadline", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRssFeed("https://example.com/feed.xml", { timeoutMs: 1 })).rejects.toMatchObject({ code: "rss_timeout", retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a successful response without parsed items", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ title: "Broken feed" }),
    }));

    await expect(fetchRssFeed("https://example.com/feed.xml")).rejects.toThrow("无效数据");
  });

  it("only adds since and limit when explicitly requested", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ title: "Feed", items: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchRssFeed("https://example.com/feed.xml");
    await fetchRssFeed("https://example.com/feed.xml", { since: "2026-09-04T00:00:00.000Z", limit: 30 });

    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/rss/parse?url=https%3A%2F%2Fexample.com%2Ffeed.xml");
    const constrained = new URL(String(fetchMock.mock.calls[1][0]), "https://reader.example");
    expect(constrained.searchParams.get("since")).toBe("2026-09-04T00:00:00.000Z");
    expect(constrained.searchParams.get("limit")).toBe("30");
  });

  it("summarizes successful, failed, and newly fetched articles", () => {
    const feeds = [feed("one"), feed("two"), feed("three")];
    const summary = summarizeFeedRefreshResults(
      feeds,
      [
        { feed: feeds[0], articles: [article("one", "existing"), article("one", "new")] },
        null,
        { feed: feeds[2], articles: [], error: new Error("timeout") },
      ],
      [article("one", "existing")]
    );

    expect(summary).toEqual({
      totalFeeds: 3,
      succeededFeeds: 1,
      failedFeeds: 2,
      newArticles: 1,
      failedFeedIds: ["two", "three"],
      failedFeedUrls: [feeds[1].feedUrl, feeds[2].feedUrl],
      failedFeedErrors: { three: "timeout" },
    });
  });
});
