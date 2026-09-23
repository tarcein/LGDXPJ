"""SQLite for tests and PostgreSQL for the shared development database."""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import psycopg
from psycopg_pool import ConnectionPool
from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)


_pool: ConnectionPool | None = None


def db_path() -> Path:
    return Path(os.environ.get("LGDX_DB_PATH", Path(__file__).resolve().parents[1] / "lgdx.db"))


class HybridRow(dict):
    """Mapping row that also supports the few legacy numeric lookups."""

    def __getitem__(self, key):
        if isinstance(key, int):
            return tuple(self.values())[key]
        return super().__getitem__(key)


def _postgres_row_factory(cursor):
    if cursor.description is None:
        return lambda values: HybridRow()
    columns = [column.name for column in cursor.description]

    def make_row(values):
        return HybridRow(zip(columns, values))

    return make_row


class PostgresConnection:
    def __init__(self, url: str | None = None, *, raw=None):
        self.raw = raw or psycopg.connect(url, row_factory=_postgres_row_factory, connect_timeout=10)

    def execute(self, sql: str, args: tuple | list = ()):
        if sql.strip().upper() == "BEGIN IMMEDIATE":
            return self.raw.execute("SELECT pg_advisory_xact_lock(%s)", (914_202_609,))
        return self.raw.execute(sql.replace("?", "%s"), args)

    def executescript(self, script: str) -> None:
        for statement in script.split(";"):
            if statement.strip():
                self.raw.execute(statement)

    def commit(self) -> None:
        self.raw.commit()

    def rollback(self) -> None:
        self.raw.rollback()

    def close(self) -> None:
        self.raw.close()


def is_postgres(connection: Any | None = None) -> bool:
    if connection is not None:
        return isinstance(connection, PostgresConnection)
    return bool(os.environ.get("DATABASE_URL")) and not bool(os.environ.get("LGDX_DB_PATH"))


def connect() -> sqlite3.Connection | PostgresConnection:
    if is_postgres():
        return PostgresConnection(os.environ["DATABASE_URL"])
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def open_pool() -> None:
    global _pool
    if not is_postgres() or _pool is not None:
        return
    _pool = ConnectionPool(
        os.environ["DATABASE_URL"],
        min_size=1,
        max_size=5,
        timeout=10,
        kwargs={"row_factory": _postgres_row_factory, "connect_timeout": 10},
        open=False,
    )
    _pool.open(wait=True, timeout=30)


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def database():
    if is_postgres() and _pool is not None:
        with _pool.connection() as raw:
            connection = PostgresConnection(raw=raw)
            try:
                yield connection
                connection.commit()
            except Exception:
                connection.rollback()
                raise
        return
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
CREATE TABLE IF NOT EXISTS family_location (
  family_id TEXT PRIMARY KEY REFERENCES family_group(id),
  city TEXT NOT NULL, district TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS family_member (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  name TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE',
  is_owner INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS child (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  name TEXT NOT NULL, age_label TEXT NOT NULL,
  photo_storage_path TEXT, photo_mime_type TEXT, photo_updated_at TEXT
);
CREATE TABLE IF NOT EXISTS personal_schedule (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  member_id TEXT NOT NULL REFERENCES family_member(id), title TEXT NOT NULL,
  starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, has_end_time INTEGER NOT NULL DEFAULT 1,
  kind TEXT NOT NULL DEFAULT 'ROUTINE', external_source TEXT, external_id TEXT,
  recurrence_id TEXT, recurrence_rule TEXT
);
CREATE TABLE IF NOT EXISTS child_schedule (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  child_id TEXT NOT NULL REFERENCES child(id), title TEXT NOT NULL,
  category TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
  has_end_time INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'MANUAL', created_at TEXT NOT NULL,
  recurrence_id TEXT, recurrence_rule TEXT
);
CREATE TABLE IF NOT EXISTS care_intake (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  child_id TEXT REFERENCES child(id), raw_content TEXT NOT NULL,
  input_type TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS care_item (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  intake_id TEXT REFERENCES care_intake(id), child_id TEXT REFERENCES child(id),
  child_schedule_id TEXT REFERENCES child_schedule(id),
  item_type TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
  starts_at TEXT, confidence TEXT NOT NULL DEFAULT 'LOW',
  status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS care_assignment (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  item_id TEXT NOT NULL REFERENCES care_item(id), assignee_id TEXT NOT NULL REFERENCES family_member(id),
  status TEXT NOT NULL DEFAULT 'PROPOSED', source TEXT NOT NULL,
  created_at TEXT NOT NULL, responded_at TEXT, completed_at TEXT, note TEXT NOT NULL DEFAULT '',
  requested_by_member_id TEXT REFERENCES family_member(id), reminder_sent_at TEXT
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
  is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
  action_type TEXT, action_id TEXT
);
CREATE TABLE IF NOT EXISTS family_data_permission (
  member_id TEXT NOT NULL REFERENCES family_member(id), scope TEXT NOT NULL,
  is_allowed INTEGER NOT NULL, PRIMARY KEY (member_id, scope)
);
CREATE TABLE IF NOT EXISTS notification_preference (
  member_id TEXT PRIMARY KEY REFERENCES family_member(id),
  app_enabled INTEGER NOT NULL DEFAULT 1,
  daily_digest_enabled INTEGER NOT NULL DEFAULT 1,
  device_enabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS family_invite_code (
  family_id TEXT PRIMARY KEY REFERENCES family_group(id),
  code_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS family_invite_link (
  code_hash TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  expires_at TEXT NOT NULL, created_by_member_id TEXT REFERENCES family_member(id),
  created_at TEXT NOT NULL, join_count INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER, revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS family_session (
  token_hash TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  member_id TEXT NOT NULL REFERENCES family_member(id), expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS daily_usage (
  family_id TEXT NOT NULL REFERENCES family_group(id), day TEXT NOT NULL,
  feature TEXT NOT NULL, amount INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (family_id, day, feature)
);
CREATE TABLE IF NOT EXISTS assistant_message (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  member_id TEXT REFERENCES family_member(id), role TEXT NOT NULL,
  content TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plan_preview (
  family_id TEXT PRIMARY KEY REFERENCES family_group(id), enabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS emergency_request (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  assignment_id TEXT NOT NULL REFERENCES care_assignment(id),
  requested_by_member_id TEXT NOT NULL REFERENCES family_member(id),
  reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN',
  claimed_by_member_id TEXT REFERENCES family_member(id),
  created_at TEXT NOT NULL, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS media_asset (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  child_id TEXT REFERENCES child(id), assignment_id TEXT REFERENCES care_assignment(id),
  uploaded_by_member_id TEXT REFERENCES family_member(id), kind TEXT NOT NULL DEFAULT 'ALBUM',
  file_name TEXT NOT NULL, mime_type TEXT NOT NULL, content_base64 TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS device_alert_outbox (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  member_id TEXT NOT NULL REFERENCES family_member(id), assignment_id TEXT REFERENCES care_assignment(id),
  title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_device_token (
  token TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  member_id TEXT NOT NULL REFERENCES family_member(id), platform TEXT NOT NULL DEFAULT 'ANDROID',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS member_benefit_location (
  family_id TEXT NOT NULL REFERENCES family_group(id),
  member_id TEXT NOT NULL REFERENCES family_member(id),
  city TEXT NOT NULL, district TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (family_id, member_id)
);
CREATE TABLE IF NOT EXISTS family_subscription (
  family_id TEXT PRIMARY KEY REFERENCES family_group(id),
  provider TEXT NOT NULL DEFAULT 'TOSS', customer_key TEXT NOT NULL UNIQUE,
  billing_key TEXT, status TEXT NOT NULL DEFAULT 'PENDING', amount INTEGER NOT NULL DEFAULT 7900,
  current_period_start TEXT, current_period_end TEXT, next_billing_at TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0, canceled_at TEXT,
  renewal_failure_count INTEGER NOT NULL DEFAULT 0, last_renewal_error TEXT,
  last_auth_key_hash TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_transaction (
  order_id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  provider TEXT NOT NULL DEFAULT 'TOSS', amount INTEGER NOT NULL,
  status TEXT NOT NULL, payment_key TEXT, approved_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS calendar_oauth_state (
  state TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES family_group(id),
  member_id TEXT NOT NULL REFERENCES family_member(id), provider TEXT NOT NULL,
  expires_at TEXT NOT NULL, return_url TEXT
);
CREATE TABLE IF NOT EXISTS calendar_connection (
  family_id TEXT NOT NULL REFERENCES family_group(id),
  member_id TEXT NOT NULL REFERENCES family_member(id), provider TEXT NOT NULL,
  access_token TEXT NOT NULL, refresh_token TEXT, expires_at TEXT,
  connected_at TEXT NOT NULL, synced_at TEXT,
  PRIMARY KEY (family_id, member_id, provider)
);
CREATE TABLE IF NOT EXISTS device_alert_setting (
  family_id TEXT PRIMARY KEY REFERENCES family_group(id),
  devices TEXT NOT NULL DEFAULT '[]',
  priority TEXT NOT NULL DEFAULT '[]',
  content_matrix TEXT NOT NULL DEFAULT '{}',
  emergency_tv_sound INTEGER NOT NULL DEFAULT 1,
  speech_volume INTEGER NOT NULL DEFAULT 60,
  quiet_start TEXT NOT NULL DEFAULT '22:00',
  quiet_end TEXT NOT NULL DEFAULT '07:00',
  mute_during_naptime INTEGER NOT NULL DEFAULT 1,
  tv_status TEXT NOT NULL DEFAULT 'off',
  tv_status_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_item_family_status ON care_item(family_id, status);
CREATE INDEX IF NOT EXISTS idx_child_schedule_family ON child_schedule(family_id, child_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_assignment_family ON care_assignment(family_id, status);
CREATE INDEX IF NOT EXISTS idx_notification_member ON notification(family_id, member_id, created_at);
CREATE INDEX IF NOT EXISTS idx_emergency_family_status ON emergency_request(family_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_media_family_created ON media_asset(family_id, created_at);
CREATE INDEX IF NOT EXISTS idx_invite_link_family ON family_invite_link(family_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_payment_family_created ON payment_transaction(family_id, created_at);
"""


def initialize() -> None:
    with database() as db:
        postgres = is_postgres(db)
        if postgres:
            # Keep concurrent deploys from migrating the same shared database.
            # This session lock survives the commits below and is released on close.
            db.execute("SELECT pg_advisory_lock(?)", (914_202_609,))
            db.commit()
        db.executescript(SCHEMA)
        if postgres:
            db.commit()
        # Emergency requests are intentionally unlimited. Older databases used a
        # partial unique index that allowed only one open request per assignment.
        db.execute("DROP INDEX IF EXISTS idx_emergency_open_assignment")
        if postgres:
            db.commit()
            db.execute("ALTER TABLE care_handoff ADD COLUMN IF NOT EXISTS special_note TEXT NOT NULL DEFAULT ''")
            db.commit()
            for table, name, definition in (
                ("personal_schedule", "kind", "TEXT NOT NULL DEFAULT 'ROUTINE'"),
                ("personal_schedule", "external_source", "TEXT"),
                ("personal_schedule", "external_id", "TEXT"),
                ("personal_schedule", "recurrence_id", "TEXT"),
                ("personal_schedule", "recurrence_rule", "TEXT"),
                ("personal_schedule", "has_end_time", "INTEGER NOT NULL DEFAULT 1"),
                ("child_schedule", "recurrence_id", "TEXT"),
                ("child_schedule", "recurrence_rule", "TEXT"),
                ("child_schedule", "has_end_time", "INTEGER NOT NULL DEFAULT 1"),
                ("care_item", "child_schedule_id", "TEXT REFERENCES child_schedule(id)"),
                ("notification", "action_type", "TEXT"),
                ("notification", "action_id", "TEXT"),
                ("notification_preference", "device_enabled", "INTEGER NOT NULL DEFAULT 0"),
                ("care_assignment", "requested_by_member_id", "TEXT REFERENCES family_member(id)"),
                ("care_assignment", "reminder_sent_at", "TEXT"),
                ("calendar_oauth_state", "return_url", "TEXT"),
                ("media_asset", "storage_path", "TEXT"),
                ("media_asset", "date_folder", "TEXT"),
                ("family_subscription", "cancel_at_period_end", "INTEGER NOT NULL DEFAULT 0"),
                ("family_subscription", "canceled_at", "TEXT"),
                ("family_subscription", "renewal_failure_count", "INTEGER NOT NULL DEFAULT 0"),
                ("family_subscription", "last_renewal_error", "TEXT"),
                ("family_member", "created_at", "TEXT NOT NULL DEFAULT ''"),
                ("family_session", "last_seen_at", "TEXT NOT NULL DEFAULT ''"),
                ("child", "photo_storage_path", "TEXT"),
                ("child", "photo_mime_type", "TEXT"),
                ("child", "photo_updated_at", "TEXT"),
            ):
                db.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {name} {definition}")
                db.commit()
        else:
            if "special_note" not in {row[1] for row in db.execute("PRAGMA table_info(care_handoff)")}:
                db.execute("ALTER TABLE care_handoff ADD COLUMN special_note TEXT NOT NULL DEFAULT ''")
            for table, additions in (
                ("personal_schedule", (("kind", "TEXT NOT NULL DEFAULT 'ROUTINE'"), ("external_source", "TEXT"), ("external_id", "TEXT"), ("recurrence_id", "TEXT"), ("recurrence_rule", "TEXT"), ("has_end_time", "INTEGER NOT NULL DEFAULT 1"))),
                ("child_schedule", (("recurrence_id", "TEXT"), ("recurrence_rule", "TEXT"), ("has_end_time", "INTEGER NOT NULL DEFAULT 1"))),
                ("care_item", (("child_schedule_id", "TEXT REFERENCES child_schedule(id)"),)),
                ("notification", (("action_type", "TEXT"), ("action_id", "TEXT"))),
                ("notification_preference", (("device_enabled", "INTEGER NOT NULL DEFAULT 0"),)),
                ("care_assignment", (("requested_by_member_id", "TEXT REFERENCES family_member(id)"), ("reminder_sent_at", "TEXT"))),
                ("calendar_oauth_state", (("return_url", "TEXT"),)),
                ("media_asset", (("storage_path", "TEXT"), ("date_folder", "TEXT"))),
                ("family_subscription", (("cancel_at_period_end", "INTEGER NOT NULL DEFAULT 0"), ("canceled_at", "TEXT"), ("renewal_failure_count", "INTEGER NOT NULL DEFAULT 0"), ("last_renewal_error", "TEXT"))),
                ("family_member", (("created_at", "TEXT NOT NULL DEFAULT ''"),)),
                ("family_session", (("last_seen_at", "TEXT NOT NULL DEFAULT ''"),)),
                ("child", (("photo_storage_path", "TEXT"), ("photo_mime_type", "TEXT"), ("photo_updated_at", "TEXT"))),
            ):
                columns = {row[1] for row in db.execute(f"PRAGMA table_info({table})")}
                for name, definition in additions:
                    if name not in columns:
                        db.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
        families = db.execute("SELECT id, created_at FROM family_group").fetchall()
        for family in families:
            missing_members = db.execute(
                "SELECT id FROM family_member WHERE family_id = ? AND created_at = '' ORDER BY is_owner DESC, name"
                if is_postgres(db) else
                "SELECT id FROM family_member WHERE family_id = ? AND created_at = '' ORDER BY rowid",
                (family["id"],),
            ).fetchall()
            try:
                registered_at = datetime.fromisoformat(family["created_at"])
            except (TypeError, ValueError):
                registered_at = datetime.now(ZoneInfo("Asia/Seoul"))
            for index, member in enumerate(missing_members):
                db.execute(
                    "UPDATE family_member SET created_at = ? WHERE id = ?",
                    ((registered_at + timedelta(microseconds=index)).isoformat(), member["id"]),
                )
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_external_schedule ON personal_schedule(family_id, member_id, external_source, external_id) WHERE external_id IS NOT NULL")
        db.execute("INSERT INTO notification_preference(member_id) SELECT id FROM family_member WHERE 1=1 ON CONFLICT(member_id) DO NOTHING")
        db.execute("""INSERT INTO family_data_permission(member_id, scope, is_allowed)
                      SELECT id, 'SCHEDULE_DETAIL', 0 FROM family_member WHERE 1=1
                      ON CONFLICT(member_id, scope) DO NOTHING""")
        db.execute("""INSERT INTO family_data_permission(member_id, scope, is_allowed)
                      SELECT id, 'WORK_DETAIL', 0 FROM family_member WHERE 1=1
                      ON CONFLICT(member_id, scope) DO NOTHING""")
        if db.execute("SELECT 1 FROM family_group WHERE id = 'demo-family'").fetchone():
            return

        if os.environ.get("LGDX_SEED_DEMO", "1").lower() not in {"1", "true", "yes", "on"}:
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
        for index, (member_id, name, role, owner) in enumerate(members):
            db.execute(
                "INSERT INTO family_member(id, family_id, name, role, is_owner, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (member_id, family_id, name, role, owner, (now + timedelta(seconds=index)).isoformat()),
            )
        for child_id, name, age in [("jiu", "지우", "초2"), ("hayun", "하윤", "5세")]:
            db.execute(
                "INSERT INTO child (id, family_id, name, age_label) VALUES (?, ?, ?, ?)", (child_id, family_id, name, age)
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
            "INSERT INTO personal_schedule(id, family_id, member_id, title, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?)",
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
            for scope in ["CHILD_DETAIL", "LOCATION", "HEALTH", "NOTE", "PHOTO", "SCHEDULE_DETAIL", "WORK_DETAIL"]:
                allowed = scope not in ("SCHEDULE_DETAIL", "WORK_DETAIL") and (member_id == "mom" or scope in ["CHILD_DETAIL", "NOTE"])
                db.execute(
                    "INSERT INTO family_data_permission VALUES (?, ?, ?)",
                    (member_id, scope, int(allowed)),
                )
