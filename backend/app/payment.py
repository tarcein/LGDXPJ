"""Toss Payments billing registration and subscription activation."""

from __future__ import annotations

import base64
import calendar
import hashlib
import logging
import secrets
import asyncio
from datetime import datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .config import setting
from .db import database
from .family import authenticated, family_id, member_id, require_owner
from .performance import record_event


router = APIRouter(prefix="/api/billing", tags=["billing"])
TOSS_API = "https://api.tosspayments.com/v1"
logger = logging.getLogger(__name__)


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
        amount = int(setting("TOSS_BILLING_AMOUNT", "7900"))
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
        configured_amount = _amount()
        if int(row["amount"]) != configured_amount:
            db.execute(
                "UPDATE family_subscription SET amount = ?, updated_at = ? WHERE family_id = ?",
                (configured_amount, _now().isoformat(), family_id()),
            )
            row = db.execute("SELECT * FROM family_subscription WHERE family_id = ?", (family_id(),)).fetchone()
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
            "message": "토스페이먼츠 시크릿 키가 설정되지 않았습니다",
        })
    credential = base64.b64encode(f"{secret_key}:".encode()).decode()
    return {"Authorization": f"Basic {credential}", "Content-Type": "application/json"}


def _toss_post(path: str, payload: dict, *, idempotency_key: str | None = None) -> dict:
    headers = _toss_headers()
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    try:
        response = httpx.post(TOSS_API + path, headers=headers, json=payload, timeout=20)
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


def _charge(db, subscription: dict, billing_key: str, *, target_family_id: str | None = None) -> dict:
    target_family = target_family_id or family_id()
    amount = int(subscription["amount"])
    order_id = "FC-" + uuid4().hex
    payment = _toss_post(f"/billing/{billing_key}", {
        "customerKey": subscription["customer_key"],
        "amount": amount,
        "orderId": order_id,
        "orderName": "ZIPPY Pro 월 구독",
    }, idempotency_key=f"billing-{order_id}")
    status = str(payment.get("status") or "UNKNOWN")
    if status != "DONE":
        raise HTTPException(502, detail={"code": "PAYMENT_NOT_DONE", "message": "결제가 승인 상태로 완료되지 않았습니다"})
    now = _now()
    next_at = _add_month(now)
    db.execute(
        """INSERT INTO payment_transaction(order_id, family_id, provider, amount, status,
           payment_key, approved_at, created_at) VALUES (?, ?, 'TOSS', ?, ?, ?, ?, ?)""",
        (order_id, target_family, amount, status, payment.get("paymentKey"),
         payment.get("approvedAt") or now.isoformat(), now.isoformat()),
    )
    db.execute(
        """UPDATE family_subscription SET billing_key = ?, status = 'ACTIVE',
           current_period_start = ?, current_period_end = ?, next_billing_at = ?,
           cancel_at_period_end = 0, canceled_at = NULL, renewal_failure_count = 0,
           last_renewal_error = NULL, updated_at = ?
           WHERE family_id = ?""",
        (billing_key, now.isoformat(), next_at.isoformat(), next_at.isoformat(), now.isoformat(), target_family),
    )
    db.execute("UPDATE family_group SET plan = 'PRO' WHERE id = ?", (target_family,))
    db.execute("DELETE FROM plan_preview WHERE family_id = ?", (target_family,))
    renewal = subscription.get("status") == "ACTIVE" and bool(subscription.get("current_period_start"))
    record_event(
        db, "subscription_renewed" if renewal else "payment_completed",
        target_family_id=target_family,
        target_member_id=member_id() if target_family == family_id() else None,
        correlation_id=order_id,
        properties={"amount": amount, "provider": "TOSS", "cycle": "MONTHLY"},
        occurred_at=payment.get("approvedAt") or now.isoformat(),
    )
    return {"order_id": order_id, "status": status, "amount": amount,
            "approved_at": payment.get("approvedAt") or now.isoformat(), "next_billing_at": next_at.isoformat()}


def _integration_mode() -> str:
    client_key = setting("TOSS_BILLING_CLIENT_KEY")
    if client_key.startswith(("test_gck_", "live_gck_")):
        return "WIDGET"
    return "BILLING_AUTH"


def _activate_paid_period(db, *, approved_at: str | None = None) -> tuple[str, str]:
    now = _now()
    next_at = _add_month(now)
    db.execute(
        """UPDATE family_subscription SET status = 'ACTIVE', current_period_start = ?,
           current_period_end = ?, next_billing_at = NULL, cancel_at_period_end = 0,
           canceled_at = NULL, renewal_failure_count = 0, last_renewal_error = NULL,
           updated_at = ? WHERE family_id = ?""",
        (now.isoformat(), next_at.isoformat(), now.isoformat(), family_id()),
    )
    db.execute("UPDATE family_group SET plan = 'PRO' WHERE id = ?", (family_id(),))
    db.execute("DELETE FROM plan_preview WHERE family_id = ?", (family_id(),))
    return approved_at or now.isoformat(), next_at.isoformat()


class BillingActivation(BaseModel):
    auth_key: str = Field(min_length=1, max_length=300)
    customer_key: str = Field(min_length=2, max_length=50)


class WidgetPaymentConfirmation(BaseModel):
    payment_key: str = Field(min_length=1, max_length=300)
    order_id: str = Field(min_length=6, max_length=64)
    amount: int = Field(ge=100)


def reconcile_subscription(db, target_family_id: str) -> dict | None:
    """Expire a paid period that cannot renew; active billing subscriptions are handled by the worker."""
    row = db.execute("SELECT * FROM family_subscription WHERE family_id = ?", (target_family_id,)).fetchone()
    if row is None:
        return None
    subscription = dict(row)
    period_end = subscription.get("current_period_end")
    if subscription["status"] == "ACTIVE" and period_end and period_end <= _now().isoformat():
        if bool(subscription.get("cancel_at_period_end")) or not subscription.get("billing_key"):
            status = "CANCELED" if bool(subscription.get("cancel_at_period_end")) else "EXPIRED"
            db.execute(
                "UPDATE family_subscription SET status = ?, next_billing_at = NULL, updated_at = ? WHERE family_id = ?",
                (status, _now().isoformat(), target_family_id),
            )
            db.execute("UPDATE family_group SET plan = 'FREE' WHERE id = ?", (target_family_id,))
            subscription["status"] = status
            subscription["next_billing_at"] = None
    return subscription


def process_due_renewals() -> dict[str, int]:
    """Charge due auto-billing subscriptions and expire canceled or one-time periods."""
    result = {"renewed": 0, "expired": 0, "failed": 0}
    now = _now()
    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        due = [dict(row) for row in db.execute(
            """SELECT * FROM family_subscription
               WHERE status = 'ACTIVE' AND current_period_end IS NOT NULL
                 AND current_period_end <= ? AND (next_billing_at IS NULL OR next_billing_at <= ?)""",
            (now.isoformat(), now.isoformat()),
        ).fetchall()]
        for subscription in due:
            target_family = subscription["family_id"]
            if bool(subscription.get("cancel_at_period_end")) or not subscription.get("billing_key"):
                status = "CANCELED" if bool(subscription.get("cancel_at_period_end")) else "EXPIRED"
                db.execute(
                    "UPDATE family_subscription SET status = ?, next_billing_at = NULL, updated_at = ? WHERE family_id = ?",
                    (status, now.isoformat(), target_family),
                )
                db.execute("UPDATE family_group SET plan = 'FREE' WHERE id = ?", (target_family,))
                result["expired"] += 1
                continue
            try:
                _charge(db, subscription, subscription["billing_key"], target_family_id=target_family)
                result["renewed"] += 1
            except Exception as exc:
                failures = int(subscription.get("renewal_failure_count") or 0) + 1
                terminal = failures >= 3
                retry_at = None if terminal else (now + timedelta(hours=24)).isoformat()
                db.execute(
                    """UPDATE family_subscription SET status = ?, renewal_failure_count = ?,
                       last_renewal_error = ?, next_billing_at = ?, updated_at = ? WHERE family_id = ?""",
                    ("PAST_DUE" if terminal else "ACTIVE", failures, str(exc)[:500], retry_at,
                     now.isoformat(), target_family),
                )
                if terminal:
                    db.execute("UPDATE family_group SET plan = 'FREE' WHERE id = ?", (target_family,))
                result["failed"] += 1
    return result


async def run_billing_renewal_loop() -> None:
    try:
        interval = max(60, int(setting("LGDX_BILLING_RENEWAL_INTERVAL_SECONDS", "300")))
    except ValueError:
        interval = 300
    while True:
        try:
            await asyncio.to_thread(process_due_renewals)
        except Exception:
            logger.exception("구독 자동 갱신 작업을 실행하지 못했습니다")
        await asyncio.sleep(interval)


@router.get("/config")
def billing_config():
    with database() as db:
        _require_billing_owner(db)
        subscription = dict(_ensure_subscription(db))
    return {
        "provider": "TOSS",
        "configured": bool(setting("TOSS_BILLING_CLIENT_KEY") and setting("TOSS_BILLING_SECRET_KEY")),
        "integration_mode": _integration_mode(),
        "client_key": setting("TOSS_BILLING_CLIENT_KEY"),
        "customer_key": subscription["customer_key"],
        "amount": int(subscription["amount"]),
        "currency": "KRW",
        "status": subscription["status"],
        "next_billing_at": subscription.get("next_billing_at"),
        "auto_renew_available": bool(subscription.get("billing_key")),
        "cancel_at_period_end": bool(subscription.get("cancel_at_period_end")),
    }


@router.post("/cancel")
def cancel_subscription():
    with database() as db:
        _require_billing_owner(db)
        subscription = dict(_ensure_subscription(db))
        if subscription["status"] != "ACTIVE":
            raise HTTPException(409, detail={"code": "SUBSCRIPTION_NOT_ACTIVE", "message": "취소할 활성 구독이 없습니다"})
        if not subscription.get("current_period_end"):
            raise HTTPException(409, "현재 이용 기간을 확인할 수 없습니다")
        now = _now().isoformat()
        db.execute(
            """UPDATE family_subscription SET cancel_at_period_end = 1, canceled_at = ?,
               next_billing_at = NULL, updated_at = ? WHERE family_id = ?""",
            (now, now, family_id()),
        )
        subscription = dict(db.execute(
            "SELECT * FROM family_subscription WHERE family_id = ?", (family_id(),)
        ).fetchone())
        record_event(
            db, "subscription_cancelled", target_family_id=family_id(),
            target_member_id=member_id(), correlation_id=family_id(),
            properties={"effective_at_period_end": True}, occurred_at=now,
        )
    return {"plan": "PRO", "status": "ACTIVE", "cancel_at_period_end": True,
            "auto_renew_available": bool(subscription.get("billing_key")),
            "current_period_end": subscription.get("current_period_end"), "next_billing_at": None}


@router.post("/resume")
def resume_subscription():
    with database() as db:
        _require_billing_owner(db)
        subscription = dict(_ensure_subscription(db))
        if subscription["status"] != "ACTIVE" or not subscription.get("billing_key"):
            raise HTTPException(409, detail={
                "code": "AUTO_BILLING_NOT_AVAILABLE",
                "message": "자동 갱신을 다시 켜려면 토스 자동결제용 빌링키가 필요합니다",
            })
        period_end = subscription.get("current_period_end")
        if not period_end or period_end <= _now().isoformat():
            raise HTTPException(409, "이미 종료된 구독은 새로 결제해주세요")
        now = _now().isoformat()
        db.execute(
            """UPDATE family_subscription SET cancel_at_period_end = 0, canceled_at = NULL,
               next_billing_at = ?, updated_at = ? WHERE family_id = ?""",
            (period_end, now, family_id()),
        )
    return {"plan": "PRO", "status": "ACTIVE", "cancel_at_period_end": False,
            "auto_renew_available": True, "current_period_end": period_end,
            "next_billing_at": period_end}


@router.post("/orders", status_code=201)
def create_widget_order():
    with database() as db:
        _require_billing_owner(db)
        subscription = dict(_ensure_subscription(db))
        if not setting("TOSS_BILLING_CLIENT_KEY") or not setting("TOSS_BILLING_SECRET_KEY"):
            raise HTTPException(503, detail={"code": "BILLING_NOT_CONFIGURED", "message": "토스페이먼츠 결제 키를 먼저 설정해주세요"})
        if _integration_mode() != "WIDGET":
            raise HTTPException(409, detail={"code": "WIDGET_KEY_REQUIRED", "message": "앱 안 결제수단 화면에는 결제위젯 키가 필요합니다"})
        order_id = "FC-" + uuid4().hex
        created_at = _now().isoformat()
        db.execute(
            """INSERT INTO payment_transaction(order_id, family_id, provider, amount, status, created_at)
               VALUES (?, ?, 'TOSS_WIDGET', ?, 'READY', ?)""",
            (order_id, family_id(), int(subscription["amount"]), created_at),
        )
    return {
        "provider": "TOSS", "integration_mode": "WIDGET", "configured": True,
        "client_key": setting("TOSS_BILLING_CLIENT_KEY"), "customer_key": subscription["customer_key"],
        "order_id": order_id, "order_name": "ZIPPY Pro 월 이용권",
        "amount": int(subscription["amount"]), "currency": "KRW", "status": subscription["status"],
        "next_billing_at": subscription.get("next_billing_at"),
    }


@router.post("/confirm")
def confirm_widget_payment(payload: WidgetPaymentConfirmation):
    with database() as db:
        _require_billing_owner(db)
        transaction = db.execute(
            "SELECT * FROM payment_transaction WHERE order_id = ? AND family_id = ?",
            (payload.order_id, family_id()),
        ).fetchone()
        if transaction is None:
            raise HTTPException(404, "결제 주문을 찾을 수 없습니다")
        transaction = dict(transaction)
        if int(transaction["amount"]) != payload.amount:
            raise HTTPException(400, detail={"code": "PAYMENT_AMOUNT_MISMATCH", "message": "결제 금액이 주문 금액과 일치하지 않습니다"})
        if transaction["status"] == "DONE":
            subscription = dict(_ensure_subscription(db))
            return {"plan": "PRO", "status": "ACTIVE", "amount": payload.amount,
                    "current_period_end": subscription.get("current_period_end"), "already_processed": True}
        if transaction["status"] != "READY":
            raise HTTPException(409, "이미 종료된 결제 주문입니다")

    payment = _toss_post("/payments/confirm", {
        "paymentKey": payload.payment_key, "orderId": payload.order_id, "amount": payload.amount,
    }, idempotency_key=f"confirm-{payload.order_id}")
    if str(payment.get("status") or "") != "DONE":
        raise HTTPException(502, detail={"code": "PAYMENT_NOT_DONE", "message": "결제가 승인 상태로 완료되지 않았습니다"})
    if str(payment.get("orderId") or "") != payload.order_id:
        raise HTTPException(502, "토스페이먼츠 주문번호가 요청과 일치하지 않습니다")
    if str(payment.get("paymentKey") or "") != payload.payment_key:
        raise HTTPException(502, "토스페이먼츠 결제키가 요청과 일치하지 않습니다")
    try:
        returned_amount = int(payment["totalAmount"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(502, "토스페이먼츠 승인 금액을 확인할 수 없습니다") from exc
    if returned_amount != payload.amount:
        raise HTTPException(502, "토스페이먼츠 승인 금액이 주문 금액과 일치하지 않습니다")

    with database() as db:
        _require_billing_owner(db)
        transaction = db.execute(
            "SELECT status FROM payment_transaction WHERE order_id = ? AND family_id = ?",
            (payload.order_id, family_id()),
        ).fetchone()
        if transaction is None:
            raise HTTPException(404, "결제 주문을 찾을 수 없습니다")
        if transaction["status"] != "DONE":
            approved_at, period_end = _activate_paid_period(db, approved_at=payment.get("approvedAt"))
            db.execute(
                """UPDATE payment_transaction SET status = 'DONE', payment_key = ?, approved_at = ?
                   WHERE order_id = ? AND family_id = ?""",
                (payload.payment_key, approved_at, payload.order_id, family_id()),
            )
            record_event(
                db, "payment_completed", target_family_id=family_id(),
                target_member_id=member_id(), correlation_id=payload.order_id,
                properties={"amount": payload.amount, "provider": "TOSS_WIDGET",
                            "cycle": "MONTHLY"}, occurred_at=approved_at,
            )
        else:
            subscription = dict(_ensure_subscription(db))
            period_end = subscription.get("current_period_end")
    return {"plan": "PRO", "status": "ACTIVE", "order_id": payload.order_id,
            "amount": payload.amount, "current_period_end": period_end}


@router.post("/activate")
def activate_subscription(payload: BillingActivation):
    auth_hash = hashlib.sha256(payload.auth_key.encode()).hexdigest()
    with database() as db:
        _require_billing_owner(db)
        subscription = dict(_ensure_subscription(db))
        if not setting("TOSS_BILLING_CLIENT_KEY") or not setting("TOSS_BILLING_SECRET_KEY"):
            raise HTTPException(503, detail={"code": "BILLING_NOT_CONFIGURED", "message": "토스페이먼츠 자동결제 키를 먼저 설정해주세요"})
        if _integration_mode() != "BILLING_AUTH":
            raise HTTPException(409, detail={"code": "BILLING_KEY_REQUIRED", "message": "자동결제에는 API 개별 연동 키가 필요합니다"})
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
