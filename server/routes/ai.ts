import { Router } from "express";
import { getInsightSettings, summarizeArticle } from "../services/aiService";
export function createAiRouter() {
  const router = Router();
  router.get("/settings", (_req, res) => res.json(getInsightSettings()));
  router.post("/summarize", async (req, res) => {
    const { title, content, snippet } = req.body || {};
    if (!title && !content) return res.status(400).json({ error: "Missing article title or content" });
    try { return res.json({ summary: await summarizeArticle(title, content, snippet) }); }
    catch (error: any) { return res.status(500).json({ error: `AI Generation failed: ${error.message || "Unknown error"}` }); }
  });
  return router;
}
