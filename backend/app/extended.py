"""Media, assistant, handoff, and plan APIs for the local backend prototype."""

from __future__ import annotations

import json
import secrets
import base64
import re
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from . import ai
from .config import enabled, setting
from .db import database
from .family import authenticated, family_id, member_id, owner_id, require_owner
from .media import image_mime as _image_mime, media_root as _media_root, read_file as _read_file


router = APIRouter(prefix="/api", tags=["media and assistant"])
CHAT_TOKEN_LIMITS = {"FREE": 50_000, "PRO": 200_000}
FEATURES = {
    "inbox_text": "FREE", "role_match": "FREE", "handoff": "FREE",
    "calendar_manual": "FREE", "chat_daily_50000_tokens": "FREE",
    "ocr_daily_2": "FREE", "handoff_voice_note": "FREE",
    "emergency_request": "PRO", "care_gap": "PRO", "family_album": "PRO",
    "care_programs": "PRO", "device_alerts": "PRO",
    "voice_schedule": "PRO", "voice_emergency": "PRO",
    "ocr_unlimited": "PRO", "chat_daily_200000_tokens": "PRO",
}
API_READY = {
    "inbox_text", "role_match", "handoff", "calendar_manual",
    "chat_daily_50000_tokens", "ocr_daily_2", "handoff_voice_note",
    "emergency_request", "ocr_unlimited", "chat_daily_200000_tokens",
    "family_album", "care_programs",
}
TRANSCRIPTION_ONLY = {"voice_schedule", "voice_emergency"}
APP_CAPABILITIES = [
    {"screen": "home", "name": "홈", "description": "오늘 일정, 아이 일정 요약, 준비물 요약"},
    {"screen": "schedule", "name": "일정", "description": "가족·아이별 달력, 수기 일정, 반복 루틴"},
    {"screen": "calendar", "name": "외부 캘린더", "description": "Google·Outlook 개인 일정 연결과 동기화"},
    {"screen": "careHub", "name": "케어", "description": "돌봄 요청, 역할 배정, 예외 상황, 긴급 도움"},
    {"screen": "tasks", "name": "내 할 일", "description": "받은 돌봄 요청 수락·거절, 완료와 인수인계"},
    {"screen": "assignments", "name": "담당 배정", "description": "아이 일정의 돌봄 담당자와 요청 상태"},
    {"screen": "notifications", "name": "알림함", "description": "배정 요청, 수락 결과, 인수인계 알림"},
    {"screen": "familyHub", "name": "가족", "description": "가족 설정과 정보 공개"},
    {"screen": "members", "name": "가족 구성원", "description": "재사용 가능한 초대 링크, 구성원 관리"},
    {"screen": "album", "name": "모음ZIP", "description": "날짜별 사진과 돌봄 완료 사진"},
    {"screen": "programs", "name": "돌봄 제도", "description": "구성원별 지역의 아동 돌봄 혜택과 기관"},
    {"screen": "plan", "name": "플랜·결제", "description": "Free·Pro 기능과 토스 결제"},
]


def _backend_state(feature: str) -> str:
    if feature in API_READY:
        return "READY"
    if feature in TRANSCRIPTION_ONLY:
        return "PARTIAL"
    return "NOT_CONNECTED"


def _day() -> str:
    return datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()


def _plan(db) -> str:
    row = db.execute("SELECT plan FROM family_group WHERE id = ?", (family_id(),)).fetchone()
    if row is None:
        raise HTTPException(404, "가족방을 찾을 수 없습니다")
    return row["plan"]


def _require_pro(db) -> None:
    if _plan(db) != "PRO":
        raise HTTPException(403, detail={"code": "SUBSCRIPTION_REQUIRED", "message": "이 기능은 Pro 구독이 필요합니다"})


def _used(db, feature: str) -> int:
    row = db.execute("SELECT amount FROM daily_usage WHERE family_id = ? AND day = ? AND feature = ?",
                     (family_id(), _day(), feature)).fetchone()
    return row["amount"] if row else 0


def _add_usage(db, feature: str, amount: int) -> None:
    db.execute("""INSERT INTO daily_usage(family_id, day, feature, amount) VALUES (?, ?, ?, ?)
       ON CONFLICT(family_id, day, feature) DO UPDATE SET amount = daily_usage.amount + excluded.amount""",
       (family_id(), _day(), feature, amount))


def _chat_window_start(db) -> datetime:
    """Chat usage resets 24h after the window began, not at local midnight."""
    row = db.execute("SELECT day FROM daily_usage WHERE family_id = ? AND feature = 'CHAT_TOKENS'",
                      (family_id(),)).fetchone()
    now = datetime.now(ZoneInfo("Asia/Seoul"))
    if row:
        try:
            started = datetime.fromisoformat(row["day"])
            # Rows written before the 24h-window feature shipped stored a plain
            # date (e.g. "2026-09-20"), which parses as naive and can't be
            # compared to an aware `now` — treat those as Asia/Seoul local time.
            if started.tzinfo is None:
                started = started.replace(tzinfo=ZoneInfo("Asia/Seoul"))
            if now - started < timedelta(hours=24):
                return started
        except ValueError:
            pass
    return now


def _chat_used(db) -> int:
    window_start = _chat_window_start(db)
    row = db.execute("SELECT amount FROM daily_usage WHERE family_id = ? AND day = ? AND feature = 'CHAT_TOKENS'",
                      (family_id(), window_start.isoformat())).fetchone()
    return row["amount"] if row else 0


def _chat_add_usage(db, amount: int) -> None:
    window_start = _chat_window_start(db)
    db.execute("DELETE FROM daily_usage WHERE family_id = ? AND feature = 'CHAT_TOKENS' AND day != ?",
               (family_id(), window_start.isoformat()))
    db.execute("""INSERT INTO daily_usage(family_id, day, feature, amount) VALUES (?, ?, 'CHAT_TOKENS', ?)
       ON CONFLICT(family_id, day, feature) DO UPDATE SET amount = daily_usage.amount + excluded.amount""",
       (family_id(), window_start.isoformat(), amount))


def _chat_usage(db, plan: str) -> dict[str, int]:
    used = _chat_used(db)
    limit = CHAT_TOKEN_LIMITS[plan]
    return {"chat_tokens_today": used, "chat_tokens_limit": limit,
            "chat_tokens_remaining": max(0, limit - used)}


def _photo_file(photo_id: str, mime: str, created_at: str) -> tuple[Path, str, str]:
    extension = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[mime]
    day = datetime.fromisoformat(created_at).date()
    date_folder = day.strftime("%Y/%m/%d")
    safe_family = re.sub(r"[^A-Za-z0-9_-]", "_", family_id())
    relative = Path(safe_family) / day.strftime("%Y") / day.strftime("%m") / day.strftime("%d") / f"{photo_id}{extension}"
    return _media_root() / relative, relative.as_posix(), date_folder


def _stored_photo_path(storage_path: str | None) -> Path | None:
    if not storage_path:
        return None
    root = _media_root()
    candidate = (root / storage_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate


def _photo_payload(photo: dict) -> dict:
    encoded = photo.pop("content_base64", "") or ""
    candidate = _stored_photo_path(photo.get("storage_path"))
    if candidate and candidate.is_file():
        encoded = base64.b64encode(candidate.read_bytes()).decode("ascii")
    photo["can_delete"] = photo.get("uploaded_by_member_id") == member_id()
    photo["data_url"] = f"data:{photo['mime_type']};base64,{encoded}"
    return photo


def _store_photo(db, *, image: bytes, mime: str, file_name: str, child_id: str | None = None,
                  assignment_id: str | None = None, kind: str = "ALBUM", caption: str = "") -> dict:
    photo_id = str(uuid4())
    created_at = datetime.now(ZoneInfo("Asia/Seoul")).isoformat()
    target, storage_path, date_folder = _photo_file(photo_id, mime, created_at)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(image)
    db.execute(
        """INSERT INTO media_asset(id, family_id, child_id, assignment_id, uploaded_by_member_id,
           kind, file_name, mime_type, content_base64, caption, created_at, storage_path, date_folder)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (photo_id, family_id(), child_id, assignment_id, member_id(), kind, file_name[:240], mime,
         "", caption[:500], created_at, storage_path, date_folder),
    )
    return {"id": photo_id, "child_id": child_id, "assignment_id": assignment_id, "kind": kind,
            "file_name": file_name[:240], "mime_type": mime,
            "data_url": f"data:{mime};base64,{base64.b64encode(image).decode('ascii')}",
            "caption": caption[:500], "created_at": created_at, "storage_path": storage_path,
            "date_folder": date_folder, "uploaded_by_member_id": member_id(), "can_delete": True}


@router.get("/album/photos")
def album_photos():
    with database() as db:
        _require_pro(db)
        photos = [dict(row) for row in db.execute(
            """SELECT id, child_id, assignment_id, kind, file_name, mime_type, content_base64,
               caption, created_at, storage_path, date_folder, uploaded_by_member_id
               FROM media_asset WHERE family_id = ? ORDER BY created_at DESC""",
            (family_id(),),
        ).fetchall()]
    return {"photos": [_photo_payload(photo) for photo in photos]}


@router.post("/album/photos", status_code=201)
def upload_album_photo(file: UploadFile, child_id: str | None = Form(default=None),
                       caption: str = Form(default="")):
    image = _read_file(file, 10 * 1024 * 1024)
    mime = _image_mime(image)
    with database() as db:
        _require_pro(db)
        if child_id:
            if not db.execute("SELECT 1 FROM child WHERE id = ? AND family_id = ?", (child_id, family_id())).fetchone():
                raise HTTPException(404, "아이를 찾을 수 없습니다")
        return _store_photo(db, image=image, mime=mime, file_name=file.filename or "family-photo",
                            child_id=child_id, caption=caption)


@router.delete("/album/photos/{photo_id}")
def delete_album_photo(photo_id: str):
    with database() as db:
        _require_pro(db)
        photo = db.execute(
            """SELECT id, uploaded_by_member_id, storage_path FROM media_asset
               WHERE id = ? AND family_id = ?""",
            (photo_id, family_id()),
        ).fetchone()
        if photo is None:
            raise HTTPException(404, "사진을 찾을 수 없습니다")
        if photo["uploaded_by_member_id"] != member_id():
            raise HTTPException(403, "본인이 올린 사진만 삭제할 수 있습니다")
        storage_path = photo["storage_path"]
        db.execute("DELETE FROM media_asset WHERE id = ? AND family_id = ?", (photo_id, family_id()))

    candidate = _stored_photo_path(storage_path)
    if candidate and candidate.is_file():
        candidate.unlink()
        root = _media_root()
        parent = candidate.parent
        while parent != root:
            try:
                parent.rmdir()
            except OSError:
                break
            parent = parent.parent
    return {"deleted": True, "photo_id": photo_id}


@router.post("/assignments/{assignment_id}/complete-handoff")
def complete_with_handoff(assignment_id: str, note: str = Form(default=""),
                          photo: UploadFile | None = None):
    if len(note) > 2000:
        raise HTTPException(422, "특이사항은 2,000자까지 입력할 수 있습니다")
    image = mime = None
    if photo is not None:
        image = _read_file(photo, 10 * 1024 * 1024)
        mime = _image_mime(image)
    with database() as db:
        if image is not None:
            _require_pro(db)
        from .main import complete_assignment_record
        assignment = complete_assignment_record(db, assignment_id, note, image is not None)
        saved_photo = None
        if image is not None and mime is not None and photo is not None:
            item = db.execute(
                "SELECT i.child_id FROM care_item i JOIN care_assignment a ON a.item_id = i.id WHERE a.id = ?",
                (assignment_id,),
            ).fetchone()
            saved_photo = _store_photo(
                db, image=image, mime=mime, file_name=photo.filename or "care-completion-photo",
                child_id=item["child_id"] if item else None, assignment_id=assignment_id,
                kind="CARE_COMPLETION", caption=note,
            )
        return {"assignment": assignment, "photo": saved_photo}


@router.get("/plans")
def plans():
    return {"plans": [
        {"id": "FREE", "status": "AVAILABLE", "features": [key for key, tier in FEATURES.items() if tier == "FREE"]},
        {"id": "PRO", "status": "AVAILABLE", "features": [key for key, tier in FEATURES.items() if tier == "PRO"]},
    ]}


@router.get("/subscription")
def subscription():
    with database() as db:
        from .payment import reconcile_subscription
        reconcile_subscription(db, family_id())
        plan = _plan(db)
        row = db.execute("SELECT enabled FROM plan_preview WHERE family_id = ?", (family_id(),)).fetchone()
        paid = db.execute(
            """SELECT status, current_period_end, next_billing_at, billing_key,
               cancel_at_period_end, canceled_at FROM family_subscription WHERE family_id = ?""",
            (family_id(),),
        ).fetchone()
        dev_switch_available = enabled("LGDX_DEV_MODE") and authenticated() and member_id() == owner_id(db)
    preview = bool(row and row["enabled"])
    paid_status = paid["status"] if paid else None
    status = "DEV_PREVIEW" if preview else (paid_status or ("ACTIVE" if plan == "PRO" else "NOT_SUBSCRIBED"))
    return {"plan": plan, "status": status, "developer_preview": preview,
            "dev_switch_available": dev_switch_available,
            "current_period_end": paid["current_period_end"] if paid else None,
            "next_billing_at": paid["next_billing_at"] if paid else None,
            "cancel_at_period_end": bool(paid and paid["cancel_at_period_end"]),
            "canceled_at": paid["canceled_at"] if paid else None,
            "auto_renew_available": bool(paid and paid["billing_key"]),
            "renewal_mode": "AUTO_BILLING" if paid and paid["billing_key"] else "ONE_TIME"}


@router.get("/features")
def features():
    with database() as db:
        plan = _plan(db)
        return {"plan": plan, "features": [
            {"id": key, "tier": tier, "available": tier == "FREE" or plan == "PRO",
             "backend_state": _backend_state(key)}
            for key, tier in FEATURES.items()
        ], "usage": {"ocr_today": _used(db, "OCR"), **_chat_usage(db, plan)}}


class PreviewPlan(BaseModel):
    plan: str = Field(pattern="^(FREE|PRO)$")


@router.post("/dev/preview-plan")
def preview_plan(payload: PreviewPlan, x_developer_token: str | None = Header(default=None)):
    if not enabled("LGDX_DEV_MODE"):
        raise HTTPException(404, "개발자 플랜 미리보기를 사용할 수 없습니다")
    expected = setting("LGDX_DEV_TOKEN")
    token_ok = bool(expected and x_developer_token and secrets.compare_digest(expected, x_developer_token))
    with database() as db:
        if not token_ok:
            if not authenticated():
                raise HTTPException(404, "개발자 플랜 미리보기를 사용할 수 없습니다")
            require_owner(db)
        db.execute("UPDATE family_group SET plan = ? WHERE id = ?", (payload.plan, family_id()))
        db.execute("""INSERT INTO plan_preview(family_id, enabled) VALUES (?, ?)
           ON CONFLICT(family_id) DO UPDATE SET enabled = excluded.enabled""",
           (family_id(), int(payload.plan == "PRO")))
    return subscription()


@router.post("/intakes/photo", status_code=201)
def photo_intake(file: UploadFile, child_id: str = Form(...), source: str = Form(default="ALBUM")):
    if source not in {"ALBUM", "CAMERA"}:
        raise HTTPException(422, "source는 ALBUM 또는 CAMERA여야 합니다")
    image = _read_file(file, 10 * 1024 * 1024)
    mime = _image_mime(image)
    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        if not db.execute("SELECT 1 FROM child WHERE id = ? AND family_id = ?", (child_id, family_id())).fetchone():
            raise HTTPException(404, "아이를 찾을 수 없습니다")
        if _plan(db) == "FREE" and _used(db, "OCR") >= 2:
            raise HTTPException(403, detail={"code": "OCR_DAILY_LIMIT", "message": "무료 OCR은 하루 2회입니다. 텍스트 입력 또는 Pro를 이용해주세요"})
        _add_usage(db, "OCR", 1)
    try:
        extracted = ai.extract_image_text(image, mime)
        parsed_items = ai.extract_schedule_items(extracted)
        from .main import IntakeCreate, store_intake
        result = store_intake(IntakeCreate(raw_content=extracted, child_id=child_id, input_type="PHOTO_TRANSCRIPT"), parsed_items)
    except Exception:
        with database() as db:
            _add_usage(db, "OCR", -1)
        raise
    with database() as db:
        used = _used(db, "OCR")
    return {**result, "transcript": extracted, "source": source, "ocr_used_today": used}


AUDIO_TYPES = {
    "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/mp4",
    "audio/x-m4a", "audio/m4a", "audio/ogg", "audio/webm", "video/webm", "audio/aac",
}


def _transcribe(file: UploadFile, purpose: str) -> str:
    if purpose not in {"CHAT", "INTAKE", "SCHEDULE", "HANDOFF_NOTE", "EMERGENCY"}:
        raise HTTPException(422, "지원하지 않는 음성 입력 목적입니다")
    mime = (file.content_type or "").split(";", 1)[0].strip().lower()
    if mime in {"", "application/octet-stream"}:
        extension = (file.filename or "").lower().rsplit(".", 1)[-1]
        mime = {"wav": "audio/wav", "mp3": "audio/mpeg", "m4a": "audio/mp4", "mp4": "audio/mp4",
                "ogg": "audio/ogg", "webm": "audio/webm", "aac": "audio/aac"}.get(extension, mime)
    if mime not in AUDIO_TYPES:
        raise HTTPException(415, "WAV, MP3, M4A, OGG, WebM 음성 파일만 지원합니다")
    with database() as db:
        if purpose in {"SCHEDULE", "EMERGENCY"}:
            _require_pro(db)
    audio = _read_file(file, 20 * 1024 * 1024)
    return ai.transcribe_audio(audio, file.filename or "recording.webm", mime)


@router.post("/audio/transcribe")
def transcribe(file: UploadFile, purpose: str = Form(default="CHAT")):
    return {"text": _transcribe(file, purpose), "purpose": purpose}


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


def _benefit_context(message: str) -> dict:
    if not any(term in message for term in ("돌봄 제도", "돌봄제도", "지원금", "보조금", "혜택", "아이돌봄")):
        return {"requested": False}
    from .benefits import _stored_location, search_programs

    location = _stored_location()
    if not location["city"] or not location["district"]:
        return {"requested": True, "location": location, "programs": [],
                "notice": "현재 사용자의 검색 지역이 설정되지 않았습니다."}
    try:
        result = search_programs(keyword="돌봄", city=location["city"], district=location["district"], per_page=8)
        return {"requested": True, "location": location, "programs": result["programs"], "source": result["source"]}
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
        return {"requested": True, "location": location, "programs": [],
                "notice": detail.get("message", "돌봄 제도 데이터를 불러오지 못했습니다.")}


def _parse_action_time(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.isoformat()


def _apply_schedule_changes(changes: list[dict], original_message: str) -> list[dict]:
    explicit = any(term in original_message.replace(" ", "") for term in (
        "변경해", "바꿔", "옮겨", "수정해", "미뤄", "당겨", "변경하자", "수정하자",
    ))
    if not explicit or not changes:
        return []
    applied: list[dict] = []
    for change in changes[:3]:
        schedule_type = change.get("schedule_type")
        schedule_id = str(change.get("schedule_id") or "")
        table = "personal_schedule" if schedule_type == "PERSONAL" else "child_schedule" if schedule_type == "CHILD" else ""
        if not table or not schedule_id:
            continue
        with database() as db:
            found = db.execute(f"SELECT * FROM {table} WHERE id = ? AND family_id = ?", (schedule_id, family_id())).fetchone()
            if found is None:
                continue
            row = dict(found)
        if table == "personal_schedule" and (row["member_id"] != member_id() or row["external_source"]):
            continue
        title = str(change.get("title") or row["title"]).strip()
        starts_at = _parse_action_time(change.get("starts_at")) or row["starts_at"]
        explicit_end = _parse_action_time(change.get("ends_at"))
        has_end_time = change.get("has_end_time")
        if has_end_time is False:
            ends_at = None
        elif explicit_end:
            ends_at = explicit_end
        else:
            ends_at = row["ends_at"] if bool(row.get("has_end_time", 1)) else None
        try:
            from .main import ChildScheduleUpdate, ScheduleUpdate, update_child_schedule, update_schedule
            if table == "personal_schedule":
                result = update_schedule(schedule_id, ScheduleUpdate(
                    title=title, starts_at=datetime.fromisoformat(starts_at),
                    ends_at=datetime.fromisoformat(ends_at) if ends_at else None, kind=row["kind"],
                ))
            else:
                result = update_child_schedule(schedule_id, ChildScheduleUpdate(
                    child_id=row["child_id"], title=title, category=row["category"],
                    starts_at=datetime.fromisoformat(starts_at),
                    ends_at=datetime.fromisoformat(ends_at) if ends_at else None,
                ))
        except (HTTPException, ValueError):
            continue
        updated = result["schedule"]
        applied.append({"schedule_type": schedule_type, "schedule_id": schedule_id,
                        "title": updated["title"], "starts_at": updated["starts_at"],
                        "ends_at": updated["ends_at"] if updated.get("has_end_time", 1) else None})
    return applied


def _apply_schedule_creations(creations: list[dict], original_message: str) -> list[dict]:
    explicit = any(term in original_message.replace(" ", "") for term in (
        "등록해", "추가해", "넣어줘", "일정잡아", "일정만들어", "기록해",
    ))
    if not explicit or not creations:
        return []
    applied: list[dict] = []
    for creation in creations[:3]:
        schedule_type = creation.get("schedule_type")
        title = str(creation.get("title") or "").strip()
        starts_at = _parse_action_time(creation.get("starts_at"))
        ends_at = _parse_action_time(creation.get("ends_at"))
        if schedule_type not in {"PERSONAL", "CHILD"} or not title or not starts_at:
            continue
        try:
            from .main import ChildScheduleCreate, ScheduleCreate, create_child_schedule, create_schedule
            start_value = datetime.fromisoformat(starts_at)
            end_value = datetime.fromisoformat(ends_at) if ends_at else None
            if schedule_type == "PERSONAL":
                result = create_schedule(ScheduleCreate(
                    member_id=member_id(), title=title, starts_at=start_value, ends_at=end_value,
                    kind=creation.get("kind") if creation.get("kind") in {"WORK", "ROUTINE"} else "ROUTINE",
                ))
                schedule = result["schedule"]
                applied.append({"schedule_type": schedule_type, "schedule_id": schedule["id"],
                                "title": schedule["title"], "starts_at": schedule["starts_at"],
                                "ends_at": schedule["ends_at"] if schedule.get("has_end_time", 1) else None})
            else:
                child_id = str(creation.get("child_id") or "")
                if not child_id:
                    continue
                result = create_child_schedule(ChildScheduleCreate(
                    child_id=child_id, title=title, starts_at=start_value, ends_at=end_value,
                    category=creation.get("category") if creation.get("category") in {
                        "ACADEMY", "SCHOOL", "AFTER_SCHOOL", "ACTIVITY", "OTHER"
                    } else "OTHER",
                    source="MANUAL",
                ))
                applied.append({"schedule_type": schedule_type, "schedule_id": result["id"],
                                "title": result["title"], "starts_at": result["starts_at"],
                                "ends_at": result["ends_at"] if result.get("has_end_time", 1) else None,
                                "care_item_id": result["care_item_id"]})
        except (HTTPException, ValueError):
            continue
    return applied


def _chat(message: str) -> dict:
    with database() as db:
        plan = _plan(db)
        used = _chat_used(db)
        limit = CHAT_TOKEN_LIMITS[plan]
        remaining = limit - used
        if remaining < 256:
            raise HTTPException(403, detail={"code": "CHAT_DAILY_LIMIT", "message": "오늘의 AI 채팅 토큰을 다 썼습니다"})
        family = dict(db.execute("SELECT id, name, plan FROM family_group WHERE id = ?", (family_id(),)).fetchone())
        current_member = dict(db.execute(
            "SELECT id, name, role, is_owner FROM family_member WHERE id = ? AND family_id = ?",
            (member_id(), family_id()),
        ).fetchone())
        members = [dict(row) for row in db.execute(
            "SELECT id, name, role, status, is_owner FROM family_member WHERE family_id = ? ORDER BY is_owner DESC, name",
            (family_id(),),
        )]
        children = [dict(row) for row in db.execute(
            "SELECT id, name, age_label FROM child WHERE family_id = ? ORDER BY name", (family_id(),),
        )]
        schedules = [dict(row) for row in db.execute(
            """SELECT s.id, s.member_id, m.name AS member,
                 CASE WHEN s.member_id = ? OR EXISTS (
                   SELECT 1 FROM family_data_permission p
                   WHERE p.member_id = s.member_id
                     AND p.scope = (CASE WHEN s.kind = 'WORK' THEN 'WORK_DETAIL' ELSE 'SCHEDULE_DETAIL' END)
                     AND p.is_allowed = 1
                 ) THEN s.title ELSE '바쁨' END AS title,
                 s.starts_at, s.ends_at, s.kind, s.external_source FROM personal_schedule s
               JOIN family_member m ON m.id = s.member_id
               WHERE s.family_id = ? ORDER BY s.starts_at LIMIT 20""", (member_id(), family_id()))]
        items = [dict(row) for row in db.execute(
            """SELECT i.id, i.child_id, c.name AS child, i.item_type, i.title, i.detail,
               i.starts_at, i.status FROM care_item i LEFT JOIN child c ON c.id = i.child_id
               WHERE i.family_id = ? ORDER BY i.created_at DESC LIMIT 30""", (family_id(),))]
        assignments = [dict(row) for row in db.execute(
            """SELECT a.id, a.item_id, i.title, m.name AS assignee, a.assignee_id, a.status,
               a.requested_by_member_id, a.completed_at FROM care_assignment a
               JOIN care_item i ON i.id = a.item_id JOIN family_member m ON m.id = a.assignee_id
               WHERE a.family_id = ? ORDER BY a.created_at DESC LIMIT 20""", (family_id(),))]
        child_schedules = [dict(row) for row in db.execute(
            """SELECT s.id, s.child_id, c.name AS child, s.title, s.category, s.starts_at, s.ends_at,
               s.source, s.recurrence_id
               FROM child_schedule s JOIN child c ON c.id = s.child_id
               WHERE s.family_id = ? ORDER BY s.starts_at LIMIT 30""", (family_id(),))]
        handoffs = [dict(row) for row in db.execute(
            """SELECT h.id, h.assignment_id, fm.name AS from_member, tm.name AS to_member,
               h.briefing, h.special_note, h.status FROM care_handoff h
               LEFT JOIN family_member fm ON fm.id = h.from_member_id
               JOIN family_member tm ON tm.id = h.to_member_id
               WHERE h.family_id = ? AND (h.to_member_id = ? OR h.from_member_id = ?)
               ORDER BY h.id DESC LIMIT 15""", (family_id(), member_id(), member_id()))]
        notices = [dict(row) for row in db.execute(
            """SELECT id, title, body, level, is_read, action_type, action_id, created_at
               FROM notification WHERE family_id = ? AND (member_id IS NULL OR member_id = ?)
               ORDER BY created_at DESC LIMIT 20""", (family_id(), member_id()))]
        album = [dict(row) for row in db.execute(
            """SELECT id, child_id, kind, file_name, caption, created_at, date_folder
               FROM media_asset WHERE family_id = ? ORDER BY created_at DESC LIMIT 10""", (family_id(),))]
        location = db.execute(
            "SELECT city, district FROM member_benefit_location WHERE family_id = ? AND member_id = ?",
            (family_id(), member_id()),
        ).fetchone()
        history = [{"role": row["role"], "content": row["content"]} for row in reversed(db.execute(
            """SELECT role, content FROM assistant_message WHERE family_id = ? AND member_id = ?
               ORDER BY created_at DESC, id DESC LIMIT 6""", (family_id(), member_id())).fetchall())]
    benefit_data = _benefit_context(message)
    context = json.dumps({
        "current_time": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(),
        "family": family, "current_member": current_member, "members": members, "children": children,
        "personal_schedules": schedules, "child_schedules": child_schedules, "care_items": items,
        "assignments": assignments, "handoffs": handoffs, "notifications": notices,
        "album_recent_metadata": album, "benefit_search_location": dict(location) if location else None,
        "benefit_search_result": benefit_data, "capability_catalog": APP_CAPABILITIES,
    }, ensure_ascii=False)
    structured, tokens = ai.answer(message, context, history, min(1400, remaining))
    if tokens <= 0:
        raise HTTPException(502, detail={"code": "AI_USAGE_MISSING", "message": "AI 서비스 사용량을 확인하지 못했습니다"})
    if isinstance(structured, str):
        structured = {"answer": structured, "cards": [], "schedule_changes": [], "schedule_creations": []}
    compact_message = message.replace(" ", "")
    wants_creation = any(term in compact_message for term in ("등록해", "추가해", "넣어줘", "일정잡아", "일정만들어", "기록해"))
    wants_change = any(term in compact_message for term in ("변경해", "바꿔", "옮겨", "수정해", "미뤄", "당겨"))
    if ((wants_creation and not structured.get("schedule_creations"))
            or (wants_change and not structured.get("schedule_changes"))):
        focused, focused_tokens = ai.schedule_actions(message, context)
        if wants_creation and not structured.get("schedule_creations"):
            structured["schedule_creations"] = focused.get("schedule_creations", [])
        if wants_change and not structured.get("schedule_changes"):
            structured["schedule_changes"] = focused.get("schedule_changes", [])
        tokens += focused_tokens
    answer = str(structured.get("answer") or "요청하신 내용을 확인하지 못했어요.").strip()
    cards = [card for card in structured.get("cards", []) if isinstance(card, dict)][:5]
    applied = _apply_schedule_changes(structured.get("schedule_changes", []), message)
    created = _apply_schedule_creations(structured.get("schedule_creations", []), message)
    if applied:
        answer += "\n\n변경한 일정\n" + "\n".join(
            f"- {item['title']} · {item['starts_at']} ~ {item['ends_at']}" for item in applied
        )
        if not any(card.get("screen") == "schedule" for card in cards):
            cards.append({"eyebrow": "일정 변경 완료", "title": applied[0]["title"],
                          "description": "변경된 날짜와 시간을 캘린더에서 확인해보세요.", "screen": "schedule"})
    if created:
        answer += "\n\n등록한 일정\n" + "\n".join(
            f"- {item['title']} · {item['starts_at']}" + (f" ~ {item['ends_at']}" if item.get("ends_at") else "")
            for item in created
        )
        if not any(card.get("screen") == "schedule" for card in cards):
            cards.append({"eyebrow": "일정 등록 완료", "title": created[0]["title"],
                          "description": "등록된 일정을 캘린더에서 확인해보세요.", "screen": "schedule"})
    with database() as db:
        for role, content in [("user", message), ("assistant", answer)]:
            db.execute("INSERT INTO assistant_message VALUES (?, ?, ?, ?, ?, ?)",
                       (str(uuid4()), family_id(), member_id(), role, content, datetime.now(ZoneInfo("Asia/Seoul")).isoformat()))
        _chat_add_usage(db, tokens)
        usage = _chat_usage(db, plan)
    links = [{"label": f"{card.get('title') or '관련 내용'} 보기", "screen": card.get("screen")}
             for card in cards if card.get("screen")]
    return {"message": message, "answer": answer, "cards": cards, "links": links,
            "schedule_changes": applied, "schedule_creations": created,
            "usage": {"total_tokens": tokens, "used_today": usage["chat_tokens_today"],
                      "limit": usage["chat_tokens_limit"], "remaining": usage["chat_tokens_remaining"]},
            "plan": plan, "requires_confirmation_for_actions": False}


@router.get("/assistant/history")
def assistant_history():
    with database() as db:
        messages = [dict(row) for row in reversed(db.execute(
            """SELECT id, role, content, created_at FROM assistant_message
               WHERE family_id = ? AND member_id = ?
               ORDER BY created_at DESC, id DESC LIMIT 50""", (family_id(), member_id()),
        ).fetchall())]
    return {"messages": messages}


@router.post("/assistant/chat")
def assistant_chat(payload: ChatRequest):
    return _chat(payload.message)


@router.post("/assistant/voice")
def assistant_voice(file: UploadFile):
    transcript = _transcribe(file, "CHAT")
    return {"transcript": transcript, **_chat(transcript)}


class HandoffUpdate(BaseModel):
    briefing: str | None = Field(default=None, min_length=1, max_length=2000)
    special_note: str | None = Field(default=None, max_length=2000)


@router.patch("/handoffs/{handoff_id}")
def update_handoff(handoff_id: str, payload: HandoffUpdate):
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(422, "변경할 인수인계 내용을 입력해주세요")
    with database() as db:
        row = db.execute("SELECT * FROM care_handoff WHERE id = ? AND family_id = ?", (handoff_id, family_id())).fetchone()
        if row is None:
            raise HTTPException(404, "인수인계를 찾을 수 없습니다")
        if member_id() not in {row["from_member_id"], row["to_member_id"]}:
            raise HTTPException(403, "인수인계 당사자만 내용을 수정할 수 있습니다")
        if row["status"] != "PENDING":
            raise HTTPException(409, "확인 전 인수인계만 수정할 수 있습니다")
        db.execute("UPDATE care_handoff SET " + ", ".join(f"{key} = ?" for key in updates) + " WHERE id = ?",
                   (*updates.values(), handoff_id))
        return dict(db.execute("SELECT * FROM care_handoff WHERE id = ?", (handoff_id,)).fetchone())


class NewHandoff(BaseModel):
    to_member_id: str
    briefing: str | None = Field(default=None, max_length=2000)
    special_note: str | None = Field(default=None, max_length=2000)


@router.post("/assignments/{assignment_id}/handoff", status_code=201)
def create_next_handoff(assignment_id: str, payload: NewHandoff):
    with database() as db:
        assignment = db.execute("SELECT * FROM care_assignment WHERE id = ? AND family_id = ?", (assignment_id, family_id())).fetchone()
        if assignment is None:
            raise HTTPException(404, "배정을 찾을 수 없습니다")
        if assignment["assignee_id"] != member_id():
            raise HTTPException(403, "현재 담당자만 다음 인수인계를 작성할 수 있습니다")
        target = db.execute("SELECT id FROM family_member WHERE id = ? AND family_id = ? AND status = 'ACTIVE'",
                            (payload.to_member_id, family_id())).fetchone()
        if target is None or target["id"] == member_id():
            raise HTTPException(422, "다른 활성 가족 구성원을 선택해주세요")
        item = db.execute("SELECT title, detail FROM care_item WHERE id = ?", (assignment["item_id"],)).fetchone()
        note = payload.special_note if payload.special_note is not None else assignment["note"]
        briefing = payload.briefing or f"{item['title']} · {item['detail']}".strip(" ·")
        handoff_id = str(uuid4())
        db.execute("""INSERT INTO care_handoff(id, family_id, assignment_id, from_member_id,
                   to_member_id, briefing, status, special_note) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)""",
                   (handoff_id, family_id(), assignment_id, member_id(), target["id"], briefing, note))
        return dict(db.execute("SELECT * FROM care_handoff WHERE id = ?", (handoff_id,)).fetchone())
