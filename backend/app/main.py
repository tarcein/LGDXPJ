"""Local API for the Figma prototype and frontend/backend team handoff."""

from __future__ import annotations

import asyncio
import base64
import re
from contextlib import asynccontextmanager, suppress
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .db import close_pool, database, initialize, open_pool
from .config import setting
from .family import authenticated, family_id, member_id as current_member_id, owner_id, require_owner, resolve_bearer, reset_context, router as family_router, set_context
from .media import image_mime as _child_image_mime, media_root as _child_media_root, read_file as _read_child_file
from .performance import record_event
from .services import clean_intake_title, classify_lines, find_schedule_collisions, rank_members, split_checklist_items

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
    target_family = family_id()
    notification_id = str(uuid4())
    db.execute(
        """INSERT INTO notification(id, family_id, member_id, title, body, level, is_read,
           created_at, action_type, action_id) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)""",
        (notification_id, target_family, member_id, title[:100], body[:200], level, now(), action_type, action_id),
    )
    record_event(
        db, "notification_sent", target_family_id=target_family,
        target_member_id=member_id, correlation_id=notification_id,
        properties={"channel": "APP", "level": level, "action_type": action_type},
    )
    from .push import send_push
    token_rows = db.execute(
        "SELECT token FROM push_device_token WHERE family_id = ?" + (" AND member_id = ?" if member_id else ""),
        (target_family, member_id) if member_id else (target_family,),
    ).fetchall()
    send_push([row[0] for row in token_rows], title[:100], body[:200], action_type, action_id)


_CHILD_PHOTO_EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def _child_photo_target(child_id: str, mime: str) -> tuple[Path, str]:
    extension = _CHILD_PHOTO_EXTENSIONS[mime]
    safe_family = re.sub(r"[^A-Za-z0-9_-]", "_", family_id())
    relative = Path("children") / safe_family / f"{child_id}{extension}"
    return _child_media_root() / relative, relative.as_posix()


def _stored_child_photo(storage_path: str | None) -> Path | None:
    if not storage_path:
        return None
    root = _child_media_root()
    candidate = (root / storage_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate


def _child_payload(child: dict) -> dict:
    child = dict(child)
    candidate = _stored_child_photo(child.pop("photo_storage_path", None))
    mime = child.pop("photo_mime_type", None)
    child.pop("photo_updated_at", None)
    child["photo_url"] = (
        f"data:{mime};base64,{base64.b64encode(candidate.read_bytes()).decode('ascii')}"
        if candidate and candidate.is_file() and mime else None
    )
    return child


def _delete_child_photo_file(storage_path: str | None) -> None:
    candidate = _stored_child_photo(storage_path)
    if not candidate or not candidate.is_file():
        return
    candidate.unlink()
    root = _child_media_root()
    parent = candidate.parent
    while parent != root:
        try:
            parent.rmdir()
        except OSError:
            break
        parent = parent.parent


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize()
    open_pool()
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
        close_pool()


app = FastAPI(title="ZIPPY 가족 돌봄 API", version="0.1.0", lifespan=lifespan)
_configured_origins = [
    origin.strip().rstrip("/")
    for origin in [setting("FRONTEND_URL"), *setting("CORS_ORIGINS").split(",")]
    if origin.strip()
]
app.include_router(family_router)


@app.middleware("http")
async def family_context(request: Request, call_next):
    if ((request.url.path == "/api/families" and request.method == "POST")
            or request.url.path in {"/api/families/join", "/api/families/dev-login",
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


# Register CORS last so it also decorates responses returned directly by family_context.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:4173", "http://127.0.0.1:4173",
        "http://localhost", "https://localhost", "capacitor://localhost",
        *_configured_origins,
    ],
    allow_origin_regex=r"^http://(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):5173$",
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-Developer-Token"],
)


class ChildCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    birth_date: date | None = None
    institution: str = Field(default="", max_length=100)
    age_label: str | None = Field(default=None, min_length=1, max_length=30)


class ChildUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    birth_date: date | None = None
    institution: str | None = Field(default=None, max_length=100)
    age_label: str | None = Field(default=None, min_length=1, max_length=30)


def child_profile_values(birth_date: date | None, institution: str, fallback_age_label: str | None = None):
    normalized_institution = institution.strip()
    if birth_date:
        today = datetime.now(ZoneInfo("Asia/Seoul")).date()
        if birth_date > today:
            raise HTTPException(422, "생년월일은 오늘보다 이후일 수 없습니다")
        age = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
        age_label = f"만 {age}세"
        if normalized_institution:
            age_label += f" · {normalized_institution}"
        return birth_date.isoformat(), normalized_institution, age_label
    fallback = (fallback_age_label or "").strip()
    if not fallback:
        raise HTTPException(422, "생년월일을 선택해주세요")
    return None, normalized_institution, fallback


class MemberCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    role: str = Field(pattern="^(PARENT|GRANDPARENT|CAREGIVER)$")


class FamilyNameUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


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
    location_name: str = Field(default="", max_length=100)
    merge_same_location: bool = True
    start_assignment_required: bool = True
    start_assignee_id: str | None = None
    start_external_assignee_name: str = Field(default="", max_length=100)
    end_assignment_required: bool = True
    end_assignee_id: str | None = None
    end_external_assignee_name: str = Field(default="", max_length=100)
    # Kept for older clients. When supplied, the same family member is used for
    # both boundaries unless a boundary-specific value was provided.
    assignee_id: str | None = None
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
    location_name: str = Field(default="", max_length=100)
    merge_same_location: bool = True
    start_assignment_required: bool = True
    start_assignee_id: str | None = None
    start_external_assignee_name: str = Field(default="", max_length=100)
    end_assignment_required: bool = True
    end_assignee_id: str | None = None
    end_external_assignee_name: str = Field(default="", max_length=100)
    update_scope: str = Field(default="SINGLE", pattern="^(SINGLE|FUTURE)$")


def recurring_occurrences(starts_at: datetime, ends_at: datetime, repeat_days: list[int], repeat_until: date | None,
                          repeat_dates: list[date] | None = None):
    if ends_at <= starts_at:
        raise HTTPException(422, "종료 시각은 시작 시각보다 늦어야 합니다")
    if starts_at.tzinfo is not None:
        local_zone = ZoneInfo("Asia/Seoul")
        starts_at = starts_at.astimezone(local_zone)
        ends_at = ends_at.astimezone(local_zone)
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


def schedule_detail(category: str, starts_at: str, ends_at: str, has_end_time: bool,
                    location_name: str = "") -> str:
    detail = f"{category} · {starts_at}" + (f" ~ {ends_at}" if has_end_time else "")
    return detail + (f" · {location_name}" if location_name.strip() else "")


def flag_schedule_collisions(db, schedule_title: str, collisions: list[dict]) -> None:
    for collision in {item["assignment_id"]: item for item in collisions}.values():
        record_event(
            db, "conflict_detected", target_family_id=family_id(),
            target_member_id=current_member_id(), correlation_id=collision["item_id"],
            properties={"assignment_id": collision["assignment_id"]},
        )
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
    item_type: str | None = Field(default=None, pattern="^(SCHEDULE|SUPPLY|TODO|CHANGE|HOMEWORK)$")
    starts_at: datetime | None = None


class ItemDoneUpdate(BaseModel):
    done: bool


class HomeworkCreate(BaseModel):
    child_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)
    due_date: date | None = None


class SupplyCreate(BaseModel):
    child_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)
    due_date: date | None = None


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
    scope: str = Field(pattern="^(CHILD_DETAIL|LOCATION|HEALTH|NOTE|PHOTO|SCHEDULE_DETAIL|WORK_DETAIL)$")
    is_allowed: bool


class NotificationPreferenceUpdate(BaseModel):
    app_enabled: bool | None = None
    daily_digest_enabled: bool | None = None
    device_enabled: bool | None = None


class PushTokenCreate(BaseModel):
    token: str = Field(min_length=20, max_length=4096)
    platform: str = Field(default="ANDROID", pattern="^(ANDROID|IOS)$")


@app.get("/api/health")
def health():
    return {"status": "ok", "mode": "local-demo"}


@app.get("/api/public-config")
def public_config():
    """Return browser-safe integration keys sourced from the backend environment."""
    return {"kakao_javascript_key": setting("KAKAO_JAVASCRIPT_KEY")}


@app.post("/api/push-tokens")
def register_push_token(payload: PushTokenCreate):
    with database() as db:
        member = one(db, "SELECT id FROM family_member WHERE id = ? AND family_id = ?", (current_member_id(), family_id()))
        timestamp = now()
        db.execute(
            """INSERT INTO push_device_token(token, family_id, member_id, platform, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(token) DO UPDATE SET family_id = excluded.family_id,
                 member_id = excluded.member_id, platform = excluded.platform, updated_at = excluded.updated_at""",
            (payload.token, family_id(), member["id"], payload.platform, timestamp, timestamp),
        )
        return {"registered": True}


@app.get("/api/bootstrap")
def bootstrap(tv: bool = False):
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
            "children": [_child_payload(c) for c in rows(db, "SELECT * FROM child WHERE family_id = ?", (family_id(),))],
            "schedules": rows(
                db,
                """SELECT s.id, s.family_id, s.member_id,
                   CASE WHEN s.member_id = ? OR EXISTS (
                     SELECT 1 FROM family_data_permission p
                     WHERE p.member_id = s.member_id
                       AND p.scope = (CASE WHEN s.kind = 'WORK' THEN 'WORK_DETAIL' ELSE 'SCHEDULE_DETAIL' END)
                       AND p.is_allowed = 1
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
                if authenticated() and not tv else
                "SELECT * FROM notification WHERE family_id = ? ORDER BY created_at DESC",
                (family_id(), current_member_id()) if authenticated() and not tv else (family_id(),),
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
            record_event(
                db, "feature_limit_reached", target_family_id=family_id(),
                target_member_id=current_member_id(),
                properties={"feature": "CHILD", "current_count": count, "limit": 2},
            )
            db.commit()
            raise HTTPException(403, detail={"code": "PLAN_LIMIT", "message": "무료 플랜은 자녀 2명까지 등록할 수 있습니다"})
        child_id = str(uuid4())
        birth_date, institution, age_label = child_profile_values(payload.birth_date, payload.institution, payload.age_label)
        db.execute(
            "INSERT INTO child (id, family_id, name, age_label, birth_date, institution) VALUES (?, ?, ?, ?, ?, ?)",
            (child_id, family_id(), payload.name.strip(), age_label, birth_date, institution),
        )
        return _child_payload(one(db, "SELECT * FROM child WHERE id = ?", (child_id,)))


@app.patch("/api/children/{child_id}")
def update_child(child_id: str, payload: ChildUpdate):
    with database() as db:
        current = one(db, "SELECT * FROM child WHERE id = ? AND family_id = ?", (child_id, family_id()))
        stored_birth_date = date.fromisoformat(current["birth_date"]) if current.get("birth_date") else None
        birth_date, institution, age_label = child_profile_values(
            payload.birth_date or stored_birth_date,
            payload.institution if payload.institution is not None else current.get("institution") or "",
            payload.age_label or current["age_label"],
        )
        db.execute(
            "UPDATE child SET name = ?, age_label = ?, birth_date = ?, institution = ? WHERE id = ? AND family_id = ?",
            (payload.name.strip(), age_label, birth_date, institution, child_id, family_id()),
        )
        return _child_payload(one(db, "SELECT * FROM child WHERE id = ?", (child_id,)))


@app.post("/api/children/{child_id}/photo")
def upload_child_photo(child_id: str, file: UploadFile):
    image = _read_child_file(file, 8 * 1024 * 1024)
    mime = _child_image_mime(image)
    with database() as db:
        child = one(db, "SELECT * FROM child WHERE id = ? AND family_id = ?", (child_id, family_id()))
        target, relative = _child_photo_target(child_id, mime)
        target.parent.mkdir(parents=True, exist_ok=True)
        _delete_child_photo_file(child.get("photo_storage_path"))
        target.write_bytes(image)
        db.execute(
            "UPDATE child SET photo_storage_path = ?, photo_mime_type = ?, photo_updated_at = ? WHERE id = ?",
            (relative, mime, now(), child_id),
        )
        return _child_payload(one(db, "SELECT * FROM child WHERE id = ?", (child_id,)))


@app.delete("/api/children/{child_id}/photo")
def delete_child_photo(child_id: str):
    with database() as db:
        child = one(db, "SELECT * FROM child WHERE id = ? AND family_id = ?", (child_id, family_id()))
        _delete_child_photo_file(child.get("photo_storage_path"))
        db.execute(
            "UPDATE child SET photo_storage_path = NULL, photo_mime_type = NULL, photo_updated_at = NULL WHERE id = ?",
            (child_id,),
        )
        return _child_payload(one(db, "SELECT * FROM child WHERE id = ?", (child_id,)))


@app.post("/api/members", status_code=201)
def create_member(payload: MemberCreate):
    with database() as db:
        require_owner(db)
        family = one(db, "SELECT * FROM family_group WHERE id = ?", (family_id(),))
        count = db.execute("SELECT COUNT(*) FROM family_member WHERE family_id = ? AND status != 'REMOVED'", (family_id(),)).fetchone()[0]
        if family["plan"] == "FREE" and count >= 3:
            record_event(
                db, "feature_limit_reached", target_family_id=family_id(),
                target_member_id=current_member_id(),
                properties={"feature": "CAREGIVER", "current_count": count, "limit": 3},
            )
            db.commit()
            raise HTTPException(403, detail={"code": "PLAN_LIMIT", "message": "무료 플랜은 돌봄 구성원 3명까지 등록할 수 있습니다"})
        member_id = str(uuid4())
        db.execute(
            "INSERT INTO family_member(id, family_id, name, role, status, created_at) VALUES (?, ?, ?, ?, 'PENDING', ?)",
            (member_id, family_id(), payload.name, payload.role, now()),
        )
        notify(db, owner_id(db), "구성원 초대 대기", f"{payload.name}님의 초대 수락이 필요합니다",
               action_type="MEMBERS", action_id=member_id)
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
        notify(db, target_member_id, "주돌봄자 권한을 받았어요", "이제 가족 구성원과 가족방 설정을 관리할 수 있어요",
               action_type="MEMBERS", action_id=target_member_id)
        return {"previous_owner_id": previous_owner_id, "owner": {**target, "is_owner": 1}}


@app.post("/api/families/leave")
def leave_family_room():
    if not authenticated():
        raise HTTPException(401, "가족방 로그인 후 나갈 수 있습니다")
    with database() as db:
        current = one(db, "SELECT * FROM family_member WHERE id = ? AND family_id = ?", (current_member_id(), family_id()))
        if current["is_owner"]:
            raise HTTPException(422, "주돌봄자는 가족방 삭제를 이용해주세요")
        return deactivate_family_member(db, current_member_id())


@app.patch("/api/families")
def rename_family_room(payload: FamilyNameUpdate):
    if not authenticated():
        raise HTTPException(401, "가족방 로그인 후 이름을 변경할 수 있습니다")
    next_name = payload.name.strip()
    if not next_name:
        raise HTTPException(422, "가족방 이름을 입력해주세요")
    with database() as db:
        require_owner(db)
        db.execute("UPDATE family_group SET name = ? WHERE id = ?", (next_name, family_id()))
        return one(db, "SELECT * FROM family_group WHERE id = ?", (family_id(),))


@app.delete("/api/families")
def delete_family_room():
    """Delete an owner's family room and all data that belongs to it."""
    if not authenticated():
        raise HTTPException(401, "가족방 로그인 후 삭제할 수 있습니다")
    target_family_id = family_id()
    with database() as db:
        require_owner(db)
        member_ids = [row["id"] for row in db.execute(
            "SELECT id FROM family_member WHERE family_id = ?", (target_family_id,),
        ).fetchall()]

        # Remove children of care assignments and members before their parents.
        for table in ("performance_event", "emergency_request", "device_alert_outbox", "care_exception", "care_handoff"):
            db.execute(f"DELETE FROM {table} WHERE family_id = ?", (target_family_id,))
        db.execute("DELETE FROM media_asset WHERE family_id = ?", (target_family_id,))
        db.execute("DELETE FROM care_assignment WHERE family_id = ?", (target_family_id,))
        db.execute("DELETE FROM notification WHERE family_id = ?", (target_family_id,))
        db.execute("DELETE FROM care_item WHERE family_id = ?", (target_family_id,))
        db.execute("DELETE FROM child_schedule WHERE family_id = ?", (target_family_id,))
        db.execute("DELETE FROM personal_schedule WHERE family_id = ?", (target_family_id,))
        db.execute("DELETE FROM care_intake WHERE family_id = ?", (target_family_id,))
        db.execute("DELETE FROM calendar_oauth_state WHERE family_id = ?", (target_family_id,))
        db.execute("DELETE FROM calendar_connection WHERE family_id = ?", (target_family_id,))
        if member_ids:
            placeholders = ",".join("?" for _ in member_ids)
            db.execute(f"DELETE FROM family_data_permission WHERE member_id IN ({placeholders})", member_ids)
            db.execute(f"DELETE FROM notification_preference WHERE member_id IN ({placeholders})", member_ids)
        for table in ("family_invite_link", "family_invite_code", "family_session", "assistant_message",
                      "member_benefit_location", "daily_usage", "plan_preview", "payment_transaction",
                      "family_subscription", "family_location"):
            db.execute(f"DELETE FROM {table} WHERE family_id = ?", (target_family_id,))
        db.execute("DELETE FROM child WHERE family_id = ?", (target_family_id,))
        db.execute("DELETE FROM family_member WHERE family_id = ?", (target_family_id,))
        db.execute("DELETE FROM family_group WHERE id = ?", (target_family_id,))
    return {"deleted": True, "family_id": target_family_id}


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
            record_event(
                db, "schedule_created", target_family_id=family_id(),
                target_member_id=current_member_id(), correlation_id=schedule_id,
                properties={"schedule_type": "PERSONAL", "kind": payload.kind,
                            "recurring": bool(recurrence_id)},
            )
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
def delete_schedule(schedule_id: str, delete_scope: str = "SINGLE"):
    if delete_scope not in {"SINGLE", "FUTURE"}:
        raise HTTPException(422, "삭제 범위는 SINGLE 또는 FUTURE여야 합니다")
    with database() as db:
        schedule = one(db, "SELECT * FROM personal_schedule WHERE id = ? AND family_id = ?", (schedule_id, family_id()))
        if schedule["member_id"] != current_member_id():
            raise HTTPException(403, "본인의 일정만 삭제할 수 있습니다")
        if schedule.get("external_source"):
            raise HTTPException(409, "연동된 일정은 Google 또는 Outlook에서 삭제해주세요")
        targets = [schedule]
        if delete_scope == "FUTURE" and schedule.get("recurrence_id"):
            targets = rows(db, """SELECT * FROM personal_schedule
                WHERE family_id = ? AND recurrence_id = ? AND starts_at >= ? ORDER BY starts_at""",
                (family_id(), schedule["recurrence_id"], schedule["starts_at"]))
        for target in targets:
            if target.get("external_source"):
                raise HTTPException(409, "연동된 일정은 Google 또는 Outlook에서 삭제해주세요")
        for target in targets:
            db.execute("DELETE FROM personal_schedule WHERE id = ? AND family_id = ?", (target["id"], family_id()))
        return {"deleted": True, "schedule_id": schedule_id,
                "deleted_count": len(targets),
                "recurring_instance_only": bool(schedule.get("recurrence_id")) and delete_scope == "SINGLE"}


def _create_schedule_care_item(db, child_id: str, schedule_id: str, title: str, category: str,
                                item_starts_at: str, range_start: str, range_end: str, has_end_time: bool,
                                boundary_type: str, location_name: str = "") -> str:
    item_id = str(uuid4())
    db.execute(
        """INSERT INTO care_item(id, family_id, child_id, child_schedule_id, item_type,
           title, detail, starts_at, confidence, boundary_type, status, created_at)
           VALUES (?, ?, ?, ?, 'SCHEDULE', ?, ?, ?, 'HIGH', ?, 'CONFIRMED', ?)""",
        (item_id, family_id(), child_id, schedule_id, title,
         schedule_detail(category, range_start, range_end, has_end_time, location_name), item_starts_at,
         boundary_type, now()),
    )
    return item_id


def _schedule_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=ZoneInfo("Asia/Seoul"))


def _merged_schedule_boundaries(schedules: list[dict]) -> tuple[set[str], set[str]]:
    """Find internal care boundaries in same-place family schedule blocks.

    Same-child activities at the same normalized location always form one block
    on the same day. Different children's activities form a block when they
    overlap or are within 60 minutes. Only the earliest arrival and latest
    departure remain.
    """
    local_zone = ZoneInfo("Asia/Seoul")
    by_place_and_day: dict[tuple[str, date], list[dict]] = {}
    for schedule in schedules:
        place = (schedule.get("location_name") or "").strip().casefold()
        if not place:
            continue
        starts_at = _schedule_datetime(schedule["starts_at"])
        key = (place, starts_at.astimezone(local_zone).date())
        by_place_and_day.setdefault(key, []).append(schedule)

    suppressed_starts: set[str] = set()
    suppressed_ends: set[str] = set()
    maximum_gap = timedelta(minutes=60)

    for location_schedules in by_place_and_day.values():
        eligible = [schedule for schedule in location_schedules
                    if bool(schedule.get("merge_same_location")) and bool(schedule.get("has_end_time"))]
        visited: set[str] = set()
        for schedule in eligible:
            if schedule["id"] in visited:
                continue
            component: list[dict] = []
            stack = [schedule]
            while stack:
                current = stack.pop()
                if current["id"] in visited:
                    continue
                visited.add(current["id"])
                component.append(current)
                current_start = _schedule_datetime(current["starts_at"])
                current_end = _schedule_datetime(current["ends_at"])
                for candidate in eligible:
                    if candidate["id"] in visited:
                        continue
                    candidate_start = _schedule_datetime(candidate["starts_at"])
                    candidate_end = _schedule_datetime(candidate["ends_at"])
                    separation = max(current_start - candidate_end, candidate_start - current_end, timedelta(0))
                    if candidate["child_id"] == current["child_id"] or separation <= maximum_gap:
                        stack.append(candidate)
            if len(component) > 1:
                first = min(component, key=lambda item: (_schedule_datetime(item["starts_at"]), _schedule_datetime(item["ends_at"])))
                last = max(component, key=lambda item: (_schedule_datetime(item["ends_at"]), _schedule_datetime(item["starts_at"])))
                suppressed_starts.update(item["id"] for item in component if item["id"] != first["id"])
                suppressed_ends.update(item["id"] for item in component if item["id"] != last["id"])

    return suppressed_starts, suppressed_ends


def _reconcile_family_schedule_care_items(db) -> None:
    """Keep only meaningful care boundaries across the whole family schedule."""
    schedules = rows(
        db,
        """SELECT * FROM child_schedule
             WHERE family_id = ? ORDER BY starts_at, ends_at""",
        (family_id(),),
    )
    suppressed_starts, suppressed_ends = _merged_schedule_boundaries(schedules)
    for schedule in schedules:
        child_id = schedule["child_id"]
        has_end_time = bool(schedule.get("has_end_time"))
        desired: dict[str, tuple[str, str]] = {}
        if schedule["id"] not in suppressed_starts and bool(schedule.get("start_assignment_required", 1)):
            desired["START"] = (
                f"{schedule['title']} 등원" if has_end_time else schedule["title"],
                schedule["starts_at"],
            )
        if has_end_time and schedule["id"] not in suppressed_ends and bool(schedule.get("end_assignment_required", 1)):
            desired["END"] = (f"{schedule['title']} 하원", schedule["ends_at"])

        existing = rows(
            db,
            "SELECT * FROM care_item WHERE family_id = ? AND child_schedule_id = ? ORDER BY starts_at",
            (family_id(), schedule["id"]),
        )
        by_boundary: dict[str, dict] = {}
        for item in existing:
            boundary = item.get("boundary_type")
            if not boundary:
                boundary = "END" if has_end_time and item.get("starts_at") == schedule["ends_at"] else "START"
            by_boundary[boundary] = item

        for boundary, (title, item_starts_at) in desired.items():
            item = by_boundary.get(boundary)
            detail = schedule_detail(
                schedule["category"], schedule["starts_at"], schedule["ends_at"],
                has_end_time, schedule.get("location_name") or "",
            )
            if item:
                db.execute(
                    """UPDATE care_item SET child_id = ?, title = ?, detail = ?, starts_at = ?, boundary_type = ?
                         WHERE id = ? AND family_id = ?""",
                    (child_id, title, detail, item_starts_at, boundary, item["id"], family_id()),
                )
            else:
                _create_schedule_care_item(
                    db, child_id, schedule["id"], title, schedule["category"], item_starts_at,
                    schedule["starts_at"], schedule["ends_at"], has_end_time, boundary,
                    schedule.get("location_name") or "",
                )

        for boundary, item in by_boundary.items():
            if boundary not in desired:
                _delete_care_item_cascade(db, item["id"])


def _normalize_boundary_responsibility(assignee_id: str | None, external_name: str | None) -> tuple[str | None, str]:
    normalized_name = (external_name or "").strip()
    if assignee_id and normalized_name:
        raise HTTPException(422, "가족 구성원과 외부 담당자는 동시에 지정할 수 없습니다")
    return assignee_id or None, normalized_name


def _is_home_location(location_name: str | None) -> bool:
    normalized = "".join((location_name or "").strip().casefold().split())
    return normalized in {"집", "우리집", "자택", "home"}


def _require_schedule_assignees(db, assignee_ids: set[str]) -> None:
    for assignee_id in assignee_ids:
        one(
            db,
            "SELECT id FROM family_member WHERE id = ? AND family_id = ? AND status = 'ACTIVE'",
            (assignee_id, family_id()),
        )


def _apply_schedule_responsibilities(db, schedule_ids: list[str]) -> tuple[int, dict[str, tuple[int, str]]]:
    """Apply the independently stored arrival/departure responsibility choices.

    External helpers (for example, an academy shuttle) are stored directly on the
    care boundary because they do not have a family-room account to accept an
    assignment. Missing internal boundaries from same-place merging are skipped.
    """
    responsibility_count = 0
    requests: dict[str, tuple[int, str]] = {}
    timestamp = now()
    requester_id = current_member_id()
    for schedule_id in schedule_ids:
        schedule = one(db, "SELECT * FROM child_schedule WHERE id = ? AND family_id = ?", (schedule_id, family_id()))
        items = rows(
            db,
            "SELECT * FROM care_item WHERE child_schedule_id = ? AND family_id = ? ORDER BY starts_at",
            (schedule_id, family_id()),
        )
        for item in items:
            boundary = item.get("boundary_type") or "START"
            prefix = "end" if boundary == "END" else "start"
            assignee_id = schedule.get(f"{prefix}_assignee_id") or None
            external_name = (schedule.get(f"{prefix}_external_assignee_name") or "").strip()
            active_assignments = rows(
                db,
                """SELECT * FROM care_assignment WHERE item_id = ? AND family_id = ?
                     AND status NOT IN ('CANCELED', 'REJECTED') ORDER BY created_at""",
                (item["id"], family_id()),
            )
            if external_name:
                for assignment in active_assignments:
                    if assignment["status"] != "COMPLETED":
                        db.execute("UPDATE care_assignment SET status = 'CANCELED' WHERE id = ?", (assignment["id"],))
                db.execute(
                    "UPDATE care_item SET external_assignee_name = ?, status = CASE WHEN status = 'DONE' THEN status ELSE 'ASSIGNED' END WHERE id = ?",
                    (external_name, item["id"]),
                )
                responsibility_count += 1
                continue

            if assignee_id:
                # A caregiver selected while a routine is created or edited is a
                # confirmed routine default. Proposal/acceptance is reserved for
                # the separate recommendation flow.
                desired_status = "ACCEPTED"
                matching = next((assignment for assignment in active_assignments if assignment["assignee_id"] == assignee_id), None)
                for assignment in active_assignments:
                    if assignment["id"] != (matching or {}).get("id") and assignment["status"] != "COMPLETED":
                        db.execute("UPDATE care_assignment SET status = 'CANCELED' WHERE id = ?", (assignment["id"],))
                if matching:
                    if matching["status"] != "COMPLETED":
                        db.execute(
                            """UPDATE care_assignment SET status = ?, responded_at = ?, requested_by_member_id = ?
                                 WHERE id = ?""",
                            (desired_status, timestamp, requester_id, matching["id"]),
                        )
                else:
                    assignment_id = str(uuid4())
                    db.execute(
                        """INSERT INTO care_assignment(id, family_id, item_id, assignee_id, status, source,
                           created_at, responded_at, requested_by_member_id)
                           VALUES (?, ?, ?, ?, ?, 'MANUAL', ?, ?, ?)""",
                        (assignment_id, family_id(), item["id"], assignee_id, desired_status, timestamp,
                         timestamp, requester_id),
                    )
                db.execute(
                    "UPDATE care_item SET external_assignee_name = '', status = CASE WHEN status = 'DONE' THEN status ELSE ? END WHERE id = ?",
                    ("ASSIGNED", item["id"]),
                )
                responsibility_count += 1
                continue

            for assignment in active_assignments:
                if assignment["status"] != "COMPLETED":
                    db.execute("UPDATE care_assignment SET status = 'CANCELED' WHERE id = ?", (assignment["id"],))
            db.execute(
                "UPDATE care_item SET external_assignee_name = '', status = CASE WHEN status = 'DONE' THEN status ELSE 'CONFIRMED' END WHERE id = ?",
                (item["id"],),
            )
    return responsibility_count, requests


@app.post("/api/child-schedules", status_code=201)
def create_child_schedule(payload: ChildScheduleCreate):
    normalized_end, has_end_time = normalize_schedule_end(payload.starts_at, payload.ends_at)
    occurrences = recurring_occurrences(payload.starts_at, normalized_end, payload.repeat_days, payload.repeat_until, payload.repeat_dates)
    with database() as db:
        one(db, "SELECT id FROM child WHERE id = ? AND family_id = ?", (payload.child_id, family_id()))
        start_external = payload.start_external_assignee_name.strip()
        end_external = payload.end_external_assignee_name.strip()
        start_assignee_id = payload.start_assignee_id or (payload.assignee_id if not start_external else None)
        end_assignee_id = payload.end_assignee_id or (payload.assignee_id if not end_external else None)
        home_location = _is_home_location(payload.location_name)
        start_required = payload.start_assignment_required and not home_location
        end_required = payload.end_assignment_required and not home_location
        if not start_required:
            start_assignee_id, start_external = None, ""
        if not end_required:
            end_assignee_id, end_external = None, ""
        start_assignee_id, start_external = _normalize_boundary_responsibility(start_assignee_id, start_external)
        end_assignee_id, end_external = _normalize_boundary_responsibility(end_assignee_id, end_external)
        _require_schedule_assignees(db, {value for value in (start_assignee_id, end_assignee_id) if value})
        recurrence_id = str(uuid4()) if len(occurrences) > 1 else None
        recurrence_rule = (f"DATES:{','.join(map(str, sorted(set(payload.repeat_dates))))}" if payload.repeat_dates
                           else f"WEEKLY:{','.join(map(str, sorted(set(payload.repeat_days))))}:UNTIL={payload.repeat_until}") if recurrence_id else None
        created = []
        for start, end in occurrences:
            schedule_id = str(uuid4())
            db.execute(
                """INSERT INTO child_schedule(id, family_id, child_id, title, category,
                   starts_at, ends_at, has_end_time, location_name, merge_same_location,
                   start_assignment_required,
                   start_assignee_id, start_external_assignee_name,
                   end_assignment_required,
                   end_assignee_id, end_external_assignee_name,
                   source, created_at, recurrence_id, recurrence_rule)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (schedule_id, family_id(), payload.child_id, payload.title, payload.category,
                  start.isoformat(), end.isoformat(), int(has_end_time), payload.location_name.strip(),
                  int(payload.merge_same_location), int(start_required),
                  start_assignee_id, start_external, int(end_required),
                  end_assignee_id, end_external, payload.source, now(), recurrence_id, recurrence_rule),
            )
            created.append(one(db, "SELECT * FROM child_schedule WHERE id = ?", (schedule_id,)))

        _reconcile_family_schedule_care_items(db)
        created_ids = [schedule["id"] for schedule in created]
        placeholders = ",".join("?" for _ in created_ids)
        care_item_ids = [item["id"] for item in rows(
            db,
            f"""SELECT id FROM care_item WHERE family_id = ?
                  AND child_schedule_id IN ({placeholders}) ORDER BY starts_at""",
            (family_id(), *created_ids),
        )]

        assigned_count, assignment_requests = _apply_schedule_responsibilities(db, created_ids)
        if assignment_requests:
            requester = one(db, "SELECT name FROM family_member WHERE id = ?", (current_member_id(),))
            for assignee_id, (request_count, first_assignment_id) in assignment_requests.items():
                notify(
                    db, assignee_id, "새 반복 돌봄 배정 요청",
                    f"{requester['name']}님이 {payload.title} 루틴 {request_count}건의 담당을 요청했어요.",
                    "IMPORTANT", "ASSIGNMENT_REQUEST", first_assignment_id,
                )
        owner = owner_id(db)
        first_schedule_items = rows(
            db,
            "SELECT id, title, starts_at FROM care_item WHERE family_id = ? AND child_schedule_id = ? ORDER BY starts_at",
            (family_id(), created[0]["id"]),
        )
        suggestions = []
        for index, care_item in enumerate(first_schedule_items):
            ranked = rank_members(db, family_id(), care_item["starts_at"], target_child_id=payload.child_id)
            if index == 0:
                suggestions = ranked
            best = next((candidate for candidate in ranked if candidate["available"]), ranked[0] if ranked else None)
            if best and not (start_assignee_id or end_assignee_id or start_external or end_external):
                notify(db, owner, "돌봄 담당 추천이 도착했어요",
                       f"{care_item['title']} 일정에 {best['name']}님을 우선 제안해요. 확인 후 요청을 보내주세요.",
                       "IMPORTANT", "CARE_SUGGESTION", care_item["id"])
        return {**created[0], "schedules": created, "scheduled_count": len(created),
                "care_item_id": care_item_ids[0] if care_item_ids else None,
                "care_item_ids": care_item_ids, "assigned_count": assigned_count,
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
        responsibility_fields = {
            "start_assignment_required", "end_assignment_required",
            "start_assignee_id", "start_external_assignee_name",
            "end_assignee_id", "end_external_assignee_name",
        }
        supplied_fields = payload.model_fields_set
        responsibilities_supplied = bool(responsibility_fields & supplied_fields)
        target_ids: list[str] = []
        for target in targets:
            target_start = datetime.fromisoformat(target["starts_at"]) + time_shift
            target_end = target_start + duration
            starts_at, ends_at = target_start.isoformat(), target_end.isoformat()
            start_required = payload.start_assignment_required if "start_assignment_required" in supplied_fields else bool(target.get("start_assignment_required", 1))
            end_required = payload.end_assignment_required if "end_assignment_required" in supplied_fields else bool(target.get("end_assignment_required", 1))
            start_assignee_id = payload.start_assignee_id if "start_assignee_id" in supplied_fields else target.get("start_assignee_id")
            start_external = payload.start_external_assignee_name if "start_external_assignee_name" in supplied_fields else target.get("start_external_assignee_name")
            end_assignee_id = payload.end_assignee_id if "end_assignee_id" in supplied_fields else target.get("end_assignee_id")
            end_external = payload.end_external_assignee_name if "end_external_assignee_name" in supplied_fields else target.get("end_external_assignee_name")
            if _is_home_location(payload.location_name):
                start_required = False
                end_required = False
            if "start_external_assignee_name" in supplied_fields and (payload.start_external_assignee_name or "").strip():
                start_assignee_id = None
            if "start_assignee_id" in supplied_fields and payload.start_assignee_id:
                start_external = ""
            if "end_external_assignee_name" in supplied_fields and (payload.end_external_assignee_name or "").strip():
                end_assignee_id = None
            if "end_assignee_id" in supplied_fields and payload.end_assignee_id:
                end_external = ""
            if not start_required:
                start_assignee_id, start_external = None, ""
            if not end_required:
                end_assignee_id, end_external = None, ""
            start_assignee_id, start_external = _normalize_boundary_responsibility(start_assignee_id, start_external)
            end_assignee_id, end_external = _normalize_boundary_responsibility(end_assignee_id, end_external)
            _require_schedule_assignees(db, {value for value in (start_assignee_id, end_assignee_id) if value})
            db.execute(
                """UPDATE child_schedule SET child_id = ?, title = ?, category = ?, starts_at = ?, ends_at = ?,
                   has_end_time = ?, location_name = ?, merge_same_location = ?,
                   start_assignment_required = ?,
                   start_assignee_id = ?, start_external_assignee_name = ?,
                   end_assignment_required = ?,
                   end_assignee_id = ?, end_external_assignee_name = ?
                   WHERE id = ? AND family_id = ?""",
                (payload.child_id, payload.title, payload.category, starts_at, ends_at, int(has_end_time),
                 payload.location_name.strip(), int(payload.merge_same_location),
                 int(start_required), start_assignee_id, start_external,
                 int(end_required), end_assignee_id, end_external,
                 target["id"], family_id()),
            )
            target_ids.append(target["id"])
            all_suggestions = rank_members(db, family_id(), starts_at, target_child_id=payload.child_id)
        _reconcile_family_schedule_care_items(db)
        assigned_count = 0
        assignment_requests: dict[str, tuple[int, str]] = {}
        if responsibilities_supplied:
            assigned_count, assignment_requests = _apply_schedule_responsibilities(db, target_ids)
            if assignment_requests:
                requester = one(db, "SELECT name FROM family_member WHERE id = ?", (actor_id,))
                for assignee_id, (request_count, first_assignment_id) in assignment_requests.items():
                    notify(
                        db, assignee_id, "변경된 돌봄 배정 요청",
                        f"{requester['name']}님이 {payload.title} 루틴 {request_count}건의 담당을 요청했어요.",
                        "IMPORTANT", "ASSIGNMENT_REQUEST", first_assignment_id,
                    )
        updated_items = rows(
            db, "SELECT id FROM care_item WHERE child_schedule_id = ? AND family_id = ? ORDER BY starts_at",
            (schedule_id, family_id()),
        )
        care_item_id = updated_items[0]["id"] if updated_items else None
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
                "assigned_count": assigned_count,
                "updated_count": len(targets),
                "recurring_instance_only": bool(schedule.get("recurrence_id")) and payload.update_scope == "SINGLE"}


def _delete_care_item_cascade(db, item_id: str) -> None:
    assignment_ids = [row["id"] for row in db.execute(
        "SELECT id FROM care_assignment WHERE item_id = ? AND family_id = ?", (item_id, family_id()),
    ).fetchall()]
    for assignment_id in assignment_ids:
        db.execute("DELETE FROM care_exception WHERE assignment_id = ?", (assignment_id,))
        db.execute("DELETE FROM care_handoff WHERE assignment_id = ?", (assignment_id,))
        db.execute("DELETE FROM emergency_request WHERE assignment_id = ?", (assignment_id,))
        # Keep uploaded photos even when the schedule/assignment they were attached
        # to gets cleaned up — just detach them instead of deleting the asset.
        db.execute("UPDATE media_asset SET assignment_id = NULL WHERE assignment_id = ?", (assignment_id,))
        db.execute("DELETE FROM device_alert_outbox WHERE assignment_id = ?", (assignment_id,))
    db.execute("DELETE FROM care_assignment WHERE item_id = ? AND family_id = ?", (item_id, family_id()))
    db.execute("DELETE FROM notification WHERE family_id = ? AND action_type = 'CARE_SUGGESTION' AND action_id = ?",
               (family_id(), item_id))
    db.execute("DELETE FROM care_item WHERE id = ? AND family_id = ?", (item_id, family_id()))


@app.delete("/api/child-schedules/{schedule_id}")
def delete_child_schedule(schedule_id: str, delete_scope: str = "SINGLE"):
    if delete_scope not in {"SINGLE", "FUTURE"}:
        raise HTTPException(422, "삭제 범위는 SINGLE 또는 FUTURE여야 합니다")
    with database() as db:
        one(db, "SELECT id FROM family_member WHERE id = ? AND family_id = ? AND status = 'ACTIVE'", (current_member_id(), family_id()))
        schedule = one(db, "SELECT * FROM child_schedule WHERE id = ? AND family_id = ?", (schedule_id, family_id()))
        targets = [schedule]
        if delete_scope == "FUTURE" and schedule.get("recurrence_id"):
            targets = rows(db, """SELECT * FROM child_schedule
                WHERE family_id = ? AND recurrence_id = ? AND starts_at >= ? ORDER BY starts_at""",
                (family_id(), schedule["recurrence_id"], schedule["starts_at"]))
        care_items_by_schedule = {
            target["id"]: rows(db, "SELECT id FROM care_item WHERE child_schedule_id = ? AND family_id = ?",
                               (target["id"], family_id()))
            for target in targets
        }
        for target in targets:
            for care_item in care_items_by_schedule[target["id"]]:
                _delete_care_item_cascade(db, care_item["id"])
            db.execute("DELETE FROM child_schedule WHERE id = ? AND family_id = ?", (target["id"], family_id()))
        _reconcile_family_schedule_care_items(db)
        return {"deleted": True, "schedule_id": schedule_id,
                "deleted_count": len(targets),
                "recurring_instance_only": bool(schedule.get("recurrence_id")) and delete_scope == "SINGLE"}


@app.delete("/api/care-items/{item_id}")
def delete_care_item(item_id: str):
    # Lets a family drop a single moment (e.g. the 학교 하원 item on a day the
    # child goes straight to 방과후) without deleting the whole registered
    # schedule or its sibling moment.
    with database() as db:
        one(db, "SELECT id FROM family_member WHERE id = ? AND family_id = ? AND status = 'ACTIVE'", (current_member_id(), family_id()))
        item = one(db, "SELECT * FROM care_item WHERE id = ? AND family_id = ?", (item_id, family_id()))
        _delete_care_item_cascade(db, item_id)
        return {"deleted": True, "item_id": item_id, "child_schedule_id": item.get("child_schedule_id")}


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
        for item in split_checklist_items(parsed_items):
            item_id = str(uuid4())
            parsed_start = item.get("starts_at") if item["item_type"] in {"SCHEDULE", "CHANGE", "SUPPLY", "HOMEWORK", "TODO"} else None
            title = clean_intake_title(item["title"])[:200]
            child_schedule_id = None
            # OCR/text extraction is always a draft first. Nothing is copied to
            # the calendar, supplies, or homework until the user reviews and
            # confirms the extracted items.
            status = "NEEDS_REVIEW"
            db.execute(
                """INSERT INTO care_item(id, family_id, intake_id, child_id, child_schedule_id,
                   item_type, title, detail, starts_at, confidence, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (item_id, family_id(), intake_id, payload.child_id, child_schedule_id, item["item_type"],
                 title, item.get("detail", ""), parsed_start, item["confidence"], status, now()),
            )
            created.append(one(db, "SELECT * FROM care_item WHERE id = ?", (item_id,)))
        if created:
            review_count = sum(1 for item in created if item["status"] == "NEEDS_REVIEW")
            if review_count:
                notify(db, owner_id(db), "새 돌봄 정보 확인", f"{review_count}개 항목을 확인하고 저장해주세요",
                       action_type="CARE_REVIEW", action_id=intake_id)
        return {"intake_id": intake_id, "items": created,
                "registered_child_schedules": registered_child_schedules,
                "requires_review": any(item["status"] == "NEEDS_REVIEW" for item in created)}


@app.post("/api/intakes", status_code=201)
def create_intake(payload: IntakeCreate):
    return store_intake(payload, classify_lines(payload.raw_content))


@app.post("/api/homework", status_code=201)
def create_homework(payload: HomeworkCreate):
    with database() as db:
        one(db, "SELECT id FROM child WHERE id = ? AND family_id = ?", (payload.child_id, family_id()))
        item_id = str(uuid4())
        starts_at = (
            datetime.combine(payload.due_date, datetime.min.time(), tzinfo=ZoneInfo("Asia/Seoul")).isoformat()
            if payload.due_date else None
        )
        db.execute(
            """INSERT INTO care_item(id, family_id, child_id, item_type, title, detail,
               starts_at, confidence, status, created_at)
               VALUES (?, ?, ?, 'HOMEWORK', ?, '', ?, 'HIGH', 'CONFIRMED', ?)""",
            (item_id, family_id(), payload.child_id, payload.title, starts_at, now()),
        )
        return one(db, "SELECT * FROM care_item WHERE id = ?", (item_id,))


@app.post("/api/supplies", status_code=201)
def create_supply(payload: SupplyCreate):
    with database() as db:
        one(db, "SELECT id FROM child WHERE id = ? AND family_id = ?", (payload.child_id, family_id()))
        item_id = str(uuid4())
        starts_at = (
            datetime.combine(payload.due_date, datetime.min.time(), tzinfo=ZoneInfo("Asia/Seoul")).isoformat()
            if payload.due_date else None
        )
        db.execute(
            """INSERT INTO care_item(id, family_id, child_id, item_type, title, detail,
               starts_at, confidence, status, created_at)
               VALUES (?, ?, ?, 'SUPPLY', ?, '', ?, 'HIGH', 'CONFIRMED', ?)""",
            (item_id, family_id(), payload.child_id, payload.title, starts_at, now()),
        )
        return one(db, "SELECT * FROM care_item WHERE id = ?", (item_id,))


@app.patch("/api/items/{item_id}/done")
def set_item_done(item_id: str, payload: ItemDoneUpdate):
    with database() as db:
        item = one(db, "SELECT * FROM care_item WHERE id = ? AND family_id = ?", (item_id, family_id()))
        if item["item_type"] not in {"SUPPLY", "HOMEWORK"}:
            raise HTTPException(409, "준비물·숙제 항목만 완료 체크할 수 있습니다")
        db.execute("UPDATE care_item SET status = ? WHERE id = ?",
                   ("DONE" if payload.done else "CONFIRMED", item_id))
        return one(db, "SELECT * FROM care_item WHERE id = ?", (item_id,))


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
        suggested = rank_members(db, family_id(), item["starts_at"], target_child_id=item.get("child_id"))
        record_event(
            db, "ai_candidate_suggested", target_family_id=family_id(),
            target_member_id=current_member_id(), correlation_id=item_id,
            properties={"candidate_count": len(suggested),
                        "available_count": sum(1 for row in suggested if row["available"])},
        )
        return {"item": item, "suggestions": suggested, "engine": "CARE_SCHEDULE_AGENT"}


def _propagate_routine_assignment(db, item: dict, assignee_id: str, requested_by: str | None) -> None:
    """A routine (recurring) item keeps the same caregiver for every future occurrence
    once one is confirmed, instead of asking again each day. Change requests still go
    through the exception flow for a single occurrence."""
    schedule_id = item.get("child_schedule_id")
    if not schedule_id:
        return
    schedule = db.execute("SELECT recurrence_id FROM child_schedule WHERE id = ?", (schedule_id,)).fetchone()
    if not schedule or not schedule["recurrence_id"]:
        return
    future_items = rows(
        db,
        """SELECT i.id FROM care_item i JOIN child_schedule s ON s.id = i.child_schedule_id
           WHERE s.recurrence_id = ? AND i.id != ? AND i.starts_at > ?
             AND NOT EXISTS (SELECT 1 FROM care_assignment a WHERE a.item_id = i.id AND a.status = 'ACCEPTED')""",
        (schedule["recurrence_id"], item["id"], item["starts_at"]),
    )
    if not future_items:
        return
    timestamp = now()
    for future_item in future_items:
        db.execute(
            "UPDATE care_assignment SET status = 'CANCELED' WHERE item_id = ? AND status IN ('PROPOSED', 'CANDIDATE_ACCEPTED')",
            (future_item["id"],),
        )
        db.execute(
            """INSERT INTO care_assignment(id, family_id, item_id, assignee_id, status, source,
               created_at, responded_at, requested_by_member_id)
               VALUES (?, ?, ?, ?, 'ACCEPTED', 'ROUTINE_AUTO', ?, ?, ?)""",
            (str(uuid4()), family_id(), future_item["id"], assignee_id, timestamp, timestamp, requested_by),
        )
        db.execute("UPDATE care_item SET status = 'ASSIGNED' WHERE id = ?", (future_item["id"],))
    notify(db, assignee_id, "반복 일정 담당이 이어서 고정됐어요",
           f"{item['title']} 등 앞으로의 반복 일정 {len(future_items)}건도 같은 담당으로 자동 배정했어요. 변경이 필요하면 예외 상황에서 요청해주세요.",
           "NORMAL", "CARE_SUGGESTION", item["id"])


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
        record_event(
            db, "reassignment_confirmed" if self_assignment else "request_sent",
            target_family_id=family_id(), target_member_id=current_member_id(),
            correlation_id=payload.item_id,
            properties={"assignment_id": assignment_id, "source": payload.source,
                        "self_assignment": self_assignment},
        )
        if self_assignment:
            db.execute("UPDATE care_item SET status = 'ASSIGNED' WHERE id = ?", (payload.item_id,))
            _propagate_routine_assignment(db, item, payload.assignee_id, current_member_id())
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
            # Whoever accepts first is confirmed immediately — no owner sign-off needed,
            # even when the request went out to several caregivers in parallel.
            db.execute(
                "UPDATE care_assignment SET status = 'ACCEPTED', responded_at = ? WHERE id = ?",
                (now(), assignment_id),
            )
            db.execute(
                """UPDATE care_assignment SET status = 'CANCELED' WHERE item_id = ? AND id <> ?
                   AND status IN ('PROPOSED', 'CANDIDATE_ACCEPTED', 'RECONFIRMATION_REQUIRED')""",
                (item["id"], assignment_id),
            )
            db.execute("UPDATE care_item SET status = 'ASSIGNED' WHERE id = ?", (item["id"],))
            notify(db, assignment.get("requested_by_member_id") or owner_id(db), "배정이 확정됐어요", f"{item['title']} 담당 요청을 수락했어요",
                   action_type="ASSIGNMENT_RESULT", action_id=assignment_id)
            _propagate_routine_assignment(db, item, assignment["assignee_id"], assignment.get("requested_by_member_id"))
            record_event(
                db, "request_responded", target_family_id=family_id(),
                target_member_id=assignment["assignee_id"], correlation_id=item["id"],
                properties={"assignment_id": assignment_id, "decision": "ACCEPTED",
                            "source": assignment["source"]},
            )
            record_event(
                db, "reassignment_confirmed", target_family_id=family_id(),
                target_member_id=assignment["assignee_id"], correlation_id=item["id"],
                properties={"assignment_id": assignment_id, "method": assignment["source"]},
            )
        else:
            db.execute(
                "UPDATE care_assignment SET status = 'REJECTED', responded_at = ? WHERE id = ?",
                (now(), assignment_id),
            )
            record_event(
                db, "request_responded", target_family_id=family_id(),
                target_member_id=assignment["assignee_id"], correlation_id=item["id"],
                properties={"assignment_id": assignment_id, "decision": "REJECTED",
                            "source": assignment["source"]},
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
        notify(db, assignment["assignee_id"], "돌봄 담당이 최종 확정됐어요", item["title"],
               "IMPORTANT", "ASSIGNMENT_REQUEST", assignment_id)
        notify(db, assignment.get("requested_by_member_id") or owner_id(db), "배정이 확정됐어요",
               f"{item['title']} 담당자를 최종 확정했어요.", action_type="ASSIGNMENT_RESULT", action_id=assignment_id)
        _propagate_routine_assignment(db, item, assignment["assignee_id"], assignment.get("requested_by_member_id"))
        record_event(
            db, "reassignment_confirmed", target_family_id=family_id(),
            target_member_id=current_member_id(), correlation_id=item["id"],
            properties={"assignment_id": assignment_id, "method": assignment["source"]},
        )
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
    record_event(
        db, "assignment_completed", target_family_id=family_id(),
        target_member_id=assignment["assignee_id"], correlation_id=assignment["item_id"],
        properties={"assignment_id": assignment_id, "has_note": bool(note),
                    "has_photo": has_photo},
    )
    item = one(db, "SELECT * FROM care_item WHERE id = ?", (assignment["item_id"],))
    owner = owner_id(db)
    next_assignment = None
    if item.get("child_id") and item.get("starts_at"):
        # A schedule with a real duration is split into drop-off/pick-up moments that
        # share one child_schedule_id — that sibling isn't a "next duty" in the handoff
        # sense, so skip it when looking for whoever picks up after this one.
        schedule_filter, params = "", [family_id(), item["child_id"], item["starts_at"]]
        if item.get("child_schedule_id"):
            schedule_filter = " AND (i.child_schedule_id IS NULL OR i.child_schedule_id != ?)"
            params.append(item["child_schedule_id"])
        next_assignment = db.execute(
            f"""SELECT a.assignee_id FROM care_item i
               LEFT JOIN care_assignment a ON a.item_id = i.id AND a.status = 'ACCEPTED'
               WHERE i.family_id = ? AND i.child_id = ? AND i.starts_at > ?
                 AND i.item_type != 'SUPPLY'{schedule_filter}
               ORDER BY i.starts_at, i.id LIMIT 1""",
            tuple(params),
        ).fetchone()
    next_assignee_id = next_assignment["assignee_id"] if next_assignment else None
    recipient = next_assignee_id if next_assignee_id != assignment["assignee_id"] else None
    handoff_id = None
    # Routine completion without a note stays in completion history. Create an
    # inbox handoff only when there is a real special note for the next carer.
    if recipient and note:
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
        record_event(
            db, "handoff_completed", target_family_id=family_id(),
            target_member_id=assignment["assignee_id"], correlation_id=handoff_id,
            properties={"assignment_id": assignment_id, "has_note": bool(note),
                        "has_photo": has_photo},
        )
        notify(db, recipient, "다음 돌봄 인수인계가 도착했어요", details, "IMPORTANT", "HANDOFF", handoff_id)
    if owner != assignment["assignee_id"] and owner != recipient and next_assignee_id != assignment["assignee_id"]:
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
        record_event(
            db, "handoff_acknowledged", target_family_id=family_id(),
            target_member_id=current_member_id(), correlation_id=handoff_id,
        )
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
        record_event(
            db, "manual_adjustment_used", target_family_id=family_id(),
            target_member_id=current_member_id(), correlation_id=payload.assignment_id,
            properties={"alternative_member_selected": True},
        )
        notify(db, owner_id(db), "배정 대안 확인 필요", payload.reason, "IMPORTANT",
               "EXCEPTION", exception_id)
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
        if not notice["is_read"]:
            db.execute("UPDATE notification SET is_read = 1 WHERE id = ?", (notification_id,))
            record_event(
                db, "notification_opened", target_family_id=family_id(),
                target_member_id=current_member_id(), correlation_id=notification_id,
                properties={"action_type": notice.get("action_type")},
            )
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
        if updates.get("device_enabled"):
            from .extended import _require_pro
            _require_pro(db)
        db.execute("INSERT INTO notification_preference(member_id) VALUES (?) ON CONFLICT(member_id) DO NOTHING", (member_id,))
        sql = ", ".join(f"{key} = ?" for key in updates)
        db.execute(f"UPDATE notification_preference SET {sql} WHERE member_id = ?", (*[int(value) for value in updates.values()], member_id))
        return one(db, "SELECT * FROM notification_preference WHERE member_id = ?", (member_id,))


from .extended import router as extended_router
from .emergency import router as emergency_router
from .calendar import legacy_router as legacy_calendar_router, router as calendar_router
from .benefits import router as benefits_router
from .payment import router as payment_router
from .devices import router as devices_router
from .performance import router as performance_router

app.include_router(extended_router)
app.include_router(emergency_router)
app.include_router(calendar_router)
app.include_router(legacy_calendar_router)
app.include_router(benefits_router)
app.include_router(payment_router)
app.include_router(devices_router)
app.include_router(performance_router)
