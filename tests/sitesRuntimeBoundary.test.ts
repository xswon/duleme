import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/sites/worker";
import {
  backendRequest,
  resetReaderBackend,
  setReaderBackend,
} from "../src/services/readerBackend";
import { sitesReaderBackend } from "../src/sites/sitesReaderBackend";

describe("Sites runtime capability isolation", () => {
  afterEach(() => {
    resetReaderBackend();
    vi.restoreAllMocks();
  });

  it("blocks local-only application APIs before they reach the Site worker", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    setReaderBackend(sitesReaderBackend);

    const response = await backendRequest("/api/local-podcast/preflight");
    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toMatchObject({
      code: "sites_capability_unavailable",
      capability: "localPodcast",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not expose a local-podcast route from the Site worker itself", async () => {
    const response = await worker.fetch(new Request("https://reader.example/api/local-podcast/preflight"), { ASSETS: { fetch: vi.fn() } });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "sites_route_not_found" });
  });

  it("keeps unknown application routes closed instead of proxying them", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await worker.fetch(new Request("https://reader.example/api/proxy?url=https://example.com/"), { ASSETS: { fetch: vi.fn() } });
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves AI status without contacting an external provider", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await worker.fetch(new Request("https://reader.example/api/ai/status"), { ASSETS: { fetch: vi.fn() } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ configured: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Sites SPA routing", () => {
  it.each(["/today", "/saved"])("serves the SPA shell for a direct navigation to %s", async (pathname) => {
    const assetFetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe("/index.html");
      return new Response("<!doctype html><html></html>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    });
    const response = await worker.fetch(new Request(`https://reader.example${pathname}`, {
      headers: { Accept: "text/html" },
    }), { ASSETS: { fetch: assetFetch } });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(await response.text()).toContain("<!doctype html>");
    expect(assetFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps unknown API routes out of the SPA fallback", async () => {
    const assetFetch = vi.fn();
    const response = await worker.fetch(new Request("https://reader.example/api/missing", {
      headers: { Accept: "text/html" },
    }), { ASSETS: { fetch: assetFetch } });

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({ code: "sites_route_not_found" });
    expect(assetFetch).not.toHaveBeenCalled();
  });
});
