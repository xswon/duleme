# AI configuration

duleme treats AI as an optional enhancement. Reading RSS feeds does not require an AI account.

## Article summaries

Open **设置 → AI 设置 → 内容整理** and configure:

- **Base URL** — the root of an OpenAI-compatible API, normally ending in `/v1`.
- **API Key** — your provider key. It may be empty for loopback services such as local Ollama.
- **Model** — the model identifier accepted by that endpoint.

The application sends article summary requests to:

```text
POST {Base URL}/chat/completions
```

Provider presets only fill common values. The stored configuration remains provider-neutral, so compatible gateways such as OneAPI/NewAPI and local vLLM can be entered with **自定义**.

## Local models

Example Ollama configuration:

```text
Base URL: http://127.0.0.1:11434/v1
API Key:  (empty)
Model:    your installed model name
```

## Environment defaults

Desktop/container deployments may provide:

```env
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=
```

A saved user configuration takes precedence. When no local configuration is enabled, duleme can use the environment default.

## Security and backups

The Base URL and model are normal application settings. The API Key is stored in a separate IndexedDB `secrets` object store.

The API Key is deliberately excluded from the JSON business-data backup and is not returned in AI status/error responses.

## Transcription

Podcast transcription is separate from article-summary AI configuration. Configure it under **设置 → AI 设置 → 逐字稿**.

The current cloud transcription configuration and article-summary endpoint do not share credentials. Existing cloud, local NextEcho, or provider transcripts remain readable even when the service that originally generated them is no longer configured.
