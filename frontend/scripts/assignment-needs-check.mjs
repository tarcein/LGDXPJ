import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const startsAt = new Date(Date.now() + 86_400_000).toISOString()
const member = { id: 'mom', name: '엄마', role: 'PARENT', status: 'ACTIVE', is_owner: true }
const item = (id, extra = {}) => ({
  id, child_id: 'child', item_type: 'SCHEDULE', title: id, detail: '', starts_at: startsAt,
  confidence: 'HIGH', status: 'CONFIRMED', created_at: startsAt, ...extra,
})
const bootstrap = {
  family: { id: 'test-family', name: '테스트 가족', plan: 'PRO' }, members: [member],
  children: [{ id: 'child', name: '지우', age_label: '8세' }], schedules: [], child_schedules: [],
  items: [
    item('태권도 등원', { status: 'ASSIGNED', external_assignee_name: ' 태권도 차량 ' }),
    item('태권도 하원'),
    item('가족 담당', { status: 'ASSIGNED' }),
    item('응답 대기', { status: 'ASSIGNED' }),
    item('완료 일정', { status: 'DONE' }),
    item('검토 대기', { status: 'NEEDS_REVIEW' }),
  ],
  assignments: [
    { id: 'assigned', item_id: '가족 담당', assignee_id: 'mom', status: 'ACCEPTED' },
    { id: 'pending', item_id: '응답 대기', assignee_id: 'mom', status: 'PROPOSED' },
  ],
  exceptions: [], handoffs: [], notifications: [], permissions: [], notification_preferences: [],
}
const browser = await chromium.launch({ channel: process.env.LGDX_TEST_BROWSER ?? 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem('family-care-access-token', 'test-token')
    if (localStorage.getItem('family-care-last-screen') !== 'gap') localStorage.setItem('family-care-last-screen', 'assignments')
  })
  await page.route('**/api/**', async route => {
    const responses = {
      '/api/families/me': { family: bootstrap.family, member, authenticated: true },
      '/api/bootstrap': bootstrap,
      '/api/features': { plan: 'PRO', features: [], usage: {} },
      '/api/notifications': { notifications: [] },
      '/api/emergency-requests': { requests: [] },
      '/api/calendar-connections': { connections: [] },
      '/api/assistant/history': { messages: [] },
    }
    await route.fulfill({ json: responses[new URL(route.request().url()).pathname] ?? {} })
  })
  await page.goto(process.env.LGDX_TEST_URL ?? 'http://127.0.0.1:4173', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '전체 보기 ›', exact: true }).click()
  const needsTab = page.getByRole('tab', { name: /조율 필요/ })
  await needsTab.click()
  assert.equal(await needsTab.innerText(), '조율 필요 1')
  assert.deepEqual(await page.locator('.care-role-card.needs .care-role-card-title strong').allTextContents(), ['태권도 하원'])

  // Once the only missing boundary has an external caregiver, both views must be clear.
  bootstrap.items = bootstrap.items.slice(0, 2)
  bootstrap.items[1].external_assignee_name = '이웃 선생님'
  bootstrap.items[1].status = 'ASSIGNED'
  bootstrap.assignments = []
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '전체 보기 ›', exact: true }).click()
  await needsTab.click()
  assert.equal(await needsTab.innerText(), '조율 필요 0')
  await page.evaluate(() => localStorage.setItem('family-care-last-screen', 'gap'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: '예상되는 돌봄 공백이 없어요' }).waitFor()
  assert.deepEqual(errors, [])
  console.log('PASS: external caregivers excluded; unassigned boundary retained; gap prediction clear')
} finally {
  await browser.close()
}
