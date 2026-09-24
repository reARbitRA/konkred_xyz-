# Deployment runbook — every step, in order

This is the complete sequence to take the current branch to a working,
monetized production system. Nothing here is optional and nothing is implied.

Everything below is code that exists and is tested on branch
`arena/01a0cb39-konkred-xyz`. The steps requiring account access are marked
**[you]** — I cannot perform them, because they need credentials to your
Vercel, Render, NowPayments and database accounts.

---

## Where each responsibility lives

A correction to the original brief is worth stating, because it changes where
two of the listed variables belong:

| Concern | Service | Why |
|---|---|---|
| Provider keys, rotation, failover, `/v1/*` | **Gateway** (`konkred-AI-ecosystem`) | Keys must never leave the gateway |
| Quota, payments, trials, identity | **Website** (`konkred_xyz-`, this repo) | PostgreSQL and the payment webhook live here |

The brief listed `TRIAL_ENABLED`, `TRIAL_MESSAGES`, `PAID_MESSAGES` and
`TRON_USDT_ADDRESS` as gateway variables. They are implemented **here**
instead, because this is the service that owns the database, the paywall and
the NowPayments webhook. Putting them on the gateway would split billing across
two services with no shared transaction. Set them on the website.

---

## Step 1 — PostgreSQL **[you]**

### Which free provider

**Use Neon.** It is the only free tier that fits a billing database:

| Provider | Free tier | Verdict for THIS use case |
|---|---|---|
| **Neon** | 0.5 GB, 100 CU-hours/mo, permanent, no card | **Recommended.** Built-in PgBouncer pooling, which serverless needs. |
| Supabase | 500 MB, no card | Pauses after **1 week idle**. A payment webhook arriving during a pause fails. |
| Render | 1 GB | **Database is DELETED 30 days after creation.** Never use for payment records. |
| Railway | trial credit only | Not actually free; needs a card. |

Two settings that matter:

1. **Region: US East (N. Virginia).** Your Vercel functions run in `iad1`
   (visible in the original error IDs). The latency that matters is
   function→database, not you→database, so do *not* pick Frankfurt.
2. **Use the POOLED connection string** — the hostname containing `-pooler`.
   Each serverless invocation can open its own connection, and the unpooled
   endpoint will exhaust Postgres connection limits under load.

Free tiers have no backups. Once real money flows, move to a paid tier — the
`usage_ledger` table is append-only so history is auditable, but an audit trail
is not a backup.

```bash
psql "$DATABASE_URL" -f src/db/migrations/0001_billing.sql
```

The migration is idempotent — re-running it is safe. Verify:

```bash
psql "$DATABASE_URL" -c '\dt'
# expect: accounts, payments, plans, usage_ledger, webhook_events
```

## Step 2 — Deploy the gateway **[you]**

Repository: `reARbitRA/konkred-AI-ecosystem`. It already ships a Render
blueprint that binds `0.0.0.0`, exposes `/api/health` and `/api/ready`, and
implements `/v1/chat/completions` and `/v1/models`.

```text
FULLKONK_KEY=<generate: openssl rand -hex 32>
ADMIN_KEY=<generate: openssl rand -hex 32>
USERS_JSON=[{"key":"fullkonk-server-key","userId":"fullkonk","tier":"trusted"}]
GROQ_API_KEY=...          # at least one provider
CEREBRAS_API_KEY=...
GEMINI_API_KEY=...
```

Confirm before continuing — this must return HTTP 200:

```bash
curl -sS https://<your-gateway>/api/health
```

## Step 3 — Generate the website secrets **[you]**

```bash
openssl rand -hex 32   # ANON_SALT
openssl rand -hex 32   # INTERNAL_API_KEY
```

## Step 4 — NowPayments **[you]**

1. Create a merchant account and add your USDT TRC20 payout address
   (`TKffomaLtPS5FqruZwFrHYu5MdtDiqbEFT`).
2. Create an **API key**, and in *Settings → IPN* create an **IPN secret**.
   Without an IPN secret NowPayments does not send callbacks at all.
3. Set the IPN callback URL to
   `https://www.konkred.xyz/api/payments/nowpayments/webhook`.

## Step 5 — Vercel environment **[you]**

Set for **Production and Preview**. None of these may be `VITE_`-prefixed —
that would compile them into browser JavaScript.

```text
# Gateway
KONKRED_GATEWAY_URL=https://<your-gateway>
KONKRED_GATEWAY_API_KEY=fullkonk-server-key
FULLKONK_KEY=<same value as the gateway's FULLKONK_KEY>

# Database
DATABASE_URL=postgres://...

# Identity + bot
ANON_SALT=<from step 3>
INTERNAL_API_KEY=<from step 3>
FIREBASE_PROJECT_ID=aerobic-effect-wfbwx

# Payments
NOWPAYMENTS_API_KEY=<from step 4>
NOWPAYMENTS_IPN_SECRET=<from step 4>
NOWPAYMENTS_IPN_CALLBACK_URL=https://www.konkred.xyz/api/payments/nowpayments/webhook

# Trials
TRIAL_ENABLED=true
TRIAL_MESSAGES=10
DAILY_MODE=false
```

Database TLS certificates are verified by default. Every managed provider above
presents a publicly-trusted certificate, so nothing extra is needed. The
`DATABASE_SSL_INSECURE=true` escape hatch exists only for a self-signed
certificate on a private network and must never be set for a database reachable
over the internet.

## Step 6 — Deploy the website **[you]**

Merge this branch and deploy **with the build cache cleared** (the API bundle
`lib/fullkonk-server.cjs` is a build artifact).

## Step 7 — Verify production

```bash
SITE=https://www.konkred.xyz

# Liveness: 200 with all three `configured` flags true.
curl -sS $SITE/api/health | jq

# Readiness: 200 means the gateway is reachable.
curl -sS $SITE/api/ready | jq

# No API route may return HTML.
for p in /api/health /api/ready /api/quota /api/payments/plans \
         /api/fullkonk/providers /api/nope; do
  printf '%-30s ' "$p"; curl -sS "$SITE$p" | head -c 60; echo
done

# An unsigned webhook MUST be rejected (expect 401).
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'content-type: application/json' \
  -d '{"order_id":"x","payment_status":"finished"}' \
  $SITE/api/payments/nowpayments/webhook

# The internal quota API must reject a browser (expect 401).
curl -sS -o /dev/null -w '%{http_code}\n' \
  "$SITE/api/internal/quota/balance?identity=telegram:1"

# Billing routes must NOT be cross-origin readable (expect no ACAO header).
curl -sS -i -H 'Origin: https://evil.example' $SITE/api/quota | grep -i access-control
```

## Step 8 — Telegram bot **[you]**

Copy `integrations/telegram/quota_client.py` and `quota_handlers.py` into the
bot repo's `bot/` directory and follow `integrations/telegram/README.md`. Set on
the bot service:

```text
KONKRED_SITE_URL=https://www.konkred.xyz
INTERNAL_API_KEY=<the same value as the website's>
```

Then in Telegram: `/usage` shows a balance, `/buy` links to checkout, and the
11th free message shows the paywall.

## Step 9 — First real payment

Buy the smallest plan yourself and confirm:

1. `/checkout` shows the invoice with the TRON (TRC20) network warning.
2. After the transfer, `/api/payments/status?orderId=...` becomes `confirmed`.
3. `/api/quota` shows the purchased messages.
4. The NowPayments dashboard shows exactly **one** IPN delivery marked 200.

**This has never been done.** Every other guarantee in this repo is verified by
tests against real PostgreSQL; this one requires real funds.

---

## Rollback

If `/api/health` is not 200 after deploying, revert the Vercel deployment. The
health route is deliberately independent of the database, the gateway and the
legacy bundle, so a 200 there means the function itself is sound and the fault
is in configuration.

## Known gaps

* No real payment has completed end to end (step 9).
* Provider rotation/failover in the gateway is implemented but was never
  executed by me — it needs real provider keys to exercise.
* No real-browser or mobile testing: the sandbox blocks the Chromium download.
