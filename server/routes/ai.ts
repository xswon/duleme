import { Router, type Request } from "express";
import {
  getInsightSettings,
  INSIGHT_MODEL,
  INSIGHT_PROVIDER_ID,
  summarizeArticle,
  testInsightConnection,
} from "../services/aiService";

const INSIGHT_KEY_COOKIE = "wreader_insight_api_key";
const COOKIE_PATH = "/api/ai";

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  const pair = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!pair) return undefined;
  try { return decodeURIComponent(pair.slice(name.length + 1)); }
  catch { return undefined; }
}

function browserInsightKey(req: Request): string | undefined {
  return readCookie(req, INSIGHT_KEY_COOKIE)?.trim() || undefined;
}

function cookieBaseOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
  };
}

function validateSelection(provider?: unknown, model?: unknown): string | null {
  if (provider !== INSIGHT_PROVIDER_ID) return "Unsupported content-organizing provider.";
  if (model !== undefined && model !== INSIGHT_MODEL) return "Unsupported content-organizing model.";
  return null;
}

export function createAiRouter() {
  const router = Router();

  router.get("/settings", (req, res) => {
    return res.json(getInsightSettings(browserInsightKey(req)));
  });

  router.post("/settings", (req, res) => {
    const { provider, apiKey, model } = req.body || {};
    const selectionError = validateSelection(provider, model);
    if (selectionError) return res.status(400).json({ error: selectionError });
    const nextKey = typeof apiKey === "string" ? apiKey.trim() : "";
    if (!nextKey) return res.status(400).json({ error: "请先填写 API Key。" });
    res.cookie(INSIGHT_KEY_COOKIE, nextKey, {
      ...cookieBaseOptions(),
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });
    return res.json(getInsightSettings(nextKey));
  });

  router.delete("/settings", (_req, res) => {
    res.clearCookie(INSIGHT_KEY_COOKIE, cookieBaseOptions());
    return res.json(getInsightSettings());
  });

  router.post("/test", async (req, res) => {
    const { provider, apiKey, model } = req.body || {};
    const selectionError = validateSelection(provider, model);
    if (selectionError) return res.status(400).json({ error: selectionError });
    const candidate = typeof apiKey === "string" ? apiKey.trim() : "";
    try {
      await testInsightConnection(candidate || browserInsightKey(req), model);
      return res.json({ ok: true });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || "连接失败，请检查 API Key。" });
    }
  });

  router.post("/summarize", async (req, res) => {
    const { title, content, snippet } = req.body || {};
    if (!title && !content) return res.status(400).json({ error: "Missing article title or content" });
    try {
      return res.json({ summary: await summarizeArticle(title, content, snippet, browserInsightKey(req)) });
    } catch (error: any) {
      return res.status(500).json({ error: `AI Generation failed: ${error.message || "Unknown error"}` });
    }
  });

  return router;
}
