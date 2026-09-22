# Phase status — honest audit

Date: 2026-09-23. Branch `arena/01a0cb39-konkred-xyz`, 9 commits, 264 tests passing.

Legend: **DONE** = implemented, tested, verified running · **PARTIAL** = core
built, gaps listed · **NOT STARTED** = no code written.

| Phase | Status | Evidence / what is missing |
|---|---|---|
| **P1** Fix live site | **PARTIAL** | Crash containment, health contract, auth watchdog, FullKonk terminal states: done and verified. **Missing: the per-route audit table** the brief explicitly required (status/body/owner/auth/root cause/fix for every route). Also: fixes are on a branch, **not deployed** — production still returns 500 until someone deploys. |
| **P2** Gateway on public HTTPS | **NOT STARTED** | Gateway code exists in `reARbitRA/konkred-AI-ecosystem` with a Render blueprint, but I have not deployed it, cannot set env vars in your Render/Vercel accounts, and `/v1/chat/completions` + `/v1/models` are **not proxied** by this repo. |
| **P3** Provider keys, rotation, failover | **NOT VERIFIED** | The gateway repo has `key-pool.mjs` and cooldown logic. I never ran or tested it. No provider keys exist here (correctly — they belong on the gateway). |
| **P4** Identity + quota | **DONE** | `fb:`/`telegram:`/`api:`/`anon:` identities, server-derived only; forged headers ignored (tested). PostgreSQL authoritative; verified against a real server. 402 on exhaustion. Redis not used — not needed at this scale. |
| **P5** NowPayments / USDT TRC20 | **PARTIAL** | Signature verification (HMAC-SHA512, recursive sort), idempotent grants, underpayment rejection, order ownership, Persian page, network warning, no key storage: all done and tested. **Untested against the real NowPayments API** — I used a local mock; the real API correctly rejected a fake key, but no live invoice has ever been created. |
| **P6** FullKonk builder flow | **PARTIAL** | Stream events, retry-without-double-charge (idempotency key), loading/error/retry states: done. **GitHub export path validation not re-audited** this session. |
| **P7** Telegram bot | **NOT STARTED** | Bot has `/start /help /task /clear /status` only. **`/buy` and `/usage` do not exist**, and the bot does not talk to the billing database — so the "shared quota" criterion is **not actually proven** end to end. |
| **P8** Security audit | **PARTIAL** | Covered by tests: forged/replayed webhooks, quota bypass, forged identity, secret leakage (bundle scan), body-size DoS, order-id probing, constant-time compare. **Not audited: SSRF, prompt injection, path traversal in GitHub export, CORS/CSRF review, unsafe HTML/Markdown rendering.** |
| **P9** Full test matrix | **PARTIAL** | 264 automated tests, real-PostgreSQL verification, live purchase + paywall journeys, gateway-outage drills. **Not done: mobile Chrome, real browser testing** (Playwright Chromium download is network-blocked in this sandbox), and **no test against live production**. |

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
