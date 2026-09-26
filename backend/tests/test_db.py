"""Database startup checks."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from app import db as db_module


class DatabaseInitializationTest(unittest.TestCase):
    def test_reinitialize_preserves_existing_family_schedules_and_assignments(self):
        with tempfile.TemporaryDirectory() as temp:
            os.environ["LGDX_DB_PATH"] = str(Path(temp) / "preserve.db")
            os.environ["LGDX_SEED_DEMO"] = "1"
            try:
                db_module.initialize()
                with db_module.database() as connection:
                    connection.execute("UPDATE family_group SET name = '민솔이네 집', plan = 'PRO' WHERE id = 'demo-family'")
                    connection.execute("UPDATE family_member SET name = '이지윤' WHERE id = 'mom'")
                    connection.execute("UPDATE child SET name = '민솔', age_label = '5세' WHERE id = 'jiu'")
                    connection.execute("UPDATE personal_schedule SET title = '보존할 개인 일정' WHERE id = 'dad-meeting'")
                    connection.execute(
                        """INSERT INTO child_schedule(
                           id, family_id, child_id, title, category, starts_at, ends_at,
                           location_name, start_assignee_id, end_assignee_id, source, created_at)
                           VALUES ('preserved-routine', 'demo-family', 'jiu', '학교', 'SCHOOL',
                           '2026-09-28T09:00:00+09:00', '2026-09-28T14:00:00+09:00',
                           '한빛초등학교', 'mom', 'grandma', 'MANUAL', '2026-09-26T10:00:00+09:00')"""
                    )
                    connection.execute(
                        "UPDATE care_assignment SET assignee_id = 'mom', status = 'ACCEPTED' WHERE id = 'assignment-pickup'"
                    )

                def snapshot():
                    with db_module.database() as connection:
                        return {
                            "family": tuple(connection.execute(
                                "SELECT name, plan FROM family_group WHERE id = 'demo-family'"
                            ).fetchone()),
                            "member": tuple(connection.execute(
                                "SELECT name, role, is_owner FROM family_member WHERE id = 'mom'"
                            ).fetchone()),
                            "child": tuple(connection.execute(
                                "SELECT name, age_label FROM child WHERE id = 'jiu'"
                            ).fetchone()),
                            "personal_schedule": tuple(connection.execute(
                                "SELECT title, starts_at, ends_at FROM personal_schedule WHERE id = 'dad-meeting'"
                            ).fetchone()),
                            "child_schedule": tuple(connection.execute(
                                """SELECT title, location_name, start_assignee_id, end_assignee_id
                                   FROM child_schedule WHERE id = 'preserved-routine'"""
                            ).fetchone()),
                            "assignment": tuple(connection.execute(
                                "SELECT assignee_id, status FROM care_assignment WHERE id = 'assignment-pickup'"
                            ).fetchone()),
                        }

                before = snapshot()
                db_module.initialize()
                self.assertEqual(snapshot(), before)
            finally:
                os.environ.pop("LGDX_DB_PATH", None)
                os.environ.pop("LGDX_SEED_DEMO", None)

    def test_postgres_migrations_are_serialized_and_release_ddl_locks(self):
        connection = MagicMock()
        cursor = connection.execute.return_value
        cursor.fetchall.return_value = []
        cursor.fetchone.return_value = {"id": "demo-family"}
        manager = MagicMock()
        manager.__enter__.return_value = connection
        manager.__exit__.return_value = False

        with (
            patch.object(db_module, "database", return_value=manager),
            patch.object(db_module, "is_postgres", return_value=True),
        ):
            db_module.initialize()

        connection.execute.assert_any_call("SELECT pg_advisory_lock(?)", (914_202_609,))
        alter_count = sum(
            str(call.args[0]).startswith("ALTER TABLE")
            for call in connection.execute.call_args_list
        )
        self.assertEqual(connection.commit.call_count, alter_count + 3)

    def test_database_reuses_an_open_postgres_pool(self):
        raw = MagicMock()
        checkout = MagicMock()
        checkout.__enter__.return_value = raw
        checkout.__exit__.return_value = False
        pool = MagicMock()
        pool.connection.return_value = checkout

        with (
            patch.object(db_module, "_pool", pool),
            patch.object(db_module, "is_postgres", return_value=True),
        ):
            with db_module.database() as connection:
                connection.execute("SELECT 1")

        pool.connection.assert_called_once_with()
        raw.execute.assert_called_once_with("SELECT 1", ())
        raw.commit.assert_called_once_with()
        raw.close.assert_not_called()


if __name__ == "__main__":
    unittest.main()
