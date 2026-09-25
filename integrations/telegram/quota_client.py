"""Quota client — makes the bot share ONE balance with the website.

The website (`reARbitRA/konkred_xyz-`) owns the billing database and exposes a
narrow service-to-service contract:

    POST /api/internal/quota/spend    {identity, amount, surface, reference}
    GET  /api/internal/quota/balance?identity=telegram:<id>
    POST /api/internal/quota/refund   {identity, amount, reference}

Why HTTP rather than giving this bot PostgreSQL credentials: the spend/trial/
refund rules would then exist twice, in two languages, and the first divergence
between them is a billing bug. Here the rules live once and the bot holds only
a service token scoped to quota operations.

Uses `httpx`, already a dependency of this service — no new package.

Configuration:
    KONKRED_SITE_URL=https://www.konkred.xyz
    INTERNAL_API_KEY=<identical to the website's INTERNAL_API_KEY>

Identity is always `telegram:<user_id>`, taken from the Telegram update itself
and never from user-controlled text, so nobody can spend another account's
quota by typing an identity.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger("konkred.quota")

TIMEOUT_SECONDS = 8.0


class QuotaUnavailable(RuntimeError):
    """The quota service is unreachable, unauthenticated or misconfigured.

    Callers treat this as "allow the message through" (fail open): losing
    revenue on a few messages is better than an outage of the whole bot.
    """


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
    def __init__(self, site_url: Optional[str] = None, internal_key: Optional[str] = None) -> None:
        self._base = (site_url if site_url is not None else os.getenv("KONKRED_SITE_URL", "")).rstrip("/")
        self._key = internal_key if internal_key is not None else os.getenv("INTERNAL_API_KEY", "")

    @property
    def configured(self) -> bool:
        return bool(self._base and self._key)

    async def _request(self, method: str, path: str, payload: Optional[dict] = None) -> dict:
        if not self.configured:
            raise QuotaUnavailable("KONKRED_SITE_URL / INTERNAL_API_KEY are not set")
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
                response = await client.request(
                    method,
                    f"{self._base}{path}",
                    json=payload,
                    headers={"x-internal-key": self._key},
                )
        except httpx.TimeoutException as exc:
            raise QuotaUnavailable("quota service timed out") from exc
        except httpx.HTTPError as exc:
            raise QuotaUnavailable(f"quota service unreachable: {type(exc).__name__}") from exc

        try:
            body = response.json()
        except ValueError:
            body = {}

        # 402 is a normal business outcome (out of quota), not a transport error.
        if response.status_code not in (200, 402):
            raise QuotaUnavailable(f"{path} returned HTTP {response.status_code}")
        return {"_status": response.status_code, **(body if isinstance(body, dict) else {})}

    @staticmethod
    def _balance_from(body: dict) -> Balance:
        return Balance(
            trial_remaining=int(body.get("trialRemaining") or 0),
            paid_remaining=int(body.get("paidRemaining") or 0),
            total_remaining=int(body.get("totalRemaining") or 0),
            plan=str(body.get("plan") or "free"),
        )

    async def balance(self, user_id: int) -> Balance:
        body = await self._request("GET", f"/api/internal/quota/balance?identity={identity_for(user_id)}")
        return self._balance_from(body)

    async def spend(self, user_id: int, amount: int = 1, reference: Optional[str] = None) -> SpendResult:
        body = await self._request(
            "POST",
            "/api/internal/quota/spend",
            {
                "identity": identity_for(user_id),
                "amount": amount,
                "surface": "telegram",
                "reference": reference,
            },
        )
        if body.get("_status") == 402:
            return SpendResult(False, self._balance_from(body), str(body.get("upgradeUrl") or "/checkout"))
        return SpendResult(True, self._balance_from(body))

    async def refund(self, user_id: int, amount: int = 1, reference: Optional[str] = None) -> None:
        """Return quota after a failed generation.

        Best-effort by design: a refund failure is logged but never raised, so
        it cannot turn a gateway error into a second, confusing error for the
        user. The ledger records refunds separately, so a missed one is
        recoverable from the audit trail.
        """
        try:
            await self._request(
                "POST",
                "/api/internal/quota/refund",
                {"identity": identity_for(user_id), "amount": amount, "reference": reference},
            )
        except QuotaUnavailable as exc:
            logger.warning("refund failed for user=%s: %s", user_id, exc)


quota_client = QuotaClient()
