import { fetchSafeExternal, MAX_PROXY_BYTES, readResponseBodyLimited } from "./proxyService";
import {
  digestWithChapters,
  formatTranscript,
  mapBidclubEpisodePayload,
} from "../../src/services/bidclubEpisodeMapper";

export { digestWithChapters, formatTranscript };

export async function fetchBidclubEpisode(slug: string) {
  const response = await fetchSafeExternal(
    "https://bidclub.ai/api/v1/episodes/" + encodeURIComponent(slug),
    { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } },
  );
  if (!response.ok) {
    const error = new Error("HTTP " + response.status) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  const payload = JSON.parse((await readResponseBodyLimited(response, MAX_PROXY_BYTES)).toString("utf8")) as unknown;
  return mapBidclubEpisodePayload(payload);
}
