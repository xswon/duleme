import { handleSitesRssRequest } from "./rssWorker";
import { handleSitesMediaRequest } from "./mediaWorker";
import { handleSitesBidclubRequest } from "./bidclubWorker";

export default {
  fetch(request: Request): Promise<Response> | Response {
    const url = new URL(request.url);
    if (url.pathname === "/api/rss/parse") return handleSitesRssRequest(request);
    if (url.pathname === "/api/media/image") return handleSitesMediaRequest(request, "image");
    if (url.pathname === "/api/media/audio") return handleSitesMediaRequest(request, "audio");
    if (url.pathname === "/api/bidclub/episode") return handleSitesBidclubRequest(request);
    return Response.json({ code: "sites_route_not_found", error: "Not found" }, { status: 404 });
  },
};
