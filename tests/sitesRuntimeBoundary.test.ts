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
    const response = await worker.fetch(new Request("https://reader.example/api/local-podcast/preflight"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "sites_route_not_found" });
  });

  it("keeps unknown application routes closed instead of proxying them", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await worker.fetch(new Request("https://reader.example/api/proxy?url=https://example.com/"));
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves AI status without contacting an external provider", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await worker.fetch(new Request("https://reader.example/api/ai/status"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ configured: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
