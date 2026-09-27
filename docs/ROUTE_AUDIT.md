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
`arena/01a0e3f5-konkred-xyz`, verified locally. **Production still returns the
"Before" column** until the branch is deployed with `DATABASE_URL`,
`KONKRED_GATEWAY_URL`, `KONKRED_GATEWAY_API_KEY`, `FULLKONK_KEY` and the
NowPayments variables set. See `docs/INCIDENT_AND_DEPLOYMENT.md` §5.

---

# P5 route audit — workflow execution surface

Added by the workflow-execution work. This section covers the routes that make
the 36 catalogue items executable, and re-audits the existing AI routes for one
column the earlier audit did not have: **metered**.

"Metered" means a paid inference call is reserved against a quota ledger before
it is made. An unmetered route that reaches a provider is a route where an
anonymous caller can spend the owner's money.

Status values are measured by `npm test` against the real router in
`tests/helpers/workflow-harness.ts` (pg-mem + a stub gateway). They are **not**
measured against production, because nothing has been deployed.

## New: catalogue and execution

| Route | Status | Body | Owner | Auth | Metered | Root cause / why it exists | Fix |
|---|---|---|---|---|---|---|---|
| `GET /api/workflows` | 200 | JSON `{ok,data:{count,items[]}}` — all **36** items | Vercel (Express router) | public | n/a (no inference) | The catalogue existed only as a bundled JSON file in the browser; there was no server view of what is runnable | `server/workflow-routes.ts`; supports `?category=` and `?q=` |
| `GET /api/workflows/:slug` | 200 / **404** `PRODUCT_NOT_FOUND` | JSON, includes `inputSchema`, `creditsPerRun`, `runnable`, `runnableForAnon` | Vercel | public | n/a | — | both slug forms resolve (`contract-review` and `contract-review-copilot`) |
| `POST /api/workflows/:slug/run` | 200 / 400 / 401 / 402 / 403 / 404 / 502 / 503 | JSON envelope always | Vercel → Gateway | Firebase ID token; anonymous allowed only for PUBLIC_DEMO | **yes** — `creditsPerRun` reserved before the call, refunded on any failure | No route existed to run a catalogue item at all | `server/workflow-routes.ts` + `server/workflow-run.ts` |
| `POST /api/workflows/:slug/demo` | 200 / 403 / 429 / 502 / 503 | JSON, `demo:true`, fixture input | Vercel → Gateway | anonymous by design | **no** — 0 credits, bounded instead by SQL per-IP and global ceilings | Public proof without a login, without handing out the provider budget | fails **closed** without a database (D-2) |
| any `/api/*` with a malformed body | **400** `INVALID_JSON` | JSON | Vercel | — | n/a | **Express's default error handler returned `text/html`** for a body-parser failure, on every API route in the app | `server/api-error-handler.ts`, registered last in `createApp()` |

### Failure codes on `/run`

| Code | Status | Meaning | Charged? |
|---|---|---|---|
| `PRODUCT_NOT_FOUND` | 404 | no such slug | no |
| `CONTACT_REQUIRED` | 403 | ENTERPRISE_INTEGRATION, not self-serve | no |
| `AUTH_REQUIRED` | 401 | anonymous caller on a non-public product | no |
| `INVALID_INPUT` | 400 | fails the product's `inputSchema` | no |
| `INPUT_TOO_LARGE` | 400 | above `maxInputTokens`; nothing is truncated for you | no |
| `QUOTA_EXHAUSTED` | 402 | balance below `creditsPerRun`; includes `upgradeUrl` | no |
| `METERING_UNAVAILABLE` | 503 | the ledger threw; nothing charged | no |
| `GATEWAY_NOT_CONFIGURED` | 503 | no gateway on this deployment | no (not reserved) |
| `UPSTREAM_UNAVAILABLE` | 503 | gateway unreachable or 5xx | **refunded** |
| `MODEL_OUTPUT_UNPARSEABLE` | 502 | no JSON object after one repair attempt | **refunded** |
| `OUTPUT_SCHEMA_VIOLATION` | 502 | output failed `outputSchema`; discarded, not returned | **refunded** |

## Re-audit: unmetered paid inference (pre-existing, reported not fixed)

These three routes reach a paid provider without reserving anything. They are
**outside this brief's scope** (they belong to the FULLKONK surface and the
legacy demo path, neither of which this work may refactor), but an audit that
omitted them would be dishonest.

| Route | Source | Auth | Metered | Exposure | Recommended fix |
|---|---|---|---|---|---|
| `POST /api/ai/generate` | `server.ts:343` | **none** | **no** | 13 providers reachable by anyone who finds the path | route through `Meter.identify` + `reserve`, or delete if superseded by `/api/workflows/:slug/run` |
| `POST /api/demo/run` | `server.ts:823` | none | **no** | real Gemini calls, gated only by `ENABLE_PRODUCT_DEMOS` and the presence of a key | superseded by `POST /api/workflows/:slug/demo`, which has SQL-backed ceilings; retire it |
| `POST /api/fullkonk/optimize-prompt` | `server.ts:523` | authenticated | **no** | a signed-in caller can spend without limit | reserve 1 credit, matching `/api/fullkonk/generate` |

`POST /api/fullkonk/generate` is metered (1 credit, `server/metering.ts`) and
was left exactly as-is: `Meter.reserve` hardcodes a spend of 1, and the
workflow routes call `Billing.spend` directly with `creditsPerRun` rather than
changing shared behaviour that the existing tests pin.

## Deployment gap (unchanged)

Still nothing deployed. The workflow routes additionally require
`src/db/migrations/0002_workflows.sql` to be applied before public demos will
run; without it they fail closed with `503 DEMO_UNAVAILABLE`. Commands are in
`docs/PHASE_STATUS.md`.
