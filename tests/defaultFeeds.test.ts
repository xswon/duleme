import { describe, expect, it } from "vitest";
import {
  CURATED_FEEDS,
  FEATURED_CURATED_FEEDS,
  FEATURED_CURATED_FEED_IDS,
  LEGACY_DEFAULT_FEEDS,
} from "../src/data/defaultFeeds";

describe("curated feed catalog", () => {
  it("deduplicates feeds by RSS URL", () => {
    expect(new Set(CURATED_FEEDS.map((feed) => feed.feedUrl)).size).toBe(CURATED_FEEDS.length);
  });

  it("matches the current 41-feed subscription catalog and excludes the removed starter feeds", () => {
    expect(CURATED_FEEDS).toHaveLength(41);
    expect(CURATED_FEEDS.some((feed) => feed.id === "feed-sspai")).toBe(false);
    expect(CURATED_FEEDS.some((feed) => feed.id.startsWith("curated-"))).toBe(false);

    const expectedAddedIds = [
      "feed-light-the-star",
      "feed-shanghaojin",
      "feed-svvector",
      "feed-theprompt",
      "feed-aihot",
      "feed-mianji",
      "feed-zhixing",
      "feed-touziabc",
      "feed-afterschool",
      "feed-zhankaijiangjiang",
      "feed-zhiwubuyan",
      "feed-liangshiyiting",
      "feed-tongjing",
    ];
    expectedAddedIds.forEach((id) => {
      expect(CURATED_FEEDS.some((feed) => feed.id === id)).toBe(true);
    });
    expect(LEGACY_DEFAULT_FEEDS).toHaveLength(29);
  });

  it("defines a compact featured starter set from the current catalog only", () => {
    expect(FEATURED_CURATED_FEEDS).toHaveLength(FEATURED_CURATED_FEED_IDS.length);
    expect(FEATURED_CURATED_FEEDS).toHaveLength(10);
    expect(new Set(FEATURED_CURATED_FEEDS.map((feed) => feed.id))).toEqual(
      new Set(FEATURED_CURATED_FEED_IDS)
    );
    FEATURED_CURATED_FEEDS.forEach((feed) => {
      expect(CURATED_FEEDS.some((candidate) => candidate.id === feed.id)).toBe(true);
    });
  });
});
