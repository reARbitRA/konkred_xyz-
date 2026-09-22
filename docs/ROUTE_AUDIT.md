# P1 route audit

Required by the brief: for every route, record status, body, owner, auth
behaviour, root cause and fix.

Two columns of status are given, because they differ and the difference is the
whole point:

* **Before** — measured live against `https://www.konkred.xyz` at the start of
  this work.
* **After** — measured against the fixed build running locally with a mock
  gateway and a real PostgreSQL instance. These values are *not* yet true of
  production, because nothing has been deployed (see "Deployment gap" below).

Owner: **Vercel** = this repo's serverless function · **Gateway** = the separate
AI gateway service · **Legacy** = the bundled Express app (`lib/fullkonk-server.cjs`).

## Pages

| Route | Before | After | Owner | Auth | Root cause | Fix |
|---|---|---|---|---|---|---|
| `/` | 200 HTML, then hung on `INITIALIZING_CORE` | 200, renders | Vercel (static) | public | `onAuthStateChanged` had no error callback and no timeout, so `isLoading` never cleared | 8 s watchdog + error callback in `AuthContext`; boot always settles |
| `/fullkonk` | 200 HTML, hung | 200, renders | Vercel (static) | public | same as `/` | same; plus terminal states for provider discovery |
| `/pricing` | 200 HTML, hung | 200, renders | Vercel (static) | public | same as `/` | same |
| `/checkout` | redirected to 404 (purged mock) | 200, renders | Vercel (static) | public | was a mock storefront, deliberately purged | replaced with a real Persian page driven by `/api/payments/*` |

## Health

| Route | Before | After | Owner | Auth | Root cause | Fix |
|---|---|---|---|---|---|---|
| `/api/health` | **500** `FUNCTION_INVOCATION_FAILED` (HTML) | 200 JSON, `configured` booleans | Vercel (proxy-owned) | public | delegated to the legacy bundle, which does `initializeApp()` + `pg` Pool at module scope; a throw there killed the whole function | owned by the proxy; touches no DB, Firebase, gateway or config |
| `/api/ready` | did not exist | 200 healthy / 503 degraded + code | Vercel (proxy-owned) | public | no readiness signal existed | probes the gateway with a 5 s timeout; never echoes the upstream body |

## AI routes

| Route | Before | After | Owner | Auth | Root cause | Fix |
|---|---|---|---|---|---|---|
| `/api/fullkonk/providers` | **500** `FUNCTION_INVOCATION_FAILED` | 200 provider JSON (mock gateway); 503 `GATEWAY_NOT_CONFIGURED` when unset | Gateway via Vercel proxy | public | same module-scope crash | crash containment in `api/index.ts`; controlled JSON for every failure |
| `/api/fullkonk/generate` | **500** | 200 SSE; **402** `QUOTA_EXHAUSTED` when out of quota | Gateway via Vercel proxy | metered, server-derived identity | no metering existed; quota was not enforced anywhere | `server/metering.ts` reserves before the gateway is called; refunds failed generations |
| `/api/fullkonk/github/export` | **500** | forwarded to gateway; controlled error when unset | Gateway via Vercel proxy | gateway key (server-side) | same module-scope crash | crash containment. **Path validation not re-audited this session** |
| `/api/ai` | **500** | forwarded; validation + rate limit | Gateway via Vercel proxy | same-origin enforced | same module-scope crash | crash containment |

## Billing (new)

| Route | Before | After | Owner | Auth | Root cause | Fix |
|---|---|---|---|---|---|---|
| `/api/quota` | did not exist | 200 balance JSON | Vercel + PostgreSQL | identity derived server-side | no quota system | new; forged `x-end-user` ignored (tested) |
| `/api/payments/plans` | did not exist | 200 catalogue + network warning | Vercel | public | — | new |
| `/api/payments/create` | did not exist | 200 invoice / 503 when unconfigured | Vercel + NowPayments | identity derived server-side | — | new; records the order before calling the provider |
| `/api/payments/status` | did not exist | 200 for the owner, **404 for anyone else** | Vercel + PostgreSQL | owner-scoped | — | new; identical response for "missing" and "not yours" so order ids cannot be probed |
| `/api/payments/nowpayments/webhook` | did not exist | 200 `GRANTED` / **401** unsigned or forged / 200 `DUPLICATE_EVENT` | Vercel + PostgreSQL | **signature only** | — | HMAC-SHA512 over recursively sorted body, constant-time compare; UNIQUE `event_id` makes replay a no-op |

## Legacy and catch-all

| Route | Before | After | Owner | Auth | Root cause | Fix |
|---|---|---|---|---|---|---|
| `/api/auth/github/url` | **500** (function crash) | 500 JSON `GITHUB_CLIENT_ID … not configured` | Legacy | public | genuinely missing env var — now reported as clean JSON instead of a crash | crash containment; the message is accurate and actionable |
| `/api/<unknown>` | **200 text/html** (SPA shell) | **404 JSON** `ROUTE_NOT_FOUND` | Vercel / Express | public | no API catch-all: unknown paths fell through to the SPA handler, so JSON clients tried to parse `<!DOCTYPE html>` | added an `/api` 404 handler; regression test in `tests/api.test.ts` |

> The `/api/<unknown>` row was **found by performing this audit** — it was not
> part of the reported incident. Returning HTML from an API is exactly the kind
> of misleading failure that made the original 500s hard to diagnose.

## Deployment gap

The "After" column reflects the code on branch
`arena/01a0cb39-konkred-xyz`, verified locally. **Production still returns the
"Before" column** until the branch is deployed with `DATABASE_URL`,
`KONKRED_GATEWAY_URL`, `KONKRED_GATEWAY_API_KEY`, `FULLKONK_KEY` and the
NowPayments variables set. See `docs/INCIDENT_AND_DEPLOYMENT.md` §5.
