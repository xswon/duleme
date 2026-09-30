import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backendRequest,
  hasReaderBackendCapability,
  resetReaderBackend,
  resolveBackendAssetUrl,
  setReaderBackend,
  type ReaderBackend,
} from "../src/services/readerBackend";
import { sitesReaderBackend } from "../src/sites/sitesReaderBackend";
import { resolveImageCandidates } from "../src/services/mediaAssetService";

describe("ReaderBackend boundary", () => {
  afterEach(() => {
    resetReaderBackend();
    vi.restoreAllMocks();
  });

  it("delegates requests to the installed runtime adapter", async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const request = vi.fn(async () => response);
    const backend: ReaderBackend = { request };
    setReaderBackend(backend);

    const result = await backendRequest("/api/rss/parse?url=test", {
      method: "POST",
      body: "{}",
    });

    expect(result).toBe(response);
    expect(request).toHaveBeenCalledWith("/api/rss/parse?url=test", {
      method: "POST",
      body: "{}",
    });
  });

  it("uses browser fetch and Express proxy URLs by default", async () => {
    const response = new Response("ok", { status: 200 });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    await expect(backendRequest("/api/health")).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledWith("/api/health", undefined);
    expect(resolveBackendAssetUrl("image", "https://example.com/image.jpg"))
      .toBe("/api/proxy-image?url=https%3A%2F%2Fexample.com%2Fimage.jpg");
    expect(hasReaderBackendCapability("rss")).toBe(true);
  });

  it("returns an explicit stub response for unmigrated Sites APIs", async () => {
    setReaderBackend(sitesReaderBackend);

    const response = await backendRequest("/api/ai/summarize", { method: "POST" });
    const payload = await response.json();

    expect(response.status).toBe(501);
    expect(payload).toMatchObject({
      code: "sites_capability_unavailable",
      capability: "ai",
    });
    expect(hasReaderBackendCapability("ai")).toBe(false);
  });

  it("routes migrated RSS requests to the Sites same-origin worker", async () => {
    const response = new Response(JSON.stringify({ title: "Feed", items: [] }), { status: 200 });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    setReaderBackend(sitesReaderBackend);

    await expect(backendRequest("/api/rss/parse?url=https%3A%2F%2Fexample.com%2Ffeed.xml"))
      .resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rss/parse?url=https%3A%2F%2Fexample.com%2Ffeed.xml",
      undefined,
    );
    expect(hasReaderBackendCapability("rss")).toBe(true);
  });

  it("uses direct media first and exposes a same-origin Sites fallback", () => {
    setReaderBackend(sitesReaderBackend);

    expect(resolveBackendAssetUrl("image", "https://example.com/image.jpg"))
      .toBe("https://example.com/image.jpg");
    expect(resolveBackendAssetUrl("image", "https://example.com/image.jpg", "fallback"))
      .toBe("/api/media/image?url=https%3A%2F%2Fexample.com%2Fimage.jpg");
    expect(resolveBackendAssetUrl("audio", "/api/proxy-audio?url=https%3A%2F%2Fexample.com%2Fa.mp3"))
      .toBe("https://example.com/a.mp3");
    expect(resolveBackendAssetUrl("audio", "https://example.com/a.mp3", "fallback"))
      .toBe("/api/media/audio?url=https%3A%2F%2Fexample.com%2Fa.mp3");
    expect(resolveImageCandidates("https://example.com/image.jpg@small")).toEqual([
      "https://example.com/image.jpg@small",
      "https://example.com/image.jpg",
      "/api/media/image?url=https%3A%2F%2Fexample.com%2Fimage.jpg%40small",
      "/api/media/image?url=https%3A%2F%2Fexample.com%2Fimage.jpg",
    ]);
    expect(hasReaderBackendCapability("imageProxy")).toBe(true);
    expect(hasReaderBackendCapability("audioProxy")).toBe(true);
  });

  it("keeps the legacy Web media resolution behavior unchanged", () => {
    expect(resolveBackendAssetUrl("image", "https://example.com/image.jpg"))
      .toBe("/api/proxy-image?url=https%3A%2F%2Fexample.com%2Fimage.jpg");
    expect(resolveBackendAssetUrl("audio", "https://cdn.example.com/a.mp3"))
      .toBe("https://cdn.example.com/a.mp3");
    expect(resolveBackendAssetUrl("audio", "http://cdn.example.com/a.mp3"))
      .toBe("/api/proxy-audio?url=http%3A%2F%2Fcdn.example.com%2Fa.mp3");
  });

  it("passes non-application requests through in Sites", async () => {
    const response = new Response("ok", { status: 200 });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    setReaderBackend(sitesReaderBackend);

    await expect(backendRequest("https://example.com/data.json")).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/data.json", undefined);
  });
});
