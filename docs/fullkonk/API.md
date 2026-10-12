# fullKONK_> API surface

## BFF routes (Vercel function, same origin, server-side credentials)

| Method | Path | Upstream | Notes |
| --- | --- | --- | --- |
| GET | `/api/fullkonk/providers` | `GET {KONKRED_GATEWAY_URL}/api/fullkonk/providers` | `x-brain-key` injected server-side; success is cacheable for 30s |
| POST | `/api/fullkonk/generate` | `POST {…}/api/fullkonk/generate` | SSE `data: {json}\n\n`; stage/provider/failover/metrics/delta/file/reset/done/error |
| POST | `/api/fullkonk/github/export` | `POST {…}/api/fullkonk/github/export` | `{success, filesUploaded, prUrl, errors}`; token stays server-side |
| POST | `/api/ai` | `POST {…}/api/ai` | canonical `{taskType, messages, maxTokens, temperature, privacy, skipCache}` → `{ok, data}` |
| POST | `/api/ai/generate` | `POST {…}/api/ai` | legacy shim (`{provider, messages, config}` → `{text}`) |

Error shape for fullKONK routes: `{ error: string, code: string, retryAfter?: number }`
(with `Retry-After` header when known). `/api/ai*` keeps the gateway envelope
`{ ok: false, error: { code, message } }`.

## Legacy Express routes (in-repo app, unchanged)

`GET /api/health` · `GET /api/auth/github/url` · `GET /auth/callback` ·
`GET /api/fullkonk/health` · `POST /api/fullkonk/optimize-prompt` ·
`GET /api/fullkonk/sessions/:userId` · `POST /api/fullkonk/usage` ·
`GET /api/fullkonk/analytics/:userId` · `POST /api/demo/run` · `GET /redaeye`
