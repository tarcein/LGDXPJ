"""Escalate unanswered care requests and stage Pro device alerts."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from .config import setting
from .db import database
from .performance import record_event


def process_assignment_reminders(reference_time: datetime | None = None) -> int:
    current = reference_time or datetime.now(ZoneInfo("Asia/Seoul"))
    cutoff = (current - timedelta(minutes=15)).isoformat()
    processed = 0
    with database() as db:
        pending = db.execute(
            """SELECT a.id, a.family_id, a.assignee_id, i.title, f.plan
               FROM care_assignment a
               JOIN care_item i ON i.id = a.item_id
               JOIN family_group f ON f.id = a.family_id
               WHERE a.status = 'PROPOSED' AND a.reminder_sent_at IS NULL AND a.created_at <= ?""",
            (cutoff,),
        ).fetchall()
        for assignment in pending:
            timestamp = current.isoformat()
            notification_id = str(uuid4())
            db.execute(
                """INSERT INTO notification(id, family_id, member_id, title, body, level, is_read,
                   created_at, action_type, action_id) VALUES (?, ?, ?, ?, ?, 'IMPORTANT', 0, ?, 'ASSIGNMENT_REQUEST', ?)""",
                (notification_id, assignment["family_id"], assignment["assignee_id"], "돌봄 요청을 확인해주세요",
                 f"{assignment['title']} 담당 요청에 응답이 필요해요.", timestamp, assignment["id"]),
            )
            record_event(
                db, "notification_sent", target_family_id=assignment["family_id"],
                target_member_id=assignment["assignee_id"], correlation_id=notification_id,
                properties={"channel": "APP", "level": "IMPORTANT",
                            "action_type": "ASSIGNMENT_REQUEST", "reminder": True},
                occurred_at=timestamp,
            )
            if assignment["plan"] == "PRO":
                outbox_id = str(uuid4())
                db.execute(
                    """INSERT INTO device_alert_outbox(id, family_id, member_id, assignment_id,
                       title, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'NOT_CONNECTED', ?)""",
                    (outbox_id, assignment["family_id"], assignment["assignee_id"], assignment["id"],
                     "돌봄 요청 알림", assignment["title"], timestamp),
                )
                record_event(
                    db, "device_alert_used", target_family_id=assignment["family_id"],
                    target_member_id=assignment["assignee_id"], correlation_id=outbox_id,
                    properties={"status": "NOT_CONNECTED", "trigger": "ASSIGNMENT_REMINDER"},
                    occurred_at=timestamp,
                )
            db.execute("UPDATE care_assignment SET reminder_sent_at = ? WHERE id = ?", (timestamp, assignment["id"]))
            processed += 1
    return processed


async def run_assignment_reminder_loop() -> None:
    interval = max(30, int(setting("LGDX_ASSIGNMENT_REMINDER_INTERVAL_SECONDS", "60")))
    while True:
        try:
            await asyncio.to_thread(process_assignment_reminders)
        except Exception:
            pass
        await asyncio.sleep(interval)
