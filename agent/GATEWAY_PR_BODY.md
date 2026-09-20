# Secure Konkred AI Ecosystem Gateway integration for `/fullkonk` and site-wide inference

## Summary

Integrates the existing **FullKONK** UI at https://konkred.xyz/fullkonk with the separately deployed **Konkred AI Ecosystem Gateway** through production-safe, same-origin server-side proxy routes on Vercel. The browser never holds or sees a gateway/provider/GitHub credential; SSE generation is streamed without buffering; the existing production uplink-style FullKONK UI, its states and Firebase-backed workspace routes are preserved.

### Architecture

```
Browser (/fullkonk + site AI calls; relative /api fetches only)
  -> Vercel Node.js function api/index.ts (server/gateway-proxy.ts)
       GET  /api/fullkonk/providers      (x-brain-key, 30s safe-cache)
       POST /api/fullkonk/generate       (x-brain-key, unbuffered SSE)
       POST /api/fullkonk/github/export  (x-brain-key, browser token stripped)
       POST /api/ai                      (x-api-key, {ok,data} envelope)
  -> Konkred AI Ecosystem Gateway
  -> Gemini / Groq / Cerebras / Mistral / OpenRouter / Cloudflare / GitHub Models
all other /api/* -> bundled legacy Express app (Firebase sessions/usage/analytics, OAuth, demos)
```

- Stack discovered: **Vite 6 + React 19 + TypeScript SPA** (not Next.js), Express 5 bundled to `lib/fullkonk-server.cjs`, single Vercel Node function via `vercel.json` (`maxDuration` 300), npm + Vitest.
- The pre-existing thin `api/index.ts` (which blindly forwarded all `/api/fullkonk/*` to `BRAIN_URL`, validated nothing and still let the browser send a GitHub token) is replaced by a tested proxy core; legacy env aliases `BRAIN_URL`/`BRAIN_KEY` keep working.

## Files changed

**Server / Vercel**
- `server/gateway-proxy.ts` (new) — framework-agnostic, testable proxy core: routing, validation, limits, rate limiting, caching, SSE pump, timeouts, abort handling, secret screening, redacted logs, env resolution.
- `api/index.ts` — thin Vercel Node.js entry; legacy Express bundle remains the fallback for non-contracted routes.
- `server.ts`, `lib/fullkonk-server.cjs` (rebuilt artifact) — legacy GitHub export now uses the server-only `GITHUB_TOKEN` with a safe 503; local-dev behavior preserved.
- `services/fullkonk.github.ts` — optional token (gateway era) + `normalizeGitHubExportResult()` for gateway/legacy envelopes.

**Browser**
- `lib/sse.ts` (new) — isomorphic hardened SSE parser (chunk boundaries, CRLF/CR, comments, `event`/`id`/multi-`data`, `[DONE]`, malformed frames skipped).
- `lib/gateway-client.ts` (new) — non-empty status-aware errors honoring `Retry-After`.
- `services/gateway.ts` (new) — same-origin `POST /api/ai` client and defensive JSON extraction.
- `lib/ai/providers.ts`, `services/ai.ts` — generic inference now goes through `/api/ai`; no direct-provider browser logic.
- `pages/FullKonkPage.tsx` — hardened stream consumption, normalized errors/Retry-After, abort/unmount guards, resilient provider probe; same UI and all pipeline states preserved.
- `components/fullkonk/GitHubExportModal.tsx` — browser token field removed; gateway owns the credential; duplicate-submit guard.

**Tests**
- `tests/sse-parser.test.ts`, `tests/gateway-proxy.test.ts`, `tests/gateway-integration.test.ts` (real mock gateway over TCP, fragmented CRLF SSE), `tests/client-integration.test.ts`, `tests/client-bundle.test.ts` (builds the Vite bundle and scans it), plus additions to `tests/api.test.ts`.

**Docs/config**
- `docs/fullkonk/GATEWAY_INTEGRATION.md` (new runbook), `.env.example`, `SYSTEM_DOCUMENTATION.md`.

## Environment variables required on Vercel (names only; no values committed)

- `KONKRED_GATEWAY_URL` — gateway root URL (https in production, never localhost)
- `FULLKONK_KEY` — sent as `x-brain-key` to `/api/fullkonk/*`
- `KONKRED_GATEWAY_API_KEY` — sent as `x-api-key` to `/api/ai`
- Legacy aliases `BRAIN_URL` / `BRAIN_KEY` still accepted. Set Preview vars to a staging gateway; Production vars to the production gateway. Provider keys remain only for local/standalone Express.

## Security considerations

- Credentials attached server-side only; inbound `x-brain-key`/`x-api-key` spoofs are stripped; BYOK `x-provider-key` accepted only on generate (bounded).
- Gateway URL comes only from env: validated http(s), no embedded credentials, https + non-localhost enforced in production → no SSRF.
- Body caps (AI 1 MB / generate 2 MB / export 4 MB), JSON validation, allow-list reserialization; GitHub `token` field always stripped.
- SSE not buffered; upstream abort on disconnect; connect 15s / idle 90s / overall 280s timeouts; status + `Retry-After` preserved; non-2xx SSE never becomes a fake success.
- Upstream JSON and SSE chunks screened for the proxy's own secrets (split-safe); logs are redacted (no headers/bodies/URL creds); same-origin CSRF Origin/Host check; best-effort in-instance rate limiter (no new dependency).
- Client source and the production browser bundle are tested to contain no gateway secret names, secret-bearing headers, proxy module, or gateway host.

## Test results

- `npm run lint` (`tsc --noEmit`): **0 errors**
- `npm test` (vitest): **13 files, 163 tests passed** (111 baseline + 52 new)
- `npm run build:vercel`: **success** (Vite client + `lib/fullkonk-server.cjs`)
- `npm run build` (standalone): **success**
- Proxy entry additionally smoke-tested as an esbuild bundle matching Vercel's Node function against an in-process mock gateway.
- Playwright `test:e2e` is unchanged and CI-only (browser downloads are blocked in this sandbox).

## Deployment instructions

1. Merge this PR (owner action; agent does not merge).
2. In Vercel set the three variables for **Production** and a staging gateway for **Preview**; ensure the gateway is deployed independently and reachable.
3. Vercel auto-deploys on merge (`npm run build:vercel`). Verify `/fullkonk` provider discovery, a streamed build, and GitHub export on a Preview deployment first.
4. Rollback: redeploy the previous Vercel deployment, or revert this PR (the `BRAIN_*` aliases keep the prior behavior working).

## Known limitations

- Provider cache/rate limiting are per serverless instance (best-effort); authoritative quotas belong at the gateway/WAF.
- Runs are bounded by the function `maxDuration` 300s and the 280s proxy timeout.
- `/api/ai` provider/model selection is gateway-side by contract.
- Telegram Bot is **not** part of this change and is not claimed live.
- Firebase-backed routes (`sessions`, `usage`, `analytics`, `optimize-prompt`, `health`) intentionally remain on the bundled Express app (outside the gateway contract).

## Checklist

- [x] Same-origin UI routes; no browser-direct provider calls
- [x] No secrets in client code, bundle, logs, errors, or git
- [x] Provider discovery, standard inference, SSE generation, secure GitHub export
- [x] Status codes / Retry-After preserved; friendly non-empty error states
- [x] Lint, tests, and production builds green
- [x] No unrelated files changed; documentation + rollback included
