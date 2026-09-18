"""Local family-room invitations and bearer sessions."""

from __future__ import annotations

import hashlib
import secrets
import string
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .config import enabled
from .db import database


router = APIRouter(prefix="/api/families", tags=["family rooms"])
_family_id: ContextVar[str] = ContextVar("family_id", default="demo-family")
_member_id: ContextVar[str | None] = ContextVar("member_id", default="mom")
_authenticated: ContextVar[bool] = ContextVar("authenticated", default=False)
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def family_id() -> str:
    return _family_id.get()


def member_id() -> str | None:
    return _member_id.get()


def authenticated() -> bool:
    return _authenticated.get()


def set_context(target_family: str, target_member: str, is_authenticated: bool):
    return (_family_id.set(target_family), _member_id.set(target_member), _authenticated.set(is_authenticated))


def reset_context(tokens) -> None:
    _family_id.reset(tokens[0])
    _member_id.reset(tokens[1])
    _authenticated.reset(tokens[2])


def owner_id(db) -> str:
    row = db.execute("SELECT id FROM family_member WHERE family_id = ? AND is_owner = 1", (family_id(),)).fetchone()
    if row is None:
        raise HTTPException(404, "가족방 주돌봄자를 찾을 수 없습니다")
    return row["id"]


def require_owner(db) -> None:
    if member_id() != owner_id(db):
        raise HTTPException(403, "주돌봄자만 변경할 수 있습니다")


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_code(db, target_family: str, created_by_member_id: str | None = None) -> tuple[str, str]:
    code = "".join(secrets.choice(ALPHABET) for _ in range(10))
    while db.execute("SELECT 1 FROM family_invite_link WHERE code_hash = ?", (_hash(code),)).fetchone():
        code = "".join(secrets.choice(ALPHABET) for _ in range(10))
    expires_at = (_now() + timedelta(days=7)).isoformat()
    db.execute(
        """INSERT INTO family_invite_link(code_hash, family_id, expires_at,
              created_by_member_id, created_at, join_count)
           VALUES (?, ?, ?, ?, ?, 0)""",
        (_hash(code), target_family, expires_at, created_by_member_id or member_id(), _now().isoformat()),
    )
    return code, expires_at


def _invitation(db, code_hash: str):
    invitation = db.execute(
        """SELECT family_id, expires_at, join_count, max_uses, revoked_at
           FROM family_invite_link WHERE code_hash = ?""",
        (code_hash,),
    ).fetchone()
    if invitation is not None:
        return invitation, True
    legacy = db.execute(
        """SELECT family_id, expires_at, 0 AS join_count, NULL AS max_uses, NULL AS revoked_at
           FROM family_invite_code WHERE code_hash = ?""",
        (code_hash,),
    ).fetchone()
    return legacy, False


def _active_invitation(invitation) -> bool:
    if invitation is None or invitation["revoked_at"]:
        return False
    if datetime.fromisoformat(invitation["expires_at"]) <= _now():
        return False
    return invitation["max_uses"] is None or invitation["join_count"] < invitation["max_uses"]


def _new_session(db, target_family: str, target_member: str) -> str:
    token = secrets.token_urlsafe(32)
    now = _now()
    db.execute(
        "INSERT INTO family_session(token_hash, family_id, member_id, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
        (_hash(token), target_family, target_member, (now + timedelta(days=30)).isoformat(), now.isoformat()),
    )
    return token


def _seed_member_settings(db, target_member: str, is_owner: bool) -> None:
    db.execute("INSERT INTO notification_preference(member_id) VALUES (?)", (target_member,))
    for scope in ("CHILD_DETAIL", "LOCATION", "HEALTH", "NOTE", "PHOTO", "SCHEDULE_DETAIL"):
        allowed = scope != "SCHEDULE_DETAIL" and (is_owner or scope in ("CHILD_DETAIL", "NOTE"))
        db.execute("INSERT INTO family_data_permission VALUES (?, ?, ?)", (target_member, scope, int(allowed)))


def resolve_bearer(authorization: str | None) -> tuple[str, str, bool]:
    if not authorization:
        if enabled("LGDX_REQUIRE_AUTH"):
            raise HTTPException(401, "가족방 로그인 토큰이 필요합니다")
        return "demo-family", "mom", False
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Bearer 토큰 형식이 아닙니다")
    with database() as db:
        row = db.execute(
            """SELECT s.family_id, s.member_id, s.expires_at FROM family_session s
               JOIN family_member m ON m.id = s.member_id AND m.family_id = s.family_id
               WHERE s.token_hash = ? AND m.status = 'ACTIVE'""", (_hash(token),),
        ).fetchone()
        if row is None or datetime.fromisoformat(row["expires_at"]) <= _now():
            raise HTTPException(401, "가족방 로그인 토큰이 유효하지 않습니다")
        db.execute("UPDATE family_session SET last_seen_at = ? WHERE token_hash = ?", (_now().isoformat(), _hash(token)))
        return row["family_id"], row["member_id"], True


class FamilyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    owner_name: str = Field(min_length=1, max_length=100)


class FamilyJoin(BaseModel):
    invite_code: str = Field(min_length=8, max_length=20)
    name: str = Field(min_length=1, max_length=100)
    role: str = Field(pattern="^(PARENT|GRANDPARENT|CAREGIVER)$")


class DevLogin(BaseModel):
    member_id: str = Field(min_length=1)


# ponytail: temporary local test login; remove these two endpoints before deployment.
@router.get("/dev-login-options")
def dev_login_options():
    if not enabled("LGDX_DEV_MODE"):
        raise HTTPException(404, "Not found")
    with database() as db:
        members = db.execute(
            """SELECT f.id AS family_id, f.name AS family_name, m.id AS member_id,
                      m.name AS member_name, m.role, m.is_owner
               FROM family_member m JOIN family_group f ON f.id = m.family_id
               WHERE m.status = 'ACTIVE' ORDER BY f.created_at DESC, m.is_owner DESC, m.name"""
        ).fetchall()
    return {"members": [dict(member) for member in members]}


@router.post("/dev-login")
def dev_login(payload: DevLogin):
    if not enabled("LGDX_DEV_MODE"):
        raise HTTPException(404, "Not found")
    with database() as db:
        member = db.execute(
            """SELECT m.*, f.plan FROM family_member m JOIN family_group f ON f.id = m.family_id
               WHERE m.id = ? AND m.status = 'ACTIVE'""",
            (payload.member_id,),
        ).fetchone()
        if member is None:
            raise HTTPException(404, "테스트 사용자를 찾을 수 없습니다")
        token = _new_session(db, member["family_id"], member["id"])
    return {"family_id": member["family_id"], "member_id": member["id"],
            "access_token": token, "plan": member["plan"]}


@router.get("/invitations/{invite_code}")
def invitation_preview(invite_code: str):
    code = "".join(ch for ch in invite_code.upper() if ch in string.ascii_uppercase + string.digits)
    with database() as db:
        invitation, _ = _invitation(db, _hash(code))
        if not _active_invitation(invitation):
            raise HTTPException(404, "초대 링크가 없거나 만료됐습니다")
        summary = db.execute(
            """SELECT f.name AS family_name, m.name AS owner_name
               FROM family_group f JOIN family_member m ON m.family_id = f.id AND m.is_owner = 1
               WHERE f.id = ?""",
            (invitation["family_id"],),
        ).fetchone()
    if summary is None:
        raise HTTPException(404, "초대할 가족방을 찾을 수 없습니다")
    return {**dict(summary), "expires_at": invitation["expires_at"]}


@router.post("", status_code=201)
def create_family(payload: FamilyCreate):
    target_family, target_member = str(uuid4()), str(uuid4())
    with database() as db:
        db.execute("INSERT INTO family_group VALUES (?, ?, 'FREE', ?)", (target_family, payload.name, _now().isoformat()))
        db.execute(
            """INSERT INTO family_member(id, family_id, name, role, status, is_owner, created_at)
               VALUES (?, ?, ?, 'PARENT', 'ACTIVE', 1, ?)""",
            (target_member, target_family, payload.owner_name, _now().isoformat()),
        )
        _seed_member_settings(db, target_member, True)
        code, expires_at = _new_code(db, target_family, target_member)
        token = _new_session(db, target_family, target_member)
    return {"family_id": target_family, "member_id": target_member, "invite_code": code,
            "invite_expires_at": expires_at, "access_token": token, "plan": "FREE"}


@router.post("/join", status_code=201)
def join_family(payload: FamilyJoin):
    code = "".join(ch for ch in payload.invite_code.upper() if ch in string.ascii_uppercase + string.digits)
    with database() as db:
        invitation, reusable = _invitation(db, _hash(code))
        if not _active_invitation(invitation):
            raise HTTPException(404, "초대코드가 없거나 만료됐습니다")
        target_family = invitation["family_id"]
        family = db.execute("SELECT plan FROM family_group WHERE id = ?", (target_family,)).fetchone()
        count = db.execute("SELECT COUNT(*) FROM family_member WHERE family_id = ? AND status != 'REMOVED'", (target_family,)).fetchone()[0]
        if family["plan"] == "FREE" and count >= 3:
            raise HTTPException(403, detail={"code": "PLAN_LIMIT", "message": "무료 플랜은 돌봄 구성원 3명까지 입장할 수 있습니다"})
        target_member = str(uuid4())
        db.execute("INSERT INTO family_member(id, family_id, name, role, status, created_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?)",
                   (target_member, target_family, payload.name, payload.role, _now().isoformat()))
        _seed_member_settings(db, target_member, False)
        token = _new_session(db, target_family, target_member)
        if reusable:
            db.execute("UPDATE family_invite_link SET join_count = join_count + 1 WHERE code_hash = ?", (_hash(code),))
    return {"family_id": target_family, "member_id": target_member, "access_token": token, "plan": family["plan"]}


@router.get("/me")
def my_family():
    with database() as db:
        family = db.execute("SELECT * FROM family_group WHERE id = ?", (family_id(),)).fetchone()
        member = db.execute("SELECT * FROM family_member WHERE id = ? AND family_id = ?", (member_id(), family_id())).fetchone()
    return {"family": dict(family), "member": dict(member), "authenticated": authenticated()}


@router.post("/invite-code/rotate")
def rotate_code():
    if not authenticated():
        raise HTTPException(401, "로그인한 가족 구성원만 초대 링크를 만들 수 있습니다")
    with database() as db:
        code, expires_at = _new_code(db, family_id())
    return {"invite_code": code, "invite_expires_at": expires_at, "reusable": True}
