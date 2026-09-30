import { devices, webkit } from 'playwright'

const baseUrl = process.env.LGDX_TEST_URL ?? 'http://127.0.0.1:4173'
const now = new Date()
const isoAt = offset => new Date(now.getTime() + offset * 60_000).toISOString()
const members = [
  { id: 'mom', name: '홍옥순', role: 'PARENT', status: 'ACTIVE', is_owner: true, is_online: true },
  { id: 'dad', name: '김보호', role: 'PARENT', status: 'ACTIVE', is_owner: false, is_online: true },
  { id: 'grandma', name: '이돌봄', role: 'GRANDPARENT', status: 'ACTIVE', is_owner: false, is_online: false },
]
const children = [
  { id: 'child-1', name: '민솔', age_label: '8세' },
  { id: 'child-2', name: '민준', age_label: '6세' },
]
const schedules = Array.from({ length: 350 }, (_, index) => ({
  id: `schedule-${index}`, member_id: members[index % members.length].id, title: `개인 일정 ${index}`,
  starts_at: isoAt(index * 30 - 10_000), ends_at: isoAt(index * 30 - 9_970), has_end_time: 1,
  kind: index % 3 ? 'ROUTINE' : 'WORK', external_source: null,
}))
const childSchedules = Array.from({ length: 544 }, (_, index) => ({
  id: `child-schedule-${index}`, child_id: children[index % 2].id, title: `아이 일정 ${index}`, category: 'AFTER_SCHOOL',
  starts_at: isoAt(index * 20 - 8_000), ends_at: isoAt(index * 20 - 7_940), has_end_time: 1,
  location_name: `장소 ${index % 20}`, merge_same_location: 1, source: 'MANUAL',
}))
const items = Array.from({ length: 953 }, (_, index) => ({
  id: `item-${index}`, intake_id: null, child_id: children[index % 2].id,
  child_schedule_id: index < childSchedules.length ? childSchedules[index].id : null,
  item_type: index % 11 === 0 ? 'SUPPLY' : index % 13 === 0 ? 'HOMEWORK' : 'SCHEDULE',
  title: `돌봄 항목 ${index}`, detail: `상세 내용 ${index}`, starts_at: isoAt(index * 15 - 6_000),
  confidence: 'HIGH', boundary_type: index % 2 ? 'START' : 'END', status: 'CONFIRMED', created_at: isoAt(-index),
}))
const assignments = Array.from({ length: 459 }, (_, index) => ({
  id: `assignment-${index}`, item_id: items[index].id, assignee_id: members[index % members.length].id,
  status: 'ACCEPTED', source: 'ROLE_MATCH', note: '', completed_at: null,
}))
const notifications = Array.from({ length: 100 }, (_, index) => ({
  id: `notice-${index}`, title: `알림 ${index}`, body: '', level: 'INFO', member_id: 'mom',
  is_read: 1, created_at: isoAt(-index), action_type: null, action_id: null,
}))
const bootstrap = {
  family: { id: 'ios-qa-family', name: '아이폰 테스트 가족', plan: 'FREE' }, members, children, schedules,
  child_schedules: childSchedules, items, assignments, exceptions: [], handoffs: [], notifications, permissions: [],
  notification_preferences: [{ member_id: 'mom', app_enabled: 0, daily_digest_enabled: 1, device_enabled: 0 }],
}

const browser = await webkit.launch({ headless: true })
const context = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' })
const page = await context.newPage()
const requests = new Map()
const pageErrors = []
const consoleErrors = []
let crashed = false

page.on('crash', () => { crashed = true })
page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })

const mockApi = async (route, track = true) => {
  const request = route.request()
  const path = new URL(request.url()).pathname
  if (track) requests.set(path, (requests.get(path) ?? 0) + 1)
  let body
  if (path === '/api/public-config') body = { kakao_javascript_key: '', web_push_public_key: '' }
  else if (path === '/api/families/me') body = { family: bootstrap.family, member: members[0], authenticated: true }
  else if (path === '/api/bootstrap') body = bootstrap
  else if (path === '/api/assistant/history') body = { messages: [] }
  else if (path === '/api/assistant/chat') body = {
    message: request.postDataJSON().message, answer: '아이폰 입력 테스트 답변', cards: [], links: [],
    schedule_changes: [], schedule_creations: [], schedule_deletions: [], care_item_creations: [],
    usage: { total_tokens: 20, used_today: 20, limit: 50_000, remaining: 49_980 }, plan: 'FREE',
  }
  else if (path === '/api/features') body = { plan: 'FREE', features: [], usage: { chat_tokens_today: 0, chat_tokens_limit: 50_000, chat_tokens_remaining: 50_000, ocr_today: 0 } }
  else if (path === '/api/notifications') body = { notifications }
  else if (path === '/api/emergency-requests') body = { requests: [] }
  else if (path === '/api/performance/events') body = { status: 'recorded' }
  else body = {}
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
}

await page.addInitScript(() => {
  localStorage.setItem('family-care-access-token', 'ios-qa-token')
  localStorage.setItem('family-care-last-screen', 'chat')
  sessionStorage.setItem('__iosQaLoads', String(Number(sessionStorage.getItem('__iosQaLoads') ?? 0) + 1))
})

await page.route('**/api/**', route => mockApi(route))

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  const input = page.getByRole('textbox', { name: '케어 어시스턴트에게 질문' })
  await input.waitFor()

  const fontSize = await input.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))
  if (fontSize < 16) throw new Error(`iPhone 입력 확대 위험: 입력 글자 크기 ${fontSize}px`)

  const sample = '홍옥순이 오늘 늘봄교실 하원을 못 갈 것 같아요. 가능한 대안을 추천해줘. '
  const timings = []
  for (let round = 0; round < 8; round += 1) {
    await input.fill('')
    const startedAt = performance.now()
    await input.pressSequentially(sample.repeat(2))
    timings.push(performance.now() - startedAt)
    if (await input.inputValue() !== sample.repeat(2)) throw new Error(`입력 누락 발생: ${round + 1}회차`)
  }

  const millisecondsPerCharacter = timings.reduce((sum, value) => sum + value, 0) / timings.length / (sample.length * 2)
  if (millisecondsPerCharacter > 15) throw new Error(`입력 지연 과다: 글자당 ${millisecondsPerCharacter.toFixed(1)}ms`)

  const initialBootstrapCalls = requests.get('/api/bootstrap') ?? 0
  await page.waitForTimeout(31_000)
  const pollCalls = requests.get('/api/notifications') ?? 0
  if (pollCalls < 2) {
    const browserState = await page.evaluate(() => ({ visibility: document.visibilityState, online: navigator.onLine }))
    throw new Error(`경량 알림 폴링이 동작하지 않음: ${JSON.stringify({ pollCalls, browserState, requests: Object.fromEntries(requests) })}`)
  }
  if ((requests.get('/api/bootstrap') ?? 0) !== initialBootstrapCalls) throw new Error('입력 중 전체 bootstrap 재조회 발생')

  await input.blur()
  await page.evaluate(() => {
    window.__iosQaRealDateNow = Date.now
    Date.now = () => window.__iosQaRealDateNow() + 6 * 60_000
  })
  await page.waitForTimeout(16_000)
  await page.evaluate(() => { Date.now = window.__iosQaRealDateNow })
  if ((requests.get('/api/bootstrap') ?? 0) !== initialBootstrapCalls + 1) throw new Error('유휴 상태의 5분 전체 동기화가 정확히 한 번 실행되지 않음')
  if (await input.inputValue() !== sample.repeat(2)) throw new Error('전체 동기화 뒤 작성 중인 채팅이 사라짐')
  await input.press('Enter')
  await page.getByText('아이폰 입력 테스트 답변').waitFor()
  if (await input.inputValue()) throw new Error('채팅 전송 뒤 입력창이 초기화되지 않음')

  const serviceWorkerContext = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'allow' })
  const serviceWorkerPage = await serviceWorkerContext.newPage()
  await serviceWorkerPage.route('**/api/**', route => mockApi(route, false))
  await serviceWorkerPage.goto(baseUrl, { waitUntil: 'networkidle' })
  await serviceWorkerPage.reload({ waitUntil: 'networkidle' })
  const serviceWorker = await serviceWorkerPage.evaluate(async () => {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise(resolve => setTimeout(() => resolve(null), 5_000)),
    ])
    const entryScript = document.querySelector('script[type="module"]')?.getAttribute('src') ?? ''
    const cacheNames = await caches.keys()
    const cachedUrls = (await Promise.all(cacheNames.map(async name => (await caches.open(name)).keys()))).flat().map(request => new URL(request.url).pathname)
    return { ready: !!registration, controlled: !!navigator.serviceWorker.controller, caches: cacheNames, entryScript, entryCached: !!entryScript && !!await caches.match(entryScript), cachedUrls }
  })
  await serviceWorkerContext.close()
  if (!serviceWorker.ready || !serviceWorker.controlled || !serviceWorker.caches.includes('zippy-pwa-v5') || !serviceWorker.entryCached || !serviceWorker.cachedUrls.some(url => /\/assets\/App-.*\.js$/.test(url))) throw new Error(`PWA 서비스워커 준비 실패: ${JSON.stringify(serviceWorker)}`)

  const loads = await page.evaluate(() => Number(sessionStorage.getItem('__iosQaLoads') ?? 0))
  if (loads !== 1 || crashed) throw new Error(`예기치 않은 페이지 재시작: loads=${loads}, crashed=${crashed}`)
  if (pageErrors.length || consoleErrors.length) throw new Error(`브라우저 오류: ${JSON.stringify({ pageErrors, consoleErrors })}`)

  console.log(JSON.stringify({
    result: 'PASS', engine: 'Playwright WebKit', device: 'iPhone 13', dataRows: schedules.length + childSchedules.length + items.length + assignments.length + notifications.length,
    typingMillisecondsPerCharacter: Number(millisecondsPerCharacter.toFixed(2)), notificationPolls: pollCalls,
    bootstrapCalls: requests.get('/api/bootstrap') ?? 0, pageLoads: loads, serviceWorker,
  }, null, 2))
} finally {
  await browser.close()
}
