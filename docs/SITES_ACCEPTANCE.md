# ChatGPT Sites release acceptance

Use this checklist after a candidate stack has passed GitHub CI and before promoting a private Site version.

## Build and source

- [ ] The candidate commit matches the intended stacked PR head.
- [ ] `npm run verify` passes.
- [ ] `npm run build:site` passes.
- [ ] `npm run check:site-artifact` passes.
- [ ] Site remains private before functional testing.

## Core reader

- [ ] Existing IndexedDB/localStorage data opens without migration errors.
- [ ] Refreshing a deep link restores the SPA route.
- [ ] Existing articles, read/starred state, playlist, and notes remain intact.
- [ ] OPML import/export and backup/restore still work.

## RSS

- [ ] Add one RSS 2.0 feed.
- [ ] Add or refresh one Atom feed.
- [ ] Refresh an existing feed and confirm new articles are persisted.
- [ ] A broken or malformed feed reports an error without breaking other feeds.

## Media

- [ ] A directly accessible article image renders.
- [ ] An image that requires the Sites fallback renders.
- [ ] A podcast starts, pauses, and resumes.
- [ ] Seeking to the middle of a podcast continues playback.
- [ ] The fallback audio request shows `206 Partial Content` with a valid `Content-Range` when the origin supports Range.

## BidClub

- [ ] Open one enriched episode.
- [ ] TL;DR, digest chapters, transcript, source attribution, and cover render.
- [ ] Episode audio still uses the normal media path.
- [ ] A missing/unavailable enrichment does not block the article body.

## AI (browser BYOK)

- [ ] Model discovery works with a public HTTPS OpenAI-compatible endpoint.
- [ ] Connection test succeeds.
- [ ] Article summary succeeds.
- [ ] Progress/NDJSON summary completes.
- [ ] A long transcript summary completes.
- [ ] Invalid credentials return a stable error and do not echo the API key.
- [ ] localhost/Ollama is not offered as a working Sites path.

## Cloud transcription

- [ ] Alibaba Cloud key test succeeds.
- [ ] A public podcast URL can be submitted.
- [ ] Polling transitions through processing.
- [ ] Completed transcript sentences and speaker labels render.
- [ ] Provider/result errors do not expose the API key.

## Local-only boundary

- [ ] Sites does not call `/api/local-podcast/*`.
- [ ] Previously persisted NextEcho references do not create repeated errors.
- [ ] Hosted retranscription uses cloud transcription.
- [ ] Local Web still retains NextEcho behavior.

## Release

- [ ] Site URL/slug is unchanged.
- [ ] Access remains private.
- [ ] No new Site was accidentally created.
- [ ] Browser console has no repeated runtime errors.
- [ ] Network panel shows no requests to localhost/private network targets.
- [ ] Record the deployed commit SHA and Site version in the release/PR notes.
