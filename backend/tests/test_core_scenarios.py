"""Scenario checks for schedule actions, parallel care requests, and escalation."""

from __future__ import annotations

import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta
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

    def test_chat_registers_homework_as_homework_not_a_schedule(self):
        structured = {
            "answer": "지우의 수학 숙제를 등록할게요.", "cards": [],
            "schedule_changes": [], "schedule_creations": [],
            "care_item_creations": [{
                "item_type": "HOMEWORK", "child_id": "jiu",
                "title": "수학 문제집 3단원", "due_date": "2026-09-21",
            }],
        }
        with patch("app.extended.ai.answer", return_value=(structured, 30)):
            response = self.client.post("/api/assistant/chat", json={
                "message": "지우 수학 문제집 3단원을 9월 21일 숙제로 등록해줘",
            })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["schedule_creations"], [])
        self.assertEqual(response.json()["care_item_creations"][0]["title"], "수학 문제집 3단원")
        snapshot = self.client.get("/api/bootstrap").json()
        homework = next(item for item in snapshot["items"] if item["title"] == "수학 문제집 3단원")
        self.assertEqual(homework["item_type"], "HOMEWORK")
        self.assertEqual(homework["starts_at"], "2026-09-21T00:00:00+09:00")
        self.assertFalse(any(item["title"] == "수학 문제집 3단원" for item in snapshot["child_schedules"]))

    def test_chat_routes_emergency_help_to_the_confirmed_request_screen(self):
        structured = {
            "answer": "긴급 도움을 요청할 수 있어요.", "cards": [],
            "schedule_changes": [], "schedule_creations": [], "care_item_creations": [],
        }
        with patch("app.extended.ai.answer", return_value=(structured, 20)):
            response = self.client.post("/api/assistant/chat", json={"message": "긴급 도움 요청하고 싶어"})
        self.assertEqual(response.status_code, 200)
        card = next(card for card in response.json()["cards"] if card["screen"] == "emergency")
        self.assertEqual(card["title"], "가족에게 도움 요청하기")

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

    def test_notification_feed_is_bounded_and_matches_bootstrap(self):
        with database() as db:
            base = datetime(2099, 9, 1, tzinfo=ZoneInfo("Asia/Seoul"))
            for index in range(105):
                db.execute(
                    """INSERT INTO notification(id, family_id, member_id, title, body, created_at)
                       VALUES (?, 'demo-family', 'mom', ?, '', ?)""",
                    (f"feed-{index}", f"알림 {index}", (base + timedelta(minutes=index)).isoformat()),
                )
        feed = self.client.get("/api/notifications").json()["notifications"]
        bootstrap_notices = self.client.get("/api/bootstrap").json()["notifications"]
        self.assertEqual(len(feed), 100)
        self.assertEqual(feed[0]["id"], "feed-104")
        self.assertEqual([item["id"] for item in feed], [item["id"] for item in bootstrap_notices])

    def test_repeated_schedule_update_keeps_one_unread_notification(self):
        schedule = self.client.post("/api/child-schedules", json={
            "child_id": "jiu", "title": "태권도", "category": "ACADEMY",
            "starts_at": "2026-09-23T16:00:00+09:00", "ends_at": "2026-09-23T17:00:00+09:00",
        }).json()
        update = {
            "child_id": "jiu", "title": "태권도", "category": "ACADEMY",
            "starts_at": "2026-09-23T16:30:00+09:00", "ends_at": "2026-09-23T17:30:00+09:00",
        }
        self.assertEqual(self.client.patch(f"/api/child-schedules/{schedule['id']}", json=update).status_code, 200)
        self.assertEqual(self.client.patch(f"/api/child-schedules/{schedule['id']}", json=update).status_code, 200)
        notices = self.client.get("/api/notifications").json()["notifications"]
        repeated = [notice for notice in notices if notice["title"] == "변경 일정의 담당자를 다시 확인해주세요"]
        self.assertEqual(len(repeated), 1)

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
        with patch("app.main.notify"):
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

    def test_unassigned_schedule_gets_one_hour_push_and_care_suggestion_link(self):
        with patch("app.main.notify"):
            child_schedule = self.client.post("/api/child-schedules", json={
                "child_id": "jiu", "title": "피아노", "category": "ACADEMY",
                "starts_at": "2026-09-24T16:00:00+09:00", "ends_at": None,
            }).json()
        self.client.post("/api/push-tokens", json={
            "token": "unassigned-owner-device-token", "platform": "ANDROID",
        })
        with patch("app.reminders._send_push", return_value=[]) as deliver:
            processed = process_assignment_reminders(datetime(2026, 9, 24, 15, 0, tzinfo=ZoneInfo("Asia/Seoul")))
        self.assertEqual(processed, 1)
        with database() as db:
            notice = db.execute(
                "SELECT * FROM notification WHERE title = ? AND action_id = ?",
                ("담당자 배정이 필요해요", child_schedule["care_item_id"]),
            ).fetchone()
        self.assertEqual(notice["action_type"], "CARE_SUGGESTION")
        self.assertEqual(notice["member_id"], "mom")
        self.assertEqual(deliver.call_args.args[3:], ("CARE_SUGGESTION", child_schedule["care_item_id"]))
        self.assertEqual(process_assignment_reminders(datetime(2026, 9, 24, 15, 1, tzinfo=ZoneInfo("Asia/Seoul"))), 0)

    def test_overdue_assignment_notifies_caregiver_and_owner_once(self):
        with database() as db:
            db.execute(
                """INSERT INTO care_item(id, family_id, child_id, item_type, title, detail,
                   starts_at, confidence, status, created_at)
                   VALUES ('overdue-item', 'demo-family', 'jiu', 'TODO', '피아노 하원', '',
                           '2026-09-24T16:00:00+09:00', 'HIGH', 'ASSIGNED', '2026-09-24T12:00:00+09:00')"""
            )
            db.execute(
                """INSERT INTO care_assignment(id, family_id, item_id, assignee_id, status, source,
                   created_at, responded_at, requested_by_member_id)
                   VALUES ('overdue-assignment', 'demo-family', 'overdue-item', 'grandma', 'ACCEPTED',
                           'ROLE_MATCH', '2026-09-24T12:00:00+09:00', '2026-09-24T12:01:00+09:00', 'mom')"""
            )
            for token, member_id in (("overdue-caregiver-token", "grandma"), ("overdue-owner-token", "mom")):
                db.execute(
                    """INSERT INTO push_device_token(token, family_id, member_id, platform, created_at, updated_at)
                       VALUES (?, 'demo-family', ?, 'ANDROID', '2026-09-24T12:00:00+09:00', '2026-09-24T12:00:00+09:00')""",
                    (token, member_id),
                )
        before = datetime(2026, 9, 24, 15, 59, tzinfo=ZoneInfo("Asia/Seoul"))
        after = datetime(2026, 9, 24, 16, 1, tzinfo=ZoneInfo("Asia/Seoul"))
        with patch("app.reminders._send_push", return_value=[]) as deliver:
            self.assertEqual(process_assignment_reminders(before), 0)
            self.assertEqual(process_assignment_reminders(after), 1)
            self.assertEqual(process_assignment_reminders(after + timedelta(minutes=1)), 0)
        with database() as db:
            notices = db.execute(
                """SELECT member_id, action_type FROM notification
                   WHERE title = '완료 체크가 필요해요' AND action_id = 'overdue-assignment'
                   ORDER BY member_id"""
            ).fetchall()
        self.assertEqual(
            [(notice["member_id"], notice["action_type"]) for notice in notices],
            [("grandma", "ASSIGNMENT_REQUEST"), ("mom", "ASSIGNMENT_RESULT")],
        )
        self.assertEqual(deliver.call_count, 2)

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
