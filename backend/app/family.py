"""Local family-room invitations and bearer sessions."""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
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


def _new_code(db, target_family: str) -> tuple[str, str]:
    for _ in range(5):
        code = "".join(secrets.choice(ALPHABET) for _ in range(10))
        expires_at = (_now() + timedelta(days=7)).isoformat()
        try:
            db.execute(
                """INSERT INTO family_invite_code(family_id, code_hash, expires_at) VALUES (?, ?, ?)
                   ON CONFLICT(family_id) DO UPDATE SET code_hash = excluded.code_hash,
                     expires_at = excluded.expires_at""",
                (target_family, _hash(code), expires_at),
            )
            return code, expires_at
        except sqlite3.IntegrityError as exc:
            if "UNIQUE constraint failed: family_invite_code.code_hash" not in str(exc):
                raise
    raise HTTPException(503, "초대코드를 생성하지 못했습니다")


def _new_session(db, target_family: str, target_member: str) -> str:
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO family_session VALUES (?, ?, ?, ?)",
        (_hash(token), target_family, target_member, (_now() + timedelta(days=30)).isoformat()),
    )
    return token


def _seed_member_settings(db, target_member: str, is_owner: bool) -> None:
    db.execute("INSERT INTO notification_preference(member_id) VALUES (?)", (target_member,))
    for scope in ("CHILD_DETAIL", "LOCATION", "HEALTH", "NOTE", "PHOTO"):
        allowed = is_owner or scope in ("CHILD_DETAIL", "NOTE")
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
    return row["family_id"], row["member_id"], True


class FamilyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    owner_name: str = Field(min_length=1, max_length=100)


class FamilyJoin(BaseModel):
    invite_code: str = Field(min_length=8, max_length=20)
    name: str = Field(min_length=1, max_length=100)
    role: str = Field(pattern="^(PARENT|GRANDPARENT|CAREGIVER)$")


@router.post("", status_code=201)
def create_family(payload: FamilyCreate):
    target_family, target_member = str(uuid4()), str(uuid4())
    with database() as db:
        db.execute("INSERT INTO family_group VALUES (?, ?, 'FREE', ?)", (target_family, payload.name, _now().isoformat()))
        db.execute(
            """INSERT INTO family_member(id, family_id, name, role, status, is_owner)
               VALUES (?, ?, ?, 'PARENT', 'ACTIVE', 1)""",
            (target_member, target_family, payload.owner_name),
        )
        _seed_member_settings(db, target_member, True)
        code, expires_at = _new_code(db, target_family)
        token = _new_session(db, target_family, target_member)
    return {"family_id": target_family, "member_id": target_member, "invite_code": code,
            "invite_expires_at": expires_at, "access_token": token, "plan": "FREE"}


@router.post("/join", status_code=201)
def join_family(payload: FamilyJoin):
    code = "".join(ch for ch in payload.invite_code.upper() if ch in string.ascii_uppercase + string.digits)
    with database() as db:
        invitation = db.execute("SELECT family_id, expires_at FROM family_invite_code WHERE code_hash = ?", (_hash(code),)).fetchone()
        if invitation is None or datetime.fromisoformat(invitation["expires_at"]) <= _now():
            raise HTTPException(404, "초대코드가 없거나 만료됐습니다")
        target_family = invitation["family_id"]
        family = db.execute("SELECT plan FROM family_group WHERE id = ?", (target_family,)).fetchone()
        count = db.execute("SELECT COUNT(*) FROM family_member WHERE family_id = ? AND status != 'REMOVED'", (target_family,)).fetchone()[0]
        if family["plan"] == "FREE" and count >= 3:
            raise HTTPException(403, detail={"code": "PLAN_LIMIT", "message": "무료 플랜은 돌봄 구성원 3명까지 입장할 수 있습니다"})
        target_member = str(uuid4())
        db.execute("INSERT INTO family_member(id, family_id, name, role, status) VALUES (?, ?, ?, ?, 'ACTIVE')",
                   (target_member, target_family, payload.name, payload.role))
        _seed_member_settings(db, target_member, False)
        token = _new_session(db, target_family, target_member)
    return {"family_id": target_family, "member_id": target_member, "access_token": token, "plan": family["plan"]}


@router.get("/me")
def my_family():
    with database() as db:
        family = db.execute("SELECT * FROM family_group WHERE id = ?", (family_id(),)).fetchone()
        member = db.execute("SELECT * FROM family_member WHERE id = ? AND family_id = ?", (member_id(), family_id())).fetchone()
    return {"family": dict(family), "member": dict(member), "authenticated": authenticated()}


@router.post("/invite-code/rotate")
def rotate_code():
    with database() as db:
        require_owner(db)
        code, expires_at = _new_code(db, family_id())
    return {"invite_code": code, "invite_expires_at": expires_at}
