"""Database startup checks."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from app import db as db_module


class DatabaseInitializationTest(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
