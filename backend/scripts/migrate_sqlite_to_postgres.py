"""One-time copy from the local lgdx.db into the configured PostgreSQL database."""

from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg import sql


BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env", override=False)
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db import initialize  # noqa: E402

TABLES = (
    "family_group", "family_location", "family_member", "child", "personal_schedule", "child_schedule",
    "care_intake", "care_item", "care_assignment", "care_exception", "care_handoff",
    "notification", "family_data_permission", "notification_preference", "family_invite_code",
    "family_session", "daily_usage", "assistant_message", "plan_preview", "emergency_request",
    "media_asset", "calendar_oauth_state", "calendar_connection",
)


def main() -> None:
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url.startswith(("postgresql://", "postgres://")):
        raise SystemExit("backend/.env의 DATABASE_URL에 PostgreSQL 주소를 설정해주세요")
    source_path = Path(os.environ.get("LGDX_MIGRATION_SOURCE", BACKEND_DIR / "lgdx.db"))
    if not source_path.exists():
        raise SystemExit(f"SQLite 원본을 찾을 수 없습니다: {source_path}")

    initialize()
    source = sqlite3.connect(source_path)
    source.row_factory = sqlite3.Row
    copied: dict[str, int] = {}
    try:
        with psycopg.connect(database_url) as target:
            with target.cursor() as cursor:
                for table in TABLES:
                    source_exists = source.execute(
                        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
                    ).fetchone()
                    if not source_exists:
                        continue
                    cursor.execute(
                        """SELECT column_name FROM information_schema.columns
                           WHERE table_schema = 'public' AND table_name = %s ORDER BY ordinal_position""",
                        (table,),
                    )
                    target_columns = {row[0] for row in cursor.fetchall()}
                    cursor.execute(
                        """SELECT kcu.column_name
                           FROM information_schema.table_constraints tc
                           JOIN information_schema.key_column_usage kcu
                             ON tc.constraint_name = kcu.constraint_name
                            AND tc.table_schema = kcu.table_schema
                           WHERE tc.table_schema = 'public' AND tc.table_name = %s
                             AND tc.constraint_type = 'PRIMARY KEY'
                           ORDER BY kcu.ordinal_position""",
                        (table,),
                    )
                    primary_key = [row[0] for row in cursor.fetchall()]
                    source_columns = [row[1] for row in source.execute(f"PRAGMA table_info({table})")]
                    columns = [column for column in source_columns if column in target_columns]
                    rows = source.execute(f"SELECT {', '.join(columns)} FROM {table}").fetchall()
                    if not rows:
                        copied[table] = 0
                        continue
                    update_columns = [column for column in columns if column not in primary_key]
                    conflict_action = sql.SQL("DO UPDATE SET {} ").format(
                        sql.SQL(", ").join(
                            sql.SQL("{} = EXCLUDED.{}").format(sql.Identifier(column), sql.Identifier(column))
                            for column in update_columns
                        )
                    ) if update_columns else sql.SQL("DO NOTHING")
                    statement = sql.SQL("INSERT INTO {} ({}) VALUES ({}) ON CONFLICT ({}) {}").format(
                        sql.Identifier(table),
                        sql.SQL(", ").join(map(sql.Identifier, columns)),
                        sql.SQL(", ").join(sql.Placeholder() for _ in columns),
                        sql.SQL(", ").join(map(sql.Identifier, primary_key)),
                        conflict_action,
                    )
                    cursor.executemany(statement, [tuple(row[column] for column in columns) for row in rows])
                    copied[table] = cursor.rowcount if cursor.rowcount >= 0 else len(rows)
    finally:
        source.close()

    total = sum(copied.values())
    print(f"PostgreSQL migration complete: {total} rows synchronized")
    for table, count in copied.items():
        print(f"  {table}: {count}")


if __name__ == "__main__":
    main()
