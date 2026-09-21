"""Local API for the Figma prototype and frontend/backend team handoff."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .db import database, initialize
from .config import setting
from .family import authenticated, family_id, member_id as current_member_id, owner_id, require_owner, resolve_bearer, reset_context, router as family_router, set_context
from .services import classify_lines, find_schedule_collisions, rank_members

def now() -> str:
    return datetime.now(ZoneInfo("Asia/Seoul")).isoformat()


def one(db, sql: str, args: tuple = ()) -> dict:
    row = db.execute(sql, args).fetchone()
    if row is None:
        raise HTTPException(404, "요청한 데이터를 찾을 수 없습니다")
    return dict(row)


def rows(db, sql: str, args: tuple = ()) -> list[dict]:
    return [dict(row) for row in db.execute(sql, args).fetchall()]


def notify(db, member_id: str | None, title: str, body: str, level: str = "NORMAL",
           action_type: str | None = None, action_id: str | None = None) -> None:
    db.execute(
        """INSERT INTO notification(id, family_id, member_id, title, body, level, is_read,
           created_at, action_type, action_id) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)""",
        (str(uuid4()), family_id(), member_id, title[:100], body[:200], level, now(), action_type, action_id),
    )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize()
    renewal_task = None
    reminder_task = None
    if setting("LGDX_BILLING_RENEWAL_WORKER", "1").lower() in {"1", "true", "yes", "on"}:
        from .payment import run_billing_renewal_loop
        renewal_task = asyncio.create_task(run_billing_renewal_loop())
    if setting("LGDX_ASSIGNMENT_REMINDER_WORKER", "1").lower() in {"1", "true", "yes", "on"}:
        from .reminders import run_assignment_reminder_loop
        reminder_task = asyncio.create_task(run_assignment_reminder_loop())
    try:
        yield
    finally:
        if renewal_task:
            renewal_task.cancel()
            with suppress(asyncio.CancelledError):
                await renewal_task
        if reminder_task:
            reminder_task.cancel()
            with suppress(asyncio.CancelledError):
                await reminder_task


app = FastAPI(title="LG 가족 운영 에이전트 데모 API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-Developer-Token"],
)
app.include_router(family_router)


@app.middleware("http")
async def family_context(request: Request, call_next):
    if (request.url.path in {"/api/families", "/api/families/join", "/api/families/dev-login",
                            "/api/families/dev-login-options", "/api/health", "/api/public-config"}
            or request.url.path.startswith("/api/families/invitations/")
            or request.url.path.endswith("/callback")
            or not request.url.path.startswith("/api/")):
        return await call_next(request)
    try:
        target_family, target_member, is_authenticated = resolve_bearer(request.headers.get("Authorization"))
    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    tokens = set_context(target_family, target_member, is_authenticated)
    try:
        return await call_next(request)
    finally:
        reset_context(tokens)


class ChildCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    age_label: str = Field(min_length=1, max_length=30)


class MemberCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    role: str = Field(pattern="^(PARENT|GRANDPARENT|CAREGIVER)$")


class ScheduleCreate(BaseModel):
    member_id: str
    title: str = Field(min_length=1, max_length=200)
    starts_at: datetime
    ends_at: datetime | None = None
    kind: str = Field(default="ROUTINE", pattern="^(WORK|ROUTINE)$")
    repeat_days: list[int] = Field(default_factory=list)
    repeat_until: date | None = None
    repeat_dates: list[date] = Field(default_factory=list)


class ChildScheduleCreate(BaseModel):
    child_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)
    category: str = Field(default="ACADEMY", pattern="^(ACADEMY|SCHOOL|AFTER_SCHOOL|ACTIVITY|OTHER)$")
    starts_at: datetime
    ends_at: datetime | None = None
    source: str = Field(default="MANUAL", pattern="^(MANUAL|NOTICE)$")
    repeat_days: list[int] = Field(default_factory=list)
    repeat_until: date | None = None
    repeat_dates: list[date] = Field(default_factory=list)


class ScheduleUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    starts_at: datetime
    ends_at: datetime | None = None
    kind: str = Field(default="ROUTINE", pattern="^(WORK|ROUTINE)$")
    update_scope: str = Field(default="SINGLE", pattern="^(SINGLE|FUTURE)$")


class ChildScheduleUpdate(BaseModel):
    child_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)
    category: str = Field(default="ACADEMY", pattern="^(ACADEMY|SCHOOL|AFTER_SCHOOL|ACTIVITY|OTHER)$")
    starts_at: datetime
    ends_at: datetime | None = None
    update_scope: str = Field(default="SINGLE", pattern="^(SINGLE|FUTURE)$")


def recurring_occurrences(starts_at: datetime, ends_at: datetime, repeat_days: list[int], repeat_until: date | None,
                          repeat_dates: list[date] | None = None):
    if ends_at <= starts_at:
        raise HTTPException(422, "종료 시각은 시작 시각보다 늦어야 합니다")
    days = sorted(set(repeat_days))
    dates = sorted(set(repeat_dates or []))
    if any(day < 0 or day > 6 for day in days):
        raise HTTPException(422, "반복 요일은 월요일 0부터 일요일 6 사이여야 합니다")
    if dates:
        if days:
            raise HTTPException(422, "반복 요일과 특정 날짜를 동시에 입력할 수 없습니다")
        if dates[0] < starts_at.date() or dates[-1] > starts_at.date() + timedelta(days=366):
            raise HTTPException(422, "반복 날짜는 시작일부터 최대 1년 안으로 선택해주세요")
        duration = ends_at - starts_at
        return [(starts_at + timedelta(days=(day - starts_at.date()).days),
                 starts_at + timedelta(days=(day - starts_at.date()).days) + duration) for day in dates]
    if not days and repeat_until is None:
        return [(starts_at, ends_at)]
    if not days or repeat_until is None:
        raise HTTPException(422, "반복 일정은 요일과 종료일을 함께 입력해야 합니다")
    if repeat_until < starts_at.date():
        raise HTTPException(422, "반복 종료일은 시작일보다 빠를 수 없습니다")
    if repeat_until > starts_at.date() + timedelta(days=366):
        raise HTTPException(422, "반복 일정은 최대 1년까지 등록할 수 있습니다")
    duration = ends_at - starts_at
    occurrences = []
    current = starts_at
    while current.date() <= repeat_until:
        if current.weekday() in days:
            occurrences.append((current, current + duration))
        current += timedelta(days=1)
    if not occurrences:
        raise HTTPException(422, "선택한 기간에 등록할 반복 일정이 없습니다")
    return occurrences


def normalize_schedule_end(starts_at: datetime, ends_at: datetime | None) -> tuple[datetime, bool]:
    """Store point-in-time events as a one-minute range for overlap calculations."""
    if ends_at is None:
        return starts_at + timedelta(minutes=1), False
    if ends_at <= starts_at:
        raise HTTPException(422, "종료 시각은 시작 시각보다 늦어야 합니다")
    return ends_at, True


def schedule_detail(category: str, starts_at: str, ends_at: str, has_end_time: bool) -> str:
    return f"{category} · {starts_at}" + (f" ~ {ends_at}" if has_end_time else "")


def flag_schedule_collisions(db, schedule_title: str, collisions: list[dict]) -> None:
    for collision in {item["assignment_id"]: item for item in collisions}.values():
        db.execute(
            """UPDATE care_assignment SET status = CASE WHEN status = 'ACCEPTED'
               THEN 'RECONFIRMATION_REQUIRED' ELSE 'CANCELED' END WHERE id = ?""",
            (collision["assignment_id"],),
        )
        db.execute("UPDATE care_item SET status = 'CONFIRMED' WHERE id = ?", (collision["item_id"],))
        notify(db, owner_id(db), "일정 충돌 감지",
               f"{schedule_title} 일정과 {collision['title']} 배정이 겹칩니다. 새 담당자를 선택해주세요.",
               "IMPORTANT", "CARE_SUGGESTION", collision["item_id"])
        pending = db.execute(
            "SELECT id FROM care_exception WHERE assignment_id = ? AND status = 'PENDING'",
            (collision["assignment_id"],),
        ).fetchone()
        alternatives = rank_members(
            db, family_id(), collision["starts_at"],
            exclude_member_id=collision["assignee_id"], target_child_id=collision["child_id"],
        )
        alternative = next((candidate for candidate in alternatives if candidate["available"]), None)
        if not pending and alternative:
            db.execute(
                """INSERT INTO care_exception
                   (id, family_id, assignment_id, reason, alternative_member_id, status, created_at)
                   VALUES (?, ?, ?, ?, ?, 'PENDING', ?)""",
                (str(uuid4()), family_id(), collision["assignment_id"],
                 f"{schedule_title} 일정과 {collision['title']} 돌봄이 겹쳐요.",
                 alternative["member_id"], now()),
            )


class IntakeCreate(BaseModel):
    raw_content: str = Field(min_length=1, max_length=10000)
    child_id: str | None = None
    input_type: str = Field(default="TEXT", pattern="^(TEXT|PHOTO_TRANSCRIPT)$")


class ItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    detail: str | None = Field(default=None, max_length=2000)
    item_type: str | None = Field(default=None, pattern="^(SCHEDULE|SUPPLY|TODO|CHANGE)$")
    starts_at: datetime | None = None


class AssignmentCreate(BaseModel):
    item_id: str
    assignee_id: str
    source: str = Field(default="ROLE_MATCH", pattern="^(ROLE_MATCH|MANUAL|EXCEPTION)$")


class AssignmentResponse(BaseModel):
    decision: str = Field(pattern="^(ACCEPTED|REJECTED)$")


class CompleteRequest(BaseModel):
    note: str = Field(default="", max_length=2000)


class ExceptionCreate(BaseModel):
    assignment_id: str
    alternative_member_id: str
    reason: str = Field(min_length=1, max_length=500)


class PermissionUpdate(BaseModel):
    scope: str = Field(pattern="^(CHILD_DETAIL|LOCATION|HEALTH|NOTE|PHOTO|SCHEDULE_DETAIL)$")
    is_allowed: bool


class NotificationPreferenceUpdate(BaseModel):
    app_enabled: bool | None = None
    daily_digest_enabled: bool | None = None


@app.get("/api/health")
def health():
    return {"status": "ok", "mode": "local-demo"}


@app.get("/api/public-config")
def public_config():
    """Return browser-safe integration keys sourced from the backend environment."""
    return {"kakao_javascript_key": setting("KAKAO_JAVASCRIPT_KEY")}


@app.get("/api/bootstrap")
def bootstrap():
    utc_now = datetime.now(timezone.utc)
    online_cutoff = (utc_now - timedelta(minutes=2)).isoformat()
    with database() as db:
        return {
            "family": one(db, "SELECT * FROM family_group WHERE id = ?", (family_id(),)),
            "members": rows(db, """SELECT m.*, CASE WHEN EXISTS (
                SELECT 1 FROM family_session s WHERE s.family_id = m.family_id AND s.member_id = m.id
                AND s.expires_at > ? AND s.last_seen_at >= ?
              ) THEN 1 ELSE 0 END AS is_online
              FROM family_member m WHERE m.family_id = ?
              ORDER BY CASE WHEN m.created_at = '' THEN 1 ELSE 0 END, m.created_at, m.is_owner DESC, m.name""",
              (utc_now.isoformat(), online_cutoff, family_id())),
            "children": rows(db, "SELECT * FROM child WHERE family_id = ?", (family_id(),)),
            "schedules": rows(
                db,
                """SELECT s.id, s.family_id, s.member_id,
                   CASE WHEN s.member_id = ? OR EXISTS (
                     SELECT 1 FROM family_data_permission p
                     WHERE p.member_id = s.member_id AND p.scope = 'SCHEDULE_DETAIL' AND p.is_allowed = 1
                   ) THEN s.title ELSE '바쁨' END AS title,
                   s.starts_at, s.ends_at, s.has_end_time, s.kind, s.external_source, s.external_id,
                   s.recurrence_id, s.recurrence_rule
                   FROM personal_schedule s WHERE s.family_id = ? ORDER BY s.starts_at"""
                if authenticated() else
                "SELECT * FROM personal_schedule WHERE family_id = ? ORDER BY starts_at",
                (current_member_id(), family_id()) if authenticated() else (family_id(),),
            ),
            "child_schedules": rows(
                db,
                "SELECT * FROM child_schedule WHERE family_id = ? ORDER BY starts_at",
                (family_id(),),
            ),
            "items": rows(db, "SELECT * FROM care_item WHERE family_id = ? ORDER BY starts_at, created_at", (family_id(),)),
            "assignments": rows(db, "SELECT * FROM care_assignment WHERE family_id = ? ORDER BY created_at", (family_id(),)),
            "exceptions": rows(db, "SELECT * FROM care_exception WHERE family_id = ? ORDER BY created_at DESC", (family_id(),)),
            "handoffs": rows(db, "SELECT * FROM care_handoff WHERE family_id = ? ORDER BY status DESC, id DESC", (family_id(),)),
            "notifications": rows(
                db,
                """SELECT * FROM notification WHERE family_id = ?
                   AND (member_id IS NULL OR member_id = ?) ORDER BY created_at DESC"""
                if authenticated() else
                "SELECT * FROM notification WHERE family_id = ? ORDER BY created_at DESC",
                (family_id(), current_member_id()) if authenticated() else (family_id(),),
            ),
            "permissions": rows(db, "SELECT p.* FROM family_data_permission p JOIN family_member m ON m.id = p.member_id WHERE m.family_id = ?", (family_id(),)),
            "notification_preferences": rows(db, "SELECT p.* FROM notification_preference p JOIN family_member m ON m.id = p.member_id WHERE m.family_id = ?", (family_id(),)),
        }


@app.post("/api/children", status_code=201)
def create_child(payload: ChildCreate):
    with database() as db:
        family = one(db, "SELECT * FROM family_group WHERE id = ?", (family_id(),))
        count = db.execute("SELECT COUNT(*) FROM child WHERE family_id = ?", (family_id(),)).fetchone()[0]
        if family["plan"] == "FREE" and count >= 2:
            raise HTTPException(403, detail={"code": "PLAN_LIMIT", "message": "무료 플랜은 자녀 2명까지 등록할 수 있습니다"})
        child_id = str(uuid4())
        db.execute("INSERT INTO child VALUES (?, ?, ?, ?)", (child_id, family_id(), payload.name, payload.age_label))
        return one(db, "SELECT * FROM child WHERE id = ?", (child_id,))


@app.post("/api/members", status_code=201)
def create_member(payload: MemberCreate):
    with database() as db:
        require_owner(db)
        family = one(db, "SELECT * FROM family_group WHERE id = ?", (family_id(),))
        count = db.execute("SELECT COUNT(*) FROM family_member WHERE family_id = ? AND status != 'REMOVED'", (family_id(),)).fetchone()[0]
        if family["plan"] == "FREE" and count >= 3:
            raise HTTPException(403, detail={"code": "PLAN_LIMIT", "message": "무료 플랜은 돌봄 구성원 3명까지 등록할 수 있습니다"})
        member_id = str(uuid4())
        db.execute(
            "INSERT INTO family_member(id, family_id, name, role, status, created_at) VALUES (?, ?, ?, ?, 'PENDING', ?)",
            (member_id, family_id(), payload.name, payload.role, now()),
        )
        notify(db, owner_id(db), "구성원 초대 대기", f"{payload.name}님의 초대 수락이 필요합니다")
        return one(db, "SELECT * FROM family_member WHERE id = ?", (member_id,))


@app.post("/api/members/{member_id}/accept")
def accept_member(member_id: str):
    with database() as db:
        member = one(db, "SELECT * FROM family_member WHERE id = ? AND family_id = ?", (member_id, family_id()))
        if member["status"] != "PENDING":
            raise HTTPException(409, "대기 중인 초대만 수락할 수 있습니다")
        db.execute("UPDATE family_member SET status = 'ACTIVE' WHERE id = ?", (member_id,))
        return one(db, "SELECT * FROM family_member WHERE id = ?", (member_id,))


def deactivate_family_member(db, target_member_id: str) -> dict:
    member = one(db, "SELECT * FROM family_member WHERE id = ? AND family_id = ?", (target_member_id, family_id()))
    if member["status"] == "REMOVED":
        raise HTTPException(409, "이미 가족방에서 나간 구성원입니다")
    item_rows = db.execute(
        """SELECT item_id FROM care_assignment WHERE family_id = ? AND assignee_id = ?
           AND status IN ('PROPOSED', 'ACCEPTED')""",
        (family_id(), target_member_id),
    ).fetchall()
    db.execute(
        """UPDATE care_assignment SET status = 'CANCELED' WHERE family_id = ? AND assignee_id = ?
           AND status IN ('PROPOSED', 'ACCEPTED')""",
        (family_id(), target_member_id),
    )
    for item in item_rows:
        db.execute("UPDATE care_item SET status = 'CONFIRMED' WHERE id = ?", (item["item_id"],))
    db.execute("DELETE FROM personal_schedule WHERE family_id = ? AND member_id = ?", (family_id(), target_member_id))
    db.execute("DELETE FROM calendar_oauth_state WHERE family_id = ? AND member_id = ?", (family_id(), target_member_id))
    db.execute("DELETE FROM calendar_connection WHERE family_id = ? AND member_id = ?", (family_id(), target_member_id))
    db.execute("DELETE FROM family_session WHERE family_id = ? AND member_id = ?", (family_id(), target_member_id))
    db.execute("UPDATE family_member SET status = 'REMOVED' WHERE id = ?", (target_member_id,))
    return one(db, "SELECT * FROM family_member WHERE id = ?", (target_member_id,))


@app.post("/api/members/{target_member_id}/remove")
def remove_family_member(target_member_id: str):
    with database() as db:
        require_owner(db)
        if target_member_id == current_member_id():
            raise HTTPException(422, "본인은 퇴장시킬 수 없습니다")
        target = one(db, "SELECT * FROM family_member WHERE id = ? AND family_id = ?", (target_member_id, family_id()))
        if target["is_owner"]:
            raise HTTPException(422, "주돌봄자는 퇴장시킬 수 없습니다")
        return deactivate_family_member(db, target_member_id)


@app.post("/api/members/{target_member_id}/transfer-ownership")
def transfer_family_ownership(target_member_id: str):
    if not authenticated():
        raise HTTPException(401, "로그인한 가족방에서만 주돌봄자를 변경할 수 있습니다")
    with database() as db:
        require_owner(db)
        if target_member_id == current_member_id():
            raise HTTPException(409, "이미 주돌봄자입니다")
        target = one(
            db,
            "SELECT * FROM family_member WHERE id = ? AND family_id = ? AND status = 'ACTIVE'",
            (target_member_id, family_id()),
        )
        previous_owner_id = current_member_id()
        db.execute(
            "UPDATE family_member SET is_owner = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE family_id = ?",
            (target_member_id, family_id()),
        )
        notify(db, target_member_id, "주돌봄자 권한을 받았어요", "이제 가족 구성원과 가족방 설정을 관리할 수 있어요")
        return {"previous_owner_id": previous_owner_id, "owner": {**target, "is_owner": 1}}


@app.post("/api/families/leave")
def leave_family_room():
    if not authenticated():
        raise HTTPException(401, "가족방 로그인 후 나갈 수 있습니다")
    with database() as db:
        current = one(db, "SELECT * FROM family_member WHERE id = ? AND family_id = ?", (current_member_id(), family_id()))
        if current["is_owner"]:
            raise HTTPException(409, "주돌봄자는 가족방을 나갈 수 없습니다. 먼저 방장 이전 기능이 필요합니다")
        return deactivate_family_member(db, current_member_id())


@app.post("/api/schedules", status_code=201)
def create_schedule(payload: ScheduleCreate):
    normalized_end, has_end_time = normalize_schedule_end(payload.starts_at, payload.ends_at)
    occurrences = recurring_occurrences(payload.starts_at, normalized_end, payload.repeat_days, payload.repeat_until, payload.repeat_dates)
    if authenticated() and payload.member_id != current_member_id():
        raise HTTPException(403, "본인의 일정만 등록할 수 있습니다")
    with database() as db:
        one(db, "SELECT id FROM family_member WHERE id = ? AND family_id = ? AND status = 'ACTIVE'", (payload.member_id, family_id()))
        recurrence_id = str(uuid4()) if len(occurrences) > 1 else None
        recurrence_rule = (f"DATES:{','.join(map(str, sorted(set(payload.repeat_dates))))}" if payload.repeat_dates
                           else f"WEEKLY:{','.join(map(str, sorted(set(payload.repeat_days))))}:UNTIL={payload.repeat_until}") if recurrence_id else None
        created, collisions = [], []
        for start, end in occurrences:
            schedule_id = str(uuid4())
            starts_at, ends_at = start.isoformat(), end.isoformat()
            db.execute(
                """INSERT INTO personal_schedule(id, family_id, member_id, title, starts_at, ends_at,
                   has_end_time, kind, recurrence_id, recurrence_rule) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (schedule_id, family_id(), payload.member_id, payload.title, starts_at, ends_at,
                 int(has_end_time), payload.kind, recurrence_id, recurrence_rule),
            )
            created.append(one(db, "SELECT * FROM personal_schedule WHERE id = ?", (schedule_id,)))
            collisions.extend(find_schedule_collisions(db, payload.member_id, starts_at, ends_at))
        flag_schedule_collisions(db, payload.title, collisions)
        return {"schedule": created[0], "schedules": created, "scheduled_count": len(created), "collisions": collisions}


@app.patch("/api/schedules/{schedule_id}")
def update_schedule(schedule_id: str, payload: ScheduleUpdate):
    normalized_end, has_end_time = normalize_schedule_end(payload.starts_at, payload.ends_at)
    with database() as db:
        schedule = one(db, "SELECT * FROM personal_schedule WHERE id = ? AND family_id = ?", (schedule_id, family_id()))
        if schedule["member_id"] != current_member_id():
            raise HTTPException(403, "본인의 일정만 수정할 수 있습니다")
        if schedule.get("external_source"):
            raise HTTPException(409, "연동된 일정은 Google 또는 Outlook에서 수정해주세요")
        targets = [schedule]
        if payload.update_scope == "FUTURE" and schedule.get("recurrence_id"):
            targets = rows(db, """SELECT * FROM personal_schedule
                WHERE family_id = ? AND recurrence_id = ? AND starts_at >= ? ORDER BY starts_at""",
                (family_id(), schedule["recurrence_id"], schedule["starts_at"]))
        original_start = datetime.fromisoformat(schedule["starts_at"])
        time_shift = payload.starts_at - original_start
        duration = normalized_end - payload.starts_at
        collisions = []
        for target in targets:
            target_start = datetime.fromisoformat(target["starts_at"]) + time_shift
            target_end = target_start + duration
            starts_at, ends_at = target_start.isoformat(), target_end.isoformat()
            db.execute(
                """UPDATE personal_schedule SET title = ?, starts_at = ?, ends_at = ?, has_end_time = ?, kind = ?
                   WHERE id = ? AND family_id = ?""",
                (payload.title, starts_at, ends_at, int(has_end_time), payload.kind, target["id"], family_id()),
            )
            collisions.extend(find_schedule_collisions(db, schedule["member_id"], starts_at, ends_at))
        flag_schedule_collisions(db, payload.title, collisions)
        return {"schedule": one(db, "SELECT * FROM personal_schedule WHERE id = ?", (schedule_id,)),
                "collisions": collisions, "updated_count": len(targets),
                "recurring_instance_only": bool(schedule.get("recurrence_id")) and payload.update_scope == "SINGLE"}


@app.delete("/api/schedules/{schedule_id}")
def delete_schedule(schedule_id: str):
    with database() as db:
        schedule = one(db, "SELECT * FROM personal_schedule WHERE id = ? AND family_id = ?", (schedule_id, family_id()))
        if schedule["member_id"] != current_member_id():
            raise HTTPException(403, "본인의 일정만 삭제할 수 있습니다")
        if schedule.get("external_source"):
            raise HTTPException(409, "연동된 일정은 Google 또는 Outlook에서 삭제해주세요")
        db.execute("DELETE FROM personal_schedule WHERE id = ? AND family_id = ?", (schedule_id, family_id()))
        return {"deleted": True, "schedule_id": schedule_id,
                "recurring_instance_only": bool(schedule.get("recurrence_id"))}


@app.post("/api/child-schedules", status_code=201)
def create_child_schedule(payload: ChildScheduleCreate):
    normalized_end, has_end_time = normalize_schedule_end(payload.starts_at, payload.ends_at)
    occurrences = recurring_occurrences(payload.starts_at, normalized_end, payload.repeat_days, payload.repeat_until, payload.repeat_dates)
    with database() as db:
        one(db, "SELECT id FROM child WHERE id = ? AND family_id = ?", (payload.child_id, family_id()))
        recurrence_id = str(uuid4()) if len(occurrences) > 1 else None
        recurrence_rule = (f"DATES:{','.join(map(str, sorted(set(payload.repeat_dates))))}" if payload.repeat_dates
                           else f"WEEKLY:{','.join(map(str, sorted(set(payload.repeat_days))))}:UNTIL={payload.repeat_until}") if recurrence_id else None
        created, care_item_ids = [], []
        for start, end in occurrences:
            schedule_id = str(uuid4())
            db.execute(
                """INSERT INTO child_schedule(id, family_id, child_id, title, category,
                   starts_at, ends_at, has_end_time, source, created_at, recurrence_id, recurrence_rule)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (schedule_id, family_id(), payload.child_id, payload.title, payload.category,
                 start.isoformat(), end.isoformat(), int(has_end_time), payload.source, now(), recurrence_id, recurrence_rule),
            )
            created.append(one(db, "SELECT * FROM child_schedule WHERE id = ?", (schedule_id,)))
            care_item_id = str(uuid4())
            db.execute(
                """INSERT INTO care_item(id, family_id, child_id, child_schedule_id, item_type,
                   title, detail, starts_at, confidence, status, created_at)
                   VALUES (?, ?, ?, ?, 'SCHEDULE', ?, ?, ?, 'HIGH', 'CONFIRMED', ?)""",
                (care_item_id, family_id(), payload.child_id, schedule_id, payload.title,
                 schedule_detail(payload.category, start.isoformat(), end.isoformat(), has_end_time), start.isoformat(), now()),
            )
            care_item_ids.append(care_item_id)
        suggestions = rank_members(db, family_id(), created[0]["starts_at"], target_child_id=payload.child_id)
        best = next((candidate for candidate in suggestions if candidate["available"]), suggestions[0] if suggestions else None)
        owner = owner_id(db)
        if best:
            notify(db, owner, "돌봄 담당 추천이 도착했어요",
                   f"{payload.title} 일정에 {best['name']}님을 우선 제안해요. 확인 후 요청을 보내주세요.",
                   "IMPORTANT", "CARE_SUGGESTION", care_item_ids[0])
        return {**created[0], "schedules": created, "scheduled_count": len(created),
                "care_item_id": care_item_ids[0], "care_item_ids": care_item_ids,
                "suggestions": suggestions}


@app.patch("/api/child-schedules/{schedule_id}")
def update_child_schedule(schedule_id: str, payload: ChildScheduleUpdate):
    normalized_end, has_end_time = normalize_schedule_end(payload.starts_at, payload.ends_at)
    with database() as db:
        actor_id = current_member_id()
        one(db, "SELECT id FROM family_member WHERE id = ? AND family_id = ? AND status = 'ACTIVE'", (actor_id, family_id()))
        schedule = one(db, "SELECT * FROM child_schedule WHERE id = ? AND family_id = ?", (schedule_id, family_id()))
        one(db, "SELECT id FROM child WHERE id = ? AND family_id = ?", (payload.child_id, family_id()))
        targets = [schedule]
        if payload.update_scope == "FUTURE" and schedule.get("recurrence_id"):
            targets = rows(db, """SELECT * FROM child_schedule
                WHERE family_id = ? AND recurrence_id = ? AND starts_at >= ? ORDER BY starts_at""",
                (family_id(), schedule["recurrence_id"], schedule["starts_at"]))
        original_start = datetime.fromisoformat(schedule["starts_at"])
        time_shift = payload.starts_at - original_start
        duration = normalized_end - payload.starts_at
        care_item_id = None
        all_suggestions = []
        for target in targets:
            target_start = datetime.fromisoformat(target["starts_at"]) + time_shift
            target_end = target_start + duration
            starts_at, ends_at = target_start.isoformat(), target_end.isoformat()
            db.execute(
                """UPDATE child_schedule SET child_id = ?, title = ?, category = ?, starts_at = ?, ends_at = ?, has_end_time = ?
                   WHERE id = ? AND family_id = ?""",
                (payload.child_id, payload.title, payload.category, starts_at, ends_at, int(has_end_time), target["id"], family_id()),
            )
            care_items = rows(db, "SELECT id FROM care_item WHERE child_schedule_id = ? AND family_id = ?", (target["id"], family_id()))
            for care_item in care_items:
                care_item_id = care_item_id or care_item["id"]
                db.execute(
                    """UPDATE care_item SET child_id = ?, title = ?, detail = ?, starts_at = ?
                       WHERE id = ? AND family_id = ?""",
                    (payload.child_id, payload.title, schedule_detail(payload.category, starts_at, ends_at, has_end_time),
                     starts_at, care_item["id"], family_id()),
                )
                assignments = rows(db, """SELECT id, assignee_id, status FROM care_assignment
                    WHERE item_id = ? AND family_id = ? AND status IN ('PROPOSED', 'CANDIDATE_ACCEPTED', 'ACCEPTED')""",
                    (care_item["id"], family_id()))
                for assignment in assignments:
                    replacement_status = "RECONFIRMATION_REQUIRED" if assignment["status"] == "ACCEPTED" else "CANCELED"
                    db.execute("UPDATE care_assignment SET status = ? WHERE id = ?", (replacement_status, assignment["id"]))
                    notify(db, assignment["assignee_id"], "담당 일정이 변경됐어요",
                           f"{payload.title} · {starts_at}", "IMPORTANT", "ASSIGNMENT_REQUEST", assignment["id"])
                if assignments:
                    db.execute("UPDATE care_item SET status = 'CONFIRMED' WHERE id = ?", (care_item["id"],))
            all_suggestions = rank_members(db, family_id(), starts_at, target_child_id=payload.child_id)
        suggestions = all_suggestions
        owner = owner_id(db)
        if actor_id != owner:
            actor = one(db, "SELECT name FROM family_member WHERE id = ?", (actor_id,))
            notify(db, owner, "아이 일정이 변경됐어요",
                   f"{actor['name']}님이 {payload.title} 일정을 변경했어요. 새 담당자를 확인해주세요.",
                   "IMPORTANT", "CARE_SUGGESTION", care_item_id)
        elif care_item_id:
            notify(db, owner, "변경 일정의 담당자를 다시 확인해주세요", payload.title,
                   "IMPORTANT", "CARE_SUGGESTION", care_item_id)
        return {"schedule": one(db, "SELECT * FROM child_schedule WHERE id = ?", (schedule_id,)),
                "care_item_id": care_item_id, "suggestions": suggestions,
                "updated_count": len(targets),
                "recurring_instance_only": bool(schedule.get("recurrence_id")) and payload.update_scope == "SINGLE"}


@app.delete("/api/child-schedules/{schedule_id}")
def delete_child_schedule(schedule_id: str):
    with database() as db:
        require_owner(db)
        schedule = one(db, "SELECT * FROM child_schedule WHERE id = ? AND family_id = ?", (schedule_id, family_id()))
        care_items = rows(db, "SELECT id FROM care_item WHERE child_schedule_id = ? AND family_id = ?", (schedule_id, family_id()))
        for care_item in care_items:
            if db.execute("SELECT 1 FROM care_assignment WHERE item_id = ? AND family_id = ?", (care_item["id"], family_id())).fetchone():
                raise HTTPException(409, "담당자가 배정된 아이 일정은 담당 요청을 먼저 정리해주세요")
        for care_item in care_items:
            db.execute("DELETE FROM notification WHERE family_id = ? AND action_type = 'CARE_SUGGESTION' AND action_id = ?",
                       (family_id(), care_item["id"]))
            db.execute("DELETE FROM care_item WHERE id = ? AND family_id = ?", (care_item["id"], family_id()))
        db.execute("DELETE FROM child_schedule WHERE id = ? AND family_id = ?", (schedule_id, family_id()))
        return {"deleted": True, "schedule_id": schedule_id,
                "recurring_instance_only": bool(schedule.get("recurrence_id"))}


def store_intake(payload: IntakeCreate, parsed_items: list[dict]):
    with database() as db:
        if payload.child_id:
            one(db, "SELECT id FROM child WHERE id = ? AND family_id = ?", (payload.child_id, family_id()))
        intake_id = str(uuid4())
        db.execute(
            "INSERT INTO care_intake VALUES (?, ?, ?, ?, ?, ?)",
            (intake_id, family_id(), payload.child_id, payload.raw_content, payload.input_type, now()),
        )
        created = []
        registered_child_schedules = []
        for item in parsed_items:
            item_id = str(uuid4())
            parsed_start = item.get("starts_at") if item["item_type"] in {"SCHEDULE", "CHANGE"} else None
            child_schedule_id = None
            if payload.child_id and parsed_start:
                try:
                    start_value = datetime.fromisoformat(str(parsed_start).replace("Z", "+00:00"))
                    parsed_end = item.get("ends_at")
                    end_value, has_end_time = normalize_schedule_end(
                        start_value,
                        datetime.fromisoformat(str(parsed_end).replace("Z", "+00:00")) if parsed_end else None,
                    )
                    child_schedule_id = str(uuid4())
                    category = item.get("category") if item.get("category") in {
                        "ACADEMY", "SCHOOL", "AFTER_SCHOOL", "ACTIVITY", "OTHER"
                    } else "OTHER"
                    db.execute(
                        """INSERT INTO child_schedule(id, family_id, child_id, title, category,
                           starts_at, ends_at, has_end_time, source, created_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NOTICE', ?)""",
                        (child_schedule_id, family_id(), payload.child_id, item["title"], category,
                         start_value.isoformat(), end_value.isoformat(), int(has_end_time), now()),
                    )
                    registered_child_schedules.append(one(db, "SELECT * FROM child_schedule WHERE id = ?", (child_schedule_id,)))
                except (ValueError, TypeError, HTTPException):
                    parsed_start = None
                    child_schedule_id = None
            status = "CONFIRMED" if child_schedule_id else "NEEDS_REVIEW"
            db.execute(
                """INSERT INTO care_item(id, family_id, intake_id, child_id, child_schedule_id,
                   item_type, title, detail, starts_at, confidence, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (item_id, family_id(), intake_id, payload.child_id, child_schedule_id, item["item_type"],
                 item["title"], item.get("detail", ""), parsed_start, item["confidence"], status, now()),
            )
            created.append(one(db, "SELECT * FROM care_item WHERE id = ?", (item_id,)))
            if child_schedule_id:
                ranked = rank_members(db, family_id(), str(parsed_start), target_child_id=payload.child_id)
                best = next((candidate for candidate in ranked if candidate["available"]), ranked[0] if ranked else None)
                if best:
                    notify(db, owner_id(db), "알림장 일정과 담당 추천이 도착했어요",
                           f"{item['title']} 일정을 등록하고 {best['name']}님을 우선 제안했어요.",
                           "IMPORTANT", "CARE_SUGGESTION", item_id)
        if created:
            review_count = sum(1 for item in created if item["status"] == "NEEDS_REVIEW")
            if review_count:
                notify(db, owner_id(db), "새 돌봄 정보 확인", f"{review_count}개 항목을 확인하고 저장해주세요")
        return {"intake_id": intake_id, "items": created,
                "registered_child_schedules": registered_child_schedules,
                "requires_review": any(item["status"] == "NEEDS_REVIEW" for item in created)}


@app.post("/api/intakes", status_code=201)
def create_intake(payload: IntakeCreate):
    return store_intake(payload, classify_lines(payload.raw_content))


@app.patch("/api/items/{item_id}")
def update_item(item_id: str, payload: ItemUpdate):
    with database() as db:
        one(db, "SELECT id FROM care_item WHERE id = ? AND family_id = ?", (item_id, family_id()))
        updates = payload.model_dump(exclude_unset=True)
        if "starts_at" in updates and updates["starts_at"] is not None:
            updates["starts_at"] = updates["starts_at"].isoformat()
        updates = {key: value for key, value in updates.items() if value is not None}
        if not updates:
            return one(db, "SELECT * FROM care_item WHERE id = ?", (item_id,))
        sql = ", ".join(f"{key} = ?" for key in updates)
        db.execute(f"UPDATE care_item SET {sql} WHERE id = ?", (*updates.values(), item_id))
        return one(db, "SELECT * FROM care_item WHERE id = ?", (item_id,))


@app.post("/api/items/{item_id}/confirm")
def confirm_item(item_id: str):
    with database() as db:
        item = one(db, "SELECT * FROM care_item WHERE id = ? AND family_id = ?", (item_id, family_id()))
        if item["status"] not in ["NEEDS_REVIEW", "CONFIRMED"]:
            raise HTTPException(409, "이 항목은 확인할 수 없습니다")
        if (item["item_type"] in {"SCHEDULE", "CHANGE"} and item.get("child_id")
                and item.get("starts_at") and not item.get("child_schedule_id")):
            start_value = datetime.fromisoformat(item["starts_at"])
            end_value = start_value + timedelta(minutes=1)
            schedule_id = str(uuid4())
            db.execute(
                """INSERT INTO child_schedule(id, family_id, child_id, title, category,
                   starts_at, ends_at, has_end_time, source, created_at)
                   VALUES (?, ?, ?, ?, 'OTHER', ?, ?, 0, 'NOTICE', ?)""",
                (schedule_id, family_id(), item["child_id"], item["title"],
                 start_value.isoformat(), end_value.isoformat(), now()),
            )
            db.execute("UPDATE care_item SET child_schedule_id = ? WHERE id = ?", (schedule_id, item_id))
            ranked = rank_members(db, family_id(), item["starts_at"], target_child_id=item["child_id"])
            if ranked:
                notify(db, owner_id(db), "아이 일정 담당자를 선택해주세요",
                       f"{item['title']} 일정에 가능한 가족을 추천했어요.",
                       "IMPORTANT", "CARE_SUGGESTION", item_id)
        db.execute("UPDATE care_item SET status = 'CONFIRMED' WHERE id = ?", (item_id,))
        return one(db, "SELECT * FROM care_item WHERE id = ?", (item_id,))


@app.get("/api/items/{item_id}/suggestions")
def suggestions(item_id: str):
    with database() as db:
        item = one(db, "SELECT * FROM care_item WHERE id = ? AND family_id = ?", (item_id, family_id()))
        if item["status"] == "NEEDS_REVIEW":
            raise HTTPException(409, "항목을 먼저 확인해주세요")
        return {"item": item, "suggestions": rank_members(
            db, family_id(), item["starts_at"], target_child_id=item.get("child_id")
        ), "engine": "CARE_SCHEDULE_AGENT"}


@app.post("/api/assignments", status_code=201)
def create_assignment(payload: AssignmentCreate):
    with database() as db:
        item = one(db, "SELECT * FROM care_item WHERE id = ? AND family_id = ?", (payload.item_id, family_id()))
        if item["status"] == "NEEDS_REVIEW":
            raise HTTPException(409, "미확인 항목은 배정할 수 없습니다")
        member = one(db, "SELECT * FROM family_member WHERE id = ? AND family_id = ? AND status = 'ACTIVE'", (payload.assignee_id, family_id()))
        duplicate = db.execute(
            """SELECT 1 FROM care_assignment WHERE item_id = ? AND assignee_id = ?
               AND status IN ('PROPOSED', 'CANDIDATE_ACCEPTED', 'ACCEPTED')""",
            (payload.item_id, payload.assignee_id),
        ).fetchone()
        if duplicate:
            raise HTTPException(409, "이 가족에게 이미 요청을 보냈습니다")
        if db.execute(
            "SELECT 1 FROM care_assignment WHERE item_id = ? AND status = 'ACCEPTED'", (payload.item_id,)
        ).fetchone():
            raise HTTPException(409, "이미 확정된 담당자가 있습니다")
        assignment_id = str(uuid4())
        self_assignment = authenticated() and payload.assignee_id == current_member_id()
        created_at = now()
        db.execute(
            """INSERT INTO care_assignment(id, family_id, item_id, assignee_id, status, source,
               created_at, responded_at, requested_by_member_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (assignment_id, family_id(), payload.item_id, payload.assignee_id,
             "ACCEPTED" if self_assignment else "PROPOSED", payload.source, created_at,
             created_at if self_assignment else None, current_member_id()),
        )
        if self_assignment:
            db.execute("UPDATE care_item SET status = 'ASSIGNED' WHERE id = ?", (payload.item_id,))
            return one(db, "SELECT * FROM care_assignment WHERE id = ?", (assignment_id,))
        requester = one(db, "SELECT name FROM family_member WHERE id = ?", (current_member_id(),))
        notify(db, member["id"], "새 돌봄 배정 요청",
               f"{requester['name']}님이 {item['title']} 담당을 요청했어요", "IMPORTANT",
               "ASSIGNMENT_REQUEST", assignment_id)
        return one(db, "SELECT * FROM care_assignment WHERE id = ?", (assignment_id,))


@app.post("/api/assignments/{assignment_id}/respond")
def respond_assignment(assignment_id: str, payload: AssignmentResponse):
    with database() as db:
        assignment = one(db, "SELECT * FROM care_assignment WHERE id = ? AND family_id = ?", (assignment_id, family_id()))
        if authenticated() and assignment["assignee_id"] != current_member_id():
            raise HTTPException(403, "배정 대상자만 응답할 수 있습니다")
        if assignment["status"] != "PROPOSED":
            raise HTTPException(409, "대기 중인 배정만 응답할 수 있습니다")
        item = one(db, "SELECT * FROM care_item WHERE id = ?", (assignment["item_id"],))
        if payload.decision == "ACCEPTED":
            has_other_candidates = db.execute(
                """SELECT 1 FROM care_assignment WHERE item_id = ? AND id <> ?
                   AND status IN ('PROPOSED', 'CANDIDATE_ACCEPTED')""",
                (item["id"], assignment_id),
            ).fetchone()
            if has_other_candidates:
                db.execute(
                    "UPDATE care_assignment SET status = 'CANDIDATE_ACCEPTED', responded_at = ? WHERE id = ?",
                    (now(), assignment_id),
                )
                notify(db, assignment.get("requested_by_member_id") or owner_id(db), "담당 가능 응답이 도착했어요",
                       f"{item['title']} 요청을 수락한 가족이 있어요. 최종 담당자로 확정해주세요.",
                       "IMPORTANT", "ASSIGNMENT_RESULT", assignment_id)
                return one(db, "SELECT * FROM care_assignment WHERE id = ?", (assignment_id,))
            db.execute(
                "UPDATE care_assignment SET status = 'ACCEPTED', responded_at = ? WHERE id = ?",
                (now(), assignment_id),
            )
            db.execute("UPDATE care_item SET status = 'ASSIGNED' WHERE id = ?", (item["id"],))
            handoff_id = str(uuid4())
            db.execute(
                """INSERT INTO care_handoff(id, family_id, assignment_id, from_member_id,
                   to_member_id, briefing, status, acknowledged_at)
                   VALUES (?, ?, ?, ?, ?, ?, 'PENDING', NULL)""",
                (handoff_id, family_id(), assignment_id, owner_id(db), assignment["assignee_id"], f"{item['title']} · {item['detail']}".strip(" ·")),
            )
            notify(db, assignment.get("requested_by_member_id") or owner_id(db), "배정이 확정됐어요", f"{item['title']} 담당 요청을 수락했어요",
                   action_type="ASSIGNMENT_RESULT", action_id=assignment_id)
        else:
            db.execute(
                "UPDATE care_assignment SET status = 'REJECTED', responded_at = ? WHERE id = ?",
                (now(), assignment_id),
            )
            notify(db, assignment.get("requested_by_member_id") or owner_id(db), "배정 요청이 거절됐어요", f"{item['title']}의 다른 담당자를 선택해주세요", "IMPORTANT",
                   "ASSIGNMENT_RESULT", assignment_id)
            remaining = db.execute(
                """SELECT 1 FROM care_assignment WHERE item_id = ?
                   AND status IN ('PROPOSED', 'CANDIDATE_ACCEPTED', 'ACCEPTED')""", (item["id"],)
            ).fetchone()
            if not remaining:
                notify(db, owner_id(db), "가능한 가족이 없어요",
                       f"{item['title']} 요청을 모두 확인했지만 맡을 수 있는 가족이 없어요.",
                       "IMPORTANT", "CARE_SUGGESTION", item["id"])
        return one(db, "SELECT * FROM care_assignment WHERE id = ?", (assignment_id,))


@app.post("/api/assignments/{assignment_id}/confirm")
def confirm_assignment(assignment_id: str):
    """Let the primary caregiver choose one responder after sending parallel requests."""
    with database() as db:
        require_owner(db)
        assignment = one(db, "SELECT * FROM care_assignment WHERE id = ? AND family_id = ?", (assignment_id, family_id()))
        if assignment["status"] != "CANDIDATE_ACCEPTED":
            raise HTTPException(409, "수락 응답이 온 후보만 최종 확정할 수 있습니다")
        item = one(db, "SELECT * FROM care_item WHERE id = ?", (assignment["item_id"],))
        timestamp = now()
        db.execute("UPDATE care_assignment SET status = 'ACCEPTED', responded_at = ? WHERE id = ?", (timestamp, assignment_id))
        db.execute(
            """UPDATE care_assignment SET status = 'CANCELED' WHERE item_id = ? AND id <> ?
               AND status IN ('PROPOSED', 'CANDIDATE_ACCEPTED', 'RECONFIRMATION_REQUIRED')""",
            (item["id"], assignment_id),
        )
        db.execute("UPDATE care_item SET status = 'ASSIGNED' WHERE id = ?", (item["id"],))
        handoff_id = str(uuid4())
        db.execute(
            """INSERT INTO care_handoff(id, family_id, assignment_id, from_member_id,
               to_member_id, briefing, status, acknowledged_at)
               VALUES (?, ?, ?, ?, ?, ?, 'PENDING', NULL)""",
            (handoff_id, family_id(), assignment_id, owner_id(db), assignment["assignee_id"],
             f"{item['title']} · {item['detail']}".strip(" ·")),
        )
        notify(db, assignment["assignee_id"], "돌봄 담당이 최종 확정됐어요", item["title"],
               "IMPORTANT", "ASSIGNMENT_REQUEST", assignment_id)
        notify(db, assignment.get("requested_by_member_id") or owner_id(db), "배정이 확정됐어요",
               f"{item['title']} 담당자를 최종 확정했어요.", action_type="ASSIGNMENT_RESULT", action_id=assignment_id)
        return one(db, "SELECT * FROM care_assignment WHERE id = ?", (assignment_id,))


@app.post("/api/assignments/{assignment_id}/complete")
def complete_assignment(assignment_id: str, payload: CompleteRequest):
    with database() as db:
        return complete_assignment_record(db, assignment_id, payload.note)


def complete_assignment_record(db, assignment_id: str, note_text: str, has_photo: bool = False) -> dict:
    assignment = one(db, "SELECT * FROM care_assignment WHERE id = ? AND family_id = ?", (assignment_id, family_id()))
    if authenticated() and assignment["assignee_id"] != current_member_id():
        raise HTTPException(403, "담당자만 완료할 수 있습니다")
    if assignment["status"] != "ACCEPTED":
        raise HTTPException(409, "수락된 배정만 완료할 수 있습니다")
    note = note_text.strip()
    db.execute(
        "UPDATE care_assignment SET status = 'COMPLETED', completed_at = ?, note = ? WHERE id = ?",
        (now(), note, assignment_id),
    )
    db.execute("UPDATE care_item SET status = 'DONE' WHERE id = ?", (assignment["item_id"],))
    item = one(db, "SELECT * FROM care_item WHERE id = ?", (assignment["item_id"],))
    owner = owner_id(db)
    next_assignment = None
    if item.get("child_id") and item.get("starts_at"):
        next_assignment = db.execute(
            """SELECT a.* FROM care_assignment a JOIN care_item i ON i.id = a.item_id
               WHERE a.family_id = ? AND i.child_id = ? AND i.starts_at > ?
                 AND a.status IN ('PROPOSED', 'ACCEPTED') AND a.assignee_id <> ?
               ORDER BY i.starts_at LIMIT 1""",
            (family_id(), item["child_id"], item["starts_at"], assignment["assignee_id"]),
        ).fetchone()
    recipient = dict(next_assignment)["assignee_id"] if next_assignment else (owner if assignment["assignee_id"] != owner else None)
    handoff_id = None
    if recipient:
        handoff_id = str(uuid4())
        details = f"{item['title']} 완료"
        if note:
            details += f" · 특이사항: {note[:160]}"
        if has_photo:
            details += " · 완료 사진 있음"
        db.execute(
            """INSERT INTO care_handoff(id, family_id, assignment_id, from_member_id,
               to_member_id, briefing, status, special_note)
               VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)""",
            (handoff_id, family_id(), assignment_id, assignment["assignee_id"], recipient, details, note),
        )
        notify(db, recipient, "다음 돌봄 인수인계가 도착했어요", details, "IMPORTANT", "HANDOFF", handoff_id)
    if owner != recipient:
        notify(db, owner, "돌봄 완료", f"{item['title']} 완료" + (f" · 특이사항: {note[:80]}" if note else " · 특이사항 없음"),
               action_type="ASSIGNMENT_RESULT", action_id=assignment_id)
    return one(db, "SELECT * FROM care_assignment WHERE id = ?", (assignment_id,))


@app.post("/api/handoffs/{handoff_id}/acknowledge")
def acknowledge_handoff(handoff_id: str):
    with database() as db:
        handoff = one(db, "SELECT * FROM care_handoff WHERE id = ? AND family_id = ?", (handoff_id, family_id()))
        from .family import authenticated, member_id
        if authenticated() and handoff["to_member_id"] != member_id():
            raise HTTPException(403, "인수인계 받는 사람만 확인할 수 있습니다")
        if handoff["status"] != "PENDING":
            raise HTTPException(409, "대기 중인 인수인계만 확인할 수 있습니다")
        db.execute("UPDATE care_handoff SET status = 'ACKNOWLEDGED', acknowledged_at = ? WHERE id = ?", (now(), handoff_id))
        return one(db, "SELECT * FROM care_handoff WHERE id = ?", (handoff_id,))


@app.post("/api/exceptions", status_code=201)
def create_exception(payload: ExceptionCreate):
    with database() as db:
        one(db, "SELECT id FROM care_assignment WHERE id = ? AND family_id = ?", (payload.assignment_id, family_id()))
        one(db, "SELECT id FROM family_member WHERE id = ? AND family_id = ? AND status = 'ACTIVE'", (payload.alternative_member_id, family_id()))
        if payload.alternative_member_id == current_member_id():
            raise HTTPException(422, "본인은 대체 담당자로 요청할 수 없습니다")
        exception_id = str(uuid4())
        db.execute(
            "INSERT INTO care_exception VALUES (?, ?, ?, ?, ?, 'PENDING', ?)",
            (exception_id, family_id(), payload.assignment_id, payload.reason, payload.alternative_member_id, now()),
        )
        notify(db, owner_id(db), "배정 대안 확인 필요", payload.reason, "IMPORTANT")
        return one(db, "SELECT * FROM care_exception WHERE id = ?", (exception_id,))


@app.post("/api/exceptions/{exception_id}/approve")
def approve_exception(exception_id: str):
    with database() as db:
        exception = one(db, "SELECT * FROM care_exception WHERE id = ? AND family_id = ?", (exception_id, family_id()))
        if exception["status"] != "PENDING":
            raise HTTPException(409, "대기 중인 대안만 승인할 수 있습니다")
        assignment = one(db, "SELECT * FROM care_assignment WHERE id = ?", (exception["assignment_id"],))
        db.execute("UPDATE care_assignment SET status = 'CANCELED' WHERE id = ?", (assignment["id"],))
        new_id = str(uuid4())
        db.execute(
            "INSERT INTO care_assignment(id, family_id, item_id, assignee_id, source, created_at) VALUES (?, ?, ?, ?, 'EXCEPTION', ?)",
            (new_id, family_id(), assignment["item_id"], exception["alternative_member_id"], now()),
        )
        db.execute("UPDATE care_exception SET status = 'APPROVED' WHERE id = ?", (exception_id,))
        notify(db, exception["alternative_member_id"], "대체 돌봄 배정 요청", "가능 여부를 확인해주세요", "IMPORTANT",
               "ASSIGNMENT_REQUEST", new_id)
        return {"exception": one(db, "SELECT * FROM care_exception WHERE id = ?", (exception_id,)), "assignment": one(db, "SELECT * FROM care_assignment WHERE id = ?", (new_id,))}


@app.patch("/api/notifications/{notification_id}/read")
def mark_notification_read(notification_id: str):
    with database() as db:
        notice = one(db, "SELECT * FROM notification WHERE id = ? AND family_id = ?", (notification_id, family_id()))
        if authenticated() and notice["member_id"] not in (None, current_member_id()):
            raise HTTPException(403, "본인의 알림만 읽을 수 있습니다")
        db.execute("UPDATE notification SET is_read = 1 WHERE id = ?", (notification_id,))
        return one(db, "SELECT * FROM notification WHERE id = ?", (notification_id,))


@app.patch("/api/members/{member_id}/permissions")
def update_permission(member_id: str, payload: PermissionUpdate):
    with database() as db:
        if authenticated() and member_id != current_member_id():
            raise HTTPException(403, "본인의 정보 공개 범위만 변경할 수 있습니다")
        one(db, "SELECT id FROM family_member WHERE id = ? AND family_id = ?", (member_id, family_id()))
        db.execute(
            """INSERT INTO family_data_permission(member_id, scope, is_allowed) VALUES (?, ?, ?)
               ON CONFLICT(member_id, scope) DO UPDATE SET is_allowed = excluded.is_allowed""",
            (member_id, payload.scope, int(payload.is_allowed)),
        )
        return one(db, "SELECT * FROM family_data_permission WHERE member_id = ? AND scope = ?", (member_id, payload.scope))


@app.patch("/api/members/{member_id}/notification-preferences")
def update_notification_preference(member_id: str, payload: NotificationPreferenceUpdate):
    with database() as db:
        if authenticated() and member_id != current_member_id():
            raise HTTPException(403, "본인의 알림 설정만 변경할 수 있습니다")
        one(db, "SELECT id FROM family_member WHERE id = ? AND family_id = ?", (member_id, family_id()))
        updates = payload.model_dump(exclude_unset=True)
        if not updates:
            raise HTTPException(422, "변경할 설정을 입력해주세요")
        db.execute("INSERT INTO notification_preference(member_id) VALUES (?) ON CONFLICT(member_id) DO NOTHING", (member_id,))
        sql = ", ".join(f"{key} = ?" for key in updates)
        db.execute(f"UPDATE notification_preference SET {sql} WHERE member_id = ?", (*[int(value) for value in updates.values()], member_id))
        return one(db, "SELECT * FROM notification_preference WHERE member_id = ?", (member_id,))


from .extended import router as extended_router
from .emergency import router as emergency_router
from .calendar import legacy_router as legacy_calendar_router, router as calendar_router
from .benefits import router as benefits_router
from .payment import router as payment_router

app.include_router(extended_router)
app.include_router(emergency_router)
app.include_router(calendar_router)
app.include_router(legacy_calendar_router)
app.include_router(benefits_router)
app.include_router(payment_router)
