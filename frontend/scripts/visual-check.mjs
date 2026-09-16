import { chromium } from 'playwright'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
const family = { id: 'demo-family', name: '데모 가족', plan: 'FREE' }
const owner = { id: 'mom', name: '지연', role: 'PARENT', status: 'ACTIVE', is_owner: 1 }
const children = []
const items = []
let joined = false
let photoUploaded = false
let photoRequests = 0
let chatSent = false
let voiceUploaded = false

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 840 }, permissions: ['microphone'] })
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    if (joined && !['/api/families', '/api/families/join'].includes(path) && request.headers().authorization !== 'Bearer qa-session') throw new Error(`${path}: 가족방 토큰 누락`)
    let body
    if (path === '/api/families' && method === 'POST') {
      const payload = request.postDataJSON()
      family.id = 'qa-family'; family.name = payload.name; owner.id = 'qa-owner'; owner.name = payload.owner_name; joined = true
      body = { family_id: family.id, member_id: owner.id, access_token: 'qa-session', invite_code: 'ABCDEFG234', invite_expires_at: new Date().toISOString(), plan: 'FREE' }
    } else if (path === '/api/families/me') body = { family, member: owner, authenticated: joined }
    else if (path === '/api/bootstrap') body = { family, members: [owner], children, items, schedules: [], assignments: [], exceptions: [], handoffs: [], notifications: [], permissions: [], notification_preferences: [] }
    else if (path === '/api/children' && method === 'POST') { const payload = request.postDataJSON(); children.push({ id: 'qa-child', ...payload }); body = children[0] }
    else if (path === '/api/families/invite-code/rotate') body = { invite_code: 'ABCDEFG234', invite_expires_at: new Date().toISOString() }
    else if (path === '/api/intakes/photo' && method === 'POST') {
      if (!request.headers()['content-type']?.startsWith('multipart/form-data; boundary=')) throw new Error('사진에 multipart boundary 누락')
      if (!request.postData()?.includes('source') || !request.postData()?.includes('ALBUM')) throw new Error('사진 source 누락')
      photoUploaded = true
      photoRequests++
      if (photoRequests === 1) items.push({ id: 'qa-item', intake_id: 'qa-intake', child_id: 'qa-child', item_type: 'SCHEDULE', title: '9월 20일 현장학습', detail: '9월 20일 현장학습', starts_at: null, confidence: 'LOW', status: 'NEEDS_REVIEW', created_at: new Date().toISOString() })
      body = { intake_id: 'qa-intake', items: photoRequests === 1 ? items : [], transcript: photoRequests === 1 ? '9월 20일 현장학습' : '안녕하세요. 좋은 하루 되세요.', requires_review: photoRequests === 1, ocr_used_today: photoRequests }
    } else if (path === '/api/assistant/history') body = { messages: [] }
    else if (path === '/api/assistant/chat' && method === 'POST') { chatSent = request.postDataJSON().message === '오늘 담당 배정은?'; body = { message: '오늘 담당 배정은?', answer: '서버 AI 답변', usage: { total_tokens: 30, used_today: 30 }, plan: 'FREE' } }
    else if (path === '/api/assistant/voice' && method === 'POST') { voiceUploaded = request.headers()['content-type']?.startsWith('multipart/form-data; boundary='); body = { transcript: '음성 질문', message: '음성 질문', answer: '음성 AI 답변', usage: { total_tokens: 35, used_today: 65 }, plan: 'FREE' } }
    else if (path === '/api/subscription') body = { plan: family.plan, status: family.plan === 'PRO' ? 'DEV_PREVIEW' : 'NOT_SUBSCRIBED', developer_preview: family.plan === 'PRO', dev_switch_available: joined }
    else if (path === '/api/dev/preview-plan' && method === 'POST') { family.plan = request.postDataJSON().plan; body = { plan: family.plan, status: family.plan === 'PRO' ? 'DEV_PREVIEW' : 'NOT_SUBSCRIBED', developer_preview: family.plan === 'PRO', dev_switch_available: true } }
    else if (path === '/api/plans') body = { plans: [{ id: 'FREE', status: 'AVAILABLE' }, { id: 'PRO', status: 'AVAILABLE' }] }
    else if (path === '/api/features') body = { plan: family.plan, features: [], usage: { chat_tokens_today: 0, ocr_today: 0 } }
    else throw new Error(`목업에 없는 API 호출: ${method} ${path}`)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.goto(process.env.LGDX_TEST_URL ?? 'http://127.0.0.1:5173', { waitUntil: 'networkidle' })
  await page.getByRole('textbox', { name: '가족방 이름' }).fill('QA 가족')
  await page.getByRole('textbox', { name: '내 이름' }).fill('지연')
  await page.getByRole('button', { name: '가족방 만들기' }).last().click()
  await page.getByText('ABCDEFG234').waitFor()
  await page.getByRole('textbox', { name: '아이 이름' }).fill('지우')
  await page.getByRole('textbox', { name: '아이 나이·학교' }).fill('7세')
  await page.getByRole('button', { name: '아이 등록', exact: true }).click()
  await page.getByText('지우', { exact: true }).first().waitFor()
  await page.locator('.screen-index').getByRole('button', { name: '알림장 등록' }).click()
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '사진 업로드', exact: true }).click()])
  await chooser.setFiles(join(process.cwd(), '..', 'asset', 'Group 21.png'))
  await page.getByRole('button', { name: '사진 분석하기' }).click()
  await page.getByText('원문 근거 · 9월 20일 현장학습').waitFor()
  await page.locator('.source-transcript summary').click()
  await page.locator('.source-transcript p').waitFor({ state: 'visible' })
  await page.locator('.screen-index').getByRole('button', { name: '알림장 등록' }).click()
  const [secondChooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '사진 업로드', exact: true }).click()])
  await secondChooser.setFiles(join(process.cwd(), '..', 'asset', 'Group 21.png'))
  await page.getByRole('button', { name: '사진 분석하기' }).click()
  await page.getByText('일정 관련 항목이 없어요').waitFor()
  await page.locator('.screen-index').getByRole('button', { name: 'AI 채팅' }).click()
  await page.getByRole('button', { name: '오늘 담당 배정은?' }).click()
  await page.getByText('서버 AI 답변').waitFor()
  if (await page.getByRole('button', { name: '음성 파일 선택' }).count()) throw new Error('음성 파일 선택 버튼이 남아 있어요')
  await page.getByRole('button', { name: '● 음성 녹음' }).click()
  await page.getByRole('button', { name: '■ 녹음 끝내고 보내기' }).waitFor()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: '■ 녹음 끝내고 보내기' }).click()
  await page.getByText('음성 AI 답변').waitFor()
  await page.locator('.screen-index').getByRole('button', { name: '플랜 비교' }).click()
  await page.getByText('서버 요금제: FREE').waitFor()
  await page.getByRole('button', { name: 'Pro', exact: true }).click()
  await page.getByText('서버 요금제: PRO').waitFor()
  await page.getByRole('button', { name: 'Free', exact: true }).click()
  await page.getByText('서버 요금제: FREE').waitFor()
  await page.screenshot({ path: join(tmpdir(), 'lgdx-connected-plan.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  if (await page.locator('.status-bar, .top-bar').count()) throw new Error('상단바가 남아 있어요')
  await page.locator('.bottom-nav button').first().click()
  if (await page.locator('.bottom-nav button.active').count() !== 1) throw new Error('하단바 선택 상태가 중복돼요')
  await page.locator('.bottom-nav button').nth(3).click()
  if (await page.locator('.bottom-nav button.active').count() !== 1) throw new Error('가족 탭 선택 상태가 잘못됐어요')
  if (await page.locator('.family-categories .menu-category').count() !== 6) throw new Error('메뉴 카테고리가 누락됐어요')
  await page.locator('.menu-category').nth(3).locator('summary').click()
  await page.getByRole('button', { name: '가족 설정' }).click()
  await page.getByRole('button', { name: '가족 케어로 돌아가기' }).waitFor()
  await page.getByRole('button', { name: '가족 케어로 돌아가기' }).click()
  await page.screenshot({ path: join(tmpdir(), 'lgdx-mobile-home.png'), fullPage: true })
  if (!photoUploaded || photoRequests !== 2 || !chatSent || !voiceUploaded) throw new Error('사진·채팅·음성 API 연동 누락')
  console.log('Connected UI passed: family session, child, multipart photo, AI chat/voice, server plan')
} finally { await browser.close() }
