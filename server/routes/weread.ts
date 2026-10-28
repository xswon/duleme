import { Router } from "express";
import { parseRssQueryOptions, RssQueryError } from "../services/rssParser";
import {
  diagnoseWeReadSubscriptions, fetchWeReadFeed, listWeReadSubscriptions, WeReadBridgeError, WEREAD_ACCOUNT_PATTERN,
} from "../services/wereadBridge";

export function createWeReadRouter() {
  const router = Router();

  router.get("/diagnostics", async (_req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      return res.json(await diagnoseWeReadSubscriptions());
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get("/subscriptions", async (_req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      return res.json({ accounts: await listWeReadSubscriptions() });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get("/feed", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : "";
    if (!WEREAD_ACCOUNT_PATTERN.test(accountId)) {
      return res.status(400).json({ code: "weread_invalid_account", error: "无效的公众号 ID。" });
    }
    let options;
    try {
      options = parseRssQueryOptions({ since: req.query.since, limit: req.query.limit });
    } catch (error) {
      if (error instanceof RssQueryError) {
        return res.status(400).json({ code: error.code, error: error.message });
      }
      return sendError(res, error);
    }
    try {
      return res.json(await fetchWeReadFeed(accountId, options));
    } catch (error) {
      return sendError(res, error);
    }
  });
  return router;
}

function sendError(res: import("express").Response, error: unknown) {
  if (error instanceof WeReadBridgeError) {
    return res.status(error.status).json({ code: error.code, error: error.message, retryable: error.status >= 500 });
  }
  // Do not reflect raw upstream errors containing credentials, file paths or article contents.
  return res.status(502).json({ code: "weread_upstream_error", error: "微信读书读取失败，请稍后重试。", retryable: true });
}
