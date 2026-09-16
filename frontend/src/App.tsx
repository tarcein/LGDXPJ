import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api, send, upload, setFamilyToken, hasFamilyToken, ApiError, formatDate, formatTime, type Assignment, type Bootstrap, type CareItem, type Screen, type Suggestion, type FamilyMe, type FamilySession, type ChatAnswer, type EmergencyRequest } from './api'
import familyIcon from '../../asset/Group 21.png'
import floatingIcon from '../../asset/floating.png'
import homeIcon from '../../asset/Group 11.png'
import deviceIcon from '../../asset/Group 5.png'
import careIcon from '../../asset/Group 7.png'
import voiceIcon from '../../asset/voice.png'
import googleIcon from '../../asset/google.png'
import outlookIcon from '../../asset/outlook.png'

const groups: { title: string; pages: [Screen, string][] }[] = [
  { title: 'ThinQ 영역 · 화면 목업', pages: [['thinqHome', 'ThinQ 홈'], ['thinqDevice', '디바이스'], ['thinqCare', '케어'], ['thinqMenu', '메뉴']] },
  { title: '핵심 화면', pages: [['home', '홈 대시보드'], ['family', 'Family Inbox'], ['capture', '알림장 등록'], ['review', '추출 결과 확인'], ['assignments', '오늘의 배정'], ['suggestion', '배정 제안'], ['tasks', '오늘 할 일']] },
  { title: '돌봄 흐름', pages: [['schedule', '개인 일정'], ['exception', '예외 상황'], ['handoff', '인수인계'], ['notifications', '알림함']] },
  { title: '가족 · 설정', pages: [['onboarding', '온보딩'], ['calendar', '캘린더 연동'], ['members', '가족 구성원'], ['permissions', '정보 공개 권한'], ['settings', '알림 설정'], ['plan', '플랜 비교']] },
  { title: '확장 화면', pages: [['chat', 'AI 채팅'], ['emergency', '긴급 요청'], ['location', '돌봄 동선'], ['gap', '돌봄 공백 예측'], ['album', '패밀리 앨범'], ['programs', '돌봄 제도']] },
]
const familyCategories: { title: string; pages: [Screen, string][] }[] = [
  { title: '돌봄', pages: [['capture', '알림장 등록'], ['chat', '케어 어시스턴트'], ['exception', '예외 상황'], ['handoff', '돌봄 인수인계'], ['location', '돌봄 동선'], ['emergency', '긴급 도움 요청']] },
  { title: '일정', pages: [['schedule', '개인 일정'], ['calendar', '캘린더 연동']] },
  { title: '알림', pages: [['notifications', '알림함'], ['settings', '알림 설정']] },
  { title: '가족', pages: [['members', '가족 설정'], ['permissions', '정보 공개']] },
  { title: '혜택·부가 서비스', pages: [['gap', '돌봄 공백 예측'], ['album', '패밀리 앨범'], ['programs', '돌봄 제도 안내']] },
  { title: '계정', pages: [['plan', '플랜·결제'], ['onboarding', '처음부터 시작 체험']] },
]
const typeLabel: Record<string, string> = { SCHEDULE: '일정', SUPPLY: '준비물', TODO: '할 일', CHANGE: '변경사항' }
const localDateTime = (value: string | null) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ''

function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return <div className={'card ' + className} onClick={onClick}>{children}</div>
}
function Section({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="section-heading"><span>{children}</span>{action}</div>
}
function Empty({ title, text }: { title: string; text: string }) {
  return <Card className="empty"><span className="empty-glyph">✓</span><strong>{title}</strong><p>{text}</p></Card>
}
function Pro() { return <span className="pro-badge">PRO</span> }

function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null)
  const [me, setMe] = useState<FamilyMe | null>(null)
  const [screen, setScreen] = useState<Screen>(() => hasFamilyToken() ? 'thinqHome' : 'onboarding')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [filter, setFilter] = useState('all')
  const [viewer, setViewer] = useState('mom')
  const [itemId, setItemId] = useState<string | null>(null)
  const [assignmentId, setAssignmentId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [reviewTitle, setReviewTitle] = useState('')
  const [reviewType, setReviewType] = useState('TODO')
  const [reviewStart, setReviewStart] = useState('')
  const [captureText, setCaptureText] = useState('')
  const [captureChild, setCaptureChild] = useState('')
  const [captureFile, setCaptureFile] = useState<File | null>(null)
  const [captureSource, setCaptureSource] = useState<'CAMERA' | 'ALBUM'>('ALBUM')
  const [capturePreview, setCapturePreview] = useState('')
  const [captureTranscript, setCaptureTranscript] = useState('')
  const [captureFromPhoto, setCaptureFromPhoto] = useState(false)
  const [captureBusy, setCaptureBusy] = useState(false)
  const [scheduleTitle, setScheduleTitle] = useState('')
  const [scheduleMember, setScheduleMember] = useState('mom')
  const [scheduleStart, setScheduleStart] = useState('')
  const [scheduleEnd, setScheduleEnd] = useState('')
  const [memberNameInput, setMemberNameInput] = useState('')
  const [memberRole, setMemberRole] = useState('GRANDPARENT')
  const [permissionMember, setPermissionMember] = useState('grandma')
  const [note, setNote] = useState('')
  const [showSheet, setShowSheet] = useState(false)
  const [alternative, setAlternative] = useState('grandma')
  const [reason, setReason] = useState('일정이 겹쳐 다른 담당자가 필요해요')
  const [fabOpen, setFabOpen] = useState(false)
  const [onboardMode, setOnboardMode] = useState<'create' | 'join'>('create')
  const [onboardFamilyName, setOnboardFamilyName] = useState('')
  const [onboardName, setOnboardName] = useState('')
  const [onboardBusy, setOnboardBusy] = useState(false)
  const [onboardInviteCode, setOnboardInviteCode] = useState('')
  const [onboardRole, setOnboardRole] = useState('PARENT')
  const [inviteCode, setInviteCode] = useState('')
  const [inviteExpiresAt, setInviteExpiresAt] = useState('')
  const [childNameInput, setChildNameInput] = useState('')
  const [childAgeInput, setChildAgeInput] = useState('')
  const [chatDraft, setChatDraft] = useState('')
  const [chatMessages, setChatMessages] = useState<{ from: 'me' | 'agent'; text: string }[]>([])
  const [chatUsedToday, setChatUsedToday] = useState(0)
  const [chatBusy, setChatBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [emergencyItem, setEmergencyItem] = useState('')
  const [emergencyReason, setEmergencyReason] = useState('긴급 돌봄 도움이 필요합니다')
  const [emergencyRequests, setEmergencyRequests] = useState<EmergencyRequest[]>([])
  const [subscription, setSubscription] = useState<{ plan: string; status: string; developer_preview: boolean; dev_switch_available: boolean } | null>(null)
  const [planBusy, setPlanBusy] = useState(false)
  const [plans, setPlans] = useState<{ id: string; status: string }[]>([])
  const [features, setFeatures] = useState<{ id: string; available: boolean; backend_state: string }[]>([])
  const [handoffNotes, setHandoffNotes] = useState<Record<string, string>>({})
  const [albumPhotos, setAlbumPhotos] = useState<{ name: string; data: string }[]>([])
  const [programSelected, setProgramSelected] = useState('')
  const [deviceNoticeDemo, setDeviceNoticeDemo] = useState(false)
  const contentRef = useRef<HTMLElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const cancelRecordingRef = useRef(false)
  const fabTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fabLongPressed = useRef(false)

  const reportError = (failure: unknown) => {
    if (failure instanceof ApiError && failure.status === 401) {
      const hadToken = hasFamilyToken()
      setFamilyToken(null); setBoot(null); setMe(null); setScreen('onboarding')
      setError(hadToken ? '가족방 세션이 만료됐어요. 다시 참가해주세요.' : '가족방을 만들거나 초대코드로 참가해주세요.')
    } else if (failure instanceof ApiError) {
      const guide: Record<string, string> = {
        OCR_DAILY_LIMIT: '오늘의 무료 사진 OCR을 모두 사용했어요. 사진 선택을 취소하고 직접 입력해주세요.',
        CHAT_DAILY_LIMIT: '오늘의 무료 AI 채팅 한도를 사용했어요. 내일 다시 이용하거나 Pro 플랜을 확인해주세요.',
        SUBSCRIPTION_REQUIRED: '현재 가족방은 Pro를 구독하지 않았어요. 플랜을 확인해주세요.',
        AI_NOT_CONFIGURED: '서버 AI 설정이 완료되지 않았어요. 백엔드 설정을 확인해주세요.',
        OPENAI_CREDITS_EXHAUSTED: 'AI 제공 계정의 크레딧이 부족해요. 백엔드 담당자에게 확인해주세요.',
      }
      setError(guide[failure.code ?? ''] ?? failure.message)
    } else setError((failure as Error).message)
  }
  const load = async () => {
    const [nextMe, nextBoot] = await Promise.all([api<FamilyMe>('/families/me'), api<Bootstrap>('/bootstrap')])
    setMe(nextMe); setBoot(nextBoot)
    setViewer(previous => nextMe.authenticated || !nextBoot.members.some(m => m.id === previous) ? nextMe.member.id : previous)
    setScheduleMember(nextMe.member.id)
    setPermissionMember(previous => nextBoot.members.some(m => m.id === previous) ? previous : nextMe.member.id)
    setAlternative(previous => nextBoot.members.some(m => m.id === previous) ? previous : nextBoot.members[0]?.id ?? '')
    setCaptureChild(previous => nextBoot.children.some(c => c.id === previous) ? previous : nextBoot.children[0]?.id ?? '')
  }
  const activeFamilyId = boot?.family.id
  useEffect(() => { load().catch(reportError) }, [])
  useEffect(() => {
    if (screen === 'chat' && activeFamilyId) Promise.all([
      api<{ messages: { role: string; content: string }[] }>('/assistant/history'),
      api<{ usage: { chat_tokens_today: number } }>('/features'),
    ]).then(([history, available]) => {
      setChatMessages(history.messages.map(m => ({ from: m.role === 'user' ? 'me' : 'agent', text: m.content })))
      setChatUsedToday(available.usage.chat_tokens_today)
    }).catch(reportError)
    if (screen === 'plan' && activeFamilyId) Promise.all([
      api<{ plan: string; status: string; developer_preview: boolean; dev_switch_available: boolean }>('/subscription'),
      api<{ features: { id: string; available: boolean; backend_state: string }[] }>('/features'),
      api<{ plans: { id: string; status: string }[] }>('/plans'),
    ]).then(([current, available, products]) => { setSubscription(current); setFeatures(available.features); setPlans(products.plans) }).catch(reportError)
    if (screen === 'emergency' && activeFamilyId) api<{ requests: EmergencyRequest[] }>('/emergency-requests')
      .then(result => setEmergencyRequests(result.requests)).catch(reportError)
  }, [screen, activeFamilyId])
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 3200); return () => clearTimeout(timer) } }, [toast])
  useEffect(() => { contentRef.current?.scrollTo(0, 0) }, [screen])
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setFabOpen(false) }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [])
  useEffect(() => { if (screen !== 'chat' && recorderRef.current?.state === 'recording') { cancelRecordingRef.current = true; recorderRef.current.stop() } }, [screen])
  const run = async (work: () => Promise<unknown>, message: string) => {
    try { setError(''); await work(); await load(); setToast(message) }
    catch (e) { reportError(e) }
  }
  const go = (target: Screen) => { setError(''); setFabOpen(false); setScreen(target); if (target === 'thinqHome') load().catch(reportError) }
  const enterFamily = async () => {
    if (onboardBusy) return
    setOnboardBusy(true)
    try {
      setError('')
      if (!onboardName.trim()) throw new Error('이름을 입력해주세요')
      const result = onboardMode === 'create'
        ? await send<FamilySession>('/families', 'POST', { name: onboardFamilyName.trim(), owner_name: onboardName.trim() })
        : await send<FamilySession>('/families/join', 'POST', { invite_code: onboardInviteCode.trim(), name: onboardName.trim(), role: onboardRole })
      setFamilyToken(result.access_token)
      setInviteCode(result.invite_code ?? '')
      setInviteExpiresAt(result.invite_expires_at ?? '')
      setChatMessages([]); setFilter('all'); setItemId(null); setAssignmentId(null); setSubscription(null); setFeatures([])
      await load()
      setScreen(onboardMode === 'create' ? 'members' : 'home')
      setToast(onboardMode === 'create' ? '가족방을 만들었어요. 초대코드를 가족에게 알려주세요.' : '가족방에 참여했어요.')
    } catch (e) { reportError(e) }
    finally { setOnboardBusy(false) }
  }
  const leaveFamily = () => { setFamilyToken(null); setBoot(null); setMe(null); setChatMessages([]); setInviteCode(''); setSubscription(null); setFeatures([]); setScreen('onboarding') }
  const plan = boot?.family.plan ?? 'FREE'
  const members = boot?.members.filter(member => member.status === 'ACTIVE') ?? []
  const member = (id: string) => boot?.members.find(m => m.id === id)?.name ?? '가족'
  const child = (id: string | null) => boot?.children.find(c => c.id === id)?.name ?? '가족'
  const items = boot?.items.filter(i => filter === 'all' || i.child_id === filter) ?? []
  const pending = items.filter(i => i.status === 'NEEDS_REVIEW')
  const allPending = boot?.items.filter(i => i.status === 'NEEDS_REVIEW') ?? []
  const assignments = boot?.assignments.filter(a => !['CANCELED', 'REJECTED'].includes(a.status)) ?? []
  const activeItem = boot?.items.find(i => i.id === itemId) ?? null
  const activeAssignment = boot?.assignments.find(a => a.id === assignmentId) ?? null
  const unread = boot?.notifications.filter(n => !n.is_read).length ?? 0
  const preference = boot?.notification_preferences.find(p => p.member_id === viewer)
  const appNotices = !!(preference?.app_enabled ?? 1)
  const dailyDigest = !!(preference?.daily_digest_enabled ?? 1)
  const today = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())
  const isFamilyScreen = !['thinqHome', 'thinqDevice', 'thinqCare', 'thinqMenu'].includes(screen)
  const sendChat = async (question = chatDraft) => {
    const text = question.trim()
    if (!text || chatBusy) return
    setChatBusy(true); setError('')
    try {
      const result = await send<ChatAnswer>('/assistant/chat', 'POST', { message: text })
      setChatMessages(previous => [...previous, { from: 'me', text: result.message }, { from: 'agent', text: result.answer }])
      setChatUsedToday(result.usage.used_today); setChatDraft('')
    } catch (e) { reportError(e) }
    finally { setChatBusy(false) }
  }
  const sendVoice = async (file: File) => {
    if (chatBusy) return
    if (file.size > 20 * 1024 * 1024) { setError('녹음은 20MB 이하만 보낼 수 있어요'); return }
    setChatBusy(true); setError('')
    try {
      const form = new FormData(); form.append('file', file)
      const result = await upload<ChatAnswer & { transcript: string }>('/assistant/voice', form)
      setChatMessages(previous => [...previous, { from: 'me', text: result.transcript }, { from: 'agent', text: result.answer }])
      setChatUsedToday(result.usage.used_today)
    } catch (e) { reportError(e) }
    finally { setChatBusy(false) }
  }
  const toggleRecording = async () => {
    if (recording) { recorderRef.current?.stop(); return }
    if (!window.isSecureContext) { setError('휴대폰의 HTTP 네트워크 주소에서는 마이크를 사용할 수 없어요. HTTPS로 접속해주세요.'); return }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('이 브라우저는 음성 녹음을 지원하지 않아요.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = ['audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      const chunks: BlobPart[] = []
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = () => {
        setRecording(false); stream.getTracks().forEach(track => track.stop())
        const type = recorder.mimeType.split(';')[0] || 'audio/webm'
        if (chunks.length && !cancelRecordingRef.current) sendVoice(new File(chunks, `care-voice.${type.includes('mp4') ? 'm4a' : 'webm'}`, { type }))
      }
      cancelRecordingRef.current = false; recorderRef.current = recorder; recorder.start(); setRecording(true)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') setError('브라우저에서 마이크 권한을 허용해주세요.')
      else reportError(e)
    }
  }

  const selectReview = (item: CareItem) => { setItemId(item.id); setReviewTitle(item.title); setReviewType(item.item_type); setReviewStart(localDateTime(item.starts_at)) }
  const openReview = (item: CareItem) => { setCaptureTranscript(''); setCaptureFromPhoto(false); selectReview(item); go('review') }
  const openSuggestion = async (item: CareItem) => {
    try { const result = await api<{ suggestions: Suggestion[] }>('/items/' + item.id + '/suggestions'); setItemId(item.id); setSuggestions(result.suggestions); go('suggestion') }
    catch (e) { reportError(e) }
  }
  const selectCarePhoto = (file: File | undefined, source: 'CAMERA' | 'ALBUM') => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('10MB 이하 JPG, PNG, WebP 사진을 선택해주세요'); return }
    setError(''); setCaptureFile(file); setCaptureSource(source)
    const reader = new FileReader()
    reader.onload = () => setCapturePreview(String(reader.result))
    reader.readAsDataURL(file)
  }
  const capture = async () => {
    if (captureBusy) return
    setCaptureBusy(true)
    await run(async () => {
      if (!captureFile && !captureText.trim()) throw new Error('사진을 선택하거나 알림장 내용을 입력해주세요')
      const result = captureFile ? await (() => {
        const form = new FormData()
        form.append('file', captureFile)
        if (captureChild) form.append('child_id', captureChild)
        form.append('source', captureSource)
        return upload<{ items: CareItem[]; transcript: string; ocr_used_today: number }>('/intakes/photo', form)
      })() : await send<{ items: CareItem[]; transcript?: string }>('/intakes', 'POST', {
        child_id: captureChild || null, raw_content: captureText.trim(), input_type: 'TEXT',
      })
      if (result.items[0]) selectReview(result.items[0])
      else setItemId(null)
      setCaptureFromPhoto(!!captureFile)
      setCaptureTranscript(result.transcript ?? captureText.trim())
      setCaptureText(''); setCaptureFile(null); setCapturePreview(''); go(result.items[0] || captureFile ? 'review' : 'family')
    }, '확인할 항목을 정리했어요')
    setCaptureBusy(false)
  }
  const saveReview = () => run(async () => {
    if (!activeItem) return
    await send('/items/' + activeItem.id, 'PATCH', { title: reviewTitle, item_type: reviewType, ...(reviewStart ? { starts_at: new Date(reviewStart).toISOString() } : {}) })
    await send('/items/' + activeItem.id + '/confirm', 'POST')
    go('family')
  }, '돌봄 정보를 저장했어요')
  const saveSchedule = () => run(async () => {
    if (!scheduleTitle || !scheduleStart || !scheduleEnd) throw new Error('일정 정보를 모두 입력해주세요')
    const result = await send<{ collisions: unknown[] }>('/schedules', 'POST', { member_id: me?.authenticated ? me.member.id : scheduleMember, title: scheduleTitle, starts_at: new Date(scheduleStart).toISOString(), ends_at: new Date(scheduleEnd).toISOString() })
    setScheduleTitle(''); setScheduleStart(''); setScheduleEnd('')
    if (result.collisions.length) go('exception')
  }, '개인 일정을 등록했어요')
  const previewPlan = async (next: 'FREE' | 'PRO') => {
    if (planBusy || !subscription?.dev_switch_available) return
    setPlanBusy(true)
    try {
      await run(async () => {
        setSubscription(await send<NonNullable<typeof subscription>>('/dev/preview-plan', 'POST', { plan: next }))
        setFeatures((await api<{ features: typeof features }>('/features')).features)
      }, `개발용 플랜을 ${next}로 바꿨어요`)
    } finally { setPlanBusy(false) }
  }
  const complete = () => run(async () => {
    if (!activeAssignment) return
    await send('/assignments/' + activeAssignment.id + '/complete', 'POST', { note })
    setShowSheet(false); setNote('')
  }, '완료를 가족에게 알렸어요')

  const tabs = boot && <div className="child-tabs"><button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>전체</button>{boot.children.map(c => <button key={c.id} className={filter === c.id ? 'selected' : ''} onClick={() => setFilter(c.id)}>{c.name} ({c.age_label})</button>)}</div>
  const itemFor = (a: Assignment) => boot?.items.find(i => i.id === a.item_id)
  const timeline = (list: Assignment[]) => <Card className="timeline-card">{[...list].sort((a, b) => (itemFor(a)?.starts_at || '').localeCompare(itemFor(b)?.starts_at || '')).map(a => { const i = itemFor(a); return i && <button key={a.id} className="timeline-row" onClick={() => { setAssignmentId(a.id); go('tasks') }}><span className="time">{formatTime(i.starts_at) || '—'}</span><span className="timeline-content"><strong>{i.title} — {member(a.assignee_id)}</strong><small>{a.status === 'COMPLETED' ? '완료' : a.status === 'PROPOSED' ? '수락 대기' : '진행 중'}</small></span><span className="timeline-status">{a.status === 'COMPLETED' ? '✓' : '›'}</span></button> })}</Card>

  let page: ReactNode = <div className="loading">가족의 하루를 불러오고 있어요</div>
  if (boot && screen === 'thinqHome') page = <div className="thinq-page">
    <button className="thinq-family-card" onClick={() => go('home')}>
      <div className="thinq-family-heading"><img src={familyIcon} alt="" /><strong>가족 케어</strong><span>{allPending.length ? `확인 ${allPending.length}건` : '오늘의 가족'} ›</span></div>
      {boot.children.slice(0, 2).map(c => { const important = boot.items.find(i => i.child_id === c.id && i.status === 'NEEDS_REVIEW') ?? boot.items.find(i => i.child_id === c.id && i.status !== 'DONE'); return <div key={c.id} className="thinq-family-row"><b>{c.name}</b><span>{important?.title ?? '확인할 돌봄 정보가 없어요'}</span><span>›</span></div> })}
      {!boot.children.length && <p>가족 탭에서 돌봄을 시작해보세요.</p>}
    </button>
    <Card className="thinq-house-plan"><strong>집 도면</strong></Card>
    <Section>즐겨 찾는 제품</Section><div className="thinq-empty-products">제품을 추가하면 홈 화면에서 바로<br />사용할 수 있어요.</div>
  </div>
  if (boot && ['thinqDevice', 'thinqCare', 'thinqMenu'].includes(screen)) page = <div className="thinq-page"><Card className="thinq-shell-card"><strong>{screen === 'thinqDevice' ? 'ThinQ 디바이스' : screen === 'thinqCare' ? 'ThinQ 케어' : 'ThinQ 메뉴'}</strong><p>기존 ThinQ 기능 영역입니다. 이 프로젝트에서는 가족 케어 탭과 홈 요약 카드만 구현합니다.</p></Card><button className="outline-button wide-button" onClick={() => go('home')}>가족 케어로 이동</button></div>
  if (boot && screen === 'home') page = <>
    <div className="family-page-heading"><h1>가족 케어 {plan === 'PRO' && <Pro />}</h1><span>{today}</span></div>
    <div className="family-subnav" aria-label="가족 케어 내부 메뉴"><button className="active" onClick={() => go('home')}>오늘</button><button onClick={() => go('family')}>돌봄 정보</button><button onClick={() => go('assignments')}>역할 배정</button><button onClick={() => go('schedule')}>일정</button></div>
    {allPending.length > 0 && <button className="family-alert" onClick={() => go('family')}><span className="small-badge danger">확인 {allPending.length}건</span><strong>{allPending[0].title}</strong><span>›</span></button>}
    <Section action={<button className="text-link" onClick={() => go('assignments')}>전체 보기 ›</button>}>오늘 배정</Section>{assignments.length ? timeline(assignments.slice(0, 5)) : <Empty title="배정된 일이 없어요" text="돌봄 정보를 확인하면 역할을 나눌 수 있어요" />}
    <Section>바로가기</Section><div className="family-shortcuts">{([['family', 'Family Inbox', `${allPending.length}건 확인 필요`], ['tasks', '오늘 할 일', `${assignments.length}건 배정`], ['chat', '케어 어시스턴트', '일정·배정 질문하기'], ['notifications', '알림함', `${unread}건 새 알림`]] as [Screen, string, string][]).map(([target, label, detail]) => <button key={target} onClick={() => go(target)}><strong>{label}</strong><small>{detail}</small><span>›</span></button>)}</div>
    <Section>전체 메뉴</Section><nav className="family-categories" aria-label="가족 케어 전체 메뉴">{familyCategories.map(({ title, pages }, index) => <details key={title} className="menu-category" open={index === 0}><summary>{title}<span>{pages.length}개</span></summary><div className="family-menu-list">{pages.map(([target, label]) => <button key={target} onClick={() => go(target)}>{label}<span>›</span></button>)}</div></details>)}</nav>
  </>
  if (boot && screen === 'family') page = <><div className="family-subnav" aria-label="가족 케어 내부 메뉴"><button onClick={() => go('home')}>오늘</button><button className="active" onClick={() => go('family')}>돌봄 정보</button><button onClick={() => go('assignments')}>역할 배정</button><button onClick={() => go('schedule')}>일정</button></div>{tabs}
    {pending.length > 0 && <Card className="inbox-summary" onClick={() => pending[0] && openReview(pending[0])}><span className="summary-dot">●</span><div><strong>확인할 돌봄 정보 {pending.length}건</strong><p>등록한 내용은 확인 후 역할 배정에 반영돼요</p></div><span className="chevron">›</span></Card>}
    <Section>확인 필요 {pending.length}</Section>{pending.length ? pending.map(i => <Card key={i.id} className="review-card"><div className="review-meta"><span className="child-pill">{child(i.child_id)}</span><span>신뢰도 낮음 · {typeLabel[i.item_type]}</span></div><strong>{i.title}</strong><p>{i.detail || '추출된 내용을 확인해주세요'}</p><div className="card-actions"><button onClick={() => openReview(i)}>확인하기</button><button onClick={() => setToast('나중에 다시 확인할 수 있어요')}>나중에</button></div></Card>) : <Empty title="확인할 것이 없어요" text="새로운 알림장이 들어오면 이곳에 표시돼요" />}
    <Section>확정된 일정</Section>{items.filter(i => ['CONFIRMED', 'ASSIGNED', 'DONE'].includes(i.status)).slice(0, 3).map(i => <Card key={i.id} className="schedule-card"><span className="time">{formatTime(i.starts_at) || '—'}</span><div><strong>{i.title} · {child(i.child_id)}</strong><p>{i.detail}</p></div><span className="green-check">✓</span></Card>)}
    <div className="inbox-buttons"><button className="primary-button" onClick={() => go('capture')}>알림장 촬영</button><button className="outline-button" onClick={() => go('capture')}>직접 입력</button></div>
  </>
  if (boot && screen === 'capture') page = <><div className="eyebrow">FAMILY INBOX</div><h2 className="hero-title">흩어진 안내를<br />한 번에 정리해요</h2><p className="hero-copy">알림장, 문자, 가정통신문에 적힌 돌봄 정보를 모아주세요.</p>
    <div className="capture-actions"><input ref={cameraInputRef} className="photo-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="카메라로 알림장 촬영" onChange={e => { selectCarePhoto(e.currentTarget.files?.[0], 'CAMERA'); e.currentTarget.value = '' }} /><input ref={uploadInputRef} className="photo-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="앨범에서 알림장 사진 업로드" onChange={e => { selectCarePhoto(e.currentTarget.files?.[0], 'ALBUM'); e.currentTarget.value = '' }} /><button className="primary-button" onClick={() => cameraInputRef.current?.click()}>사진 촬영</button><button className="outline-button" onClick={() => uploadInputRef.current?.click()}>사진 업로드</button></div>
    <div className="capture-frame">{capturePreview ? <img className="capture-preview" src={capturePreview} alt="선택한 알림장" /> : <span className="camera-glyph">▣</span>}<strong>{captureFile?.name || '선택된 사진이 없어요'}</strong><small>{captureFile ? '사진의 글씨를 읽고 일정 관련 내용만 AI가 추려요. 다음 화면에서 확인해주세요.' : '사진 없이 입력하면 수기로 등록돼요. 무료 OCR은 하루 2회 사용할 수 있어요.'}</small></div>
    <Section>아이 선택</Section><div className="choice-row">{boot.children.map(c => <button key={c.id} className={'choice-chip ' + (captureChild === c.id ? 'active' : '')} onClick={() => setCaptureChild(c.id)}>{c.name}</button>)}</div>
    <label className="form-label">직접 입력 (사진 없이 등록할 때)</label><textarea className="text-area" rows={5} value={captureText} onChange={e => setCaptureText(e.target.value)} placeholder={'예: 금요일 하원 시간이 15시로 변경\n준비물: 도시락, 모자'} /><p className="helper-text">OCR 한도나 사진 오류가 있으면 사진을 다시 선택해 해제하고 수기로 입력할 수 있어요.</p>{captureFile && <button className="text-link centered" onClick={() => { setCaptureFile(null); setCapturePreview('') }}>사진 선택 취소 · 수기 입력</button>}<button className="primary-button wide-button" disabled={captureBusy || (!captureFile && !captureText.trim())} onClick={capture}>{captureBusy ? '분석 중…' : captureFile ? '사진 분석하기' : '내용 정리하기'}</button>
  </>
  if (boot && screen === 'review') page = <><div className="eyebrow">추출 결과 확인</div><h2 className="hero-title">{captureFromPhoto ? <>일정 관련 내용만<br />확인해주세요</> : <>표시된 부분만<br />확인해주세요</>}</h2><p className="hero-copy">{captureFromPhoto ? 'AI가 고른 항목을 원문과 비교하고, 틀린 부분을 고쳐주세요.' : '틀린 부분만 고치고 저장하면 돼요.'}</p>
    {activeItem && <div className="review-switcher">{boot.items.filter(i => i.status === 'NEEDS_REVIEW' && i.intake_id === activeItem.intake_id).slice(0, 8).map(i => <button key={i.id} className={itemId === i.id ? 'active' : ''} onClick={() => selectReview(i)}>{typeLabel[i.item_type]} · {i.title.slice(0, 20)}</button>)}</div>}
    {activeItem && <Card className="detail-review-card"><div className="review-meta"><span className={'confidence ' + (activeItem.confidence === 'HIGH' ? 'high' : 'low')}>{activeItem.confidence === 'HIGH' ? '✓ 신뢰도 높음' : '! 신뢰도 낮음'}</span><span>{child(activeItem.child_id)}</span></div><label className="form-label">항목 종류</label><select className="form-control" value={reviewType} onChange={e => setReviewType(e.target.value)}>{Object.entries(typeLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><label className="form-label">내용</label><input className="form-control" value={reviewTitle} onChange={e => setReviewTitle(e.target.value)} />{activeItem.detail && <p className="source-text">원문 근거 · {activeItem.detail}</p>}<label className="form-label">돌봄 예정 일시 (선택)</label><input className="form-control" type="datetime-local" value={reviewStart} onChange={e => setReviewStart(e.target.value)} /><p className="helper-text">일시를 입력하면 가족 일정과 겹치는지 확인할 수 있어요.</p><p className="source-text">출처 · {activeItem.intake_id ? '등록한 돌봄 정보' : '별빛유치원 알림장'}</p></Card>}
    {!activeItem && captureFromPhoto && <Empty title="일정 관련 항목이 없어요" text="읽은 글씨는 아래에서 확인할 수 있어요. 필요한 내용이 있다면 직접 입력해주세요." />}
    {captureTranscript && <details className="card source-transcript"><summary>인식한 원문 보기</summary><p>{captureTranscript}</p></details>}
    {activeItem ? <button className="primary-button wide-button" onClick={saveReview}>확인하고 저장</button> : captureFromPhoto && <button className="primary-button wide-button" onClick={() => go('capture')}>내용 직접 입력하기</button>}
  </>
  if (boot && screen === 'assignments') page = <><div className="eyebrow">ROLE MATCH</div><h2 className="hero-title">오늘의 배정</h2><p className="hero-copy">평소대로인 배정은 조용히 진행하고, 조정할 일만 알려드려요.</p><Section>확정된 배정</Section>{timeline(assignments)}<Section>배정이 필요한 일</Section>{items.filter(i => i.status === 'CONFIRMED' && !assignments.some(a => a.item_id === i.id)).map(i => <Card key={i.id} className="suggest-card" onClick={() => openSuggestion(i)}><div><strong>{i.title}</strong><p>{child(i.child_id)} · {formatTime(i.starts_at) || '시간 미정'}</p></div><span className="chevron">›</span></Card>)}<Card className="info-note" onClick={() => go('schedule')}>개인 일정을 등록하면 가능한 시간을 참고해요 ›</Card></>
  if (boot && screen === 'suggestion') page = <><div className="eyebrow">배정 제안</div><h2 className="hero-title">{activeItem?.title || '내일 등원'}</h2><p className="hero-copy">가능한 가족에게 요청해보세요. 수락 전까지 배정은 확정되지 않습니다.</p>{suggestions.map(s => <Card key={s.member_id} className={'person-card ' + (s.priority === 1 ? 'recommended' : '')}><div className="person-avatar">{s.name.slice(0, 1)}</div><div className="person-info"><strong>{s.name}</strong><p>{s.reason}</p></div><span className={'small-badge ' + (s.available ? 'ok' : 'danger')}>{s.available ? s.priority + '순위' : '바쁨'}</span><button className={s.priority === 1 ? 'primary-button' : 'outline-button'} disabled={!s.available || !activeItem} onClick={() => run(async () => { await send('/assignments', 'POST', { item_id: activeItem!.id, assignee_id: s.member_id }); go('assignments') }, s.name + '님에게 요청했어요')}>{s.name}에게 요청</button></Card>)}<Section>판단 근거</Section><Card className="reason-card"><p>등록된 개인 일정과 돌봄 시간을 비교했어요.</p><p>캘린더는 바쁨/한가함만 참고합니다 (Level A).</p></Card></>
  if (boot && screen === 'tasks') page = <><div className="viewer-switch"><span>{me?.authenticated ? '내 담당' : '담당자 보기 (데모)'}</span><select value={viewer} disabled={!!me?.authenticated} onChange={e => setViewer(e.target.value)}>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div><Card className="task-summary"><span className="green-check">✓</span><div><strong>오늘 맡은 일 {assignments.filter(a => a.assignee_id === viewer).length}건</strong><p>끝난 일은 가족에게 바로 알려드려요</p></div></Card><Section>오늘 할 일</Section>{assignments.filter(a => a.assignee_id === viewer).map(a => { const i = itemFor(a); return i && <Card key={a.id} className="task-card"><div className="task-top"><span className="time">{formatTime(i.starts_at) || '시간 미정'}</span><span className="small-badge ok">{a.status === 'COMPLETED' ? '완료' : a.status === 'PROPOSED' ? '수락 대기' : '담당'}</span></div><strong>{i.title} — {child(i.child_id)}</strong><p>{i.detail}</p>{a.status === 'PROPOSED' ? <div className="task-actions"><button className="primary-button" onClick={() => run(() => send('/assignments/' + a.id + '/respond', 'POST', { decision: 'ACCEPTED' }), '배정을 수락했어요')}>맡을게요</button><button className="outline-button" onClick={() => run(() => send('/assignments/' + a.id + '/respond', 'POST', { decision: 'REJECTED' }), '다른 담당자를 찾을게요')}>어려워요</button></div> : a.status === 'ACCEPTED' ? <button className="primary-button wide-button" onClick={() => { setAssignmentId(a.id); setShowSheet(true) }}>완료 체크</button> : <p className="source-text">{a.note ? '특이사항 · ' + a.note : '특이사항 없음'}</p>}</Card> })}<Section>이번 주 내 담당</Section><Card className="stats-card"><div><strong>{assignments.filter(a => a.assignee_id === viewer).length}</strong><span>맡은 일</span></div><div><strong>{assignments.filter(a => a.assignee_id === viewer && a.status === 'COMPLETED').length}</strong><span>완료</span></div><div><strong>{assignments.filter(a => a.assignee_id === viewer && a.note).length}</strong><span>특이사항</span></div></Card></>
  if (boot && screen === 'schedule') page = <><div className="eyebrow">개인 일정 등록</div><h2 className="hero-title">바쁜 시간을<br />알려주세요</h2><p className="hero-copy">배정에 필요한 가능 여부만 가족에게 반영돼요.</p><Card className="form-card"><label className="form-label">일정 이름</label><input className="form-control" value={scheduleTitle} onChange={e => setScheduleTitle(e.target.value)} placeholder="예: 오전 회의" /><label className="form-label">구성원</label><select className="form-control" value={scheduleMember} disabled={!!me?.authenticated} onChange={e => setScheduleMember(e.target.value)}>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><label className="form-label">시작</label><input className="form-control" type="datetime-local" value={scheduleStart} onChange={e => setScheduleStart(e.target.value)} /><label className="form-label">종료</label><input className="form-control" type="datetime-local" value={scheduleEnd} onChange={e => setScheduleEnd(e.target.value)} /></Card><button className="primary-button wide-button" onClick={saveSchedule}>일정 등록</button><Section>등록된 일정</Section>{boot.schedules.map(s => <Card key={s.id} className="simple-list-card"><span className="calendar-icon">▦</span><div><strong>{s.title}</strong><p>{member(s.member_id)} · {formatDate(s.starts_at)} {formatTime(s.starts_at)}</p></div></Card>)}</>
  if (boot && screen === 'exception') page = <><div className="eyebrow urgent">EXCEPTION CARE</div><h2 className="hero-title">지금 확인이<br />필요해요</h2><Card className="urgent-card"><span className="small-badge danger">일정 충돌 감지</span><strong>담당자의 일정이 돌봄 시간과 겹쳤어요.</strong><p>하원 마감 전까지 다른 담당자를 정해 주세요.</p></Card><Section>진행 중인 대안</Section>{boot.exceptions.length ? boot.exceptions.map(e => <Card key={e.id} className="exception-card"><strong>{e.reason}</strong><p>대안 · {member(e.alternative_member_id)}</p><span className="small-badge ok">{e.status === 'PENDING' ? '확인 대기' : '승인됨'}</span>{e.status === 'PENDING' && <button className="primary-button" onClick={() => run(() => send('/exceptions/' + e.id + '/approve', 'POST'), '대안을 요청했어요')}>대안 승인</button>}</Card>) : <Empty title="새로운 대안이 없어요" text="충돌이 생기면 해결책을 이곳에서 확인할 수 있어요" />}<Section>직접 대안 제안</Section><Card className="form-card"><label className="form-label">조정할 배정</label><select className="form-control" value={assignmentId || ''} onChange={e => setAssignmentId(e.target.value)}><option value="">배정을 선택하세요</option>{assignments.filter(a => a.status === 'ACCEPTED').map(a => <option key={a.id} value={a.id}>{itemFor(a)?.title} · {member(a.assignee_id)}</option>)}</select><label className="form-label">다른 담당자</label><select className="form-control" value={alternative} onChange={e => setAlternative(e.target.value)}>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><label className="form-label">사유</label><input className="form-control" value={reason} onChange={e => setReason(e.target.value)} /><button className="primary-button wide-button" onClick={() => run(async () => { if (!assignmentId) throw new Error('배정을 선택해주세요'); await send('/exceptions', 'POST', { assignment_id: assignmentId, alternative_member_id: alternative, reason }) }, '대안을 등록했어요')}>대안 만들기</button></Card></>
  if (boot && screen === 'handoff') page = <><div className="eyebrow">CARE HANDOFF</div><h2 className="hero-title">필요한 정보만<br />이어드려요</h2><p className="hero-copy">담당자가 바뀔 때 지금 필요한 내용을 간단히 전달해요.</p><Section>인수인계 브리핑</Section>{boot.handoffs.length ? boot.handoffs.map(h => <Card key={h.id} className="handoff-card"><div className="handoff-avatars"><span>{member(h.from_member_id).slice(0, 1)}</span><span>→</span><span>{member(h.to_member_id).slice(0, 1)}</span></div><strong>{h.briefing}</strong><p>{member(h.to_member_id)}님에게 전달 · {h.status === 'PENDING' ? '확인 대기' : '확인 완료'}</p>{h.special_note && <p>특이사항 · {h.special_note}</p>}{h.status === 'PENDING' && (!me?.authenticated || [h.from_member_id, h.to_member_id].includes(me.member.id)) && <><label className="form-label">특이사항 수정</label><textarea className="text-area" rows={2} value={handoffNotes[h.id] ?? h.special_note ?? ''} onChange={e => setHandoffNotes(previous => ({ ...previous, [h.id]: e.target.value }))} /><button className="outline-button wide-button" onClick={() => run(() => send('/handoffs/' + h.id, 'PATCH', { special_note: handoffNotes[h.id] ?? h.special_note ?? '' }), '특이사항을 저장했어요')}>특이사항 저장</button></>}<div className="card-actions"><span className="small-badge ok">{h.status === 'PENDING' ? '확인 대기' : '확인 완료'}</span>{h.status === 'PENDING' && (!me?.authenticated || me.member.id === h.to_member_id) && <button onClick={() => run(() => send('/handoffs/' + h.id + '/acknowledge', 'POST'), '인수인계를 확인했어요')}>인수인계 받았어요</button>}</div></Card>) : <Empty title="인수인계 대기 항목이 없어요" text="담당 배정이 확정되면 브리핑이 나타나요" />}<Card className="info-note">완료할 때 남긴 특이사항은 다음 담당자에게 이어져요.</Card></>
  if (boot && screen === 'notifications') page = <><div className="eyebrow">알림함</div><h2 className="hero-title">필요한 소식만<br />전해드려요</h2><Section>새 알림 {unread}</Section>{boot.notifications.map(n => <Card key={n.id} className={'notice-card ' + (n.is_read ? 'read' : '')} onClick={() => !n.is_read && run(() => send('/notifications/' + n.id + '/read', 'PATCH'), '읽음으로 표시했어요')}><span className={'notice-mark ' + (n.level === 'IMPORTANT' ? 'important' : '')}>{n.level === 'IMPORTANT' ? '!' : '✓'}</span><div><strong>{n.title}</strong><p>{n.body}</p><small>{formatDate(n.created_at)} {formatTime(n.created_at)}</small></div>{!n.is_read && <span className="unread-dot" />}</Card>)}<button className="text-link centered" onClick={() => go('settings')}>알림 설정</button></>
  if (boot && screen === 'members') page = <><div className="eyebrow">우리 가족 · {boot.family.name}</div><h2 className="hero-title">돌봄 구성원</h2><p className="hero-copy">현재 사용자: {me?.member.name ?? member(viewer)} · {me?.authenticated ? '가족방 세션 연결됨' : '데모 가족'}</p>
    <Section>가족 구성원</Section>{boot.members.map(m => <Card key={m.id} className="member-card"><div className="person-avatar">{m.name.slice(0, 1)}</div><div><strong>{m.name}</strong><p>{m.role === 'GRANDPARENT' ? '조부모' : m.role === 'CAREGIVER' ? '돌봄 참여자' : '부모'} · {m.status === 'ACTIVE' ? '참여 중' : '초대 대기'}</p></div>{m.status === 'PENDING' && !me?.authenticated && <button className="text-link" onClick={() => run(() => send('/members/' + m.id + '/accept', 'POST'), '가족에 합류했어요')}>합류</button>}</Card>)}
    <Section>아이</Section>{boot.children.map(c => <Card key={c.id} className="member-card"><div className="child-avatar">{c.name.slice(0, 1)}</div><div><strong>{c.name}</strong><p>{c.age_label}</p></div></Card>)}
    {(!me?.authenticated || me.member.is_owner) && <Card className="form-card"><strong>아이 등록</strong><label className="form-label">이름</label><input className="form-control" aria-label="아이 이름" value={childNameInput} onChange={e => setChildNameInput(e.target.value)} placeholder="아이 이름" /><label className="form-label">나이·학교</label><input className="form-control" aria-label="아이 나이·학교" value={childAgeInput} onChange={e => setChildAgeInput(e.target.value)} placeholder="예: 7세 · 초등학교" /><button className="primary-button wide-button" onClick={() => run(async () => { if (!childNameInput.trim() || !childAgeInput.trim()) throw new Error('아이 이름과 나이·학교를 입력해주세요'); await send('/children', 'POST', { name: childNameInput.trim(), age_label: childAgeInput.trim() }); setChildNameInput(''); setChildAgeInput('') }, '아이를 등록했어요')}>아이 등록</button></Card>}
    {me?.authenticated && me.member.is_owner && <><Section>가족 초대</Section><Card className="form-card"><p>가족에게 초대코드를 알려주면 각자 자신의 기기에서 참가할 수 있어요. Free는 구성원 3명까지예요.</p>{inviteCode && <div className="invite-code"><strong>{inviteCode}</strong><small>만료: {formatDate(inviteExpiresAt)}</small></div>}<button className="outline-button wide-button" onClick={() => run(async () => { const result = await send<{ invite_code: string; invite_expires_at: string }>('/families/invite-code/rotate', 'POST'); setInviteCode(result.invite_code); setInviteExpiresAt(result.invite_expires_at) }, '새 초대코드를 만들었어요')}>{inviteCode ? '초대코드 새로 만들기' : '초대코드 표시하기'}</button></Card></>}
    {!me?.authenticated && <><Section>데모 구성원 추가</Section><Card className="form-card"><label className="form-label">이름</label><input className="form-control" value={memberNameInput} onChange={e => setMemberNameInput(e.target.value)} placeholder="가족 이름" /><label className="form-label">역할</label><select className="form-control" value={memberRole} onChange={e => setMemberRole(e.target.value)}><option value="PARENT">부모</option><option value="GRANDPARENT">조부모</option><option value="CAREGIVER">돌봄 참여자</option></select><button className="primary-button wide-button" onClick={() => run(async () => { if (!memberNameInput.trim()) throw new Error('이름을 입력해주세요'); await send('/members', 'POST', { name: memberNameInput.trim(), role: memberRole }); setMemberNameInput('') }, '초대 대기 구성원을 추가했어요')}>구성원 추가</button></Card></>}
    <button className="text-link centered" onClick={() => go('permissions')}>정보 공개 권한 관리</button><button className="text-link centered" onClick={leaveFamily}>다른 가족방 만들기·참가</button>
  </>
  if (screen === 'onboarding') page = <><div className="eyebrow">FAMILY CARE · 가족방 시작</div><h2 className="hero-title">가족의 돌봄을<br />함께 이어요</h2><p className="hero-copy">새 가족방을 만들거나, 가족에게 받은 초대코드로 참여하세요. 현재는 ThinQ 로그인과 별개인 개발용 가족방 세션이에요.</p><Card className="onboarding-art"><span className="onboard-circle a">엄</span><span className="onboard-line">→</span><span className="onboard-circle b">할</span><span className="onboard-line">→</span><span className="onboard-circle c">아</span></Card>
    <div className="choice-row"><button className={'choice-chip ' + (onboardMode === 'create' ? 'active' : '')} onClick={() => setOnboardMode('create')}>가족방 만들기</button><button className={'choice-chip ' + (onboardMode === 'join' ? 'active' : '')} onClick={() => setOnboardMode('join')}>초대코드로 참가</button></div>
    <Card className="form-card">{onboardMode === 'create' ? <><label className="form-label">가족방 이름</label><input className="form-control" aria-label="가족방 이름" value={onboardFamilyName} onChange={e => setOnboardFamilyName(e.target.value)} placeholder="예: 지우네 가족" /></> : <><label className="form-label">초대코드</label><input className="form-control" aria-label="초대코드" value={onboardInviteCode} onChange={e => setOnboardInviteCode(e.target.value.toUpperCase())} placeholder="가족에게 받은 10자리 코드" /></>}
      <label className="form-label">내 이름</label><input className="form-control" aria-label="내 이름" value={onboardName} onChange={e => setOnboardName(e.target.value)} placeholder="예: 김지연" />{onboardMode === 'join' && <><label className="form-label">내 역할</label><select className="form-control" aria-label="내 역할" value={onboardRole} onChange={e => setOnboardRole(e.target.value)}><option value="PARENT">부모</option><option value="GRANDPARENT">조부모</option><option value="CAREGIVER">돌봄 참여자</option></select></>}</Card>
    <button className="primary-button wide-button" disabled={onboardBusy || !onboardName.trim() || (onboardMode === 'create' ? !onboardFamilyName.trim() : !onboardInviteCode.trim())} onClick={enterFamily}>{onboardBusy ? '연결 중…' : onboardMode === 'create' ? '가족방 만들기' : '가족방 참가'}</button>{boot && <button className="text-link centered" onClick={() => go(me?.authenticated ? 'home' : 'thinqHome')}>{me?.authenticated ? '현재 가족방으로 돌아가기' : '데모로 둘러보기'}</button>}
  </>
  if (boot && screen === 'calendar') page = <><div className="eyebrow">업무 캘린더 연결</div><h2 className="hero-title">가능한 시간만<br />참고할게요</h2><p className="hero-copy">개인 일정 내용 대신 돌봄 배정에 필요한 바쁨/한가함만 사용해요 (Level A).</p><Card className="calendar-provider" onClick={() => setToast('Google OAuth 연결은 아직 준비 중이에요. 아래에서 직접 일정을 등록할 수 있어요')}><img className="provider-icon" src={googleIcon} alt="" /><div><strong>Google Calendar</strong><p>업무 일정 연결</p></div><span className="chevron">›</span></Card><Card className="calendar-provider" onClick={() => setToast('Outlook OAuth 연결은 아직 준비 중이에요. 아래에서 직접 일정을 등록할 수 있어요')}><img className="provider-icon" src={outlookIcon} alt="" /><div><strong>Outlook Calendar</strong><p>업무 일정 연결</p></div><span className="chevron">›</span></Card><Card className="info-note">캘린더 연결을 건너뛰어도 직접 일정을 등록할 수 있어요.</Card><button className="primary-button wide-button" onClick={() => go('schedule')}>직접 일정 등록</button></>
  if (boot && screen === 'permissions') page = <><div className="eyebrow">정보 공개 권한</div><h2 className="hero-title">필요한 정보만<br />보여드려요</h2><p className="hero-copy">구성원마다 볼 수 있는 정보를 선택해 주세요. 변경은 주돌봄자만 할 수 있어요.</p><div className="choice-row">{members.map(m => <button key={m.id} className={'choice-chip ' + (permissionMember === m.id ? 'active' : '')} onClick={() => setPermissionMember(m.id)}>{m.name}</button>)}</div><Section>{member(permissionMember)}님의 열람 범위</Section>{[['CHILD_DETAIL', '아이 정보', '이름과 돌봄 일정'], ['LOCATION', '위치', '이동과 인수인계 위치'], ['HEALTH', '건강 정보', '복약과 건강 관련 내용'], ['NOTE', '특이사항', '돌봄 완료 메모'], ['PHOTO', '사진', '완료 사진과 앨범']].map(([scope, name, detail]) => { const allowed = !!boot.permissions.find(p => p.member_id === permissionMember && p.scope === scope)?.is_allowed; return <Card key={scope} className="permission-row"><div><strong>{name}</strong><p>{detail}</p></div><button className={'switch ' + (allowed ? 'on' : '')} role="switch" aria-checked={allowed} disabled={!!me?.authenticated && !me.member.is_owner} aria-label={name + ' 공개'} onClick={() => run(() => send('/members/' + permissionMember + '/permissions', 'PATCH', { scope, is_allowed: !allowed }), '공개 범위를 변경했어요')}><span /></button></Card> })}<Card className="info-note">위치와 건강 정보는 기본적으로 공개하지 않아요.</Card></>
  if (boot && screen === 'settings') page = <><div className="eyebrow">알림 설정</div><h2 className="hero-title">조용하지만<br />놓치지 않게</h2><p className="hero-copy">평소대로 진행될 때는 알림을 줄이고, 확인할 때 알려드려요.</p><Section>앱 알림</Section><Card className="permission-row"><div><strong>돌봄 알림 받기</strong><p>등록, 배정, 인수인계, 완료</p></div><button className={'switch ' + (appNotices ? 'on' : '')} role="switch" aria-checked={appNotices} aria-label="돌봄 알림 받기" onClick={() => run(() => send('/members/' + viewer + '/notification-preferences', 'PATCH', { app_enabled: !appNotices }), '알림 설정을 변경했어요')}><span /></button></Card><Card className="permission-row"><div><strong>하루 1회 모아보기</strong><p>21:00에 확인할 정보만 요약</p></div><button className={'switch ' + (dailyDigest ? 'on' : '')} role="switch" aria-checked={dailyDigest} aria-label="하루 1회 모아보기" onClick={() => run(() => send('/members/' + viewer + '/notification-preferences', 'PATCH', { daily_digest_enabled: !dailyDigest }), '모아보기 설정을 변경했어요')}><span /></button></Card><Section>가전 알림 <Pro /></Section><Card className="permission-row"><div><strong>ThinQ 가전으로 알림</strong><p>{plan === 'PRO' ? 'Pro 화면 설정 체험 · 실제 ThinQ 가전 연결 없음' : 'Pro 구독이 필요해요 · 가전 연결은 아직 없음'}</p></div><button className={'switch ' + (deviceNoticeDemo ? 'on' : '')} role="switch" aria-checked={deviceNoticeDemo} aria-label="가전 알림 화면 체험" onClick={() => plan === 'PRO' ? setDeviceNoticeDemo(value => !value) : go('plan')}><span /></button></Card></>
  if (boot && screen === 'plan') page = <><div className="eyebrow">플랜·결제</div><h2 className="hero-title">우리 가족에게<br />맞는 돌봄</h2><p className="hero-copy">서버 요금제: {subscription?.plan ?? plan} · {subscription?.status === 'DEV_PREVIEW' ? '개발자 미리보기' : subscription?.status === 'ACTIVE' ? '구독 중' : '미구독'}. 결제·구독 신청은 아직 연결되지 않았어요.</p>{subscription?.dev_switch_available && <Card className="dev-plan-card"><strong>개발용 플랜 테스트</strong><p>결제 없이 이 가족방의 기능 권한을 바꿔 확인해요. 가족방 관리자에게만 보여요.</p><div className="dev-plan-switch"><button aria-pressed={plan === "FREE"} disabled={planBusy || plan === "FREE"} onClick={() => previewPlan("FREE")}>Free</button><button aria-pressed={plan === "PRO"} disabled={planBusy || plan === "PRO"} onClick={() => previewPlan("PRO")}>Pro</button></div></Card>}<Card className="plan-card current"><span className="small-badge ok">{plan === 'FREE' ? '현재 플랜' : '무료 플랜'}</span><h3>Family Care Free</h3><strong className="price">무료</strong><p>구성원 3명 · 자녀 2명</p><p>Family Inbox · Role Match · 완료 확인 · 하루 2회 OCR · 기본 AI 채팅</p></Card><Card className="plan-card pro"><Pro /><h3>Family Care Pro</h3><strong className="price">{plan === 'PRO' ? '현재 플랜' : plans.find(p => p.id === 'PRO')?.status === 'AVAILABLE' ? 'Pro 상품 제공 · 결제 연결 전' : '상태 조회 중'}</strong><p>긴급 요청 · OCR/채팅 한도 확장 · 음성 입력</p><p>돌봄 공백 예측 · 패밀리 앨범 · 지원 제도는 아직 서버 미연결</p></Card><Section>기능 준비 상태</Section>{features.filter(f => ['chat_daily_10000_tokens', 'ocr_daily_2', 'emergency_request', 'family_album', 'device_alerts'].includes(f.id)).map(f => <Card key={f.id} className="simple-list-card"><strong>{f.id}</strong><p>{f.available ? '사용 권한 있음' : 'Pro 필요'} · {f.backend_state === 'READY' ? 'API 준비됨' : '서버 미연결'}</p></Card>)}<Section>기능 화면 둘러보기</Section><div className="family-menu-list">{([['chat', '케어 어시스턴트'], ['emergency', '긴급 도움 요청'], ['gap', '돌봄 공백 예측'], ['album', '패밀리 앨범'], ['programs', '돌봄 제도 안내']] as [Screen, string][]).map(([target, label]) => <button key={target} onClick={() => go(target)}>{label}<span>›</span></button>)}</div></>
  if (boot && screen === 'chat') page = <><div className="eyebrow">케어 어시스턴트 · {plan === 'PRO' ? 'PRO' : 'FREE'}</div><Card className="chat-intro"><img className="voice-mark" src={voiceIcon} alt="" /><strong>무엇을 도와드릴까요?</strong><p>가족방의 일정·돌봄 정보·배정을 바탕으로 서버 AI가 답해요. 배정 변경은 확인 없이 실행하지 않아요.</p>{plan === 'FREE' && <small>오늘 사용: {chatUsedToday.toLocaleString()} / 10,000 토큰</small>}</Card><div className="chat-thread">{!chatMessages.length && <div className="chat-bubble agent">일정이나 배정에 대해 물어보세요.</div>}{chatMessages.map((m, index) => <div key={index} className={'chat-bubble ' + m.from}>{m.text}</div>)}</div><div className="chat-prompts">{['확인할 알림 알려줘', '오늘 담당 배정은?', '등록된 일정은?'].map(text => <button key={text} disabled={chatBusy} onClick={() => sendChat(text)}>{text}</button>)}</div><form className="chat-composer" onSubmit={e => { e.preventDefault(); sendChat() }}><input aria-label="케어 어시스턴트에게 질문" value={chatDraft} onChange={e => setChatDraft(e.target.value)} placeholder="일정이나 배정을 물어보세요" /><button type="submit" disabled={chatBusy || !chatDraft.trim()}>{chatBusy ? '답변 중…' : '보내기'}</button></form><div className="voice-actions"><button className="outline-button" disabled={chatBusy} onClick={toggleRecording}>{recording ? '■ 녹음 끝내고 보내기' : '● 음성 녹음'}</button></div><p className="helper-text">{window.isSecureContext ? '마이크 권한을 허용하면 녹음 후 Whisper 받아쓰기와 AI 답변으로 이어져요.' : 'HTTP 네트워크 주소에서는 마이크를 쓸 수 없어요. 휴대폰에서는 HTTPS로 접속해주세요.'}</p></>
  if (boot && screen === 'emergency') page = <><div className="eyebrow urgent">긴급 도움 요청 <Pro /></div><h2 className="hero-title">갑자기 돌봄이<br />어려워졌나요?</h2><p className="hero-copy">Pro 부모가 가족에게 요청할 수 있어요. 서버 알림 기록은 남지만 ThinQ 푸시는 아직 연결되지 않았어요.</p><Card className="form-card"><label className="form-label">도움이 필요한 돌봄</label><select className="form-control" value={emergencyItem} onChange={e => setEmergencyItem(e.target.value)}><option value="">선택하세요</option>{assignments.filter(a => ['PROPOSED', 'ACCEPTED'].includes(a.status)).map(a => <option key={a.id} value={a.id}>{itemFor(a)?.title ?? '돌봄'} · {member(a.assignee_id)}</option>)}</select><label className="form-label">요청 사유</label><input className="form-control" value={emergencyReason} onChange={e => setEmergencyReason(e.target.value)} /><Section>요청을 받을 가족</Section><p>{members.filter(m => m.id !== me?.member.id).map(m => m.name).join(' · ') || '참여 중인 다른 가족이 없어요'}</p></Card><button className="primary-button wide-button" disabled={!emergencyItem || plan !== 'PRO' || (me?.authenticated && me.member.role !== 'PARENT')} onClick={() => run(async () => { await send('/emergency-requests', 'POST', { assignment_id: emergencyItem, reason: emergencyReason.trim() }); const result = await api<{ requests: EmergencyRequest[] }>('/emergency-requests'); setEmergencyRequests(result.requests); setEmergencyItem('') }, '가족에게 긴급 요청을 보냈어요')}>{plan !== 'PRO' ? 'Pro 구독 필요' : '가족 전체에 실제 요청'}</button>{plan !== 'PRO' && <button className="text-link centered" onClick={() => go('plan')}>플랜 확인하기</button>}
    <Section>요청 현황</Section>{emergencyRequests.length ? emergencyRequests.map(r => { const original = boot.assignments.find(a => a.id === r.assignment_id); const canClaim = r.status === 'OPEN' && me?.member.id !== r.requested_by_member_id && me?.member.id !== original?.assignee_id; const canCancel = r.status === 'OPEN' && (me?.member.id === r.requested_by_member_id || !!me?.member.is_owner); return <Card key={r.id} className="urgent-card"><span className={'small-badge ' + (r.status === 'OPEN' ? 'danger' : 'ok')}>{r.status === 'OPEN' ? '도움 대기' : r.status === 'CLAIMED' ? '담당 확정' : '취소됨'}</span><strong>{r.item_title}</strong><p>{r.reason}</p>{r.claimed_by_member_id && <p>새 담당 · {member(r.claimed_by_member_id)}</p>}{canClaim && <button className="primary-button wide-button" onClick={() => run(async () => { await send('/emergency-requests/' + r.id + '/claim', 'POST'); setEmergencyRequests((await api<{ requests: EmergencyRequest[] }>('/emergency-requests')).requests) }, '새 담당자로 확정됐어요')}>제가 맡을게요</button>}{canCancel && <button className="outline-button wide-button" onClick={() => run(async () => { await send('/emergency-requests/' + r.id + '/cancel', 'POST'); setEmergencyRequests((await api<{ requests: EmergencyRequest[] }>('/emergency-requests')).requests) }, '긴급 요청을 취소했어요')}>요청 취소</button>}</Card> }) : <Empty title="진행 중인 긴급 요청이 없어요" text="요청이 생기면 이곳에서 응답할 수 있어요" />}</>
  if (boot && screen === 'location') page = <><div className="eyebrow">돌봄 동선</div><h2 className="hero-title">지금 어디쯤<br />오고 있나요?</h2><p className="hero-copy">인수인계된 위치와 이동 시간을 한눈에 확인해요.</p><div className="map-panel"><div className="map-road one" /><div className="map-road two" /><span className="map-pin school">학교</span><span className="map-pin academy">태권도</span><span className="map-pin home">집</span><span className="map-route" /></div><Card className="route-card"><strong>학교 → 태권도</strong><p>할머니와 이동 중 · 10분 후 도착 예정</p><div className="route-progress"><span /></div></Card></>
  if (boot && screen === 'gap') page = <><div className="eyebrow">돌봄 공백 살펴보기 <Pro /></div><h2 className="hero-title">담당자가 없는 일을<br />미리 살펴봐요</h2><p className="hero-copy">예측 엔진 연결 전 데모입니다. 현재 등록된 돌봄 중 아직 배정되지 않은 항목을 보여줘요.</p>{boot.items.filter(i => i.status === 'CONFIRMED' && !assignments.some(a => a.item_id === i.id)).map(i => <button key={i.id} className="family-alert" onClick={() => openSuggestion(i)}><span className="small-badge danger">배정 필요</span><strong>{i.title} · {child(i.child_id)}</strong><span>›</span></button>)}<Section>다음 준비</Section><div className="family-menu-list"><button onClick={() => go('schedule')}>가족 일정 등록<span>›</span></button><button onClick={() => go('assignments')}>담당 배정 확인<span>›</span></button><button onClick={() => go('programs')}>지원 제도 살펴보기<span>›</span></button></div></>
  if (boot && screen === 'album') page = <><div className="eyebrow">패밀리 앨범 <Pro /></div><h2 className="hero-title">가족의 순간을<br />함께 모아요</h2><p className="hero-copy">사진을 선택해 앨범 화면을 체험할 수 있어요. 서버에는 업로드되지 않으며 새로고침하면 사라져요.</p><label className="album-upload">＋ 사진 선택<input type="file" accept="image/*" multiple onChange={e => { for (const file of Array.from(e.target.files ?? [])) { const reader = new FileReader(); reader.onload = () => setAlbumPhotos(previous => [...previous, { name: file.name, data: String(reader.result) }]); reader.readAsDataURL(file) } }} /></label><div className="album-grid">{albumPhotos.map((photo, index) => <button key={index} onClick={() => setToast(photo.name)}><img src={photo.data} alt={photo.name} /><small>{photo.name}</small></button>)}</div>{!albumPhotos.length && <Empty title="아직 사진이 없어요" text="사진 선택을 눌러 패밀리 앨범을 체험해보세요" />}</>
  if (boot && screen === 'programs') page = <><div className="eyebrow">돌봄 제도 안내 <Pro /></div><h2 className="hero-title">우리 동네<br />돌봄 혜택</h2><p className="hero-copy">제도를 선택해 안내 내용을 미리 볼 수 있어요. 실제 지역·자격 조회는 연결되지 않았어요.</p>{[['늘봄학교', '방과 후 돌봄 프로그램'], ['조부모 돌봄 지원', '지역별 지원 기준 확인']].map(([name, description]) => <button key={name} className="program-choice" onClick={() => setProgramSelected(name)}><strong>{name}</strong><small>{description}</small><span>›</span></button>)}{programSelected && <Card className="form-card"><strong>{programSelected}</strong><p>{programSelected === '늘봄학교' ? '학교별 운영 시간과 신청 방법은 해당 학교 안내를 확인하세요.' : '지원 여부와 신청 기준은 거주 지역의 공식 안내를 확인하세요.'}</p><button className="outline-button wide-button" onClick={() => setProgramSelected('')}>목록으로 돌아가기</button></Card>}</>

  const isFamilyRoot = ['home', 'family', 'assignments', 'tasks'].includes(screen)
  const showFab = ['home', 'family', 'assignments', 'tasks', 'schedule'].includes(screen)
  const showBack = !!boot && isFamilyScreen && !isFamilyRoot

  return <div className="app-shell"><aside className="screen-index"><div className="brand"><span className="brand-mark">LG</span><div><strong>Family Care</strong><small>기능 목업 개발 버전</small></div></div><p className="index-intro">Figma 기능 페이지의 주요 흐름을 화면별로 확인할 수 있어요.</p>{groups.map(g => <div key={g.title} className="index-group"><h2>{g.title}</h2>{g.pages.map(([id, label]) => <button key={id} className={screen === id ? 'active' : ''} onClick={() => go(id)}>{label}</button>)}</div>)}</aside>
    <div className="phone-wrap"><div className="phone"><main ref={contentRef} className="phone-content">{showBack && <button className="inline-back" aria-label="가족 케어로 돌아가기" onClick={() => go(screen === "review" ? "family" : "home")}>← 가족 케어</button>}{page}</main>{fabOpen && showFab && <><button className="fab-shade" aria-label="빠른 메뉴 닫기" onClick={() => setFabOpen(false)} /><div className="fab-menu" role="menu" aria-label="가족 케어 빠른 메뉴"><button className="featured" role="menuitem" onClick={() => go('capture')}><span className="fab-menu-icon">▣</span><span><strong>알림장 촬영</strong><small>탭 한 번으로 바로</small></span></button><button role="menuitem" onClick={() => go('schedule')}><span className="fab-menu-icon">▦</span><span><strong>일정 직접 입력</strong><small>충돌 자동 확인</small></span></button><button role="menuitem" onClick={() => go('chat')}><img className="fab-menu-image" src={voiceIcon} alt="" /><span><strong>케어 어시스턴트</strong><small>일정·배정 질문하기</small></span></button><button role="menuitem" onClick={() => go('emergency')}><span className="fab-menu-icon">!</span><span><strong>긴급 도움 요청 <Pro /></strong><small>가족 전체에 한 번에</small></span></button></div></>}{showFab && <button className={'floating-capture ' + (fabOpen ? 'open' : '')} aria-label={fabOpen ? '빠른 메뉴 닫기' : '빠른 메뉴 열기 (길게 눌러도 열림)'} aria-expanded={fabOpen} onTouchStart={() => { fabLongPressed.current = false; fabTimer.current = setTimeout(() => { fabLongPressed.current = true; setFabOpen(true) }, 450) }} onTouchEnd={() => { if (fabTimer.current) clearTimeout(fabTimer.current) }} onContextMenu={e => { e.preventDefault(); setFabOpen(true) }} onClick={() => { if (fabLongPressed.current) { fabLongPressed.current = false; return } setFabOpen(value => !value) }}>{fabOpen ? '×' : <img src={floatingIcon} alt="" />}</button>}<nav className="bottom-nav" aria-label="ThinQ 주요 메뉴"><button aria-current={screen === 'thinqHome' ? 'page' : undefined} className={screen === 'thinqHome' ? 'active' : ''} onClick={() => go('thinqHome')}><img src={homeIcon} alt="" />홈</button><button aria-current={screen === 'thinqDevice' ? 'page' : undefined} className={screen === 'thinqDevice' ? 'active' : ''} onClick={() => go('thinqDevice')}><img src={deviceIcon} alt="" />디바이스</button><button aria-current={screen === 'thinqCare' ? 'page' : undefined} className={screen === 'thinqCare' ? 'active' : ''} onClick={() => go('thinqCare')}><img src={careIcon} alt="" />케어</button><button aria-current={isFamilyScreen ? 'page' : undefined} className={isFamilyScreen ? 'active' : ''} onClick={() => go('home')}><img src={familyIcon} alt="" />가족{allPending.length > 0 && <i>{allPending.length}</i>}</button><button aria-current={screen === 'thinqMenu' ? 'page' : undefined} className={screen === 'thinqMenu' ? 'active' : ''} onClick={() => go('thinqMenu')}><span className="menu-bars">☰</span>메뉴</button></nav></div>{error && <div className="error-toast" role="alert"><button aria-label="닫기" onClick={() => setError('')}>×</button>{error}</div>}{toast && <div className="success-toast" role="status">{toast}</div>}</div>
    {showSheet && <div className="sheet-overlay" onClick={() => setShowSheet(false)}><div className="bottom-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><h2>특이사항이 있었나요?</h2><p>남긴 내용은 다음 담당자에게 필요한 때 전달돼요.</p><textarea className="text-area" rows={4} value={note} onChange={e => setNote(e.target.value)} placeholder="없으면 빈칸으로 완료해도 돼요" /><button className="primary-button wide-button" onClick={complete}>완료하고 가족에게 알리기</button><button className="text-link centered" onClick={() => setShowSheet(false)}>돌아가기</button></div></div>}
  </div>
}

export default App
