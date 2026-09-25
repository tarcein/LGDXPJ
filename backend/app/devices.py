"""Device-alert routing settings: which appliance shows/speaks which notification.

There is no real ThinQ device API integration here (see docs/개발_계약.md) — the
"connected appliances" are a fixed demo catalog, and "is the TV on" is reported by
the TV display page itself (via the Page Visibility API detecting screen lock/unlock),
not read from any real hardware.

TVs and voice appliances share a single priority list (no separate "TV first"
rule): walk the list in order, and for each enabled device — if it's a screen
device, use it only if that screen is currently online, otherwise skip to the
next entry; if it's a voice device, use it immediately (voice devices have no
way to report their own state, so they're always treated as available).
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .db import database
from .family import family_id, member_id
from .performance import record_event

router = APIRouter(prefix="/api/device-alerts", tags=["device alerts"])

TV_ONLINE_WINDOW_SECONDS = 20

DEVICE_CATALOG = [
    {"id": "tv_living", "name": "거실 TV", "type": "SCREEN", "location": "거실"},
    {"id": "tv_bedroom", "name": "안방 TV", "type": "SCREEN", "location": "안방"},
    {"id": "thinq_on", "name": "띵큐온", "type": "VOICE", "location": "ThinQ 앱"},
    {"id": "water_purifier", "name": "정수기", "type": "VOICE", "location": "주방"},
    {"id": "robot_vacuum", "name": "로봇청소기", "type": "VOICE", "location": "거실 · 이동형", "note": "청소 중이면 건너뜀"},
]
DEVICE_BY_ID = {device["id"]: device for device in DEVICE_CATALOG}

CONTENT_KEYS = [
    {"id": "emergency_request", "label": "긴급 도움 요청", "locked": True},
    {"id": "transit_delay", "label": "이동 지연 · 예외 발생", "locked": False},
    {"id": "departure_reminder", "label": "출발 30분 전 리마인드", "locked": False},
    {"id": "supply_missing", "label": "준비물 누락", "locked": False},
    {"id": "arrival_checkin", "label": "도착 체크인", "locked": False},
    {"id": "handoff_note", "label": "인수인계 특이사항", "locked": False},
    {"id": "evening_briefing", "label": "저녁 브리핑 (21시)", "locked": False},
    {"id": "program_deadline", "label": "제도 · 공백 마감", "locked": False},
]

DEFAULT_CONTENT_MATRIX = {
    "emergency_request": {"tv": True, "voice": True},
    "transit_delay": {"tv": True, "voice": True},
    "departure_reminder": {"tv": True, "voice": True},
    "supply_missing": {"tv": True, "voice": True},
    "arrival_checkin": {"tv": True, "voice": False},
    "handoff_note": {"tv": True, "voice": False},
    "evening_briefing": {"tv": True, "voice": False},
    "program_deadline": {"tv": False, "voice": False},
}
DEFAULT_DEVICES = ["tv_living", "water_purifier", "robot_vacuum"]
DEFAULT_PRIORITY = ["tv_living", "water_purifier", "robot_vacuum"]


def _now() -> str:
    return datetime.now(ZoneInfo("Asia/Seoul")).isoformat()


class DeviceAlertSettingsUpdate(BaseModel):
    devices: list[str] | None = None
    priority: list[str] | None = None
    content_matrix: dict[str, dict[str, bool]] | None = None
    emergency_tv_sound: bool | None = None
    speech_volume: int | None = Field(default=None, ge=0, le=100)
    quiet_start: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    quiet_end: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    mute_during_naptime: bool | None = None


class TvStatusUpdate(BaseModel):
    status: str = Field(pattern="^(on|off)$")
    device_id: str = Field(default="tv_living")


class TestAlertRequest(BaseModel):
    assume_tv_off: bool = False


def _row(db) -> dict:
    row = db.execute("SELECT * FROM device_alert_setting WHERE family_id = ?", (family_id(),)).fetchone()
    if row is None:
        db.execute(
            """INSERT INTO device_alert_setting(family_id, devices, priority, content_matrix, updated_at)
               VALUES (?, ?, ?, ?, ?)""",
            (family_id(), json.dumps(DEFAULT_DEVICES), json.dumps(DEFAULT_PRIORITY),
             json.dumps(DEFAULT_CONTENT_MATRIX), _now()),
        )
        row = db.execute("SELECT * FROM device_alert_setting WHERE family_id = ?", (family_id(),)).fetchone()
    return dict(row)


def _is_tv_online(row: dict) -> bool:
    if row["tv_status"] != "on" or not row["tv_status_at"]:
        return False
    last_seen = datetime.fromisoformat(row["tv_status_at"])
    return datetime.now(ZoneInfo("Asia/Seoul")) - last_seen < timedelta(seconds=TV_ONLINE_WINDOW_SECONDS)


def _serialize(row: dict) -> dict:
    # Old rows may still carry device ids from a since-shrunk catalog (e.g. a
    # removed demo appliance) — drop them so counts and lists only ever show
    # devices that actually exist today.
    stored_matrix = json.loads(row["content_matrix"])
    content_matrix = {
        key: {
            "tv": bool(stored_matrix.get(key, {}).get("tv", defaults["tv"])),
            "voice": bool(stored_matrix.get(key, {}).get("voice", defaults["voice"])),
        }
        for key, defaults in DEFAULT_CONTENT_MATRIX.items()
    }
    return {
        **row,
        "devices": [item for item in json.loads(row["devices"]) if item in DEVICE_BY_ID],
        "priority": [item for item in json.loads(row["priority"]) if item in DEVICE_BY_ID],
        "content_matrix": content_matrix,
        "emergency_tv_sound": bool(row["emergency_tv_sound"]),
        "mute_during_naptime": bool(row["mute_during_naptime"]),
    }


@router.get("")
def get_device_alert_settings():
    with database() as db:
        row = _row(db)
        return {
            "settings": _serialize(row),
            "catalog": DEVICE_CATALOG,
            "content_keys": CONTENT_KEYS,
            "tv_online": _is_tv_online(row),
        }


@router.patch("")
def update_device_alert_settings(payload: DeviceAlertSettingsUpdate):
    from .extended import _require_pro

    with database() as db:
        _require_pro(db)
        _row(db)  # ensure a row exists first
        updates = payload.model_dump(exclude_unset=True)
        if not updates:
            raise HTTPException(422, "변경할 설정을 입력해주세요")
        if "devices" in updates:
            unknown = [item for item in updates["devices"] if item not in DEVICE_BY_ID]
            if unknown:
                raise HTTPException(422, f"알 수 없는 가전입니다: {', '.join(unknown)}")
            updates["devices"] = json.dumps(updates["devices"])
        if "priority" in updates:
            unknown = [item for item in updates["priority"] if item not in DEVICE_BY_ID]
            if unknown:
                raise HTTPException(422, f"알 수 없는 가전입니다: {', '.join(unknown)}")
            updates["priority"] = json.dumps(updates["priority"])
        if "content_matrix" in updates:
            current = _serialize(_row(db))["content_matrix"]
            for content_key, channel_patch in updates["content_matrix"].items():
                if content_key not in DEFAULT_CONTENT_MATRIX:
                    raise HTTPException(422, f"알 수 없는 알림 종류입니다: {content_key}")
                unknown_channels = set(channel_patch) - {"tv", "voice"}
                if unknown_channels:
                    raise HTTPException(422, f"알 수 없는 알림 채널입니다: {', '.join(sorted(unknown_channels))}")
                current[content_key] = {**current[content_key], **channel_patch}
            # Emergency requests are mandatory on both available channels.
            current["emergency_request"] = {"tv": True, "voice": True}
            updates["content_matrix"] = json.dumps(current)
        for bool_field in ("emergency_tv_sound", "mute_during_naptime"):
            if bool_field in updates:
                updates[bool_field] = int(updates[bool_field])
        updates["updated_at"] = _now()
        sql = ", ".join(f"{key} = ?" for key in updates)
        db.execute(f"UPDATE device_alert_setting SET {sql} WHERE family_id = ?", (*updates.values(), family_id()))
        row = _row(db)
        return {"settings": _serialize(row), "catalog": DEVICE_CATALOG, "content_keys": CONTENT_KEYS,
                "tv_online": _is_tv_online(row)}


@router.post("/tv-status")
def report_tv_status(payload: TvStatusUpdate):
    with database() as db:
        _row(db)
        db.execute("UPDATE device_alert_setting SET tv_status = ?, tv_status_at = ? WHERE family_id = ?",
                   (payload.status, _now(), family_id()))
        return {"ok": True}


def _resolve_channel(settings: dict, tv_online: bool) -> tuple[str | None, dict | None]:
    for device_id in settings["priority"]:
        if device_id not in settings["devices"]:
            continue
        device = DEVICE_BY_ID.get(device_id)
        if not device:
            continue
        if device["type"] == "SCREEN":
            if tv_online:
                return device_id, device
            continue
        return device_id, device
    return None, None


@router.post("/test")
def send_test_alert(payload: TestAlertRequest):
    from .main import notify

    sample_title, sample_body = "민솔이 하원 30분 전", "민솔이 하원 30분 전이에요."
    with database() as db:
        row = _row(db)
        settings = _serialize(row)
        # Actually push a real notification (not just a routing preview) so the
        # live TV/voice display pages — which only poll real notifications and
        # emergency requests — genuinely pick this up and react, instead of the
        # test only ever affecting the response shown on this settings screen.
        notify(db, None, sample_title, sample_body, "IMPORTANT", "DEVICE_ALERT_TEST", None)
        tv_online = False if payload.assume_tv_off else _is_tv_online(row)
        device_id, device = _resolve_channel(settings, tv_online)
        record_event(
            db, "device_alert_used", target_family_id=family_id(),
            target_member_id=member_id(), correlation_id=device_id,
            properties={"channel": "TV" if device and device["type"] == "SCREEN" else "VOICE" if device else None,
                        "device_id": device_id, "test": True, "delivered": bool(device)},
        )
    if not device:
        return {"channel": None, "device_id": None, "device_name": None,
                "title": sample_title, "message": "우선순위에 등록된 가전이 없어요"}
    channel = "TV" if device["type"] == "SCREEN" else "VOICE"
    return {"channel": channel, "device_id": device_id, "device_name": device["name"],
            "title": sample_title, "message": sample_body}
