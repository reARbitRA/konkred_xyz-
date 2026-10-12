# fullKONK_> runbook

## Health checks

```bash
curl -s https://konkred.xyz/api/health                       # in-repo Express app
curl -s https://konkred.xyz/api/fullkonk/providers | head -c 300
curl -s {KONKRED_GATEWAY_URL}/api/health                     # gateway itself
```

`GET /api/fullkonk/providers` returning `503` + `GATEWAY_NOT_CONFIGURED` means the
Vercel environment is missing `KONKRED_GATEWAY_URL`. A `502` means the gateway or
its URL is wrong. The response never contains credentials.

## Smoke test a build (streaming)

```bash
curl -sN -X POST https://konkred.xyz/api/fullkonk/generate \
  -H 'content-type: application/json' \
  -d '{"prompt":"write a hello world express server","mode":"review"}'
```

Bytes must arrive incrementally (`data: {"type":"stage"…}`, then `delta`, `done`).
If output arrives in one block, check that the platform is not buffering —
the route sets `text/event-stream`, `cache-control: no-cache, no-transform` and
`x-accel-buffering: no`.

## Common incidents

| Symptom | Likely cause | Action |
| --- | --- | --- |
| UI shows "Gateway is not configured" | `KONKRED_GATEWAY_URL` unset in the active Vercel scope | Set it (Production scope) and redeploy |
| 401/403 from the gateway | `FULLKONK_KEY` mismatch, or `FULLKONK_REQUIRE_AUTH=true` without Firebase Admin creds | Compare with the gateway's `FULLKONK_KEY`; check Firebase env |
| 429 with `Retry-After` | gateway tier budget exhausted | Wait for the window; check `GET {gateway}/api/status` |
| Builds stop after ~N minutes | function timeout lower than `FULLKONK_STREAM_TIMEOUT_MS` | Lower the env var or move to a plan with a longer limit |
| Export fails | GitHub token scope, or `FULLKONK_GITHUB_EXPORT_TOKEN` not set | The gateway needs `repo` scope on the token |
| Preview deploys rejected with 403 | preview origin not in `FULLKONK_ALLOWED_ORIGINS` | Add the preview host, or test from production |

## Secret rotation

1. Set the new `FULLKONK_KEY` on the gateway, then in Vercel (both must match).
2. `KONKRED_GATEWAY_API_KEY` rotates independently — update the gateway's
   `USERS_JSON` first, then Vercel.
3. `FULLKONK_GITHUB_EXPORT_TOKEN`: rotate in GitHub, update Vercel, redeploy.

## Rollback

Redeploy the previous Vercel deployment, or unset `KONKRED_GATEWAY_URL` (fails
closed with 503). `FULLKONK_LEGACY_ENGINE_FALLBACK=true` restores the in-repo
engine provided its provider keys are present. Details:
[GATEWAY_INTEGRATION.md](./GATEWAY_INTEGRATION.md#11-rollback).
