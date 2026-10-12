"""`/buy` and `/usage` commands, plus quota metering for chat messages.

Behaviour matches the website exactly, because both read the same balance:

* Every chat message reserves one unit BEFORE the gateway is called, so a user
  who is out of quota never consumes provider credit.
* Exhaustion shows an upgrade prompt with a button — not an error.
* A failed generation is refunded: users are never charged for our faults.
* If the quota service is unreachable the bot FAILS OPEN and still answers.

Payment deliberately happens on the website rather than in chat: the invoice,
the exact amount and the wrong-network warning must be shown on a page the user
can read carefully before transferring funds.
"""
from __future__ import annotations

import logging
import os

from aiogram import Router, types
from aiogram.filters import Command

from quota_client import QuotaUnavailable, quota_client

logger = logging.getLogger("konkred.quota-handlers")

quota_router = Router(name="quota")

SITE_URL = os.getenv("KONKRED_SITE_URL", "https://www.konkred.xyz").rstrip("/")
CHECKOUT_URL = f"{SITE_URL}/checkout"


def _upgrade_keyboard() -> types.InlineKeyboardMarkup:
    return types.InlineKeyboardMarkup(
        inline_keyboard=[[types.InlineKeyboardButton(text="🛒 Buy credit", url=CHECKOUT_URL)]]
    )


@quota_router.message(Command("usage"))
async def handle_usage(message: types.Message) -> None:
    """Show remaining quota — the same balance konkred.xyz shows."""
    if message.from_user is None:
        return
    try:
        balance = await quota_client.balance(message.from_user.id)
    except QuotaUnavailable as exc:
        logger.warning("usage lookup failed: %s", exc)
        await message.answer("⚠️ The quota service is temporarily unavailable. Please try again shortly.")
        return

    await message.answer(
        "📊 *Your usage*\n\n"
        f"• Plan: `{balance.plan}`\n"
        f"• Free trial messages left: `{balance.trial_remaining}`\n"
        f"• Purchased messages left: `{balance.paid_remaining}`\n"
        f"• *Total remaining: {balance.total_remaining}*\n\n"
        "This is the same balance used on konkred.xyz.",
        reply_markup=_upgrade_keyboard() if balance.exhausted else None,
    )


@quota_router.message(Command("buy"))
async def handle_buy(message: types.Message) -> None:
    """Link to the checkout page."""
    if message.from_user is None:
        return
    try:
        balance = await quota_client.balance(message.from_user.id)
        remaining = f"\n\nYou currently have `{balance.total_remaining}` messages left."
    except QuotaUnavailable:
        remaining = ""  # never block the purchase path on a lookup failure

    await message.answer(
        "🛒 *Buy Konkred credit*\n\n"
        "Packages are paid in *USDT on the TRON (TRC20) network*.\n\n"
        "⚠️ *Important:* send funds only on the network shown on the invoice page. "
        "Transfers on the wrong network cannot be recovered."
        f"{remaining}",
        reply_markup=_upgrade_keyboard(),
    )


async def reserve_quota(message: types.Message) -> bool:
    """Reserve one message before calling the gateway.

    Returns True when the bot should proceed. On exhaustion this sends the
    paywall itself and returns False.
    """
    if message.from_user is None:
        return False
    try:
        result = await quota_client.spend(
            message.from_user.id, 1, reference=f"tg:{message.message_id}"
        )
    except QuotaUnavailable as exc:
        # FAIL OPEN — a billing outage must not take the bot offline.
        logger.warning("quota check unavailable, allowing message: %s", exc)
        return True

    if not result.allowed:
        remaining = result.balance.total_remaining if result.balance else 0
        await message.answer(
            "⚠️ *Your free quota is finished.*\n\n"
            f"Remaining messages: `{remaining}`\n\n"
            "Buy a package to continue. Payment is in USDT on the TRON (TRC20) network.\n"
            "Your website and Telegram credit are the same balance.",
            reply_markup=_upgrade_keyboard(),
        )
        return False
    return True


async def refund_quota(message: types.Message) -> None:
    """Refund after a failed generation so the user is not charged."""
    if message.from_user is None:
        return
    await quota_client.refund(message.from_user.id, 1, reference=f"tg:{message.message_id}")
