"""Push failures remain non-fatal but must be diagnosable without exposing tokens."""

import unittest
from pathlib import Path
from unittest.mock import patch

from app import push


class PushDiagnosticsTest(unittest.TestCase):
    def test_credentials_accept_existing_paths_backend_relative_paths_and_inline_json(self):
        backend = Path(push.__file__).resolve().parents[1]
        cases = [
            (str(backend / "service-account.json"), True, str(backend / "service-account.json")),
            ("service-account.json", True, "service-account.json"),
            ("service-account.json", False, str(backend / "service-account.json")),
            ('{"project_id": "test-project"}', True, {"project_id": "test-project"}),
        ]
        for source, cwd_exists, expected in cases:
            with self.subTest(source=source, cwd_exists=cwd_exists), \
                 patch.object(push, "_firebase_app", None), \
                 patch.object(push, "setting", side_effect=lambda name: source if name == "FIREBASE_SERVICE_ACCOUNT_JSON" else "test-project"), \
                 patch.object(Path, "is_file", side_effect=[cwd_exists, True]), \
                 patch("firebase_admin.credentials.Certificate") as certificate, \
                 patch("firebase_admin.initialize_app") as initialize:
                self.assertIs(push._app(), initialize.return_value)
                certificate.assert_called_once_with(expected)
                initialize.assert_called_once_with(certificate.return_value, options={"projectId": "test-project"})

    def test_missing_firebase_credentials_are_reported(self):
        with patch.object(push, "_firebase_app", None), patch.object(push, "setting", return_value=""):
            with self.assertLogs("app.push", level="WARNING") as logs:
                self.assertIsNone(push._app())
        self.assertIn("FIREBASE_SERVICE_ACCOUNT_JSON", logs.output[0])
        self.assertEqual(push._firebase_status, "credential_unset")

    def test_bad_credentials_are_nonfatal_and_do_not_leak(self):
        for source in ("missing-secret-file.json", '{"private_key":"secret-key",invalid}'):
            with self.subTest(source=source), patch.object(push, "_firebase_app", None), \
                 patch.object(push, "setting", return_value=source), \
                 patch.object(Path, "is_file", return_value=False), \
                 self.assertLogs("app.push", level="WARNING") as logs:
                self.assertIsNone(push._app())
            self.assertNotIn(source, str(logs.output))
            self.assertNotIn("secret-key", str(logs.output))
            self.assertEqual(push._firebase_status, "credential_file_unavailable" if not source.startswith("{") else "initialization_JSONDecodeError")

    def test_check_only_validates_and_reports_failure(self):
        app = object()
        with patch.object(push, "_app", return_value=app), \
             patch("firebase_admin.messaging.send") as send:
            self.assertTrue(push.check_fcm())
            self.assertEqual(send.call_args.kwargs, {"dry_run": True, "app": app})
            self.assertIsNone(send.call_args.args[0].notification)
            send.side_effect = RuntimeError("secret")
            with self.assertLogs("app.push", level="WARNING") as logs:
                self.assertFalse(push.check_fcm())
            self.assertNotIn("secret", str(logs.output))
        with patch.object(push, "_app", return_value=None), patch("firebase_admin.messaging.send") as send:
            self.assertFalse(push.check_fcm())
            send.assert_not_called()

    def test_delivery_failure_is_logged_without_token_or_message(self):
        with patch.object(push, "_app", return_value=object()), \
             patch.object(push, "_vapid_private_key", return_value=""), \
             patch("firebase_admin.messaging.send", side_effect=RuntimeError("secret-device-token")):
            with self.assertLogs("app.push", level="WARNING") as logs:
                self.assertEqual(push.send_push(
                    [{"platform": "ANDROID", "token": "secret-device-token"}],
                    "Private title", "Private body", None, None,
                ), [])
        self.assertIn("FCM delivery failed (RuntimeError", logs.output[0])
        self.assertNotIn("secret-device-token", str(logs.output))
        self.assertNotIn("Private", str(logs.output))
