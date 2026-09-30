# AI configuration

duleme treats AI as an optional enhancement. Reading RSS feeds does not require an AI account.

## Article summaries

Open **设置 → AI 设置 → AI 摘要** and configure:

- **服务商** — choose a common provider or a custom OpenAI-compatible endpoint.
- **API Key** — your provider key. It may be empty for loopback services such as local Ollama.
- **AI 摘要模型** — duleme tries to load the provider's model catalog and shows a short list of text models suitable for article and podcast summarization.

For common providers, the Base URL is filled automatically and kept under **高级设置**. If a provider does not expose a compatible `/models` endpoint, model discovery is non-blocking: open **高级设置** and enter the Base URL or model identifier manually.

The browser never calls the provider directly. Requests stay behind the same `ReaderBackend` application boundary:

```text
Local Web: browser -> Express /api/ai/* -> provider
ChatGPT Sites: browser -> same-origin Site Worker /api/ai/* -> provider
```

Both runtimes use the OpenAI-compatible provider surface:

```text
GET  {Base URL}/models
POST {Base URL}/chat/completions
```

In ChatGPT Sites, the configured API Key remains browser-owned in the IndexedDB secrets store and is sent only with the explicit same-origin AI request that needs it. The Site Worker does not persist it, return it in responses, or cache AI responses. Redirects carrying credentials are restricted to the configured provider origin.

Provider presets only fill common values. The stored configuration remains provider-neutral, so compatible gateways such as OneAPI/NewAPI and local vLLM can be entered with **自定义**.

## Local models

Local Web can use loopback OpenAI-compatible services such as Ollama:

```text
Base URL: http://127.0.0.1:11434/v1
API Key:  (empty)
Model:    your installed model name
```

ChatGPT Sites cannot access services running on the user's machine. In Sites, AI endpoints must be public HTTPS endpoints and require an API Key. A loopback configuration is therefore reported as unavailable in the Sites runtime even if the same saved setting works in local Web.

## Environment defaults

Desktop/container deployments may provide:

```env
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=
```

A saved user configuration takes precedence in local Web. When no browser configuration is enabled, the local Express runtime can use the environment default.

ChatGPT Sites does not use these repository/server environment defaults in the current migration phase; its AI path is BYOK-only. This prevents a Site deployment from silently exposing a site-owner credential to shared usage.

## Security and backups

The Base URL and model are normal application settings. The API Key is stored in a separate IndexedDB `secrets` object store.

The API Key is deliberately excluded from the JSON business-data backup and is not returned in AI status/error responses.

## Transcription

Podcast transcription is separate from article-summary AI configuration. Configure it under **设置 → AI 设置 → 逐字稿**.

The current cloud transcription configuration and article-summary endpoint do not share credentials. Existing cloud, local NextEcho, or provider transcripts remain readable even when the service that originally generated them is no longer configured.
