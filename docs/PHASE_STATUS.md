# Phase status — honest audit

Date: 2026-09-24. Branch `arena/01a0cb39-konkred-xyz`, 20 commits, 313 tests passing.

**Updated** after completing P7, P8 and the P2/P3 configuration work.

Legend: **DONE** = implemented, tested, verified running · **PARTIAL** = core
built, gaps listed · **NOT STARTED** = no code written.

| Phase | Status | Evidence / what is missing |
|---|---|---|
| **P1** Fix live site | **PARTIAL** | Crash containment, health contract, auth watchdog, FullKonk terminal states: done and verified. **Missing: the per-route audit table** the brief explicitly required (status/body/owner/auth/root cause/fix for every route). Also: fixes are on a branch, **not deployed** — production still returns 500 until someone deploys. |
| **P2** Gateway on public HTTPS | **BLOCKED ON ACCOUNT ACCESS** | Verified the gateway already binds `0.0.0.0`, exposes `/api/health` + `/api/ready`, and implements `/v1/chat/completions` + `/v1/models`. Full deployment sequence written in `docs/DEPLOY_RUNBOOK.md`. **The deploy itself needs your Render/Vercel credentials.** |
| **P3** Provider keys, rotation, failover | **NOT VERIFIED** | The gateway repo has `key-pool.mjs` with cooldown/failover. Exercising it needs real provider keys, which I must not hold. Keys correctly live only on the gateway. |
| **P4** Identity + quota | **DONE** | `fb:`/`telegram:`/`api:`/`anon:` identities, server-derived only; forged headers ignored (tested). PostgreSQL authoritative; verified against a real server. 402 on exhaustion. Redis not used — not needed at this scale. |
| **P5** NowPayments / USDT TRC20 | **PARTIAL** | Signature verification (HMAC-SHA512, recursive sort), idempotent grants, underpayment rejection, order ownership, Persian page, network warning, no key storage: all done and tested. **Untested against the real NowPayments API** — I used a local mock; the real API correctly rejected a fake key, but no live invoice has ever been created. |
| **P6** FullKonk builder flow | **PARTIAL** | Stream events, retry-without-double-charge (idempotency key), loading/error/retry states: done. **GitHub export path validation not re-audited** this session. |
| **P7** Telegram bot | **DONE (pending install)** | `/api/internal/quota/{spend,balance,refund}` implemented, token-authenticated, fail-closed. `integrations/telegram/` has `/buy`, `/usage`, pre-gateway reservation and refund-on-failure. The Python client was **executed against the live API on real PostgreSQL**: 10 allowed, 11th 402, refund works, wrong key 401. Files must be copied into the bot repo (separate repository). |
| **P8** Security audit | **DONE — 2 real vulnerabilities fixed** | `tests/security-audit.test.ts` (17 adversarial tests). **Found and fixed:** (1) export accepted `/etc/passwd`, `.git/config` and `.github/workflows/ci.yml` — the last is code GitHub executes on the owner's repo; (2) bare `cors()` made billing endpoints world-readable. Audited and already sound: SSRF, token injection, secret echo, identity forgery, webhook replay, DOMPurify HTML. |
| **P9** Full test matrix | **PARTIAL** | 297 automated tests, real-PostgreSQL verification, live purchase + paywall + bot-quota journeys, gateway-outage drills, adversarial security suite. **Still not done: real browser / mobile Chrome** (Chromium download blocked in this sandbox) and **no test against live production** (nothing is deployed). |

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
