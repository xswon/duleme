import {
  fetchWithValidatedRedirects,
  publicHttpUrl,
  SitesOutboundError,
  type SitesFetchLike,
} from "./outboundNetwork";

const MEDIA_CONNECT_TIMEOUT_MS = 15_000;
const MEDIA_MAX_REDIRECTS = 5;
const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";
const AUDIO_CACHE_CONTROL = "private, no-store";

export type SitesMediaKind = "image" | "audio";

export interface SitesMediaRuntimeOptions {
  fetchImpl?: SitesFetchLike;
  timeoutMs?: number;
  maxRedirects?: number;
  maxImageBytes?: number;
}

function mediaError(message: string, status: number, code: string): Response {
  return Response.json({ code, error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function publicMediaUrl(rawUrl: string): URL {
  return publicHttpUrl(rawUrl, "Media", "media_invalid_url", "media_unsafe_url");
}

function refererFor(url: URL): string | undefined {
  const hostname = url.hostname.toLowerCase();
  if (hostname.endsWith("xyzcdn.net") || hostname.endsWith("xiaoyuzhoufm.com") || hostname.includes("xyzfm")) {
    return "https://www.xiaoyuzhoufm.com/";
  }
  if (hostname.endsWith("ximalaya.com")) return "https://www.ximalaya.com/";
  if (hostname.endsWith("latepost.com")) return "https://www.latepost.com/";
  if (hostname.endsWith("sspai.com")) return "https://sspai.com/";
  if (hostname.endsWith("36kr.com")) return "https://36kr.com/";
  if (hostname.endsWith("qpic.cn") || hostname.includes("weixin")) return "https://mp.weixin.qq.com/";
  return undefined;
}

function isValidSingleRange(value: string): boolean {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return false;
  if (!match[1]) return Number(match[2]) > 0;
  if (!match[2]) return true;
  return Number(match[1]) <= Number(match[2]);
}

function isValidContentRange(value: string | null): boolean {
  if (!value) return false;
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(value.trim());
  if (!match) return false;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) return false;
  if (match[3] === "*") return true;
  const total = Number(match[3]);
  return Number.isSafeInteger(total) && total > end;
}

function numericHeader(headers: Headers, name: string): string | null {
  const value = headers.get(name);
  return value && /^\d+$/.test(value) ? value : null;
}

function safeResponseHeaders(upstream: Response, kind: SitesMediaKind): Headers {
  const headers = new Headers({
    "Cache-Control": kind === "image" ? IMAGE_CACHE_CONTROL : AUDIO_CACHE_CONTROL,
    "X-Content-Type-Options": "nosniff",
  });
  for (const name of ["Content-Type", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  const length = numericHeader(upstream.headers, "Content-Length");
  if (length) headers.set("Content-Length", length);
  if (kind === "audio" && upstream.status === 206 && !headers.has("Accept-Ranges")) {
    headers.set("Accept-Ranges", "bytes");
  }
  return headers;
}

function isImageType(contentType: string | null): boolean {
  return Boolean(contentType?.toLowerCase().startsWith("image/"));
}

function isAudioType(contentType: string | null): boolean {
  const mime = contentType?.split(";", 1)[0].trim().toLowerCase();
  return Boolean(
    mime?.startsWith("audio/")
    || mime === "application/octet-stream"
    || mime === "binary/octet-stream"
    || mime === "application/ogg"
    || mime === "video/mp4",
  );
}

function sizeLimitedStream(body: ReadableStream<Uint8Array>, maxBytes: number): ReadableStream<Uint8Array> {
  let bytes = 0;
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        controller.error(new Error("Image response is too large"));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
}

export async function handleSitesMediaRequest(
  request: Request,
  kind: SitesMediaKind,
  options: SitesMediaRuntimeOptions = {},
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return mediaError("Media access only supports GET and HEAD", 405, "media_method_not_allowed");
  }

  const rawUrl = new URL(request.url).searchParams.get("url")?.trim();
  if (!rawUrl) return mediaError("Missing media URL parameter", 400, "media_missing_url");

  const range = request.headers.get("Range");
  if (kind === "image" && range) {
    return mediaError("Image adapter does not accept Range requests", 416, "media_range_not_supported");
  }
  if (kind === "audio" && range && !isValidSingleRange(range)) {
    return mediaError("Only one valid bytes range is supported", 416, "media_invalid_range");
  }

  const fetchImpl = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? MEDIA_CONNECT_TIMEOUT_MS);
  try {
    const mediaUrl = publicMediaUrl(rawUrl);
    const headers = new Headers({
      Accept: kind === "image" ? "image/*,*/*;q=0.1" : "audio/*,application/octet-stream;q=0.8,*/*;q=0.1",
      "User-Agent": "Mozilla/5.0 (compatible; DulemeSites/1.0)",
    });
    if (range) headers.set("Range", range);
    const referer = refererFor(mediaUrl);
    if (referer) headers.set("Referer", referer);

    const { response: upstream } = await fetchWithValidatedRedirects(mediaUrl, {
      fetchImpl,
      signal: controller.signal,
      maxRedirects: options.maxRedirects ?? MEDIA_MAX_REDIRECTS,
      requestInit: { method: request.method, headers },
      validateUrl: publicMediaUrl,
      tooManyRedirectsCode: "media_too_many_redirects",
      invalidRedirectCode: "media_invalid_redirect",
      label: "Media",
    });
    clearTimeout(timeout);

    if (upstream.status === 416 && kind === "audio") {
      const responseHeaders = safeResponseHeaders(upstream, kind);
      await upstream.body?.cancel();
      return new Response(null, { status: 416, headers: responseHeaders });
    }
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return mediaError(`Media upstream returned HTTP ${upstream.status}`, 502, "media_upstream_http_error");
    }

    const contentType = upstream.headers.get("Content-Type");
    if (kind === "image" ? !isImageType(contentType) : !isAudioType(contentType)) {
      await upstream.body?.cancel();
      return mediaError(`Unexpected media Content-Type: ${contentType || "missing"}`, 415, "media_invalid_content_type");
    }
    if (kind === "audio" && range && upstream.status !== 206) {
      await upstream.body?.cancel();
      return mediaError("Audio origin ignored the requested byte range", 502, "media_range_not_honored");
    }
    if (kind === "audio" && upstream.status === 206 && !isValidContentRange(upstream.headers.get("Content-Range"))) {
      await upstream.body?.cancel();
      return mediaError("Audio origin returned an invalid Content-Range", 502, "media_invalid_content_range");
    }

    const responseHeaders = safeResponseHeaders(upstream, kind);
    if (request.method === "HEAD") {
      await upstream.body?.cancel();
      return new Response(null, { status: upstream.status, headers: responseHeaders });
    }

    const maxImageBytes = options.maxImageBytes ?? IMAGE_MAX_BYTES;
    const declaredLength = Number(responseHeaders.get("Content-Length"));
    if (kind === "image" && Number.isFinite(declaredLength) && declaredLength > maxImageBytes) {
      await upstream.body?.cancel();
      return mediaError("Image response is too large", 413, "media_image_too_large");
    }
    const body = kind === "image" && upstream.body
      ? sizeLimitedStream(upstream.body, maxImageBytes)
      : upstream.body;
    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof SitesOutboundError) return mediaError(error.message, error.status, error.code);
    if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      return mediaError("Media connection timed out", 504, "media_timeout");
    }
    const message = error instanceof Error ? error.message : "Unknown network error";
    return mediaError(`Failed to fetch media: ${message}`, 502, "media_network_error");
  } finally {
    clearTimeout(timeout);
  }
}
