import type { Schedule } from './api'

// Match the backend's care-time check, including its 30-minute buffer.
export function conflictingSchedules(schedules: Schedule[], assigneeId?: string, careStartsAt?: string | null): Schedule[] {
  if (!assigneeId || !careStartsAt) return []
  const careTime = Date.parse(careStartsAt)
  return schedules.filter(schedule => schedule.member_id === assigneeId
    && Date.parse(schedule.starts_at) <= careTime
    && careTime < Date.parse(schedule.ends_at) + 30 * 60_000)
    .sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at))
}
