"""Escalate unanswered care requests and stage Pro device alerts."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from .config import setting
from .db import database
from .performance import record_event


def _send_push(devices: list[dict], title: str, body: str, action_type: str, action_id: str) -> list[str]:
    from .push import send_push
    return send_push(devices, title, body, action_type, action_id)


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
        unassigned = db.execute(
            """SELECT i.id, i.family_id, i.title, c.name AS child_name, owner.id AS owner_id
               FROM care_item i
               JOIN child c ON c.id = i.child_id
               JOIN family_member owner ON owner.family_id = i.family_id
                 AND owner.is_owner = 1 AND owner.status = 'ACTIVE'
               WHERE i.child_schedule_id IS NOT NULL AND i.status != 'DONE'
                 AND TRIM(COALESCE(i.external_assignee_name, '')) = ''
                 AND i.starts_at >= ? AND i.starts_at <= ?
                 AND NOT EXISTS (
                   SELECT 1 FROM care_assignment a
                   WHERE a.item_id = i.id AND a.status IN ('ACCEPTED', 'COMPLETED')
                 )
                 AND NOT EXISTS (
                   SELECT 1 FROM notification n
                   WHERE n.family_id = i.family_id AND n.action_type = 'CARE_SUGGESTION'
                     AND n.action_id = i.id AND n.title = '담당자 배정이 필요해요'
                 )""",
            (current.isoformat(), (current + timedelta(hours=1)).isoformat()),
        ).fetchall()
        for item in unassigned:
            timestamp = current.isoformat()
            notification_id = str(uuid4())
            title = "담당자 배정이 필요해요"
            body = f"{item['child_name']} · {item['title']} 일정이 1시간 안에 시작하지만 담당자가 아직 없어요."
            db.execute(
                """INSERT INTO notification(id, family_id, member_id, title, body, level, is_read,
                   created_at, action_type, action_id) VALUES (?, ?, ?, ?, ?, 'IMPORTANT', 0, ?, 'CARE_SUGGESTION', ?)""",
                (notification_id, item["family_id"], item["owner_id"], title, body, timestamp, item["id"]),
            )
            record_event(
                db, "notification_sent", target_family_id=item["family_id"],
                target_member_id=item["owner_id"], correlation_id=notification_id,
                properties={"channel": "APP", "level": "IMPORTANT",
                            "action_type": "CARE_SUGGESTION", "reminder": "UNASSIGNED_ONE_HOUR"},
                occurred_at=timestamp,
            )
            devices = db.execute(
                """SELECT t.token, t.platform FROM push_device_token t
                   LEFT JOIN notification_preference p ON p.member_id = t.member_id
                   WHERE t.family_id = ? AND t.member_id = ? AND COALESCE(p.app_enabled, 1) = 1""",
                (item["family_id"], item["owner_id"]),
            ).fetchall()
            for token in _send_push([dict(device) for device in devices], title, body, "CARE_SUGGESTION", item["id"]):
                db.execute("DELETE FROM push_device_token WHERE token = ?", (token,))
            processed += 1
        overdue = db.execute(
            """SELECT a.id, a.family_id, a.assignee_id, i.title, c.name AS child_name,
                      assignee.name AS assignee_name, owner.id AS owner_id
                 FROM care_assignment a
                 JOIN care_item i ON i.id = a.item_id
                 LEFT JOIN child c ON c.id = i.child_id
                 JOIN family_member assignee ON assignee.id = a.assignee_id AND assignee.status = 'ACTIVE'
                 JOIN family_member owner ON owner.family_id = a.family_id
                   AND owner.is_owner = 1 AND owner.status = 'ACTIVE'
                WHERE a.status = 'ACCEPTED' AND i.status != 'DONE' AND i.starts_at IS NOT NULL
                  AND i.starts_at >= ? AND i.starts_at < ?
                  AND NOT EXISTS (
                    SELECT 1 FROM notification n
                     WHERE n.family_id = a.family_id AND n.action_id = a.id
                       AND n.title = '완료 체크가 필요해요'
                  )""",
            ((current - timedelta(days=1)).isoformat(), current.isoformat()),
        ).fetchall()
        for assignment in overdue:
            timestamp = current.isoformat()
            title = "완료 체크가 필요해요"
            child_name = assignment["child_name"] or "돌봄"
            recipients = [(
                assignment["assignee_id"],
                f"{child_name} · {assignment['title']} 예정 시간이 지났어요. 완료했다면 완료 체크해주세요.",
                "ASSIGNMENT_REQUEST",
            )]
            if assignment["owner_id"] != assignment["assignee_id"]:
                recipients.append((
                    assignment["owner_id"],
                    f"{child_name} · {assignment['title']} 일정의 완료 체크가 아직 없어요. 담당자 {assignment['assignee_name']}님에게 확인해주세요.",
                    "ASSIGNMENT_RESULT",
                ))
            for member_id, body, action_type in recipients:
                notification_id = str(uuid4())
                db.execute(
                    """INSERT INTO notification(id, family_id, member_id, title, body, level, is_read,
                       created_at, action_type, action_id) VALUES (?, ?, ?, ?, ?, 'IMPORTANT', 0, ?, ?, ?)""",
                    (notification_id, assignment["family_id"], member_id, title, body, timestamp,
                     action_type, assignment["id"]),
                )
                record_event(
                    db, "notification_sent", target_family_id=assignment["family_id"],
                    target_member_id=member_id, correlation_id=notification_id,
                    properties={"channel": "APP", "level": "IMPORTANT",
                                "action_type": action_type, "reminder": "COMPLETION_OVERDUE"},
                    occurred_at=timestamp,
                )
                devices = db.execute(
                    """SELECT t.token, t.platform FROM push_device_token t
                       LEFT JOIN notification_preference p ON p.member_id = t.member_id
                       WHERE t.family_id = ? AND t.member_id = ? AND COALESCE(p.app_enabled, 1) = 1""",
                    (assignment["family_id"], member_id),
                ).fetchall()
                for token in _send_push([dict(device) for device in devices], title, body,
                                        action_type, assignment["id"]):
                    db.execute("DELETE FROM push_device_token WHERE token = ?", (token,))
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
