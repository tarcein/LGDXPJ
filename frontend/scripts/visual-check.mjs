import { chromium } from 'playwright'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
const family = { id: 'demo-family', name: '데모 가족', plan: 'FREE' }
const owner = { id: 'mom', name: '지연', role: 'PARENT', status: 'ACTIVE', is_owner: 1 }
const caregiver = { id: 'caregiver', name: '민수', role: 'CAREGIVER', status: 'ACTIVE', is_owner: 0 }
const children = []
const items = []
const childSchedules = []
const assignments = []
const albumPhotos = []
const handoffs = [{ id: 'qa-handoff', assignment_id: 'qa-assignment', from_member_id: owner.id, to_member_id: caregiver.id, briefing: '태권도 하원 후 집으로 이동', special_note: '', status: 'PENDING' }]
let joined = false
let photoUploaded = false
let photoRequests = 0
let chatSent = false
let voiceUploaded = false
let completionUploaded = false
let benefitLocation = { city: '', district: '', updated_at: '' }

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 840 }, permissions: ['microphone'] })
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const publicInvitePreview = path.startsWith('/api/families/invitations/')
    if (joined && !publicInvitePreview && !['/api/families', '/api/families/join'].includes(path) && request.headers().authorization !== 'Bearer qa-session') throw new Error(`${path}: 가족방 토큰 누락`)
    let body
    if (path === '/api/families' && method === 'POST') {
      const payload = request.postDataJSON()
      family.id = 'qa-family'; family.name = payload.name; owner.id = 'qa-owner'; owner.name = payload.owner_name; joined = true
      handoffs[0].from_member_id = owner.id
      body = { family_id: family.id, member_id: owner.id, access_token: 'qa-session', invite_code: 'ABCDEFG234', invite_expires_at: new Date().toISOString(), plan: 'FREE' }
    } else if (publicInvitePreview && method === 'GET') body = { family_name: family.name, owner_name: owner.name, expires_at: new Date(Date.now() + 86400000).toISOString() }
    else if (path === '/api/families/me') body = { family, member: owner, authenticated: joined }
    else if (path === '/api/bootstrap') body = { family, members: [owner, caregiver], children, items, schedules: [], child_schedules: childSchedules, assignments, exceptions: [], handoffs, notifications: [], permissions: [], notification_preferences: [] }
    else if (path === '/api/children' && method === 'POST') { const payload = request.postDataJSON(); children.push({ id: 'qa-child', ...payload }); childSchedules.push({ id: 'qa-calendar-event', child_id: 'qa-child', title: '태권도', category: 'ACADEMY', starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 3600000).toISOString(), source: 'MANUAL' }); items.push({ id: 'qa-calendar-care', child_id: 'qa-child', child_schedule_id: 'qa-calendar-event', item_type: 'SCHEDULE', title: '태권도', detail: '태권도 이동', starts_at: childSchedules[0].starts_at, confidence: 'HIGH', status: 'ASSIGNED', created_at: new Date().toISOString() }); assignments.push({ id: 'qa-assignment', item_id: 'qa-calendar-care', assignee_id: owner.id, status: 'ACCEPTED', source: 'ROLE_MATCH', note: '', completed_at: null }); body = children[0] }
    else if (path === '/api/families/invite-code/rotate') body = { invite_code: 'ABCDEFG234', invite_expires_at: new Date().toISOString() }
    else if (path === '/api/intakes/photo' && method === 'POST') {
      if (!request.headers()['content-type']?.startsWith('multipart/form-data; boundary=')) throw new Error('사진에 multipart boundary 누락')
      if (!request.postData()?.includes('source') || !request.postData()?.includes('ALBUM')) throw new Error('사진 source 누락')
      photoUploaded = true
      photoRequests++
      let extractedItems = []
      if (photoRequests === 1) { const extracted = { id: 'qa-item', intake_id: 'qa-intake', child_id: 'qa-child', item_type: 'SCHEDULE', title: '9월 20일 현장학습', detail: '9월 20일 현장학습', starts_at: null, confidence: 'LOW', status: 'NEEDS_REVIEW', created_at: new Date().toISOString() }; items.push(extracted); extractedItems = [extracted] }
      body = { intake_id: 'qa-intake', items: extractedItems, transcript: photoRequests === 1 ? '9월 20일 현장학습' : '안녕하세요. 좋은 하루 되세요.', requires_review: photoRequests === 1, ocr_used_today: photoRequests }
    } else if (path === '/api/assistant/history') body = { messages: [] }
    else if (path === '/api/assistant/chat' && method === 'POST') { chatSent = request.postDataJSON().message === '오늘 담당 배정은?'; body = { message: '오늘 담당 배정은?', answer: '서버 AI 답변', usage: { total_tokens: 30, used_today: 30 }, plan: 'FREE' } }
    else if (path === '/api/assistant/voice' && method === 'POST') { voiceUploaded = request.headers()['content-type']?.startsWith('multipart/form-data; boundary='); body = { transcript: '음성 질문', message: '음성 질문', answer: '음성 AI 답변', usage: { total_tokens: 35, used_today: 65 }, plan: 'FREE' } }
    else if (path === '/api/audio/transcribe' && method === 'POST') body = { text: '무릎에 작은 상처가 있어요', purpose: 'HANDOFF_NOTE' }
    else if (path === '/api/calendar-connections') body = { connections: [{ provider: 'google', configured: true, api_key_configured: true, connected: false, connected_at: null, synced_at: null }, { provider: 'microsoft', configured: true, api_key_configured: false, connected: false, connected_at: null, synced_at: null }] }
    else if (path === '/api/benefits/location' && method === 'GET') body = benefitLocation
    else if (path === '/api/benefits/location' && method === 'PATCH') { benefitLocation = { ...request.postDataJSON(), updated_at: new Date().toISOString() }; body = benefitLocation }
    else if (path === '/api/benefits/institutions' && method === 'GET') body = { institutions: [{ id: 'C0308', name: '서울 은평구 가족센터', city: '서울', district: '은평구', service_area: '', phone: '02-376-3752', direct_phone: '', address: '서울 은평구 은평로21가길 15-17', longitude: 126.9, latitude: 37.6, data_date: '20260413' }], location: { ...benefitLocation, label: `${benefitLocation.city} ${benefitLocation.district}` }, source: '아이돌봄 서비스 제공기관 현황' }
    else if (path === '/api/benefits/eligibility-criteria' && method === 'GET') body = { year: '2020', data_date: '20260413', household_income: [{ year: '2020', grade: '0001', median_percent: 75, household_size: 3, monthly_income: 2902933, data_date: '20260413' }, { year: '2020', grade: '0002', median_percent: 120, household_size: 3, monthly_income: 4644692, data_date: '20260413' }, { year: '2020', grade: '0003', median_percent: 150, household_size: 3, monthly_income: 5805865, data_date: '20260413' }], health_insurance: [{ year: '2020', income: 1837681, employee_premium: 61287, regional_premium: 14007, mixed_premium: 61683, data_date: '20260413' }], disclaimer: '공공데이터의 참고 기준이며 실제 지원 여부와 지원액은 공식 신청 심사를 통해 결정됩니다.', source: '아이돌봄 가구소득 및 건강보험료 기준' }
    else if (path === '/api/benefits' && method === 'GET') body = { programs: [{ id: 'care-benefit-1', name: '아이돌봄 지원', summary: '맞벌이 가정의 돌봄 공백을 지원해요.', category: '보육·교육', organization: '서울특별시 은평구', organization_type: '시군구', target: '돌봄이 필요한 양육 가정', content: '아이돌봄 서비스 비용 지원', criteria: '', deadline: '상시 신청', method: '정부24에서 온라인 신청', contact: '아이돌봄 상담센터', url: 'https://www.gov.kr', updated_at: '20260916', scope: 'DISTRICT', region: '서울특별시 은평구' }], keyword: '돌봄', location: { ...benefitLocation, label: `${benefitLocation.city} ${benefitLocation.district}` }, local_count: 1, national_count: 0, source: '보조금24' }
    else if (path === '/api/emergency-requests' && method === 'GET') body = { requests: [] }
    else if (path === '/api/child-schedules' && method === 'POST') { const payload = request.postDataJSON(); const schedule = { id: 'qa-child-schedule', source: 'MANUAL', ...payload }; childSchedules.push(schedule); items.push({ id: 'qa-schedule-care', child_id: payload.child_id, child_schedule_id: schedule.id, item_type: 'SCHEDULE', title: payload.title, detail: '등록한 아이 일정', starts_at: payload.starts_at, confidence: 'HIGH', status: 'CONFIRMED', created_at: new Date().toISOString() }); body = { ...schedule, care_item_id: 'qa-schedule-care', suggestions: [{ member_id: caregiver.id, name: caregiver.name, available: true, reason: '일정 충돌 없음 · 진행 중 돌봄 0건', priority: 1 }] } }
    else if (path === '/api/items/qa-schedule-care/suggestions' && method === 'GET') body = { item: items.find(item => item.id === 'qa-schedule-care'), suggestions: [{ member_id: caregiver.id, name: caregiver.name, available: true, reason: '일정 충돌 없음 · 진행 중 돌봄 0건', priority: 1 }], engine: 'CARE_SCHEDULE_AGENT' }
    else if (path === '/api/assignments' && method === 'POST') { const payload = request.postDataJSON(); const assignment = { id: 'qa-requested-assignment', item_id: payload.item_id, assignee_id: payload.assignee_id, status: 'PROPOSED', source: 'ROLE_MATCH', note: '', completed_at: null }; assignments.push(assignment); body = assignment }
    else if (path === '/api/assignments/qa-assignment/complete-handoff' && method === 'POST') { if (!request.postData()?.includes('무릎에 작은 상처') || !request.postData()?.includes('photo')) throw new Error('완료 인수인계의 메모 또는 사진 누락'); assignments[0].status = 'COMPLETED'; assignments[0].note = '무릎에 작은 상처가 있어요'; completionUploaded = true; const photo = { id: 'qa-completion-photo', child_id: 'qa-child', assignment_id: 'qa-assignment', kind: 'CARE_COMPLETION', file_name: 'done.png', mime_type: 'image/png', data_url: 'data:image/png;base64,iVBORw0KGgo=', caption: assignments[0].note, created_at: new Date().toISOString() }; albumPhotos.unshift(photo); body = { assignment: assignments[0], photo } }
    else if (path === '/api/album/photos' && method === 'GET') body = { photos: albumPhotos }
    else if (path === '/api/album/photos' && method === 'POST') { const photo = { id: 'qa-direct-photo-' + albumPhotos.length, child_id: null, assignment_id: null, kind: 'ALBUM', file_name: 'family.png', mime_type: 'image/png', data_url: 'data:image/png;base64,iVBORw0KGgo=', caption: '', created_at: new Date().toISOString() }; albumPhotos.unshift(photo); body = photo }
    else if (path.startsWith('/api/handoffs/') && path.endsWith('/acknowledge') && method === 'POST') { const handoff = handoffs.find(item => path.includes(item.id)); if (handoff) handoff.status = 'ACKNOWLEDGED'; body = handoff }
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
  const sharedInvite = await page.getByRole('textbox', { name: '가족방 초대 링크' }).inputValue()
  if (!sharedInvite.includes('invite=ABCDEFG234')) throw new Error('초대 링크에 초대코드가 없어요')
  if (!sharedInvite.includes('role=')) throw new Error('초대 링크에 가족 역할이 없어요')
  await page.getByRole('button', { name: '카카오톡 등으로 초대 링크 공유' }).waitFor()
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
  await page.screenshot({ path: join(tmpdir(), 'lgdx-connected-plan.png'), fullPage: true })
  for (const label of ['홈', '알림장·돌봄 정보', '추출 결과 확인', '오늘의 배정', '배정 제안', '오늘 할 일', '개인 일정', '예외 상황', '알림함', '온보딩', '캘린더 연동', '가족 구성원', '정보 공개 권한', '알림 설정', '플랜 비교', 'AI 채팅', '긴급 요청', '돌봄 동선', '돌봄 공백 예측', '패밀리 앨범', '돌봄 제도']) {
    await page.locator('.screen-index').getByRole('button', { name: label, exact: true }).click()
    await page.waitForTimeout(80)
    if (await page.locator('.loading').count()) throw new Error(`${label}: 화면이 로딩 상태에 머물렀어요`)
    if (await page.locator('.error-toast').count()) throw new Error(`${label}: 화면 진입 중 오류가 표시됐어요`)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  if (await page.locator('.app-header').count() !== 1 || await page.locator('.header-bell').count() !== 1 || await page.locator('.header-profile').count() !== 1) throw new Error('상단 알림·프로필이 없어요')
  const navLabels = await page.locator('.bottom-nav button').allTextContents()
  if (navLabels.map(text => text.trim()).join(',') !== '홈,케어,일정,가족,더보기') throw new Error('하단 5개 탭 구성이 달라요: ' + navLabels.join(','))
  if (await page.locator('.bottom-nav .nav-icon').count() !== 5) throw new Error('bar_asset 하단 아이콘이 모두 표시되지 않아요')
  await page.locator('.bottom-nav button').nth(2).click()
  await page.getByText('FAMILY CALENDAR').waitFor()
  const navColors = await page.locator('.bottom-nav button').evaluateAll(buttons => buttons.map(button => getComputedStyle(button).color))
  if (navColors[2] !== 'rgb(196, 18, 63)' || navColors.filter((_, index) => index !== 2).some(color => color !== 'rgb(159, 161, 163)')) throw new Error('하단 탭 활성/기본 색상이 달라요: ' + navColors.join(','))
  await page.locator('.month-day-events').getByText('태권도').waitFor()
  await page.screenshot({ path: join(tmpdir(), 'lgdx-mobile-schedule.png'), fullPage: true })
  await page.getByRole('button', { name: /일정 1개/ }).click()
  await page.getByText('선택한 날짜').waitFor()
  await page.locator('.schedule-day-sheet').getByText('태권도').waitFor()
  await page.screenshot({ path: join(tmpdir(), 'lgdx-mobile-schedule-day.png'), fullPage: true })
  await page.getByRole('button', { name: '선택한 날짜에 일정 추가' }).click()
  await page.getByRole('heading', { name: '누구의 일정인가요?' }).waitFor()
  await page.getByRole('button', { name: /아이 학원/ }).click()
  await page.getByRole('heading', { name: '아이 일정 등록' }).waitFor()
  const directTimes = page.locator('.direct-time input')
  if (await directTimes.nth(0).getAttribute('inputmode') !== 'numeric') throw new Error('시작 시간 직접 입력 키보드 설정이 없어요')
  await directTimes.nth(0).fill('930')
  await directTimes.nth(0).press('Tab')
  if (await directTimes.nth(0).inputValue() !== '09:30') throw new Error('930 시간이 09:30으로 정규화되지 않았어요')
  await directTimes.nth(1).fill('1030')
  await directTimes.nth(1).press('Tab')
  await page.getByRole('switch', { name: '매주 반복' }).click()
  await page.getByText('반복 종료일').waitFor()
  await page.screenshot({ path: join(tmpdir(), 'lgdx-mobile-schedule-form.png'), fullPage: true })
  await page.getByPlaceholder('예: 태권도, 방과후 미술').fill('주 3회 태권도')
  await page.getByRole('button', { name: '고정 루틴 일괄 등록' }).click()
  await page.getByText('CARE SCHEDULE AGENT · 배정 추천').waitFor()
  await page.getByRole('button', { name: '민수에게 요청' }).waitFor()
  if (await page.getByRole('button', { name: '지연에게 요청' }).count()) throw new Error('배정 추천에 요청자 본인이 표시돼요')
  await page.getByRole('button', { name: '민수에게 요청' }).click()
  await page.getByRole('heading', { name: '오늘의 배정' }).waitFor()
  await page.locator('.bottom-nav button').nth(1).click()
  await page.getByRole('button', { name: /내 돌봄·완료/ }).click()
  await page.getByRole('button', { name: '완료 체크' }).click()
  await page.getByRole('heading', { name: '특이사항이 있었나요?' }).waitFor()
  await page.getByPlaceholder(/수기로 입력/).fill('무릎에 작은 상처가 있어요')
  await page.getByRole('button', { name: '● 음성 녹음' }).click()
  await page.getByRole('button', { name: '■ 녹음 끝내기' }).waitFor()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '■ 녹음 끝내기' }).click()
  await page.getByRole('button', { name: '음성 인식 중…' }).waitFor()
  await page.getByPlaceholder(/수기로 입력/).waitFor()
  const [completionChooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '앨범에서 선택' }).click()])
  await completionChooser.setFiles(join(process.cwd(), '..', 'asset', 'Group 21.png'))
  await page.locator('.completion-preview').waitFor()
  await page.screenshot({ path: join(tmpdir(), 'lgdx-mobile-completion-handoff.png'), fullPage: true })
  await page.getByRole('button', { name: '완료하고 인수인계하기' }).click()
  await page.getByText('완료 기록과 인수인계를 가족에게 전했어요').waitFor()
  await page.locator('.bottom-nav button').nth(0).click()
  await page.locator('.app-header').waitFor({ state: 'visible' })
  const headerBox = await page.locator('.app-header').boundingBox()
  if (!headerBox || headerBox.y < 0 || headerBox.height < 50) throw new Error('홈 상단 알림·프로필 영역이 화면에서 보이지 않아요')
  await page.screenshot({ path: join(tmpdir(), 'lgdx-mobile-home.png'), fullPage: true })
  await page.locator('.floating-assistant').click()
  await page.getByText('무엇을 도와드릴까요?').waitFor()
  await page.locator('.bottom-nav button').nth(3).click()
  await page.locator('.hub-list').getByRole('button', { name: /가족 설정/ }).waitFor()
  await page.locator('.bottom-nav button').nth(4).click()
  await page.getByText('혜택·부가서비스').waitFor()
  await page.getByText('Free / Pro 화면 전환').waitFor()
  await page.getByRole('button', { name: /패밀리 앨범/ }).click()
  await page.getByText('무릎에 작은 상처가 있어요').waitFor()
  const [albumChooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('＋ 사진 선택').click()])
  await albumChooser.setFiles(join(process.cwd(), '..', 'asset', 'Group 21.png'))
  await page.locator('.album-grid button').nth(1).waitFor()
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.bottom-nav button').nth(4).click()
  await page.getByRole('button', { name: /패밀리 앨범/ }).click()
  if (await page.locator('.album-grid button').count() !== 2) throw new Error('새로고침 뒤 앨범 사진이 유지되지 않아요')
  await page.locator('.album-grid button').first().click()
  await page.getByRole('dialog', { name: '사진 크게 보기' }).waitFor()
  if (!await page.getByRole('link', { name: '사진 다운로드' }).getAttribute('download')) throw new Error('앨범 사진 다운로드가 없어요')
  await page.getByRole('button', { name: '사진 닫기' }).click()
  await page.screenshot({ path: join(tmpdir(), 'lgdx-mobile-album.png'), fullPage: true })
  await page.locator('.bottom-nav button').nth(4).click()
  if (await page.locator('.bottom-nav button.active').count() !== 1) throw new Error('하단바 선택 상태가 중복돼요')
  await page.getByRole('button', { name: /돌봄 제도 안내/ }).click()
  await page.getByRole('textbox', { name: '혜택 지역 시·도' }).fill('서울특별시')
  await page.getByRole('textbox', { name: '혜택 지역 시·군·구' }).fill('은평구')
  await page.getByRole('button', { name: '이 지역으로 찾기' }).click()
  await page.getByText('서울특별시 은평구 · 출처 보조금24 공공서비스 API').waitFor()
  await page.getByText('서울 은평구 가족센터').waitFor()
  await page.getByText('2020년 소득 기준').waitFor()
  await page.getByText('은평구 사업').waitFor()
  await page.getByRole('button', { name: /아이돌봄 지원/ }).click()
  await page.getByText('돌봄이 필요한 양육 가정').waitFor()
  await page.goBack()
  await page.getByText('혜택·부가서비스').waitFor()
  await page.getByRole('button', { name: '알림 설정' }).click()
  await page.getByRole('heading', { name: /조용하지만/ }).waitFor()
  await page.goBack()
  await page.getByText('혜택·부가서비스').waitFor()
  await page.screenshot({ path: join(tmpdir(), 'lgdx-mobile-more.png'), fullPage: true })
  if (!photoUploaded || photoRequests !== 2 || !chatSent || !voiceUploaded || !completionUploaded) throw new Error('사진·채팅·음성·완료 인수인계 API 연동 누락')
  await page.evaluate(() => sessionStorage.clear())
  await page.goto((process.env.LGDX_TEST_URL ?? 'http://127.0.0.1:5173') + '?invite=ABCDEFG234&role=GRANDPARENT', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '합류할게요' }).waitFor()
  await page.getByText('역할 — 조부모').waitFor()
  await page.getByRole('button', { name: '합류할게요' }).click()
  await page.getByRole('heading', { name: /내 기본 정보를/ }).waitFor()
  await page.getByRole('textbox', { name: '내 이름' }).fill('민정')
  await page.getByRole('button', { name: '다음' }).click()
  await page.getByRole('heading', { name: /조부모로/ }).waitFor()
  await page.getByText('인수인계와 특이사항').waitFor()
  await page.screenshot({ path: join(tmpdir(), 'lgdx-mobile-invite.png'), fullPage: true })
  console.log('Connected UI passed: family session, Android back history, recurring calendar flow, dual calendar config, invite onboarding, photo OCR, AI chat/voice, completion handoff, persistent album, region-aware benefits, server plan')
} finally { await browser.close() }
