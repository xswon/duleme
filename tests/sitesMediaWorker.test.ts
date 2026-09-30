import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSitesMediaRequest } from "../src/sites/mediaWorker";

function mediaRequest(kind: "image" | "audio", target: string, init?: RequestInit) {
  return new Request(`https://reader.example/api/media/${kind}?url=${encodeURIComponent(target)}`, init);
}

describe("Sites media worker", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("follows image redirects, validates the type, and applies cache headers", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/cover")
      ? new Response(null, { status: 302, headers: { Location: "/cover.png" } })
      : new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { "Content-Type": "image/png", "Content-Length": "4", ETag: '"cover"' },
      }));

    const response = await handleSitesMediaRequest(
      mediaRequest("image", "https://cdn.example.com/cover"),
      "image",
      { fetchImpl },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toContain("max-age=86400");
    expect(response.headers.get("ETag")).toBe('"cover"');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1][0])).toBe("https://cdn.example.com/cover.png");
  });

  it("rejects invalid image content and private redirect targets", async () => {
    const invalidType = await handleSitesMediaRequest(
      mediaRequest("image", "https://cdn.example.com/not-image"),
      "image",
      { fetchImpl: async () => new Response("<html>no</html>", { headers: { "Content-Type": "text/html" } }) },
    );
    expect(invalidType.status).toBe(415);
    await expect(invalidType.json()).resolves.toMatchObject({ code: "media_invalid_content_type" });

    const privateRedirect = await handleSitesMediaRequest(
      mediaRequest("image", "https://cdn.example.com/cover"),
      "image",
      { fetchImpl: async () => new Response(null, { status: 302, headers: { Location: "http://127.0.0.1/secret" } }) },
    );
    expect(privateRedirect.status).toBe(400);
    await expect(privateRedirect.json()).resolves.toMatchObject({ code: "media_unsafe_url" });
  });

  it("supports audio HEAD metadata without reading a body", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": "987654",
        "Accept-Ranges": "bytes",
      },
    }));
    const response = await handleSitesMediaRequest(
      mediaRequest("audio", "https://podcast.example.com/episode.mp3", { method: "HEAD" }),
      "audio",
      { fetchImpl },
    );

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(response.headers.get("Content-Length")).toBe("987654");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://podcast.example.com/episode.mp3"),
      expect.objectContaining({ method: "HEAD", redirect: "manual" }),
    );
  });

  it("streams full audio GET responses without buffering them first", async () => {
    let pullCount = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        controller.enqueue(new Uint8Array([pullCount]));
        if (pullCount === 2) controller.close();
      },
    });
    const response = await handleSitesMediaRequest(
      mediaRequest("audio", "https://podcast.example.com/episode.mp3"),
      "audio",
      { fetchImpl: async () => new Response(body, { headers: { "Content-Type": "audio/mpeg" } }) },
    );

    expect(response.status).toBe(200);
    expect(response.body).not.toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2]));
  });

  it("forwards a single byte range and preserves a valid 206 response", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Range")).toBe("bytes=500-999");
      return new Response(new Uint8Array(500), {
        status: 206,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": "500",
          "Content-Range": "bytes 500-999/5000",
          "Accept-Ranges": "bytes",
        },
      });
    });
    const response = await handleSitesMediaRequest(
      mediaRequest("audio", "https://podcast.example.com/episode.mp3", { headers: { Range: "bytes=500-999" } }),
      "audio",
      { fetchImpl },
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 500-999/5000");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Content-Length")).toBe("500");
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect((await response.arrayBuffer()).byteLength).toBe(500);
  });

  it("rejects malformed ranges and origins that do not honor ranges", async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1]), {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    }));
    const malformed = await handleSitesMediaRequest(
      mediaRequest("audio", "https://podcast.example.com/episode.mp3", { headers: { Range: "bytes=0-1,3-4" } }),
      "audio",
      { fetchImpl },
    );
    expect(malformed.status).toBe(416);
    expect(fetchImpl).not.toHaveBeenCalled();

    const ignored = await handleSitesMediaRequest(
      mediaRequest("audio", "https://podcast.example.com/episode.mp3", { headers: { Range: "bytes=0-0" } }),
      "audio",
      { fetchImpl },
    );
    expect(ignored.status).toBe(502);
    await expect(ignored.json()).resolves.toMatchObject({ code: "media_range_not_honored" });
  });

  it("rejects 206 responses without Content-Range", async () => {
    const response = await handleSitesMediaRequest(
      mediaRequest("audio", "https://podcast.example.com/episode.mp3", { headers: { Range: "bytes=0-99" } }),
      "audio",
      {
        fetchImpl: async () => new Response(new Uint8Array(100), {
          status: 206,
          headers: { "Content-Type": "audio/mpeg", "Content-Length": "100" },
        }),
      },
    );
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: "media_invalid_content_range" });
  });

  it("reports network failures and connection timeouts", async () => {
    const failed = await handleSitesMediaRequest(
      mediaRequest("audio", "https://podcast.example.com/episode.mp3"),
      "audio",
      { fetchImpl: async () => { throw new TypeError("connection failed"); } },
    );
    expect(failed.status).toBe(502);
    await expect(failed.json()).resolves.toMatchObject({ code: "media_network_error" });

    vi.useFakeTimers();
    const pending = handleSitesMediaRequest(
      mediaRequest("audio", "https://podcast.example.com/episode.mp3"),
      "audio",
      {
        timeoutMs: 25,
        fetchImpl: (_input, init) => new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        }),
      },
    );
    await vi.advanceTimersByTimeAsync(25);
    const timedOut = await pending;
    expect(timedOut.status).toBe(504);
    await expect(timedOut.json()).resolves.toMatchObject({ code: "media_timeout" });
  });
});
