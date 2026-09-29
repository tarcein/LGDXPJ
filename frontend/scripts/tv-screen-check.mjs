import { chromium } from 'playwright'

const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true })
const page = await browser.newPage()
const notices = [{ id: 'old-alert', level: 'NORMAL', action_type: 'INFO', title: '기존 알림', body: '기준 알림' }]
let emergencies = [{ id: 'old-emergency', status: 'OPEN', item_title: '지난 긴급 요청', reason: '화면을 켜기 전 요청' }]
let tvOnline = true

try {
  await page.addInitScript(() => {
    window.__beepCount = 0
    class TestAudioContext {
      currentTime = 0
      destination = {}
      createOscillator() { return { type: 'sine', frequency: { value: 0 }, connect() { return this }, start() { window.__beepCount++ }, stop() {}, addEventListener(_name, callback) { callback() } } }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this } } }
      close() {}
    }
    window.AudioContext = TestAudioContext
  })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const body = path === '/api/families/me'
      ? { family: { id: 'qa-family', name: 'QA 가족', plan: 'PRO' }, member: { id: 'qa-member', name: 'QA', role: 'PARENT', status: 'ACTIVE', is_owner: 1 }, authenticated: true }
      : path === '/api/bootstrap'
        ? { family: {}, members: [], children: [], items: [], schedules: [], child_schedules: [], assignments: [], exceptions: [], handoffs: [], notifications: notices, permissions: [], notification_preferences: [{ member_id: 'qa-member', device_enabled: true }] }
        : path === '/api/emergency-requests'
          ? { requests: emergencies }
          : path === '/api/device-alerts'
            ? { settings: { emergency_tv_sound: true, speech_volume: 100, quiet_start: '00:00', quiet_end: '00:00', devices: ['tv_living', 'water_purifier'], priority: ['tv_living', 'water_purifier'], content_matrix: { emergency_request: { tv: true, voice: true }, departure_reminder: { tv: true, voice: true }, supply_missing: { tv: true, voice: true } } }, catalog: [{ id: 'tv_living', name: '거실 TV', type: 'SCREEN', location: '거실' }, { id: 'water_purifier', name: '정수기', type: 'VOICE', location: '주방' }], tv_online: tvOnline }
            : { status: 'ok' }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })

  await page.goto((process.env.LGDX_TEST_URL ?? 'http://127.0.0.1:5173') + '?screen=tv', { waitUntil: 'domcontentloaded' })
  const toggle = page.getByRole('switch', { name: 'TV 화면' })
  await toggle.evaluate(button => button.click())
  await page.locator('.tv-display.tv-screen-off').waitFor()
  const off = await page.locator('.tv-display').evaluate(element => ({
    background: getComputedStyle(element).backgroundColor,
    videoHidden: getComputedStyle(element.querySelector('.tv-broadcast')).visibility === 'hidden',
    videoPaused: element.querySelector('video').paused,
  }))
  if (off.background !== 'rgb(0, 0, 0)' || !off.videoHidden || !off.videoPaused) throw new Error('TV 꺼짐 상태가 검은 화면이 아닙니다: ' + JSON.stringify(off))
  await toggle.evaluate(button => button.click())
  await page.locator('.tv-display.tv-screen-off').waitFor({ state: 'detached' })
  await page.waitForTimeout(2_500)
  await page.getByRole('button', { name: '시연 시작' }).click()
  if (await page.getByRole('heading', { name: /지난 긴급 요청/ }).count()) throw new Error('TV가 꺼져 있을 때 발생한 긴급 요청이 표시됩니다')
  const emergencyBeepCount = await page.evaluate(() => window.__beepCount)
  emergencies = [{ id: 'new-emergency', status: 'OPEN', item_title: '새 긴급 테스트', reason: '즉시 확인이 필요해요' }, ...emergencies]
  await page.getByRole('heading', { name: /새 긴급 테스트/ }).waitFor({ timeout: 5_000 })
  await page.waitForFunction(count => window.__beepCount > count, emergencyBeepCount)
  emergencies = emergencies.filter(request => request.id !== 'new-emergency')
  await page.getByRole('heading', { name: /새 긴급 테스트/ }).waitFor({ state: 'hidden', timeout: 5_000 })
  const beepCount = await page.evaluate(() => window.__beepCount)
  notices.unshift({ id: 'tv-alert', level: 'IMPORTANT', action_type: 'DEVICE_ALERT_TEST', action_id: 'tv_living', title: '테스트 알림', body: '자동으로 닫혀야 해요' })
  await page.getByRole('heading', { name: '테스트 알림' }).waitFor({ timeout: 5_000 })
  await page.waitForFunction(count => window.__beepCount > count, beepCount)
  await page.getByRole('heading', { name: '테스트 알림' }).waitFor({ state: 'hidden', timeout: 15_000 })
  await page.waitForTimeout(2_500)
  if (await page.getByRole('heading', { name: '테스트 알림' }).count()) throw new Error('자동으로 닫힌 TV 알림이 다시 표시됩니다')
  tvOnline = false
  await page.goto((process.env.LGDX_TEST_URL ?? 'http://127.0.0.1:5173') + '?screen=voice', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '정수기' }).waitFor()
  await page.waitForTimeout(2_500)
  const voiceBeepCount = await page.evaluate(() => window.__beepCount)
  notices.unshift({ id: 'queued-voice-alert', level: 'IMPORTANT', action_type: 'DEVICE_ALERT_TEST', action_id: 'water_purifier', title: '꺼져 있을 때 알림', body: '재생되면 안 돼요' })
  await page.waitForTimeout(2_500)
  await page.getByRole('button', { name: '시연 시작 (소리 재생 허용)' }).click()
  await page.waitForFunction(count => window.__beepCount > count, voiceBeepCount)
  const startedBeepCount = await page.evaluate(() => window.__beepCount)
  await page.waitForTimeout(500)
  if (await page.getByText('“꺼져 있을 때 알림”').count()) throw new Error('정수기가 꺼져 있을 때 받은 알림을 재생합니다')
  notices.unshift({ id: 'live-voice-alert', level: 'IMPORTANT', action_type: 'DEVICE_ALERT_TEST', action_id: 'water_purifier', title: '켜진 뒤 테스트 알림', body: '지금 재생되어야 해요' })
  await page.waitForFunction(count => window.__beepCount > count, startedBeepCount)
  await page.getByText('“켜진 뒤 테스트 알림”').waitFor()
  console.log('TV and voice appliance alert checks passed')
} finally {
  await browser.close()
}
