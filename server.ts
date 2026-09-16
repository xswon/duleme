import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { createRssRouter } from "./server/routes/rss";
import { createProxyRouter } from "./server/routes/proxy";
import { createBidclubRouter } from "./server/routes/bidclub";
import { createAiRouter } from "./server/routes/ai";
import { createLocalPodcastRouter } from "./server/routes/localPodcast";
import { createTranscriptionRouter } from "./server/routes/transcription";
import { requireLocalAccess, resolveListenHost } from "./server/middleware/localAccess";

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api", requireLocalAccess);
  app.use("/api/rss", createRssRouter());
  app.use("/api/proxy", createProxyRouter());
  app.use("/api", (req, _res, next) => {
    if (req.url.startsWith("/proxy-image")) req.url = "/image" + req.url.slice("/proxy-image".length);
    if (req.url.startsWith("/proxy-audio")) req.url = "/audio" + req.url.slice("/proxy-audio".length);
    next();
  }, createProxyRouter());
  app.use("/api/bidclub", createBidclubRouter());
  app.use("/api/ai", createAiRouter());
  app.use("/api/local-podcast", createLocalPodcastRouter());
  app.use("/api/transcription", createTranscriptionRouter());
  return app;
}

async function startServer() {
  const app = createApp();
  const port = Number(process.env.PORT) || 4387;
  const hmrPort = Number(process.env.HMR_PORT) || 4388;
  const distPath = path.join(process.cwd(), "dist");
  if (process.env.NODE_ENV === "production" && fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  } else {
    const vite = await createViteServer({ server: { middlewareMode: true, hmr: { port: hmrPort } }, appType: "spa" });
    app.use(vite.middlewares);
  }
  const host = resolveListenHost();
  app.listen(port, host, () => console.log(`Inoreader server running on http://${host}:${port}`));
}

startServer();
