"""SQLite storage for the local prototype; tables follow the docs' object model."""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo


def db_path() -> Path:
    return Path(os.environ.get("LGDX_DB_PATH", Path(__file__).resolve().parents[1] / "lgdx.db"))


def connect() -> sqlite3.Connection:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def database():
    connection = connect()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS family_group (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, plan TEXT NOT NULL DEFAULT 'FREE',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS family_member (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  name TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE',
  is_owner INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS child (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  name TEXT NOT NULL, age_label TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS personal_schedule (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  member_id TEXT NOT NULL REFERENCES family_member(id), title TEXT NOT NULL,
  starts_at TEXT NOT NULL, ends_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS care_intake (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  child_id TEXT REFERENCES child(id), raw_content TEXT NOT NULL,
  input_type TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS care_item (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  intake_id TEXT REFERENCES care_intake(id), child_id TEXT REFERENCES child(id),
  item_type TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
  starts_at TEXT, confidence TEXT NOT NULL DEFAULT 'LOW',
  status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS care_assignment (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  item_id TEXT NOT NULL REFERENCES care_item(id), assignee_id TEXT NOT NULL REFERENCES family_member(id),
  status TEXT NOT NULL DEFAULT 'PROPOSED', source TEXT NOT NULL,
  created_at TEXT NOT NULL, responded_at TEXT, completed_at TEXT, note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS care_exception (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  assignment_id TEXT NOT NULL REFERENCES care_assignment(id),
  reason TEXT NOT NULL, alternative_member_id TEXT NOT NULL REFERENCES family_member(id),
  status TEXT NOT NULL DEFAULT 'PENDING', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS care_handoff (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  assignment_id TEXT NOT NULL REFERENCES care_assignment(id),
  from_member_id TEXT REFERENCES family_member(id), to_member_id TEXT NOT NULL REFERENCES family_member(id),
  briefing TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', acknowledged_at TEXT
);
CREATE TABLE IF NOT EXISTS notification (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  member_id TEXT REFERENCES family_member(id), title TEXT NOT NULL,
  body TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'NORMAL',
  is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS family_data_permission (
  member_id TEXT NOT NULL REFERENCES family_member(id), scope TEXT NOT NULL,
  is_allowed INTEGER NOT NULL, PRIMARY KEY (member_id, scope)
);
CREATE TABLE IF NOT EXISTS notification_preference (
  member_id TEXT PRIMARY KEY REFERENCES family_member(id),
  app_enabled INTEGER NOT NULL DEFAULT 1,
  daily_digest_enabled INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_item_family_status ON care_item(family_id, status);
CREATE INDEX IF NOT EXISTS idx_assignment_family ON care_assignment(family_id, status);
CREATE INDEX IF NOT EXISTS idx_notification_member ON notification(family_id, member_id, created_at);
"""


def initialize() -> None:
    with database() as db:
        db.executescript(SCHEMA)
        db.execute("INSERT OR IGNORE INTO notification_preference(member_id) SELECT id FROM family_member")
        if db.execute("SELECT 1 FROM family_group LIMIT 1").fetchone():
            return

        now = datetime.now(ZoneInfo("Asia/Seoul"))
        today = now.date()
        tomorrow = today + timedelta(days=1)
        family_id = "demo-family"
        db.execute(
            "INSERT INTO family_group VALUES (?, ?, ?, ?)",
            (family_id, "우리 가족", "FREE", now.isoformat()),
        )
        members = [
            ("mom", "엄마", "PARENT", 1),
            ("dad", "아빠", "PARENT", 0),
            ("grandma", "할머니", "GRANDPARENT", 0),
        ]
        for member_id, name, role, owner in members:
            db.execute(
                "INSERT INTO family_member(id, family_id, name, role, is_owner) VALUES (?, ?, ?, ?, ?)",
                (member_id, family_id, name, role, owner),
            )
        for child_id, name, age in [("jiu", "지우", "초2"), ("hayun", "하윤", "5세")]:
            db.execute(
                "INSERT INTO child VALUES (?, ?, ?, ?)", (child_id, family_id, name, age)
            )

        sample_items = [
            ("field-trip", "jiu", "SCHEDULE", "현장학습", "준비물 물 / 도시락 / 모자", f"{tomorrow}T08:20:00+09:00", "HIGH", "CONFIRMED"),
            ("pickup-change", "hayun", "CHANGE", "이번 주 금요일 하원 시간 변경", "별빛유치원 알림장", None, "LOW", "NEEDS_REVIEW"),
            ("taekwondo", "jiu", "SCHEDULE", "15시 — 태권도 / 방과후 미술", "어느 일정이 맞는지 확인해주세요", f"{today}T15:00:00+09:00", "LOW", "NEEDS_REVIEW"),
            ("dropoff", "jiu", "TODO", "등원", "학교 정문", f"{today}T07:20:00+09:00", "HIGH", "CONFIRMED"),
            ("pickup", "jiu", "TODO", "하원", "한빛초 정문", f"{today}T15:00:00+09:00", "HIGH", "CONFIRMED"),
            ("dinner", "hayun", "TODO", "저녁", "집", f"{today}T19:00:00+09:00", "HIGH", "CONFIRMED"),
        ]
        for item in sample_items:
            db.execute(
                """INSERT INTO care_item(id, family_id, child_id, item_type, title, detail,
                   starts_at, confidence, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (item[0], family_id, *item[1:], now.isoformat()),
            )
        for assignment_id, item_id, member_id, status in [
            ("assignment-dropoff", "dropoff", "dad", "COMPLETED"),
            ("assignment-pickup", "pickup", "grandma", "ACCEPTED"),
            ("assignment-dinner", "dinner", "mom", "ACCEPTED"),
        ]:
            db.execute(
                """INSERT INTO care_assignment(id, family_id, item_id, assignee_id,
                   status, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (assignment_id, family_id, item_id, member_id, status, "ROLE_MATCH", now.isoformat()),
            )
        db.execute(
            "INSERT INTO personal_schedule VALUES (?, ?, ?, ?, ?, ?)",
            ("dad-meeting", family_id, "dad", "오전 회의", f"{tomorrow}T08:00:00+09:00", f"{tomorrow}T09:00:00+09:00"),
        )
        for notification_id, title, body, level in [
            ("review-alert", "오늘 들어온 정보 3건, 확인해주세요", "하원 변경과 일정 충돌을 확인해주세요.", "NORMAL"),
            ("pickup-alert", "하원 담당: 할머니", "오늘 15:00, 한빛초 정문", "NORMAL"),
        ]:
            db.execute(
                "INSERT INTO notification(id, family_id, member_id, title, body, level, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (notification_id, family_id, "mom", title, body, level, now.isoformat()),
            )
        for member_id in ["mom", "dad", "grandma"]:
            db.execute("INSERT INTO notification_preference(member_id) VALUES (?)", (member_id,))
            for scope in ["CHILD_DETAIL", "LOCATION", "HEALTH", "NOTE", "PHOTO"]:
                allowed = member_id == "mom" or scope in ["CHILD_DETAIL", "NOTE"]
                db.execute(
                    "INSERT INTO family_data_permission VALUES (?, ?, ?)",
                    (member_id, scope, int(allowed)),
                )
