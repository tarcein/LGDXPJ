"""Optional Firebase Cloud Messaging delivery."""

from __future__ import annotations

from pathlib import Path

from .config import setting

_firebase_app = None


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


def send_push(tokens: list[str], title: str, body: str, action_type: str | None, action_id: str | None) -> None:
    app = _app()
    if not app or not tokens:
        return
    from firebase_admin import messaging
    data = {"action_type": action_type or "", "action_id": action_id or ""}
    for token in tokens:
        try:
            messaging.send(messaging.Message(
                token=token,
                notification=messaging.Notification(title=title, body=body),
                data=data,
            ), app=app)
        except Exception:
            # A stale device token must not break the family action that created the notice.
            continue
