# Verification evidence — gateway integration

Environment: Node v22, npm, branch `arena/01a0aa1d-konkred-xyz` (2026-09-16).
No live Gemini / GitHub / Render / Redis / production credentials were used.

## Commands and results

| Command | Result |
| --- | --- |
| `npm test` | **12 suites, 194 tests passed** (0 failed) |
| `npm run lint` (`tsc --noEmit`) | exit 0, no diagnostics |
| `npm run build:vercel` | `validate:portfolio` ✓, `vite build` ✓ (built in ~8s), `bundle:api` ✓ (`lib/fullkonk-server.cjs`, 4.1 MB) |
| `npm run test:e2e` | **not run here** — Playwright browsers are unavailable in this sandbox; the UI is exercised through the route-level suites instead |

## Suites added by this change

| Suite | Tests | Covers |
| --- | --- | --- |
| `tests/gateway-config.test.ts` | 20 | env resolution + legacy aliases, production fail-closed, URL normalisation, SSRF rejection (`localhost`, private ranges, credentials in URL, non-http schemes, query/path injection), secret redaction |
| `tests/gateway-proxy.test.ts` | 32 | real-HTTP mocked gateway + BFF: provider discovery, header injection, spoofed browser keys ignored, status/`Retry-After` passthrough (400/401/403/413/429/500/502/503/504), malformed JSON, oversized body, unconfigured gateway, GitHub export validation + server-token precedence, SSE split/multi-event/CRLF frames, client abort closes upstream, no secrets in bodies or logs, end-to-end stream → reducer |
| `tests/sse.test.ts` | 17 | SSE parser (chunk boundaries, CRLF/LF, multi-line data, comments, `[DONE]`, escaped JSON, malformed frames) and the stream reducer (delta/file/reset/error/done, explicit files retained) |
| `tests/fullkonk-frontend.test.ts` | 14 | same-origin fetch targets only, no gateway URL/secret names in the shipped bundle, no `VITE_*`/`NEXT_PUBLIC_*` secret use, duplicate-submit guard, abort + unmount guards, retry/`Retry-After` rendering, export token never persisted |

## Security checks

* `git diff` scanned for credential material — the only matches are documented
  placeholder names (`KONKRED_GATEWAY_API_KEY=`, `FULLKONK_KEY=` …) in
  `.env.example`, with empty values.
* `tests/secrets.test.ts` (pre-existing) still passes: no `process.env.*` outside
  `VITE_*`/`NODE_ENV` in client directories, no tracked `.env` files, no live keys.
* The production client bundle (`dist/assets/*.js`) is scanned for gateway URLs,
  credential variable names and key patterns — none present.
* BFF tests assert that browser-supplied `x-brain-key`, `x-api-key`,
  `x-provider-key` and `authorization` values never reach the gateway, and that
  gateway error text echoed back to the browser is redacted.

## Local end-to-end smoke test (mocked gateway, real dev server)

```bash
node /tmp/mock-gateway.mjs            # implements the gateway contract on :8787
KONKRED_GATEWAY_URL=http://127.0.0.1:8787 FULLKONK_KEY=smoke-brain-key \
  KONKRED_GATEWAY_API_KEY=smoke-api-key npm run dev
```

| Call | Observed |
| --- | --- |
| `GET /api/fullkonk/providers` (with spoofed `x-brain-key`, `x-provider-key`, `authorization` headers) | `200`, provider JSON, `cache-control: public, max-age=30, s-maxage=60, stale-while-revalidate=120`, `x-konkred-request-id` forwarded; the mock gateway logged `x-brain-key: smoke-brain-key` — the browser values were discarded |
| `POST /api/fullkonk/generate` (spoofed headers, body with `projectId` + `provider`) | SSE frames arrived ~120 ms apart (matching the mock's pacing) as `stage → provider → delta → file → metrics → done`; upstream body was `{"prompt":"hello","mode":"review","temperature":0.4,"attachedFiles":[]}` — `projectId`/`provider` dropped |
| `POST /api/fullkonk/github/export` | `200 {"success":true,"filesUploaded":1,…}` |
| `POST /api/ai` | `200` gateway envelope, mock logged `x-api-key: smoke-api-key`, no `authorization` header relayed |
| malformed JSON body | `400` |
| malformed GitHub token | `400` |

Both processes were stopped after the run; the mock gateway lives outside the
repository (`/tmp`) and is not committed.

## Not verified here (requires the live deployment)

* Real gateway reachability, provider quotas and failover behaviour.
* Vercel streaming behaviour under the production plan's timeout.
* Firebase ID-token verification (`FULLKONK_REQUIRE_AUTH=true`) against real
  Admin credentials.
* Playwright end-to-end run.
