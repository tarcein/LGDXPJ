"""End-to-end local API checks for the core care flow and policy limits."""

from __future__ import annotations

import os
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from app.db import database
from app.family import _new_session
from app.main import app


class CareFlowTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        os.environ["LGDX_DB_PATH"] = str(Path(self.temp.name) / "test.db")
        os.environ["LGDX_SEED_DEMO"] = "1"
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()

    def tearDown(self) -> None:
        self.client_context.__exit__(None, None, None)
        os.environ.pop("LGDX_DB_PATH", None)
        os.environ.pop("LGDX_SEED_DEMO", None)
        self.temp.cleanup()

    def test_free_plan_rejects_extra_family_members(self) -> None:
        child = self.client.post("/api/children", json={"name": "셋째", "age_label": "3세"})
        member = self.client.post("/api/members", json={"name": "이모", "role": "CAREGIVER"})
        self.assertEqual(child.status_code, 403)
        self.assertEqual(member.status_code, 403)
        self.assertEqual(child.json()["detail"]["code"], "PLAN_LIMIT")

    def test_tv_device_alerts_require_pro_plan(self) -> None:
        blocked = self.client.patch("/api/members/mom/notification-preferences", json={"device_enabled": True})
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.json()["detail"]["code"], "SUBSCRIPTION_REQUIRED")
        with database() as db:
            db.execute("UPDATE family_group SET plan = 'PRO' WHERE id = 'demo-family'")
        enabled = self.client.patch("/api/members/mom/notification-preferences", json={"device_enabled": True})
        self.assertEqual(enabled.status_code, 200)
        self.assertEqual(enabled.json()["device_enabled"], 1)

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
        self.assertFalse(any(handoff["assignment_id"] == assignment_id
                             for handoff in self.client.get("/api/bootstrap").json()["handoffs"]))
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
        snapshot = self.client.get("/api/bootstrap").json()
        self.assertTrue(any(notice["level"] == "IMPORTANT" for notice in snapshot["notifications"]))
        self.assertEqual(len(snapshot["exceptions"]), 1)
        self.assertEqual(snapshot["exceptions"][0]["assignment_id"], "assignment-pickup")
        self.assertNotIn("병원 방문", snapshot["exceptions"][0]["reason"])
        self.assertIn("다른 돌봄자", snapshot["exceptions"][0]["reason"])
        with database() as db:
            notices = {row["member_id"]: row["body"] for row in db.execute(
                "SELECT member_id, body FROM notification WHERE title = '일정 충돌 감지'"
            ).fetchall()}
        self.assertIn("병원 방문", notices["grandma"])
        self.assertNotIn("병원 방문", notices["mom"])

    def test_database_storage_full_returns_cors_error_and_rolls_back_acceptance(self):
        from unittest.mock import patch
        from psycopg.errors import DiskFull

        with database() as db:
            db.execute("UPDATE care_assignment SET status = 'PROPOSED' WHERE id = 'assignment-pickup'")
            db.execute("UPDATE care_item SET status = 'CONFIRMED' WHERE id = 'pickup'")
        origin = "http://localhost:5173"
        for failure in ("app.main._propagate_routine_assignment", "app.main.resolve_bearer"):
            with self.subTest(failure=failure), patch(failure, side_effect=DiskFull("No space left on device")), self.assertLogs("app.main", level="ERROR"):
                response = self.client.post("/api/assignments/assignment-pickup/respond",
                    headers={"Origin": origin}, json={"decision": "ACCEPTED"})
            self.assertEqual(response.status_code, 503, response.text)
            self.assertEqual(response.headers.get("access-control-allow-origin"), origin)
            self.assertEqual(response.json(), {
                "detail": {
                    "message": "서버 저장 공간이 부족해 저장하지 못했어요. 잠시 후 다시 시도해주세요.",
                    "code": "DATABASE_STORAGE_FULL",
                },
            })
            with database() as db:
                assignment = db.execute("SELECT status, responded_at FROM care_assignment WHERE id = 'assignment-pickup'").fetchone()
                self.assertEqual(assignment["status"], "PROPOSED")
                self.assertIsNone(assignment["responded_at"])
                self.assertEqual(db.execute("SELECT status FROM care_item WHERE id = 'pickup'").fetchone()["status"], "CONFIRMED")
                self.assertIsNone(db.execute("SELECT 1 FROM notification WHERE title = '배정이 확정됐어요'").fetchone())


    def test_google_sync_flags_care_collision_once_and_allows_alternative_request(self):
        self._check_calendar_sync_collision("google")

    def test_outlook_sync_flags_care_collision_once_and_allows_alternative_request(self):
        self._check_calendar_sync_collision("microsoft")

    def _check_calendar_sync_collision(self, provider, *, approve=True):
        from datetime import timezone
        from unittest.mock import patch

        import httpx

        pickup = next(item for item in self.client.get("/api/bootstrap").json()["items"] if item["id"] == "pickup")
        care_time = datetime.fromisoformat(pickup["starts_at"])
        with database() as db:
            token = _new_session(db, "demo-family", "grandma")
            db.execute("""INSERT INTO calendar_connection
                (family_id, member_id, provider, access_token, connected_at)
                VALUES ('demo-family', 'grandma', ?, 'test-access', ?)""", (provider, care_time.isoformat()))
        headers = {"Authorization": "Bearer " + token}
        events = [{
            "id": "friends", "summary": "친구 약속",
            "start": {"dateTime": care_time.astimezone(timezone.utc).isoformat()},
            "end": {"dateTime": (care_time + timedelta(hours=1)).astimezone(timezone.utc).isoformat()},
        }, {
            "id": "overlapping", "summary": "겹치는 두 번째 약속",
            "start": {"dateTime": care_time.isoformat()},
            "end": {"dateTime": (care_time + timedelta(hours=2)).isoformat()},
        }]
        if provider == "microsoft":
            for event in events:
                event["subject"] = event.pop("summary")
                for boundary in ("start", "end"):
                    value = datetime.fromisoformat(event[boundary]["dateTime"]).astimezone(timezone.utc)
                    event[boundary] = {"dateTime": value.replace(tzinfo=None).isoformat(), "timeZone": "UTC"}
        response = httpx.Response(200, request=httpx.Request("GET", "https://calendar.example/events"),
                                  json={"items" if provider == "google" else "value": events})
        with patch("app.calendar._refresh", return_value="test-access"), patch("app.calendar.httpx.get", return_value=response):
            for _ in range(2):
                synced = self.client.post(f"/api/calendar-connections/{provider}/sync", headers=headers)
                self.assertEqual(synced.status_code, 200, synced.text)
                self.assertEqual(synced.json()["imported"], 2)

        snapshot = self.client.get("/api/bootstrap", headers=headers).json()
        self.assertEqual(len([s for s in snapshot["schedules"] if s.get("external_source") == provider]), 2)
        original = next(a for a in snapshot["assignments"] if a["id"] == "assignment-pickup")
        self.assertEqual(original["status"], "RECONFIRMATION_REQUIRED")
        self.assertEqual(len(snapshot["exceptions"]), 1)
        exception = snapshot["exceptions"][0]
        self.assertEqual(exception["assignment_id"], original["id"])
        self.assertEqual(exception["status"], "PENDING")
        self.assertIn("본인의 개인 일정과 겹쳐", exception["reason"])
        self.assertNotIn("다른 돌봄자", exception["reason"])
        self.assertNotEqual(exception["alternative_member_id"], "grandma")
        notices = [n for n in snapshot["notifications"] if n["title"] == "일정 충돌 감지"]
        self.assertEqual(len(notices), 1)
        self.assertIn("친구 약속", notices[0]["body"])
        if not approve:
            return headers, exception, care_time
        approved = self.client.post(f"/api/exceptions/{exception['id']}/approve", headers=headers)
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(approved.json()["assignment"]["status"], "PROPOSED")
        self.assertEqual(approved.json()["assignment"]["assignee_id"], exception["alternative_member_id"])
        return headers, approved.json(), care_time

    def test_disconnect_resolves_conflict_restores_care_and_removes_warning(self):
        headers, exception, _ = self._check_calendar_sync_collision("google", approve=False)
        for _ in range(2):
            response = self.client.post('/api/calendar-connections/google/disconnect', headers=headers)
            self.assertEqual(response.status_code, 200, response.text)
        snapshot = self.client.get('/api/bootstrap', headers=headers).json()
        self.assertEqual(next(e for e in snapshot['exceptions'] if e['id'] == exception['id'])['status'], 'RESOLVED')
        self.assertEqual(next(a for a in snapshot['assignments'] if a['id'] == 'assignment-pickup')['status'], 'ACCEPTED')
        self.assertEqual(next(i for i in snapshot['items'] if i['id'] == 'pickup')['status'], 'ASSIGNED')
        self.assertFalse(any(s.get('external_source') == 'google' for s in snapshot['schedules']))
        with database() as db:
            self.assertIsNone(db.execute("SELECT 1 FROM notification WHERE title = '일정 충돌 감지'").fetchone())

    def test_disconnect_keeps_remaining_schedule_conflict_until_deleted(self):
        headers, exception, care_time = self._check_calendar_sync_collision('google', approve=False)
        # Even the existing 30-minute travel buffer must keep the warning active.
        schedule = self.client.post('/api/schedules', headers=headers, json={
            'member_id': 'grandma', 'title': '남아 있는 개인 일정',
            'starts_at': (care_time - timedelta(hours=1)).isoformat(),
            'ends_at': (care_time - timedelta(minutes=15)).isoformat(),
        }).json()['schedule']
        self.client.post('/api/calendar-connections/google/disconnect', headers=headers)
        snapshot = self.client.get('/api/bootstrap', headers=headers).json()
        self.assertEqual(next(e for e in snapshot['exceptions'] if e['id'] == exception['id'])['status'], 'PENDING')
        self.assertEqual(next(a for a in snapshot['assignments'] if a['id'] == 'assignment-pickup')['status'], 'RECONFIRMATION_REQUIRED')
        removed = self.client.delete('/api/schedules/' + schedule['id'], headers=headers)
        self.assertEqual(removed.status_code, 200, removed.text)
        snapshot = self.client.get('/api/bootstrap', headers=headers).json()
        self.assertEqual(next(e for e in snapshot['exceptions'] if e['id'] == exception['id'])['status'], 'RESOLVED')
        self.assertEqual(next(a for a in snapshot['assignments'] if a['id'] == 'assignment-pickup')['status'], 'ACCEPTED')

    def test_disconnect_preserves_approved_reassignment(self):
        headers, approved, _ = self._check_calendar_sync_collision('google')
        response = self.client.post('/api/calendar-connections/google/disconnect', headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        snapshot = self.client.get('/api/bootstrap', headers=headers).json()
        self.assertEqual(next(e for e in snapshot['exceptions'] if e['id'] == approved['exception']['id'])['status'], 'APPROVED')
        self.assertEqual(next(a for a in snapshot['assignments'] if a['id'] == 'assignment-pickup')['status'], 'CANCELED')
        self.assertEqual(next(a for a in snapshot['assignments'] if a['id'] == approved['assignment']['id'])['status'], 'PROPOSED')

    def test_disconnect_preserves_manual_exception(self):
        headers, automatic, _ = self._check_calendar_sync_collision('google', approve=False)
        response = self.client.post('/api/exceptions', headers=headers, json={
            'assignment_id': 'assignment-pickup', 'alternative_member_id': 'mom', 'reason': '개인 사정으로 변경 요청',
        })
        self.assertEqual(response.status_code, 201, response.text)
        manual = response.json()
        self.client.post('/api/calendar-connections/google/disconnect', headers=headers)
        snapshot = self.client.get('/api/bootstrap', headers=headers).json()
        self.assertEqual(next(e for e in snapshot['exceptions'] if e['id'] == automatic['id'])['status'], 'RESOLVED')
        self.assertEqual(next(e for e in snapshot['exceptions'] if e['id'] == manual['id'])['status'], 'PENDING')

    def test_sync_removing_google_events_resolves_existing_conflict(self):
        from unittest.mock import patch
        import httpx

        headers, exception, _ = self._check_calendar_sync_collision('google', approve=False)
        empty = httpx.Response(200, request=httpx.Request('GET', 'https://calendar.example/events'), json={'items': []})
        with patch('app.calendar._refresh', return_value='test-access'), patch('app.calendar.httpx.get', return_value=empty):
            result = self.client.post('/api/calendar-connections/google/sync', headers=headers)
        self.assertEqual(result.status_code, 200, result.text)
        snapshot = self.client.get('/api/bootstrap', headers=headers).json()
        self.assertEqual(next(e for e in snapshot['exceptions'] if e['id'] == exception['id'])['status'], 'RESOLVED')
        self.assertEqual(next(a for a in snapshot['assignments'] if a['id'] == 'assignment-pickup')['status'], 'ACCEPTED')

    def test_startup_resolves_legacy_conflict_after_calendar_already_disconnected(self):
        from app.db import initialize
        from app.main import resolve_schedule_collisions

        headers, exception, _ = self._check_calendar_sync_collision('google', approve=False)
        with database() as db:
            db.execute("DELETE FROM personal_schedule WHERE member_id = 'grandma'")
            db.execute("UPDATE care_exception SET reason = '다른 돌봄자에게 겹치는 개인 일정이 있어 ' || (SELECT title FROM care_item WHERE id = 'pickup') || ' 담당자를 조정해야 해요.' WHERE id = ?", (exception['id'],))
            db.execute('ALTER TABLE care_exception DROP COLUMN source')
            db.execute('ALTER TABLE care_assignment DROP COLUMN conflict_previous_status')
        initialize()
        with database() as db:
            resolve_schedule_collisions(db, 'demo-family', 'grandma')
        snapshot = self.client.get('/api/bootstrap', headers=headers).json()
        self.assertEqual(next(e for e in snapshot['exceptions'] if e['id'] == exception['id'])['status'], 'RESOLVED')
        self.assertEqual(next(a for a in snapshot['assignments'] if a['id'] == 'assignment-pickup')['status'], 'ACCEPTED')

    def test_existing_exception_reason_is_only_returned_to_original_caregiver(self):
        original_reason = '회식 일정과 발레 돌봄이 겹쳐요.'
        with database() as db:
            tokens = {member: _new_session(db, 'demo-family', member)
                      for member in ('mom', 'dad', 'grandma')}
            db.execute("""INSERT INTO care_exception
                (id, family_id, assignment_id, reason, alternative_member_id, status, created_at)
                VALUES ('legacy-conflict', 'demo-family', 'assignment-pickup', ?, 'mom', 'PENDING', ?)""",
                (original_reason, datetime.now().isoformat()))
            db.execute("""INSERT INTO care_exception
                (id, family_id, assignment_id, reason, alternative_member_id, status, created_at)
                VALUES ('legacy-generic', 'demo-family', 'assignment-pickup', ?, 'mom', 'PENDING', ?)""",
                ('다른 돌봄자에게 겹치는 개인 일정이 있어 발레 하원 담당자를 조정해야 해요.', datetime.now().isoformat()))
        for member, token in tokens.items():
            with self.subTest(member=member):
                headers = {'Authorization': 'Bearer ' + token}
                result = self.client.get('/api/bootstrap', headers=headers)
                self.assertEqual(result.status_code, 200)
                reason = next(e['reason'] for e in result.json()['exceptions'] if e['id'] == 'legacy-conflict')
                self.assertEqual(reason, original_reason if member == 'grandma'
                                 else '다른 돌봄자의 일정 조정이 필요해요.')
                generic_reason = next(e['reason'] for e in result.json()['exceptions'] if e['id'] == 'legacy-generic')
                self.assertEqual(generic_reason, '본인의 개인 일정과 겹쳐 발레 하원 담당자를 조정해야 해요.'
                                 if member == 'grandma' else '다른 돌봄자의 일정 조정이 필요해요.')
                shared = self.client.get('/api/bootstrap?tv=true', headers=headers).json()
                self.assertNotIn('회식', str(shared['exceptions']))
                self.assertNotIn('본인의', str(shared['exceptions']))


    def test_other_family_member_can_claim_pending_request_once(self):
        with database() as db:
            token = _new_session(db, 'demo-family', 'mom')
            db.execute("UPDATE care_assignment SET status = 'PROPOSED' WHERE id = 'assignment-pickup'")
        headers = {'Authorization': 'Bearer ' + token}
        url = '/api/assignments/assignment-pickup/respond'
        self.assertEqual(self.client.post(url, headers=headers, json={'decision': 'REJECTED'}).status_code, 403)
        response = self.client.post(url, headers=headers, json={'decision': 'ACCEPTED'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['assignee_id'], 'mom')
        self.assertEqual(response.json()['status'], 'ACCEPTED')
        self.assertNotEqual(response.json()['id'], 'assignment-pickup')
        self.assertEqual(self.client.post(url, headers=headers, json={'decision': 'ACCEPTED'}).status_code, 409)
        with database() as db:
            self.assertEqual(db.execute("SELECT status FROM care_assignment WHERE id = 'assignment-pickup'").fetchone()['status'], 'CANCELED')
            self.assertEqual(db.execute("SELECT COUNT(*) FROM care_assignment WHERE item_id = 'pickup' AND status = 'ACCEPTED'").fetchone()[0], 1)

    def test_simultaneous_claims_only_confirm_one_caregiver(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        with database() as db:
            tokens = [_new_session(db, 'demo-family', member) for member in ('mom', 'dad')]
            db.execute("UPDATE care_assignment SET status = 'PROPOSED' WHERE id = 'assignment-pickup'")
            db.execute("UPDATE care_item SET starts_at = '2030-10-01T15:00:00+09:00' WHERE id = 'pickup'")
        barrier = Barrier(2)
        def claim(token):
            barrier.wait()
            return self.client.post('/api/assignments/assignment-pickup/respond',
                headers={'Authorization': 'Bearer ' + token}, json={'decision': 'ACCEPTED'}).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(claim, tokens)), [200, 409])

    def test_claim_rejects_busy_member_and_other_family(self):
        with database() as db:
            token = _new_session(db, 'demo-family', 'mom')
            db.execute("UPDATE care_assignment SET status = 'PROPOSED' WHERE id = 'assignment-pickup'")
            db.execute("UPDATE care_item SET starts_at = '2030-10-01T15:00:00+09:00' WHERE id = 'pickup'")
            db.execute("""INSERT INTO personal_schedule
                (id, family_id, member_id, title, starts_at, ends_at)
                VALUES ('busy-claim', 'demo-family', 'mom', '개인 일정',
                        '2030-10-01T14:00:00+09:00', '2030-10-01T16:00:00+09:00')""")
        url = '/api/assignments/assignment-pickup/respond'
        self.assertEqual(self.client.post(url, headers={'Authorization': 'Bearer ' + token},
            json={'decision': 'ACCEPTED'}).status_code, 409)
        outsider = self.client.post('/api/families', json={'name': '다른 가족', 'owner_name': '외부인'}).json()
        self.assertEqual(self.client.post(url, headers={'Authorization': 'Bearer ' + outsider['access_token']},
            json={'decision': 'ACCEPTED'}).status_code, 404)


class EmptyDatabaseOnboardingTest(unittest.TestCase):
    def test_first_family_can_be_created_without_demo_data(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            os.environ["LGDX_DB_PATH"] = str(Path(temp) / "empty.db")
            os.environ["LGDX_SEED_DEMO"] = "0"
            try:
                with TestClient(app) as client:
                    response = client.post(
                        "/api/families",
                        json={"name": "새 가족", "owner_name": "정희원"},
                    )
                    self.assertEqual(response.status_code, 201)
                    payload = response.json()
                    member_response = client.post(
                        "/api/members",
                        headers={"Authorization": f"Bearer {payload['access_token']}"},
                        json={"name": "김태준", "role": "PARENT"},
                    )
                    self.assertEqual(member_response.status_code, 201)
                    with database() as db:
                        family_count = db.execute("SELECT COUNT(*) FROM family_group").fetchone()[0]
                        invitation = db.execute(
                            "SELECT created_by_member_id FROM family_invite_link WHERE family_id = ?",
                            (payload["family_id"],),
                        ).fetchone()
                    self.assertEqual(family_count, 1)
                    self.assertEqual(invitation["created_by_member_id"], payload["member_id"])
            finally:
                os.environ.pop("LGDX_DB_PATH", None)
                os.environ.pop("LGDX_SEED_DEMO", None)


if __name__ == "__main__":
    unittest.main()
