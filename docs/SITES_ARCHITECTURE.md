# ChatGPT Sites migration architecture

## Decision

Duleme is now a Web-first product targeting ChatGPT Sites. Native desktop packaging is out of scope.

The React product UI remains the source of truth. Environment-specific capabilities must stay behind a narrow frontend boundary so the Sites migration does not fork product logic.

## Current runtime

Today the application consists of:

```text
React / TypeScript UI
        |
   ReaderBackend
        |
 browser HTTP adapter
        |
 Node / Express /api
        |
 RSS, proxy, AI, transcription, local-podcast integrations
```

IndexedDB remains the primary local store for subscriptions, articles, notes, reading state, audio progress, and user-owned configuration.

## Sites target

ChatGPT Sites is the deployment target, but the existing Express server must not be assumed to run unchanged inside Sites. The migration should replace runtime capabilities behind `ReaderBackend` only after each capability is confirmed to be supported by the Sites runtime.

```text
React product features
        |
   ReaderBackend
      /       \
 current HTTP  Sites adapter
    adapter       |
       \      supported Sites runtime capabilities
        \       /
      shared product behavior
```

## Rules

1. Product components and feature services must not call application `/api` endpoints with `fetch` directly.
2. Add new runtime-dependent behavior behind `ReaderBackend`.
3. Keep user secrets out of source control. Local `.env*` files stay ignored; only empty/example values belong in `.env.example`.
4. Do not delete the Node/Express implementation until the equivalent Sites path is working for RSS refresh, article fetch/proxy, AI summary, and transcription.
5. Do not add Electron, Tauri, DMG, NSIS, notarization, or desktop-release workflows back to this repository.

## Migration order

1. Centralize all existing frontend application-API calls behind `ReaderBackend`.
2. Keep current web behavior as the default adapter and retain regression tests.
3. Build a Sites prototype from the React UI.
4. Verify RSS/network behavior in the Sites runtime.
5. Move or replace proxy, AI, and transcription capabilities one at a time.
6. Validate IndexedDB persistence and import/export in the deployed Site.
7. Remove the legacy Express runtime only when all required production paths have Sites equivalents.

## Publication gate

Before making this repository public:

- scan the current tree and Git history for credentials and private URLs;
- verify no committed `.env` or credential material exists;
- rotate any credential that ever appeared in Git history, even if later deleted;
- review fixtures, logs, screenshots, and sample data for private user content.

Repository visibility and Site audience are separate decisions.
