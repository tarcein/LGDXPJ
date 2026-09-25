"""Family-wide emergency requests with an atomic first-caregiver claim."""

from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .db import database
from .extended import _require_pro
from .family import family_id, member_id, owner_id
from .performance import record_event
from .services import rank_members


router = APIRouter(prefix="/api/emergency-requests", tags=["emergency care"])


class EmergencyCreate(BaseModel):
    assignment_id: str
    reason: str = Field(default="긴급 돌봄 도움이 필요합니다", min_length=1, max_length=500)
    recipient_member_ids: list[str] | None = None


def _request(db, request_id: str) -> dict:
    row = db.execute(
        """SELECT r.*, i.title AS item_title FROM emergency_request r
           JOIN care_assignment a ON a.id = r.assignment_id
           JOIN care_item i ON i.id = a.item_id
           WHERE r.id = ? AND r.family_id = ?""",
        (request_id, family_id()),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "긴급 요청을 찾을 수 없습니다")
    return dict(row)


@router.get("")
def list_emergency_requests():
    with database() as db:
        requests = [dict(row) for row in db.execute(
            """SELECT r.*, i.title AS item_title FROM emergency_request r
               JOIN care_assignment a ON a.id = r.assignment_id
               JOIN care_item i ON i.id = a.item_id
               WHERE r.family_id = ? ORDER BY r.created_at DESC""",
            (family_id(),),
        )]
    return {"requests": requests}


@router.post("", status_code=201)
def create_emergency_request(payload: EmergencyCreate):
    from .main import notify, now

    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        _require_pro(db)
        requester = db.execute(
            "SELECT id FROM family_member WHERE id = ? AND family_id = ? AND status = 'ACTIVE'",
            (member_id(), family_id()),
        ).fetchone()
        if requester is None:
            raise HTTPException(403, "활동 중인 가족 구성원만 긴급 도움을 요청할 수 있습니다")
        assignment = db.execute(
            """SELECT a.*, i.title AS item_title, i.starts_at, i.child_id FROM care_assignment a
               JOIN care_item i ON i.id = a.item_id
               WHERE a.id = ? AND a.family_id = ?""",
            (payload.assignment_id, family_id()),
        ).fetchone()
        if assignment is None:
            raise HTTPException(404, "배정을 찾을 수 없습니다")
        if assignment["assignee_id"] != member_id():
            raise HTTPException(403, "본인이 맡은 돌봄만 긴급 도움을 요청할 수 있습니다")
        if assignment["status"] != "ACCEPTED":
            raise HTTPException(409, "수락해 맡고 있는 돌봄만 긴급 요청할 수 있습니다")
        request_id = str(uuid4())
        db.execute(
            """INSERT INTO emergency_request(id, family_id, assignment_id,
               requested_by_member_id, reason, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (request_id, family_id(), assignment["id"], member_id(), payload.reason, now()),
        )
        record_event(
            db, "pro_feature_used", target_family_id=family_id(),
            target_member_id=member_id(), correlation_id=request_id,
            properties={"feature": "EMERGENCY_REQUEST"},
        )
        suggestions = rank_members(db, family_id(), assignment["starts_at"], target_child_id=assignment["child_id"])
        eligible = [candidate for candidate in suggestions
                    if candidate["available"] and candidate["member_id"] not in {member_id(), assignment["assignee_id"]}]
        active_ids = {row["id"] for row in db.execute(
            "SELECT id FROM family_member WHERE family_id = ? AND status = 'ACTIVE' AND id != ?",
            (family_id(), member_id()),
        )}
        if payload.recipient_member_ids is not None:
            chosen = {member for member in payload.recipient_member_ids if member in active_ids}
            if not chosen:
                raise HTTPException(422, "요청을 받을 가족을 한 명 이상 선택해주세요")
            recipients = list(chosen)
        else:
            recipients = list(active_ids)
        for target in recipients:
            notify(db, target, "긴급 돌봄 도움 요청", f"{assignment['item_title']} · {payload.reason}", "IMPORTANT",
                   "EMERGENCY_REQUEST", request_id)
        return {"request": _request(db, request_id), "recipient_member_ids": recipients, "suggestions": eligible}


@router.post("/{request_id}/claim")
def claim_emergency_request(request_id: str):
    from .main import notify, now

    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        request = _request(db, request_id)
        if request["status"] != "OPEN":
            raise HTTPException(409, "이미 마감된 긴급 요청입니다")
        member = db.execute(
            "SELECT id FROM family_member WHERE id = ? AND family_id = ? AND status = 'ACTIVE'",
            (member_id(), family_id()),
        ).fetchone()
        if member is None:
            raise HTTPException(403, "활성 가족 구성원만 응답할 수 있습니다")
        assignment = db.execute(
            "SELECT * FROM care_assignment WHERE id = ? AND family_id = ?",
            (request["assignment_id"], family_id()),
        ).fetchone()
        if assignment["status"] not in {"PROPOSED", "ACCEPTED"}:
            raise HTTPException(409, "배정이 이미 종료됐습니다")
        if member["id"] in {request["requested_by_member_id"], assignment["assignee_id"]}:
            raise HTTPException(403, "요청자나 현재 담당자는 대체 담당자로 응답할 수 없습니다")
        db.execute("UPDATE care_assignment SET status = 'CANCELED' WHERE id = ?", (assignment["id"],))
        new_id, handoff_id, timestamp = str(uuid4()), str(uuid4()), now()
        db.execute(
            """INSERT INTO care_assignment(id, family_id, item_id, assignee_id, status,
               source, created_at, responded_at) VALUES (?, ?, ?, ?, 'ACCEPTED', 'EXCEPTION', ?, ?)""",
            (new_id, family_id(), assignment["item_id"], member["id"], timestamp, timestamp),
        )
        db.execute("UPDATE care_item SET status = 'ASSIGNED' WHERE id = ?", (assignment["item_id"],))
        item = db.execute("SELECT title, detail FROM care_item WHERE id = ?", (assignment["item_id"],)).fetchone()
        briefing = f"{item['title']} · {item['detail']}".strip(" ·")
        db.execute(
            """INSERT INTO care_handoff(id, family_id, assignment_id, from_member_id,
               to_member_id, briefing, status, special_note)
               VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)""",
            (handoff_id, family_id(), new_id, assignment["assignee_id"], member["id"], briefing, assignment["note"]),
        )
        record_event(
            db, "reassignment_confirmed", target_family_id=family_id(),
            target_member_id=member["id"], correlation_id=assignment["item_id"],
            properties={"assignment_id": new_id, "method": "EMERGENCY"},
        )
        record_event(
            db, "handoff_completed", target_family_id=family_id(),
            target_member_id=assignment["assignee_id"], correlation_id=handoff_id,
            properties={"assignment_id": new_id, "has_note": bool(assignment["note"]),
                        "has_photo": False},
        )
        db.execute(
            """UPDATE emergency_request SET status = 'CLAIMED', claimed_by_member_id = ?,
               resolved_at = ? WHERE id = ?""",
            (member["id"], timestamp, request_id),
        )
        db.execute(
            """UPDATE emergency_request SET status = 'CANCELLED', resolved_at = ?
               WHERE family_id = ? AND assignment_id = ? AND status = 'OPEN' AND id != ?""",
            (timestamp, family_id(), assignment["id"], request_id),
        )
        for target in db.execute(
            "SELECT id FROM family_member WHERE family_id = ? AND status = 'ACTIVE'", (family_id(),)
        ):
            notify(db, target["id"], "긴급 요청 마감", f"{item['title']}의 새 담당자가 확정됐습니다", "IMPORTANT",
                   "EMERGENCY_REQUEST", request_id)
        return {
            "request": _request(db, request_id),
            "assignment": dict(db.execute("SELECT * FROM care_assignment WHERE id = ?", (new_id,)).fetchone()),
            "handoff": dict(db.execute("SELECT * FROM care_handoff WHERE id = ?", (handoff_id,)).fetchone()),
        }


@router.post("/{request_id}/cancel")
def cancel_emergency_request(request_id: str):
    from .main import notify, now

    with database() as db:
        db.execute("BEGIN IMMEDIATE")
        request = _request(db, request_id)
        if member_id() not in {request["requested_by_member_id"], owner_id(db)}:
            raise HTTPException(403, "요청자나 주돌봄자만 취소할 수 있습니다")
        if request["status"] != "OPEN":
            raise HTTPException(409, "진행 중인 긴급 요청만 취소할 수 있습니다")
        db.execute(
            "UPDATE emergency_request SET status = 'CANCELLED', resolved_at = ? WHERE id = ?",
            (now(), request_id),
        )
        for target in db.execute(
            "SELECT id FROM family_member WHERE family_id = ? AND status = 'ACTIVE' AND id != ?",
            (family_id(), member_id()),
        ):
            notify(db, target["id"], "긴급 요청 취소", f"{request['item_title']} 도움 요청이 취소됐습니다",
                   action_type="EMERGENCY_REQUEST", action_id=request_id)
        return {"request": _request(db, request_id)}
