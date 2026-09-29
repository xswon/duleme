# ChatGPT Sites deployment preparation

This branch prepares WReader/duleme for a public hosted deployment while keeping the current localhost + Docker workflow unchanged by default.

## What changes in public mode

Set:

```env
PUBLIC_DEPLOYMENT=true
```

With this switch:

- the Node server binds to `0.0.0.0` instead of loopback;
- normal `/api` routes accept same-origin browser requests instead of requiring a loopback socket;
- cross-site browser requests and headerless non-browser API calls are rejected;
- `/api/local-podcast` remains protected by its own loopback-only middleware, so NextEcho stays a local-only feature;
- environment-level AI defaults are ignored unless `ALLOW_SHARED_AI_DEFAULTS=true`.

The last point is intentional. A public Site should use visitor-provided AI credentials (the existing BYOK flow) unless the site owner explicitly decides to sponsor AI usage.

## Recommended first public version

Keep these features:

- React/Vite reader UI
- RSS parsing/fetching through the server
- browser-local feeds, articles, read state, notes, and playback state
- visitor-provided OpenAI-compatible AI configuration
- visitor-provided Aliyun transcription configuration

Do not expose NextEcho in the hosted runtime. The UI already probes `/api/local-podcast/preflight`; when the local service is unavailable it falls back to the configured cloud transcription path.

## Environment

Start from `.env.example`.

For a public deployment:

```env
PUBLIC_DEPLOYMENT=true
ALLOW_SHARED_AI_DEFAULTS=false
```

Do not set `AI_API_KEY` for a public deployment unless you intentionally want every visitor to consume the site's shared AI quota and you have added appropriate authentication, quotas, and abuse controls.

## Storage model

The current application remains local-first:

- subscriptions/categories are stored in browser localStorage;
- articles, notes, settings, secrets, and playback state use browser IndexedDB.

That means visitors to a shared Site get independent browser-local data. Cross-device synchronization can be added later with hosted storage and authentication.

## Security notes

The existing outbound network layer continues to reject private, loopback, link-local, and unsafe redirect targets before RSS/media/AI proxy requests are made.

The public-origin middleware is an application boundary, not user authentication. Before broad public distribution, add platform-level abuse controls for high-bandwidth endpoints (especially audio proxying) and any site-owner-funded APIs.

## Sites import

Open the local `sites-prep` checkout in the current ChatGPT desktop app and start the Sites workflow from Codex. The official existing-project prompt is:

```text
Deploy this project with Sites. Check whether it is compatible, make any required changes, and give me the deployment URL.
```

Ask Sites to **save a version first**, review the preview, and only then deploy it. Every deployment URL is a production deployment.

Sites stores the hosted-project linkage and optional D1/R2 binding names in `.openai/hosting.json`. Do not invent a `project_id` in advance; let Sites create/update this file when it provisions the hosted project.

Configure hosted environment values from the Site settings rather than committing secrets. For this first public version set:

```env
PUBLIC_DEPLOYMENT=true
ALLOW_SHARED_AI_DEFAULTS=false
```

HTTP/HTTPS/WebSockets are supported by the Sites runtime, but private networks and some background/hosting patterns are not. This branch therefore deliberately keeps NextEcho local-only and leaves any final Node/Express runtime adaptation to the actual Sites compatibility step.

The existing Docker files remain for local development and are not the intended production hosting mechanism.
