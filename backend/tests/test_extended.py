"""Contract checks for family isolation, usage limits, and media/assistant handoff."""

from __future__ import annotations

import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import ai
from app.db import database
from app.main import app, recurring_occurrences
from app.payment import process_due_renewals


class ExtendedFlowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        os.environ["LGDX_DB_PATH"] = str(Path(self.temp.name) / "test.db")
        os.environ["LGDX_SEED_DEMO"] = "1"
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        for key in (
            "LGDX_DB_PATH", "LGDX_SEED_DEMO", "LGDX_DEV_MODE", "LGDX_DEV_TOKEN", "LGDX_REQUIRE_AUTH", "SUBSIDY24_SERVICE_KEY",
            "IDOL_CARE_INSTITUTION_SERVICE_KEY", "IDOL_CARE_HOUSEHOLD_INCOME_SERVICE_KEY",
            "IDOL_CARE_HEALTH_INSURANCE_SERVICE_KEY", "TOSS_BILLING_CLIENT_KEY",
            "TOSS_BILLING_SECRET_KEY", "TOSS_BILLING_AMOUNT",
        ):
            os.environ.pop(key, None)
        self.temp.cleanup()

    def test_subsidy24_benefits_are_normalized_for_pro_family(self):
        os.environ["LGDX_DEV_MODE"] = "1"
        os.environ["LGDX_DEV_TOKEN"] = "local-test-token"
        os.environ["SUBSIDY24_SERVICE_KEY"] = "test-service-key"
        self.client.post("/api/dev/preview-plan", json={"plan": "PRO"}, headers={"X-Developer-Token": "local-test-token"})
        saved = self.client.patch("/api/benefits/location", json={"city": "서울특별시", "district": "은평구"})
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(self.client.get("/api/benefits/location").json()["district"], "은평구")
        request = httpx.Request("GET", "https://api.odcloud.kr/api/gov24/v3/serviceList")
        district = httpx.Response(200, request=request, json={
            "page": 1, "perPage": 20, "matchCount": 2,
            "data": [{
                "서비스ID": "care-district", "서비스명": "은평형 아이돌봄", "서비스목적요약": "가정 돌봄 지원",
                "서비스분야": "보육·교육", "소관기관명": "서울특별시 은평구", "소관기관유형": "시군구", "지원대상": "양육 가정",
                "지원내용": "돌봄 비용 지원", "신청방법": "온라인 신청", "상세조회URL": "https://www.gov.kr/care-1",
            }, {
                "서비스ID": "adult-disabled-care", "서비스명": "장애인 돌봄 지원", "서비스목적요약": "성인 활동 지원",
                "서비스분야": "보호·돌봄", "소관기관명": "서울특별시 은평구", "소관기관유형": "시군구", "지원대상": "성인 장애인",
            }],
        })
        city = httpx.Response(200, request=request, json={"data": [{
            "서비스ID": "care-city", "서비스명": "서울 아동 돌봄 이동 지원", "소관기관명": "서울특별시",
            "소관기관유형": "광역시도", "서비스분야": "보육·교육",
        }]})
        national = httpx.Response(200, request=request, json={"data": [{
            "서비스ID": "care-national", "서비스명": "아이돌봄 지원", "소관기관명": "여성가족부",
            "소관기관유형": "중앙행정기관", "서비스분야": "보육·교육",
        }, {
            "서비스ID": "adult-national", "서비스명": "노인맞춤돌봄서비스", "소관기관명": "보건복지부",
            "소관기관유형": "중앙행정기관", "서비스분야": "보호·돌봄", "지원대상": "65세 이상 노인",
        }]})
        with patch("app.benefits.httpx.get", side_effect=[district, city, national]) as get:
            response = self.client.get("/api/benefits", params={"keyword": "돌봄"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["location"]["label"], "서울특별시 은평구")
        self.assertEqual([program["scope"] for program in response.json()["programs"]], ["DISTRICT", "CITY", "NATIONAL"])
        self.assertNotIn("adult-disabled-care", [program["id"] for program in response.json()["programs"]])
        self.assertNotIn("adult-national", [program["id"] for program in response.json()["programs"]])
        self.assertEqual(response.json()["audience"], "CHILD_CARE_ONLY")
        self.assertEqual(get.call_args_list[0].kwargs["params"]["cond[소관기관명::EQ]"], "서울특별시 은평구")
        self.assertEqual(get.call_args_list[1].kwargs["params"]["cond[소관기관명::EQ]"], "서울특별시")
        self.assertEqual(get.call_args_list[2].kwargs["params"]["cond[서비스명::LIKE]"], "돌봄")

    def test_idol_care_public_data_is_called_and_normalized(self):
        os.environ["LGDX_DEV_MODE"] = "1"
        os.environ["LGDX_DEV_TOKEN"] = "local-test-token"
        os.environ["IDOL_CARE_INSTITUTION_SERVICE_KEY"] = "encoded%2Fkey%3D"
        os.environ["IDOL_CARE_HOUSEHOLD_INCOME_SERVICE_KEY"] = "income-key"
        os.environ["IDOL_CARE_HEALTH_INSURANCE_SERVICE_KEY"] = "insurance-key"
        self.client.post("/api/dev/preview-plan", json={"plan": "PRO"}, headers={"X-Developer-Token": "local-test-token"})

        institution_request = httpx.Request("GET", "https://apis.data.go.kr/institutions")
        institution_response = httpx.Response(200, request=institution_request, json={"response": {
            "header": {"resultCode": "0", "resultMsg": "NORMAL SERVICE"},
            "body": {"items": {"item": [{
                "ctpvNm": "서울", "sggNm": "은평구", "childCareInstNo": "C0308",
                "childCareInstNm": "서울 은평구 가족센터", "rprsTelno": "02-376-3752",
                "addr": "서울 은평구 은평로21가길 15-17", "lot": 126.9, "lat": 37.6,
                "dataCrtrYmd": "20260413",
            }]}}
        }})
        with patch("app.benefits.httpx.get", return_value=institution_response) as get:
            response = self.client.get("/api/benefits/institutions", params={"city": "서울특별시", "district": "은평구"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["institutions"][0]["name"], "서울 은평구 가족센터")
        self.assertEqual(get.call_args.kwargs["params"]["ctpvNm"], "서울")
        self.assertEqual(get.call_args.kwargs["params"]["sggNm"], "은평구")
        self.assertEqual(get.call_args.kwargs["params"]["ServiceKey"], "encoded/key=")

        criteria_request = httpx.Request("GET", "https://apis.data.go.kr/criteria")
        income_response = httpx.Response(200, request=criteria_request, json={"response": {
            "header": {"resultCode": "0", "resultMsg": "NORMAL SERVICE"},
            "body": {"items": {"item": [{
                "crtrYr": "2020", "jgmtGrdeNm": "0001", "mdincmCrtrAmt": 75,
                "mohshdCnt": 3, "mmAvgErngCrtrAmt": 2902933, "dataCrtrYmd": "20260413",
            }]}}
        }})
        insurance_response = httpx.Response(200, request=criteria_request, json={"response": {
            "header": {"resultCode": "0", "resultMsg": "NORMAL SERVICE"},
            "body": {"items": {"item": [{
                "crtrYr": "2020", "erngAmt": 1837681, "wrcHlthIsrprmOselfBrdnAmt": 61287,
                "areaHlthIsrprmOselfBrdnAmt": 14007, "mixHlthIsrprmAmt": 61683,
                "dataCrtrYmd": "20260413",
            }]}}
        }})
        with patch("app.benefits.httpx.get", side_effect=[income_response, insurance_response]):
            response = self.client.get("/api/benefits/eligibility-criteria")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["year"], "2020")
        self.assertEqual(response.json()["household_income"][0]["monthly_income"], 2902933)
        self.assertEqual(response.json()["health_insurance"][0]["employee_premium"], 61287)

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
        self.assertEqual(self.client.patch(
            f"/api/members/{a['member_id']}/permissions", headers=member_headers,
            json={"scope": "SCHEDULE_DETAIL", "is_allowed": True},
        ).status_code, 403)
        shared = self.client.patch(
            f"/api/members/{a['member_id']}/permissions", headers=a_headers,
            json={"scope": "SCHEDULE_DETAIL", "is_allowed": True},
        )
        self.assertEqual(shared.status_code, 200)
        self.assertEqual(self.client.get("/api/bootstrap", headers=member_headers).json()["schedules"][0]["title"], "개인 병원 일정")
        rotated = self.client.post("/api/families/invite-code/rotate", headers=member_headers)
        self.assertEqual(rotated.status_code, 200)
        shared_code = rotated.json()["invite_code"]
        self.assertEqual(self.client.post("/api/families/join", json={"invite_code": shared_code, "name": "이모", "role": "CAREGIVER"}).status_code, 201)
        fourth = self.client.post("/api/families/join", json={"invite_code": shared_code, "name": "삼촌", "role": "CAREGIVER"})
        self.assertEqual(fourth.status_code, 403)
        self.assertEqual(fourth.json()["detail"]["code"], "PLAN_LIMIT")
        self.assertEqual(self.client.get("/api/bootstrap", headers={"Authorization": "Bearer bad"}).status_code, 401)
        os.environ["LGDX_REQUIRE_AUTH"] = "1"
        self.assertEqual(self.client.get("/api/bootstrap").status_code, 401)
        self.assertEqual(self.client.get("/api/bootstrap", headers=member_headers).status_code, 200)

    def test_invite_links_remain_reusable_after_new_links_are_created(self):
        os.environ["LGDX_DEV_MODE"] = "1"
        os.environ["LGDX_DEV_TOKEN"] = "local-test-token"
        room = self.client.post("/api/families", json={"name": "재사용 가족", "owner_name": "엄마"}).json()
        owner_headers = {"Authorization": "Bearer " + room["access_token"], "X-Developer-Token": "local-test-token"}
        self.client.post("/api/dev/preview-plan", headers=owner_headers, json={"plan": "PRO"})
        second_link = self.client.post("/api/families/invite-code/rotate", headers=owner_headers).json()["invite_code"]
        third_link = self.client.post("/api/families/invite-code/rotate", headers=owner_headers).json()["invite_code"]

        for index, code in enumerate((room["invite_code"], room["invite_code"], second_link, third_link), start=1):
            joined = self.client.post("/api/families/join", json={
                "invite_code": code, "name": f"가족 {index}", "role": "CAREGIVER",
            })
            self.assertEqual(joined.status_code, 201)
        self.assertEqual(self.client.get(f"/api/families/invitations/{room['invite_code']}").status_code, 200)

    def test_each_member_keeps_a_separate_benefit_search_location(self):
        os.environ["LGDX_DEV_MODE"] = "1"
        os.environ["LGDX_DEV_TOKEN"] = "local-test-token"
        room = self.client.post("/api/families", json={"name": "지역 가족", "owner_name": "엄마"}).json()
        owner_headers = {"Authorization": "Bearer " + room["access_token"], "X-Developer-Token": "local-test-token"}
        self.client.post("/api/dev/preview-plan", headers=owner_headers, json={"plan": "PRO"})
        joined = self.client.post("/api/families/join", json={
            "invite_code": room["invite_code"], "name": "할머니", "role": "GRANDPARENT",
        }).json()
        member_headers = {"Authorization": "Bearer " + joined["access_token"]}

        self.assertEqual(self.client.patch("/api/benefits/location", headers=owner_headers,
                                          json={"city": "서울특별시", "district": "은평구"}).status_code, 200)
        self.assertEqual(self.client.patch("/api/benefits/location", headers=member_headers,
                                          json={"city": "경기도", "district": "고양시"}).status_code, 200)
        self.assertEqual(self.client.get("/api/benefits/location", headers=owner_headers).json()["district"], "은평구")
        self.assertEqual(self.client.get("/api/benefits/location", headers=member_headers).json()["district"], "고양시")

    def test_photo_ocr_limit_and_developer_pro_preview(self):
        image = b"\x89PNG\r\n\x1a\n" + b"demo-image"
        os.environ["LGDX_DEV_MODE"] = "1"
        os.environ["LGDX_DEV_TOKEN"] = "local-test-token"
        text = "9월 20일 현장학습, 모자를 챙겨주세요"
        parsed = [{"item_type": "SCHEDULE", "title": "9월 20일 현장학습", "detail": text, "confidence": "LOW"}]
        with patch("app.extended.ai.extract_image_text", return_value=text) as extract, patch("app.extended.ai.extract_schedule_items", return_value=parsed) as select:
            for _ in range(2):
                response = self.client.post("/api/intakes/photo", files={"file": ("notice.png", image, "image/png")}, data={"child_id": "jiu", "source": "CAMERA"})
                self.assertEqual(response.status_code, 201)
                self.assertEqual(response.json()["transcript"], text)
                self.assertEqual([item["title"] for item in response.json()["items"]], ["9월 20일 현장학습"])
                self.assertEqual(response.json()["items"][0]["detail"], text)
            blocked = self.client.post("/api/intakes/photo", files={"file": ("notice.png", image, "image/png")}, data={"child_id": "jiu"})
            self.assertEqual(blocked.status_code, 403)
            self.assertEqual(blocked.json()["detail"]["code"], "OCR_DAILY_LIMIT")
            self.assertEqual(extract.call_count, 2)
            self.assertEqual(select.call_count, 2)
            self.assertEqual(self.client.post("/api/dev/preview-plan", json={"plan": "PRO"}).status_code, 404)
            changed = self.client.post("/api/dev/preview-plan", json={"plan": "PRO"}, headers={"X-Developer-Token": "local-test-token"})
            self.assertEqual(changed.json()["status"], "DEV_PREVIEW")
            feature_data = self.client.get("/api/features").json()
            self.assertEqual(feature_data["plan"], "PRO")
            states = {feature["id"]: feature["backend_state"] for feature in feature_data["features"]}
            self.assertEqual(states["emergency_request"], "READY")
            self.assertEqual(states["voice_schedule"], "PARTIAL")
            self.assertEqual(states["family_album"], "READY")
            self.assertEqual(self.client.post("/api/intakes/photo", files={"file": ("notice.png", image, "image/png")}, data={"child_id": "jiu"}).status_code, 201)

    def test_owner_can_toggle_dev_plan_without_browser_secret(self):
        os.environ["LGDX_DEV_MODE"] = "1"
        room = self.client.post("/api/families", json={"name": "테스트 가족", "owner_name": "엄마"}).json()
        owner = {"Authorization": "Bearer " + room["access_token"]}
        joined = self.client.post("/api/families/join", json={"invite_code": room["invite_code"], "name": "할머니", "role": "GRANDPARENT"}).json()
        guest = {"Authorization": "Bearer " + joined["access_token"]}
        self.assertTrue(self.client.get("/api/subscription", headers=owner).json()["dev_switch_available"])
        self.assertFalse(self.client.get("/api/subscription", headers=guest).json()["dev_switch_available"])
        self.assertEqual(self.client.post("/api/dev/preview-plan", headers=guest, json={"plan": "PRO"}).status_code, 403)
        self.assertEqual(self.client.post("/api/dev/preview-plan", json={"plan": "PRO"}).status_code, 404)
        pro = self.client.post("/api/dev/preview-plan", headers=owner, json={"plan": "PRO"})
        self.assertEqual(pro.json()["plan"], "PRO")
        pro_features = self.client.get("/api/features", headers=owner).json()
        self.assertEqual(pro_features["plan"], "PRO")
        self.assertEqual(pro_features["usage"]["chat_tokens_limit"], 200_000)
        free = self.client.post("/api/dev/preview-plan", headers=owner, json={"plan": "FREE"})
        self.assertEqual(free.json()["plan"], "FREE")
        self.assertEqual(self.client.get("/api/bootstrap", headers=owner).json()["family"]["plan"], "FREE")

    def test_temporary_dev_login_can_select_an_active_member(self):
        self.assertEqual(self.client.get("/api/families/dev-login-options").status_code, 404)
        with patch.dict(os.environ, {"LGDX_DEV_MODE": "1"}):
            room = self.client.post("/api/families", json={"name": "테스트 가족", "owner_name": "엄마"}).json()
            joined = self.client.post("/api/families/join", json={
                "invite_code": room["invite_code"], "name": "아빠", "role": "PARENT",
            }).json()
            options = self.client.get("/api/families/dev-login-options")
            self.assertEqual(options.status_code, 200)
            self.assertTrue(any(member["member_id"] == room["member_id"] and member["is_owner"]
                                for member in options.json()["members"]))
            login = self.client.post("/api/families/dev-login", json={"member_id": joined["member_id"]})
            self.assertEqual(login.status_code, 200)
            me = self.client.get("/api/families/me", headers={
                "Authorization": "Bearer " + login.json()["access_token"],
            }).json()
            self.assertEqual(me["member"]["id"], joined["member_id"])
            self.assertTrue(me["authenticated"])

    def test_photo_without_schedule_items_keeps_text_without_review_card(self):
        image = b"\x89PNG\r\n\x1a\n" + b"demo-image"
        with patch("app.extended.ai.extract_image_text", return_value="안녕하세요. 좋은 하루 되세요."), patch("app.extended.ai.extract_schedule_items", return_value=[]):
            response = self.client.post("/api/intakes/photo", files={"file": ("notice.png", image, "image/png")}, data={"child_id": "jiu"})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["items"], [])
        self.assertFalse(response.json()["requires_review"])
        self.assertEqual(response.json()["transcript"], "안녕하세요. 좋은 하루 되세요.")

    def test_schedule_extraction_requires_quote_from_ocr_text(self):
        payload = {"output": [{"content": [{"type": "output_text", "text": '{"items":[{"item_type":"SCHEDULE","title":"9월 20일 오전 9시 현장학습","source_quote":"9월 20일 오전 9시 현장학습"},{"item_type":"TODO","title":"허구의 과제","source_quote":"원문에 없는 문장"}]}'}]}]}
        with patch("app.ai._post", return_value=payload) as post:
            items = ai.extract_schedule_items("9월 20일 오전 9시 현장학습\n안녕하세요")
        self.assertEqual([item["title"] for item in items], ["현장학습"])
        self.assertTrue(post.call_args.kwargs["json"]["text"]["format"]["strict"])

    def test_weekly_recurrence_uses_korea_weekday_for_utc_input(self):
        occurrences = recurring_occurrences(
            datetime.fromisoformat("2026-09-13T15:00:00+00:00"),
            datetime.fromisoformat("2026-09-13T16:00:00+00:00"),
            [0, 1, 2, 3, 4],
            datetime.fromisoformat("2026-09-18").date(),
        )
        self.assertEqual([start.strftime("%Y-%m-%d") for start, _ in occurrences], [
            "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18",
        ])

    def test_ocr_failure_does_not_consume_daily_allowance(self):
        image = b"\x89PNG\r\n\x1a\n" + b"demo-image"
        from fastapi import HTTPException
        with patch("app.extended.ai.extract_image_text", side_effect=HTTPException(422, "인식 실패")):
            self.assertEqual(self.client.post("/api/intakes/photo", files={"file": ("notice.png", image, "image/png")}, data={"child_id": "jiu"}).status_code, 422)
        with patch("app.extended.ai.extract_image_text", return_value="9월 20일 현장학습"), patch("app.extended.ai.extract_schedule_items", side_effect=HTTPException(502, "일정 분석 실패")):
            self.assertEqual(self.client.post("/api/intakes/photo", files={"file": ("notice.png", image, "image/png")}, data={"child_id": "jiu"}).status_code, 502)
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

    def test_child_schedule_requires_child_and_appears_in_bootstrap(self):
        created = self.client.post("/api/child-schedules", json={
            "child_id": "jiu", "title": "태권도", "category": "ACADEMY",
            "starts_at": "2026-09-16T15:00:00+09:00", "ends_at": "2026-09-16T16:00:00+09:00",
        })
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["child_id"], "jiu")
        self.assertEqual(created.json()["category"], "ACADEMY")
        schedules = self.client.get("/api/bootstrap").json()["child_schedules"]
        self.assertTrue(any(schedule["title"] == "태권도" for schedule in schedules))
        missing = self.client.post("/api/child-schedules", json={
            "child_id": "missing", "title": "미술", "category": "AFTER_SCHOOL",
            "starts_at": "2026-09-16T16:00:00+09:00", "ends_at": "2026-09-16T17:00:00+09:00",
        })
        self.assertEqual(missing.status_code, 404)

    def test_weekly_child_and_personal_routines_expand_into_calendar_entries(self):
        child_routine = self.client.post("/api/child-schedules", json={
            "child_id": "jiu", "title": "태권도", "category": "ACADEMY",
            "starts_at": "2026-09-14T15:00:00+09:00", "ends_at": "2026-09-14T16:00:00+09:00",
            "repeat_days": [0, 2, 4], "repeat_until": "2026-09-20",
        })
        self.assertEqual(child_routine.status_code, 201)
        child_body = child_routine.json()
        self.assertEqual(child_body["scheduled_count"], 3)
        self.assertEqual(
            [schedule["starts_at"][:10] for schedule in child_body["schedules"]],
            ["2026-09-14", "2026-09-16", "2026-09-18"],
        )
        self.assertEqual(len({schedule["recurrence_id"] for schedule in child_body["schedules"]}), 1)
        self.assertEqual(child_body["schedules"][0]["recurrence_rule"], "WEEKLY:0,2,4:UNTIL=2026-09-20")

        personal_routine = self.client.post("/api/schedules", json={
            "member_id": "mom", "title": "저녁 운동", "kind": "ROUTINE",
            "starts_at": "2026-09-14T19:00:00+09:00", "ends_at": "2026-09-14T20:00:00+09:00",
            "repeat_days": [1, 3], "repeat_until": "2026-09-20",
        })
        self.assertEqual(personal_routine.status_code, 201)
        personal_body = personal_routine.json()
        self.assertEqual(personal_body["scheduled_count"], 2)
        self.assertEqual(
            [schedule["starts_at"][:10] for schedule in personal_body["schedules"]],
            ["2026-09-15", "2026-09-17"],
        )
        self.assertEqual(len({schedule["recurrence_id"] for schedule in personal_body["schedules"]}), 1)

        incomplete = self.client.post("/api/schedules", json={
            "member_id": "mom", "title": "잘못된 반복", "kind": "ROUTINE",
            "starts_at": "2026-09-14T19:00:00+09:00", "ends_at": "2026-09-14T20:00:00+09:00",
            "repeat_days": [0],
        })
        self.assertEqual(incomplete.status_code, 422)

    def test_explicit_repeat_dates_expand_for_interval_monthly_and_selected_date_modes(self):
        response = self.client.post("/api/schedules", json={
            "member_id": "mom", "title": "날짜 계산 반복", "kind": "ROUTINE",
            "starts_at": "2026-09-14T19:00:00+09:00", "ends_at": "2026-09-14T20:00:00+09:00",
            "repeat_dates": ["2026-09-14", "2026-09-17", "2026-10-01"],
        })
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["scheduled_count"], 3)
        self.assertEqual([row["starts_at"][:10] for row in body["schedules"]],
                         ["2026-09-14", "2026-09-17", "2026-10-01"])
        self.assertEqual(body["schedules"][0]["recurrence_rule"],
                         "DATES:2026-09-14,2026-09-17,2026-10-01")

    def test_recurring_schedule_update_can_apply_only_to_future_occurrences(self):
        created = self.client.post("/api/schedules", json={
            "member_id": "mom", "title": "저녁 운동", "kind": "ROUTINE",
            "starts_at": "2026-09-14T19:00:00+09:00", "ends_at": "2026-09-14T20:00:00+09:00",
            "repeat_days": [0, 2, 4], "repeat_until": "2026-09-18",
        }).json()["schedules"]
        changed = self.client.patch(f"/api/schedules/{created[1]['id']}", json={
            "title": "저녁 운동", "kind": "ROUTINE",
            "starts_at": "2026-09-16T20:00:00+09:00", "ends_at": "2026-09-16T21:00:00+09:00",
            "update_scope": "FUTURE",
        })
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(changed.json()["updated_count"], 2)
        schedules = [row for row in self.client.get("/api/bootstrap").json()["schedules"]
                     if row.get("recurrence_id") == created[0]["recurrence_id"]]
        self.assertEqual([row["starts_at"][11:16] for row in schedules], ["19:00", "20:00", "20:00"])
        self.assertFalse(changed.json()["recurring_instance_only"])

        child_created = self.client.post("/api/child-schedules", json={
            "child_id": "jiu", "title": "태권도", "category": "ACADEMY",
            "starts_at": "2026-09-14T15:00:00+09:00", "ends_at": "2026-09-14T16:00:00+09:00",
            "repeat_days": [0, 2, 4], "repeat_until": "2026-09-18",
        }).json()["schedules"]
        child_changed = self.client.patch(f"/api/child-schedules/{child_created[1]['id']}", json={
            "child_id": "jiu", "title": "태권도", "category": "ACADEMY",
            "starts_at": "2026-09-16T16:00:00+09:00", "ends_at": "2026-09-16T17:00:00+09:00",
            "update_scope": "FUTURE",
        })
        self.assertEqual(child_changed.status_code, 200)
        self.assertEqual(child_changed.json()["updated_count"], 2)
        snapshot = self.client.get("/api/bootstrap").json()
        child_schedules = [row for row in snapshot["child_schedules"]
                           if row.get("recurrence_id") == child_created[0]["recurrence_id"]]
        self.assertEqual([row["starts_at"][11:16] for row in child_schedules], ["15:00", "16:00", "16:00"])
        changed_ids = {row["id"] for row in child_schedules[1:]}
        changed_items = [row for row in snapshot["items"] if row.get("child_schedule_id") in changed_ids]
        # A schedule with a real end time now splits into a drop-off (등원) and pick-up (하원)
        # item, so each updated occurrence carries both the new start and end time.
        self.assertEqual({row["starts_at"][11:16] for row in changed_items}, {"16:00", "17:00"})

        personal_deleted = self.client.delete(
            f"/api/schedules/{created[1]['id']}", params={"delete_scope": "FUTURE"},
        )
        self.assertEqual(personal_deleted.status_code, 200)
        self.assertEqual(personal_deleted.json()["deleted_count"], 2)
        child_deleted = self.client.delete(
            f"/api/child-schedules/{child_created[1]['id']}", params={"delete_scope": "FUTURE"},
        )
        self.assertEqual(child_deleted.status_code, 200)
        self.assertEqual(child_deleted.json()["deleted_count"], 2)
        after_delete = self.client.get("/api/bootstrap").json()
        self.assertEqual(len([row for row in after_delete["schedules"]
                              if row.get("recurrence_id") == created[0]["recurrence_id"]]), 1)
        self.assertEqual(len([row for row in after_delete["child_schedules"]
                              if row.get("recurrence_id") == child_created[0]["recurrence_id"]]), 1)
        self.assertFalse(any(row.get("child_schedule_id") in {item["id"] for item in child_created[1:]}
                             for row in after_delete["items"]))

    def test_registered_schedules_can_be_updated_and_deleted_with_role_permissions(self):
        room = self.client.post("/api/families", json={"name": "일정 가족", "owner_name": "엄마"}).json()
        caregiver = self.client.post("/api/families/join", json={
            "invite_code": room["invite_code"], "name": "할머니", "role": "GRANDPARENT",
        }).json()
        owner_headers = {"Authorization": "Bearer " + room["access_token"]}
        caregiver_headers = {"Authorization": "Bearer " + caregiver["access_token"]}

        personal = self.client.post("/api/schedules", headers=caregiver_headers, json={
            "member_id": caregiver["member_id"], "title": "산책", "kind": "ROUTINE",
            "starts_at": "2026-09-21T09:00:00+09:00", "ends_at": "2026-09-21T10:00:00+09:00",
        }).json()["schedule"]
        personal_path = f"/api/schedules/{personal['id']}"
        personal_update = {
            "title": "아침 운동", "kind": "ROUTINE",
            "starts_at": "2026-09-21T10:00:00+09:00", "ends_at": "2026-09-21T11:00:00+09:00",
        }
        self.assertEqual(self.client.patch(personal_path, headers=owner_headers, json=personal_update).status_code, 403)
        updated_personal = self.client.patch(personal_path, headers=caregiver_headers, json=personal_update)
        self.assertEqual(updated_personal.status_code, 200)
        self.assertEqual(updated_personal.json()["schedule"]["title"], "아침 운동")
        self.assertEqual(self.client.delete(personal_path, headers=caregiver_headers).status_code, 200)

        child = self.client.post("/api/children", headers=owner_headers, json={"name": "지우", "age_label": "7세"}).json()
        child_schedule = self.client.post("/api/child-schedules", headers=owner_headers, json={
            "child_id": child["id"], "title": "태권도", "category": "ACADEMY",
            "starts_at": "2026-09-21T15:00:00+09:00", "ends_at": "2026-09-21T16:00:00+09:00",
        }).json()
        child_path = f"/api/child-schedules/{child_schedule['id']}"
        child_update = {
            "child_id": child["id"], "title": "미술 학원", "category": "AFTER_SCHOOL",
            "starts_at": "2026-09-21T16:00:00+09:00", "ends_at": "2026-09-21T17:00:00+09:00",
        }
        caregiver_update = self.client.patch(child_path, headers=caregiver_headers, json=child_update)
        self.assertEqual(caregiver_update.status_code, 200)
        owner_notices = self.client.get("/api/bootstrap", headers=owner_headers).json()["notifications"]
        self.assertTrue(any(notice["title"] == "아이 일정이 변경됐어요" for notice in owner_notices))
        updated_child = self.client.patch(child_path, headers=owner_headers, json=child_update)
        self.assertEqual(updated_child.status_code, 200)
        self.assertEqual(updated_child.json()["schedule"]["title"], "미술 학원")
        # A caregiver assignment already exists on this item, and the deleter isn't the
        # assignee — deletion must still be allowed for any active family member.
        self.client.post("/api/assignments", headers=owner_headers, json={
            "item_id": updated_child.json()["care_item_id"], "assignee_id": caregiver["member_id"], "source": "MANUAL",
        })
        self.assertEqual(self.client.delete(child_path, headers=caregiver_headers).status_code, 200)
        snapshot = self.client.get("/api/bootstrap", headers=owner_headers).json()
        self.assertFalse(any(item["id"] == child_schedule["id"] for item in snapshot["child_schedules"]))
        self.assertFalse(any(item.get("child_schedule_id") == child_schedule["id"] for item in snapshot["items"]))

    def test_a_single_moment_of_a_schedule_can_be_deleted_without_touching_its_sibling(self):
        # e.g. 학교 and 방과후 are both registered normally, but on a day the child goes
        # straight from one to the other, the 학교 하원 / 방과후 등원 moment isn't needed —
        # deleting just that care_item should leave the sibling moment and the schedule intact.
        room = self.client.post("/api/families", json={"name": "단일삭제 가족", "owner_name": "엄마"}).json()
        headers = {"Authorization": "Bearer " + room["access_token"]}
        child = self.client.post("/api/children", headers=headers, json={"name": "지우", "age_label": "7세"}).json()
        child_schedule = self.client.post("/api/child-schedules", headers=headers, json={
            "child_id": child["id"], "title": "학교", "category": "SCHOOL",
            "starts_at": "2026-09-22T09:00:00+09:00", "ends_at": "2026-09-22T13:00:00+09:00",
        }).json()
        item_ids = child_schedule["care_item_ids"]
        self.assertEqual(len(item_ids), 2)
        dropoff_id, pickup_id = item_ids
        self.assertEqual(self.client.delete(f"/api/care-items/{pickup_id}", headers=headers).status_code, 200)
        snapshot = self.client.get("/api/bootstrap", headers=headers).json()
        self.assertTrue(any(item["id"] == dropoff_id for item in snapshot["items"]))
        self.assertFalse(any(item["id"] == pickup_id for item in snapshot["items"]))
        self.assertTrue(any(schedule["id"] == child_schedule["id"] for schedule in snapshot["child_schedules"]))

    def test_child_schedule_recommends_available_requester_and_self_assignment_is_immediate(self):
        room = self.client.post("/api/families", json={"name": "지우네", "owner_name": "엄마"}).json()
        owner_headers = {"Authorization": "Bearer " + room["access_token"]}
        caregiver = self.client.post("/api/families/join", json={
            "invite_code": room["invite_code"], "name": "할머니", "role": "GRANDPARENT",
        }).json()
        caregiver_headers = {"Authorization": "Bearer " + caregiver["access_token"]}
        child = self.client.post("/api/children", headers=owner_headers, json={"name": "지우", "age_label": "7세"}).json()
        created = self.client.post("/api/child-schedules", headers=owner_headers, json={
            "child_id": child["id"], "title": "태권도", "category": "ACADEMY",
            "starts_at": "2026-09-21T15:00:00+09:00", "ends_at": "2026-09-21T16:00:00+09:00",
        })
        self.assertEqual(created.status_code, 201)
        care_item_id = created.json()["care_item_id"]
        suggestions = self.client.get(f"/api/items/{care_item_id}/suggestions", headers=owner_headers).json()
        self.assertEqual(suggestions["engine"], "CARE_SCHEDULE_AGENT")
        self.assertIn(room["member_id"], [item["member_id"] for item in suggestions["suggestions"]])
        self.assertIn(caregiver["member_id"], [item["member_id"] for item in suggestions["suggestions"]])
        self_assignment = self.client.post("/api/assignments", headers=owner_headers, json={
            "item_id": care_item_id, "assignee_id": room["member_id"],
        })
        self.assertEqual(self_assignment.status_code, 201)
        self.assertEqual(self_assignment.json()["status"], "ACCEPTED")
        owner_notices = self.client.get("/api/bootstrap", headers=owner_headers).json()["notifications"]
        self.assertFalse(any(notice.get("action_id") == self_assignment.json()["id"] for notice in owner_notices))

        created_for_caregiver = self.client.post("/api/child-schedules", headers=owner_headers, json={
            "child_id": child["id"], "title": "방과후 미술", "category": "AFTER_SCHOOL",
            "starts_at": "2026-09-22T15:00:00+09:00", "ends_at": "2026-09-22T16:00:00+09:00",
        }).json()
        assignment = self.client.post("/api/assignments", headers=owner_headers, json={
            "item_id": created_for_caregiver["care_item_id"], "assignee_id": caregiver["member_id"],
        })
        self.assertEqual(assignment.status_code, 201)
        assignment_id = assignment.json()["id"]
        guest_notices = self.client.get("/api/bootstrap", headers=caregiver_headers).json()["notifications"]
        request_notice = next(notice for notice in guest_notices if notice["action_type"] == "ASSIGNMENT_REQUEST")
        self.assertEqual(request_notice["action_id"], assignment_id)
        self.assertIn("엄마", request_notice["body"])
        owner_notices = self.client.get("/api/bootstrap", headers=owner_headers).json()["notifications"]
        self.assertFalse(any(notice.get("action_id") == assignment_id for notice in owner_notices))

    def test_owner_can_remove_member_and_member_can_leave(self):
        room = self.client.post("/api/families", json={"name": "우리 가족", "owner_name": "엄마"}).json()
        owner_headers = {"Authorization": "Bearer " + room["access_token"]}
        first = self.client.post("/api/families/join", json={
            "invite_code": room["invite_code"], "name": "할머니", "role": "GRANDPARENT",
        }).json()
        second = self.client.post("/api/families/join", json={
            "invite_code": room["invite_code"], "name": "아빠", "role": "PARENT",
        }).json()
        first_headers = {"Authorization": "Bearer " + first["access_token"]}
        second_headers = {"Authorization": "Bearer " + second["access_token"]}

        self.assertEqual(self.client.post("/api/schedules", headers=first_headers, json={
            "member_id": first["member_id"], "title": "개인 약속",
            "starts_at": "2026-09-20T10:00:00+09:00", "ends_at": "2026-09-20T11:00:00+09:00",
            "kind": "ROUTINE",
        }).status_code, 201)

        removed = self.client.post(f"/api/members/{first['member_id']}/remove", headers=owner_headers)
        self.assertEqual(removed.status_code, 200)
        self.assertEqual(removed.json()["status"], "REMOVED")
        self.assertFalse(any(item["member_id"] == first["member_id"] for item in
                             self.client.get("/api/bootstrap", headers=owner_headers).json()["schedules"]))
        self.assertEqual(self.client.get("/api/bootstrap", headers=first_headers).status_code, 401)
        self.assertEqual(self.client.post("/api/families/leave", headers=second_headers).status_code, 200)
        self.assertEqual(self.client.get("/api/bootstrap", headers=second_headers).status_code, 401)
        self.assertEqual(self.client.post("/api/families/leave", headers=owner_headers).status_code, 422)

    def test_owner_can_rename_and_delete_the_whole_family_room(self):
        room = self.client.post("/api/families", json={"name": "우리 가족", "owner_name": "엄마"}).json()
        owner_headers = {"Authorization": "Bearer " + room["access_token"]}
        joined = self.client.post("/api/families/join", json={
            "invite_code": room["invite_code"], "name": "아빠", "role": "PARENT",
        }).json()
        member_headers = {"Authorization": "Bearer " + joined["access_token"]}

        self.assertEqual(self.client.patch("/api/families", headers=member_headers, json={"name": "변경 실패"}).status_code, 403)
        renamed = self.client.patch("/api/families", headers=owner_headers, json={"name": "민솔이네"})
        self.assertEqual(renamed.status_code, 200)
        self.assertEqual(renamed.json()["name"], "민솔이네")
        self.assertEqual(self.client.delete("/api/families", headers=member_headers).status_code, 403)

        deleted = self.client.delete("/api/families", headers=owner_headers)
        self.assertEqual(deleted.status_code, 200)
        self.assertTrue(deleted.json()["deleted"])
        self.assertEqual(self.client.get("/api/bootstrap", headers=owner_headers).status_code, 401)
        self.assertEqual(self.client.get("/api/bootstrap", headers=member_headers).status_code, 401)
        with database() as db:
            self.assertIsNone(db.execute("SELECT id FROM family_group WHERE id = ?", (room["family_id"],)).fetchone())
            self.assertEqual(db.execute("SELECT COUNT(*) FROM family_member WHERE family_id = ?",
                                        (room["family_id"],)).fetchone()[0], 0)

    def test_owner_can_transfer_ownership_to_an_active_member(self):
        room = self.client.post("/api/families", json={"name": "우리 가족", "owner_name": "엄마"}).json()
        owner_headers = {"Authorization": "Bearer " + room["access_token"]}
        next_owner = self.client.post("/api/families/join", json={
            "invite_code": room["invite_code"], "name": "아빠", "role": "PARENT",
        }).json()
        next_owner_headers = {"Authorization": "Bearer " + next_owner["access_token"]}

        transferred = self.client.post(
            f"/api/members/{next_owner['member_id']}/transfer-ownership", headers=owner_headers,
        )
        self.assertEqual(transferred.status_code, 200)
        self.assertEqual(transferred.json()["owner"]["id"], next_owner["member_id"])
        self.assertEqual(self.client.get("/api/families/me", headers=owner_headers).json()["member"]["is_owner"], 0)
        self.assertEqual(self.client.get("/api/families/me", headers=next_owner_headers).json()["member"]["is_owner"], 1)
        self.assertEqual(self.client.post(
            f"/api/members/{room['member_id']}/transfer-ownership", headers=owner_headers,
        ).status_code, 403)
        self.assertEqual(self.client.post("/api/families/leave", headers=owner_headers).status_code, 200)

    def test_invitation_link_preview_is_public_and_exposes_only_summary(self):
        room = self.client.post("/api/families", json={"name": "지우네 가족", "owner_name": "지연"}).json()
        os.environ["LGDX_REQUIRE_AUTH"] = "1"
        preview = self.client.get(f"/api/families/invitations/{room['invite_code']}")
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.json()["family_name"], "지우네 가족")
        self.assertEqual(preview.json()["owner_name"], "지연")
        self.assertEqual(set(preview.json()), {"family_name", "owner_name", "expires_at"})
        self.assertEqual(self.client.get("/api/families/invitations/NOT-A-REAL-CODE").status_code, 404)

    def test_calendar_connection_reports_missing_oauth_configuration(self):
        with patch.dict(os.environ, {
            "GOOGLE_CLIENT_ID": "", "GOOGLE_CLIENT_SECRET": "",
            "MICROSOFT_CLIENT_ID": "", "MICROSOFT_CLIENT_SECRET": "",
        }):
            status = self.client.get("/api/calendar-connections")
            self.assertEqual(status.status_code, 200)
            self.assertTrue(all(not item["configured"] for item in status.json()["connections"]))
            authorize = self.client.post("/api/calendar-connections/google/authorize")
            self.assertEqual(authorize.status_code, 503)
            self.assertEqual(authorize.json()["detail"]["code"], "CALENDAR_NOT_CONFIGURED")

    def test_google_and_outlook_oauth_are_both_available_when_configured(self):
        with patch.dict(os.environ, {
            "GOOGLE_CLIENT_ID": "google-client", "GOOGLE_CLIENT_SECRET": "google-secret",
            "MICROSOFT_CLIENT_ID": "microsoft-client", "MICROSOFT_CLIENT_SECRET": "microsoft-secret",
            "CALENDAR_REDIRECT_BASE": "http://127.0.0.1:8000",
        }):
            connections = self.client.get("/api/calendar-connections").json()["connections"]
            self.assertTrue(all(connection["configured"] for connection in connections))
            google = self.client.post("/api/calendar-connections/google/authorize").json()["authorization_url"]
            microsoft = self.client.post("/api/calendar-connections/microsoft/authorize").json()["authorization_url"]
            self.assertIn("accounts.google.com", google)
            self.assertIn("calendar.events.readonly", google)
            self.assertIn("google%2Fcallback", google)
            self.assertIn("login.microsoftonline.com/common", microsoft)
            self.assertIn("Calendars.Read", microsoft)
            self.assertIn("microsoft%2Fcallback", microsoft)

    def test_calendar_oauth_returns_to_the_frontend_that_started_it(self):
        with patch.dict(os.environ, {
            "GOOGLE_CLIENT_ID": "google-client", "GOOGLE_CLIENT_SECRET": "google-secret",
            "CALENDAR_REDIRECT_BASE": "http://127.0.0.1:8000",
            "FRONTEND_URL": "http://localhost:5173",
        }):
            authorization_url = self.client.post(
                "/api/calendar-connections/google/authorize",
                headers={"Origin": "http://192.168.0.20:5173"},
            ).json()["authorization_url"]
            state = parse_qs(urlparse(authorization_url).query)["state"][0]
            token_response = httpx.Response(200, request=httpx.Request("POST", "https://oauth2.googleapis.com/token"), json={
                "access_token": "access", "refresh_token": "refresh", "expires_in": 3600,
            })
            with patch("app.calendar.httpx.post", return_value=token_response):
                callback = self.client.get(
                    f"/api/calendar-connections/google/callback?code=demo-code&state={state}",
                    follow_redirects=False,
                )
            self.assertEqual(callback.status_code, 307)
            self.assertEqual(callback.headers["location"], "http://192.168.0.20:5173/?calendar=google-connected")

    def test_calendar_oauth_accepts_legacy_registered_callback_path(self):
        with patch.dict(os.environ, {
            "GOOGLE_CLIENT_ID": "google-client", "GOOGLE_CLIENT_SECRET": "google-secret",
            "GOOGLE_REDIRECT_URI": "http://localhost:8000/auth/google/callback",
            "FRONTEND_URL": "http://localhost:5173",
        }):
            authorization_url = self.client.post(
                "/api/calendar-connections/google/authorize",
                headers={"Origin": "http://127.0.0.1:5173"},
            ).json()["authorization_url"]
            state = parse_qs(urlparse(authorization_url).query)["state"][0]
            token_response = httpx.Response(200, request=httpx.Request("POST", "https://oauth2.googleapis.com/token"), json={
                "access_token": "access", "refresh_token": "refresh", "expires_in": 3600,
            })
            with patch("app.calendar.httpx.post", return_value=token_response):
                callback = self.client.get(
                    f"/auth/google/callback?code=demo-code&state={state}",
                    follow_redirects=False,
                )
            self.assertEqual(callback.status_code, 307)
            self.assertEqual(callback.headers["location"], "http://127.0.0.1:5173/?calendar=google-connected")

    def test_free_voice_chat_and_handoff_note(self):
        with patch("app.extended.ai.transcribe_audio", return_value="오늘 하원 누가 맡아?"), patch("app.extended.ai.answer", return_value=("할머니가 담당입니다.", 23)) as answer:
            voice = self.client.post("/api/assistant/voice", files={"file": ("voice.webm", b"demo-voice", "audio/webm")})
            self.assertEqual(voice.status_code, 200)
            self.assertEqual(voice.json()["transcript"], "오늘 하원 누가 맡아?")
            self.assertEqual(voice.json()["answer"], "할머니가 담당입니다.")
            self.assertEqual(voice.json()["usage"]["remaining"], 49_977)
            self.assertIn("하원", answer.call_args.args[1])
            usage = self.client.get("/api/features").json()["usage"]
            self.assertEqual(usage["chat_tokens_today"], 23)
            self.assertEqual(usage["chat_tokens_limit"], 50_000)
            self.assertEqual(usage["chat_tokens_remaining"], 49_977)
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
        self.assertFalse(any(h["assignment_id"] == assignment["id"]
                             for h in self.client.get("/api/bootstrap", headers=owner_headers).json()["handoffs"]))
        handoff = self.client.post(f"/api/assignments/{assignment['id']}/handoff", headers=caregiver_headers,
                                   json={"to_member_id": owner["member_id"]})
        self.assertEqual(handoff.status_code, 201)
        self.assertEqual(handoff.json()["special_note"], "열이 조금 있었음")
        ack_path = f"/api/handoffs/{handoff.json()['id']}/acknowledge"
        self.assertEqual(self.client.post(ack_path, headers=caregiver_headers).status_code, 403)
        self.assertEqual(self.client.post(ack_path, headers=owner_headers).status_code, 200)

    def test_completion_photo_persists_and_handoff_reaches_next_caregiver(self):
        os.environ["LGDX_DEV_MODE"] = "1"
        owner = self.client.post("/api/families", json={"name": "앨범 가족", "owner_name": "엄마"}).json()
        grandma = self.client.post("/api/families/join", json={
            "invite_code": owner["invite_code"], "name": "할머니", "role": "GRANDPARENT",
        }).json()
        dad = self.client.post("/api/families/join", json={
            "invite_code": owner["invite_code"], "name": "아빠", "role": "PARENT",
        }).json()
        headers = lambda room: {"Authorization": "Bearer " + room["access_token"]}
        self.assertEqual(self.client.post("/api/dev/preview-plan", headers=headers(owner), json={"plan": "PRO"}).status_code, 200)
        child = self.client.post("/api/children", headers=headers(owner), json={"name": "지우", "age_label": "7세"}).json()

        item_ids = []
        for title, start, end in [
            ("학교 하원", "2026-09-20T15:00:00+09:00", "2026-09-20T15:30:00+09:00"),
            ("태권도 이동", "2026-09-20T16:00:00+09:00", "2026-09-20T16:30:00+09:00"),
            ("저녁 돌봄", "2026-09-20T17:00:00+09:00", "2026-09-20T17:30:00+09:00"),
        ]:
            created = self.client.post("/api/child-schedules", headers=headers(owner), json={
                "child_id": child["id"], "title": title, "category": "ACADEMY",
                "starts_at": start, "ends_at": end,
            }).json()
            item_ids.append(created["care_item_id"])

        first = self.client.post("/api/assignments", headers=headers(owner), json={
            "item_id": item_ids[0], "assignee_id": grandma["member_id"],
        }).json()
        second = self.client.post("/api/assignments", headers=headers(owner), json={
            "item_id": item_ids[1], "assignee_id": grandma["member_id"],
        }).json()
        third = self.client.post("/api/assignments", headers=headers(owner), json={
            "item_id": item_ids[2], "assignee_id": dad["member_id"],
        }).json()
        self.client.post(f"/api/assignments/{first['id']}/respond", headers=headers(grandma), json={"decision": "ACCEPTED"})
        self.client.post(f"/api/assignments/{second['id']}/respond", headers=headers(grandma), json={"decision": "ACCEPTED"})
        self.client.post(f"/api/assignments/{third['id']}/respond", headers=headers(dad), json={"decision": "ACCEPTED"})

        owner_notices_before = len(self.client.get("/api/bootstrap", headers=headers(owner)).json()["notifications"])
        self.assertEqual(self.client.post(
            f"/api/assignments/{first['id']}/complete", headers=headers(grandma), json={"note": "연속 담당"},
        ).status_code, 200)
        owner_snapshot = self.client.get("/api/bootstrap", headers=headers(owner)).json()
        self.assertFalse(any(item["assignment_id"] == first["id"] for item in owner_snapshot["handoffs"]))
        self.assertEqual(len(owner_snapshot["notifications"]), owner_notices_before)

        png = b"\x89PNG\r\n\x1a\n" + b"care-photo"
        completed = self.client.post(
            f"/api/assignments/{second['id']}/complete-handoff", headers=headers(grandma),
            data={"note": "무릎에 작은 상처가 있어요"}, files={"photo": ("done.png", png, "image/png")},
        )
        self.assertEqual(completed.status_code, 200)
        self.assertEqual(completed.json()["photo"]["assignment_id"], second["id"])

        dad_snapshot = self.client.get("/api/bootstrap", headers=headers(dad)).json()
        handoff = next(item for item in dad_snapshot["handoffs"]
                       if item["assignment_id"] == second["id"] and item["to_member_id"] == dad["member_id"])
        self.assertIn("무릎에 작은 상처", handoff["special_note"])
        self.assertIn("완료 사진 있음", handoff["briefing"])

        direct = self.client.post("/api/album/photos", headers=headers(owner),
                                  files={"file": ("family.png", png, "image/png")}, data={"caption": "주말 나들이"})
        self.assertEqual(direct.status_code, 201)
        self.assertTrue(direct.json()["can_delete"])
        stored_file = Path(self.temp.name) / "uploads" / "family_album" / direct.json()["storage_path"]
        self.assertTrue(stored_file.is_file())
        photos = self.client.get("/api/album/photos", headers=headers(owner)).json()["photos"]
        self.assertEqual(len(photos), 2)
        self.assertTrue(all(photo["data_url"].startswith("data:image/png;base64,") for photo in photos))
        self.assertTrue(next(photo for photo in photos if photo["id"] == direct.json()["id"])["can_delete"])
        dad_photos = self.client.get("/api/album/photos", headers=headers(dad)).json()["photos"]
        self.assertFalse(next(photo for photo in dad_photos if photo["id"] == direct.json()["id"])["can_delete"])
        delete_path = f"/api/album/photos/{direct.json()['id']}"
        self.assertEqual(self.client.delete(delete_path, headers=headers(dad)).status_code, 403)
        self.assertEqual(self.client.delete(delete_path, headers=headers(owner)).status_code, 200)
        self.assertFalse(stored_file.exists())
        self.assertEqual(len(self.client.get("/api/album/photos", headers=headers(owner)).json()["photos"]), 1)

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
            "item_id": item_id, "assignee_id": owner["member_id"]}).json()
        path = "/api/emergency-requests"
        self.assertEqual(self.client.post(path, headers=headers(owner), json={"assignment_id": assignment["id"]}).status_code, 403)
        self.client.post("/api/dev/preview-plan", headers={**headers(owner), "X-Developer-Token": "local-test-token"},
                         json={"plan": "PRO"})
        created = self.client.post(path, headers=headers(owner), json={
            "assignment_id": assignment["id"], "reason": "갑자기 일정이 바뀌었어요"})
        self.assertEqual(created.status_code, 201)
        self.assertEqual(self.client.post(path, headers=headers(current), json={
            "assignment_id": assignment["id"], "reason": "내가 맡지 않은 일정"}).status_code, 403)
        request_id = created.json()["request"]["id"]
        additional = self.client.post(path, headers=headers(owner), json={
            "assignment_id": assignment["id"], "reason": "추가로 다른 가족에게도 요청해요"})
        self.assertEqual(additional.status_code, 201)
        additional_id = additional.json()["request"]["id"]
        self.assertEqual(set(created.json()["recipient_member_ids"]),
                         {current["member_id"], replacement["member_id"]})
        owner_notices = self.client.get("/api/bootstrap", headers=headers(owner)).json()["notifications"]
        replacement_notices = self.client.get("/api/bootstrap", headers=headers(replacement)).json()["notifications"]
        self.assertFalse(any(n["title"] == "긴급 돌봄 도움 요청" for n in owner_notices))
        self.assertTrue(any(n["title"] == "긴급 돌봄 도움 요청" for n in replacement_notices))
        claimed = self.client.post(f"{path}/{request_id}/claim", headers=headers(replacement))
        self.assertEqual(claimed.status_code, 200)
        self.assertEqual(claimed.json()["request"]["status"], "CLAIMED")
        self.assertEqual(claimed.json()["assignment"]["assignee_id"], replacement["member_id"])
        self.assertEqual(claimed.json()["assignment"]["status"], "ACCEPTED")
        self.assertEqual(claimed.json()["handoff"]["to_member_id"], replacement["member_id"])
        self.assertEqual(self.client.post(f"{path}/{request_id}/claim", headers=headers(owner)).status_code, 409)
        requests = self.client.get(path, headers=headers(owner)).json()["requests"]
        self.assertEqual(next(request for request in requests if request["id"] == additional_id)["status"], "CANCELLED")
        snapshot = self.client.get("/api/bootstrap", headers=headers(owner)).json()
        old = next(a for a in snapshot["assignments"] if a["id"] == assignment["id"])
        self.assertEqual(old["status"], "CANCELED")
        self.assertTrue(any(n["title"] == "긴급 요청 마감" for n in snapshot["notifications"]))

    def test_any_assigned_caregiver_role_can_request_emergency_help(self):
        os.environ["LGDX_DEV_MODE"] = "1"
        os.environ["LGDX_DEV_TOKEN"] = "local-test-token"
        owner = self.client.post("/api/families", json={"name": "긴급 가족", "owner_name": "엄마"}).json()
        caregiver = self.client.post("/api/families/join", json={
            "invite_code": owner["invite_code"], "name": "할머니", "role": "GRANDPARENT",
        }).json()
        owner_headers = {"Authorization": "Bearer " + owner["access_token"]}
        caregiver_headers = {"Authorization": "Bearer " + caregiver["access_token"]}
        child = self.client.post("/api/children", headers=owner_headers,
                                 json={"name": "아이", "age_label": "5세"}).json()
        intake = self.client.post("/api/intakes", headers=owner_headers, json={
            "child_id": child["id"], "raw_content": "17:00 하원",
        }).json()
        item_id = intake["items"][0]["id"]
        self.client.post(f"/api/items/{item_id}/confirm", headers=owner_headers)
        assignment = self.client.post("/api/assignments", headers=owner_headers, json={
            "item_id": item_id, "assignee_id": caregiver["member_id"],
        }).json()
        self.client.post(f"/api/assignments/{assignment['id']}/respond", headers=caregiver_headers,
                         json={"decision": "ACCEPTED"})
        self.client.post("/api/dev/preview-plan",
                         headers={**owner_headers, "X-Developer-Token": "local-test-token"},
                         json={"plan": "PRO"})

        requested = self.client.post("/api/emergency-requests", headers=caregiver_headers, json={
            "assignment_id": assignment["id"], "reason": "도움이 필요해요",
        })
        self.assertEqual(requested.status_code, 201)
        self.assertEqual(requested.json()["request"]["requested_by_member_id"], caregiver["member_id"])

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

    def test_legacy_plain_date_chat_usage_row_does_not_crash_the_24h_window(self):
        # Rows written before chat usage switched from "resets at local midnight" to a
        # rolling 24h window stored a plain date ("2026-09-20"), which parses as a naive
        # datetime and used to crash when compared against an aware "now".
        room = self.client.post("/api/families", json={"name": "레거시 사용량", "owner_name": "엄마"}).json()
        headers = {"Authorization": "Bearer " + room["access_token"]}
        with database() as db:
            db.execute(
                "INSERT INTO daily_usage(family_id, day, feature, amount) VALUES (?, ?, 'CHAT_TOKENS', ?)",
                (room["family_id"], "2026-09-20", 10),
            )
        response = self.client.get("/api/features", headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["usage"]["chat_tokens_today"], 0)

    def test_chat_can_apply_an_explicit_personal_schedule_change(self):
        room = self.client.post("/api/families", json={"name": "일정 가족", "owner_name": "엄마"}).json()
        headers = {"Authorization": "Bearer " + room["access_token"]}
        created = self.client.post("/api/schedules", headers=headers, json={
            "member_id": room["member_id"], "title": "운동",
            "starts_at": "2026-09-20T09:00:00+09:00", "ends_at": "2026-09-20T10:00:00+09:00",
        }).json()["schedule"]
        structured = {
            "answer": "운동 일정을 변경할게요.",
            "cards": [{"eyebrow": "일정", "title": "운동", "description": "오전 11시로 변경", "screen": "schedule"}],
            "schedule_changes": [{
                "schedule_type": "PERSONAL", "schedule_id": created["id"], "title": None,
                "starts_at": "2026-09-20T11:00:00+09:00", "ends_at": "2026-09-20T12:00:00+09:00",
            }],
        }
        with patch("app.extended.ai.answer", return_value=(structured, 40)):
            response = self.client.post("/api/assistant/chat", headers=headers, json={"message": "운동 일정을 11시로 변경해줘"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["schedule_changes"][0]["starts_at"], "2026-09-20T11:00:00+09:00")
        saved = next(item for item in self.client.get("/api/bootstrap", headers=headers).json()["schedules"] if item["id"] == created["id"])
        self.assertEqual(saved["starts_at"], "2026-09-20T11:00:00+09:00")

    def test_toss_billing_activation_enables_pro_without_exposing_billing_key(self):
        os.environ["TOSS_BILLING_CLIENT_KEY"] = "test_ck_demo"
        os.environ["TOSS_BILLING_SECRET_KEY"] = "test_sk_demo"
        room = self.client.post("/api/families", json={"name": "결제 가족", "owner_name": "엄마"}).json()
        headers = {"Authorization": "Bearer " + room["access_token"]}
        config = self.client.get("/api/billing/config", headers=headers)
        self.assertEqual(config.status_code, 200)
        self.assertTrue(config.json()["configured"])

        request = httpx.Request("POST", "https://api.tosspayments.com/v1/demo")
        issued = httpx.Response(200, request=request, json={"billingKey": "billing-secret-value"})
        paid = httpx.Response(200, request=request, json={
            "status": "DONE", "paymentKey": "payment-key", "approvedAt": "2026-09-17T12:00:00+09:00",
        })
        with patch("app.payment.httpx.post", side_effect=[issued, paid]):
            activated = self.client.post("/api/billing/activate", headers=headers, json={
                "auth_key": "temporary-auth-key", "customer_key": config.json()["customer_key"],
            })
        self.assertEqual(activated.status_code, 200)
        self.assertEqual(activated.json()["plan"], "PRO")
        self.assertNotIn("billing_key", activated.json())
        subscription = self.client.get("/api/subscription", headers=headers).json()
        self.assertEqual(subscription["status"], "ACTIVE")
        self.assertTrue(subscription["auto_renew_available"])
        self.assertFalse(subscription["cancel_at_period_end"])

        canceled = self.client.post("/api/billing/cancel", headers=headers)
        self.assertEqual(canceled.status_code, 200)
        self.assertTrue(canceled.json()["cancel_at_period_end"])
        self.assertIsNone(canceled.json()["next_billing_at"])
        self.assertEqual(self.client.get("/api/subscription", headers=headers).json()["plan"], "PRO")

        resumed = self.client.post("/api/billing/resume", headers=headers)
        self.assertEqual(resumed.status_code, 200)
        self.assertFalse(resumed.json()["cancel_at_period_end"])
        self.assertTrue(resumed.json()["next_billing_at"])

        with database() as db:
            db.execute(
                "UPDATE family_subscription SET current_period_end = ?, next_billing_at = ? WHERE family_id = ?",
                ("2026-01-01T00:00:00+09:00", "2026-01-01T00:00:00+09:00", room["family_id"]),
            )
        renewal = httpx.Response(200, request=request, json={
            "status": "DONE", "paymentKey": "renewal-payment-key", "approvedAt": "2026-09-17T13:00:00+09:00",
        })
        with patch("app.payment.httpx.post", return_value=renewal):
            result = process_due_renewals()
        self.assertEqual(result["renewed"], 1)
        renewed = self.client.get("/api/subscription", headers=headers).json()
        self.assertEqual(renewed["status"], "ACTIVE")
        self.assertTrue(renewed["next_billing_at"])

    def test_toss_widget_order_confirms_server_amount_and_activates_one_period(self):
        os.environ["TOSS_BILLING_CLIENT_KEY"] = "test_gck_demo"
        os.environ["TOSS_BILLING_SECRET_KEY"] = "test_gsk_demo"
        os.environ["TOSS_BILLING_AMOUNT"] = "7900"
        room = self.client.post("/api/families", json={"name": "결제 가족", "owner_name": "엄마"}).json()
        headers = {"Authorization": "Bearer " + room["access_token"]}

        config = self.client.get("/api/billing/config", headers=headers)
        self.assertEqual(config.status_code, 200)
        self.assertEqual(config.json()["integration_mode"], "WIDGET")
        self.assertEqual(config.json()["amount"], 7900)

        created = self.client.post("/api/billing/orders", headers=headers)
        self.assertEqual(created.status_code, 201)
        order = created.json()
        self.assertEqual(order["amount"], 7900)
        self.assertNotIn("secret_key", order)
        bad_amount = self.client.post("/api/billing/confirm", headers=headers, json={
            "payment_key": "payment-key", "order_id": order["order_id"], "amount": 100,
        })
        self.assertEqual(bad_amount.status_code, 400)

        request = httpx.Request("POST", "https://api.tosspayments.com/v1/payments/confirm")
        wrong_total = httpx.Response(200, request=request, json={
            "status": "DONE", "orderId": order["order_id"], "totalAmount": 7800,
            "paymentKey": "payment-key", "approvedAt": "2026-09-17T12:00:00+09:00",
        })
        with patch("app.payment.httpx.post", return_value=wrong_total):
            rejected = self.client.post("/api/billing/confirm", headers=headers, json={
                "payment_key": "payment-key", "order_id": order["order_id"], "amount": 7900,
            })
        self.assertEqual(rejected.status_code, 502)

        paid = httpx.Response(200, request=request, json={
            "status": "DONE", "orderId": order["order_id"], "totalAmount": 7900,
            "paymentKey": "payment-key", "approvedAt": "2026-09-17T12:00:00+09:00",
        })
        with patch("app.payment.httpx.post", return_value=paid) as toss_post:
            confirmed = self.client.post("/api/billing/confirm", headers=headers, json={
                "payment_key": "payment-key", "order_id": order["order_id"], "amount": 7900,
            })
        self.assertEqual(confirmed.status_code, 200)
        self.assertEqual(confirmed.json()["plan"], "PRO")
        self.assertEqual(confirmed.json()["amount"], 7900)
        self.assertTrue(confirmed.json()["current_period_end"])
        toss_post.assert_called_once()
        self.assertEqual(toss_post.call_args.kwargs["json"]["amount"], 7900)
        self.assertEqual(toss_post.call_args.kwargs["headers"]["Idempotency-Key"], f"confirm-{order['order_id']}")

        replayed = self.client.post("/api/billing/confirm", headers=headers, json={
            "payment_key": "payment-key", "order_id": order["order_id"], "amount": 7900,
        })
        self.assertEqual(replayed.status_code, 200)
        self.assertTrue(replayed.json()["already_processed"])
        subscription = self.client.get("/api/subscription", headers=headers).json()
        self.assertEqual(subscription["status"], "ACTIVE")
        self.assertEqual(subscription["plan"], "PRO")
        self.assertFalse(subscription["auto_renew_available"])

        canceled = self.client.post("/api/billing/cancel", headers=headers)
        self.assertEqual(canceled.status_code, 200)
        self.assertTrue(canceled.json()["cancel_at_period_end"])
        self.assertEqual(self.client.post("/api/billing/resume", headers=headers).status_code, 409)
        with database() as db:
            db.execute(
                "UPDATE family_subscription SET current_period_end = ? WHERE family_id = ?",
                ("2026-01-01T00:00:00+09:00", room["family_id"]),
            )
        self.assertEqual(process_due_renewals()["expired"], 1)
        expired = self.client.get("/api/subscription", headers=headers).json()
        self.assertEqual(expired["status"], "CANCELED")
        self.assertEqual(expired["plan"], "FREE")


if __name__ == "__main__":
    unittest.main()
