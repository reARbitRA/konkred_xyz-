# Konkred AI Ecosystem Gateway — Integration & Runbook

How the KONKRED website at **https://konkred.xyz/fullkonk** integrates with the
separately deployed **Konkred AI Ecosystem Gateway** on Vercel, securely and
without exposing any backend credential to the browser.

---

## 1. Integration architecture

```text
 Browser (React SPA, /fullkonk and site-wide AI calls)
   │  same-origin relative fetch only:
   │    GET  /api/fullkonk/providers
   │    POST /api/fullkonk/generate        (Server-Sent Events)
   │    POST /api/fullkonk/github/export
   │    POST /api/ai                        (standard inference)
   ▼
 Vercel Node.js serverless function  — api/index.ts (Node runtime, maxDuration 300)
   │  server/gateway-proxy.ts (security boundary; no framework dependencies)
   │    • attaches credentials from server-only environment variables
   │    • strips spoofed credential headers from inbound requests
   │    • validates + size-caps + allow-lists every request body
   │    • streams SSE without buffering; aborts upstream on disconnect
   │    • preserves upstream status codes and Retry-After
   ▼
 Konkred AI Ecosystem Gateway (separately deployed; owns all provider keys,
   FULLKONK_KEY, and the GitHub credential)
   ▼
 Gemini · Groq · Cerebras · Mistral · OpenRouter · Cloudflare · GitHub Models
```

The browser never contains, receives, or constructs:
provider API keys, gateway keys, `FULLKONK_KEY`, GitHub personal access tokens,
Redis credentials, or the gateway origin. There is no public
(`VITE_`/`NEXT_PUBLIC_`) secret, no secret in localStorage for the gateway, no
secret in a URL query parameter, and no direct browser connection to any AI
provider.

### Request routing inside the Vercel function

| Same-origin route | Upstream (Gateway) | Credential attached | Notes |
| :-- | :-- | :-- | :-- |
| `GET /api/fullkonk/providers` | `GET /api/fullkonk/providers` | `x-brain-key: ${FULLKONK_KEY}` | 200 JSON cached 30 s per instance; errors never cached |
| `POST /api/fullkonk/generate` | `POST /api/fullkonk/generate` | `x-brain-key` | **SSE streamed incrementally**, 2 MB body cap |
| `POST /api/fullkonk/github/export` | `POST /api/fullkonk/github/export` | `x-brain-key` | Browser `token` field is always stripped; 4 MB cap |
| `POST /api/ai` | `POST /api/ai` | `x-api-key: ${KONKRED_GATEWAY_API_KEY}` | Standard inference, `{ ok, data }` envelope |
| All other `/api/*` | — | — | Bundled legacy Express app (`lib/fullkonk-server.cjs`): Firebase sessions/usage/analytics, GitHub OAuth, `/api/ai/generate` (local/legacy), demo, health |

Firebase-backed website routes (`/api/fullkonk/sessions/*`, `/usage`,
`/analytics/*`, `/optimize-prompt`, `/health`) intentionally remain on the
bundled Express app — they are not part of the gateway contract.

`lib/sse.ts` is an isomorphic, hardened SSE parser shared by the browser and
tests. It handles events split across chunks, multiple events per chunk,
LF/CRLF/CR separators, heartbeat comments, `event:`/`id:`/repeated `data:`
fields, the `[DONE]` sentinel, and malformed frames (skipped, never thrown).

---

## 2. Environment variables (Vercel, server-only)

Set these in **Vercel → Project → Settings → Environment Variables**, scoped to
the right environments. They are never committed and never prefixed for public
exposure.

| Name | Required | Used for |
| :-- | :-- | :-- |
| `KONKRED_GATEWAY_URL` | Production: yes | Root URL of the deployed gateway. Must be `https://` and never localhost in production. |
| `FULLKONK_KEY` | Production: yes | Sent as `x-brain-key` on `/api/fullkonk/*`. |
| `KONKRED_GATEWAY_API_KEY` | For `/api/ai` | Sent as `x-api-key` on standard inference. |
| `BRAIN_URL` / `BRAIN_KEY` | Optional legacy aliases | Fallback names from the earlier proxy; explicit `KONKRED_*` / `FULLKONK_KEY` names win. |

Provider keys (`GEMINI_API_KEY`, `GROQ_API_KEY`, …), `GITHUB_TOKEN`,
`GITHUB_CLIENT_ID/SECRET`, and SQL credentials remain server-only for the
standalone/local Express server and legacy routes. See `.env.example` for the
full list — it ships empty placeholders only.

### Preview vs Production variables

- **Production** environment: the production gateway URL + production keys.
- **Preview** environment: point at a staging gateway URL with preview keys so
  PR deployments never touch production provider quota or GitHub repos.
- Do not enable the integration against a gateway that allows open access;
  every gateway call from this site is authenticated.
- Verify `KONKRED_GATEWAY_URL` is not `localhost`/`127.0.0.1` in production
  (the function refuses it when `NODE_ENV=production`).

---

## 3. Local development

```bash
npm ci
cp .env.example .env        # then fill LOCAL-only values; .env is gitignored
npm run dev                 # Vite dev middleware + Express on http://localhost:3000
```

In local dev the Vite/Express server serves the full app directly (the Vercel
function is not in the path):

- `/fullkonk` uses the **bundled local orchestrator** in `server.ts`, which
  reads provider keys from `.env` and supports per-request BYOK
  (`x-provider-key` sent from the local browser for your own key).
- To exercise the **gateway proxy locally**, run `npx vercel dev` with
  `KONKRED_GATEWAY_URL` / `FULLKONK_KEY` / `KONKRED_GATEWAY_API_KEY` set; the
  gateway URL may be `http://localhost:<port>` outside production.
- GitHub export locally uses server-side `GITHUB_TOKEN` (the browser no longer
  collects a token). Without it, the local route returns a safe
  `503 not configured`.

Tests never require live credentials:

```bash
npm run lint        # tsc --noEmit
npm test            # vitest: unit, SSE parser, proxy security, mock-gateway E2E
npm run build:vercel   # client build + legacy server bundle used by the function
```

---

## 4. Deployment (Vercel)

- Framework: static Vite SPA + one Node.js function (`api/index.ts`).
  There is no Next.js App/Pages Router; `vercel.json` rewrites `/api/(.*)` to
  the function and everything else to `index.html`.
- Runtime: **Node.js** (streaming proxy and the bundled Express app require
  Node; Edge is not used). `maxDuration` is 300 s; SSE connect timeout is
  15 s, per-chunk idle timeout 90 s, overall 280 s.
- Build command: `npm run build:vercel` (Vite build → `dist/`, esbuild bundle
  of `server.ts` → `lib/fullkonk-server.cjs`, which `vercel.json` includes
  with the function). `server/gateway-proxy.ts` is statically imported by
  `api/index.ts` and is traced/bundled automatically.
- No long-lived process is started; rate limiting is a best-effort,
  per-instance fixed-window limiter (no external dependency). Authoritative
  throttling/quotas belong at the gateway/Vercel WAF.
- The Konkred Gateway is deployed **independently** — this project only stores
  its URL + keys.

---

## 5. Streaming / SSE behavior

- Upstream SSE frames are piped byte-for-byte as soon as they arrive. The
  function flushes headers immediately and sets
  `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`,
  `Connection: keep-alive`, and `X-Accel-Buffering: no`.
- Browser disconnect (response closed before it was finished) aborts the
  upstream fetch; a mid-stream interruption emits a final retryable
  `error` event instead of a fake success.
- The UI treats a stream that ends before `done` as a retryable pipeline error.
- `stage`, `provider`, `failover`, `metrics`, `delta`, `file`, `reset`,
  `done`, and `error` events are all handled; `[DONE]` is honored; unknown
  frames and malformed JSON are dropped without crashing.
- Non-SSE upstream responses (e.g. JSON `429`) preserve their content type and
  status.

---

## 6. Error handling

Errors are normalized only at the proxy boundary; the browser never sees
internal hostnames, stack traces, or credentials.

| Status | Meaning / UI behavior |
| :-- | :-- |
| 400 | Validation error (prompt, messages, file paths). Shown as non-retryable. |
| 401 / 403 | Authorization/configuration failure; no secret detail shown. |
| 405 | Wrong method for a contracted route (`Allow` header set). |
| 413 | Body too large; guidance to shorten prompt/attachments. |
| 429 | Rate/gateway capacity; `Retry-After` is preserved and surfaced as timing. |
| 502 | Gateway unreachable; generic retryable message; redacted server log. |
| 503 | Gateway integration not configured on this deployment (missing env). |
| 504 | Gateway connect/overall timeout; generic retryable message. |

A failed generation can never render as a successful empty response: empty
upstream content and truncated streams raise retryable errors. The client
keeps STOP/cancel (abort) and, for recoverable failures, a RETRY action;
duplicate submissions are blocked while a run is active.

---

## 7. Security checklist (enforced + tested)

- Gateway URL comes **only** from the environment (validated `http(s)`, no
  embedded credentials, https-only/non-localhost in production) — no SSRF
  pivot from request bodies or headers.
- Inbound `x-brain-key` / `x-api-key` headers are discarded; the proxy always
  uses server values. The only browser-supplied credential accepted is the
  BYOK `x-provider-key`, length-capped and forwarded **only** on generate.
- Bodies are size-capped (AI 1 MB, generate 2 MB, export 4 MB), JSON-parsed,
  and re-serialized from allow-listed fields; the GitHub `token` field is
  removed unconditionally (the gateway owns the GitHub credential).
- Cross-origin browser POSTs are rejected (Origin/Host comparison) as CSRF
  defense; authentication uses bearer Firebase ID tokens (forwarded for user
  binding), not ambient cookies.
- Upstream responses (JSON and SSE chunks, split-safe across boundaries) are
  screened for the proxy's own credentials; any hit aborts/502s instead of
  relaying.
- Server logs contain route, status, latency and error names only — never
  headers, tokens, bodies, or URLs containing credentials.
- Same-origin CORS posture only; no credentialed cross-origin exposure.
- Client source and the production browser bundle are statically tested to
  contain none of the secret names/headers/gateway references.

---

## 8. Rollback

1. **Vercel dashboard:** redeploy the previous production deployment
   (instant; the gateway is independent and needs no rollback).
2. **Git:** revert the gateway-proxy commit set; the prior
   `BRAIN_URL`/`BRAIN_KEY` proxy behavior remains supported via aliases, and
   `BRAIN_URL`/`BRAIN_KEY` variables continue to work if still configured.
3. No database migrations or external state changes are performed by this
   integration. Set the gateway variables back to the previous gateway if a
   bad gateway deployment was deployed independently.

---

## 9. Known limitations

- In-memory provider cache (30 s) and rate limiting are per serverless
  instance; they are best-effort latency/abuse controls, not a global quota.
- Very long full-stack runs are bounded by the Vercel function `maxDuration`
  (300 s on the current configuration) and the 280 s proxy overall timeout.
- Provider/model choice for `/api/ai` is gateway-side; the request contract
  does not accept provider-specific parameters from the browser.
- Telegram Bot work is outside this integration and must not be considered
  live unless its own worker is separately deployed and configured.
- Playwright E2E requires browser downloads unavailable in the sandbox
  (`npm run test:e2e` runs in CI / a machine with browser access).
