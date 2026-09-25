"""Privacy-conscious event collection and BX/CX/DX performance summaries."""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .config import enabled
from .db import database


router = APIRouter(prefix="/api/performance", tags=["performance tracker"])
SEOUL = ZoneInfo("Asia/Seoul")


EVENT_TRACKERS = {
    # CX: use, return, and information-confirmation behavior.
    "app_opened": "CX",
    "screen_view": "CX",
    # DX: care coordination, handoff, notifications, and AI behavior.
    "schedule_created": "DX",
    "conflict_detected": "DX",
    "ai_candidate_suggested": "DX",
    "request_sent": "DX",
    "request_responded": "DX",
    "reassignment_confirmed": "DX",
    "manual_adjustment_used": "DX",
    "assignment_completed": "DX",
    "handoff_completed": "DX",
    "handoff_viewed": "DX",
    "handoff_acknowledged": "DX",
    "notification_sent": "DX",
    "notification_opened": "DX",
    "chatbot_query": "DX",
    "chatbot_response_delivered": "DX",
    "chatbot_action_opened": "DX",
    "device_alert_used": "DX",
    # BX: acquisition, activation, plan limits, and subscription funnel.
    "family_created": "BX",
    "invite_created": "BX",
    "invite_accepted": "BX",
    "feature_limit_reached": "BX",
    "limit_reached_screen_viewed": "BX",
    "pro_paywall_viewed": "BX",
    "pro_cta_clicked": "BX",
    "payment_completed": "BX",
    "payment_abandoned": "BX",
    "pro_feature_used": "BX",
    "subscription_renewed": "BX",
    "subscription_cancelled": "BX",
}


class PerformanceEventCreate(BaseModel):
    event_name: str = Field(min_length=1, max_length=80)
    correlation_id: str | None = Field(default=None, max_length=120)
    properties: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


def _now() -> datetime:
    return datetime.now(SEOUL)


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed.replace(tzinfo=SEOUL) if parsed.tzinfo is None else parsed.astimezone(SEOUL)


def _safe_properties(properties: dict[str, Any] | None) -> dict[str, Any]:
    """Keep tracker payloads small and free of message/schedule text."""
    if not properties:
        return {}
    result: dict[str, Any] = {}
    for key, value in list(properties.items())[:20]:
        if not isinstance(key, str) or not key or len(key) > 80:
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            result[key] = value[:240] if isinstance(value, str) else value
    return result


def record_event(
    db,
    event_name: str,
    *,
    target_family_id: str,
    target_member_id: str | None = None,
    correlation_id: str | None = None,
    properties: dict[str, Any] | None = None,
    occurred_at: str | None = None,
) -> str:
    """Write one event inside the caller's transaction.

    Internal callers pass identifiers and booleans only. User-entered titles,
    messages, notes, addresses, and media are deliberately not collected.
    """
    tracker = EVENT_TRACKERS.get(event_name)
    if tracker is None:
        raise ValueError(f"unsupported performance event: {event_name}")
    event_id = str(uuid4())
    safe = _safe_properties(properties)
    db.execute(
        """INSERT INTO performance_event(id, family_id, member_id, event_name, tracker,
           correlation_id, properties, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            event_id,
            target_family_id,
            target_member_id,
            event_name,
            tracker,
            correlation_id,
            json.dumps(safe, ensure_ascii=False, separators=(",", ":")),
            occurred_at or _now().isoformat(),
        ),
    )
    return event_id


def _scope_clause(scope: str) -> tuple[str, tuple[Any, ...]]:
    from .family import family_id

    if scope == "service":
        if not enabled("LGDX_DEV_MODE"):
            raise HTTPException(403, "서비스 전체 지표는 개발자 모드에서만 확인할 수 있습니다")
        return "", ()
    return " WHERE family_id = ?", (family_id(),)


def _rows(db, table: str, scope: str) -> list[dict]:
    clause, args = _scope_clause(scope)
    family_column = "id" if table == "family_group" else "family_id"
    if scope == "service":
        clause, args = "", ()
    elif family_column == "id":
        from .family import family_id

        clause, args = " WHERE id = ?", (family_id(),)
    return [dict(row) for row in db.execute(f"SELECT * FROM {table}{clause}", args).fetchall()]


def _period_rows(rows: list[dict], column: str, start: datetime, end: datetime) -> list[dict]:
    result = []
    for row in rows:
        timestamp = _parse_time(row.get(column))
        if timestamp is not None and start <= timestamp <= end:
            result.append(row)
    return result


def _ratio(numerator: int | float, denominator: int | float) -> float | None:
    return round(float(numerator) / float(denominator) * 100, 1) if denominator else None


def _metric(metric_id: str, name: str, value: int | float | None, unit: str,
            *, numerator: int | float | None = None, denominator: int | float | None = None,
            target: str, source: str) -> dict:
    return {
        "id": metric_id,
        "name": name,
        "value": value,
        "unit": unit,
        "numerator": numerator,
        "denominator": denominator,
        "target": target,
        "source": source,
    }


def _retention(events: list[dict], days_after: int, end: datetime) -> tuple[int, int, float | None]:
    opens: dict[str, list[datetime]] = defaultdict(list)
    for event in events:
        if event["event_name"] != "app_opened" or not event.get("member_id"):
            continue
        timestamp = _parse_time(event.get("occurred_at"))
        if timestamp:
            opens[event["member_id"]].append(timestamp)
    eligible = retained = 0
    for timestamps in opens.values():
        timestamps.sort()
        first = timestamps[0]
        window_start = first + timedelta(days=days_after)
        window_end = window_start + timedelta(days=7)
        if window_start > end:
            continue
        eligible += 1
        if any(window_start <= timestamp < window_end for timestamp in timestamps[1:]):
            retained += 1
    return retained, eligible, _ratio(retained, eligible)


def _average_minutes_between(events: list[dict], start_event: str, end_event: str) -> tuple[int, float | None]:
    starts: dict[str, list[datetime]] = defaultdict(list)
    ends: dict[str, list[datetime]] = defaultdict(list)
    for event in events:
        correlation = event.get("correlation_id")
        timestamp = _parse_time(event.get("occurred_at"))
        if not correlation or not timestamp:
            continue
        if event["event_name"] == start_event:
            starts[correlation].append(timestamp)
        elif event["event_name"] == end_event:
            ends[correlation].append(timestamp)
    durations = []
    for correlation, start_times in starts.items():
        first = min(start_times)
        later = [timestamp for timestamp in ends.get(correlation, []) if timestamp >= first]
        if later:
            durations.append((min(later) - first).total_seconds() / 60)
    return len(durations), round(mean(durations), 1) if durations else None


def _first_value_minutes(families: list[dict], events: list[dict], intakes: list[dict],
                         assignments: list[dict], end: datetime) -> tuple[int, float | None]:
    first_value: dict[str, datetime] = {}
    for event in events:
        if event["event_name"] not in {"schedule_created", "request_sent", "assignment_completed"}:
            continue
        timestamp = _parse_time(event.get("occurred_at"))
        if timestamp:
            first_value[event["family_id"]] = min(first_value.get(event["family_id"], end), timestamp)
    for row, column in [*((row, "created_at") for row in intakes), *((row, "created_at") for row in assignments)]:
        timestamp = _parse_time(row.get(column))
        if timestamp:
            first_value[row["family_id"]] = min(first_value.get(row["family_id"], end), timestamp)
    durations = []
    for family in families:
        created = _parse_time(family.get("created_at"))
        value = first_value.get(family["id"])
        if created and value and value >= created:
            durations.append((value - created).total_seconds() / 60)
    return len(durations), round(mean(durations), 1) if durations else None


@router.post("/events", status_code=201)
def collect_event(payload: PerformanceEventCreate):
    from .family import family_id, member_id

    if payload.event_name not in EVENT_TRACKERS:
        raise HTTPException(422, "지원하지 않는 퍼포먼스 이벤트입니다")
    encoded = json.dumps(payload.properties, ensure_ascii=False)
    if len(encoded.encode("utf-8")) > 4096:
        raise HTTPException(422, "이벤트 속성은 4KB까지 기록할 수 있습니다")
    with database() as db:
        if not db.execute(
            "SELECT 1 FROM family_member WHERE id = ? AND family_id = ? AND status = 'ACTIVE'",
            (member_id(), family_id()),
        ).fetchone():
            raise HTTPException(403, "활동 중인 가족 구성원만 이벤트를 기록할 수 있습니다")
        event_id = record_event(
            db,
            payload.event_name,
            target_family_id=family_id(),
            target_member_id=member_id(),
            correlation_id=payload.correlation_id,
            properties=payload.properties,
        )
    return {"id": event_id, "event_name": payload.event_name, "recorded": True}


@router.get("/summary")
def performance_summary(
    days: int = Query(default=30, ge=1, le=365),
    scope: str = Query(default="family", pattern="^(family|service)$"),
):
    end = _now()
    start = end - timedelta(days=days)
    with database() as db:
        families = _rows(db, "family_group", scope)
        members = _rows(db, "family_member", scope)
        invites = _rows(db, "family_invite_link", scope)
        sessions = _rows(db, "family_session", scope)
        events = _rows(db, "performance_event", scope)
        schedules = _rows(db, "child_schedule", scope)
        intakes = _rows(db, "care_intake", scope)
        assignments = _rows(db, "care_assignment", scope)
        handoffs = _rows(db, "care_handoff", scope)
        notices = _rows(db, "notification", scope)
        messages = _rows(db, "assistant_message", scope)
        preferences = [dict(row) for row in db.execute(
            """SELECT p.*, m.family_id FROM notification_preference p
               JOIN family_member m ON m.id = p.member_id""" +
            ("" if scope == "service" else " WHERE m.family_id = ?"),
            () if scope == "service" else _scope_clause(scope)[1],
        ).fetchall()]
        subscriptions = _rows(db, "family_subscription", scope)
        payments = _rows(db, "payment_transaction", scope)

    period_events = _period_rows(events, "occurred_at", start, end)
    event_counts = Counter(event["event_name"] for event in period_events)
    period_families = _period_rows(families, "created_at", start, end)
    period_intakes = _period_rows(intakes, "created_at", start, end)
    period_assignments = _period_rows(assignments, "created_at", start, end)
    period_notices = _period_rows(notices, "created_at", start, end)
    period_messages = _period_rows(messages, "created_at", start, end)
    period_payments = _period_rows(payments, "created_at", start, end)
    period_child_schedules = _period_rows(schedules, "created_at", start, end)

    active_family_ids = {event["family_id"] for event in period_events if event["event_name"] == "app_opened"}
    active_member_ids = {event["member_id"] for event in period_events
                         if event["event_name"] == "app_opened" and event.get("member_id")}
    for session in sessions:
        seen = _parse_time(session.get("last_seen_at"))
        if seen and start <= seen <= end:
            active_family_ids.add(session["family_id"])
            active_member_ids.add(session["member_id"])

    responded = [row for row in period_assignments if row.get("responded_at")]
    requestable = [row for row in period_assignments if row.get("source") != "ROUTINE_AUTO"]
    accepted_or_done = [row for row in assignments if row.get("status") in {"ACCEPTED", "COMPLETED"}]
    completed = [row for row in assignments if row.get("status") == "COMPLETED"]
    role_match = [row for row in period_assignments if row.get("source") == "ROLE_MATCH"]
    role_match_adopted = [row for row in role_match if row.get("status") in {"ACCEPTED", "COMPLETED"}]
    acknowledged = [row for row in handoffs if row.get("status") == "ACKNOWLEDGED"]
    opened_notices = [row for row in period_notices if bool(row.get("is_read"))]
    photo_intakes = [row for row in period_intakes if row.get("input_type") == "PHOTO_TRANSCRIPT"]
    user_messages = [row for row in period_messages if row.get("role") == "user"]
    pro_families = {row["id"] for row in families if row.get("plan") == "PRO"}
    device_enabled_families = {row["family_id"] for row in preferences if bool(row.get("device_enabled"))}
    completed_payments = [row for row in period_payments if row.get("status") == "DONE"]
    completed_payment_families = {row["family_id"] for row in completed_payments}

    duration_pairs, reassignment_minutes = _average_minutes_between(
        period_events, "conflict_detected", "reassignment_confirmed"
    )
    d7_retained, d7_eligible, d7_rate = _retention(events, 7, end)
    d30_retained, d30_eligible, d30_rate = _retention(events, 30, end)
    first_value_count, first_value_minutes = _first_value_minutes(
        families, events, intakes, assignments, end
    )

    information_views = event_counts["notification_opened"] + event_counts["chatbot_query"] + sum(
        1 for event in period_events
        if event["event_name"] == "screen_view"
        and json.loads(event.get("properties") or "{}").get("screen") in {
            "home", "assignments", "assignmentDetail", "tasks", "notifications", "supplies", "homework"
        }
    )
    ai_channel_views = event_counts["notification_opened"] + event_counts["chatbot_query"]

    paywall_families = {event["family_id"] for event in period_events if event["event_name"] == "pro_paywall_viewed"}
    cta_families = {event["family_id"] for event in period_events if event["event_name"] == "pro_cta_clicked"}
    limit_events = [event for event in period_events if event["event_name"] == "feature_limit_reached"]
    paid_within_24h = 0
    for limit_event in limit_events:
        limit_time = _parse_time(limit_event.get("occurred_at"))
        if limit_time and any(
            payment["family_id"] == limit_event["family_id"]
            and (paid_at := _parse_time(payment.get("approved_at") or payment.get("created_at"))) is not None
            and limit_time <= paid_at <= limit_time + timedelta(hours=24)
            and payment.get("status") == "DONE"
            for payment in payments
        ):
            paid_within_24h += 1

    family_sizes = Counter(member["family_id"] for member in members if member.get("status") != "REMOVED")
    conversion_segments = []
    for label, predicate in (("보호자 3명 이하", lambda size: size <= 3), ("보호자 4명 이상", lambda size: size >= 4)):
        segment = {family["id"] for family in families if predicate(family_sizes[family["id"]])}
        converted = segment & pro_families
        conversion_segments.append({
            "segment": label,
            "families": len(segment),
            "pro_families": len(converted),
            "conversion_rate_pct": _ratio(len(converted), len(segment)),
        })

    bx = [
        _metric("BX-01", "가족방 생성량", len(period_families), "개",
                target="주간·월간 추이 상승", source="family_group.created_at"),
        _metric("BX-02", "초대 링크당 참여 인원", round(sum(row.get("join_count", 0) for row in invites) / len(invites), 2) if invites else None,
                "명/링크", numerator=sum(row.get("join_count", 0) for row in invites), denominator=len(invites),
                target="링크당 1명 이상", source="family_invite_link.join_count"),
        _metric("BX-03", "현재 Pro 전환율", _ratio(len(pro_families), len(families)), "%",
                numerator=len(pro_families), denominator=len(families), target="베타 10% 이상",
                source="family_group.plan"),
        _metric("BX-04", "Paywall→Pro 시작 클릭률", _ratio(len(cta_families), len(paywall_families)), "%",
                numerator=len(cta_families), denominator=len(paywall_families), target="25% 이상",
                source="performance_event(pro_paywall_viewed, pro_cta_clicked)"),
        _metric("BX-05", "Pro 시작→결제 전환율", _ratio(len(completed_payment_families & cta_families), len(cta_families)), "%",
                numerator=len(completed_payment_families & cta_families), denominator=len(cta_families), target="15% 이상",
                source="performance_event + payment_transaction"),
        _metric("BX-06", "한도 도달 후 24시간 내 결제 전환율", _ratio(paid_within_24h, len(limit_events)), "%",
                numerator=paid_within_24h, denominator=len(limit_events), target="기능별 비교 후 상위 전환 요인 확인",
                source="performance_event(feature_limit_reached) + payment_transaction"),
        _metric("BX-07", "기간 내 결제 매출", sum(int(row.get("amount", 0)) for row in completed_payments), "원",
                target="월별 추이 상승", source="payment_transaction(status=DONE)"),
        _metric("BX-08", "활성 구독 유지율", _ratio(sum(1 for row in subscriptions if row.get("status") == "ACTIVE"), len(subscriptions)), "%",
                numerator=sum(1 for row in subscriptions if row.get("status") == "ACTIVE"), denominator=len(subscriptions),
                target="90% 이상", source="family_subscription.status"),
    ]

    cx = [
        _metric("CX-01", "월간 활성 가족방", len(active_family_ids), "개",
                target="전월 대비 상승", source="performance_event(app_opened) + family_session.last_seen_at"),
        _metric("CX-02", "월간 활성 구성원", len(active_member_ids), "명",
                target="가족방당 2명 이상", source="performance_event(app_opened) + family_session.last_seen_at"),
        _metric("CX-03", "D+7 리텐션", d7_rate, "%", numerator=d7_retained, denominator=d7_eligible,
                target="40% 이상", source="performance_event(app_opened)"),
        _metric("CX-04", "D+30 리텐션", d30_rate, "%", numerator=d30_retained, denominator=d30_eligible,
                target="25% 이상", source="performance_event(app_opened)"),
        _metric("CX-05", "첫 가치 도달 평균 시간", first_value_minutes, "분", numerator=first_value_count,
                target="온보딩 후 10분 이내", source="family_group + schedule/intake/assignment 최초 기록"),
        _metric("CX-06", "알림 확인률", _ratio(len(opened_notices), len(period_notices)), "%",
                numerator=len(opened_notices), denominator=len(period_notices), target="70% 이상",
                source="notification.is_read"),
        _metric("CX-07", "AI 채널 활용 비율", _ratio(ai_channel_views, information_views), "%",
                numerator=ai_channel_views, denominator=information_views, target="70% 이상",
                source="performance_event(notification_opened, chatbot_query, screen_view)"),
        _metric("CX-08", "인수인계 확인률", _ratio(len(acknowledged), len(handoffs)), "%",
                numerator=len(acknowledged), denominator=len(handoffs), target="95% 이상",
                source="care_handoff.status"),
    ]

    dx = [
        _metric("DX-01", "일정 등록량", event_counts["schedule_created"] + len(period_child_schedules), "건",
                target="가족방당 주 3건 이상", source="performance_event(schedule_created) + child_schedule.created_at"),
        _metric("DX-02", "OCR 알림장 등록량", len(photo_intakes), "건",
                target="주간 이용 가족 증가", source="care_intake(input_type=PHOTO_TRANSCRIPT)"),
        _metric("DX-03", "충돌→재배정 완료 평균 시간", reassignment_minutes, "분", numerator=duration_pairs,
                target="평균 4분 이내", source="performance_event(conflict_detected, reassignment_confirmed)"),
        _metric("DX-04", "AI 담당자 추천 채택률", _ratio(len(role_match_adopted), len(role_match)), "%",
                numerator=len(role_match_adopted), denominator=len(role_match), target="60% 이상",
                source="care_assignment(source=ROLE_MATCH)"),
        _metric("DX-05", "배정 요청 응답률", _ratio(len(responded), len(requestable)), "%",
                numerator=len(responded), denominator=len(requestable), target="80% 이상",
                source="care_assignment.responded_at"),
        _metric("DX-06", "돌봄 완료율", _ratio(len(completed), len(accepted_or_done)), "%",
                numerator=len(completed), denominator=len(accepted_or_done), target="90% 이상",
                source="care_assignment.status"),
        _metric("DX-07", "구성원당 AI 질문 수", round(len(user_messages) / len(active_member_ids), 2) if active_member_ids else None,
                "건/명", numerator=len(user_messages), denominator=len(active_member_ids), target="월 3회 이상",
                source="assistant_message(role=user)"),
        _metric("DX-08", "Pro 가족 가전 알림 활성화율", _ratio(len(device_enabled_families & pro_families), len(pro_families)), "%",
                numerator=len(device_enabled_families & pro_families), denominator=len(pro_families), target="30% 이상",
                source="notification_preference.device_enabled"),
    ]

    return {
        "generated_at": end.isoformat(),
        "period": {"days": days, "from": start.isoformat(), "to": end.isoformat()},
        "scope": scope,
        "trackers": {"BX": bx, "CX": cx, "DX": dx},
        "segments": {"family_size_pro_conversion": conversion_segments},
        "event_counts": dict(sorted(event_counts.items())),
        "collection": {
            "event_table": "performance_event",
            "event_endpoint": "POST /api/performance/events",
            "summary_endpoint": f"GET /api/performance/summary?days={days}&scope={scope}",
            "privacy": "식별용 내부 ID와 화면/상태 값만 수집하며 일정 제목·대화·메모·주소·사진은 수집하지 않음",
        },
    }


@router.get("/event-counts")
def performance_event_counts(
    days: int = Query(default=30, ge=1, le=365),
    scope: str = Query(default="family", pattern="^(family|service)$"),
):
    end = _now()
    start = end - timedelta(days=days)
    with database() as db:
        events = _period_rows(_rows(db, "performance_event", scope), "occurred_at", start, end)
    counts = Counter((event["tracker"], event["event_name"]) for event in events)
    return {
        "period": {"days": days, "from": start.isoformat(), "to": end.isoformat()},
        "scope": scope,
        "events": [
            {"tracker": tracker, "event_name": event_name, "count": count}
            for (tracker, event_name), count in sorted(counts.items())
        ],
    }
