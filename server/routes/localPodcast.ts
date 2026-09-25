import { Router, type Request, type Response, type NextFunction } from "express";
/* eslint-disable @typescript-eslint/no-explicit-any -- Legacy NextEcho payload adapter preserves the established provider contract. */
import { NextEchoError, nextEchoRequest, readNextEchoArtifact } from "../services/nextEchoService";
import { requireLocalAccess } from "../middleware/localAccess";

export { isLoopbackAddress } from "../middleware/localAccess";
export const requireLoopback = requireLocalAccess;

function mapSegments(payload: any) {
  const entries = Array.isArray(payload?.transcription) ? payload.transcription : [];
  return entries.map((entry: any) => ({
    startMs: Number(entry?.offsets?.from || 0),
    endMs: Number(entry?.offsets?.to || 0),
    timestamp: String(entry?.timestamps?.from || ""),
    text: String(entry?.text || "").trim(),
  })).filter((entry: any) => entry.text);
}

export function createLocalPodcastRouter() {
  const router = Router();
  router.use(requireLocalAccess);

  router.get("/settings", async (_req, res, next) => {
    try { res.json(await nextEchoRequest("/api/settings")); } catch (error) { next(error); }
  });
  router.post("/settings", async (req, res, next) => {
    try { res.json(await nextEchoRequest("/api/settings", { method: "POST", body: JSON.stringify(req.body || {}) })); } catch (error) { next(error); }
  });
  router.post("/settings/test", async (_req, res, next) => {
    try { res.json(await nextEchoRequest("/api/settings/test", { method: "POST", body: "{}" })); } catch (error) { next(error); }
  });
  router.get("/preflight", async (_req, res, next) => {
    try { res.json(await nextEchoRequest("/api/preflight")); } catch (error) { next(error); }
  });
  router.post("/sessions", async (req, res, next) => {
    try {
      const { audioUrl, title, showNotes } = req.body || {};
      if (!/^https?:\/\//i.test(String(audioUrl || ""))) return res.status(400).json({ error: "缺少有效的音频地址。" });
      res.status(202).json(await nextEchoRequest("/api/transcription-sessions", {
        method: "POST",
        body: JSON.stringify({ url: audioUrl, force_local_asr: true, page_context: { page_title: title || "", show_notes: showNotes || "" } }),
      }));
    } catch (error) { next(error); }
  });
  router.get("/sessions/:id", async (req, res, next) => {
    try {
      const payload = await nextEchoRequest(`/api/transcription-sessions/${encodeURIComponent(req.params.id)}`);
      const result = payload?.job?.result || {};
      let transcript: any[] | undefined;
      let digest: any | undefined;
      if (payload?.job?.status === "completed" && result.transcript_segments_url) {
        transcript = mapSegments(await readNextEchoArtifact(result.transcript_segments_url));
      }
      if (payload?.job?.insight_status === "completed" && result.digest_url) {
        digest = await readNextEchoArtifact(result.digest_url);
      }
      res.json({ ...payload, artifacts: { transcript, digest, transcriptSource: result.transcript_source } });
    } catch (error) { next(error); }
  });
  router.post("/sessions/:id/insight", async (req, res, next) => {
    try { res.status(202).json(await nextEchoRequest(`/api/transcription-sessions/${encodeURIComponent(req.params.id)}/insight`, { method: "POST", body: "{}" })); } catch (error) { next(error); }
  });

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const known = error instanceof NextEchoError ? error : new NextEchoError("本机播客服务发生错误。", 500);
    res.status(known.status).json({ error: known.message, code: known.code });
  });
  return router;
}
