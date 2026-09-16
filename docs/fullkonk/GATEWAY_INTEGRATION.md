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
