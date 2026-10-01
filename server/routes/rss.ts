import { Router } from "express";
import { fetchSafeExternal, isSafeExternalUrl, MAX_PROXY_BYTES, readResponseBodyLimited } from "../services/proxyService";
import { parseFeedXml } from "../services/rssParser";

const RSS_FETCH_TIMEOUT_MS = 15_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError" || /timed?\s*out/i.test(error.message));
}

export function createRssRouter() {
  const router = Router();
  router.get("/parse", async (req, res) => {
    const url = String(req.query.url || "");
    if (!url) return res.status(400).json({ code: "rss_missing_url", error: "Missing feed URL parameter", retryable: false });
    if (!isSafeExternalUrl(url)) return res.status(400).json({ code: "rss_unsafe_url", error: "Feed URL must be a public http/https URL", retryable: false });
    let response: Response;
    try {
      response = await fetchSafeExternal(url, {
        headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
        signal: AbortSignal.timeout(RSS_FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      const timeout = isTimeoutError(error);
      return res.status(timeout ? 504 : 502).json({
        code: timeout ? "rss_timeout" : "rss_network_error",
        error: timeout ? "RSS request timed out" : `Failed to fetch RSS feed: ${errorMessage(error)}`,
        retryable: true,
      });
    }
    if (!response.ok) {
      const retryAfter = response.headers.get("Retry-After");
      await response.body?.cancel();
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      if (retryAfter) res.setHeader("Retry-After", retryAfter);
      return res.status(502).json({
        code: "rss_upstream_http_error",
        error: `RSS upstream returned HTTP ${response.status}${response.statusText ? `: ${response.statusText}` : ""}`,
        retryable,
        upstreamStatus: response.status,
      });
    }
    let xml: string;
    try {
      xml = (await readResponseBodyLimited(response, MAX_PROXY_BYTES)).toString("utf8");
    } catch (error) {
      const tooLarge = /too large/i.test(errorMessage(error));
      return res.status(tooLarge ? 413 : 502).json({
        code: tooLarge ? "rss_feed_too_large" : "rss_network_error",
        error: tooLarge ? "RSS feed is too large" : `Failed to read RSS feed: ${errorMessage(error)}`,
        retryable: !tooLarge,
      });
    }
    let feed;
    try {
      feed = parseFeedXml(xml, url, { strict: true });
    } catch (error) {
      return res.status(422).json({ code: "rss_invalid_feed", error: `Failed to parse RSS feed: ${errorMessage(error)}`, retryable: false });
    }
    let favicon = "";
    try { favicon = `https://www.google.com/s2/favicons?domain=${new URL(feed.link).hostname}&sz=64`; } catch { /* empty */ }
    return res.json({ ...feed, feedUrl: url, favicon, feedImage: feed.feedImage || favicon, itemCount: feed.items.length });
  });
  return router;
}
