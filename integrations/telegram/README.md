# Telegram bot quota integration (P7)

The bot lives in a **separate repository** (`reARbitRA/konkred-AI-ecosystem`,
directory `bot/`). These two files are written to be dropped into it, so the bot
spends from the **same balance** as the website.

## Why an HTTP contract instead of direct database access

Giving the bot PostgreSQL credentials would mean a second implementation of the
spend/refund/trial rules, in a second language, that must stay in lockstep
forever — the first divergence is a billing bug. Instead the rules live once in
`server/billing.ts`, and the bot holds only a service token scoped to quota
operations.

## Install

1. Copy `quota_client.py` and `quota_handlers.py` into `bot/`.
2. Add `aiohttp` to `bot/requirements.txt` (usually already present).
3. Register the router in `bot/main.py`, **before** the generic chat router so
   `/buy` and `/usage` are not swallowed by the catch-all message handler:

   ```python
   from quota_handlers import quota_router
   dp.include_router(quota_router)
   dp.include_router(router)          # existing chat router, second
   ```

4. Meter the chat handler in `bot/handlers.py`:

   ```python
   from quota_handlers import refund_quota, reserve_quota

   async def handle_chat_message(message, state, history_mgr):
       ...
       if not await reserve_quota(message):   # shows the paywall itself
           return
       try:
           result = await gateway_client.ask(...)
       except GatewayError:
           await refund_quota(message)        # never charge for our failure
           raise
   ```

5. Set on the bot service:

   ```text
   KONKRED_SITE_URL=https://www.konkred.xyz
   INTERNAL_API_KEY=<identical to the website's INTERNAL_API_KEY>
   ```

## Behaviour

| Situation | Result |
|---|---|
| User has quota | Message proceeds; one message deducted |
| Quota exhausted | Paywall message + "Buy credit" button; gateway never called |
| Generation fails | Quota refunded |
| Quota service down | **Fails open** — the bot still answers |
| Wrong/missing service token | `401`, nothing spent |

## Verified

`quota_client.py` was executed against the live internal API backed by real
PostgreSQL: 10 messages allowed, 11th refused with `402` and `/checkout`,
refund restored one message, a wrong key was rejected with `401`, and an
unreachable service raised `QuotaUnavailable` (which the handler turns into
fail-open). Identity is always `telegram:<id>` from the Telegram update.
