import {
  setReaderBackend,
  type ReaderAssetKind,
  type ReaderBackend,
  type ReaderBackendCapability,
  type ReaderBackendCapabilities,
} from "../services/readerBackend";

const SITES_CAPABILITIES: ReaderBackendCapabilities = {
  rss: true,
  bidclub: true,
  ai: true,
  loopbackAi: false,
  transcription: true,
  localPodcast: false,
  imageProxy: true,
  audioProxy: true,
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function applicationApiPath(input: RequestInfo | URL): string | null {
  const value = requestUrl(input);
  try {
    const base = globalThis.location?.origin || "https://sites.invalid";
    const url = new URL(value, base);
    const isAbsoluteHttpUrl = /^https?:\/\//i.test(value);
    if (isAbsoluteHttpUrl && url.origin !== base) return null;
    return url.pathname.startsWith("/api/") ? url.pathname : null;
  } catch {
    return value.startsWith("/api/") ? value.split("?")[0] : null;
  }
}

function capabilityForPath(pathname: string): ReaderBackendCapability {
  if (pathname.startsWith("/api/rss/")) return "rss";
  if (pathname.startsWith("/api/bidclub/")) return "bidclub";
  if (pathname.startsWith("/api/ai/")) return "ai";
  if (pathname.startsWith("/api/transcription")) return "transcription";
  if (pathname.startsWith("/api/local-podcast/")) return "localPodcast";
  if (pathname.startsWith("/api/media/image")) return "imageProxy";
  if (pathname.startsWith("/api/media/audio")) return "audioProxy";
  if (pathname.startsWith("/api/proxy-image") || pathname.startsWith("/api/proxy/image")) return "imageProxy";
  if (pathname.startsWith("/api/proxy-audio") || pathname.startsWith("/api/proxy/audio")) return "audioProxy";
  return "rss";
}

function unwrapProxyUrl(source: string): string {
  if (!source.startsWith("/api/proxy-") && !source.startsWith("/api/proxy/") && !source.startsWith("/api/media/")) return source;
  try {
    return new URL(source, "https://sites.invalid").searchParams.get("url") || source;
  } catch {
    return source;
  }
}

function resolveSitesAssetUrl(kind: ReaderAssetKind, source: string, resolution: "primary" | "fallback" = "primary"): string {
  const remoteUrl = unwrapProxyUrl(source);
  if (resolution === "primary" || !/^https?:\/\//i.test(remoteUrl)) return remoteUrl;
  return `/api/media/${kind}?url=${encodeURIComponent(remoteUrl)}`;
}

export const sitesReaderBackend: ReaderBackend = {
  async request(input, init) {
    const pathname = applicationApiPath(input);
    if (!pathname) return globalThis.fetch(input, init);

    const capability = capabilityForPath(pathname);
    if (capability === "rss" || capability === "bidclub" || capability === "ai" || capability === "transcription" || capability === "imageProxy" || capability === "audioProxy") {
      return globalThis.fetch(input, init);
    }
    return new Response(JSON.stringify({
      code: "sites_capability_unavailable",
      capability,
      error: "此能力尚未迁移到 ChatGPT Sites，请暂时使用本地 Web 版本。",
    }), {
      status: 501,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  },
  resolveAssetUrl: resolveSitesAssetUrl,
  capabilities: SITES_CAPABILITIES,
};

export function installSitesReaderBackend(): void {
  setReaderBackend(sitesReaderBackend);
}
