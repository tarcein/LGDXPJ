"""Native FCM and standards-based PWA Web Push delivery."""

from __future__ import annotations

import base64
import json
import logging
import os
from pathlib import Path
from urllib.parse import urlencode

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid
from pywebpush import WebPushException, webpush
from dotenv import dotenv_values

from .config import setting

_firebase_app = None
_firebase_status = "not_checked"
logger = logging.getLogger(__name__)


def _vapid_private_key() -> str:
    inline_key = setting("VAPID_PRIVATE_KEY")
    if inline_key:
        return inline_key
    key_file = setting("VAPID_PRIVATE_KEY_FILE")
    if not key_file:
        return ""
    path = Path(key_file)
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[1] / path
    return str(path) if path.is_file() else ""


def web_push_public_key() -> str:
    inline_key = setting("VAPID_PRIVATE_KEY")
    private_key = inline_key or _vapid_private_key()
    if not private_key:
        return ""
    try:
        vapid = Vapid.from_string(inline_key) if inline_key else Vapid.from_file(private_key)
        raw = vapid.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")
    except Exception:
        return ""


def _app():
    global _firebase_app, _firebase_status
    if _firebase_app is not None:
        return _firebase_app
    credential_source = setting("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not credential_source:
        _firebase_status = "credential_unset"
        logger.warning("Native push skipped: FIREBASE_SERVICE_ACCOUNT_JSON is unset.")
        return None
    try:
        import firebase_admin
        from firebase_admin import credentials
        if credential_source.startswith("{"):
            certificate = json.loads(credential_source)
        else:
            path = Path(credential_source)
            # Preserve existing working-directory paths; also accept backend-relative paths.
            if not path.is_absolute() and not path.is_file():
                path = Path(__file__).resolve().parents[1] / path
            if not path.is_file():
                _firebase_status = "credential_file_unavailable"
                logger.warning("Native push skipped: FIREBASE_SERVICE_ACCOUNT_JSON file is unavailable.")
                return None
            certificate = str(path)
        options = {"projectId": setting("FIREBASE_PROJECT_ID")} if setting("FIREBASE_PROJECT_ID") else None
        _firebase_app = firebase_admin.initialize_app(credentials.Certificate(certificate), options=options)
        _firebase_status = "ready"
        return _firebase_app
    except Exception as error:
        _firebase_status = "initialization_" + type(error).__name__
        logger.warning("Firebase initialization failed (%s).", type(error).__name__)
        return None


def native_push_status() -> str:
    _app()
    return _firebase_status


def native_push_config_sources() -> dict[str, str | bool]:
    """Report only where credentials could come from, never their contents."""
    backend_env = Path(__file__).resolve().parents[1] / ".env"
    file_values = dotenv_values(backend_env) if backend_env.is_file() else None
    key = "FIREBASE_SERVICE_ACCOUNT_JSON"
    process_value = os.environ.get(key)
    file_value = file_values.get(key) if file_values is not None else None
    return {
        "process_env": "absent" if process_value is None else "set" if process_value else "empty",
        "backend_dotenv": "absent" if file_values is None else "set" if file_value else "empty" if key in file_values else "no_key",
        "google_adc_env": bool(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")),
        "database_env": bool(os.environ.get("DATABASE_URL")),
        "container": Path("/.dockerenv").exists(),
    }


def send_push(devices: list[dict], title: str, body: str,
              action_type: str | None, action_id: str | None) -> list[str]:
    if not devices:
        return []
    native_tokens = [device["token"] for device in devices if device["platform"] != "WEB"]
    data = {"action_type": action_type or "", "action_id": action_id or ""}
    app = _app() if native_tokens else None
    if app:
        from firebase_admin import messaging
        for token in native_tokens:
            try:
                messaging.send(messaging.Message(
                    token=token,
                    notification=messaging.Notification(title=title, body=body),
                    data=data,
                ), app=app)
            except Exception as error:
                # A stale device token must not break the family action that created the notice.
                logger.warning("FCM delivery failed (%s, code=%s).", type(error).__name__, getattr(error, "code", "unknown"))
                continue

    private_key = _vapid_private_key()
    subject = setting("VAPID_SUBJECT")
    if not private_key or not subject:
        return []
    target = {"screen": "notifications"}
    if action_type:
        target["action_type"] = action_type
    if action_id:
        target["action_id"] = action_id
    payload = json.dumps({"title": title, "body": body, **data, "url": f"/?{urlencode(target)}"}, ensure_ascii=False)
    stale: list[str] = []
    for token in [device["token"] for device in devices if device["platform"] == "WEB"]:
        try:
            subscription = json.loads(token)
            webpush(subscription_info=subscription, data=payload, vapid_private_key=private_key,
                    vapid_claims={"sub": subject}, ttl=300, timeout=10)
        except (json.JSONDecodeError, TypeError, KeyError):
            stale.append(token)
        except WebPushException as error:
            if getattr(getattr(error, "response", None), "status_code", None) in {404, 410}:
                stale.append(token)
        except Exception:
            continue
    return stale


def check_fcm() -> bool:
    """Validate this process's Firebase credentials without delivering a notification."""
    app = _app()
    if app is None:
        return False
    from firebase_admin import messaging
    try:
        messaging.send(messaging.Message(
            topic="zippy-push-diagnostics", data={"diagnostic": "true"},
        ), dry_run=True, app=app)
    except Exception as error:
        logger.warning("FCM validation failed (%s, code=%s).", type(error).__name__, getattr(error, "code", "unknown"))
        return False
    return True


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Check FCM configuration without sending a notification.")
    parser.add_argument("--check", action="store_true", required=True)
    parser.parse_args()
    success = check_fcm()
    print("FCM validation accepted (no notification sent)." if success else "FCM validation failed; see warning above.")
    raise SystemExit(0 if success else 1)
