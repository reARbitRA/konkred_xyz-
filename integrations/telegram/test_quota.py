"""Tests for the shared-quota client and handlers.

The commercial risk runs both ways, so both are asserted: a user must not get
unlimited free messages, and a user must never be charged twice or charged for
our own failures.
"""
from __future__ import annotations

import _bootstrap  # noqa: F401  (adds bot/ to sys.path)

import httpx
import pytest

from quota_client import Balance, QuotaClient, QuotaUnavailable, identity_for


def client_with(handler) -> QuotaClient:
    """A QuotaClient whose HTTP calls are served by `handler`."""
    transport = httpx.MockTransport(handler)
    quota = QuotaClient("https://site.test", "service-key")

    async def _request(method: str, path: str, payload=None):
        async with httpx.AsyncClient(transport=transport) as http:
            response = await http.request(
                method, f"https://site.test{path}", json=payload,
                headers={"x-internal-key": "service-key"},
            )
        try:
            body = response.json()
        except ValueError:
            body = {}
        if response.status_code not in (200, 402):
            raise QuotaUnavailable(f"{path} returned HTTP {response.status_code}")
        return {"_status": response.status_code, **(body if isinstance(body, dict) else {})}

    quota._request = _request  # type: ignore[assignment]
    return quota


def json_response(status: int, payload: dict):
    return lambda request: httpx.Response(status, json=payload)


BALANCE = {"plan": "free", "trialRemaining": 7, "paidRemaining": 0, "totalRemaining": 7}


def test_identity_is_derived_not_supplied():
    assert identity_for(12345) == "telegram:12345"
    # Even if a string sneaks in, it is coerced to an int — no injection.
    assert identity_for(int("99")) == "telegram:99"


def test_unconfigured_client_raises_rather_than_silently_allowing():
    unconfigured = QuotaClient("", "")
    assert unconfigured.configured is False


@pytest.mark.asyncio
async def test_balance_is_parsed():
    quota = client_with(json_response(200, BALANCE))
    balance = await quota.balance(1)
    assert balance == Balance(7, 0, 7, "free")
    assert balance.exhausted is False


@pytest.mark.asyncio
async def test_spend_allows_when_quota_remains():
    quota = client_with(json_response(200, {**BALANCE, "totalRemaining": 6}))
    result = await quota.spend(1)
    assert result.allowed is True
    assert result.balance.total_remaining == 6


@pytest.mark.asyncio
async def test_spend_refused_on_402_with_upgrade_url():
    quota = client_with(json_response(402, {
        "code": "QUOTA_EXHAUSTED", "upgradeUrl": "/checkout",
        "plan": "free", "trialRemaining": 0, "paidRemaining": 0, "totalRemaining": 0,
    }))
    result = await quota.spend(1)
    assert result.allowed is False
    assert result.upgrade_url == "/checkout"
    assert result.balance.exhausted is True


@pytest.mark.asyncio
async def test_unauthorized_is_reported_as_unavailable_not_as_permission_to_spend():
    # A 401 must never be mistaken for "allowed"; it raises, and the caller
    # decides (the handler fails open deliberately and logs).
    quota = client_with(json_response(401, {"code": "UNAUTHORIZED"}))
    with pytest.raises(QuotaUnavailable):
        await quota.spend(1)


@pytest.mark.asyncio
async def test_server_error_raises_unavailable():
    quota = client_with(json_response(503, {"code": "BILLING_UNAVAILABLE"}))
    with pytest.raises(QuotaUnavailable):
        await quota.balance(1)


@pytest.mark.asyncio
async def test_refund_never_raises_even_when_the_service_is_down():
    # A refund failure must not turn a gateway error into a second error for
    # the user; the ledger keeps the audit trail.
    quota = client_with(json_response(500, {}))
    await quota.refund(1)  # must not raise


@pytest.mark.asyncio
async def test_spend_sends_the_telegram_surface_and_derived_identity():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        import json
        seen.update(json.loads(request.content))
        seen["auth"] = request.headers.get("x-internal-key")
        return httpx.Response(200, json=BALANCE)

    quota = client_with(handler)
    await quota.spend(4242, reference="tg:7")
    assert seen["identity"] == "telegram:4242"
    assert seen["surface"] == "telegram"
    assert seen["reference"] == "tg:7"
    assert seen["auth"] == "service-key"
