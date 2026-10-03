import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSitesRssRequest } from "../src/sites/rssWorker";

const rssXml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>RSS Example</title><description>News</description><link>https://example.com/</link>
  <item><title>First item</title><guid>rss-1</guid><link>https://example.com/1</link><description><![CDATA[<p>Hello RSS</p>]]></description></item>
</channel></rss>`;

const atomXml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Example</title><link rel="alternate" href="https://example.org/" />
  <entry><id>atom-1</id><title>Atom item</title><link href="https://example.org/1"/><summary>Hello Atom</summary></entry>
</feed>`;

function requestFor(feedUrl = "https://feeds.example.com/main.xml", params: Record<string, string> = {}) {
  const search = new URLSearchParams({ url: feedUrl, ...params });
  return new Request(`https://reader.example/api/rss/parse?${search.toString()}`);
}

describe("Sites RSS worker", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fetches and parses RSS 2.0 into the existing product response shape", async () => {
    const fetchImpl = vi.fn(async () => new Response(rssXml, {
      status: 200,
      headers: { "Content-Type": "application/rss+xml" },
    }));

    const response = await handleSitesRssRequest(requestFor(), { fetchImpl });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      title: "RSS Example",
      description: "News",
      feedUrl: "https://feeds.example.com/main.xml",
      itemCount: 1,
      items: [{ id: "rss-1", title: "First item", snippet: "Hello RSS" }],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://feeds.example.com/main.xml"),
      expect.objectContaining({ method: "GET", redirect: "manual" }),
    );
  });

  it("fetches and parses Atom", async () => {
    const response = await handleSitesRssRequest(requestFor("https://example.org/atom.xml"), {
      fetchImpl: async () => new Response(atomXml, { status: 200 }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      title: "Atom Example",
      link: "https://example.org/",
      itemCount: 1,
      items: [{ id: "atom-1", link: "https://example.org/1", snippet: "Hello Atom" }],
    });
  });

  it("returns a structured upstream error for non-success HTTP responses", async () => {
    const response = await handleSitesRssRequest(requestFor(), {
      fetchImpl: async () => new Response("missing", { status: 404, statusText: "Not Found" }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "rss_upstream_http_error",
      error: expect.stringContaining("HTTP 404"),
      retryable: false,
    });
  });

  it("marks rate limits retryable and preserves Retry-After", async () => {
    const response = await handleSitesRssRequest(requestFor(), {
      fetchImpl: async () => new Response("limited", { status: 429, headers: { "Retry-After": "2" } }),
    });

    expect(response.status).toBe(502);
    expect(response.headers.get("Retry-After")).toBe("2");
    await expect(response.json()).resolves.toMatchObject({ code: "rss_upstream_http_error", retryable: true });
  });

  it("rejects malformed XML as an invalid feed", async () => {
    const response = await handleSitesRssRequest(requestFor(), {
      fetchImpl: async () => new Response("<rss><channel></rss>", { status: 200 }),
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ code: "rss_invalid_feed" });
  });

  it("follows redirects manually and validates the redirect target", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://feeds.example.com/main.xml") {
        return new Response(null, { status: 302, headers: { Location: "/canonical.xml" } });
      }
      return new Response(rssXml, { status: 200 });
    });

    const response = await handleSitesRssRequest(requestFor(), { fetchImpl });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1][0])).toBe("https://feeds.example.com/canonical.xml");
  });

  it("reports network failures", async () => {
    const response = await handleSitesRssRequest(requestFor(), {
      fetchImpl: async () => { throw new TypeError("connection failed"); },
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "rss_network_error",
      error: expect.stringContaining("connection failed"),
      retryable: true,
    });
  });

  it("aborts requests that exceed the runtime timeout", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));

    const pending = handleSitesRssRequest(requestFor(), { fetchImpl, timeoutMs: 25 });
    await vi.advanceTimersByTimeAsync(25);
    const response = await pending;

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({ code: "rss_timeout" });
  });

  it("blocks private and local targets instead of acting as an open proxy", async () => {
    const fetchImpl = vi.fn();
    const response = await handleSitesRssRequest(requestFor("http://127.0.0.1/feed.xml"), { fetchImpl });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "rss_unsafe_url" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("applies the shared since, newest-first, and limit semantics", async () => {
    const xml = `<rss version="2.0"><channel><title>Windowed</title><link>https://example.com</link>
      <item><title>old</title><guid>old</guid><pubDate>2026-08-01T00:00:00.000Z</pubDate><description>old</description></item>
      <item><title>middle</title><guid>middle</guid><pubDate>2026-09-20T00:00:00.000Z</pubDate><description>middle</description></item>
      <item><title>invalid</title><guid>invalid</guid><pubDate>invalid</pubDate><description>invalid</description></item>
      <item><title>new</title><guid>new</guid><pubDate>2026-09-30T00:00:00.000Z</pubDate><description>new</description></item>
    </channel></rss>`;
    const response = await handleSitesRssRequest(requestFor(undefined, {
      since: "2026-09-04T00:00:00.000Z",
      limit: "1",
    }), { fetchImpl: async () => new Response(xml) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items.map((item: { id: string }) => item.id)).toEqual(["new"]);
    expect(payload).toMatchObject({ itemCount: 1, sourceItemCount: 4, returnedItemCount: 1, truncated: true });
  });

  it.each(["0", "-1", "1.5", "Infinity", "101"])("rejects invalid limit %s before fetching", async (limit) => {
    const fetchImpl = vi.fn();
    const response = await handleSitesRssRequest(requestFor(undefined, { limit }), { fetchImpl });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "rss_invalid_limit", retryable: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
