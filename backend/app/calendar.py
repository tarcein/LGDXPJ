"""Google and Microsoft calendar OAuth for each caregiver."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlsplit

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from .config import setting
from .db import database
from .family import family_id, member_id


router = APIRouter(prefix="/api/calendar-connections", tags=["calendar connections"])
PROVIDERS = {"google", "microsoft"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _credentials(provider: str) -> tuple[str, str]:
    prefix = "GOOGLE" if provider == "google" else "MICROSOFT"
    return setting(prefix + "_CLIENT_ID"), setting(prefix + "_CLIENT_SECRET")


def _redirect_uri(provider: str) -> str:
    # Prefer the exact URI registered in the provider console. This matters
    # for Google: host, path, and scheme must match byte-for-byte.
    configured_uri = setting(("GOOGLE" if provider == "google" else "MICROSOFT") + "_REDIRECT_URI")
    if configured_uri:
        return configured_uri.rstrip("/")
    configured = setting("CALENDAR_REDIRECT_BASE", "http://127.0.0.1:8000")
    return configured.rstrip("/") + f"/api/calendar-connections/{provider}/callback"


def _frontend_return_url(request: Request) -> str:
    origin = request.headers.get("origin", "").strip()
    parsed = urlsplit(origin)
    if parsed.scheme in {"http", "https"} and parsed.netloc and not parsed.username and not parsed.password:
        return f"{parsed.scheme}://{parsed.netloc}"
    return setting("FRONTEND_URL", "http://127.0.0.1:5173").rstrip("/")


def _provider(provider: str) -> str:
    if provider not in PROVIDERS:
        raise HTTPException(404, "지원하지 않는 캘린더입니다")
    return provider


@router.get("")
def connections():
    with database() as db:
        connected = {row["provider"]: dict(row) for row in db.execute(
            """SELECT provider, connected_at, synced_at FROM calendar_connection
               WHERE family_id = ? AND member_id = ?""", (family_id(), member_id()),
        )}
    return {"connections": [{
        "provider": provider,
        "configured": all(_credentials(provider)),
        "api_key_configured": bool(setting("GOOGLE_CALENDAR_API_KEY")) if provider == "google" else False,
        "connected": provider in connected,
        "connected_at": connected.get(provider, {}).get("connected_at"),
        "synced_at": connected.get(provider, {}).get("synced_at"),
    } for provider in ("google", "microsoft")]}


@router.post("/{provider}/authorize")
def authorize(provider: str, request: Request):
    provider = _provider(provider)
    client_id, client_secret = _credentials(provider)
    if not client_id or not client_secret:
        raise HTTPException(503, detail={
            "code": "CALENDAR_NOT_CONFIGURED",
            "message": f"{provider.title()} OAuth Client ID와 Secret을 backend/.env에 설정해주세요",
        })
    state = secrets.token_urlsafe(32)
    with database() as db:
        db.execute("DELETE FROM calendar_oauth_state WHERE expires_at < ?", (_now().isoformat(),))
        db.execute(
            """INSERT INTO calendar_oauth_state
               (state, family_id, member_id, provider, expires_at, return_url) VALUES (?, ?, ?, ?, ?, ?)""",
            (state, family_id(), member_id(), provider, (_now() + timedelta(minutes=10)).isoformat(),
             _frontend_return_url(request)),
        )
    if provider == "google":
        base = "https://accounts.google.com/o/oauth2/v2/auth"
        params = {
            "client_id": client_id, "redirect_uri": _redirect_uri(provider), "response_type": "code",
            "scope": "https://www.googleapis.com/auth/calendar.events.readonly",
            "access_type": "offline", "prompt": "consent", "state": state,
        }
    else:
        base = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
        params = {
            "client_id": client_id, "redirect_uri": _redirect_uri(provider), "response_type": "code",
            "response_mode": "query", "scope": "openid profile offline_access Calendars.Read", "state": state,
        }
    return {"authorization_url": base + "?" + urlencode(params)}


@router.get("/{provider}/callback")
def callback(provider: str, code: str = Query(min_length=1), state: str = Query(min_length=1)):
    provider = _provider(provider)
    with database() as db:
        stored = db.execute("SELECT * FROM calendar_oauth_state WHERE state = ? AND provider = ?", (state, provider)).fetchone()
        if stored is None or datetime.fromisoformat(stored["expires_at"]) <= _now():
            raise HTTPException(400, "캘린더 연결 요청이 만료됐습니다")
        target_family, target_member = stored["family_id"], stored["member_id"]
        return_url = stored.get("return_url") if isinstance(stored, dict) else stored["return_url"]
    client_id, client_secret = _credentials(provider)
    if provider == "google":
        token_url = "https://oauth2.googleapis.com/token"
        payload = {"client_id": client_id, "client_secret": client_secret, "code": code,
                   "redirect_uri": _redirect_uri(provider), "grant_type": "authorization_code"}
    else:
        token_url = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
        payload = {"client_id": client_id, "client_secret": client_secret, "code": code,
                   "redirect_uri": _redirect_uri(provider), "grant_type": "authorization_code",
                   "scope": "openid profile offline_access Calendars.Read"}
    try:
        response = httpx.post(token_url, data=payload, timeout=30)
        response.raise_for_status()
        token = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, detail={"code": "CALENDAR_OAUTH_FAILED", "message": "캘린더 인증을 완료하지 못했습니다"}) from exc
    expires_at = (_now() + timedelta(seconds=int(token.get("expires_in", 3600)))).isoformat()
    with database() as db:
        db.execute(
            """INSERT INTO calendar_connection(family_id, member_id, provider, access_token,
               refresh_token, expires_at, connected_at) VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(family_id, member_id, provider) DO UPDATE SET
               access_token=excluded.access_token,
               refresh_token=COALESCE(excluded.refresh_token, calendar_connection.refresh_token),
               expires_at=excluded.expires_at, connected_at=excluded.connected_at""",
            (target_family, target_member, provider, token["access_token"], token.get("refresh_token"),
             expires_at, _now().isoformat()),
        )
        db.execute("DELETE FROM calendar_oauth_state WHERE state = ?", (state,))
    frontend = return_url or setting("FRONTEND_URL", "http://127.0.0.1:5173")
    return RedirectResponse(frontend.rstrip("/") + f"/?calendar={provider}-connected")


def _refresh(provider: str, connection: dict) -> str:
    if connection.get("expires_at") and datetime.fromisoformat(connection["expires_at"]) > _now() + timedelta(minutes=2):
        return connection["access_token"]
    if not connection.get("refresh_token"):
        raise HTTPException(401, detail={"code": "CALENDAR_RECONNECT_REQUIRED", "message": "캘린더를 다시 연결해주세요"})
    client_id, client_secret = _credentials(provider)
    if provider == "google":
        url = "https://oauth2.googleapis.com/token"
        data = {"client_id": client_id, "client_secret": client_secret,
                "refresh_token": connection["refresh_token"], "grant_type": "refresh_token"}
    else:
        url = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
        data = {"client_id": client_id, "client_secret": client_secret,
                "refresh_token": connection["refresh_token"], "grant_type": "refresh_token",
                "scope": "openid profile offline_access Calendars.Read"}
    try:
        response = httpx.post(url, data=data, timeout=30)
        response.raise_for_status()
        token = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, detail={"code": "CALENDAR_SYNC_FAILED", "message": "캘린더 인증 갱신에 실패했습니다"}) from exc
    expires_at = (_now() + timedelta(seconds=int(token.get("expires_in", 3600)))).isoformat()
    with database() as db:
        db.execute("""UPDATE calendar_connection SET access_token = ?, refresh_token = ?, expires_at = ?
                      WHERE family_id = ? AND member_id = ? AND provider = ?""",
                   (token["access_token"], token.get("refresh_token", connection["refresh_token"]), expires_at,
                    family_id(), member_id(), provider))
    return token["access_token"]


def _date_time(value: dict, *, end: bool = False) -> str:
    if value.get("dateTime"):
        raw = value["dateTime"]
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        return datetime.fromisoformat(raw).isoformat()
    day = datetime.fromisoformat(value["date"]).replace(tzinfo=timezone.utc)
    if end:
        return day.isoformat()
    return day.isoformat()


@router.post("/{provider}/sync")
def sync(provider: str):
    provider = _provider(provider)
    with database() as db:
        row = db.execute("SELECT * FROM calendar_connection WHERE family_id = ? AND member_id = ? AND provider = ?",
                         (family_id(), member_id(), provider)).fetchone()
    if row is None:
        raise HTTPException(409, detail={"code": "CALENDAR_NOT_CONNECTED", "message": "캘린더를 먼저 연결해주세요"})
    connection = dict(row)
    token = _refresh(provider, connection)
    start, end = _now() - timedelta(days=30), _now() + timedelta(days=90)
    headers = {"Authorization": "Bearer " + token}
    try:
        if provider == "google":
            params = {"timeMin": start.isoformat(), "timeMax": end.isoformat(),
                      "singleEvents": "true", "orderBy": "startTime", "maxResults": 250}
            api_key = setting("GOOGLE_CALENDAR_API_KEY")
            if api_key:
                params["key"] = api_key
            response = httpx.get("https://www.googleapis.com/calendar/v3/calendars/primary/events", headers=headers,
                                 params=params, timeout=30)
            response.raise_for_status()
            source = response.json().get("items", [])
            events = [(event.get("id"), event.get("summary") or "바쁨", _date_time(event["start"]), _date_time(event["end"], end=True))
                      for event in source if event.get("id") and event.get("start") and event.get("end") and event.get("status") != "cancelled"]
        else:
            response = httpx.get("https://graph.microsoft.com/v1.0/me/calendarView", headers=headers,
                                 params={"startDateTime": start.isoformat(), "endDateTime": end.isoformat(),
                                         "$select": "id,subject,start,end", "$top": 250}, timeout=30)
            response.raise_for_status()
            source = response.json().get("value", [])
            events = [(event.get("id"), event.get("subject") or "바쁨",
                       event["start"]["dateTime"], event["end"]["dateTime"])
                      for event in source if event.get("id") and event.get("start") and event.get("end")]
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise HTTPException(502, detail={"code": "CALENDAR_SYNC_FAILED", "message": "캘린더 일정을 가져오지 못했습니다"}) from exc
    with database() as db:
        db.execute("DELETE FROM personal_schedule WHERE family_id = ? AND member_id = ? AND external_source = ?",
                   (family_id(), member_id(), provider))
        for external_id, title, starts_at, ends_at in events:
            db.execute("""INSERT INTO personal_schedule(id, family_id, member_id, title, starts_at, ends_at,
                          kind, external_source, external_id) VALUES (?, ?, ?, ?, ?, ?, 'WORK', ?, ?)""",
                       (secrets.token_urlsafe(18), family_id(), member_id(), title, starts_at, ends_at, provider, external_id))
        timestamp = _now().isoformat()
        db.execute("UPDATE calendar_connection SET synced_at = ? WHERE family_id = ? AND member_id = ? AND provider = ?",
                   (timestamp, family_id(), member_id(), provider))
    return {"provider": provider, "imported": len(events), "synced_at": timestamp}


@router.post("/{provider}/disconnect")
def disconnect(provider: str):
    provider = _provider(provider)
    with database() as db:
        db.execute("DELETE FROM personal_schedule WHERE family_id = ? AND member_id = ? AND external_source = ?",
                   (family_id(), member_id(), provider))
        db.execute("DELETE FROM calendar_connection WHERE family_id = ? AND member_id = ? AND provider = ?",
                   (family_id(), member_id(), provider))
    return {"provider": provider, "connected": False}
