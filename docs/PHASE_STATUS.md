# Phase status — honest audit

Date: 2026-09-24, amended 2026-09-27. Branch `arena/01a0e3f5-konkred-xyz`.
Test count at the time of the original audit: 313. Current: **485**
(`npm test`; all 485 pass with `TEST_DATABASE_URL` set, 6 skip without it).

**Updated** after completing P7, P8 and the P2/P3 configuration work.

Legend: **DONE** = implemented, tested, verified running · **PARTIAL** = core
built, gaps listed · **NOT STARTED** = no code written.

| Phase | Status | Evidence / what is missing |
|---|---|---|
| **P1** Fix live site | **PARTIAL** | Crash containment, health contract, auth watchdog, FullKonk terminal states: done and verified. ~~Missing: the per-route audit table~~ — **the audit table now exists** in `docs/ROUTE_AUDIT.md`, extended 2026-09-27 with a `metered` column and the workflow-execution surface. Still: fixes are on a branch, **not deployed** — production still returns 500 until someone deploys. |
| **P2** Gateway on public HTTPS | **BLOCKED ON ACCOUNT ACCESS** | Verified the gateway already binds `0.0.0.0`, exposes `/api/health` + `/api/ready`, and implements `/v1/chat/completions` + `/v1/models`. Full deployment sequence written in `docs/DEPLOY_RUNBOOK.md`. **The deploy itself needs your Render/Vercel credentials.** |
| **P3** Provider keys, rotation, failover | **NOT VERIFIED** | The gateway repo has `key-pool.mjs` with cooldown/failover. Exercising it needs real provider keys, which I must not hold. Keys correctly live only on the gateway. |
| **P4** Identity + quota | **DONE** | `fb:`/`telegram:`/`api:`/`anon:` identities, server-derived only; forged headers ignored (tested). PostgreSQL authoritative; verified against a real server. 402 on exhaustion. Redis not used — not needed at this scale. |
| **P5** NowPayments / USDT TRC20 | **PARTIAL** | Signature verification (HMAC-SHA512, recursive sort), idempotent grants, underpayment rejection, order ownership, Persian page, network warning, no key storage: all done and tested. **Untested against the real NowPayments API** — I used a local mock; the real API correctly rejected a fake key, but no live invoice has ever been created. |
| **P6** FullKonk builder flow | **PARTIAL** | Stream events, retry-without-double-charge (idempotency key), loading/error/retry states: done. **GitHub export path validation not re-audited** this session. |
| **P7** Telegram bot | **DONE (pending install)** | `/api/internal/quota/{spend,balance,refund}` implemented, token-authenticated, fail-closed. `integrations/telegram/` has `/buy`, `/usage`, pre-gateway reservation and refund-on-failure. The Python client was **executed against the live API on real PostgreSQL**: 10 allowed, 11th 402, refund works, wrong key 401. Files must be copied into the bot repo (separate repository). |
| **P8** Security audit | **DONE — 2 real vulnerabilities fixed** | `tests/security-audit.test.ts` (17 adversarial tests). **Found and fixed:** (1) export accepted `/etc/passwd`, `.git/config` and `.github/workflows/ci.yml` — the last is code GitHub executes on the owner's repo; (2) bare `cors()` made billing endpoints world-readable. Audited and already sound: SSRF, token injection, secret echo, identity forgery, webhook replay, DOMPurify HTML. |
| **P9** Full test matrix | **PARTIAL** | 485 automated tests (297 at the time of writing), real-PostgreSQL verification, live purchase + paywall + bot-quota journeys, gateway-outage drills, adversarial security suite. **Still not done: real browser / mobile Chrome** (Chromium download blocked in this sandbox) and **no test against live production** (nothing is deployed). |

## Second audit pass — three more real defects

Re-auditing after being asked whether this was really the maximum found three
things that reading the code had missed:

1. **Quota bypass on `/api/ai`.** Only `/api/fullkonk/generate` was metered.
   `/api/ai` performs the same paid inference, so anyone who hit the 402
   paywall could POST there instead and continue free. The paywall was
   effectively optional. Fixed; both routes are metered, both refund on failure.
2. **Unthrottled invoice creation.** `/api/payments/create` had no rate limit —
   spammable to fill the database (fatal on a 0.5 GB free tier) and to hammer
   the payment provider. Now 10/identity/hour, counted in SQL because
   serverless instances share no memory.
3. **Database TLS verification was disabled.** `rejectUnauthorized: false` on a
   connection carrying payment records. Now verified by default.

Also closed the largest testing gap: the "no infinite loading" requirement had
**zero component tests**. There are now 8, and they were checked against a
deliberately reverted fix to confirm they actually fail without it.

## What changed in the earlier round

* **P7 complete:** shared quota across website and Telegram, proven live.
* **P8 complete:** two genuine vulnerabilities found by writing the audit as
  attacks rather than reading code, and fixed.
* **P2/P3:** everything that does not need your credentials is done and
  documented in `docs/DEPLOY_RUNBOOK.md`.

## The three things that actually block revenue

1. **Nothing is deployed.** Every fix is on a branch. `konkred.xyz` still
   returns `500 FUNCTION_INVOCATION_FAILED`. This needs a Vercel deploy plus
   `DATABASE_URL` and the NowPayments variables.
2. **The gateway is not running.** Until `KONKRED_GATEWAY_URL` points at a live
   host, AI generation returns a controlled "not configured" error.
3. **No real payment has ever completed.** The flow is correct against a mock;
   it has never moved actual USDT.

## What I cannot do from here

- Deploy to your Vercel/Render accounts or set secrets in them.
- Create a real NowPayments merchant account or test a real invoice.
- Run a real browser (Chromium download is blocked in this sandbox).
- Push to the gateway/bot repo's main branch (this session is pinned to this
  repo's branch).

---

# Amendment — 2026-09-27: workflow execution

The audit above predates the work that made the catalogue executable. That
work is tracked as its own phases; this section is the honest status of it.

Legend as above. Nothing here has been deployed.

| Phase | Status | Evidence / what is missing |
|---|---|---|
| **W0** Recon | **DONE** | `docs/RECON_REPORT.md` — all 10 questions with file paths and verbatim excerpts, including the gateway repo read read-only over `gh api`. |
| **W1** Read-only routes | **DONE** | `GET /api/workflows` returns all **36** items with `runnable`/`runnableForAnon`; `?category=` and `?q=` work; `GET /api/workflows/:slug` resolves both slug forms and 404s with `PRODUCT_NOT_FOUND`. 22 tests; verified live with `curl` against the local stack. |
| **W2** Runner | **DONE** | `POST /:slug/run` implements the 12-step sequence with every mandated failure code; reserve-then-refund; `{ok,data}` / `{ok,error}` envelope. `POST /:slug/demo` runs the shipped fixture anonymously with SQL-backed per-IP and global ceilings. 49 tests; the refund, replay, paywall and ceiling paths were each re-verified live against real PostgreSQL. |
| **W3** Manifest additions | **DONE** | 7 fields per product in **both** manifest copies and `catalog/types.ts`, kept in sync by `tests/workflow-manifest-sync.test.ts`, which parses the interface out of the source and compares both directions. |
| **W4** Fixes | **PARTIAL — deliberately** | Chunk-then-synthesise, the input-size refusal, the privacy reality check and the demo abuse limits are implemented and tested here. The **gateway context-window patches are a patch list only** (`docs/GATEWAY_PATCHES.md`): that repository is read-only for this work, so the two mis-declared context windows are still wrong upstream and `cerebras:gpt-oss-120b` still silently truncates input for anyone who routes to it. This repo defends itself by refusing oversized input. |
| **W5** Route audit | **DONE** | `docs/ROUTE_AUDIT.md`, P5 section, including three pre-existing **unmetered** paid-inference routes that were found by doing the audit and are reported, not fixed (out of scope). |
| **W6** Proof | **DONE** | 80 per-product tests (fixture → run → validate, for all 15). `node scripts/dev/prove-guards.mjs` reverts each of 14 guards and records the raw failure: **14/14 proven**, each with a passing control run. |

## What this does not prove

* **No real model has ever run these prompts.** Every test and every live check
  used a stub or the local mock gateway. Output *shape* is verified; output
  *quality* is not, and no accuracy number appears anywhere in this repo.
* **Nothing is deployed.** `/api/workflows/*` does not exist on
  `www.konkred.xyz` until this branch ships.
* **The refund reclassifies credits.** A refunded run returns the credits as
  *paid* balance even when the spend consumed *trial* balance
  (`Billing.grantRefund`, pre-existing). The total is correct — verified live:
  10 before, 10 after — but the split changes. Changing it would mean editing
  the already-DONE billing core, which is out of scope.
* **Demo abuse limits are per-deployment, not per-person.** An attacker with
  many IPs is stopped by the global 24 h ceiling, which also denies legitimate
  visitors for the rest of the window. That is the deliberate trade: bounded
  spend over unbounded availability.

## Deployment steps added by this work

```bash
# 1. apply the new migration (idempotent; safe to re-run)
psql "$DATABASE_URL" -f src/db/migrations/0002_workflows.sql

# 2. optional environment (defaults shown; both are counted in SQL)
WORKFLOW_DEMO_IP_HOURLY_MAX=5
WORKFLOW_DEMO_DAILY_MAX=200

# 3. verify after deploy — expect 36, not 0
curl -s https://www.konkred.xyz/api/workflows | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["count"])'

# 4. verify the anonymous demo path end to end
curl -s -X POST https://www.konkred.xyz/api/workflows/contract-review/demo | head -c 300
```

Without step 1 the catalogue routes still work, `/run` still works, and
`/demo` fails closed with `503 DEMO_UNAVAILABLE`. That is the intended
degradation, not an outage.
