"""Contract checks for family isolation, usage limits, and media/assistant handoff."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import ai
from app.main import app


class ExtendedFlowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        os.environ["LGDX_DB_PATH"] = str(Path(self.temp.name) / "test.db")
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        for key in ("LGDX_DB_PATH", "LGDX_DEV_MODE", "LGDX_DEV_TOKEN", "LGDX_REQUIRE_AUTH"):
            os.environ.pop(key, None)
        self.temp.cleanup()

    def test_invite_code_joins_only_one_family_and_respects_member_limit(self):
        room_a = self.client.post("/api/families", json={"name": "가족 A", "owner_name": "엄마"})
        room_b = self.client.post("/api/families", json={"name": "가족 B", "owner_name": "아빠"})
        self.assertEqual(room_a.status_code, 201)
        self.assertEqual(room_b.status_code, 201)
        a, b = room_a.json(), room_b.json()
        a_headers = {"Authorization": "Bearer " + a["access_token"]}
        b_headers = {"Authorization": "Bearer " + b["access_token"]}
        self.assertEqual(self.client.get("/api/bootstrap", headers=a_headers).json()["family"]["id"], a["family_id"])
        self.assertEqual(self.client.post("/api/children", headers=a_headers, json={"name": "지민", "age_label": "4세"}).status_code, 201)
        self.assertEqual(self.client.get("/api/bootstrap", headers=b_headers).json()["children"], [])
        joined = self.client.post("/api/families/join", json={"invite_code": a["invite_code"], "name": "할머니", "role": "GRANDPARENT"})
        self.assertEqual(joined.status_code, 201)
        member_headers = {"Authorization": "Bearer " + joined.json()["access_token"]}
        member_data = self.client.get("/api/bootstrap", headers=member_headers).json()
        self.assertEqual(member_data["children"][0]["name"], "지민")
        self.assertTrue(any(p["member_id"] == joined.json()["member_id"] for p in member_data["permissions"]))
        self.assertEqual(self.client.post("/api/schedules", headers=a_headers, json={
            "member_id": a["member_id"], "title": "개인 병원 일정",
            "starts_at": "2026-09-15T10:00:00+09:00", "ends_at": "2026-09-15T11:00:00+09:00",
        }).status_code, 201)
        self.assertEqual(self.client.get("/api/bootstrap", headers=a_headers).json()["schedules"][0]["title"], "개인 병원 일정")
        self.assertEqual(self.client.get("/api/bootstrap", headers=member_headers).json()["schedules"][0]["title"], "바쁨")
        self.assertEqual(self.client.post("/api/families/invite-code/rotate", headers=member_headers).status_code, 403)
        self.assertEqual(self.client.post("/api/families/join", json={"invite_code": a["invite_code"], "name": "이모", "role": "CAREGIVER"}).status_code, 201)
        fourth = self.client.post("/api/families/join", json={"invite_code": a["invite_code"], "name": "삼촌", "role": "CAREGIVER"})
        self.assertEqual(fourth.status_code, 403)
        self.assertEqual(fourth.json()["detail"]["code"], "PLAN_LIMIT")
        self.assertEqual(self.client.get("/api/bootstrap", headers={"Authorization": "Bearer bad"}).status_code, 401)
        os.environ["LGDX_REQUIRE_AUTH"] = "1"
        self.assertEqual(self.client.get("/api/bootstrap").status_code, 401)
        self.assertEqual(self.client.get("/api/bootstrap", headers=member_headers).status_code, 200)

    def test_photo_ocr_limit_and_developer_pro_preview(self):
        image = b"\x89PNG\r\n\x1a\n" + b"demo-image"
        os.environ["LGDX_DEV_MODE"] = "1"
        os.environ["LGDX_DEV_TOKEN"] = "local-test-token"
        with patch("app.extended.ai.extract_image_text", return_value="준비물: 모자") as extract:
            for _ in range(2):
                response = self.client.post("/api/intakes/photo", files={"file": ("notice.png", image, "image/png")}, data={"child_id": "jiu", "source": "CAMERA"})
                self.assertEqual(response.status_code, 201)
                self.assertEqual(response.json()["transcript"], "준비물: 모자")
            blocked = self.client.post("/api/intakes/photo", files={"file": ("notice.png", image, "image/png")})
            self.assertEqual(blocked.status_code, 403)
            self.assertEqual(blocked.json()["detail"]["code"], "OCR_DAILY_LIMIT")
            self.assertEqual(extract.call_count, 2)
            self.assertEqual(self.client.post("/api/dev/preview-plan", json={"plan": "PRO"}).status_code, 404)
            changed = self.client.post("/api/dev/preview-plan", json={"plan": "PRO"}, headers={"X-Developer-Token": "local-test-token"})
            self.assertEqual(changed.json()["status"], "DEV_PREVIEW")
            feature_data = self.client.get("/api/features").json()
            self.assertEqual(feature_data["plan"], "PRO")
            states = {feature["id"]: feature["backend_state"] for feature in feature_data["features"]}
            self.assertEqual(states["emergency_request"], "READY")
            self.assertEqual(states["voice_schedule"], "PARTIAL")
            self.assertEqual(states["family_album"], "NOT_CONNECTED")
            self.assertEqual(self.client.post("/api/intakes/photo", files={"file": ("notice.png", image, "image/png")}).status_code, 201)

    def test_ocr_failure_does_not_consume_daily_allowance(self):
        image = b"\x89PNG\r\n\x1a\n" + b"demo-image"
        from fastapi import HTTPException
        with patch("app.extended.ai.extract_image_text", side_effect=HTTPException(422, "인식 실패")):
            self.assertEqual(self.client.post("/api/intakes/photo", files={"file": ("notice.png", image, "image/png")}).status_code, 422)
        self.assertEqual(self.client.get("/api/features").json()["usage"]["ocr_today"], 0)

    def test_openai_credit_exhaustion_is_reported_explicitly(self):
        request = httpx.Request("POST", "https://api.openai.com/v1/responses")
        response = httpx.Response(429, json={
            "error": {"type": "insufficient_quota", "code": "credit_balance_exhausted"},
        }, request=request)
        with patch("app.ai.api_key", return_value="test-key"), patch("app.ai.httpx.Client") as client:
            client.return_value.__enter__.return_value.post.return_value = response
            with self.assertRaises(HTTPException) as caught:
                ai._post("/responses", json={"input": "hello"})
        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(caught.exception.detail["code"], "OPENAI_CREDITS_EXHAUSTED")

    def test_free_voice_chat_and_handoff_note(self):
        with patch("app.extended.ai.transcribe_audio", return_value="오늘 하원 누가 맡아?"), patch("app.extended.ai.answer", return_value=("할머니가 담당입니다.", 23)) as answer:
            voice = self.client.post("/api/assistant/voice", files={"file": ("voice.webm", b"demo-voice", "audio/webm")})
            self.assertEqual(voice.status_code, 200)
            self.assertEqual(voice.json()["transcript"], "오늘 하원 누가 맡아?")
            self.assertEqual(voice.json()["answer"], "할머니가 담당입니다.")
            self.assertIn("하원", answer.call_args.args[1])
            self.assertEqual(self.client.get("/api/features").json()["usage"]["chat_tokens_today"], 23)
            self.assertEqual([m["role"] for m in self.client.get("/api/assistant/history").json()["messages"]],
                             ["user", "assistant"])
            self.assertEqual(self.client.post("/api/audio/transcribe", files={"file": ("voice.webm", b"demo-voice", "audio/webm;codecs=opus")}, data={"purpose": "HANDOFF_NOTE"}).status_code, 200)
            paid = self.client.post("/api/audio/transcribe", files={"file": ("voice.webm", b"demo-voice", "audio/webm")}, data={"purpose": "SCHEDULE"})
            self.assertEqual(paid.status_code, 403)
            self.assertEqual(paid.json()["detail"]["code"], "SUBSCRIPTION_REQUIRED")
        intake = self.client.post("/api/intakes", json={"child_id": "jiu", "raw_content": "준비물: 물병"}).json()
        item_id = intake["items"][0]["id"]
        self.client.post(f"/api/items/{item_id}/confirm")
        assignment = self.client.post("/api/assignments", json={"item_id": item_id, "assignee_id": "grandma"}).json()
        self.client.post(f"/api/assignments/{assignment['id']}/respond", json={"decision": "ACCEPTED"})
        handoff = next(h for h in self.client.get("/api/bootstrap").json()["handoffs"] if h["assignment_id"] == assignment["id"])
        changed = self.client.patch(f"/api/handoffs/{handoff['id']}", json={"special_note": "우산 챙기기"})
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(changed.json()["special_note"], "우산 챙기기")

    def test_completed_note_reaches_next_handoff_and_only_recipient_acknowledges(self):
        owner = self.client.post("/api/families", json={"name": "우리 방", "owner_name": "엄마"}).json()
        caregiver = self.client.post("/api/families/join", json={"invite_code": owner["invite_code"], "name": "할머니", "role": "GRANDPARENT"}).json()
        owner_headers = {"Authorization": "Bearer " + owner["access_token"]}
        caregiver_headers = {"Authorization": "Bearer " + caregiver["access_token"]}
        child = self.client.post("/api/children", headers=owner_headers, json={"name": "아이", "age_label": "4세"}).json()
        intake = self.client.post("/api/intakes", headers=owner_headers, json={"child_id": child["id"], "raw_content": "준비물: 모자"}).json()
        item_id = intake["items"][0]["id"]
        self.client.post(f"/api/items/{item_id}/confirm", headers=owner_headers)
        assignment = self.client.post("/api/assignments", headers=owner_headers, json={"item_id": item_id, "assignee_id": caregiver["member_id"]}).json()
        respond_path = f"/api/assignments/{assignment['id']}/respond"
        self.assertEqual(self.client.post(respond_path, headers=owner_headers, json={"decision": "ACCEPTED"}).status_code, 403)
        self.assertEqual(self.client.post(respond_path, headers=caregiver_headers, json={"decision": "ACCEPTED"}).status_code, 200)
        complete_path = f"/api/assignments/{assignment['id']}/complete"
        self.assertEqual(self.client.post(complete_path, headers=caregiver_headers, json={"note": "열이 조금 있었음"}).status_code, 200)
        auto_handoff = next(h for h in self.client.get("/api/bootstrap", headers=owner_headers).json()["handoffs"]
                            if h["assignment_id"] == assignment["id"] and h["to_member_id"] == owner["member_id"])
        self.assertIn("열이 조금 있었음", auto_handoff["briefing"])
        self.assertEqual(auto_handoff["special_note"], "열이 조금 있었음")
        handoff = self.client.post(f"/api/assignments/{assignment['id']}/handoff", headers=caregiver_headers,
                                   json={"to_member_id": owner["member_id"]})
        self.assertEqual(handoff.status_code, 201)
        self.assertEqual(handoff.json()["special_note"], "열이 조금 있었음")
        ack_path = f"/api/handoffs/{handoff.json()['id']}/acknowledge"
        self.assertEqual(self.client.post(ack_path, headers=caregiver_headers).status_code, 403)
        self.assertEqual(self.client.post(ack_path, headers=owner_headers).status_code, 200)

    def test_emergency_request_first_claim_reassigns_and_closes_for_everyone(self):
        os.environ["LGDX_DEV_MODE"] = "1"
        os.environ["LGDX_DEV_TOKEN"] = "local-test-token"
        owner = self.client.post("/api/families", json={"name": "우리 방", "owner_name": "엄마"}).json()
        current = self.client.post("/api/families/join", json={
            "invite_code": owner["invite_code"], "name": "할머니", "role": "GRANDPARENT"}).json()
        replacement = self.client.post("/api/families/join", json={
            "invite_code": owner["invite_code"], "name": "아빠", "role": "PARENT"}).json()
        headers = lambda room: {"Authorization": "Bearer " + room["access_token"]}
        child = self.client.post("/api/children", headers=headers(owner), json={"name": "아이", "age_label": "4세"}).json()
        intake = self.client.post("/api/intakes", headers=headers(owner), json={
            "child_id": child["id"], "raw_content": "15:00 하원"}).json()
        item_id = intake["items"][0]["id"]
        self.client.post(f"/api/items/{item_id}/confirm", headers=headers(owner))
        assignment = self.client.post("/api/assignments", headers=headers(owner), json={
            "item_id": item_id, "assignee_id": current["member_id"]}).json()
        self.client.post(f"/api/assignments/{assignment['id']}/respond", headers=headers(current),
                         json={"decision": "ACCEPTED"})
        path = "/api/emergency-requests"
        self.assertEqual(self.client.post(path, headers=headers(owner), json={"assignment_id": assignment["id"]}).status_code, 403)
        self.client.post("/api/dev/preview-plan", headers={**headers(owner), "X-Developer-Token": "local-test-token"},
                         json={"plan": "PRO"})
        created = self.client.post(path, headers=headers(owner), json={
            "assignment_id": assignment["id"], "reason": "갑자기 일정이 바뀌었어요"})
        self.assertEqual(created.status_code, 201)
        request_id = created.json()["request"]["id"]
        self.assertEqual(set(created.json()["recipient_member_ids"]),
                         {current["member_id"], replacement["member_id"]})
        owner_notices = self.client.get("/api/bootstrap", headers=headers(owner)).json()["notifications"]
        replacement_notices = self.client.get("/api/bootstrap", headers=headers(replacement)).json()["notifications"]
        self.assertFalse(any(n["title"] == "긴급 돌봄 도움 요청" for n in owner_notices))
        self.assertTrue(any(n["title"] == "긴급 돌봄 도움 요청" for n in replacement_notices))
        self.assertEqual(self.client.post(f"{path}/{request_id}/claim", headers=headers(current)).status_code, 403)
        claimed = self.client.post(f"{path}/{request_id}/claim", headers=headers(replacement))
        self.assertEqual(claimed.status_code, 200)
        self.assertEqual(claimed.json()["request"]["status"], "CLAIMED")
        self.assertEqual(claimed.json()["assignment"]["assignee_id"], replacement["member_id"])
        self.assertEqual(claimed.json()["assignment"]["status"], "ACCEPTED")
        self.assertEqual(claimed.json()["handoff"]["to_member_id"], replacement["member_id"])
        self.assertEqual(self.client.post(f"{path}/{request_id}/claim", headers=headers(owner)).status_code, 409)
        snapshot = self.client.get("/api/bootstrap", headers=headers(owner)).json()
        old = next(a for a in snapshot["assignments"] if a["id"] == assignment["id"])
        self.assertEqual(old["status"], "CANCELED")
        self.assertTrue(any(n["title"] == "긴급 요청 마감" for n in snapshot["notifications"]))

    def test_chat_thread_is_private_to_each_caregiver_while_usage_is_family_wide(self):
        owner = self.client.post("/api/families", json={"name": "우리 방", "owner_name": "엄마"}).json()
        caregiver = self.client.post("/api/families/join", json={
            "invite_code": owner["invite_code"], "name": "할머니", "role": "GRANDPARENT"}).json()
        owner_headers = {"Authorization": "Bearer " + owner["access_token"]}
        caregiver_headers = {"Authorization": "Bearer " + caregiver["access_token"]}
        with patch("app.extended.ai.answer", return_value=("확인해볼게요.", 23)) as answer:
            self.assertEqual(self.client.post("/api/assistant/chat", headers=owner_headers,
                                              json={"message": "내 일정 알려줘"}).status_code, 200)
            self.assertEqual(self.client.get("/api/assistant/history", headers=caregiver_headers).json()["messages"], [])
            self.assertEqual(self.client.post("/api/assistant/chat", headers=caregiver_headers,
                                              json={"message": "오늘 담당은?"}).status_code, 200)
            self.assertEqual(answer.call_args.args[2], [])
        owner_messages = self.client.get("/api/assistant/history", headers=owner_headers).json()["messages"]
        caregiver_messages = self.client.get("/api/assistant/history", headers=caregiver_headers).json()["messages"]
        self.assertEqual([message["content"] for message in owner_messages], ["내 일정 알려줘", "확인해볼게요."])
        self.assertEqual([message["content"] for message in caregiver_messages], ["오늘 담당은?", "확인해볼게요."])
        self.assertEqual(self.client.get("/api/features", headers=owner_headers).json()["usage"]["chat_tokens_today"], 46)


if __name__ == "__main__":
    unittest.main()
