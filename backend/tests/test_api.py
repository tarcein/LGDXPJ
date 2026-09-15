"""End-to-end local API checks for the core care flow and policy limits."""

from __future__ import annotations

import os
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


class CareFlowTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        os.environ["LGDX_DB_PATH"] = str(Path(self.temp.name) / "test.db")
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()

    def tearDown(self) -> None:
        self.client_context.__exit__(None, None, None)
        os.environ.pop("LGDX_DB_PATH", None)
        self.temp.cleanup()

    def test_free_plan_rejects_extra_family_members(self) -> None:
        child = self.client.post("/api/children", json={"name": "셋째", "age_label": "3세"})
        member = self.client.post("/api/members", json={"name": "이모", "role": "CAREGIVER"})
        self.assertEqual(child.status_code, 403)
        self.assertEqual(member.status_code, 403)
        self.assertEqual(child.json()["detail"]["code"], "PLAN_LIMIT")

    def test_intake_requires_confirmation_before_role_match_and_completes(self) -> None:
        intake = self.client.post(
            "/api/intakes", json={"child_id": "jiu", "raw_content": "준비물: 도화지\n9:00 현장학습"}
        )
        self.assertEqual(intake.status_code, 201)
        item_id = intake.json()["items"][0]["id"]
        self.assertEqual(self.client.get(f"/api/items/{item_id}/suggestions").status_code, 409)
        self.assertEqual(self.client.patch(f"/api/items/{item_id}", json={"title": "도화지 챙기기"}).status_code, 200)
        self.assertEqual(self.client.post(f"/api/items/{item_id}/confirm").status_code, 200)
        suggestions = self.client.get(f"/api/items/{item_id}/suggestions").json()["suggestions"]
        self.assertTrue(suggestions)
        assignment = self.client.post(
            "/api/assignments", json={"item_id": item_id, "assignee_id": "grandma"}
        )
        self.assertEqual(assignment.status_code, 201)
        assignment_id = assignment.json()["id"]
        self.assertEqual(self.client.post(f"/api/assignments/{assignment_id}/respond", json={"decision": "ACCEPTED"}).status_code, 200)
        self.assertTrue(self.client.get("/api/bootstrap").json()["handoffs"])
        complete = self.client.post(
            f"/api/assignments/{assignment_id}/complete", json={"note": "도화지 전달 완료"}
        )
        self.assertEqual(complete.status_code, 200)
        self.assertEqual(complete.json()["status"], "COMPLETED")
        self.assertEqual(self.client.post(f"/api/assignments/{assignment_id}/complete", json={}).status_code, 409)
        snapshot = self.client.get("/api/bootstrap").json()
        saved_item = next(item for item in snapshot["items"] if item["id"] == item_id)
        self.assertEqual(saved_item["status"], "DONE")
        self.assertTrue(any("특이사항" in notice["body"] for notice in snapshot["notifications"]))

    def test_personal_schedule_reports_assigned_care_collision(self) -> None:
        pickup = next(item for item in self.client.get("/api/bootstrap").json()["items"] if item["id"] == "pickup")
        care_time = datetime.fromisoformat(pickup["starts_at"])
        response = self.client.post(
            "/api/schedules",
            json={
                "member_id": "grandma", "title": "병원 방문",
                "starts_at": (care_time - timedelta(minutes=15)).isoformat(),
                "ends_at": (care_time + timedelta(minutes=20)).isoformat(),
            },
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["collisions"][0]["assignment_id"], "assignment-pickup")
        notices = self.client.get("/api/bootstrap").json()["notifications"]
        self.assertTrue(any(notice["level"] == "IMPORTANT" for notice in notices))


if __name__ == "__main__":
    unittest.main()
