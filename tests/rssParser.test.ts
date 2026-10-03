import { describe, expect, it } from "vitest";
import { MAX_RSS_ITEM_LIMIT, parseFeedXml, parseRssQueryOptions } from "../server/services/rssParser";

function datedRss(items: Array<{ id: string; date?: string; content?: string }>) {
  return `<rss version="2.0"><channel><title>Dated</title><link>https://example.com</link>${items.map((item) => `<item><title>${item.id}</title><guid>${item.id}</guid><link>https://example.com/${item.id}</link>${item.date === undefined ? "" : `<pubDate>${item.date}</pubDate>`}<description><![CDATA[${item.content || `<p>${item.id}</p>`}]]></description></item>`).join("")}</channel></rss>`;
}

describe("rssParser format compatibility", () => {
  it("parses RSS 2.0", () => {
    const result = parseFeedXml(`<rss version="2.0"><channel><title>RSS</title><description>D</description><link>https://example.com</link><item><title>Hello</title><guid>1</guid><description><![CDATA[<p>Body</p>]]></description><link>https://example.com/1</link></item></channel></rss>`, "https://example.com/rss");
    expect(result.title).toBe("RSS");
    expect(result.items[0]).toMatchObject({ id: "1", title: "Hello", snippet: "Body" });
  });

  it("parses Atom", () => {
    const result = parseFeedXml(`<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><id>a1</id><title>Entry</title><link rel="alternate" href="https://example.com/a1"/><summary>Summary</summary></entry></feed>`, "https://example.com/atom");
    expect(result.title).toBe("Atom");
    expect(result.items[0]).toMatchObject({ id: "a1", link: "https://example.com/a1", snippet: "Summary" });
  });

  it("parses RDF", () => {
    const result = parseFeedXml(`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><channel><title>RDF</title><link>https://example.com</link></channel><item><title>RDF item</title><link>https://example.com/i</link><description>Text</description></item></rdf:RDF>`, "https://example.com/rdf");
    expect(result.title).toBe("RDF");
    expect(result.items[0].title).toBe("RDF item");
  });

  it("preserves podcast audio and duration from RSS enclosures", () => {
    const result = parseFeedXml(`<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>Podcast</title><item><title>Episode</title><guid>episode-1</guid><description>Show notes</description><enclosure url="https://cdn.example.com/episode.mp3" type="audio/mpeg"/><itunes:duration>01:02:03</itunes:duration></item></channel></rss>`, "https://example.com/podcast.xml");

    expect(result.items[0]).toMatchObject({
      content: "Show notes",
      snippet: "Show notes",
      audioUrl: "https://cdn.example.com/episode.mp3",
      duration: "01:02:03",
    });
  });

  it("rejects malformed XML and non-feed documents", () => {
    expect(() => parseFeedXml("<rss><channel></rss>", "https://example.com/broken.xml", { strict: true }))
      .toThrow(/Invalid feed XML/);
    expect(() => parseFeedXml("<html><body>Not a feed</body></html>", "https://example.com/", { strict: true }))
      .toThrow(/not a supported RSS/);
    expect(parseFeedXml("<html><body>Not a feed</body></html>", "https://example.com/"))
      .toMatchObject({ title: "Untitled Feed", items: [] });
  });

  it("keeps the full source order and fallback-date behavior when no window options are supplied", () => {
    const result = parseFeedXml(datedRss([
      { id: "old", date: "2026-01-01T00:00:00.000Z" },
      { id: "missing" },
      { id: "new", date: "2026-09-20T00:00:00.000Z" },
    ]), "https://example.com/rss");

    expect(result.items.map((item) => item.id)).toEqual(["old", "missing", "new"]);
    expect(Number.isFinite(Date.parse(String(result.items[1].pubDate)))).toBe(true);
    expect(result).toMatchObject({ sourceItemCount: 3, returnedItemCount: 3, truncated: false });
  });

  it("excludes old, future, missing, and invalid dates from a since window", () => {
    const result = parseFeedXml(datedRss([
      { id: "old", date: "2026-08-01T00:00:00.000Z" },
      { id: "missing" },
      { id: "invalid", date: "not-a-date" },
      { id: "inside", date: "2026-09-20T00:00:00.000Z" },
      { id: "future", date: "2026-10-04T00:00:00.000Z" },
    ]), "https://example.com/rss", {
      since: Date.parse("2026-09-04T00:00:00.000Z"),
      now: Date.parse("2026-10-03T12:00:00.000Z"),
    });

    expect(result.items.map((item) => item.id)).toEqual(["inside"]);
    expect(result).toMatchObject({ sourceItemCount: 5, returnedItemCount: 1, truncated: false });
  });

  it("sorts filtered items newest-first, applies limit, and keeps full content", () => {
    const result = parseFeedXml(datedRss([
      { id: "middle", date: "2026-09-20T00:00:00.000Z", content: "<p>middle full body</p>" },
      { id: "newest", date: "2026-09-30T00:00:00.000Z", content: "<p>newest full body</p>" },
      { id: "oldest", date: "2026-09-10T00:00:00.000Z" },
    ]), "https://example.com/rss", {
      since: Date.parse("2026-09-04T00:00:00.000Z"),
      limit: 2,
      now: Date.parse("2026-10-03T12:00:00.000Z"),
    });

    expect(result.items.map((item) => item.id)).toEqual(["newest", "middle"]);
    expect(result.items[0].content).toBe("<p>newest full body</p>");
    expect(result).toMatchObject({ sourceItemCount: 3, returnedItemCount: 2, truncated: true });
  });

  it("strictly validates since and limit query values", () => {
    expect(parseRssQueryOptions({ since: "2026-09-04T00:00:00.000Z", limit: "30" })).toEqual({
      since: Date.parse("2026-09-04T00:00:00.000Z"),
      limit: 30,
    });
    ["0", "-1", "1.5", "Infinity", " 3", String(MAX_RSS_ITEM_LIMIT + 1)].forEach((limit) => {
      expect(() => parseRssQueryOptions({ limit })).toThrow(/limit/);
    });
    expect(() => parseRssQueryOptions({ since: "2026-09-04" })).toThrow(/since/);
  });
});
