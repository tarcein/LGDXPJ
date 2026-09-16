"""Deterministic prototype logic; replace with reviewed AI integrations later."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any


def classify_lines(raw_content: str) -> list[dict[str, str]]:
    lines = [line.strip(" -•\t") for line in re.split(r"[\n。]+", raw_content) if line.strip()]
    if not lines:
        return []
    result = []
    for line in lines[:20]:
        if any(word in line for word in ("변경", "휴강", "지연", "취소")):
            item_type = "CHANGE"
        elif any(word in line for word in ("준비물", "챙기", "물품", "도시락")):
            item_type = "SUPPLY"
        elif any(word in line for word in ("제출", "신청", "회신", "확인")):
            item_type = "TODO"
        else:
            item_type = "SCHEDULE" if re.search(r"\d{1,2}[:시]\d{0,2}", line) else "TODO"
        result.append({"item_type": item_type, "title": line[:200], "confidence": "LOW"})
    return result


def is_busy(db: Any, member_id: str, starts_at: str | None) -> bool:
    if not starts_at:
        return False
    try:
        care_time = datetime.fromisoformat(starts_at)
    except ValueError:
        return False
    schedules = db.execute(
        "SELECT starts_at, ends_at FROM personal_schedule WHERE member_id = ?", (member_id,)
    ).fetchall()
    for schedule in schedules:
        start = datetime.fromisoformat(schedule["starts_at"])
        end = datetime.fromisoformat(schedule["ends_at"])
        if start <= care_time < end:
            return True
    return False


def active_care_count(db: Any, member_id: str, starts_at: str | None) -> tuple[int, bool]:
    assignments = db.execute(
        """SELECT i.starts_at FROM care_assignment a JOIN care_item i ON i.id = a.item_id
           WHERE a.assignee_id = ? AND a.status IN ('PROPOSED', 'ACCEPTED')""",
        (member_id,),
    ).fetchall()
    if not starts_at:
        return len(assignments), False
    target = datetime.fromisoformat(starts_at)
    overlaps = False
    for assignment in assignments:
        if not assignment["starts_at"]:
            continue
        care_time = datetime.fromisoformat(assignment["starts_at"])
        if abs((care_time - target).total_seconds()) < 60 * 60:
            overlaps = True
    return len(assignments), overlaps


def rank_members(db: Any, family_id: str, starts_at: str | None, exclude_member_id: str | None = None) -> list[dict]:
    members = db.execute(
        "SELECT * FROM family_member WHERE family_id = ? AND status = 'ACTIVE'", (family_id,)
    ).fetchall()
    ranked = []
    for member in members:
        if member["id"] == exclude_member_id:
            continue
        schedule_busy = is_busy(db, member["id"], starts_at)
        care_count, care_busy = active_care_count(db, member["id"], starts_at)
        busy = schedule_busy or care_busy
        if schedule_busy:
            reason = "등록된 개인 일정과 겹칩니다"
        elif care_busy:
            reason = "같은 시간대에 다른 돌봄을 맡고 있습니다"
        else:
            reason = f"일정 충돌 없음 · 진행 중 돌봄 {care_count}건"
        ranked.append({
            "member_id": member["id"],
            "name": member["name"],
            "available": not busy,
            "reason": reason,
            "rank": (1 if busy else 0, care_count, member["name"]),
        })
    ranked.sort(key=lambda item: item["rank"])
    for index, item in enumerate(ranked, start=1):
        item["priority"] = index
        del item["rank"]
    return ranked


def find_schedule_collisions(db: Any, member_id: str, starts_at: str, ends_at: str) -> list[dict]:
    start = datetime.fromisoformat(starts_at)
    end = datetime.fromisoformat(ends_at)
    assignments = db.execute(
        """SELECT a.id AS assignment_id, i.title, i.starts_at FROM care_assignment a
           JOIN care_item i ON i.id = a.item_id WHERE a.assignee_id = ?
           AND a.status IN ('PROPOSED', 'ACCEPTED') AND i.starts_at IS NOT NULL""",
        (member_id,),
    ).fetchall()
    collisions = []
    for assignment in assignments:
        care_time = datetime.fromisoformat(assignment["starts_at"])
        if start <= care_time < end + timedelta(minutes=30):
            collisions.append(dict(assignment))
    return collisions
