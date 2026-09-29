import { chromium } from 'playwright'

const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true })
const page = await browser.newPage()
const notices = [{ id: 'old-alert', level: 'NORMAL', action_type: 'INFO', title: '기존 알림', body: '기준 알림' }]
let emergencies = [{ id: 'old-emergency', status: 'OPEN', item_title: '지난 긴급 요청', reason: '화면을 켜기 전 요청' }]
let tvOnline = true
let speechVolume = 100
let webPushRegistration = null
const webPushPublicKey = Buffer.from(Uint8Array.from({ length: 65 }, (_, index) => index === 0 ? 4 : 0)).toString('base64url')

try {
  await page.addInitScript(() => {
    window.__beepCount = 0
    window.__maxGain = 0
    window.__spoken = []
    class TestAudioContext {
      currentTime = 0
      destination = {}
      createOscillator() { return { type: 'sine', frequency: { value: 0 }, connect() { return this }, start() { window.__beepCount++ }, stop() {}, addEventListener(_name, callback) { callback() } } }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime(value) { window.__maxGain = Math.max(window.__maxGain, value) } }, connect() { return this } } }
      close() {}
    }
    window.AudioContext = TestAudioContext
    const TestSpeechSynthesisUtterance = class {
      constructor(text) { this.text = text; this.volume = 1 }
    }
    const testSpeechSynthesis = {
      cancel() {},
      getVoices() { return [] },
      speak(utterance) { window.__spoken.push({ text: utterance.text, volume: utterance.volume }) },
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: TestSpeechSynthesisUtterance })
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: testSpeechSynthesis })
    let notificationPermission = 'default'
    class TestNotification {
      static get permission() { return notificationPermission }
      static async requestPermission() { notificationPermission = 'granted'; return notificationPermission }
      close() {}
    }
    const subscription = {
      toJSON: () => ({ endpoint: 'https://push.example.test/zippy-device', keys: { p256dh: 'browser-public-key-value', auth: 'browser-auth-value' } }),
    }
    const registration = {
      update: async () => {},
      pushManager: {
        getSubscription: async () => null,
        subscribe: async options => { window.__pushKeyLength = options.applicationServerKey.byteLength; return subscription },
      },
    }
    Object.defineProperty(window, 'Notification', { configurable: true, value: TestNotification })
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class TestPushManager {} })
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      ready: Promise.resolve(registration),
      getRegistration: async () => registration,
      register: async () => registration,
    } })
  })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/device-alerts' && route.request().method() === 'PATCH') {
      const payload = route.request().postDataJSON()
      if (typeof payload.speech_volume === 'number') speechVolume = payload.speech_volume
    }
    if (path === '/api/push-tokens' && route.request().method() === 'POST') webPushRegistration = route.request().postDataJSON()
    const body = path === '/api/public-config'
      ? { kakao_javascript_key: '', web_push_public_key: webPushPublicKey }
      : path === '/api/families/me'
      ? { family: { id: 'qa-family', name: 'QA 가족', plan: 'PRO' }, member: { id: 'qa-member', name: 'QA', role: 'PARENT', status: 'ACTIVE', is_owner: 1 }, authenticated: true }
      : path === '/api/bootstrap'
        ? { family: { id: 'qa-family', name: 'QA 가족', plan: 'PRO' }, members: [{ id: 'qa-member', name: 'QA', role: 'PARENT', status: 'ACTIVE', is_owner: 1 }], children: [], items: [], schedules: [], child_schedules: [], assignments: [], exceptions: [], handoffs: [], notifications: notices, permissions: [], notification_preferences: [{ member_id: 'qa-member', device_enabled: true }] }
        : path === '/api/emergency-requests'
          ? { requests: emergencies }
          : path === '/api/device-alerts'
            ? { settings: { emergency_tv_sound: true, speech_volume: speechVolume, quiet_start: '00:00', quiet_end: '00:00', mute_during_naptime: true, devices: ['tv_living', 'water_purifier'], priority: ['tv_living', 'water_purifier'], content_matrix: { emergency_request: { tv: true, voice: true }, departure_reminder: { tv: true, voice: true }, supply_missing: { tv: true, voice: true } } }, catalog: [{ id: 'tv_living', name: '거실 TV', type: 'SCREEN', location: '거실' }, { id: 'water_purifier', name: '정수기', type: 'VOICE', location: '주방' }], content_keys: [{ id: 'emergency_request', label: '긴급 요청', locked: true }, { id: 'departure_reminder', label: '출발 알림', locked: false }, { id: 'supply_missing', label: '준비물', locked: false }], tv_online: tvOnline }
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
  await page.evaluate(() => { window.__maxGain = 0 })
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
  if (await page.evaluate(() => window.__maxGain < 0.2)) throw new Error('정수기 알림음이 충분히 크지 않습니다')
  speechVolume = 25
  const spokenCount = await page.evaluate(() => window.__spoken.length)
  notices.unshift({ id: 'low-volume-alert', level: 'IMPORTANT', action_type: 'DEVICE_ALERT_TEST', action_id: 'water_purifier', title: '낮은 음량 테스트', body: '설정 음량이 적용되어야 해요' })
  await page.waitForFunction(count => window.__spoken.length > count, spokenCount)
  const appliedVolume = await page.evaluate(() => window.__spoken.at(-1)?.volume)
  if (Math.abs(appliedVolume - Math.cbrt(0.25)) > 0.01) throw new Error('정수기 음량 설정이 적용되지 않습니다: ' + appliedVolume)
  const priorityBeepCount = await page.evaluate(() => window.__beepCount)
  tvOnline = true
  notices.unshift({ id: 'tv-priority-alert', level: 'IMPORTANT', action_type: 'DEVICE_ALERT_TEST', action_id: 'water_purifier', title: 'TV 우선 알림', body: '정수기에서 재생되면 안 돼요' })
  await page.waitForTimeout(2_500)
  if (await page.evaluate(count => window.__beepCount !== count, priorityBeepCount)) throw new Error('TV가 켜져 있는데 정수기 알림음이 재생됩니다')
  if (await page.getByText('“TV 우선 알림”').count()) throw new Error('TV 우선 알림이 정수기에서 표시됩니다')
  await page.evaluate(() => localStorage.setItem('family-care-access-token', 'qa-token'))
  await page.goto((process.env.LGDX_TEST_URL ?? 'http://127.0.0.1:5173') + '?screen=deviceAlerts', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '음성 · 방해 금지' }).click()
  const volumeSlider = page.locator('input[type="range"]')
  await volumeSlider.fill('36')
  await volumeSlider.dispatchEvent('pointerup')
  await page.waitForFunction(() => document.querySelector('input[type="range"]')?.value === '36')
  await page.getByRole('button', { name: '테스트 음성 듣기' }).click()
  const preview = await page.evaluate(() => window.__spoken.at(-1))
  if (!preview?.text.includes('민솔이 하원') || Math.abs(preview.volume - Math.cbrt(0.36)) > 0.01) throw new Error('미리듣기 음성 또는 음량이 올바르지 않습니다: ' + JSON.stringify(preview))
  await page.goto((process.env.LGDX_TEST_URL ?? 'http://127.0.0.1:5173') + '?screen=settings', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '알림 연결' }).click()
  await page.getByRole('button', { name: '연결됨' }).waitFor()
  if (await page.evaluate(() => window.__pushKeyLength) !== 65) throw new Error('Web Push 공개키가 브라우저 구독에 전달되지 않았습니다')
  if (webPushRegistration?.platform !== 'WEB' || !JSON.parse(webPushRegistration.token).endpoint) throw new Error('Web Push 구독 정보가 서버에 등록되지 않았습니다')
  await page.goto((process.env.LGDX_TEST_URL ?? 'http://127.0.0.1:5173') + '?screen=notifications&action_type=EMERGENCY_REQUEST&action_id=old-emergency', { waitUntil: 'domcontentloaded' })
  await page.locator('.emergency-request-page').waitFor()
  if (new URL(page.url()).searchParams.has('action_type')) throw new Error('처리한 푸시 이동 정보가 URL에 남아 있습니다')
  console.log('TV, voice appliance, and PWA Web Push checks passed')
} finally {
  await browser.close()
}
