# fullKONK_> ⇄ Konkred AI Ecosystem Gateway — integration guide

Status: implemented on this branch. **Not merged, not deployed.** Nothing here
requires a live provider credential to test.

---

## 1. What was found (repository audit, 2026-09)

| Question | Answer |
| --- | --- |
| Framework / version | Vite 6 + React 19 + TypeScript 5.8 **SPA** (no Next.js, no App/Pages Router, no server actions) |
| Routing | hand-rolled in `utils/routes.ts`; `/fullkonk` → lazy `pages/FullKonkPage.tsx` |
| Package manager | npm (`package-lock.json`; a stale `bun.lock` also exists) |
| Server | Express 5 `server.ts`, bundled by esbuild into `lib/fullkonk-server.cjs` |
| Vercel shape | single Node.js function `api/index.ts` (`maxDuration: 300`), `buildCommand = npm run build:vercel`, `outputDirectory = dist`, rewrites `/api/(.*)` → `/api/index`, `/(.*)` → `/index.html` |
| Existing API routes | `GET /api/health`, `GET /api/auth/github/url`, `GET /auth/callback`, `POST /api/ai/generate` (Gemini), `GET /api/fullkonk/providers`, `GET /api/fullkonk/health`, `POST /api/fullkonk/optimize-prompt` (Groq), `POST /api/fullkonk/generate` (SSE), `GET /api/fullkonk/sessions/:userId`, `POST /api/fullkonk/usage`, `GET /api/fullkonk/analytics/:userId`, `POST /api/fullkonk/github/export`, `POST /api/demo/run`, `GET /redaeye` |
| Existing SSE | `data: {json}\n\n` frames from `POST /api/fullkonk/generate`; parsed inline in `pages/FullKonkPage.tsx` (`split('\n\n')`) |
| Previous gateway proxy | `api/index.ts` forwarded **every** `/api/fullkonk/*` path to `BRAIN_URL` with `x-brain-key: BRAIN_KEY`, forwarding the browser's `x-provider-key` and `authorization` headers, and echoing raw upstream error text |
| Existing GitHub integration | `components/fullkonk/GitHubExportModal.tsx` posts a user PAT in the JSON body to `POST /api/fullkonk/github/export`; `services/fullkonk.github.ts` performs the API calls |
| Existing AI Studio/Gemini usage | `services/ai.ts` + `lib/ai/providers.ts` → `POST /api/ai/generate` → `GEMINI_API_KEY` on the server |
| Auth | Firebase Auth in the browser; server verifies ID tokens through `firebase-admin` (`authenticatedIdentity`); Cloud SQL/Drizzle + Firestore for sessions/usage/projects |
| Tests | Vitest (`tests/**/*.test.ts`, node env) and Playwright (`tests/e2e`) |

Preserved on purpose: the whole existing `/fullkonk` UI (uplink/loading console,
chat, code output, live Sandpack environment, analytics, workspace), the legacy
Express app for every route the gateway does not own, and the BYOK flow.

---

## 2. Integration architecture

```
Browser (/fullkonk, same origin)
        │  relative fetch() — no keys, no gateway URL in the bundle
        ▼
Vercel Node function  api/index.ts
        │  server/gateway/router.ts  (BFF)
        │  • injects x-brain-key / x-api-key from server env
        │  • strips browser-supplied credentials
        │  • streams SSE byte-for-byte, aborts on client disconnect
        ▼
Konkred Gateway (Render/VM/Docker — deployed separately from this repo)
        │  quota-aware pool, failover, cache, dedup
        ▼
Gemini · Groq · Cerebras · Mistral · OpenRouter · Cloudflare · GitHub Models · (mock)
```

### Routes owned by the BFF (`server/gateway/router.ts`)

| Route | Upstream | Notes |
| --- | --- | --- |
| `GET /api/fullkonk/providers` | `GET ${KONKRED_GATEWAY_URL}/api/fullkonk/providers` | `x-brain-key` injected; `Cache-Control: public, max-age=30, s-maxage=60, stale-while-revalidate=120` on 200 only — failures are `no-store` |
| `POST /api/fullkonk/generate` | `POST …/api/fullkonk/generate` | SSE pass-through, no buffering, idle/overall timeouts |
| `POST /api/fullkonk/github/export` | `POST …/api/fullkonk/github/export` | token stays server-side; envelope preserved |
| `POST /api/ai` | `POST …/api/ai` | `x-api-key`; `{ ok, data } / { ok, error }` passthrough |
| `POST /api/ai/generate` | `POST …/api/ai` | legacy shim for `services/ai.ts`; normalises `{provider,messages,config}` → gateway contract and returns `{ text }` |

Everything else (`/api/demo/run`, `/api/auth/*`, `/api/health`,
`/api/fullkonk/{health,sessions,usage,analytics,optimize-prompt}`) still runs in
the in-repo Express app.

If `KONKRED_GATEWAY_URL` is **not** set:

* in production the BFF fails closed with `503 GATEWAY_NOT_CONFIGURED`
  (`FULLKONK_LEGACY_ENGINE_FALLBACK=false` is the production default), so a
  misconfigured deployment can never silently serve a different brain;
* outside production it declines the request so the in-repo engine (BYOK)
  serves it, keeping local development unchanged. `FULLKONK_LEGACY_ENGINE_FALLBACK`
  overrides either direction. `/api/ai` has no legacy equivalent and always
  fails closed.

---

## 3. Environment variables (server-only — never `VITE_*` / `NEXT_PUBLIC_*`)

Required in Vercel:

| Variable | Purpose |
| --- | --- |
| `KONKRED_GATEWAY_URL` | Gateway origin, e.g. `https://konkred-gateway.onrender.com` (must not be `localhost` in production) |
| `KONKRED_GATEWAY_API_KEY` | Caller key for `POST /api/ai` (gateway `USERS_JSON` entry) |
| `FULLKONK_KEY` | Shared brain secret sent as `x-brain-key`; must equal the gateway's `FULLKONK_KEY` |

Optional:

| Variable | Default | Purpose |
| --- | --- | --- |
| `FULLKONK_GITHUB_EXPORT_TOKEN` | *(unset)* | Server-owned GitHub token; when set, browser tokens are ignored |
| `FULLKONK_REQUIRE_AUTH` | `false` | Require a verified Firebase ID token on gateway routes |
| `FIREBASE_PROJECT_ID` / `FIREBASE_SERVICE_ACCOUNT_JSON` | *(unset)* | Credentials for the token verification above |
| `FULLKONK_ALLOWED_ORIGINS` | *(unset)* | Extra browser origins allowed to call the BFF (e.g. a preview domain) |
| `FULLKONK_LEGACY_ENGINE_FALLBACK` | `true` outside production | Serve gateway routes from the in-repo engine when no gateway is configured |
| `FULLKONK_MAX_BODY_BYTES` | `2097152` | Request body cap (≤ 4 MB, the Vercel function limit) |
| `FULLKONK_CONNECT_TIMEOUT_MS` | `20000` | Time allowed for the gateway to answer/start streaming |
| `FULLKONK_IDLE_TIMEOUT_MS` | `90000` | Abort a stream that stops producing bytes |
| `FULLKONK_STREAM_TIMEOUT_MS` | `280000` | Overall stream cap (kept below the 300s function limit) |
| `FULLKONK_RATE_LIMIT_*_PER_MIN` | `30/60/10/120` | Per-instance limits for generate / ai / export / providers |

### Legacy-name compatibility

| Canonical | Accepted aliases (in priority order) |
| --- | --- |
| `KONKRED_GATEWAY_URL` | `GATEWAY_URL`, `BRAIN_URL` |
| `KONKRED_GATEWAY_API_KEY` | `GATEWAY_API_KEY`, `BRAIN_API_KEY` |
| `FULLKONK_KEY` | `BRAIN_KEY`, `FULLKONK_BRAIN_KEY` |
| `FULLKONK_GITHUB_EXPORT_TOKEN` | *(none — `GITHUB_TOKEN` is deliberately **not** aliased: it is a GitHub Models provider credential in this deployment)* |

The Konkred AI Ecosystem `render.yaml` tells operators to paste the gateway's
`FULLKONK_KEY` into Vercel as `BRAIN_KEY`; that still works. Prefer the
`KONKRED_*` / `FULLKONK_*` names for new deployments.

Never commit values: `.env.example` carries empty placeholders only.

---

## 4. Local development

```bash
npm ci
cat > .env.local <<'EOF'
KONKRED_GATEWAY_URL=https://your-gateway.example.com
KONKRED_GATEWAY_API_KEY=...
FULLKONK_KEY=...
EOF
npm run dev            # http://localhost:3000/fullkonk
```

* `.env.local` is git-ignored. `npm run dev` (`tsx start.ts`) dispatches requests
  through the same BFF router as the Vercel function, then falls back to the
  Express app.
* Without `KONKRED_GATEWAY_URL` nothing changes: the in-repo orchestrator +
  browser BYOK keeps working.
* To run the gateway locally too: `git clone` the
  `reARbitRA/konkred-AI-ecosystem` repository, `node gateway/src/server.mjs`
  (with `FULLKONK_KEY` and provider keys set) and point
  `KONKRED_GATEWAY_URL=http://127.0.0.1:3000` at it.

## 5. Preview vs production

Vercel scopes environment variables per environment, so:

* **Preview**: either point at a staging gateway or leave `KONKRED_GATEWAY_URL`
  unset (the legacy engine serves previews). Preview URLs that must call the BFF
  from a custom domain go in `FULLKONK_ALLOWED_ORIGINS` — Vercel preview
  hostnames are otherwise rejected by the origin guard.
* **Production**: all three required variables must be present, with a
  non-localhost `KONKRED_GATEWAY_URL`. Deploy the gateway **before** the front
  end: with the gateway unset, production fails closed with a clear 503.

## 6. Production deployment

1. Deploy the gateway (`reARbitRA/konkred-AI-ecosystem`) and note its URL; verify
   `GET {url}/api/health` returns `{ ok: true }`.
2. Set the three required variables in Vercel → Project → Settings → Environment
   Variables (Production scope), then redeploy.
3. Smoke test:
   ```bash
   curl -s https://konkred.xyz/api/fullkonk/providers | head -c 400
   curl -sN -X POST https://konkred.xyz/api/fullkonk/generate \
     -H 'content-type: application/json' \
     -d '{"prompt":"hello","mode":"review"}' | head -5
   ```
   The first call must return the provider list; the second must print SSE
   frames (`data: …`) incrementally.
4. Streaming needs a Vercel plan whose function limit matches
   `FULLKONK_STREAM_TIMEOUT_MS`. `vercel.json` requests `maxDuration: 300`;
   on the Hobby plan the platform caps it lower, so long builds are truncated by
   Vercel with a partial stream (the BFF converts that into an `error` event).

## 7. Streaming / SSE behaviour

* The gateway emits `data: {json}\n\n` with `stage`, `provider`, `failover`,
  `metrics`, `delta`, `file`, `reset`, `done` and `error` events.
* The BFF is a **byte pass-through**: it sets
  `text/event-stream; charset=utf-8`, `cache-control: no-cache, no-transform`,
  `connection: keep-alive`, `x-accel-buffering: no`, honours backpressure, and
  never buffers a whole response.
* Timeouts: connect (`FULLKONK_CONNECT_TIMEOUT_MS`), idle
  (`FULLKONK_IDLE_TIMEOUT_MS`) and overall (`FULLKONK_STREAM_TIMEOUT_MS`). A
  stream that dies mid-flight gets a synthetic
  `{"type":"error","kind":"pipeline"}` event, so partial output is never
  reported as success.
* The browser parses with `utils/sse.ts` (`SseParser`) — chunk boundaries may
  split events, several events may share one read, CRLF/LF/lone-CR are all
  accepted, `[DONE]` and malformed frames are ignored. `utils/streamState.ts`
  holds the resulting view state (stage, provider, failover, metrics, files,
  done, error) as a pure reducer.

## 8. Error handling

| Status | Client behaviour |
| --- | --- |
| 400 | Validation message from the BFF (e.g. prompt required, invalid JSON) |
| 401 / 403 | "Sign in" / configuration-origin error — no credential detail |
| 413 | Payload guidance (body > 2 MB, attachments > 500 KB, export > 2 MB) |
| 429 | `Retry-After` is preserved and rendered as "Retry in Ns." |
| 502 / 503 / 504 | Gateway availability message; 503 `GATEWAY_NOT_CONFIGURED` names the missing variable |
| stream interrupted | partial output kept + retryable error event |

Upstream status codes and `Retry-After` are forwarded unchanged (429/413/503
included); 5xx bodies are normalised and redacted. Server-side logs are
structured and never contain request headers, tokens or file contents.

## 9. Security controls

* Browser never receives `KONKRED_GATEWAY_API_KEY`, `FULLKONK_KEY`,
  `FULLKONK_GITHUB_EXPORT_TOKEN`, provider keys, Redis URLs or GitHub tokens.
* Browser-supplied `x-api-key`, `x-brain-key`, `x-admin-key`, `x-provider-key`
  and `authorization` headers are ignored on the upstream hop.
* SSRF: the upstream origin is read from the environment only; request data
  cannot change host or path (`server/gateway/config.ts`).
* Origin guard blocks cross-site calls (CSRF defence for cookie-less/Bearer
  flows); `FULLKONK_ALLOWED_ORIGINS` is the explicit allow-list.
* Request bodies are size-capped; prompts, attachments, file paths, owner/repo,
  branch and token shapes are validated before forwarding.
* Per-instance rate limiting keys on the verified uid when
  `FULLKONK_REQUIRE_AUTH=true`, otherwise on the client IP.
* `redactSecrets()` scrubs credential-shaped strings *and* the literal values of
  the deployment's own secrets from every log line and error body.
* `tests/secrets.test.ts`, `tests/gateway-proxy.test.ts` and the bundle scan in
  `tests/fullkonk-frontend.test.ts` enforce the above.

## 10. Tests

```bash
npm test                      # vitest run — unit + route + integration
npm run lint                  # tsc --noEmit
npm run build:vercel          # client build + function bundle
npm run test:e2e              # Playwright (needs a browser; not run in CI here)
```

New suites: `tests/gateway-config.test.ts` (env + SSRF + redaction),
`tests/gateway-proxy.test.ts` (route behaviour, SSE streaming, aborts, secrets),
`tests/sse.test.ts` (parser + reducer), `tests/fullkonk-frontend.test.ts`
(client wiring + bundle scan). All gateway tests use a mocked gateway — no live
Gemini/GitHub/Render/Redis credentials are required.

## 11. Rollback

1. Vercel → Deployments → select the previous production deployment → *Redeploy*
   (instant, no code change).
2. Or remove `KONKRED_GATEWAY_URL` from the Production scope: the BFF then fails
   closed with 503 and no traffic reaches the gateway. To fall back to the
   in-repo engine instead, set `FULLKONK_LEGACY_ENGINE_FALLBACK=true` (provider
   keys must exist for that engine).
3. Reverting the merge commit restores the previous `api/index.ts` behaviour.

## 12. Known limitations

* `/api/ai/generate` now answers through the gateway; the Gemini JSON-schema
  response mode (`responseSchema`) is requested via prompt instead of being
  provider-enforced, so a malformed JSON answer surfaces as an error instead of
  a schema violation.
* Request-level BYOK (`x-provider-key`) is a legacy-engine feature. The gateway
  v2 has no per-request key support, so BYOK keys are ignored on the gateway
  path (the UI keeps the field for the legacy engine).
* `projectId` (existing-project expansion) and the UI's `provider` hint are not
  understood by the gateway and are dropped on that path; model selection still
  travels as `model`, and the gateway's own failover/quota logic picks the
  provider.
* Express-owned routes (`/api/fullkonk/sessions|usage|analytics`) need Firebase
  Admin credentials in the Vercel environment to verify ID tokens.
* Rate limiting is per function instance (Vercel scales horizontally); the
  gateway's own per-caller tier budget remains the authoritative quota.
* The Telegram bot in the gateway repository is deployed separately — this
  integration does **not** deploy or verify the bot worker.
* Playwright E2E was not executed in this environment (no browser binaries); the
  request/stream path is covered by Vitest instead.
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
