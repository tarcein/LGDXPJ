"""Deterministic prototype logic; replace with reviewed AI integrations later."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

_SEOUL = ZoneInfo("Asia/Seoul")


def _extract_due_date(line: str, reference: datetime) -> str | None:
    """Pull an explicit '9월 25일' or '25일' due date out of a hand-typed note line.

    Without this, a supply/homework item typed today with no date of its own would
    otherwise be due "tomorrow" purely because that's when it happened to be typed in.
    """
    match = re.search(r"(\d{1,2})\s*월\s*(\d{1,2})\s*일", line)
    day_only = not match
    if not match:
        match = re.search(r"(\d{1,2})\s*일(?!주)", line)
        if not match:
            return None
    month = reference.month if day_only else int(match.group(1))
    day = int(match.group(1)) if day_only else int(match.group(2))
    year = reference.year
    try:
        due = datetime(year, month, day, tzinfo=reference.tzinfo)
    except ValueError:
        return None
    if due.date() < reference.date():
        if day_only:
            if month == 12:
                month, year = 1, year + 1
            else:
                month += 1
        else:
            year += 1
        try:
            due = datetime(year, month, day, tzinfo=reference.tzinfo)
        except ValueError:
            return None
    return due.isoformat()


def clean_intake_title(title: str) -> str:
    """Remove list markers and date/time metadata already stored in item fields."""
    cleaned = re.sub(r"^\s*(?:\d+\s*[.)]|[-•·])\s*", "", title)
    patterns = (
        r"\b\d{4}[./-]\d{1,2}[./-]\d{1,2}(?:\s*까지|\s*부터)?\b",
        r"(?:\d{4}년\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일(?:\s*까지|\s*부터)?",
        r"(?<!\d)\d{1,2}[./-]\d{1,2}(?:\s*까지|\s*부터)?(?!\d)",
        r"(?<!\d)\d{1,2}\s*일(?:\s*까지|\s*부터)",
        r"(?:오전|오후)\s*\d{1,2}(?::\d{2}|\s*시(?:\s*\d{1,2}분)?)?",
        r"(?<!\d)\d{1,2}\s*시(?:\s*\d{1,2}분)?",
        r"(?<!\d)\d{1,2}:\d{2}(?!\d)",
    )
    for pattern in patterns:
        cleaned = re.sub(pattern, " ", cleaned)
    cleaned = re.sub(r"^(?:준비물|숙제|과제|일정)\s*[:：-]\s*", "", cleaned)
    cleaned = re.sub(r"제출\s*하기\s*$", "제출", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,·~〜–—-/()[]:：")
    return cleaned or title.strip()


def _notice_lines(raw_content: str) -> list[str]:
    lines: list[str] = []
    for block in re.split(r"[\n。]+", raw_content):
        if not block.strip():
            continue
        # OCR often returns an entire numbered list on one line. Split only on
        # explicit list markers so dates such as "9월 27일" remain intact.
        parts = re.split(r"(?:^|\s)(?=\d+\s*[.)]\s*)", block.strip())
        lines.extend(part.strip(" -•\t") for part in parts if part.strip())
    return lines


def classify_lines(raw_content: str, reference: datetime | None = None) -> list[dict[str, str]]:
    lines = _notice_lines(raw_content)
    if not lines:
        return []
    reference = reference or datetime.now(_SEOUL)
    result = []
    for line in lines[:20]:
        if any(word in line for word in ("변경", "휴강", "지연", "취소")):
            item_type = "CHANGE"
        elif any(word in line for word in ("준비물", "챙기", "물품", "도시락")):
            item_type = "SUPPLY"
        elif any(word in line for word in ("숙제", "일기", "독서록", "문제집", "받아쓰기", "보고서")):
            item_type = "HOMEWORK"
        elif any(word in line for word in ("제출", "신청", "회신", "확인")):
            item_type = "TODO"
        else:
            item_type = "SCHEDULE" if re.search(r"\d{1,2}[:시]\d{0,2}", line) else "TODO"
        entry = {"item_type": item_type, "title": clean_intake_title(line)[:200], "confidence": "LOW"}
        if item_type in {"SUPPLY", "HOMEWORK"}:
            due = _extract_due_date(line, reference)
            if due:
                entry["starts_at"] = due
        result.append(entry)
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


def active_care_count(db: Any, member_id: str, starts_at: str | None,
                      target_child_id: str | None = None) -> tuple[int, bool, int]:
    assignments = db.execute(
        """SELECT i.starts_at, i.child_id FROM care_assignment a JOIN care_item i ON i.id = a.item_id
           WHERE a.assignee_id = ? AND a.status IN ('PROPOSED', 'CANDIDATE_ACCEPTED', 'ACCEPTED')""",
        (member_id,),
    ).fetchall()
    if not starts_at:
        return len(assignments), False, 0
    target = datetime.fromisoformat(starts_at)
    overlaps = False
    bundle_count = 0
    for assignment in assignments:
        if not assignment["starts_at"]:
            continue
        care_time = datetime.fromisoformat(assignment["starts_at"])
        if abs((care_time - target).total_seconds()) < 60 * 60:
            if target_child_id and assignment["child_id"] and assignment["child_id"] != target_child_id:
                bundle_count += 1
            else:
                overlaps = True
    return len(assignments), overlaps, bundle_count


def rank_members(db: Any, family_id: str, starts_at: str | None, exclude_member_id: str | None = None,
                 target_child_id: str | None = None) -> list[dict]:
    members = db.execute(
        "SELECT * FROM family_member WHERE family_id = ? AND status = 'ACTIVE'", (family_id,)
    ).fetchall()
    ranked = []
    for member in members:
        if member["id"] == exclude_member_id:
            continue
        schedule_busy = is_busy(db, member["id"], starts_at)
        care_count, care_busy, bundle_count = active_care_count(db, member["id"], starts_at, target_child_id)
        busy = schedule_busy or care_busy
        if schedule_busy:
            reason = "등록된 개인 일정과 겹칩니다"
        elif care_busy:
            reason = "같은 시간대에 다른 돌봄을 맡고 있습니다"
        elif bundle_count:
            reason = f"같은 시간대 아이 돌봄과 함께 가능 · 진행 중 돌봄 {care_count}건"
        else:
            reason = f"일정 충돌 없음 · 진행 중 돌봄 {care_count}건"
        ranked.append({
            "member_id": member["id"],
            "name": member["name"],
            "available": not busy,
            "reason": reason,
            "can_bundle_children": bool(bundle_count),
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
        """SELECT a.id AS assignment_id, a.item_id, a.assignee_id, i.child_id, i.title, i.starts_at FROM care_assignment a
           JOIN care_item i ON i.id = a.item_id WHERE a.assignee_id = ?
           AND a.status IN ('PROPOSED', 'CANDIDATE_ACCEPTED', 'ACCEPTED') AND i.starts_at IS NOT NULL""",
        (member_id,),
    ).fetchall()
    collisions = []
    for assignment in assignments:
        care_time = datetime.fromisoformat(assignment["starts_at"])
        if start <= care_time < end + timedelta(minutes=30):
            collisions.append(dict(assignment))
    return collisions
