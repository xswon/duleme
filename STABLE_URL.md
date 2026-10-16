# Stable Local URL

Use this URL:

```text
http://127.0.0.1:4387
```

The stable setup runs WReader through Docker Compose with `restart: unless-stopped`, so the app restarts automatically if the container exits or Docker Desktop restarts.

## Start Once

```bash
COMPOSE_PROJECT_NAME=inoreader-copy docker compose up -d
```

`./scripts/wreader-up.sh` does the same but also passes `--build`, which rebuilds the image before starting. Keep the `inoreader-copy` project name: the checkout directory is now called `duleme`, and a new project name would make Compose build a `duleme-wreader` image instead of reusing the existing one.

## Check Status

```bash
./scripts/wreader-status.sh
```

## Stop

```bash
docker compose down
```

## Outbound proxy

RSS parsing, article images, audio, transcription and AI requests all leave the container through one explicit proxy when one is configured:

- `OUTBOUND_PROXY_URL` — used when the Node server runs directly on the host (`npm run dev`).
- `OUTBOUND_PROXY_URL_DOCKER` — used inside the container. `127.0.0.1` there is the container itself, so a proxy running on the host must be reached through `host.docker.internal`.

`compose.yaml` maps the container value as `${OUTBOUND_PROXY_URL_DOCKER:-${OUTBOUND_PROXY_URL:-}}`. With a wrong address every feed sync fails with `fetch failed`. Check what the container actually received:

```bash
docker exec wreader-dev env | grep OUTBOUND_PROXY
```

## Notes

- Keep Docker Desktop running. After Docker Desktop starts, allow roughly 30 seconds: the entrypoint may run `npm ci` before the port is listening.
- If another app already uses port `4387`, stop that app or change `PORT` and the `ports` entries in `compose.yaml`.
- Docker Compose publishes the app on host address `127.0.0.1`, so this documented setup is reachable from this Mac only.
- Directly running the Node server binds to `127.0.0.1` by default. Docker listens on its internal bridge, while Compose continues to publish both host ports on `127.0.0.1` only.
