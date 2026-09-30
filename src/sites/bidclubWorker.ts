import { mapBidclubEpisodePayload } from "../services/bidclubEpisodeMapper";
import {
  fetchWithValidatedRedirects,
  SitesOutboundError,
  type SitesFetchLike,
} from "./outboundNetwork";

const BIDCLUB_TIMEOUT_MS = 15_000;
const BIDCLUB_MAX_BYTES = 5 * 1024 * 1024;
const BIDCLUB_MAX_REDIRECTS = 3;
const BIDCLUB_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";
const BIDCLUB_HOSTS = new Set(["bidclub.ai", "www.bidclub.ai"]);
const BIDCLUB_SLUG = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,199}$/;

export interface SitesBidclubRuntimeOptions {
  fetchImpl?: SitesFetchLike;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

class SitesBidclubError extends SitesOutboundError {
  constructor(message: string, status: number, code: string) {
    super(message, status, code);
  }
}

function jsonError(error: SitesBidclubError, headers?: HeadersInit): Response {
  return Response.json({ code: error.code, error: error.message }, {
    status: error.status,
    headers: {
      "Cache-Control": "no-store",
      ...(headers || {}),
    },
  });
}

function parseEpisodeSlug(rawReference: string): string {
  const value = rawReference.trim();
  if (!value) throw new SitesBidclubError("Missing BidClub episode url or slug parameter", 400, "bidclub_missing_episode");

  let slug = value;
  if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new SitesBidclubError("Invalid BidClub episode URL", 400, "bidclub_invalid_episode");
    }
    if (!BIDCLUB_HOSTS.has(url.hostname.toLowerCase())) {
      throw new SitesBidclubError("BidClub episode URL must use bidclub.ai", 400, "bidclub_invalid_episode");
    }
    const match = /^\/e\/([^/]+)\/?$/.exec(url.pathname);
    if (!match) throw new SitesBidclubError("Invalid BidClub episode URL", 400, "bidclub_invalid_episode");
    try {
      slug = decodeURIComponent(match[1]);
    } catch {
      throw new SitesBidclubError("Invalid BidClub episode slug", 400, "bidclub_invalid_episode");
    }
  }

  slug = slug.replace(/^\/+|\/+$/g, "");
  if (!BIDCLUB_SLUG.test(slug)) {
    throw new SitesBidclubError("Invalid BidClub episode slug", 400, "bidclub_invalid_episode");
  }
  return slug;
}

function bidclubApiUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SitesBidclubError("BidClub returned an invalid redirect", 502, "bidclub_invalid_redirect");
  }
  if (
    url.protocol !== "https:"
    || !BIDCLUB_HOSTS.has(url.hostname.toLowerCase())
    || url.username
    || url.password
    || !url.pathname.startsWith("/api/v1/episodes/")
  ) {
    throw new SitesBidclubError("BidClub redirected outside its episode API", 502, "bidclub_invalid_redirect");
  }
  return url;
}

async function readTextLimited(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new SitesBidclubError("BidClub episode response is too large", 502, "bidclub_response_too_large");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let result = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel("BidClub episode response is too large");
        throw new SitesBidclubError("BidClub episode response is too large", 502, "bidclub_response_too_large");
      }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function handleSitesBidclubRequest(
  request: Request,
  options: SitesBidclubRuntimeOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return Response.json({ code: "bidclub_method_not_allowed", error: "BidClub episode access only supports GET" }, {
      status: 405,
      headers: { Allow: "GET", "Cache-Control": "no-store" },
    });
  }

  const requestUrl = new URL(request.url);
  const rawReference = requestUrl.searchParams.get("url") || requestUrl.searchParams.get("slug") || "";

  let slug: string;
  try {
    slug = parseEpisodeSlug(rawReference);
  } catch (error) {
    if (error instanceof SitesBidclubError) return jsonError(error);
    throw error;
  }

  const fetchImpl = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? BIDCLUB_TIMEOUT_MS);

  try {
    const initialUrl = new URL(`https://bidclub.ai/api/v1/episodes/${encodeURIComponent(slug)}`);
    const { response } = await fetchWithValidatedRedirects(initialUrl, {
      fetchImpl,
      signal: controller.signal,
      maxRedirects: options.maxRedirects ?? BIDCLUB_MAX_REDIRECTS,
      requestInit: {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; DulemeSites/1.0)",
        },
      },
      validateUrl: bidclubApiUrl,
      tooManyRedirectsCode: "bidclub_too_many_redirects",
      invalidRedirectCode: "bidclub_invalid_redirect",
      label: "BidClub episode",
    });

    if (!response.ok) {
      const upstreamStatus = response.status >= 400 && response.status < 600 ? response.status : 502;
      const retryAfter = response.headers.get("Retry-After");
      await response.body?.cancel();
      return jsonError(
        new SitesBidclubError(
          `BidClub upstream returned HTTP ${response.status}`,
          upstreamStatus,
          response.status === 404 ? "bidclub_episode_not_found" : "bidclub_upstream_http_error",
        ),
        retryAfter ? { "Retry-After": retryAfter } : undefined,
      );
    }

    const contentType = response.headers.get("Content-Type")?.toLowerCase() || "";
    if (contentType && !contentType.includes("json")) {
      await response.body?.cancel();
      return jsonError(new SitesBidclubError(
        `BidClub returned an unexpected Content-Type: ${contentType}`,
        502,
        "bidclub_invalid_payload",
      ));
    }

    const rawBody = await readTextLimited(response, options.maxBytes ?? BIDCLUB_MAX_BYTES);
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonError(new SitesBidclubError("BidClub returned invalid JSON", 502, "bidclub_invalid_payload"));
    }

    try {
      const episode = mapBidclubEpisodePayload(payload);
      return Response.json(episode, {
        headers: {
          "Cache-Control": BIDCLUB_CACHE_CONTROL,
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid episode payload";
      return jsonError(new SitesBidclubError(
        `BidClub returned an invalid episode payload: ${message}`,
        502,
        "bidclub_invalid_payload",
      ));
    }
  } catch (error) {
    if (error instanceof SitesOutboundError) {
      return jsonError(new SitesBidclubError(error.message, error.status, error.code));
    }
    if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      return jsonError(new SitesBidclubError("BidClub request timed out", 504, "bidclub_timeout"));
    }
    const message = error instanceof Error ? error.message : "Unknown network error";
    return jsonError(new SitesBidclubError(`Failed to fetch BidClub episode: ${message}`, 502, "bidclub_network_error"));
  } finally {
    clearTimeout(timeout);
  }
}
