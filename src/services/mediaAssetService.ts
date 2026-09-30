import { resolveBackendAssetUrl } from "./readerBackend";

function withoutImageSuffix(source: string): string | undefined {
  if (!source.includes("@")) return undefined;
  const clean = source.replace(/@[^/]+$/, "");
  return clean === source ? undefined : clean;
}

export function resolveImageCandidates(source?: string): string[] {
  if (!source) return [];
  const clean = withoutImageSuffix(source);
  const sources = clean ? [source, clean] : [source];
  const candidates = [
    ...sources.map((value) => resolveBackendAssetUrl("image", value, "primary")),
    ...sources.map((value) => resolveBackendAssetUrl("image", value, "fallback")),
    ...sources,
  ].filter((value): value is string => Boolean(value));
  return [...new Set(candidates)];
}

export function retryBackendImage(target: HTMLImageElement, source?: string): boolean {
  if (!source) return false;
  if (target.dataset.mediaSource !== source) {
    target.dataset.mediaSource = source;
    target.dataset.mediaCandidate = "0";
  }
  const candidates = resolveImageCandidates(source);
  const nextIndex = Number(target.dataset.mediaCandidate || "0") + 1;
  const nextSource = candidates[nextIndex];
  if (!nextSource) return false;
  target.dataset.mediaCandidate = String(nextIndex);
  target.src = nextSource;
  return true;
}

export function resolveAudioFallbackUrl(source?: string): string | undefined {
  return resolveBackendAssetUrl("audio", source, "fallback");
}
