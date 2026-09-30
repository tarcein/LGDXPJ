import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import { careTimeState } from '../src/careTimeline.ts'

const time = '2026-09-30T14:00:00+09:00'
const start = Date.parse(time)
const cutoff = start + 30 * 60_000

test('care event stops being active at exactly 30 minutes', () => {
  assert.equal(careTimeState(time, start - 1), 'future')
  assert.equal(careTimeState(time, start), 'active')
  assert.equal(careTimeState(time, cutoff - 1), 'active')
  assert.equal(careTimeState(time, cutoff), 'elapsed')
  assert.equal(careTimeState(time, cutoff + 60 * 60_000), 'elapsed')
  for (const invalid of [null, undefined, '', 'invalid']) {
    assert.equal(careTimeState(invalid, cutoff), 'future')
  }
})

test('home rows expire for any caregiver without fabricating completion', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const source = app.slice(app.indexOf('  const homeEvents ='), app.indexOf('  const visibleNotices ='))
  const homeEventRows = [
    { time, completed: false, hasConfirmedCaregiver: true },
    { time, completed: false, hasConfirmedCaregiver: false },
    { time, completed: true, hasConfirmedCaregiver: true },
  ]
  const render = timelineNow => runInNewContext(source + '\nhomeEvents', { careTimeState, homeEventRows, timelineNow })
  assert.equal(render(cutoff - 1)[0].active, true)
  const rows = render(cutoff)
  for (const row of rows.slice(0, 2)) {
    assert.equal(row.active, false)
    assert.equal(row.elapsed, true)
    assert.equal(row.completed, false)
  }
  assert.equal(rows[2].completed, true)
  assert.equal(rows[2].elapsed, false)
})
