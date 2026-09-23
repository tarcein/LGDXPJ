"""Device-alert routing settings (TV vs voice-appliance fallback)."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


class DeviceAlertsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        os.environ["LGDX_DB_PATH"] = str(Path(self.temp.name) / "devices.db")
        os.environ["LGDX_SEED_DEMO"] = "1"
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()

    def tearDown(self) -> None:
        self.client_context.__exit__(None, None, None)
        os.environ.pop("LGDX_DB_PATH", None)
        os.environ.pop("LGDX_SEED_DEMO", None)
        self.temp.cleanup()

    def _make_pro_family(self) -> dict:
        room = self.client.post("/api/families", json={"name": "가전 가족", "owner_name": "엄마"}).json()
        headers = {"Authorization": "Bearer " + room["access_token"]}
        self.client.post("/api/dev/preview-plan", headers=headers, json={"plan": "PRO"})
        return headers

    def test_default_settings_match_the_demo_catalog(self):
        response = self.client.get("/api/device-alerts")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["settings"]["devices"], ["tv_living", "water_purifier", "robot_vacuum"])
        self.assertEqual(body["settings"]["priority"], ["tv_living", "water_purifier", "robot_vacuum"])
        self.assertEqual(len(body["catalog"]), 5)
        self.assertEqual(len(body["content_keys"]), 8)
        self.assertFalse(body["tv_online"])

    def test_tv_status_heartbeat_marks_tv_online_and_test_alert_routes_to_tv(self):
        self.client.post("/api/device-alerts/tv-status", json={"status": "on"})
        online = self.client.get("/api/device-alerts").json()["tv_online"]
        self.assertTrue(online)
        result = self.client.post("/api/device-alerts/test", json={}).json()
        self.assertEqual(result["channel"], "TV")

    def test_tv_off_falls_back_to_next_priority_device(self):
        result = self.client.post("/api/device-alerts/test", json={"assume_tv_off": True}).json()
        self.assertEqual(result["channel"], "VOICE")
        self.assertEqual(result["device_id"], "water_purifier")

    def test_changing_priority_changes_which_voice_device_gets_the_fallback(self):
        headers = self._make_pro_family()
        patched = self.client.patch("/api/device-alerts", headers=headers,
                                    json={"priority": ["robot_vacuum", "water_purifier"]})
        self.assertEqual(patched.status_code, 200)
        result = self.client.post("/api/device-alerts/test", headers=headers, json={"assume_tv_off": True}).json()
        self.assertEqual(result["device_id"], "robot_vacuum")

    def test_tv_does_not_have_to_be_first_priority(self):
        headers = self._make_pro_family()
        self.client.patch("/api/device-alerts", headers=headers,
                           json={"priority": ["water_purifier", "tv_living", "robot_vacuum"]})
        # A voice device ranked above the TV wins even while the TV is on.
        self.client.post("/api/device-alerts/tv-status", headers=headers, json={"status": "on"})
        result = self.client.post("/api/device-alerts/test", headers=headers, json={}).json()
        self.assertEqual(result["channel"], "VOICE")
        self.assertEqual(result["device_id"], "water_purifier")

    def test_tv_ranked_lower_still_wins_when_on_and_devices_above_it_are_disabled(self):
        headers = self._make_pro_family()
        self.client.patch("/api/device-alerts", headers=headers,
                           json={"devices": ["tv_living", "robot_vacuum"],
                                 "priority": ["water_purifier", "tv_living", "robot_vacuum"]})
        self.client.post("/api/device-alerts/tv-status", headers=headers, json={"status": "on"})
        result = self.client.post("/api/device-alerts/test", headers=headers, json={}).json()
        self.assertEqual(result["channel"], "TV")
        self.assertEqual(result["device_id"], "tv_living")

    def test_stale_device_ids_from_an_old_catalog_do_not_inflate_counts(self):
        self.client.get("/api/device-alerts")  # ensure the default row exists
        from app.db import database
        import json as jsonlib
        with database() as db:
            db.execute("UPDATE device_alert_setting SET devices = ? WHERE family_id = 'demo-family'",
                       (jsonlib.dumps(["tv_living", "water_purifier", "air_purifier"]),))
        response = self.client.get("/api/device-alerts")
        self.assertEqual(response.json()["settings"]["devices"], ["tv_living", "water_purifier"])

    def test_test_alert_actually_creates_a_real_notification(self):
        # The button is labeled "보내기" (send) — it must not be a pure preview
        # that only affects the response shown on the settings screen, since the
        # TV and voice display pages only ever react to real notifications.
        headers = self._make_pro_family()
        before = self.client.get("/api/bootstrap", headers=headers).json()["notifications"]
        self.client.post("/api/device-alerts/test", headers=headers, json={})
        after = self.client.get("/api/bootstrap", headers=headers).json()["notifications"]
        self.assertEqual(len(after), len(before) + 1)
        self.assertEqual(after[0]["action_type"], "DEVICE_ALERT_TEST")
        self.assertEqual(after[0]["title"], "민솔이 하원 30분 전")

    def test_free_plan_cannot_change_settings(self):
        response = self.client.patch("/api/device-alerts", json={"speech_volume": 80})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"]["code"], "SUBSCRIPTION_REQUIRED")

    def test_unknown_device_id_is_rejected(self):
        headers = self._make_pro_family()
        response = self.client.patch("/api/device-alerts", headers=headers, json={"devices": ["dishwasher"]})
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
