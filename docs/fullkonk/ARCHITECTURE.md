# fullKONK_> architecture

```
Browser (/fullkonk)  →  Vercel Node function (api/index.ts → server/gateway/router.ts)
                     →  Konkred Gateway (separate deployment)
                     →  Gemini · Groq · Cerebras · Mistral · OpenRouter · Cloudflare · GitHub Models
```

## Client
* `pages/FullKonkPage.tsx` — console shell: mode selection, provider/model pickers,
  BYOK field, pipeline status, chat, code output, live environment, analytics,
  workspace sidebar, GitHub export.
* `utils/sse.ts` — SSE parser (chunk-boundary safe, CRLF/LF, multi-event chunks,
  `[DONE]`, malformed frames skipped).
* `utils/streamState.ts` — pure reducer for stage/provider/failover/metrics/
  delta/file/reset/done/error.
* `utils/codeFiles.ts` — fenced-code → file-set extraction.

## Server (server-only; never imported by the browser)
* `server/gateway/router.ts` — owns `/api/fullkonk/{providers,generate,github/export}`,
  `/api/ai` and `/api/ai/generate`; everything else falls through to the Express app.
* `server/gateway/config.ts` — environment resolution, alias mapping, SSRF guard.
* `server/gateway/http.ts` — body limits, JSON/error envelopes, origin guard,
  redacted logging, rate limiter.
* `server/gateway/upstream.ts` — gateway transport (timeouts, abort propagation,
  `Retry-After`).
* `server/gateway/auth.ts` — optional Firebase ID-token verification.
* `server.ts` + `lib/fullkonk-server.cjs` — the unchanged legacy Express app
  (demo runner, GitHub OAuth, health, optimize-prompt, sessions, usage, analytics).

Deployment topology, environment variables, streaming semantics, error handling
and rollback are documented in [GATEWAY_INTEGRATION.md](./GATEWAY_INTEGRATION.md).
