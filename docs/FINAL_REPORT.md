# Final report — making the 36 catalogue items executable

Branch `arena/01a0e3f5-konkred-xyz`. Nothing deployed, by instruction.
Every number below comes from a named command; the commands are quoted so you
can re-run them.

---

## 1. What was asked

Make the 36 catalogue items executable on the live KONKRED site, using the
existing gateway (`reARbitRA/konkred-AI-ecosystem`) as the only inference path.
Read-only catalogue routes, a metered runner with an exact 12-step sequence and
a fixed set of failure codes, execution metadata in both manifest copies, the
known gateway defects written up as a patch list, a per-route audit, and tests
that prove each new guard actually catches what it claims.

Constraints that shaped the result: no changes to the gateway or bot repos, no
new paid infrastructure, no streaming, never return HTML from an API route, no
fabricated metrics, and do not deploy.

## 2. What was built

| Area | Files | What it does |
|---|---|---|
| Catalogue API | `server/workflow-routes.ts`, `catalog/runtime.ts` | `GET /api/workflows` (all 36, `?category=`, `?q=`), `GET /api/workflows/:slug` (both slug forms, 404 `PRODUCT_NOT_FOUND`) |
| Runner | `server/workflow-run.ts` | 12-step execution: resolve → gate → validate input → plan size → call gateway → extract JSON → one repair attempt → force approval → validate output |
| Gateway client | `server/workflow-gateway.ts` | `POST {GATEWAY}/api/ai` with `x-api-key`, 240 s timeout; upstream bodies never reach the browser |
| Persistence | `server/workflow-store.ts`, `src/db/migrations/0002_workflows.sql` | `workflow_runs` (idempotent replay) and `demo_runs` (abuse ceilings) |
| Error contract | `server/api-error-handler.ts` | terminal JSON handler for `/api/*` |
| Manifest | `catalog/product-manifest.json`, `agent/PRODUCT_MANIFEST.json`, `catalog/types.ts` | `taskType`, `creditsPerRun`, `privacy`, `maxInputTokens`, `maxOutputTokens`, `runnable`, `runnableForAnon` |
| Tests | 4 new suites + `tests/helpers/workflow-harness.ts` | +172 tests |
| Proof | `scripts/dev/prove-guards.mjs` → `docs/GUARD_REVERSION_PROOF.md` | reverts each guard, records the raw failure |

The runner is mounted in `server.ts` immediately before the `/api` JSON 404,
with billing, the store and the gateway caller injected — which is what lets
the tests exercise the *real* router against pg-mem and a stub gateway.

## 3. Evidence

```
$ npm test
 Test Files  24 passed | 1 skipped (25)
      Tests  479 passed | 6 skipped (485)

$ TEST_DATABASE_URL="postgresql://postgres@localhost/postgres?host=/tmp/pgdata" npx vitest run
 Test Files  25 passed (25)
      Tests  485 passed (485)

$ npm run lint      # tsc --noEmit
(clean, exit 0)

$ node scripts/dev/prove-guards.mjs
G1..G14 PROVEN
wrote docs/GUARD_REVERSION_PROOF.md — 14/14 proven
```

Baseline at `657b07b` was **313** (307 passed, 6 skipped). The suite is now
**485**: **+172 tests**. The 6 that skip without a database are the
pre-existing `tests/billing-postgres.test.ts`; with a real PostgreSQL they
pass, so 485/485 is achievable and was achieved.

Live verification against the full local stack (real PostgreSQL, the mock
gateway speaking the real `/api/ai` contract, the real Express app):

```
$ curl -s localhost:3000/api/workflows
ok= True count= 36   runnable= 14   anon= 6

$ curl -s localhost:3000/api/workflows/contract-review
contract-review PUBLIC_DEMO 4 architecture private

$ curl -s -X POST localhost:3000/api/workflows/contract-review/run -d @fixture
ok= True | credits= {'perRun': 4, 'charged': 4, 'metered': True} | approval= True
ledger: anon:9d940e47… | spend | -4

$ # same request twice with one idempotency key
call 1: runId= run_muk51y41_o replay= False charged= 4
call 2: runId= run_muk51y41_o replay= True  charged= 0
ledger_rows = 2   net_credits = -8      (one generation, one charge)

$ # balance drained, then run
code= QUOTA_EXHAUSTED upgradeUrl= /checkout creditsRequired= 4 totalRemaining= 0

$ # gateway stopped, then run
code= UPSTREAM_UNAVAILABLE creditsCharged= 0
ledger: spend -4 / refund +4        balance restored: totalRemaining 10

$ # six anonymous demos from one address, limit 5
200 200 200 200 200 429      demo_runs rows = 5

$ curl -s -X POST localhost:3000/api/workflows/contract-review/run -d '{not json'
HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8
{"ok":false,"error":{"code":"INVALID_JSON","message":"Request body must be valid JSON."}}
```

## 4. Definition of done, item by item

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | All 36 items listed by the API with runnability | **DONE** | `count= 36`, `runnable= 14`, `anon= 6` |
| 2 | `GET /api/workflows/:slug` with filters and a 404 contract | **DONE** | `tests/workflow-catalogue.test.ts` (22) |
| 3 | `POST /:slug/run` with the exact 12 steps and failure codes | **DONE** | `tests/workflow-runner.test.ts` (49); codes tabulated in `docs/ROUTE_AUDIT.md` |
| 4 | Reserve-then-refund metering at `creditsPerRun` | **DONE** | ledger `spend -4 / refund +4` above; guards G2, G6 |
| 5 | `POST /:slug/demo` with fixture input and SQL-counted limits | **DONE** | `200×5 → 429`; guards G8, G9, G10 |
| 6 | Manifest fields in both copies + `types.ts`, sync enforced | **DONE** | `tests/workflow-manifest-sync.test.ts` (21); guard G14 |
| 7 | Gateway fixes delivered as a patch list only | **DONE** | `docs/GATEWAY_PATCHES.md`; gateway repo untouched |
| 8 | Route audit with status/body/owner/auth/metered/cause/fix | **DONE** | `docs/ROUTE_AUDIT.md`, P5 section |
| 9 | Per-product fixture → run → validate, plus adversarial tests | **DONE** | `tests/workflow-products.test.ts` (80) |
| 10 | Every guard fails when reverted, raw output reported | **DONE** | `docs/GUARD_REVERSION_PROOF.md`, 14/14 |

Test count went **up**: 313 → 485.

## 5. Bugs found while doing this

Three were real defects in shipped code, found by tests rather than by reading.

**(a) Ten of the fifteen products could never return valid output.**
`validateDemoOutput` treated every declared `items` schema as an object
schema, so a correct `["…"]` for a field declared `items: { type: 'string' }`
was rejected with `must be an object`. Under the new runner that is a
`502 OUTPUT_SCHEMA_VIOLATION` on **every single run** of those products. Fixed
in `catalog/validate.ts`; pinned in both directions by three tests and guard
G13.

**(b) Every `/api` route returned HTML for a malformed body.**
`POST /api/<anything>` with `{not json` made `express.json()` throw, Express's
default error handler ran, and the client received
`text/html; charset=utf-8` — in development including a stack trace. Every
hand-written JSON error contract in the codebase was bypassed by one bad byte.
Fixed by `server/api-error-handler.ts`; guard G12.

**(c) The workflow detail page asserted an assurance level that does not exist.**
`pages/WorkflowDetailPage.tsx` built a synthetic `ProductRecord` with
`status:'PUBLIC_DEMO'`, `risk:'low'` and `validationReport.status:'available'`
hard-coded for *every* workflow. Only 6 of 15 are public demos and most have no
validation report. It now reads the real manifest record.

And one process failure worth recording, because it is the failure mode this
brief is most exposed to: **the first version of the guard-reversion script
reported 14/14 PROVEN when it had proven nothing.** It passed
`--reporter basic`, which vitest 4 does not have, so every run exited non-zero
because the runner never started. The script now performs a control run first —
with the guard in place the named test must match and pass — and parses the
test counts rather than trusting the exit code. On the honest second run, one
guard came back **NOT PROVEN** (the demo fail-closed path, which was
double-covered by a catch-all), and the test was strengthened until the
reversion genuinely failed it.

## 6. Design decisions worth challenging

Full list with evidence and reversibility in `docs/AGENT_DECISIONS.md`
(D-1 … D-12). The three a reviewer should look at first:

* **D-2 / D-7 asymmetry.** `/demo` fails closed without a database; `/run`
  proceeds unmetered. Deliberate: `/run` has a verified identity behind it
  except for the six public products, `/demo` has none, and the unmetered case
  matches the existing behaviour of `server/gateway-proxy.ts`. The response
  never claims to have charged when it has not.
* **D-3: no product uses the gateway's `extraction` task type,** even where the
  name fits, because under `privacy:'private'` that lane collapses to
  quality-2 8B models.
* **D-5: `creditsPerRun = 1 + ceil(maxInputTokens / 8000)`,** published before
  the run. `server/metering.ts` was left alone (it hardcodes a spend of 1) and
  the workflow routes call `Billing.spend` directly, so no already-audited
  behaviour changed.

## 7. What was deliberately not done

* **The gateway repo was not touched.** The two mis-declared context windows —
  `cerebras:gpt-oss-120b` at 8 192 instead of 131 072, `cerebras:llama-8b` at
  8 192 instead of 128 000 — are still wrong upstream. With
  `contextTrimRatio: 0.45` the first of those silently truncates input to
  ≈3 686 tokens. Patch list: `docs/GATEWAY_PATCHES.md`.
* **Three pre-existing unmetered paid-inference routes were reported, not
  fixed:** `POST /api/ai/generate` (`server.ts:343`, no auth at all),
  `POST /api/demo/run` (`server.ts:823`), `POST /api/fullkonk/optimize-prompt`
  (`server.ts:523`, authed but unmetered). They belong to surfaces this brief
  puts out of scope; leaving them out of the audit would have been dishonest.
* **No streaming, no queue, no new infrastructure, no payment-flow changes, no
  deploy.**

## 8. What this does **not** prove

* **No real model has ever run these prompts.** Every test and every live check
  used a stub or the local mock gateway. The *shape* of the output is verified
  against each product's schema; the *quality* is not measured anywhere, and no
  accuracy figure appears in this repo.
* **Nothing is deployed.** `/api/workflows/*` does not exist on
  `www.konkred.xyz` until this branch ships and
  `src/db/migrations/0002_workflows.sql` is applied.
* **Refunds reclassify credits.** A refunded run returns credits as *paid*
  balance even when the spend consumed *trial* balance (pre-existing
  `Billing.grantRefund`). The total is right — 10 before, 10 after, verified
  live — but the split changes.
* **The demo ceiling trades availability for bounded spend.** Once the global
  24 h allowance is gone, legitimate visitors get `429` too.
* **`cloudflare:llama-8b` and `cerebras:qwen3-235b` context windows are
  unverified.** No patch is proposed for them; unknown is recorded as unknown.

## 9. How to run and verify it yourself

```bash
git checkout arena/01a0e3f5-konkred-xyz && npm ci
npm test && npm run lint
node scripts/dev/prove-guards.mjs        # 14/14, regenerates the proof doc

# full local stack
python3 -m venv /tmp/pgvenv && /tmp/pgvenv/bin/pip install pgserver
/tmp/pgvenv/bin/python scripts/dev/start-postgres.py &
export DATABASE_URL="postgresql://postgres@localhost/postgres?host=/tmp/pgdata"
psql "$DATABASE_URL" -f src/db/migrations/0001_billing.sql
psql "$DATABASE_URL" -f src/db/migrations/0002_workflows.sql
node scripts/dev/mock-gateway.mjs 5055 &
KONKRED_GATEWAY_URL=http://127.0.0.1:5055 KONKRED_GATEWAY_API_KEY=local-dev-key \
ANON_SALT=local-dev-salt npm run dev

curl -s localhost:3000/api/workflows | head -c 200
curl -s -X POST localhost:3000/api/workflows/contract-review/demo | head -c 300
```

Deployment runbook (not executed): `docs/PHASE_STATUS.md`, amendment section.

## 10. Recommended next steps, in order

1. **Apply `0002_workflows.sql` and deploy the branch.** Until then this is all
   theory in production. Verify with the two `curl`s in §9 against the live
   host; expect `36`, not `0`.
2. **Apply the two context-window patches to the gateway** (P4-1, P4-2). P4-1
   is corrupting long inputs for anyone who routes to that model today.
3. **Run each of the 15 products once against a real provider** and read the
   output yourself. That is the only way any quality claim becomes sayable —
   and until it is done, no accuracy number should appear on the site.
4. **Meter or retire the three unmetered routes** in §7. `POST /api/ai/generate`
   has no authentication at all.
5. **Decide the trial/paid refund split** (§8) — a one-line change in
   `Billing.grantRefund`, deliberately left alone here.
