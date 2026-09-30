import { parseFeedXml } from "../../server/services/rssParser";
import {
  fetchWithValidatedRedirects,
  publicHttpUrl,
  SitesOutboundError,
  type SitesFetchLike,
} from "./outboundNetwork";

const RSS_FETCH_TIMEOUT_MS = 20_000;
const RSS_MAX_BYTES = 5 * 1024 * 1024;
const RSS_MAX_REDIRECTS = 5;
const RSS_ACCEPT = "application/rss+xml, application/atom+xml, application/xml, text/xml, text/plain;q=0.8, */*;q=0.1";

export interface SitesRssRuntimeOptions {
  fetchImpl?: SitesFetchLike;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

class SitesRssError extends SitesOutboundError {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message, status, code);
  }
}

function publicFeedUrl(rawUrl: string): URL {
  try {
    return publicHttpUrl(rawUrl, "Feed", "rss_invalid_url", "rss_unsafe_url");
  } catch (error) {
    if (error instanceof SitesOutboundError) {
      throw new SitesRssError(error.message, error.status, error.code);
    }
    throw error;
  }
}

async function readTextLimited(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new SitesRssError("RSS feed is too large", 413, "rss_feed_too_large");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel("RSS feed is too large");
        throw new SitesRssError("RSS feed is too large", 413, "rss_feed_too_large");
      }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function responsePayload(feedUrl: string, xml: string) {
  let feed;
  try {
    feed = parseFeedXml(xml, feedUrl, { strict: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parse error";
    throw new SitesRssError(`Failed to parse RSS feed: ${message}`, 422, "rss_invalid_feed");
  }
  let favicon = "";
  try {
    favicon = `https://www.google.com/s2/favicons?domain=${new URL(feed.link).hostname}&sz=64`;
  } catch {
    // Keep favicon empty when the feed does not expose a valid site URL.
  }
  return {
    ...feed,
    feedUrl,
    favicon,
    feedImage: feed.feedImage || favicon,
    itemCount: feed.items.length,
  };
}

function jsonError(error: SitesRssError): Response {
  return Response.json({ code: error.code, error: error.message }, {
    status: error.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function handleSitesRssRequest(
  request: Request,
  options: SitesRssRuntimeOptions = {},
): Promise<Response> {
  const requestUrl = new URL(request.url);
  if (request.method !== "GET") {
    return Response.json({ code: "rss_method_not_allowed", error: "RSS parsing only supports GET" }, {
      status: 405,
      headers: { Allow: "GET", "Cache-Control": "no-store" },
    });
  }
  const rawFeedUrl = requestUrl.searchParams.get("url")?.trim();
  if (!rawFeedUrl) return jsonError(new SitesRssError("Missing feed URL parameter", 400, "rss_missing_url"));

  const fetchImpl = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? RSS_FETCH_TIMEOUT_MS);
  try {
    const feedUrl = publicFeedUrl(rawFeedUrl);
    const { response } = await fetchWithValidatedRedirects(
      feedUrl,
      {
        fetchImpl,
        signal: controller.signal,
        maxRedirects: options.maxRedirects ?? RSS_MAX_REDIRECTS,
        requestInit: { method: "GET", headers: { Accept: RSS_ACCEPT } },
        validateUrl: publicFeedUrl,
        tooManyRedirectsCode: "rss_too_many_redirects",
        invalidRedirectCode: "rss_invalid_redirect",
        label: "RSS feed",
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new SitesRssError(
        `RSS upstream returned HTTP ${response.status}${response.statusText ? `: ${response.statusText}` : ""}`,
        502,
        "rss_upstream_http_error",
      );
    }
    const xml = await readTextLimited(response, options.maxBytes ?? RSS_MAX_BYTES);
    return Response.json(responsePayload(feedUrl.toString(), xml), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof SitesOutboundError) {
      return jsonError(new SitesRssError(error.message, error.status, error.code));
    }
    if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      return jsonError(new SitesRssError("RSS request timed out", 504, "rss_timeout"));
    }
    const message = error instanceof Error ? error.message : "Unknown network error";
    return jsonError(new SitesRssError(`Failed to fetch RSS feed: ${message}`, 502, "rss_network_error"));
  } finally {
    clearTimeout(timeout);
  }
}
