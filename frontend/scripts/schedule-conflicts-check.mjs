import assert from 'node:assert/strict'
import test from 'node:test'
import { conflictingSchedules } from '../src/scheduleConflicts.ts'

test('shows only this caregiver’s overlapping events, keeping API-redacted titles', () => {
  const event = { id: 'meeting', member_id: 'mom', title: '친구 약속', starts_at: '2026-10-08T09:30:00Z', ends_at: '2026-10-08T10:30:00Z' }
  const hidden = { ...event, id: 'hidden', title: '바쁨' }
  const schedules = [event, hidden,
    { ...event, id: 'other-person', member_id: 'dad' },
    { ...event, id: 'other-day', starts_at: '2026-09-30T18:30:00+09:00', ends_at: '2026-09-30T19:30:00+09:00' },
    { ...event, id: 'later', starts_at: '2026-10-08T20:00:00+09:00', ends_at: '2026-10-08T21:00:00+09:00' },
  ]
  assert.deepEqual(conflictingSchedules(schedules, 'mom', '2026-10-08T18:30:00+09:00'), [event, hidden])
  assert.deepEqual(conflictingSchedules(schedules, 'mom', '2026-10-08T19:45:00+09:00'), [event, hidden])
  assert.deepEqual(conflictingSchedules([event], 'mom', '2026-10-08T20:00:00+09:00'), [])
  assert.deepEqual(conflictingSchedules(schedules, 'mom', null), [])
})
