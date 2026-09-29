"""Native FCM and standards-based PWA Web Push delivery."""

from __future__ import annotations

import base64
import json
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid
from pywebpush import WebPushException, webpush

from .config import setting

_firebase_app = None


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
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app
    credentials_path = setting("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not credentials_path or not Path(credentials_path).is_file():
        return None
    try:
        import firebase_admin
        from firebase_admin import credentials
        options = {"projectId": setting("FIREBASE_PROJECT_ID")} if setting("FIREBASE_PROJECT_ID") else None
        _firebase_app = firebase_admin.initialize_app(credentials.Certificate(credentials_path), options=options)
        return _firebase_app
    except Exception:
        return None


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
            except Exception:
                # A stale device token must not break the family action that created the notice.
                continue

    private_key = _vapid_private_key()
    subject = setting("VAPID_SUBJECT")
    if not private_key or not subject:
        return []
    payload = json.dumps({"title": title, "body": body, **data, "url": "/?screen=notifications"}, ensure_ascii=False)
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
