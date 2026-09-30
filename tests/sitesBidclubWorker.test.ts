import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSitesBidclubRequest } from "../src/sites/bidclubWorker";

function request(reference: string, init?: RequestInit) {
  return new Request(
    `https://reader.example/api/bidclub/episode?url=${encodeURIComponent(reference)}`,
    init,
  );
}

function episodePayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "Episode title",
    dek: "Deck",
    lang: "ZH",
    tldr_md: "**Summary**",
    digest_md: "### Chapter\nDigest",
    transcript_md: "主持人\n\nTranscript",
    source_url: "https://example.com/source",
    thumbnail_url: "https://cdn.example.com/cover.jpg",
    duration_min: 60,
    shows: { name: "Show", hosts: "Host" },
    chips: ["person:Host"],
    ...overrides,
  };
}

describe("Sites BidClub worker", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fetches only the fixed BidClub episode API and maps the result", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://bidclub.ai/api/v1/episodes/episode-a");
      expect(init?.redirect).toBe("manual");
      expect(new Headers(init?.headers).get("Accept")).toBe("application/json");
      return new Response(JSON.stringify(episodePayload()), {
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await handleSitesBidclubRequest(request("episode-a"), { fetchImpl });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("max-age=60");
    await expect(response.json()).resolves.toMatchObject({
      title: "Episode title",
      showName: "Show",
      durationMin: 60,
      chapters: [{ id: "chapter-1", title: "Chapter" }],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("accepts a canonical BidClub episode URL but rejects other origins", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(episodePayload()), {
      headers: { "Content-Type": "application/json" },
    }));
    const accepted = await handleSitesBidclubRequest(
      request("https://www.bidclub.ai/e/late-talk-178?utm_source=test"),
      { fetchImpl },
    );
    expect(accepted.status).toBe(200);
    expect(String(fetchImpl.mock.calls[0][0])).toBe("https://bidclub.ai/api/v1/episodes/late-talk-178");

    fetchImpl.mockClear();
    const rejected = await handleSitesBidclubRequest(request("https://evil.example/e/late-talk-178"), { fetchImpl });
    expect(rejected.status).toBe(400);
    await expect(rejected.json()).resolves.toMatchObject({ code: "bidclub_invalid_episode" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects unsupported methods and malformed slugs before network access", async () => {
    const fetchImpl = vi.fn();
    const method = await handleSitesBidclubRequest(request("episode-a", { method: "POST" }), { fetchImpl });
    expect(method.status).toBe(405);
    expect(method.headers.get("Allow")).toBe("GET");

    const malformed = await handleSitesBidclubRequest(request("../admin"), { fetchImpl });
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({ code: "bidclub_invalid_episode" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("preserves missing-episode and rate-limit status information", async () => {
    const missing = await handleSitesBidclubRequest(request("missing"), {
      fetchImpl: async () => new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    });
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ code: "bidclub_episode_not_found" });

    const limited = await handleSitesBidclubRequest(request("limited"), {
      fetchImpl: async () => new Response(JSON.stringify({ error: "slow down" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "30" },
      }),
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("30");
    await expect(limited.json()).resolves.toMatchObject({ code: "bidclub_upstream_http_error" });
  });

  it("rejects redirects outside the BidClub episode API", async () => {
    const response = await handleSitesBidclubRequest(request("episode-a"), {
      fetchImpl: async () => new Response(null, {
        status: 302,
        headers: { Location: "https://evil.example/api/v1/episodes/episode-a" },
      }),
    });
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: "bidclub_invalid_redirect" });
  });

  it("reports invalid JSON, malformed payloads, and oversized responses", async () => {
    const invalidJson = await handleSitesBidclubRequest(request("invalid-json"), {
      fetchImpl: async () => new Response("{", {
        headers: { "Content-Type": "application/json" },
      }),
    });
    expect(invalidJson.status).toBe(502);
    await expect(invalidJson.json()).resolves.toMatchObject({ code: "bidclub_invalid_payload" });

    const malformed = await handleSitesBidclubRequest(request("invalid-shape"), {
      fetchImpl: async () => new Response(JSON.stringify({ dek: "no title" }), {
        headers: { "Content-Type": "application/json" },
      }),
    });
    expect(malformed.status).toBe(502);
    await expect(malformed.json()).resolves.toMatchObject({ code: "bidclub_invalid_payload" });

    const oversized = await handleSitesBidclubRequest(request("too-large"), {
      maxBytes: 4,
      fetchImpl: async () => new Response("12345", {
        headers: { "Content-Type": "application/json", "Content-Length": "5" },
      }),
    });
    expect(oversized.status).toBe(502);
    await expect(oversized.json()).resolves.toMatchObject({ code: "bidclub_response_too_large" });
  });

  it("reports network failures and timeouts", async () => {
    const failed = await handleSitesBidclubRequest(request("network"), {
      fetchImpl: async () => { throw new TypeError("connection failed"); },
    });
    expect(failed.status).toBe(502);
    await expect(failed.json()).resolves.toMatchObject({ code: "bidclub_network_error" });

    vi.useFakeTimers();
    const pending = handleSitesBidclubRequest(request("timeout"), {
      timeoutMs: 25,
      fetchImpl: (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
    });
    await vi.advanceTimersByTimeAsync(25);
    const timedOut = await pending;
    expect(timedOut.status).toBe(504);
    await expect(timedOut.json()).resolves.toMatchObject({ code: "bidclub_timeout" });
  });
});
