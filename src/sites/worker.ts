import { handleSitesRssRequest } from "./rssWorker";
import { handleSitesMediaRequest } from "./mediaWorker";
import { handleSitesBidclubRequest } from "./bidclubWorker";
import { handleSitesAiRequest } from "./aiWorker";
import { handleSitesTranscriptionRequest } from "./transcriptionWorker";

interface SitesEnv {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

export default {
  fetch(request: Request, env: SitesEnv): Promise<Response> | Response {
    const url = new URL(request.url);
    if (url.pathname === "/api/rss/parse") return handleSitesRssRequest(request);
    if (url.pathname === "/api/media/image") return handleSitesMediaRequest(request, "image");
    if (url.pathname === "/api/media/audio") return handleSitesMediaRequest(request, "audio");
    if (url.pathname === "/api/bidclub/episode") return handleSitesBidclubRequest(request);
    if (url.pathname.startsWith("/api/ai/")) return handleSitesAiRequest(request);
    if (url.pathname.startsWith("/api/transcription/")) return handleSitesTranscriptionRequest(request);
    if (
      url.pathname !== "/api"
      && !url.pathname.startsWith("/api/")
      && (request.method === "GET" || request.method === "HEAD")
      && request.headers.get("Accept")?.toLowerCase().includes("text/html")
    ) {
      return env.ASSETS.fetch(new Request(new URL("/index.html", url), { method: request.method }));
    }
    return Response.json({ code: "sites_route_not_found", error: "Not found" }, { status: 404 });
  },
};
