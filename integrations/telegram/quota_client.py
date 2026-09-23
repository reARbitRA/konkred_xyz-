"""
Quota client for the Konkred Telegram bot.

Drop this into the bot service (reARbitRA/konkred-AI-ecosystem, `bot/`) and the
bot spends from exactly the same balance as the website, because both talk to
one implementation of the billing rules (server/billing.ts in konkred_xyz-).

Why HTTP rather than direct PostgreSQL access from the bot:
  * The spend/refund/trial rules exist once. A second implementation in Python
    would have to be kept in lockstep with the TypeScript one forever, and the
    first divergence is a billing bug.
  * The bot never holds database credentials — only a service token scoped to
    quota operations.

Configuration (bot environment):
    KONKRED_SITE_URL=https://www.konkred.xyz
    INTERNAL_API_KEY=<same value as the website's INTERNAL_API_KEY>

Identity: always `telegram:<user_id>` taken from the Telegram update itself,
never from user-supplied text, so a user cannot spend another account's quota.
"""
from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from typing import Optional

import aiohttp

logger = logging.getLogger("konkred-bot.quota")

SITE_URL = os.getenv("KONKRED_SITE_URL", "").rstrip("/")
INTERNAL_KEY = os.getenv("INTERNAL_API_KEY", "")
TIMEOUT_SECONDS = 8


class QuotaUnavailable(RuntimeError):
    """The quota service could not be reached or is not configured."""


@dataclass(frozen=True)
class Balance:
    trial_remaining: int
    paid_remaining: int
    total_remaining: int
    plan: str

    @property
    def exhausted(self) -> bool:
        return self.total_remaining <= 0


@dataclass(frozen=True)
class SpendResult:
    allowed: bool
    balance: Optional[Balance]
    upgrade_url: str = "/checkout"


def identity_for(user_id: int) -> str:
    """Canonical identity for a Telegram user. Derived, never user-supplied."""
    return f"telegram:{int(user_id)}"


class QuotaClient:
    """Thin async client over the website's /api/internal/quota/* contract."""

    def __init__(self, site_url: str = SITE_URL, internal_key: str = INTERNAL_KEY) -> None:
        self._base = site_url.rstrip("/")
        self._key = internal_key

    @property
    def configured(self) -> bool:
        return bool(self._base and self._key)

    async def _post(self, path: str, payload: dict) -> tuple[int, dict]:
        if not self.configured:
            raise QuotaUnavailable("KONKRED_SITE_URL / INTERNAL_API_KEY are not set")
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SECONDS)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    f"{self._base}{path}",
                    json=payload,
                    headers={"x-internal-key": self._key},
                ) as response:
                    body = await response.json(content_type=None)
                    return response.status, (body or {})
        except asyncio.TimeoutError as exc:
            raise QuotaUnavailable("quota service timed out") from exc
        except aiohttp.ClientError as exc:
            raise QuotaUnavailable(f"quota service unreachable: {type(exc).__name__}") from exc

    async def _get(self, path: str) -> tuple[int, dict]:
        if not self.configured:
            raise QuotaUnavailable("KONKRED_SITE_URL / INTERNAL_API_KEY are not set")
        timeout = aiohttp.ClientTimeout(total=TIMEOUT_SECONDS)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(
                    f"{self._base}{path}",
                    headers={"x-internal-key": self._key},
                ) as response:
                    body = await response.json(content_type=None)
                    return response.status, (body or {})
        except asyncio.TimeoutError as exc:
            raise QuotaUnavailable("quota service timed out") from exc
        except aiohttp.ClientError as exc:
            raise QuotaUnavailable(f"quota service unreachable: {type(exc).__name__}") from exc

    @staticmethod
    def _balance_from(body: dict) -> Balance:
        return Balance(
            trial_remaining=int(body.get("trialRemaining") or 0),
            paid_remaining=int(body.get("paidRemaining") or 0),
            total_remaining=int(body.get("totalRemaining") or 0),
            plan=str(body.get("plan") or "free"),
        )

    async def balance(self, user_id: int) -> Balance:
        status, body = await self._get(
            f"/api/internal/quota/balance?identity={identity_for(user_id)}"
        )
        if status != 200:
            raise QuotaUnavailable(f"balance failed with HTTP {status}")
        return self._balance_from(body)

    async def spend(self, user_id: int, amount: int = 1, reference: str | None = None) -> SpendResult:
        """Consume quota. HTTP 402 means the user must buy more."""
        status, body = await self._post(
            "/api/internal/quota/spend",
            {"identity": identity_for(user_id), "amount": amount,
             "surface": "telegram", "reference": reference},
        )
        if status == 402:
            return SpendResult(False, self._balance_from(body), str(body.get("upgradeUrl") or "/checkout"))
        if status != 200:
            raise QuotaUnavailable(f"spend failed with HTTP {status}")
        return SpendResult(True, self._balance_from(body))

    async def refund(self, user_id: int, amount: int = 1, reference: str | None = None) -> None:
        """Return quota after a failed generation, so users are never charged
        for our failures. Best-effort: a refund failure must not break the reply."""
        try:
            await self._post(
                "/api/internal/quota/refund",
                {"identity": identity_for(user_id), "amount": amount, "reference": reference},
            )
        except QuotaUnavailable as exc:
            logger.warning("refund failed for user=%s: %s", user_id, exc)


quota_client = QuotaClient()
