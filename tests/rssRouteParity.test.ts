// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const proxy = vi.hoisted(() => ({ fetchSafeExternal: vi.fn() }));

vi.mock("../server/services/proxyService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/services/proxyService")>();
  return { ...actual, fetchSafeExternal: proxy.fetchSafeExternal };
});

import { createRssRouter } from "../server/routes/rss";
import { handleSitesRssRequest } from "../src/sites/rssWorker";

const xml = `<rss version="2.0"><channel><title>Parity</title><link>https://example.com</link>
  <item><title>middle</title><guid>middle</guid><pubDate>2026-09-20T00:00:00.000Z</pubDate><description>middle body</description></item>
  <item><title>old</title><guid>old</guid><pubDate>2026-08-01T00:00:00.000Z</pubDate><description>old body</description></item>
  <item><title>new</title><guid>new</guid><pubDate>2026-09-30T00:00:00.000Z</pubDate><description>new body</description></item>
</channel></rss>`;

async function callExpress(query: Record<string, unknown>) {
  const router = createRssRouter() as unknown as {
    stack: Array<{ route?: { path: string; stack: Array<{ handle: (request: unknown, response: unknown) => Promise<unknown> }> } }>;
  };
  const handler = router.stack.find((layer) => layer.route?.path === "/parse")!.route!.stack[0].handle;
  let status = 200;
  let payload: unknown;
  const response = {
    status(code: number) { status = code; return this; },
    json(value: unknown) { payload = value; return this; },
    setHeader: vi.fn(),
  };
  await handler({ query }, response);
  return { status, payload };
}

describe("Express and Sites RSS parity", () => {
  beforeEach(() => {
    proxy.fetchSafeExternal.mockReset();
    proxy.fetchSafeExternal.mockResolvedValue(new Response(xml));
  });

  it("returns the same constrained item set and diagnostics", async () => {
    const query = {
      url: "https://feeds.example.com/main.xml",
      since: "2026-09-04T00:00:00.000Z",
      limit: "1",
    };
    const expressResult = await callExpress(query);
    const sitesResponse = await handleSitesRssRequest(new Request(`https://reader.example/api/rss/parse?${new URLSearchParams(query)}`), {
      fetchImpl: async () => new Response(xml),
    });
    const sitesPayload = await sitesResponse.json();

    expect(expressResult.status).toBe(200);
    expect(sitesResponse.status).toBe(200);
    expect(expressResult.payload).toMatchObject({
      items: [{ id: "new", content: "new body" }],
      itemCount: 1,
      sourceItemCount: 3,
      returnedItemCount: 1,
      truncated: true,
    });
    expect(expressResult.payload).toEqual(sitesPayload);
  });

  it("rejects the same invalid limit without fetching upstream", async () => {
    const query = { url: "https://feeds.example.com/main.xml", limit: "1.5" };
    const expressResult = await callExpress(query);
    const sitesResponse = await handleSitesRssRequest(new Request(`https://reader.example/api/rss/parse?${new URLSearchParams(query)}`), {
      fetchImpl: vi.fn(),
    });

    expect(expressResult).toMatchObject({ status: 400, payload: { code: "rss_invalid_limit", retryable: false } });
    expect(sitesResponse.status).toBe(400);
    await expect(sitesResponse.json()).resolves.toMatchObject({ code: "rss_invalid_limit", retryable: false });
    expect(proxy.fetchSafeExternal).not.toHaveBeenCalled();
  });
});
