"""Scenario checks for schedule actions, parallel care requests, and escalation."""

from __future__ import annotations

import json
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

from app.db import database
from app.main import app
from app.reminders import process_assignment_reminders


class CoreScenarioTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        os.environ["LGDX_DB_PATH"] = str(Path(self.temp.name) / "scenario.db")
        os.environ["LGDX_SEED_DEMO"] = "1"
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()

    def tearDown(self) -> None:
        self.client_context.__exit__(None, None, None)
        os.environ.pop("LGDX_DB_PATH", None)
        os.environ.pop("LGDX_SEED_DEMO", None)
        self.temp.cleanup()

    def test_point_in_time_schedule_does_not_require_an_end(self):
        response = self.client.post("/api/schedules", json={
            "member_id": "mom", "title": "퇴근", "kind": "WORK",
            "starts_at": "2026-09-20T18:00:00+09:00", "ends_at": None,
        })
        self.assertEqual(response.status_code, 201)
        schedule = response.json()["schedule"]
        self.assertEqual(schedule["has_end_time"], 0)
        self.assertEqual(schedule["starts_at"], "2026-09-20T18:00:00+09:00")

    def test_chat_can_create_a_personal_point_schedule(self):
        structured = {
            "answer": "퇴근 일정을 등록할게요.", "cards": [], "schedule_changes": [],
            "schedule_creations": [{
                "schedule_type": "PERSONAL", "child_id": None, "title": "퇴근",
                "starts_at": "2026-09-20T18:00:00+09:00", "ends_at": None,
                "kind": "WORK", "category": None,
            }],
        }
        with patch("app.extended.ai.answer", return_value=(structured, 30)) as answer:
            response = self.client.post("/api/assistant/chat", json={"message": "9월 20일 18시 퇴근 일정 등록해줘"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["schedule_creations"][0]["title"], "퇴근")
        context = json.loads(answer.call_args.args[1])
        self.assertEqual(context["context_scope"], ["schedule"])
        self.assertIn("personal_schedules", context)
        self.assertNotIn("care_items", context)
        self.assertNotIn("notifications", context)
        self.assertEqual(answer.call_args.args[3], 1400)
        schedules = self.client.get("/api/bootstrap").json()["schedules"]
        self.assertTrue(any(item["title"] == "퇴근" and item["has_end_time"] == 0 for item in schedules))

    def test_first_caregiver_to_accept_a_parallel_request_is_confirmed_immediately(self):
        child_schedule = self.client.post("/api/child-schedules", json={
            "child_id": "jiu", "title": "수영", "category": "ACADEMY",
            "starts_at": "2026-09-22T16:00:00+09:00", "ends_at": "2026-09-22T17:00:00+09:00",
        }).json()
        first = self.client.post("/api/assignments", json={
            "item_id": child_schedule["care_item_id"], "assignee_id": "grandma",
        }).json()
        second = self.client.post("/api/assignments", json={
            "item_id": child_schedule["care_item_id"], "assignee_id": "dad",
        }).json()
        # Whoever accepts first is confirmed right away — no owner sign-off step —
        # and the other outstanding request for the same item is auto-canceled.
        accepted = self.client.post(f"/api/assignments/{first['id']}/respond", json={"decision": "ACCEPTED"})
        self.assertEqual(accepted.json()["status"], "ACCEPTED")
        snapshot = self.client.get("/api/bootstrap").json()
        self.assertEqual(next(item for item in snapshot["assignments"] if item["id"] == second["id"])["status"], "CANCELED")

    def test_owner_is_notified_when_every_requested_caregiver_declines(self):
        child_schedule = self.client.post("/api/child-schedules", json={
            "child_id": "jiu", "title": "축구", "category": "ACTIVITY",
            "starts_at": "2026-09-22T18:00:00+09:00", "ends_at": None,
        }).json()
        assignments = [self.client.post("/api/assignments", json={
            "item_id": child_schedule["care_item_id"], "assignee_id": candidate,
        }).json() for candidate in ("grandma", "dad")]
        for assignment in assignments:
            self.client.post(f"/api/assignments/{assignment['id']}/respond", json={"decision": "REJECTED"})
        notices = self.client.get("/api/bootstrap").json()["notifications"]
        self.assertTrue(any(item["title"] == "가능한 가족이 없어요" for item in notices))

    def test_second_child_can_be_grouped_with_same_available_caregiver(self):
        first = self.client.post("/api/child-schedules", json={
            "child_id": "jiu", "title": "첫째 하원", "category": "SCHOOL",
            "starts_at": "2026-09-23T15:00:00+09:00", "ends_at": None,
        }).json()
        assignment = self.client.post("/api/assignments", json={
            "item_id": first["care_item_id"], "assignee_id": "grandma",
        }).json()
        self.client.post(f"/api/assignments/{assignment['id']}/respond", json={"decision": "ACCEPTED"})
        second = self.client.post("/api/child-schedules", json={
            "child_id": "hayun", "title": "둘째 하원", "category": "SCHOOL",
            "starts_at": "2026-09-23T15:10:00+09:00", "ends_at": None,
        }).json()
        grandma = next(item for item in second["suggestions"] if item["member_id"] == "grandma")
        self.assertTrue(grandma["available"])
        self.assertTrue(grandma["can_bundle_children"])

    def test_unanswered_pro_request_gets_app_reminder_and_device_outbox_record(self):
        child_schedule = self.client.post("/api/child-schedules", json={
            "child_id": "jiu", "title": "피아노", "category": "ACADEMY",
            "starts_at": "2026-09-24T16:00:00+09:00", "ends_at": None,
        }).json()
        assignment = self.client.post("/api/assignments", json={
            "item_id": child_schedule["care_item_id"], "assignee_id": "grandma",
        }).json()
        with database() as db:
            db.execute("UPDATE family_group SET plan = 'PRO' WHERE id = 'demo-family'")
            db.execute("UPDATE care_assignment SET created_at = ? WHERE id = ?",
                       ("2026-09-17T08:00:00+09:00", assignment["id"]))
        processed = process_assignment_reminders(datetime(2026, 9, 17, 9, 0, tzinfo=ZoneInfo("Asia/Seoul")))
        self.assertEqual(processed, 1)
        with database() as db:
            notice = db.execute("SELECT title FROM notification WHERE action_id = ? AND title = ?",
                                (assignment["id"], "돌봄 요청을 확인해주세요")).fetchone()
            outbox = db.execute("SELECT status FROM device_alert_outbox WHERE assignment_id = ?", (assignment["id"],)).fetchone()
        self.assertEqual(notice["title"], "돌봄 요청을 확인해주세요")
        self.assertEqual(outbox["status"], "NOT_CONNECTED")

    def test_emergency_reason_accepts_microphone_transcription(self):
        with database() as db:
            db.execute("UPDATE family_group SET plan = 'PRO' WHERE id = 'demo-family'")
        with patch("app.extended.ai.transcribe_audio", return_value="야근 때문에 하원을 맡기 어려워요"):
            response = self.client.post("/api/audio/transcribe", data={"purpose": "EMERGENCY"},
                                        files={"file": ("emergency.webm", b"voice", "audio/webm")})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["text"], "야근 때문에 하원을 맡기 어려워요")

    def test_ocr_items_are_applied_only_after_review_confirmation(self):
        image = b"\x89PNG\r\n\x1a\nscenario"
        parsed = [
            {"item_type": "SCHEDULE", "title": "현장학습", "detail": "9월 25일 9시 현장학습", "confidence": "LOW",
             "starts_at": "2026-09-25T09:00:00+09:00", "ends_at": None, "category": "SCHOOL"},
            {"item_type": "SUPPLY", "title": "도시락과 모자", "detail": "도시락과 모자 준비", "confidence": "LOW",
             "starts_at": None, "ends_at": None, "category": "OTHER"},
        ]
        with patch("app.extended.ai.extract_image_text", return_value="9월 25일 9시 현장학습, 도시락과 모자 준비"), \
             patch("app.extended.ai.extract_schedule_items", return_value=parsed):
            response = self.client.post("/api/intakes/photo", files={"file": ("notice.png", image, "image/png")},
                                        data={"child_id": "jiu", "source": "CAMERA"})
        self.assertEqual(response.status_code, 201)
        result = response.json()
        self.assertEqual(result["registered_child_schedules"], [])
        self.assertTrue(all(item["status"] == "NEEDS_REVIEW" for item in result["items"]))
        schedule_item = next(item for item in result["items"] if item["item_type"] == "SCHEDULE")
        supply_item = next(item for item in result["items"] if item["item_type"] == "SUPPLY")
        self.assertEqual(self.client.post(f"/api/items/{schedule_item['id']}/confirm").status_code, 200)
        self.assertEqual(len([item for item in self.client.get("/api/bootstrap").json()["child_schedules"] if item["source"] == "NOTICE"]), 1)
        self.assertEqual(next(item for item in result["items"] if item["item_type"] == "SUPPLY")["status"], "NEEDS_REVIEW")
        self.assertEqual(self.client.post(f"/api/items/{supply_item['id']}/confirm").json()["status"], "CONFIRMED")


if __name__ == "__main__":
    unittest.main()
