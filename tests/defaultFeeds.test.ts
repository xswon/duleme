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

  it("keeps every legacy default feed discoverable in the curated catalog", () => {
    const curatedUrls = new Set(CURATED_FEEDS.map((feed) => feed.feedUrl));
    LEGACY_DEFAULT_FEEDS.forEach((feed) => {
      expect(curatedUrls.has(feed.feedUrl)).toBe(true);
    });
  });

  it("defines a compact featured starter set", () => {
    expect(FEATURED_CURATED_FEEDS).toHaveLength(FEATURED_CURATED_FEED_IDS.length);
    expect(FEATURED_CURATED_FEEDS.length).toBeGreaterThanOrEqual(8);
    expect(FEATURED_CURATED_FEEDS.length).toBeLessThanOrEqual(12);
    expect(new Set(FEATURED_CURATED_FEEDS.map((feed) => feed.id))).toEqual(
      new Set(FEATURED_CURATED_FEED_IDS)
    );
  });
});
