"""Toss Payments billing registration and subscription activation."""

from __future__ import annotations

import base64
import calendar
import hashlib
import secrets
from datetime import datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from .config import setting
from .db import database
from .family import authenticated, family_id, member_id, require_owner


router = APIRouter(prefix="/api/billing", tags=["billing"])
TOSS_API = "https://api.tosspayments.com/v1"


def _now() -> datetime:
    return datetime.now(ZoneInfo("Asia/Seoul"))


def _add_month(value: datetime) -> datetime:
    month = value.month + 1
    year = value.year
    if month == 13:
        month, year = 1, year + 1
    return value.replace(year=year, month=month, day=min(value.day, calendar.monthrange(year, month)[1]))


def _amount() -> int:
    try:
        amount = int(setting("TOSS_BILLING_AMOUNT", "5900"))
    except ValueError as exc:
        raise HTTPException(500, "TOSS_BILLING_AMOUNT 설정을 확인해주세요") from exc
    if amount < 100:
        raise HTTPException(500, "구독 금액 설정이 올바르지 않습니다")
    return amount


def _require_billing_owner(db) -> None:
    if not authenticated() or not member_id():
        raise HTTPException(401, "로그인한 가족방에서 결제를 진행해주세요")
    require_owner(db)


def _ensure_subscription(db):
    row = db.execute("SELECT * FROM family_subscription WHERE family_id = ?", (family_id(),)).fetchone()
    if row is not None:
        return row
    now = _now().isoformat()
    customer_key = "fc_" + secrets.token_urlsafe(24)
    db.execute(
        """INSERT INTO family_subscription(family_id, provider, customer_key, status, amount,
           created_at, updated_at) VALUES (?, 'TOSS', ?, 'PENDING', ?, ?, ?)""",
        (family_id(), customer_key, _amount(), now, now),
    )
    return db.execute("SELECT * FROM family_subscription WHERE family_id = ?", (family_id(),)).fetchone()


def _toss_headers() -> dict[str, str]:
    secret_key = setting("TOSS_BILLING_SECRET_KEY")
    if not secret_key:
        raise HTTPException(503, detail={
            "code": "BILLING_NOT_CONFIGURED",
            "message": "토스페이먼츠 자동결제 시크릿 키가 설정되지 않았습니다",
        })
    credential = base64.b64encode(f"{secret_key}:".encode()).decode()
    return {"Authorization": f"Basic {credential}", "Content-Type": "application/json"}


def _toss_post(path: str, payload: dict) -> dict:
    try:
        response = httpx.post(TOSS_API + path, headers=_toss_headers(), json=payload, timeout=20)
        if response.is_error:
            problem = response.json() if response.content else {}
            message = problem.get("message") if isinstance(problem, dict) else None
            raise HTTPException(response.status_code if response.status_code < 500 else 502, detail={
                "code": problem.get("code", "TOSS_PAYMENT_ERROR") if isinstance(problem, dict) else "TOSS_PAYMENT_ERROR",
                "message": message or "토스페이먼츠 결제를 완료하지 못했습니다",
            })
        result = response.json()
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, detail={
            "code": "TOSS_PAYMENT_UNAVAILABLE",
            "message": "토스페이먼츠에 연결하지 못했습니다. 잠시 후 다시 시도해주세요",
        }) from exc
    if not isinstance(result, dict):
        raise HTTPException(502, "토스페이먼츠 응답 형식을 확인할 수 없습니다")
    return result


def _charge(db, subscription: dict, billing_key: str) -> dict:
    amount = int(subscription["amount"])
    order_id = "FC-" + uuid4().hex
    payment = _toss_post(f"/billing/{billing_key}", {
        "customerKey": subscription["customer_key"],
        "amount": amount,
        "orderId": order_id,
        "orderName": "Family Care Pro 월 구독",
    })
    status = str(payment.get("status") or "UNKNOWN")
    if status != "DONE":
        raise HTTPException(502, detail={"code": "PAYMENT_NOT_DONE", "message": "결제가 승인 상태로 완료되지 않았습니다"})
    now = _now()
    next_at = _add_month(now)
    db.execute(
        """INSERT INTO payment_transaction(order_id, family_id, provider, amount, status,
           payment_key, approved_at, created_at) VALUES (?, ?, 'TOSS', ?, ?, ?, ?, ?)""",
        (order_id, family_id(), amount, status, payment.get("paymentKey"),
         payment.get("approvedAt") or now.isoformat(), now.isoformat()),
    )
    db.execute(
        """UPDATE family_subscription SET billing_key = ?, status = 'ACTIVE',
           current_period_start = ?, current_period_end = ?, next_billing_at = ?, updated_at = ?
           WHERE family_id = ?""",
        (billing_key, now.isoformat(), next_at.isoformat(), next_at.isoformat(), now.isoformat(), family_id()),
    )
    db.execute("UPDATE family_group SET plan = 'PRO' WHERE id = ?", (family_id(),))
    db.execute("DELETE FROM plan_preview WHERE family_id = ?", (family_id(),))
    return {"order_id": order_id, "status": status, "amount": amount,
            "approved_at": payment.get("approvedAt") or now.isoformat(), "next_billing_at": next_at.isoformat()}


class BillingActivation(BaseModel):
    auth_key: str = Field(min_length=1, max_length=300)
    customer_key: str = Field(min_length=2, max_length=50)


@router.get("/config")
def billing_config():
    with database() as db:
        _require_billing_owner(db)
        subscription = dict(_ensure_subscription(db))
    return {
        "provider": "TOSS",
        "configured": bool(setting("TOSS_BILLING_CLIENT_KEY") and setting("TOSS_BILLING_SECRET_KEY")),
        "client_key": setting("TOSS_BILLING_CLIENT_KEY"),
        "customer_key": subscription["customer_key"],
        "amount": int(subscription["amount"]),
        "currency": "KRW",
        "status": subscription["status"],
        "next_billing_at": subscription.get("next_billing_at"),
    }


@router.post("/activate")
def activate_subscription(payload: BillingActivation):
    auth_hash = hashlib.sha256(payload.auth_key.encode()).hexdigest()
    with database() as db:
        _require_billing_owner(db)
        subscription = dict(_ensure_subscription(db))
        if not setting("TOSS_BILLING_CLIENT_KEY") or not setting("TOSS_BILLING_SECRET_KEY"):
            raise HTTPException(503, detail={"code": "BILLING_NOT_CONFIGURED", "message": "토스페이먼츠 자동결제 키를 먼저 설정해주세요"})
        if not secrets.compare_digest(subscription["customer_key"], payload.customer_key):
            raise HTTPException(400, "결제 구매자 정보가 현재 가족방과 일치하지 않습니다")
        if subscription.get("last_auth_key_hash") == auth_hash and subscription["status"] == "ACTIVE":
            return {"plan": "PRO", "status": "ACTIVE", "amount": int(subscription["amount"]),
                    "next_billing_at": subscription.get("next_billing_at"), "already_processed": True}

    issued = _toss_post("/billing/authorizations/issue", {
        "authKey": payload.auth_key,
        "customerKey": payload.customer_key,
    })
    billing_key = issued.get("billingKey")
    if not billing_key:
        raise HTTPException(502, "토스페이먼츠에서 빌링키를 받지 못했습니다")

    with database() as db:
        _require_billing_owner(db)
        subscription = dict(_ensure_subscription(db))
        db.execute("UPDATE family_subscription SET last_auth_key_hash = ?, updated_at = ? WHERE family_id = ?",
                   (auth_hash, _now().isoformat(), family_id()))
        payment = _charge(db, subscription, billing_key)
    return {"plan": "PRO", "status": "ACTIVE", **payment}

