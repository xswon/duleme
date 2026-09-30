/**
 * Runtime boundary for browser-to-backend communication.
 *
 * Product code uses this adapter instead of calling application `/api`
 * endpoints directly. The default adapter preserves the existing Express
 * behavior; the Sites build installs a static-runtime adapter instead.
 */
export type ReaderAssetKind = "image" | "audio";
export type ReaderAssetResolution = "primary" | "fallback";

export type ReaderBackendCapability =
  | "rss"
  | "bidclub"
  | "ai"
  | "transcription"
  | "localPodcast"
  | "imageProxy"
  | "audioProxy";

export type ReaderBackendCapabilities = Record<ReaderBackendCapability, boolean>;

export interface ReaderBackend {
  request(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  resolveAssetUrl?(kind: ReaderAssetKind, source: string, resolution?: ReaderAssetResolution): string;
  capabilities?: ReaderBackendCapabilities;
}

const WEB_CAPABILITIES: ReaderBackendCapabilities = {
  rss: true,
  bidclub: true,
  ai: true,
  transcription: true,
  localPodcast: true,
  imageProxy: true,
  audioProxy: true,
};

function resolveWebAssetUrl(kind: ReaderAssetKind, source: string): string {
  if (kind === "image") {
    if (source.startsWith("/api/proxy-image") || !source.startsWith("http")) return source;
    return `/api/proxy-image?url=${encodeURIComponent(source)}`;
  }

  if (source.startsWith("/api/proxy-audio")) return source;
  if (
    source.startsWith("http://")
    || source.includes("xyzcdn.net")
    || source.includes("xiaoyuzhoufm.com")
    || source.includes("ximalaya.com")
  ) {
    return `/api/proxy-audio?url=${encodeURIComponent(source)}`;
  }
  return source;
}

const webReaderBackend: ReaderBackend = {
  request: (input, init) => globalThis.fetch(input, init),
  resolveAssetUrl: resolveWebAssetUrl,
  capabilities: WEB_CAPABILITIES,
};

let activeReaderBackend: ReaderBackend = webReaderBackend;

export function setReaderBackend(backend: ReaderBackend): void {
  activeReaderBackend = backend;
}

export function resetReaderBackend(): void {
  activeReaderBackend = webReaderBackend;
}

export function backendRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return activeReaderBackend.request(input, init);
}

export function resolveBackendAssetUrl(
  kind: ReaderAssetKind,
  source?: string,
  resolution: ReaderAssetResolution = "primary",
): string | undefined {
  if (!source) return undefined;
  return activeReaderBackend.resolveAssetUrl?.(kind, source, resolution) ?? resolveWebAssetUrl(kind, source);
}

export function hasReaderBackendCapability(capability: ReaderBackendCapability): boolean {
  return activeReaderBackend.capabilities?.[capability] ?? true;
}
