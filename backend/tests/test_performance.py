from __future__ import annotations

import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from app.db import database
from app.main import app
from app.performance import _retention, _weekly_revisit


class PerformanceTrackerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        os.environ["LGDX_DB_PATH"] = str(Path(self.temp.name) / "performance.db")
        os.environ["LGDX_SEED_DEMO"] = "1"
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()

    def tearDown(self) -> None:
        self.client_context.__exit__(None, None, None)
        os.environ.pop("LGDX_DB_PATH", None)
        os.environ.pop("LGDX_SEED_DEMO", None)
        self.temp.cleanup()

    def test_client_events_are_collected_and_aggregated(self) -> None:
        recorded = self.client.post(
            "/api/performance/events",
            json={"event_name": "screen_view", "properties": {"screen": "home"}},
        )
        self.assertEqual(recorded.status_code, 201)
        presented = self.client.post(
            "/api/performance/events",
            json={
                "event_name": "device_alert_presented",
                "correlation_id": "notice:test",
                "properties": {"channel": "TV", "device_id": "tv_living"},
            },
        )
        self.assertEqual(presented.status_code, 201)

        summary = self.client.get("/api/performance/summary?days=30").json()
        cx = {metric["id"]: metric for metric in summary["trackers"]["CX"]}
        dx = {metric["id"]: metric for metric in summary["trackers"]["DX"]}
        self.assertEqual(set(summary["trackers"]), {"BX", "CX", "DX"})
        self.assertEqual(summary["event_counts"]["screen_view"], 1)
        self.assertEqual(summary["collection"]["event_table"], "performance_event")
        self.assertEqual(cx["CX-09"]["value"], 1)
        self.assertIsNone(cx["CX-10"]["value"])
        self.assertIn("CX-11", cx)
        self.assertTrue(dx["DX-05"]["value"] is None or dx["DX-05"]["value"] <= 100)

    def test_retention_waits_for_the_full_observation_window(self) -> None:
        first = datetime.fromisoformat("2026-01-01T00:00:00+09:00")
        events = [
            {"event_name": "app_opened", "member_id": "member-1", "occurred_at": first.isoformat()},
            {"event_name": "app_opened", "member_id": "member-1",
             "occurred_at": (first + timedelta(days=7)).isoformat()},
        ]
        self.assertEqual(_retention(events, 7, first + timedelta(days=13)), (0, 0, None))
        self.assertEqual(_retention(events, 7, first + timedelta(days=14)), (1, 1, 100.0))

    def test_weekly_revisit_counts_distinct_days_per_family(self) -> None:
        end = datetime.fromisoformat("2026-01-08T12:00:00+09:00")
        events = [
            {"event_name": "app_opened", "family_id": "family-1", "occurred_at": "2026-01-02T09:00:00+09:00"},
            {"event_name": "app_opened", "family_id": "family-1", "occurred_at": "2026-01-04T09:00:00+09:00"},
            {"event_name": "app_opened", "family_id": "family-2", "occurred_at": "2026-01-06T09:00:00+09:00"},
            {"event_name": "app_opened", "family_id": "family-2", "occurred_at": "2026-01-06T18:00:00+09:00"},
            {"event_name": "app_opened", "family_id": "family-3", "occurred_at": "2025-12-31T09:00:00+09:00"},
        ]
        self.assertEqual(_weekly_revisit(events, end), (1, 2, 50.0))

    def test_core_workflow_writes_automatic_events(self) -> None:
        pickup = next(
            item for item in self.client.get("/api/bootstrap").json()["items"]
            if item["id"] == "pickup"
        )
        care_time = datetime.fromisoformat(pickup["starts_at"])
        response = self.client.post(
            "/api/schedules",
            json={
                "member_id": "grandma",
                "title": "event-log-test",
                "starts_at": (care_time - timedelta(minutes=10)).isoformat(),
                "ends_at": (care_time + timedelta(minutes=10)).isoformat(),
            },
        )
        self.assertEqual(response.status_code, 201)

        with database() as db:
            rows = db.execute(
                "SELECT event_name, properties FROM performance_event WHERE family_id = 'demo-family'"
            ).fetchall()
        names = {row["event_name"] for row in rows}
        self.assertIn("schedule_created", names)
        self.assertIn("conflict_detected", names)
        self.assertIn("notification_sent", names)
        # Event properties contain IDs and states, never the user-entered schedule title.
        self.assertFalse(any("event-log-test" in json.loads(row["properties"]).__str__() for row in rows))

    def test_limit_event_survives_rejected_request(self) -> None:
        blocked = self.client.post("/api/children", json={"name": "limit-test", "age_label": "4세"})
        self.assertEqual(blocked.status_code, 403)
        counts = self.client.get("/api/performance/event-counts?days=30").json()["events"]
        limit_count = next(row["count"] for row in counts if row["event_name"] == "feature_limit_reached")
        self.assertEqual(limit_count, 1)


if __name__ == "__main__":
    unittest.main()
