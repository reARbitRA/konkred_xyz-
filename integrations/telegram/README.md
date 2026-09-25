# Telegram bot — shared quota (P7)

The bot lives in a **separate repository**: `reARbitRA/konkred-AI-ecosystem`.
My GitHub token is scoped to `konkred_xyz-` only, so I could not push there or
open the PR. The work is complete and tested — it just needs you to apply it.

## Option A — apply the ready-made patch (recommended, ~30 seconds)

```bash
git clone https://github.com/reARbitRA/konkred-AI-ecosystem
cd konkred-AI-ecosystem
git checkout -b feat/shared-quota-with-website
git am < /path/to/0001-shared-quota.patch
git push -u origin feat/shared-quota-with-website
```

The patch contains the full commit (message included) and touches six files:

| File | Change |
|---|---|
| `bot/quota_client.py` | **new** — client for the website's quota contract |
| `bot/quota_handlers.py` | **new** — `/buy`, `/usage`, reserve + refund |
| `bot/tests/test_quota.py` | **new** — 9 tests |
| `bot/main.py` | registers `quota_router` before the chat router |
| `bot/handlers.py` | reserves quota before the gateway; refunds on failure |
| `render.yaml` | adds `KONKRED_SITE_URL`, `INTERNAL_API_KEY` |

## Option B — copy the files manually

Copy `quota_client.py`, `quota_handlers.py` into `bot/` and `test_quota.py`
into `bot/tests/`, then make three edits:

1. **`bot/main.py`** — register the router *before* the chat router, otherwise
   the catch-all text handler swallows `/buy` and `/usage`:

   ```python
   from quota_handlers import quota_router
   ...
   dp.include_router(quota_router)
   dp.include_router(router)
   ```

2. **`bot/handlers.py`** — meter the chat handler:

   ```python
   from quota_handlers import refund_quota, reserve_quota

   # at the top of handle_chat_message, before calling the gateway:
   if not await reserve_quota(message):
       return
   ```

3. **`bot/handlers.py`** — refund on every failure path: `GatewayError`, the
   generic `except Exception`, and a 200 with empty content.

## Environment (bot service)

```text
KONKRED_SITE_URL=https://www.konkred.xyz
INTERNAL_API_KEY=<identical to the website's INTERNAL_API_KEY>
```

Without these the bot still runs, but unmetered — it fails open by design.

## Behaviour

| Situation | Result |
|---|---|
| User has quota | Message proceeds; one unit deducted |
| Quota exhausted | Paywall + "Buy credit" button; gateway never called |
| Generation fails | Quota refunded |
| Quota service down | **Fails open** — bot still answers |
| Wrong/missing token | `401`, nothing spent |

## Why HTTP instead of giving the bot database access

Direct PostgreSQL access would duplicate the spend/trial/refund rules in a
second language, and the first divergence between the two implementations is a
billing bug. The rules live once, in `server/billing.ts`; the bot holds only a
service token scoped to quota operations and never sees database credentials.

## Verification performed

* `scripts/check_python_imports.py` → OK, including `main.py` loading.
* Bot test suite → **97 passed** (88 pre-existing + 9 new). No regressions.
* `quota_client.py` was additionally executed against the **live** internal API
  backed by real PostgreSQL: 10 messages allowed, 11th refused with `402` and
  `/checkout`, refund restored one message, a wrong key was rejected with
  `401`, and an unreachable service raised `QuotaUnavailable`.
* Uses `httpx`, already pinned in `bot/requirements.txt` — no new dependency.
