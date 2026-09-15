import { afterEach, describe, expect, it, vi } from "vitest";
const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({
  default: { lookup: lookupMock },
  lookup: lookupMock,
}));
import { requireLocalAccess, resolveListenHost } from "../server/middleware/localAccess";
import {
  assertSafeExternalUrl,
  fetchSafeExternal,
  isPublicIpAddress,
  isSafeExternalUrl,
  readResponseBodyLimited,
} from "../server/services/proxyService";

afterEach(() => {
  vi.unstubAllGlobals();
  lookupMock.mockReset();
});

describe("server local-only boundary", () => {
  it("binds native runs to loopback and Docker to its loopback-published bridge", () => {
    expect(resolveListenHost({} as NodeJS.ProcessEnv)).toBe("127.0.0.1");
    expect(resolveListenHost({ DOCKER: "true" } as NodeJS.ProcessEnv)).toBe("0.0.0.0");
  });

  it("rejects non-loopback callers and cross-site browser requests", () => {
    const next = vi.fn();
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const request = (remoteAddress: string, headers: Record<string, string> = {}) => ({
      socket: { remoteAddress },
      get: (name: string) => headers[name.toLowerCase()],
    });

    requireLocalAccess(request("192.168.1.20") as never, response as never, next);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();

    requireLocalAccess(request("127.0.0.1", { "sec-fetch-site": "cross-site" }) as never, response as never, next);
    expect(response.status).toHaveBeenCalledWith(403);

    requireLocalAccess(request("::1", { origin: "http://127.0.0.1:4387" }) as never, response as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("outbound proxy safety", () => {
  it("allows only public http/https URL targets", () => {
    expect(isSafeExternalUrl("https://example.com/feed.xml")).toBe(true);
    expect(isSafeExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeExternalUrl("http://user:pass@example.com/")).toBe(false);
    expect(isSafeExternalUrl("http://localhost/admin")).toBe(false);
    expect(isSafeExternalUrl("http://127.0.0.1/admin")).toBe(false);
    expect(isSafeExternalUrl("http://2130706433/admin")).toBe(false);
    expect(isSafeExternalUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isSafeExternalUrl("http://[::ffff:7f00:1]/admin")).toBe(false);
  });

  it("classifies private, link-local and documentation IP ranges as non-public", () => {
    for (const address of [
      "10.0.0.1", "100.64.0.1", "172.31.255.255", "192.168.1.1",
      "198.18.0.1", "198.19.255.255", "198.51.100.2", "203.0.113.2", "::1", "fd00::1", "fe80::1",
      "::ffff:127.0.0.1", "::ffff:7f00:1", "::7f00:1", "::c0a8:101",
    ]) expect(isPublicIpAddress(address), address).toBe(false);
    expect(isPublicIpAddress("8.8.8.8")).toBe(true);
    expect(isPublicIpAddress("2606:4700:4700::1111")).toBe(true);
  });

  it("allows proxy synthetic DNS answers for public hostnames only", async () => {
    lookupMock.mockResolvedValue([{ address: "198.18.0.116", family: 4 }]);
    await expect(assertSafeExternalUrl("https://example.com/feed.xml")).resolves.toBeUndefined();
    expect(isSafeExternalUrl("http://198.18.0.116/feed.xml")).toBe(false);
  });

  it("rejects a public-looking hostname when DNS includes a private address", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(assertSafeExternalUrl("https://example.com/feed.xml"))
      .rejects.toThrow("non-public address");
  });

  it("revalidates every redirect target before following it", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSafeExternal("https://example.com/feed.xml"))
      .rejects.toThrow("unsafe external URL");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops chunked responses before buffering beyond the byte limit", async () => {
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
        controller.close();
      },
    }));
    await expect(readResponseBodyLimited(response, 5)).rejects.toThrow("too large");
  });
});
