# ChatGPT Sites-first architecture

## Phase 4 decision

Duleme keeps the existing React UI, browser-owned IndexedDB/localStorage data, and product data model. The local Web runtime remains fully supported and continues to use the existing Express `/api` implementation.

The Sites build now contains the same React SPA plus a Cloudflare Worker-compatible API entrypoint:

```text
React product UI
      |
IndexedDB / localStorage
      |
ReaderBackend
   /                    \
WebReaderBackend         SitesReaderBackend
Express /api             same-origin Site Worker
                              |
                    restricted RSS/media/BidClub fetch
                              |
                  shared parsers and episode mapper
```

`npm run build:site` emits the Site Worker and SPA assets under `dist/`. The Worker implements RSS parsing, purpose-specific media routes, and the narrow `GET /api/bidclub/episode` adapter. AI, transcription, and local-podcast APIs continue to return `501 sites_capability_unavailable` from `SitesReaderBackend`.

## Capability matrix

| Capability | Sites status | Sites implementation | Legacy Express fallback |
| --- | --- | --- | --- |
| React reader UI and navigation | Native | Same React SPA | No |
| IndexedDB/localStorage state | Native, device-local | Existing browser stores | No |
| Add and refresh RSS 2.0/Atom/RDF feeds | Native for public feeds | Same-origin `/api/rss/parse` Worker route | Keep for runtime-specific edge cases |
| Feed metadata and article parsing | Native | Existing `parseFeedXml` and `RssParseResponse` shape | Keep for runtime-specific edge cases |
| WelcomeScreen podcast/feed artwork metadata | Native for public feeds | Existing ReaderBackend call reaches the RSS Worker | Keep for runtime-specific edge cases |
| OPML import/export | Native | Existing browser file APIs | No |
| Direct browser media | Native when the publisher permits it | Remote image/audio URL is always tried first in Sites | No, but failures use the Sites adapter |
| Sites image adapter | Native fallback | `/api/media/image`, public HTTP(S) only, redirect/type/size checks, streamed response, one-day browser cache | Keep for publisher/runtime edge cases |
| Sites audio adapter | Native fallback | `/api/media/audio`, public HTTP(S) only, streamed GET/HEAD and single `bytes=` Range forwarding | Keep for publisher/runtime edge cases |
| Legacy Express media proxy | Local Web only | Existing `/api/proxy-image` and `/api/proxy-audio`; local URL resolution is unchanged | Yes |
| Unsupported media cases | Unsupported | Private/LAN/localhost, authenticated or cookie-gated media, non-HTTP(S), multipart Range, origins that ignore Range | Yes where legacy policy permits |
| BidClub enrichment | Native for public BidClub episodes | `/api/bidclub/episode` accepts only a BidClub slug/page URL, fetches the fixed public episode API, and maps through the shared `BidclubEpisode` model | Keep for runtime-specific edge cases |
| AI endpoints | Native for browser BYOK + public HTTPS providers | Same-origin `/api/ai/*` Worker adapter for status/models/test/summarize; no Site-owned default credential | Keep for local loopback and environment-default use |
| Cloud transcription | Native for Alibaba Cloud BYOK | Same-origin `/api/transcription/*` Worker adapter for test/submit/poll/result download | Keep for local Web and future provider variants |
| Local podcast processing | Unavailable | Explicit 501 | Yes |

## Sites-native RSS behavior

The browser does not fetch third-party feeds directly. It calls the Site's same-origin Worker, so feed-server browser CORS headers are not required. The Worker:

- accepts only `GET /api/rss/parse?url=...` and returns parsed JSON, not arbitrary upstream bytes;
- accepts public `http` and `https` feed URLs without credentials;
- blocks local/private/reserved IP literals and common local or metadata hostnames;
- follows at most five redirects manually and validates every redirect target;
- applies a 20 second end-to-end timeout and a 5 MiB response limit;
- tolerates incorrect or generic response content types, then validates XML and the RSS/Atom/RDF document shape;
- uses the existing parser and existing product response fields, including feed metadata, article items, enclosures, images, and durations.

The restricted parse-only endpoint is intentionally not a general-purpose proxy. In the Worker runtime there is no Node DNS lookup/Undici agent, so the Site path cannot reproduce Express's DNS pre-resolution and address pinning. Hostname and literal validation is still applied before every request and redirect; Cloudflare's outbound runtime remains the final network boundary.

## Supported and limited RSS scenarios

Sites-native support:

- public RSS 2.0, Atom, and RDF feeds reachable from the Sites/Cloudflare egress network;
- redirects to another public HTTP(S) feed;
- servers with missing, generic, or inaccurate XML content types;
- structured errors for upstream HTTP failures, invalid XML/feed documents, oversized responses, redirect failures, network failures, and timeouts.

Keep the local Express path for compatibility and operational fallback when a publisher blocks Cloudflare egress, requires source-IP allowlisting, or serves a feed larger than the Site limit. Browser CORS is not a reason to use the fallback because the Site Worker performs the remote request. Feeds requiring cookies, custom authentication headers, client certificates, private/LAN access, or non-HTTP protocols are currently unsupported by the Sites RSS route.

## Sites media behavior

Media remains behind `ReaderBackend`: product components ask for a primary URL and, after a load failure, a fallback URL. In Sites the primary URL is the publisher URL, so ordinary `<img>` and `<audio>` loading avoids a server hop. In local Web the existing Express URL selection is unchanged. The fallback in Sites is same-origin and purpose-specific:

- `GET`/`HEAD /api/media/image?url=...` accepts only public HTTP(S), validates every redirect, requires `image/*`, rejects declared images above 15 MiB, bounds unknown-length streams, and emits `public, max-age=86400` caching.
- `GET`/`HEAD /api/media/audio?url=...` accepts only public HTTP(S), requires an audio/binary media MIME type, and streams the upstream body without buffering the complete episode.
- A single valid `Range: bytes=start-end`, `bytes=start-`, or `bytes=-suffix` header is forwarded for audio. A Range request succeeds only when the origin returns `206` with `Content-Range`; `Content-Type`, `Content-Range`, `Accept-Ranges`, and valid `Content-Length` metadata are copied. Upstream `416` is preserved.
- Audio responses use `private, no-store`, so the Site route does not rely on full-object Worker caching that could strip or synthesize Range behavior. Pause/resume and seeking continue through the existing single `<audio>` element.
- The connection timeout covers URL resolution, redirects, and receipt of upstream headers. It is cleared before body streaming so a long podcast is not aborted merely because playback lasts longer than the connection timeout.

The media routes are not general-purpose proxies: methods, request headers, response types, redirects, and target schemes are constrained. Localhost, common metadata names, private/reserved IP literals, URL credentials, and unsafe redirect targets are rejected. The Worker runtime does not expose the Node DNS pre-resolution/address-pinning path used by Express, so a public hostname that later resolves to a private address cannot be independently pinned by application code; Cloudflare's outbound network enforcement is still required. Keep the legacy Express proxy for publishers that block Cloudflare egress, require a source-specific cookie/header, omit usable MIME metadata, ignore Range, or otherwise need the mature Node transport.

## Sites BidClub behavior

The product keeps the existing `GET /api/bidclub/episode?url=...` contract through `ReaderBackend`. In Sites, the same request is handled by a narrow Worker adapter:

- accepts only a canonical BidClub episode slug or a `bidclub.ai/e/<slug>` page URL;
- contacts only `https://bidclub.ai/api/v1/episodes/<slug>`;
- permits redirects only when they remain HTTPS on BidClub's episode API;
- applies a 15 second timeout, a three-redirect limit, and a 5 MiB response limit;
- preserves useful upstream statuses such as 404 and 429 and forwards `Retry-After`;
- rejects invalid JSON and incomplete episode payloads;
- maps the upstream response through the same `mapBidclubEpisodePayload` code used by the local Express adapter;
- exposes only the existing `BidclubEpisode` product model rather than arbitrary upstream JSON;
- leaves cover images and episode audio inside the existing Sites media boundary.

No BidClub API key, cookie, custom outbound header, or user-supplied upstream origin is accepted by this adapter. If the public BidClub read API is unavailable from the Sites runtime, the existing local Express path remains the operational fallback.

## Sites AI behavior

Sites keeps the existing browser-owned AI settings model and the existing `/api/ai/*` contract. The Worker implements:

- `GET /api/ai/status`: reports no Site-owned environment default in this phase;
- `POST /api/ai/models`: loads the configured OpenAI-compatible model catalog;
- `POST /api/ai/test`: performs the existing minimal chat-completion connectivity check;
- `POST /api/ai/summarize`: supports both JSON and NDJSON progress responses and reuses the shared article/podcast summary orchestration.

Security and runtime constraints:

- only public HTTPS Base URLs are accepted in Sites;
- localhost, loopback, private/reserved IP literals, URL credentials, query-bearing Base URLs, and plaintext HTTP are rejected;
- non-local endpoints require a browser-provided API Key;
- provider redirects are followed only when they stay on the configured HTTPS origin, preventing bearer credentials from crossing origins;
- request and provider-response bodies are bounded;
- AI responses use `Cache-Control: no-store`;
- provider error details are classified into stable product error codes without echoing the API Key;
- the Worker does not persist credentials and does not use repository/server environment credentials.

Local Web retains its broader runtime support, including loopback Ollama-compatible endpoints and optional `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` environment defaults.

## Sites transcription behavior

Sites preserves the existing browser-owned Alibaba Cloud transcription settings and the existing `/api/transcription/*` contract:

- `POST /api/transcription/settings/test` validates the browser-provided API Key;
- `POST /api/transcription/tasks` submits the existing `qwen-audio-3.0-asr-flash-filetrans` asynchronous file-transcription request;
- `POST /api/transcription/tasks/:id/poll` polls task state and, after success, downloads the provider's signed transcript JSON and maps sentences into the existing `TranscriptSegment` model.

The current product continues to use `https://dashscope.aliyuncs.com/api/v1`, matching the local Express implementation. Alibaba Cloud currently keeps this endpoint functional while recommending workspace-specific domains for newer deployments; region/workspace endpoint selection is intentionally a separate product change rather than part of the Sites migration.

Security and runtime constraints:

- the API Key remains browser-owned and is sent only to the same-origin Site Worker for an explicit transcription request;
- the Worker sends bearer credentials only to the fixed DashScope API origin and does not forward them to the signed transcript-result URL;
- audio input must be a public HTTP(S) URL without URL credentials and cannot target localhost/private/reserved literals or common local metadata hostnames;
- task IDs are syntactically constrained before they are inserted into provider paths;
- provider API responses, request bodies, and downloaded transcript JSON are size-bounded;
- provider API redirects must remain on the fixed DashScope API origin;
- transcript-result redirects are allowed only through the existing public HTTP(S) outbound policy and carry no provider Authorization header;
- all app-facing transcription responses use `Cache-Control: no-store`;
- provider errors are mapped to stable product codes without returning the API Key or raw provider error body.

As with RSS/media in the Worker runtime, hostname validation cannot reproduce Node's DNS address pinning. The fixed provider origin plus Cloudflare's outbound network boundary limits the sensitive authenticated path; public audio/result URL handling remains deliberately constrained.

## Architecture rules

1. Product components and services must not call application `/api` endpoints with `fetch` directly; use `ReaderBackend`.
2. Runtime-specific media URL handling belongs in `ReaderBackend`.
3. Do not delete `server.ts`, `server/`, or Express routes until equivalent production paths exist and are verified in Sites.
4. Do not move API keys or server secrets into the Site client. Browser-owned settings remain device-local in IndexedDB.
5. A capability is enabled in `SitesReaderBackend` only after a real Site runtime implementation exists.
6. Outbound Site routes must be purpose-specific, bounded by method, response size, redirects, and timeout, and must validate every upstream target.

## Recommended migration order

1. Deploy and smoke-test the completed RSS/media/BidClub stack in the private ChatGPT Site when deployment quota is available.
2. Verify a real BidClub episode end-to-end: TL;DR, digest chapters, transcript, source attribution, cover image, and episode audio.
3. Deploy and smoke-test remote BYOK AI: model discovery, connection test, article summary, and one long transcript summary.
4. Deploy and smoke-test cloud transcription: key test, one task submission, processing poll, completed transcript, and speaker labels.
5. Reassess local podcast processing separately; its machine-local dependency may remain outside Sites or require a redesigned remote service.
