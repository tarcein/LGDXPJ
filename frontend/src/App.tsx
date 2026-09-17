import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api, send, upload, setFamilyToken, hasFamilyToken, ApiError, formatDate, formatTime, type Assignment, type Bootstrap, type CareItem, type Screen, type Suggestion, type FamilyMe, type FamilySession, type ChatAnswer, type EmergencyRequest, type CalendarConnection, type Notice, type AlbumPhoto, type Benefit, type BenefitLocation, type CareInstitution, type EligibilityCriteria } from './api'
import floatingIcon from '../../asset/floating.png'
import voiceIcon from '../../asset/voice.png'
import googleIcon from '../../asset/google.png'
import outlookIcon from '../../asset/outlook.png'
import calendarTabIcon from '../../bar_asset/twotone-calendar-month.png'
import careTabIcon from '../../bar_asset/baseline-child-care.png'
import homeTabIcon from '../../bar_asset/Vector.png'
import familyTabIcon from '../../bar_asset/Group 19.png'
import moreTabIcon from '../../bar_asset/Vector-1.png'

const groups: { title: string; pages: [Screen, string][] }[] = [
  { title: '서비스 탭', pages: [['home', '홈'], ['careHub', '케어'], ['schedule', '일정'], ['familyHub', '가족'], ['more', '더보기']] },
  { title: '돌봄 정보', pages: [['family', '알림장·돌봄 정보'], ['capture', '알림장 등록'], ['review', '추출 결과 확인'], ['assignments', '오늘의 배정'], ['suggestion', '배정 제안'], ['tasks', '오늘 할 일']] },
  { title: '돌봄 흐름', pages: [['schedule', '개인 일정'], ['exception', '예외 상황'], ['notifications', '알림함']] },
  { title: '가족 · 설정', pages: [['onboarding', '온보딩'], ['calendar', '캘린더 연동'], ['members', '가족 구성원'], ['permissions', '정보 공개 권한'], ['settings', '알림 설정'], ['plan', '플랜 비교']] },
  { title: '확장 화면', pages: [['chat', 'AI 채팅'], ['emergency', '긴급 요청'], ['location', '돌봄 동선'], ['gap', '돌봄 공백 예측'], ['album', '패밀리 앨범'], ['programs', '돌봄 제도']] },
]
const typeLabel: Record<string, string> = { SCHEDULE: '일정', SUPPLY: '준비물', TODO: '할 일', CHANGE: '변경사항' }
const childScheduleLabel: Record<string, string> = { ACADEMY: '학원', SCHOOL: '학교', AFTER_SCHOOL: '방과후', ACTIVITY: '활동', OTHER: '기타' }
const roleLabel: Record<string, string> = { PARENT: '부모', GRANDPARENT: '조부모', CAREGIVER: '돌봄 참여자' }
type DevLoginOption = { family_id: string; family_name: string; member_id: string; member_name: string; role: string; is_owner: boolean }
type KakaoSdk = {
  init: (key: string) => void
  isInitialized: () => boolean
  Share: { sendDefault: (options: { objectType: 'text'; text: string; link: { mobileWebUrl: string; webUrl: string }; buttonTitle: string }) => Promise<unknown> }
}
declare global { interface Window { Kakao?: KakaoSdk } }
const kakaoJavaScriptKey = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY?.trim()
const localDateTime = (value: string | null) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ''
const normalizeClock = (value: string) => {
  const compact = value.trim().replace(/\s/g, '')
  const digits = compact.replace(/\D/g, '')
  const candidate = compact.includes(':') ? compact : digits.length === 3 ? `0${digits[0]}:${digits.slice(1)}` : digits.length === 4 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : compact
  const match = candidate.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return ''
  const hour = Number(match[1]); const minute = Number(match[2])
  return hour <= 23 && minute <= 59 ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : ''
}

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
function ScheduleTimeFields({ date, start, end, onDate, onStart, onEnd }: {
  date: string; start: string; end: string
  onDate: (value: string) => void; onStart: (value: string) => void; onEnd: (value: string) => void
}) {
  const clean = (value: string) => value.replace(/[^\d:]/g, '').slice(0, 5)
  return <><label className="form-label">날짜</label><input className="form-control" type="date" value={date} onChange={event => onDate(event.target.value)} /><div className="time-pair direct-time"><label><span>시작 시간</span><input className="form-control" type="text" inputMode="numeric" autoComplete="off" placeholder="09:00" value={start} onChange={event => onStart(clean(event.target.value))} onBlur={() => { const normalized = normalizeClock(start); if (normalized) onStart(normalized) }} /></label><label><span>종료 시간</span><input className="form-control" type="text" inputMode="numeric" autoComplete="off" placeholder="10:00" value={end} onChange={event => onEnd(clean(event.target.value))} onBlur={() => { const normalized = normalizeClock(end); if (normalized) onEnd(normalized) }} /></label></div><p className="time-input-help">숫자로 직접 입력할 수 있어요. 예: 930 → 09:30</p></>
}
function AlbumPage({ plan, busy, groups, onUpload, onSelect, onPlan }: {
  plan: string; busy: boolean; groups: [string, AlbumPhoto[]][]
  onUpload: (files: File[]) => void; onSelect: (photo: AlbumPhoto) => void; onPlan: () => void
}) {
  return <><div className="eyebrow">패밀리 앨범 <Pro /></div><h2 className="hero-title">가족의 순간을<br />함께 모아요</h2><p className="hero-copy">직접 올린 사진과 돌봄 완료 사진을 가족방 DB에 저장해 날짜별로 함께 봐요.</p>{plan === 'PRO' ? <><label className="album-upload">{busy ? '저장 중…' : '＋ 사진 선택'}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={event => { onUpload(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = '' }} /></label>{groups.map(([date, photos]) => <section className="album-date-group" key={date}><Section>{new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(date + 'T12:00:00'))}</Section><div className="album-grid">{photos.map(photo => <button key={photo.id} onClick={() => onSelect(photo)}><img src={photo.data_url} alt={photo.caption || photo.file_name} /><small>{photo.kind === 'CARE_COMPLETION' ? '돌봄 완료 · ' : ''}{photo.caption || photo.file_name}</small></button>)}</div></section>)}{!groups.length && <Empty title="아직 사진이 없어요" text="사진을 올리거나 돌봄 완료 때 사진을 남겨보세요" />}</> : <button className="primary-button wide-button" onClick={onPlan}>Pro에서 패밀리 앨범 사용</button>}</>
}
function AlbumLightbox({ photo, onClose }: { photo: AlbumPhoto; onClose: () => void }) {
  return <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label="사진 크게 보기" onClick={onClose}><div className="photo-lightbox-panel" onClick={event => event.stopPropagation()}><button className="photo-lightbox-close" aria-label="사진 닫기" onClick={onClose}>×</button><img src={photo.data_url} alt={photo.caption || photo.file_name} /><div className="photo-lightbox-info"><strong>{photo.caption || photo.file_name}</strong><small>{formatDate(photo.created_at)} · {photo.kind === 'CARE_COMPLETION' ? '돌봄 완료 사진' : '패밀리 앨범'}</small><a className="primary-button" href={photo.data_url} download={photo.file_name || `family-photo-${photo.id}`}>사진 다운로드</a></div></div></div>
}
function ProgramsPage({ plan, keyword, city, district, savedLocation, busy, locationBusy, programs, institutions, eligibility, active, onKeyword, onCity, onDistrict, onSaveLocation, onSearch, onSelect, onPlan }: {
  plan: string; keyword: string; city: string; district: string; savedLocation: BenefitLocation; busy: boolean; locationBusy: boolean
  programs: Benefit[]; institutions: CareInstitution[]; eligibility: EligibilityCriteria | null; active?: Benefit
  onKeyword: (value: string) => void; onCity: (value: string) => void; onDistrict: (value: string) => void
  onSaveLocation: () => void; onSearch: () => void; onSelect: (id: string) => void; onPlan: () => void
}) {
  const scopeLabel = (program: Benefit) => program.scope === 'DISTRICT' ? savedLocation.district + ' 사업' : program.scope === 'CITY' ? savedLocation.city + ' 사업' : '전국 공통'
  const hasLocation = !!savedLocation.city && !!savedLocation.district
  const currency = (value: number) => new Intl.NumberFormat('ko-KR').format(value) + '원'
  const households = eligibility ? [...new Set(eligibility.household_income.map(row => row.household_size))].sort((a, b) => a - b) : []
  const incomeFor = (size: number, percent: number) => eligibility?.household_income.find(row => row.household_size === size && row.median_percent === percent)?.monthly_income
  const dataDate = eligibility?.data_date?.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')

  return <>
    <div className="eyebrow">돌봄 제도 안내 <Pro /></div>
    <h2 className="hero-title">우리 지역에서 받을 수 있는<br />공공 돌봄 혜택</h2>
    <p className="hero-copy">시·도와 시·군·구까지만 저장하고, 보조금24 결과 중 아동·자녀·양육·보육과 관련된 돌봄 제도만 찾아요.</p>
    {plan !== 'PRO' ? <button className="primary-button wide-button" onClick={onPlan}>Pro에서 돌봄 제도 검색</button> : <>
      <Card className="benefit-location">
        <strong>우리 집 지역</strong>
        <div className="benefit-location-fields">
          <label><span>시·도</span><input className="form-control" aria-label="혜택 지역 시·도" value={city} onChange={event => onCity(event.target.value)} placeholder="서울특별시" /></label>
          <label><span>시·군·구</span><input className="form-control" aria-label="혜택 지역 시·군·구" value={district} onChange={event => onDistrict(event.target.value)} placeholder="은평구" /></label>
        </div>
        <button className="outline-button wide-button" disabled={locationBusy || !city.trim() || !district.trim()} onClick={onSaveLocation}>{locationBusy ? '지역 확인 중…' : hasLocation ? '지역 변경하고 다시 찾기' : '이 지역으로 찾기'}</button>
        <small>상세 주소는 입력하거나 저장하지 않아요.</small>
      </Card>
      {hasLocation && <>
        <Section>지역 아이돌봄 연결기관</Section>
        <p className="source-label">{savedLocation.city} {savedLocation.district} · 출처 아이돌봄 서비스 제공기관 현황</p>
        {institutions.map(institution => <Card className="institution-card" key={institution.id}>
          <strong>{institution.name}</strong>
          <p>{institution.address}</p>
          {institution.service_area && <small>서비스 지역 · {institution.service_area}</small>}
          {(institution.direct_phone || institution.phone) && <a href={'tel:' + (institution.direct_phone || institution.phone)}>전화 {institution.direct_phone || institution.phone}</a>}
        </Card>)}
        {!busy && !institutions.length && <Empty title="이 지역의 제공기관을 찾지 못했어요" text="지역명을 확인하거나 아이돌봄 대표전화 1577-2514로 문의해보세요" />}

        {eligibility && <>
          <Section>아이돌봄 지원 기준</Section>
          <Card className="eligibility-card">
            <div className="eligibility-heading"><strong>{eligibility.year || '공개'}년 소득 기준</strong><small>데이터 갱신일 {dataDate || '확인 필요'}</small></div>
            <div className="criteria-scroll"><table><thead><tr><th>가구원</th><th>75%</th><th>120%</th><th>150%</th></tr></thead><tbody>{households.map(size => <tr key={size}><th>{size}인</th>{[75, 120, 150].map(percent => <td key={percent}>{incomeFor(size, percent) ? currency(incomeFor(size, percent)!) : '—'}</td>)}</tr>)}</tbody></table></div>
            <details className="insurance-details"><summary>건강보험료 기준 {eligibility.health_insurance.length}건 보기</summary><div className="criteria-scroll insurance-table"><table><thead><tr><th>월소득</th><th>직장</th><th>지역</th><th>혼합</th></tr></thead><tbody>{eligibility.health_insurance.map((row, index) => <tr key={row.income + '-' + index}><td>{currency(row.income)}</td><td>{currency(row.employee_premium)}</td><td>{currency(row.regional_premium)}</td><td>{currency(row.mixed_premium)}</td></tr>)}</tbody></table></div></details>
            <p className="criteria-disclaimer">{eligibility.disclaimer}</p>
          </Card>
        </>}

        <Section>보조금24 돌봄 제도</Section>
        <form className="benefit-search" onSubmit={event => { event.preventDefault(); onSearch() }}><input className="form-control" aria-label="돌봄 혜택 검색어" value={keyword} onChange={event => onKeyword(event.target.value)} placeholder="예: 돌봄, 아이돌봄, 보육" /><button className="primary-button" disabled={busy || !keyword.trim()}>{busy ? '검색 중…' : '검색'}</button></form>
        <p className="source-label">{savedLocation.city} {savedLocation.district} · 출처 보조금24 공공서비스 API</p>
        {!active && programs.map(program => <button key={program.id} className="program-choice" onClick={() => onSelect(program.id)}><span><em className={'program-scope ' + program.scope.toLowerCase()}>{scopeLabel(program)}</em><strong>{program.name}</strong><small>{program.organization} · {program.category}</small></span><b>›</b></button>)}
        {!busy && !active && !programs.length && <Empty title="이 지역의 검색 결과가 없어요" text="다른 제도 이름이나 돌봄 유형으로 검색해보세요" />}
        {active && <Card className="benefit-detail"><span className={'program-scope ' + active.scope.toLowerCase()}>{scopeLabel(active)}</span><h3>{active.name}</h3><p className="benefit-summary">{active.summary}</p>{active.target && <><strong>지원 대상</strong><p>{active.target}</p></>}{active.content && <><strong>지원 내용</strong><p>{active.content}</p></>}{active.criteria && <><strong>선정 기준</strong><p>{active.criteria}</p></>}{active.deadline && <><strong>신청 기한</strong><p>{active.deadline}</p></>}{active.method && <><strong>신청 방법</strong><p>{active.method}</p></>}{active.contact && <><strong>문의</strong><p>{active.contact}</p></>}{active.url && <a className="primary-button" href={active.url} target="_blank" rel="noreferrer">공식 상세 보기</a>}<button className="outline-button wide-button" onClick={() => onSelect('')}>목록으로</button></Card>}
      </>}
    </>}
  </>
}

function App() {
  const invitationFromUrl = new URLSearchParams(location.search).get('invite')?.trim().toUpperCase() ?? ''
  const roleFromUrl = new URLSearchParams(location.search).get('role')?.trim().toUpperCase() ?? ''
  const invitedRole = ['PARENT', 'GRANDPARENT', 'CAREGIVER'].includes(roleFromUrl) ? roleFromUrl : 'CAREGIVER'
  const [boot, setBoot] = useState<Bootstrap | null>(null)
  const [me, setMe] = useState<FamilyMe | null>(null)
  const [screen, setScreen] = useState<Screen>(() => invitationFromUrl ? 'onboarding' : hasFamilyToken() ? (new URLSearchParams(location.search).has('calendar') ? 'calendar' : 'home') : 'onboarding')
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
  const [scheduleKind, setScheduleKind] = useState<'WORK' | 'ROUTINE'>('ROUTINE')
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toLocaleDateString('sv-SE'))
  const [scheduleStartTime, setScheduleStartTime] = useState('09:00')
  const [scheduleEndTime, setScheduleEndTime] = useState('10:00')
  const [scheduleScope, setScheduleScope] = useState('all')
  const [scheduleForm, setScheduleForm] = useState<'PERSONAL' | 'CHILD'>('CHILD')
  const [scheduleSheet, setScheduleSheet] = useState<'NONE' | 'DAY' | 'CHOOSER' | 'FORM'>('NONE')
  const [scheduleRepeat, setScheduleRepeat] = useState(false)
  const [scheduleRepeatDays, setScheduleRepeatDays] = useState<number[]>([])
  const [scheduleRepeatUntil, setScheduleRepeatUntil] = useState('')
  const [childScheduleChild, setChildScheduleChild] = useState('')
  const [childScheduleCategory, setChildScheduleCategory] = useState('ACADEMY')
  const [selectedDate, setSelectedDate] = useState(() => new Date().toLocaleDateString('sv-SE'))
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [calendarConnections, setCalendarConnections] = useState<CalendarConnection[]>([])
  const [memberNameInput, setMemberNameInput] = useState('')
  const [memberRole, setMemberRole] = useState('GRANDPARENT')
  const [note, setNote] = useState('')
  const [showSheet, setShowSheet] = useState(false)
  const [alternative, setAlternative] = useState('grandma')
  const [reason, setReason] = useState('일정이 겹쳐 다른 담당자가 필요해요')
  const [onboardMode, setOnboardMode] = useState<'create' | 'join'>(() => invitationFromUrl ? 'join' : 'create')
  const [onboardFamilyName, setOnboardFamilyName] = useState('')
  const [onboardName, setOnboardName] = useState('')
  const [onboardBusy, setOnboardBusy] = useState(false)
  const [onboardInviteCode, setOnboardInviteCode] = useState(invitationFromUrl)
  const [onboardRole, setOnboardRole] = useState(invitedRole)
  const [inviteRole, setInviteRole] = useState('GRANDPARENT')
  const [inviteStep, setInviteStep] = useState<'preview' | 'profile' | 'intro'>(() => invitationFromUrl ? 'preview' : 'profile')
  const [invitePreview, setInvitePreview] = useState<{ family_name: string; owner_name: string; expires_at: string } | null>(null)
  const [inviteCode, setInviteCode] = useState('')
  const [inviteExpiresAt, setInviteExpiresAt] = useState('')
  const [devLoginOptions, setDevLoginOptions] = useState<DevLoginOption[]>([])
  const [childNameInput, setChildNameInput] = useState('')
  const [childAgeInput, setChildAgeInput] = useState('')
  const [chatDraft, setChatDraft] = useState('')
  const [chatMessages, setChatMessages] = useState<{ from: 'me' | 'agent'; text: string }[]>([])
  const [chatUsedToday, setChatUsedToday] = useState(0)
  const [chatBusy, setChatBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [completionRecording, setCompletionRecording] = useState(false)
  const [completionVoiceBusy, setCompletionVoiceBusy] = useState(false)
  const [completionPhoto, setCompletionPhoto] = useState<File | null>(null)
  const [completionPreview, setCompletionPreview] = useState('')
  const [emergencyItem, setEmergencyItem] = useState('')
  const [emergencyReason, setEmergencyReason] = useState('긴급 돌봄 도움이 필요합니다')
  const [emergencyRequests, setEmergencyRequests] = useState<EmergencyRequest[]>([])
  const [subscription, setSubscription] = useState<{ plan: string; status: string; developer_preview: boolean; dev_switch_available: boolean } | null>(null)
  const [planBusy, setPlanBusy] = useState(false)
  const [plans, setPlans] = useState<{ id: string; status: string }[]>([])
  const [features, setFeatures] = useState<{ id: string; available: boolean; backend_state: string }[]>([])
  const [albumPhotos, setAlbumPhotos] = useState<AlbumPhoto[]>([])
  const [albumBusy, setAlbumBusy] = useState(false)
  const [selectedAlbumPhoto, setSelectedAlbumPhoto] = useState<AlbumPhoto | null>(null)
  const [programSelected, setProgramSelected] = useState('')
  const [benefitKeyword, setBenefitKeyword] = useState('돌봄')
  const [benefits, setBenefits] = useState<Benefit[]>([])
  const [careInstitutions, setCareInstitutions] = useState<CareInstitution[]>([])
  const [eligibilityCriteria, setEligibilityCriteria] = useState<EligibilityCriteria | null>(null)
  const [benefitsBusy, setBenefitsBusy] = useState(false)
  const [benefitLocation, setBenefitLocation] = useState<BenefitLocation>({ city: '', district: '', updated_at: '' })
  const [benefitCity, setBenefitCity] = useState('')
  const [benefitDistrict, setBenefitDistrict] = useState('')
  const [benefitLocationBusy, setBenefitLocationBusy] = useState(false)
  const [deviceNoticeDemo, setDeviceNoticeDemo] = useState(false)
  const contentRef = useRef<HTMLElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const cancelRecordingRef = useRef(false)
  const completionRecorderRef = useRef<MediaRecorder | null>(null)
  const completionCancelRecordingRef = useRef(false)
  const completionCameraInputRef = useRef<HTMLInputElement>(null)
  const completionPhotoInputRef = useRef<HTMLInputElement>(null)
  const initialScreenRef = useRef(screen)
  const seenNoticeIdsRef = useRef<Set<string>>(new Set())
  const benefitsLoadedRef = useRef(false)

  const reportError = (failure: unknown) => {
    if (failure instanceof ApiError && failure.status === 401) {
      const hadToken = hasFamilyToken()
      setFamilyToken(null); setBoot(null); setMe(null); setScreen('onboarding')
      history.replaceState({ ...history.state, lgdxScreen: 'onboarding' }, '')
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
    nextMe.member.is_owner = Boolean(nextMe.member.is_owner)
    nextBoot.members = nextBoot.members.map(item => ({ ...item, is_owner: Boolean(item.is_owner) }))
    setMe(nextMe); setBoot(nextBoot)
    if (!seenNoticeIdsRef.current.size) nextBoot.notifications.forEach(notice => seenNoticeIdsRef.current.add(notice.id))
    setViewer(previous => nextMe.authenticated || !nextBoot.members.some(m => m.id === previous) ? nextMe.member.id : previous)
    setScheduleMember(nextMe.member.id)
    setAlternative(previous => nextBoot.members.some(m => m.id === previous) ? previous : nextBoot.members[0]?.id ?? '')
    setCaptureChild(previous => nextBoot.children.some(c => c.id === previous) ? previous : nextBoot.children[0]?.id ?? '')
    setChildScheduleChild(previous => nextBoot.children.some(c => c.id === previous) ? previous : nextBoot.children[0]?.id ?? '')
  }
  const activeFamilyId = boot?.family.id
  // Defer the session bootstrap so every state update follows the API response.
  useEffect(() => {
    if (!invitationFromUrl) void Promise.resolve().then(load).catch(reportError)
  }, [invitationFromUrl])
  useEffect(() => {
    history.replaceState({ ...history.state, lgdxScreen: initialScreenRef.current }, '')
    const handleBack = (event: PopStateEvent) => {
      setScheduleSheet('NONE'); setShowSheet(false); setSelectedAlbumPhoto(null)
      const target = event.state?.lgdxScreen as Screen | undefined
      if (target) {
        setError(''); setScreen(target)
        return
      }
      const fallback: Screen = hasFamilyToken() ? 'home' : 'onboarding'
      history.replaceState({ ...history.state, lgdxScreen: fallback }, '')
      setScreen(fallback)
    }
    addEventListener('popstate', handleBack)
    return () => removeEventListener('popstate', handleBack)
  }, [])
  useEffect(() => {
    if (invitationFromUrl) api<{ family_name: string; owner_name: string; expires_at: string }>('/families/invitations/' + encodeURIComponent(invitationFromUrl))
      .then(setInvitePreview).catch(reportError)
  }, [invitationFromUrl])
  useEffect(() => {
    if (screen !== 'onboarding' || invitationFromUrl) return
    api<{ members: DevLoginOption[] }>('/families/dev-login-options')
      .then(result => setDevLoginOptions(result.members)).catch(() => setDevLoginOptions([]))
  }, [screen, invitationFromUrl])
  useEffect(() => {
    if (screen === 'chat' && activeFamilyId) Promise.all([
      api<{ messages: { role: string; content: string }[] }>('/assistant/history'),
      api<{ usage: { chat_tokens_today: number } }>('/features'),
    ]).then(([history, available]) => {
      setChatMessages(history.messages.map(m => ({ from: m.role === 'user' ? 'me' : 'agent', text: m.content })))
      setChatUsedToday(available.usage.chat_tokens_today)
    }).catch(reportError)
    if ((screen === 'plan' || screen === 'more') && activeFamilyId) Promise.all([
      api<{ plan: string; status: string; developer_preview: boolean; dev_switch_available: boolean }>('/subscription'),
      api<{ features: { id: string; available: boolean; backend_state: string }[] }>('/features'),
      api<{ plans: { id: string; status: string }[] }>('/plans'),
    ]).then(([current, available, products]) => { setSubscription(current); setFeatures(available.features); setPlans(products.plans) }).catch(reportError)
    if (screen === 'emergency' && activeFamilyId) api<{ requests: EmergencyRequest[] }>('/emergency-requests')
      .then(result => setEmergencyRequests(result.requests)).catch(reportError)
    if (screen === 'calendar' && activeFamilyId) api<{ connections: CalendarConnection[] }>('/calendar-connections')
      .then(result => setCalendarConnections(result.connections)).catch(reportError)
    if (screen === 'album' && activeFamilyId && boot?.family.plan === 'PRO') api<{ photos: AlbumPhoto[] }>('/album/photos')
      .then(result => setAlbumPhotos(result.photos)).catch(reportError)
    if (screen === 'programs' && activeFamilyId && boot?.family.plan === 'PRO' && !benefitsLoadedRef.current) {
      benefitsLoadedRef.current = true
      setBenefitsBusy(true)
      api<BenefitLocation>('/benefits/location').then(async location => {
        setBenefitLocation(location); setBenefitCity(location.city); setBenefitDistrict(location.district)
        if (!location.city || !location.district) { setBenefits([]); setCareInstitutions([]); setEligibilityCriteria(null); return }
        const query = new URLSearchParams({ keyword: benefitKeyword, city: location.city, district: location.district })
        const areaQuery = new URLSearchParams({ city: location.city, district: location.district })
        const [programData, institutionData, criteriaData] = await Promise.all([
          api<{ programs: Benefit[] }>('/benefits?' + query),
          api<{ institutions: CareInstitution[] }>('/benefits/institutions?' + areaQuery),
          api<EligibilityCriteria>('/benefits/eligibility-criteria'),
        ])
        setBenefits(programData.programs); setCareInstitutions(institutionData.institutions); setEligibilityCriteria(criteriaData)
      }).catch(error => { benefitsLoadedRef.current = false; reportError(error) }).finally(() => setBenefitsBusy(false))
    }
  }, [screen, activeFamilyId, boot?.family.plan, benefitKeyword])
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 3200); return () => clearTimeout(timer) } }, [toast])
  useEffect(() => { contentRef.current?.scrollTo(0, 0) }, [screen])
  useEffect(() => { if (screen !== 'chat' && recorderRef.current?.state === 'recording') { cancelRecordingRef.current = true; recorderRef.current.stop() } }, [screen])
  useEffect(() => { if (!showSheet && completionRecorderRef.current?.state === 'recording') { completionCancelRecordingRef.current = true; completionRecorderRef.current.stop() } }, [showSheet])
  const run = async (work: () => Promise<unknown>, message: string) => {
    try { setError(''); await work(); await load(); setToast(message) }
    catch (e) { reportError(e) }
  }
  const go = (target: Screen) => {
    setError('')
    if (target !== screen) history.pushState({ ...history.state, lgdxScreen: target }, '')
    setScreen(target)
    if (target === 'home') load().catch(reportError)
  }
  const openAlbumPhoto = (photo: AlbumPhoto) => {
    history.pushState({ ...history.state, lgdxScreen: screen, lgdxOverlay: 'album-photo' }, '')
    setSelectedAlbumPhoto(photo)
  }
  const navigateFromNotice = async (notice: Notice) => {
    if (notice.action_type === 'ASSIGNMENT_REQUEST' && notice.action_id) {
      setAssignmentId(notice.action_id)
      if (me?.member.id) setViewer(me.member.id)
      go('tasks')
    } else if (notice.action_type === 'ASSIGNMENT_RESULT') {
      setAssignmentId(notice.action_id ?? null)
      go('assignments')
    } else if (notice.action_type === 'CARE_SUGGESTION' && notice.action_id) {
      const result = await api<{ item: CareItem; suggestions: Suggestion[] }>('/items/' + notice.action_id + '/suggestions')
      setItemId(result.item.id); setSuggestions(result.suggestions); go('suggestion')
    } else if (notice.action_type === 'HANDOFF') {
      if (me?.member.id) setViewer(me.member.id)
      go('tasks')
    }
  }
  const openNotice = async (notice: Notice) => {
    await navigateFromNotice(notice)
    if (!notice.is_read) {
      try {
        await send('/notifications/' + notice.id + '/read', 'PATCH')
        setBoot(previous => previous ? { ...previous, notifications: previous.notifications.map(item => item.id === notice.id ? { ...item, is_read: 1 } : item) } : previous)
      } catch (e) { reportError(e) }
    }
  }
  const enableBrowserNotifications = async () => {
    if (!('Notification' in window)) { setError('이 브라우저는 시스템 알림을 지원하지 않아요.'); return }
    const permission = await Notification.requestPermission()
    setToast(permission === 'granted' ? '이 기기에서 돌봄 요청 알림을 받을 수 있어요' : '브라우저 알림 권한이 허용되지 않았어요')
  }
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
      if (invitationFromUrl) {
        const cleanUrl = new URL(location.href)
        cleanUrl.searchParams.delete('invite')
        cleanUrl.searchParams.delete('role')
        history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash)
      }
      const targetScreen: Screen = onboardMode === 'create' ? 'members' : 'home'
      history.replaceState({ ...history.state, lgdxScreen: targetScreen }, '')
      setScreen(targetScreen)
      setToast(onboardMode === 'create' ? '가족방을 만들었어요. 초대 링크를 가족에게 공유해주세요.' : '가족방에 참여했어요.')
    } catch (e) { reportError(e) }
    finally { setOnboardBusy(false) }
  }
  const resetFamilySession = () => {
    setFamilyToken(null); setBoot(null); setMe(null); setChatMessages([]); setInviteCode(''); setSubscription(null); setFeatures([])
    history.replaceState({ ...history.state, lgdxScreen: 'onboarding' }, '')
    setScreen('onboarding')
  }
  const loginForTest = async (memberId: string) => {
    if (onboardBusy) return
    setOnboardBusy(true)
    try {
      const result = await send<FamilySession>('/families/dev-login', 'POST', { member_id: memberId })
      setFamilyToken(result.access_token)
      await load()
      history.replaceState({ ...history.state, lgdxScreen: 'home' }, '')
      setScreen('home'); setToast('테스트 사용자로 로그인했어요')
    } catch (failure) { reportError(failure) }
    finally { setOnboardBusy(false) }
  }
  const leaveFamily = async () => {
    if (!me?.authenticated) { resetFamilySession(); return }
    if (me.member.is_owner) { setError('주돌봄자는 다른 구성원을 먼저 관리해야 하며 현재는 방을 나갈 수 없어요.'); return }
    if (!confirm('이 가족방에서 나갈까요? 다시 들어오려면 새 초대 링크가 필요해요.')) return
    try { await send('/families/leave', 'POST'); resetFamilySession(); setToast('가족방에서 나왔어요') }
    catch (e) { reportError(e) }
  }
  const transferOwnership = (targetMemberId: string, targetName: string) => {
    if (!confirm(`${targetName}님에게 주돌봄자 권한을 넘길까요? 이후 나는 일반 구성원으로 변경됩니다.`)) return
    void run(() => send('/members/' + targetMemberId + '/transfer-ownership', 'POST'), `${targetName}님에게 주돌봄자 권한을 넘겼어요`)
  }
  const plan = boot?.family.plan ?? 'FREE'
  const inviteLink = inviteCode ? (() => { const url = new URL(location.origin + location.pathname); url.searchParams.set('invite', inviteCode); url.searchParams.set('role', inviteRole); return url.toString() })() : ''
  const shareInvite = async () => {
    if (!inviteLink) return
    const field = document.createElement('textarea')
    field.value = inviteLink; field.style.position = 'fixed'; field.style.opacity = '0'
    document.body.appendChild(field); field.select(); document.execCommand('copy'); field.remove()
    try {
      if (kakaoJavaScriptKey && window.Kakao) {
        if (!window.Kakao.isInitialized()) window.Kakao.init(kakaoJavaScriptKey)
        await window.Kakao.Share.sendDefault({
          objectType: 'text',
          text: `${boot?.family.name ?? 'Family Care'} 가족방에 초대했어요. 링크를 열어 이름을 입력하고 참여해주세요.`,
          link: { mobileWebUrl: inviteLink, webUrl: inviteLink },
          buttonTitle: '가족방 참여하기',
        })
        setToast('초대 링크를 복사하고 카카오톡 공유창을 열었어요')
        return
      }
      if (navigator.share) {
        await navigator.share({ title: boot?.family.name ?? 'Family Care 가족방', text: '가족방 초대 링크예요. 링크를 열고 이름을 입력해 참여해주세요.', url: inviteLink })
        setToast('링크를 복사하고 공유창을 열었어요')
      } else {
        setToast('초대 링크를 복사했어요. 카카오톡에 붙여넣어 보내주세요')
      }
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError') { setToast('초대 링크는 복사해두었어요'); return }
      setError('카카오톡 공유를 열지 못했어요. 링크는 복사했으니 JavaScript 키와 도메인 설정을 확인해주세요.')
    }
  }
  const members = boot?.members.filter(member => member.status === 'ACTIVE') ?? []
  const member = (id: string) => boot?.members.find(m => m.id === id)?.name ?? '가족'
  const child = (id: string | null) => boot?.children.find(c => c.id === id)?.name ?? '가족'
  const items = boot?.items.filter(i => filter === 'all' || i.child_id === filter) ?? []
  const pending = items.filter(i => i.status === 'NEEDS_REVIEW')
  const allPending = boot?.items.filter(i => i.status === 'NEEDS_REVIEW') ?? []
  const assignments = boot?.assignments.filter(a => !['CANCELED', 'REJECTED'].includes(a.status)) ?? []
  const viewerAssignments = assignments.filter(a => a.assignee_id === viewer)
  const itemFor = (a: Assignment) => boot?.items.find(i => i.id === a.item_id)
  const activeAssignmentForItem = (careItemId: string) => assignments.find(a => a.item_id === careItemId && ['ACCEPTED', 'PROPOSED'].includes(a.status))
  const caregiverForChildSchedule = (scheduleId: string) => {
    const careItem = boot?.items.find(item => item.child_schedule_id === scheduleId)
    const assignment = careItem ? activeAssignmentForItem(careItem.id) : undefined
    return assignment ? { name: member(assignment.assignee_id), status: assignment.status } : null
  }
  const caregiverForCareItem = (careItemId: string) => {
    const assignment = activeAssignmentForItem(careItemId)
    return assignment ? { name: member(assignment.assignee_id), status: assignment.status } : null
  }
  const activeItem = boot?.items.find(i => i.id === itemId) ?? null
  const activeAssignment = boot?.assignments.find(a => a.id === assignmentId) ?? null
  const unread = boot?.notifications.filter(n => !n.is_read).length ?? 0
  const preference = boot?.notification_preferences.find(p => p.member_id === viewer)
  const appNotices = !!(preference?.app_enabled ?? 1)
  const dailyDigest = !!(preference?.daily_digest_enabled ?? 1)
  useEffect(() => {
    if (!activeFamilyId || !me?.authenticated) return
    const poll = async () => {
      try {
        const next = await api<Bootstrap>('/bootstrap')
        const incoming = next.notifications.filter(notice => !notice.is_read && !seenNoticeIdsRef.current.has(notice.id))
        next.notifications.forEach(notice => seenNoticeIdsRef.current.add(notice.id))
        setBoot(next)
        if (appNotices && 'Notification' in window && Notification.permission === 'granted') {
          incoming.forEach(notice => {
            const systemNotice = new Notification(notice.title, { body: notice.body, tag: notice.id })
            systemNotice.onclick = () => {
              window.focus()
              if (notice.action_type === 'ASSIGNMENT_REQUEST' && notice.action_id) {
                setAssignmentId(notice.action_id); setViewer(me.member.id)
                history.pushState({ ...history.state, lgdxScreen: 'tasks' }, ''); setScreen('tasks')
              } else if (notice.action_type === 'ASSIGNMENT_RESULT') {
                setAssignmentId(notice.action_id ?? null)
                history.pushState({ ...history.state, lgdxScreen: 'assignments' }, ''); setScreen('assignments')
              } else if (notice.action_type === 'CARE_SUGGESTION' && notice.action_id) {
                void api<{ item: CareItem; suggestions: Suggestion[] }>('/items/' + notice.action_id + '/suggestions').then(result => {
                  setItemId(result.item.id); setSuggestions(result.suggestions)
                  history.pushState({ ...history.state, lgdxScreen: 'suggestion' }, ''); setScreen('suggestion')
                }).catch(reportError)
              } else if (notice.action_type === 'HANDOFF') {
                setViewer(me.member.id)
                history.pushState({ ...history.state, lgdxScreen: 'tasks' }, ''); setScreen('tasks')
              }
              systemNotice.close()
            }
          })
        }
      } catch (e) { reportError(e) }
    }
    const timer = setInterval(poll, 10_000)
    return () => clearInterval(timer)
  }, [activeFamilyId, me?.authenticated, me?.member.id, appNotices])
  const today = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())
  const dateKey = (value: string | Date) => new Date(value).toLocaleDateString('sv-SE')
  const albumGroups = Object.entries(albumPhotos.reduce<Record<string, AlbumPhoto[]>>((groups, photo) => {
    const key = dateKey(photo.created_at)
    ;(groups[key] ??= []).push(photo)
    return groups
  }, {})).sort(([left], [right]) => right.localeCompare(left))
  const activeBenefit = benefits.find(program => program.id === programSelected)
  const calendarsReady = calendarConnections.length === 2 && calendarConnections.every(connection => connection.configured)
  const todayKey = dateKey(new Date())
  const todayCare = boot?.items.filter(i => !i.child_schedule_id && i.starts_at && dateKey(i.starts_at) === todayKey && i.item_type !== 'SUPPLY') ?? []
  const todayPersonal = boot?.schedules.filter(s => dateKey(s.starts_at) === todayKey) ?? []
  const todayChildSchedules = boot?.child_schedules.filter(s => dateKey(s.starts_at) === todayKey) ?? []
  const supplies = boot?.items.filter(i => i.item_type === 'SUPPLY' && i.status !== 'DONE') ?? []
  const childPalette = ['#c4123f', '#5468d4', '#bf8a22', '#2f7a62', '#8957b2']
  const childColor = (childId: string | null) => childPalette[Math.max(0, boot?.children.findIndex(c => c.id === childId) ?? 0) % childPalette.length]
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const start = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1 - calendarMonth.getDay())
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
  })
  const filteredChildSchedules = boot?.child_schedules.filter(s => scheduleScope === 'all' || s.child_id === scheduleScope) ?? []
  const filteredCareSchedules = boot?.items.filter(i => !i.child_schedule_id && i.starts_at && ['SCHEDULE', 'CHANGE', 'TODO'].includes(i.item_type) && (scheduleScope === 'all' || i.child_id === scheduleScope)) ?? []
  const calendarEventsFor = (key: string) => [
    ...(scheduleScope === 'all' ? (boot?.schedules ?? []).filter(s => dateKey(s.starts_at) === key).map(s => ({ id: 'personal-' + s.id, title: s.title, color: '#838892' })) : []),
    ...filteredChildSchedules.filter(s => dateKey(s.starts_at) === key).map(s => ({ id: 'child-' + s.id, title: s.title, color: childColor(s.child_id) })),
    ...filteredCareSchedules.filter(i => dateKey(i.starts_at!) === key).map(i => ({ id: 'care-' + i.id, title: i.title, color: childColor(i.child_id) })),
  ]
  const rootScreens: Screen[] = ['schedule', 'careHub', 'home', 'familyHub', 'more']
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
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('음성 녹음은 HTTPS 주소 또는 이 PC의 localhost에서 사용할 수 있어요. 휴대폰은 start-secure-phone.ps1로 실행한 HTTPS 주소로 접속해주세요.'); return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type))
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
      if (e instanceof DOMException && e.name === 'NotAllowedError') setError('브라우저 사이트 설정에서 마이크 권한을 허용해주세요.')
      else if (e instanceof DOMException && e.name === 'NotFoundError') setError('사용할 수 있는 마이크를 찾지 못했어요.')
      else reportError(e)
    }
  }

  const transcribeCompletionNote = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) { setError('음성은 20MB 이하만 보낼 수 있어요'); return }
    setCompletionVoiceBusy(true); setError('')
    try {
      const form = new FormData(); form.append('file', file); form.append('purpose', 'HANDOFF_NOTE')
      const result = await upload<{ text: string }>('/audio/transcribe', form)
      setNote(previous => [previous.trim(), result.text.trim()].filter(Boolean).join(' '))
      setToast('음성을 특이사항으로 옮겼어요')
    } catch (e) { reportError(e) }
    finally { setCompletionVoiceBusy(false) }
  }
  const toggleCompletionRecording = async () => {
    if (completionRecording) { completionRecorderRef.current?.stop(); return }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('음성 녹음은 HTTPS 주소 또는 이 PC의 localhost에서 사용할 수 있어요. 휴대폰은 start-secure-phone.ps1로 실행한 HTTPS 주소로 접속해주세요.'); return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      const chunks: BlobPart[] = []
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = () => {
        setCompletionRecording(false); stream.getTracks().forEach(track => track.stop())
        const type = recorder.mimeType.split(';')[0] || 'audio/webm'
        if (chunks.length && !completionCancelRecordingRef.current) void transcribeCompletionNote(
          new File(chunks, `handoff.${type.includes('mp4') ? 'm4a' : 'webm'}`, { type }),
        )
      }
      completionCancelRecordingRef.current = false; completionRecorderRef.current = recorder
      recorder.start(); setCompletionRecording(true)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') setError('브라우저 사이트 설정에서 마이크 권한을 허용해주세요.')
      else if (e instanceof DOMException && e.name === 'NotFoundError') setError('사용할 수 있는 마이크를 찾지 못했어요.')
      else reportError(e)
    }
  }
  const selectCompletionPhoto = (file: File | undefined) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('10MB 이하 JPG, PNG, WebP 사진을 선택해주세요'); return }
    setCompletionPhoto(file)
    const reader = new FileReader(); reader.onload = () => setCompletionPreview(String(reader.result)); reader.readAsDataURL(file)
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
      if (!captureChild) throw new Error('아이 이름을 선택해주세요')
      const result = captureFile ? await (() => {
        const form = new FormData()
        form.append('file', captureFile)
        form.append('child_id', captureChild)
        form.append('source', captureSource)
        return upload<{ items: CareItem[]; transcript: string; ocr_used_today: number }>('/intakes/photo', form)
      })() : await send<{ items: CareItem[]; transcript?: string }>('/intakes', 'POST', {
        child_id: captureChild, raw_content: captureText.trim(), input_type: 'TEXT',
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
    const startClock = normalizeClock(scheduleStartTime)
    const endClock = normalizeClock(scheduleEndTime)
    if (!scheduleTitle || !scheduleDate || !startClock || !endClock) throw new Error('날짜와 시간을 09:30 형식으로 입력해주세요')
    const scheduleStart = new Date(`${scheduleDate}T${startClock}`)
    const scheduleEnd = new Date(`${scheduleDate}T${endClock}`)
    if (scheduleEnd <= scheduleStart) throw new Error('종료 시간은 시작 시간보다 늦어야 해요')
    if (scheduleRepeat && (!scheduleRepeatDays.length || !scheduleRepeatUntil)) throw new Error('반복 요일과 종료일을 선택해주세요')
    const recurrence = { repeat_days: scheduleRepeat ? scheduleRepeatDays : [], repeat_until: scheduleRepeat ? scheduleRepeatUntil : null }
    if (scheduleForm === 'CHILD') {
      if (!childScheduleChild) throw new Error('아이 이름을 선택해주세요')
      const created = await send<{ care_item_id: string; suggestions: Suggestion[] }>('/child-schedules', 'POST', { child_id: childScheduleChild, title: scheduleTitle,
        category: childScheduleCategory, starts_at: scheduleStart.toISOString(),
        ends_at: scheduleEnd.toISOString(), source: 'MANUAL', ...recurrence })
      setItemId(created.care_item_id); setSuggestions(created.suggestions)
      setScheduleTitle(''); setScheduleRepeat(false); setScheduleSheet('NONE')
      go('suggestion')
      return
    }
    const result = await send<{ collisions: unknown[] }>('/schedules', 'POST', { member_id: me?.authenticated ? me.member.id : scheduleMember, title: scheduleTitle, starts_at: scheduleStart.toISOString(), ends_at: scheduleEnd.toISOString(), kind: scheduleKind, ...recurrence })
    setScheduleTitle(''); setScheduleRepeat(false); setScheduleSheet('NONE')
    if (result.collisions.length) go('exception')
  }, scheduleRepeat ? '반복 루틴 일정을 한 번에 등록했어요' : scheduleForm === 'CHILD' ? '아이 일정을 등록했어요' : '개인 일정을 등록했어요')

  const pickCalendarDate = (date: Date) => {
    const key = date.toLocaleDateString('sv-SE')
    setSelectedDate(key)
    setScheduleSheet('DAY')
    if (date.getMonth() !== calendarMonth.getMonth() || date.getFullYear() !== calendarMonth.getFullYear()) setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1))
    setScheduleDate(key)
    setScheduleStartTime('09:00')
    setScheduleEndTime('10:00')
    const weekday = (date.getDay() + 6) % 7
    setScheduleRepeatDays([weekday])
    const until = new Date(date.getFullYear(), date.getMonth() + 3, date.getDate())
    setScheduleRepeatUntil(until.toLocaleDateString('sv-SE'))
  }
  const connectCalendar = async (provider: 'google' | 'microsoft') => {
    try {
      const result = await send<{ authorization_url: string }>('/calendar-connections/' + provider + '/authorize', 'POST')
      location.assign(result.authorization_url)
    } catch (e) { reportError(e) }
  }
  const syncCalendar = (provider: 'google' | 'microsoft') => run(async () => {
    await send('/calendar-connections/' + provider + '/sync', 'POST')
    setCalendarConnections((await api<{ connections: CalendarConnection[] }>('/calendar-connections')).connections)
  }, '업무 캘린더 일정을 가져왔어요')
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
    const form = new FormData(); form.append('note', note)
    if (completionPhoto) form.append('photo', completionPhoto)
    await upload('/assignments/' + activeAssignment.id + '/complete-handoff', form)
    setShowSheet(false); setNote(''); setCompletionPhoto(null); setCompletionPreview('')
  }, '완료 기록과 인수인계를 가족에게 전했어요')

  const addAlbumPhotos = async (files: File[]) => {
    if (!files.length || albumBusy) return
    setAlbumBusy(true); setError('')
    try {
      for (const file of files) {
        const form = new FormData(); form.append('file', file)
        await upload('/album/photos', form)
      }
      setAlbumPhotos((await api<{ photos: AlbumPhoto[] }>('/album/photos')).photos)
      setToast(`${files.length}장의 사진을 패밀리 앨범에 저장했어요`)
    } catch (e) { reportError(e) }
    finally { setAlbumBusy(false) }
  }
  const searchBenefits = async () => {
    const keyword = benefitKeyword.trim()
    if (!keyword || benefitsBusy || !benefitLocation.city || !benefitLocation.district) return
    setBenefitsBusy(true); setProgramSelected(''); setError('')
    try {
      const query = new URLSearchParams({ keyword, city: benefitLocation.city, district: benefitLocation.district })
      const result = await api<{ programs: Benefit[] }>('/benefits?' + query)
      setBenefits(result.programs)
    } catch (e) { reportError(e) }
    finally { setBenefitsBusy(false) }
  }
  const saveBenefitLocation = async () => {
    const city = benefitCity.trim(); const district = benefitDistrict.trim()
    if (!city || !district || benefitLocationBusy) return
    setBenefitLocationBusy(true); setBenefitsBusy(true); setProgramSelected(''); setError('')
    try {
      const location = await send<BenefitLocation>('/benefits/location', 'PATCH', { city, district })
      setBenefitLocation(location); setBenefitCity(location.city); setBenefitDistrict(location.district)
      const query = new URLSearchParams({ keyword: benefitKeyword.trim() || '돌봄', city: location.city, district: location.district })
      const areaQuery = new URLSearchParams({ city: location.city, district: location.district })
      const [programData, institutionData, criteriaData] = await Promise.all([
        api<{ programs: Benefit[] }>('/benefits?' + query),
        api<{ institutions: CareInstitution[] }>('/benefits/institutions?' + areaQuery),
        api<EligibilityCriteria>('/benefits/eligibility-criteria'),
      ])
      setBenefits(programData.programs); setCareInstitutions(institutionData.institutions); setEligibilityCriteria(criteriaData)
      setToast(`${location.city} ${location.district} 돌봄 혜택과 제공기관을 불러왔어요`)
    } catch (e) { reportError(e) }
    finally { setBenefitLocationBusy(false); setBenefitsBusy(false) }
  }

  const tabs = boot && <div className="child-tabs"><button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>전체</button>{boot.children.map(c => <button key={c.id} className={filter === c.id ? 'selected' : ''} onClick={() => setFilter(c.id)}>{c.name} ({c.age_label})</button>)}</div>
  const timeline = (list: Assignment[]) => <Card className="timeline-card">{[...list].sort((a, b) => (itemFor(a)?.starts_at || '').localeCompare(itemFor(b)?.starts_at || '')).map(a => { const i = itemFor(a); return i && <button key={a.id} className="timeline-row" onClick={() => { setAssignmentId(a.id); go('tasks') }}><span className="time">{formatTime(i.starts_at) || '—'}</span><span className="timeline-content"><strong>{i.title} — {member(a.assignee_id)}</strong><small>{a.status === 'COMPLETED' ? '완료' : a.status === 'PROPOSED' ? '수락 대기' : '진행 중'}</small></span><span className="timeline-status">{a.status === 'COMPLETED' ? '✓' : '›'}</span></button> })}</Card>

  let page: ReactNode = <div className="loading">가족의 하루를 불러오고 있어요</div>
  if (boot && screen === 'home') page = <>
    <div className="home-title"><div><h1>가족</h1><p>{today} · {boot.children.map(c => c.name).join(' · ') || '아이 등록 전'}</p></div></div>
    {assignments.find(a => a.status === 'ACCEPTED') && <button className="home-travel" onClick={() => go('location')}><span className="travel-avatar">{member(assignments.find(a => a.status === 'ACCEPTED')!.assignee_id).slice(0, 1)}</span><span><strong>{member(assignments.find(a => a.status === 'ACCEPTED')!.assignee_id)}와 이동 중</strong><small>돌봄 동선과 도착 정보를 확인하세요</small></span><b>›</b></button>}
    {allPending.length > 0 && <button className="family-alert home-alert" onClick={() => go('family')}><span className="small-badge danger">확인 {allPending.length}</span><strong>{allPending[0].title}</strong><span>›</span></button>}
    <Section action={<button className="text-link" onClick={() => go('schedule')}>전체 일정 ›</button>}>오늘 일정</Section>
    <Card className="home-timeline">
      {[...todayCare.map(i => ({ id: i.id, time: i.starts_at!, title: i.title, meta: child(i.child_id), color: childColor(i.child_id) })), ...todayChildSchedules.map(s => ({ id: s.id, time: s.starts_at, title: s.title, meta: child(s.child_id), color: childColor(s.child_id) })), ...todayPersonal.map(s => ({ id: s.id, time: s.starts_at, title: s.title, meta: member(s.member_id), color: '#838892' }))].sort((a, b) => a.time.localeCompare(b.time)).map(event => <button key={event.id} className="home-schedule-row" onClick={() => go('schedule')}><time>{formatTime(event.time)}</time><i style={{ background: event.color }} /><span><strong>{event.title}</strong><small>{event.meta}</small></span><b>›</b></button>)}
      {!todayCare.length && !todayChildSchedules.length && !todayPersonal.length && <p className="empty-line">오늘 등록된 일정이 없어요</p>}
    </Card>
    <Section action={<button className="text-link" onClick={() => go('family')}>돌봄 정보 ›</button>}>챙겨야 할 준비물</Section>
    {supplies.length ? <Card className="supply-summary">{supplies.slice(0, 4).map(item => <button key={item.id} onClick={() => openReview(item)}><i style={{ background: childColor(item.child_id) }} /><span><strong>{item.title}</strong><small>{child(item.child_id)} · {item.detail || '알림장에서 등록됨'}</small></span><b>›</b></button>)}</Card> : <Card className="supply-empty" onClick={() => go('capture')}><span>●</span><strong>등록된 준비물이 없어요</strong><b>›</b></Card>}
    <div className="home-actions"><button onClick={() => go('capture')}>＋ 알림장 등록</button><button onClick={() => go('tasks')}>✓ 오늘 할 일</button></div>
  </>
  if (boot && screen === 'family') page = <><div className="eyebrow">아이별 돌봄 정보</div><h2 className="page-title">일정과 준비물을 나눠 확인해요</h2>{tabs}
    {pending.length > 0 && <Card className="inbox-summary" onClick={() => pending[0] && openReview(pending[0])}><span className="summary-dot">●</span><div><strong>확인할 돌봄 정보 {pending.length}건</strong><p>등록한 내용은 확인 후 역할 배정에 반영돼요</p></div><span className="chevron">›</span></Card>}
    <Section>확인 필요 {pending.length}</Section>{pending.length ? pending.map(i => <Card key={i.id} className="review-card"><div className="review-meta"><span className="child-pill">{child(i.child_id)}</span><span>신뢰도 낮음 · {typeLabel[i.item_type]}</span></div><strong>{i.title}</strong><p>{i.detail || '추출된 내용을 확인해주세요'}</p><div className="card-actions"><button onClick={() => openReview(i)}>확인하기</button><button onClick={() => setToast('나중에 다시 확인할 수 있어요')}>나중에</button></div></Card>) : <Empty title="확인할 것이 없어요" text="새로운 알림장이 들어오면 이곳에 표시돼요" />}
    <Section>아이 일정</Section>{boot.child_schedules.filter(s => filter === 'all' || s.child_id === filter).slice(0, 5).map(s => <Card key={s.id} className="schedule-card"><i className="child-color" style={{ background: childColor(s.child_id) }} /><span className="time">{formatTime(s.starts_at) || '—'}</span><div><strong>{s.title}</strong><p>{child(s.child_id)} · {childScheduleLabel[s.category] ?? '기타'}</p></div><span className="green-check">✓</span></Card>)}{items.filter(i => !i.child_schedule_id && ['SCHEDULE', 'CHANGE', 'TODO'].includes(i.item_type) && ['CONFIRMED', 'ASSIGNED', 'DONE'].includes(i.status)).slice(0, 5).map(i => <Card key={i.id} className="schedule-card"><i className="child-color" style={{ background: childColor(i.child_id) }} /><span className="time">{formatTime(i.starts_at) || '—'}</span><div><strong>{i.title}</strong><p>{child(i.child_id)} · 알림장</p></div><span className="green-check">✓</span></Card>)}
    <Section>준비물</Section>{items.filter(i => i.item_type === 'SUPPLY' && ['CONFIRMED', 'ASSIGNED', 'DONE'].includes(i.status)).slice(0, 5).map(i => <Card key={i.id} className="schedule-card"><i className="child-color" style={{ background: childColor(i.child_id) }} /><div><strong>{i.title}</strong><p>{child(i.child_id)} · {i.detail}</p></div><span className="green-check">✓</span></Card>)}
    <div className="inbox-buttons"><button className="primary-button" onClick={() => go('capture')}>알림장 촬영</button><button className="outline-button" onClick={() => go('capture')}>직접 입력</button></div>
  </>
  if (boot && screen === 'capture') page = <><div className="eyebrow">FAMILY INBOX</div><h2 className="hero-title">흩어진 안내를<br />한 번에 정리해요</h2><p className="hero-copy">알림장, 문자, 가정통신문에 적힌 돌봄 정보를 모아주세요.</p>
    <div className="capture-actions"><input ref={cameraInputRef} className="photo-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="카메라로 알림장 촬영" onChange={e => { selectCarePhoto(e.currentTarget.files?.[0], 'CAMERA'); e.currentTarget.value = '' }} /><input ref={uploadInputRef} className="photo-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="앨범에서 알림장 사진 업로드" onChange={e => { selectCarePhoto(e.currentTarget.files?.[0], 'ALBUM'); e.currentTarget.value = '' }} /><button className="primary-button" onClick={() => cameraInputRef.current?.click()}>사진 촬영</button><button className="outline-button" onClick={() => uploadInputRef.current?.click()}>사진 업로드</button></div>
    <div className="capture-frame">{capturePreview ? <img className="capture-preview" src={capturePreview} alt="선택한 알림장" /> : <span className="camera-glyph">▣</span>}<strong>{captureFile?.name || '선택된 사진이 없어요'}</strong><small>{captureFile ? '사진의 글씨를 읽고 일정 관련 내용만 AI가 추려요. 다음 화면에서 확인해주세요.' : '사진 없이 입력하면 수기로 등록돼요. 무료 OCR은 하루 2회 사용할 수 있어요.'}</small></div>
    <Section>아이 선택</Section><div className="choice-row">{boot.children.map(c => <button key={c.id} className={'choice-chip ' + (captureChild === c.id ? 'active' : '')} onClick={() => setCaptureChild(c.id)}>{c.name}</button>)}</div>
    <label className="form-label">직접 입력 (사진 없이 등록할 때)</label><textarea className="text-area" rows={5} value={captureText} onChange={e => setCaptureText(e.target.value)} placeholder={'예: 금요일 하원 시간이 15시로 변경\n준비물: 도시락, 모자'} /><p className="helper-text">OCR 한도나 사진 오류가 있으면 사진을 다시 선택해 해제하고 수기로 입력할 수 있어요.</p>{captureFile && <button className="text-link centered" onClick={() => { setCaptureFile(null); setCapturePreview('') }}>사진 선택 취소 · 수기 입력</button>}<button className="primary-button wide-button" disabled={captureBusy || !captureChild || (!captureFile && !captureText.trim())} onClick={capture}>{captureBusy ? '분석 중…' : captureFile ? '사진 분석하기' : '내용 정리하기'}</button>
  </>
  if (boot && screen === 'review') page = <><div className="eyebrow">추출 결과 확인</div><h2 className="hero-title">{captureFromPhoto ? <>일정 관련 내용만<br />확인해주세요</> : <>표시된 부분만<br />확인해주세요</>}</h2><p className="hero-copy">{captureFromPhoto ? 'AI가 고른 항목을 원문과 비교하고, 틀린 부분을 고쳐주세요.' : '틀린 부분만 고치고 저장하면 돼요.'}</p>
    {activeItem && <div className="review-switcher">{boot.items.filter(i => i.status === 'NEEDS_REVIEW' && i.intake_id === activeItem.intake_id).slice(0, 8).map(i => <button key={i.id} className={itemId === i.id ? 'active' : ''} onClick={() => selectReview(i)}>{typeLabel[i.item_type]} · {i.title.slice(0, 20)}</button>)}</div>}
    {activeItem && <Card className="detail-review-card"><div className="review-meta"><span className={'confidence ' + (activeItem.confidence === 'HIGH' ? 'high' : 'low')}>{activeItem.confidence === 'HIGH' ? '✓ 신뢰도 높음' : '! 신뢰도 낮음'}</span><span>{child(activeItem.child_id)}</span></div><label className="form-label">항목 종류</label><select className="form-control" value={reviewType} onChange={e => setReviewType(e.target.value)}>{Object.entries(typeLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><label className="form-label">내용</label><input className="form-control" value={reviewTitle} onChange={e => setReviewTitle(e.target.value)} />{activeItem.detail && <p className="source-text">원문 근거 · {activeItem.detail}</p>}<label className="form-label">돌봄 예정 일시 (선택)</label><input className="form-control" type="datetime-local" value={reviewStart} onChange={e => setReviewStart(e.target.value)} /><p className="helper-text">일시를 입력하면 가족 일정과 겹치는지 확인할 수 있어요.</p><p className="source-text">출처 · {activeItem.intake_id ? '등록한 돌봄 정보' : '별빛유치원 알림장'}</p></Card>}
    {!activeItem && captureFromPhoto && <Empty title="일정 관련 항목이 없어요" text="읽은 글씨는 아래에서 확인할 수 있어요. 필요한 내용이 있다면 직접 입력해주세요." />}
    {captureTranscript && <details className="card source-transcript"><summary>인식한 원문 보기</summary><p>{captureTranscript}</p></details>}
    {activeItem ? <button className="primary-button wide-button" onClick={saveReview}>확인하고 저장</button> : captureFromPhoto && <button className="primary-button wide-button" onClick={() => go('capture')}>내용 직접 입력하기</button>}
  </>
  if (boot && screen === 'assignments') page = <><div className="eyebrow">ROLE MATCH</div><h2 className="hero-title">오늘의 배정</h2><p className="hero-copy">평소대로인 배정은 조용히 진행하고, 조정할 일만 알려드려요.</p><Section>확정된 배정</Section>{timeline(assignments)}<Section>배정이 필요한 일</Section>{items.filter(i => i.status === 'CONFIRMED' && !assignments.some(a => a.item_id === i.id)).map(i => <Card key={i.id} className="suggest-card" onClick={() => openSuggestion(i)}><div><strong>{i.title}</strong><p>{child(i.child_id)} · {formatTime(i.starts_at) || '시간 미정'}</p></div><span className="chevron">›</span></Card>)}<Card className="info-note" onClick={() => go('schedule')}>개인 일정을 등록하면 가능한 시간을 참고해요 ›</Card></>
  if (boot && screen === 'suggestion') page = <><div className="eyebrow">CARE SCHEDULE AGENT · 배정 추천</div><h2 className="hero-title">{activeItem?.title || '아이 일정'}</h2><p className="hero-copy">내 일정은 후보에서 제외하고, 다른 가족의 개인 일정과 진행 중인 돌봄을 비교했어요.</p>{suggestions.filter(s => s.member_id !== me?.member.id).map(s => <Card key={s.member_id} className={'person-card ' + (s.priority === 1 ? 'recommended' : '')}><div className="person-avatar">{s.name.slice(0, 1)}</div><div className="person-info"><strong>{s.name}</strong><p>{s.reason}</p></div><span className={'small-badge ' + (s.available ? 'ok' : 'danger')}>{s.available ? (s.priority === 1 ? 'AI 추천 1순위' : s.priority + '순위') : '바쁨'}</span><button className={s.priority === 1 ? 'primary-button' : 'outline-button'} disabled={!s.available || !activeItem} onClick={() => run(async () => { await send('/assignments', 'POST', { item_id: activeItem!.id, assignee_id: s.member_id }); go('assignments') }, s.name + '님에게 요청했어요')}>{s.name}에게 요청</button></Card>)}{!suggestions.filter(s => s.member_id !== me?.member.id).length && <Empty title="요청할 다른 가족이 없어요" text="가족 구성원을 초대한 뒤 다시 추천을 확인해주세요" />}<Section>판단 근거</Section><Card className="reason-card"><p>개인 캘린더 충돌, 같은 시간대 돌봄, 현재 맡은 돌봄 건수를 함께 비교합니다.</p><p>요청을 보내기 전에는 담당자로 확정하지 않아요.</p></Card></>
  if (boot && screen === 'tasks') page = <>
    <div className="viewer-switch"><span>{me?.authenticated ? '내 담당' : '담당자 보기 (데모)'}</span><select value={viewer} disabled={!!me?.authenticated} onChange={e => setViewer(e.target.value)}>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
    <Card className="task-summary"><span className="green-check">✓</span><div><strong>오늘 맡은 일 {viewerAssignments.length}건</strong><p>요청을 열어 세부내용을 확인하고 응답할 수 있어요</p></div></Card>
    {boot.handoffs.some(h => h.to_member_id === viewer && h.status === 'PENDING') && <><Section>받은 인수인계</Section>{boot.handoffs.filter(h => h.to_member_id === viewer && h.status === 'PENDING').map(h => <Card key={h.id} className="handoff-card inline-handoff"><span className="small-badge danger">확인 필요</span><strong>{h.briefing}</strong>{h.special_note && <p>특이사항 · {h.special_note}</p>}<small>{member(h.from_member_id)}님이 전달</small><button className="outline-button wide-button" onClick={() => run(() => send('/handoffs/' + h.id + '/acknowledge', 'POST'), '인수인계를 확인했어요')}>확인했어요</button></Card>)}</>}
    <Section>오늘 할 일</Section>
    {viewerAssignments.map(a => { const i = itemFor(a); return i && <Card key={a.id} className={'task-card ' + (assignmentId === a.id ? 'selected-request' : '')}><div className="task-top"><span className="time">{formatTime(i.starts_at) || '시간 미정'}</span><span className="small-badge ok">{a.status === 'COMPLETED' ? '완료' : a.status === 'PROPOSED' ? '수락 대기' : '담당'}</span></div><strong>{i.title} — {child(i.child_id)}</strong><p>{i.detail}</p>{a.status === 'PROPOSED' ? <div className="task-actions"><button className="primary-button" onClick={() => run(() => send('/assignments/' + a.id + '/respond', 'POST', { decision: 'ACCEPTED' }), '배정을 수락했어요')}>맡을게요</button><button className="outline-button" onClick={() => run(() => send('/assignments/' + a.id + '/respond', 'POST', { decision: 'REJECTED' }), '다른 담당자를 찾을게요')}>어려워요</button></div> : a.status === 'ACCEPTED' ? <button className="primary-button wide-button" onClick={() => { setAssignmentId(a.id); setNote(''); setCompletionPhoto(null); setCompletionPreview(''); setShowSheet(true) }}>완료 체크</button> : <p className="source-text">{a.note ? '특이사항 · ' + a.note : '특이사항 없음'}</p>}</Card> })}
    {viewerAssignments.length ? <><Section>이번 주 내 담당</Section><Card className="stats-card"><div><strong>{viewerAssignments.length}</strong><span>맡은 일</span></div><div><strong>{viewerAssignments.filter(a => a.status === 'COMPLETED').length}</strong><span>완료</span></div><div><strong>{viewerAssignments.filter(a => a.note).length}</strong><span>특이사항</span></div></Card></> : <Empty title="아직 맡은 일이 없어요" text="가족이 돌봄을 요청하면 이곳에서 확인할 수 있어요" />}
  </>
  if (boot && screen === 'schedule') page = <>
    <div className="schedule-heading"><div><div className="eyebrow">FAMILY CALENDAR</div><h2 className="page-title">가족 일정</h2></div><button onClick={() => go('calendar')}>업무 캘린더 연결</button></div>
    <div className="child-tabs schedule-tabs"><button className={scheduleScope === 'all' ? 'selected' : ''} onClick={() => setScheduleScope('all')}>전체</button>{boot.children.map(c => <button key={c.id} className={scheduleScope === c.id ? 'selected' : ''} onClick={() => { setScheduleScope(c.id); setChildScheduleChild(c.id); setScheduleForm('CHILD') }}>{c.name}</button>)}</div>
    <Card className="month-calendar">
      <div className="month-head"><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button><strong>{calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월</strong><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button></div>
      <div className="weekdays">{['일', '월', '화', '수', '목', '금', '토'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="month-grid">{calendarDays.map(day => { const key = dateKey(day); const dayEvents = calendarEventsFor(key); return <button key={key} aria-label={`${key} · 일정 ${dayEvents.length}개`} className={(day.getMonth() !== calendarMonth.getMonth() ? 'muted ' : '') + (selectedDate === key ? 'selected' : '')} onClick={() => pickCalendarDate(day)}><span>{day.getDate()}</span><i className="month-day-events">{dayEvents.slice(0, 2).map(event => <b key={event.id} style={{ background: event.color }}>{event.title}</b>)}{dayEvents.length > 2 && <small>+{dayEvents.length - 2}</small>}</i></button> })}</div>
    </Card>
    <Section>오늘 일정 · {formatDate(todayKey + 'T00:00:00')}</Section>
    <div className="calendar-events">
      {scheduleScope === 'all' && boot.schedules.filter(s => dateKey(s.starts_at) === todayKey).map(s => <Card key={s.id} className="calendar-event personal"><i /><time>{formatTime(s.starts_at)}</time><div><strong>{s.title}</strong><p>{member(s.member_id)} · {s.kind === 'WORK' ? '업무 일정' : '개인 루틴'}</p></div></Card>)}
      {filteredChildSchedules.filter(s => dateKey(s.starts_at) === todayKey).map(s => { const caregiver = caregiverForChildSchedule(s.id); return <Card key={s.id} className="calendar-event"><i style={{ background: childColor(s.child_id) }} /><time>{formatTime(s.starts_at)}</time><div><strong>{s.title}</strong><p>{child(s.child_id)} · {childScheduleLabel[s.category] ?? '아이 일정'}</p></div><span className={'caregiver-pill ' + (caregiver?.status === 'ACCEPTED' ? 'confirmed' : '')}>{caregiver ? `${caregiver.status === 'ACCEPTED' ? '담당' : '요청 중'} · ${caregiver.name}` : '미배정'}</span></Card> })}
      {filteredCareSchedules.filter(i => dateKey(i.starts_at!) === todayKey).map(i => { const caregiver = caregiverForCareItem(i.id); return <Card key={i.id} className="calendar-event"><i style={{ background: childColor(i.child_id) }} /><time>{formatTime(i.starts_at)}</time><div><strong>{i.title}</strong><p>{child(i.child_id)} · 알림장</p></div><span className={'caregiver-pill ' + (caregiver?.status === 'ACCEPTED' ? 'confirmed' : '')}>{caregiver ? `${caregiver.status === 'ACCEPTED' ? '담당' : '요청 중'} · ${caregiver.name}` : '미배정'}</span></Card> })}
      {!((scheduleScope === 'all' ? boot.schedules.filter(s => dateKey(s.starts_at) === todayKey).length : 0) + filteredChildSchedules.filter(s => dateKey(s.starts_at) === todayKey).length + filteredCareSchedules.filter(i => dateKey(i.starts_at!) === todayKey).length) && <p className="empty-line">오늘 일정이 없어요</p>}
    </div>
    <p className="calendar-add-hint">날짜를 누르면 그날 일정을 보고 새 일정을 추가할 수 있어요.</p>
  </>
  if (boot && screen === 'careHub') page = <><div className="eyebrow">CARE</div><h2 className="page-title">가족의 돌봄을 이어가요</h2><p className="hero-copy">일정이 바뀌거나 담당자가 달라져도 필요한 흐름을 한곳에서 확인해요.</p><div className="hub-grid">{([['exception', '!', '예외 상황', '일정 충돌과 대안'], ['tasks', '✓', '내 돌봄·완료', '완료 기록과 인수인계'], ['emergency', '☎', '긴급 도움 요청', '가족 전체에 요청'], ['location', '⌖', '돌봄 동선', '이동과 도착 확인']] as [Screen, string, string, string][]).map(([target, icon, title, detail]) => <button key={target} onClick={() => go(target)}><i>{icon}</i><strong>{title}</strong><small>{detail}</small><span>›</span></button>)}</div><Section>역할 배정</Section><div className="family-menu-list"><button onClick={() => go('assignments')}>오늘의 배정<span>›</span></button><button onClick={() => go('tasks')}>내가 맡은 일<span>›</span></button></div></>
  if (boot && screen === 'familyHub') page = <><div className="eyebrow">FAMILY</div><h2 className="page-title">우리 가족</h2><p className="hero-copy">구성원과 아이를 관리하고 누구에게 어떤 정보를 보여줄지 정해요.</p><div className="hub-list"><button onClick={() => go('members')}><i>가</i><span><strong>가족 설정</strong><small>가족 구성원·아이·초대코드</small></span><b>›</b></button><button onClick={() => go('permissions')}><i>✓</i><span><strong>정보 공개</strong><small>위치·건강·사진 권한</small></span><b>›</b></button></div></>
  if (boot && screen === 'more') page = <><div className="eyebrow">MORE</div><h2 className="page-title">더보기</h2>{subscription?.dev_switch_available && <Card className="dev-plan-card compact"><span className="small-badge danger">DEVELOPER MODE</span><strong>Free / Pro 화면 전환</strong><p>결제 없이 현재 가족방의 기능 권한을 바꿔 두 버전을 확인해요.</p><div className="dev-plan-switch"><button aria-pressed={plan === 'FREE'} disabled={planBusy || plan === 'FREE'} onClick={() => previewPlan('FREE')}>Free</button><button aria-pressed={plan === 'PRO'} disabled={planBusy || plan === 'PRO'} onClick={() => previewPlan('PRO')}>Pro</button></div></Card>}<Section>알림과 설정</Section><div className="family-menu-list"><button onClick={() => go('notifications')}>알림함 <small>{unread}건 새 알림</small><span>›</span></button><button onClick={() => go('settings')}>알림 설정<span>›</span></button></div><Section>혜택·부가서비스</Section><div className="family-menu-list"><button onClick={() => plan === 'PRO' ? go('gap') : go('plan')}>돌봄 공백 예측 {plan === 'PRO' ? <span className="small-badge ok">이용 가능</span> : <Pro />}<span>›</span></button><button onClick={() => plan === 'PRO' ? go('album') : go('plan')}>패밀리 앨범 {plan === 'PRO' ? <span className="small-badge ok">이용 가능</span> : <Pro />}<span>›</span></button><button onClick={() => plan === 'PRO' ? go('programs') : go('plan')}>돌봄 제도 안내 {plan === 'PRO' ? <span className="small-badge ok">이용 가능</span> : <Pro />}<span>›</span></button></div><Section>계정</Section><div className="family-menu-list"><button onClick={() => go('plan')}>플랜·결제<span>›</span></button><button onClick={() => go('onboarding')}>처음부터 시작 체험<span>›</span></button></div></>
  if (boot && screen === 'exception') page = <><div className="eyebrow urgent">EXCEPTION CARE</div><h2 className="hero-title">지금 확인이<br />필요해요</h2><Card className="urgent-card"><span className="small-badge danger">일정 충돌 감지</span><strong>담당자의 일정이 돌봄 시간과 겹쳤어요.</strong><p>하원 마감 전까지 다른 담당자를 정해 주세요.</p></Card><Section>진행 중인 대안</Section>{boot.exceptions.length ? boot.exceptions.map(e => <Card key={e.id} className="exception-card"><strong>{e.reason}</strong><p>대안 · {member(e.alternative_member_id)}</p><span className="small-badge ok">{e.status === 'PENDING' ? '확인 대기' : '승인됨'}</span>{e.status === 'PENDING' && <button className="primary-button" onClick={() => run(() => send('/exceptions/' + e.id + '/approve', 'POST'), '대안을 요청했어요')}>대안 승인</button>}</Card>) : <Empty title="새로운 대안이 없어요" text="충돌이 생기면 해결책을 이곳에서 확인할 수 있어요" />}<Section>직접 대안 제안</Section><Card className="form-card"><label className="form-label">조정할 배정</label><select className="form-control" value={assignmentId || ''} onChange={e => setAssignmentId(e.target.value)}><option value="">배정을 선택하세요</option>{assignments.filter(a => a.status === 'ACCEPTED').map(a => <option key={a.id} value={a.id}>{itemFor(a)?.title} · {member(a.assignee_id)}</option>)}</select><label className="form-label">다른 담당자</label><select className="form-control" value={alternative} onChange={e => setAlternative(e.target.value)}>{members.filter(m => m.id !== me?.member.id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><label className="form-label">사유</label><input className="form-control" value={reason} onChange={e => setReason(e.target.value)} /><button className="primary-button wide-button" onClick={() => run(async () => { if (!assignmentId) throw new Error('배정을 선택해주세요'); await send('/exceptions', 'POST', { assignment_id: assignmentId, alternative_member_id: alternative, reason }) }, '대안을 등록했어요')}>대안 만들기</button></Card></>
  if (boot && screen === 'notifications') page = <><div className="eyebrow">알림함</div><h2 className="hero-title">필요한 소식만<br />전해드려요</h2><Section>새 알림 {unread}</Section>{boot.notifications.map(n => <Card key={n.id} className={'notice-card ' + (n.is_read ? 'read' : '')} onClick={() => void openNotice(n)}><span className={'notice-mark ' + (n.level === 'IMPORTANT' ? 'important' : '')}>{n.level === 'IMPORTANT' ? '!' : '✓'}</span><div><strong>{n.title}</strong><p>{n.body}</p>{n.action_type === 'ASSIGNMENT_REQUEST' && <b className="notice-action">요청 세부내용 확인·응답 ›</b>}{n.action_type === 'CARE_SUGGESTION' && <b className="notice-action">추천 후보 확인·요청 ›</b>}{n.action_type === 'ASSIGNMENT_RESULT' && <b className="notice-action">확정된 일정 확인 ›</b>}{n.action_type === 'HANDOFF' && <b className="notice-action">인수인계 확인 ›</b>}<small>{formatDate(n.created_at)} {formatTime(n.created_at)}</small></div>{!n.is_read && <span className="unread-dot" />}</Card>)}<button className="text-link centered" onClick={() => go('settings')}>알림 설정</button></>
  if (boot && screen === 'members') page = <><div className="eyebrow">우리 가족 · {boot.family.name}</div><h2 className="hero-title">돌봄 구성원</h2><p className="hero-copy">현재 사용자: {me?.member.name ?? member(viewer)} · {me?.authenticated ? '가족방 세션 연결됨' : '데모 가족'}</p>
    <Section>가족 구성원</Section>{boot.members.filter(m => m.status !== 'REMOVED').map(m => <Card key={m.id} className="member-card"><div className="person-avatar">{m.name.slice(0, 1)}</div><div><strong>{m.name}{m.is_owner ? ' · 주돌봄자' : ''}</strong><p>{m.role === 'GRANDPARENT' ? '조부모' : m.role === 'CAREGIVER' ? '돌봄 참여자' : '부모'} · {m.status === 'ACTIVE' ? '참여 중' : '초대 대기'}</p></div>{m.status === 'PENDING' && !me?.authenticated && <button className="text-link" onClick={() => run(() => send('/members/' + m.id + '/accept', 'POST'), '가족에 합류했어요')}>합류</button>}{me?.authenticated && !!me.member.is_owner && !m.is_owner && <div className="member-actions">{m.status === 'ACTIVE' && <button className="member-owner-transfer" onClick={() => transferOwnership(m.id, m.name)}>주돌봄자 지정</button>}<button className="member-remove" onClick={() => { if (confirm(m.name + '님을 가족방에서 퇴장시킬까요?')) void run(() => send('/members/' + m.id + '/remove', 'POST'), m.name + '님을 가족방에서 퇴장시켰어요') }}>퇴장</button></div>}</Card>)}
    <Section>아이</Section>{boot.children.map(c => <Card key={c.id} className="member-card"><div className="child-avatar">{c.name.slice(0, 1)}</div><div><strong>{c.name}</strong><p>{c.age_label}</p></div></Card>)}
    {(!me?.authenticated || me.member.is_owner) && <Card className="form-card"><strong>아이 등록</strong><label className="form-label">이름</label><input className="form-control" aria-label="아이 이름" value={childNameInput} onChange={e => setChildNameInput(e.target.value)} placeholder="아이 이름" /><label className="form-label">나이·학교</label><input className="form-control" aria-label="아이 나이·학교" value={childAgeInput} onChange={e => setChildAgeInput(e.target.value)} placeholder="예: 7세 · 초등학교" /><button className="primary-button wide-button" onClick={() => run(async () => { if (!childNameInput.trim() || !childAgeInput.trim()) throw new Error('아이 이름과 나이·학교를 입력해주세요'); await send('/children', 'POST', { name: childNameInput.trim(), age_label: childAgeInput.trim() }); setChildNameInput(''); setChildAgeInput('') }, '아이를 등록했어요')}>아이 등록</button></Card>}
    {me?.authenticated && me.member.is_owner && <><Section>가족 초대</Section><Card className="form-card invite-share-card"><p>초대 링크를 카카오톡으로 보내면 가족이 안내를 확인하고 참가할 수 있어요. Free는 구성원 3명까지예요.</p>{inviteCode && <><div className="invite-code"><strong>{inviteCode}</strong><small>만료: {formatDate(inviteExpiresAt)}</small></div><label className="form-label">초대할 가족의 역할</label><select className="form-control" value={inviteRole} onChange={e => setInviteRole(e.target.value)}><option value="PARENT">부모</option><option value="GRANDPARENT">조부모</option><option value="CAREGIVER">돌봄 참여자</option></select><input className="invite-link" aria-label="가족방 초대 링크" value={inviteLink} readOnly /><button className="kakao-share wide-button" onClick={shareInvite}>카카오톡 등으로 초대 링크 공유</button></>}<button className="outline-button wide-button" onClick={() => run(async () => { const result = await send<{ invite_code: string; invite_expires_at: string }>('/families/invite-code/rotate', 'POST'); setInviteCode(result.invite_code); setInviteExpiresAt(result.invite_expires_at) }, '새 초대 링크를 만들었어요')}>{inviteCode ? '초대 링크 새로 만들기' : '초대 링크 만들기'}</button></Card></>}
    {!me?.authenticated && <><Section>데모 구성원 추가</Section><Card className="form-card"><label className="form-label">이름</label><input className="form-control" value={memberNameInput} onChange={e => setMemberNameInput(e.target.value)} placeholder="가족 이름" /><label className="form-label">역할</label><select className="form-control" value={memberRole} onChange={e => setMemberRole(e.target.value)}><option value="PARENT">부모</option><option value="GRANDPARENT">조부모</option><option value="CAREGIVER">돌봄 참여자</option></select><button className="primary-button wide-button" onClick={() => run(async () => { if (!memberNameInput.trim()) throw new Error('이름을 입력해주세요'); await send('/members', 'POST', { name: memberNameInput.trim(), role: memberRole }); setMemberNameInput('') }, '초대 대기 구성원을 추가했어요')}>구성원 추가</button></Card></>}
    <button className="text-link centered" onClick={() => go('permissions')}>정보 공개 권한 관리</button>{me?.authenticated && !me.member.is_owner ? <button className="danger-link centered" onClick={() => void leaveFamily()}>가족방 나가기</button> : !me?.authenticated ? <button className="text-link centered" onClick={() => void leaveFamily()}>다른 가족방 만들기·참가</button> : <p className="helper-text centered">다른 구성원에게 주돌봄자 권한을 넘긴 뒤 가족방을 나갈 수 있어요.</p>}
  </>
  if (screen === 'onboarding' && invitationFromUrl && inviteStep === 'preview') page = <div className="invite-landing"><div className="invite-brand"><i /><strong>가족 케어</strong></div><Card className="invite-welcome"><h2>{invitePreview?.owner_name ?? '가족'}님이<br />{invitePreview?.family_name ?? '가족 케어'}에<br />초대했어요</h2><div className="invite-role"><span>{roleLabel[onboardRole].slice(0, 1)}</span><div><strong>역할 — {roleLabel[onboardRole]}</strong><small>초대한 가족이 미리 지정했어요</small></div></div><ul><li>오늘 내게 부탁된 일만 보여요</li><li>가족 캘린더는 권한에 맞게 보여요</li><li>가전 제어 권한은 기본으로 없어요</li></ul><button className="primary-button wide-button" onClick={() => setInviteStep('profile')}>합류할게요</button><small className="invite-account-note">기본 정보를 입력한 뒤 가족방에 합류합니다.</small></Card><button className="text-link centered" onClick={() => { const clean = new URL(location.href); clean.search = ''; history.replaceState(null, '', clean.pathname); setOnboardMode('create'); setInviteStep('profile') }}>나중에 결정하기</button></div>
  if (screen === 'onboarding' && invitationFromUrl && inviteStep === 'profile') page = <><div className="eyebrow">초대받은 가족방 · 1/2</div><h2 className="hero-title">내 기본 정보를<br />알려주세요</h2><p className="hero-copy">가족방에서 다른 구성원에게 표시될 정보예요.</p><Card className="form-card"><label className="form-label">내 이름</label><input className="form-control" aria-label="내 이름" value={onboardName} onChange={e => setOnboardName(e.target.value)} placeholder="예: 김지연" /><label className="form-label">이 가족에서 내 역할</label><select className="form-control" aria-label="내 역할" value={onboardRole} onChange={e => setOnboardRole(e.target.value)}><option value="PARENT">부모</option><option value="GRANDPARENT">조부모</option><option value="CAREGIVER">돌봄 참여자</option></select></Card><button className="primary-button wide-button" disabled={!onboardName.trim()} onClick={() => setInviteStep('intro')}>다음</button><button className="text-link centered" onClick={() => setInviteStep('preview')}>초대 내용 다시 보기</button></>
  if (screen === 'onboarding' && invitationFromUrl && inviteStep === 'intro') page = <><div className="eyebrow">초대받은 가족방 · 2/2</div><h2 className="hero-title">{roleLabel[onboardRole]}로<br />함께 시작해요</h2><p className="hero-copy">합류하면 다음 기능을 바로 사용할 수 있어요.</p><div className="invite-feature-list"><Card><i>▦</i><div><strong>내 일정과 돌봄 일정</strong><p>부탁받은 일정과 내 루틴을 한곳에서 확인해요.</p></div></Card><Card><i>✓</i><div><strong>인수인계와 특이사항</strong><p>담당자가 달라져도 필요한 내용을 이어받아요.</p></div></Card><Card><i>✦</i><div><strong>AI 케어 어시스턴트</strong><p>가족방 일정과 준비물을 물어볼 수 있어요.</p></div></Card></div><button className="primary-button wide-button" disabled={onboardBusy} onClick={enterFamily}>{onboardBusy ? '합류 중…' : '이 가족에 합류하기'}</button><button className="text-link centered" onClick={() => setInviteStep('profile')}>기본 정보 수정</button></>
  if (screen === 'onboarding' && !invitationFromUrl) page = <><div className="eyebrow">FAMILY CARE · 가족방 시작</div><h2 className="hero-title">가족의 돌봄을<br />함께 이어요</h2><p className="hero-copy">새 가족방을 만들거나, 가족에게 받은 초대 링크·코드로 참여하세요. 현재는 ThinQ 로그인과 별개인 개발용 가족방 세션이에요.</p><Card className="onboarding-art"><span className="onboard-circle a">엄</span><span className="onboard-line">→</span><span className="onboard-circle b">할</span><span className="onboard-line">→</span><span className="onboard-circle c">아</span></Card><div className="choice-row"><button className={'choice-chip ' + (onboardMode === 'create' ? 'active' : '')} onClick={() => setOnboardMode('create')}>가족방 만들기</button><button className={'choice-chip ' + (onboardMode === 'join' ? 'active' : '')} onClick={() => setOnboardMode('join')}>초대코드로 참가</button></div><Card className="form-card">{onboardMode === 'create' ? <><label className="form-label">가족방 이름</label><input className="form-control" aria-label="가족방 이름" value={onboardFamilyName} onChange={e => setOnboardFamilyName(e.target.value)} placeholder="예: 지우네 가족" /></> : <><label className="form-label">초대코드</label><input className="form-control" aria-label="초대코드" value={onboardInviteCode} onChange={e => setOnboardInviteCode(e.target.value.toUpperCase())} placeholder="가족에게 받은 10자리 코드" /></>}<label className="form-label">내 이름</label><input className="form-control" aria-label="내 이름" value={onboardName} onChange={e => setOnboardName(e.target.value)} placeholder="예: 김지연" />{onboardMode === 'join' && <><label className="form-label">내 역할</label><select className="form-control" aria-label="내 역할" value={onboardRole} onChange={e => setOnboardRole(e.target.value)}><option value="PARENT">부모</option><option value="GRANDPARENT">조부모</option><option value="CAREGIVER">돌봄 참여자</option></select></>}</Card><button className="primary-button wide-button" disabled={onboardBusy || !onboardName.trim() || (onboardMode === 'create' ? !onboardFamilyName.trim() : !onboardInviteCode.trim())} onClick={enterFamily}>{onboardBusy ? '연결 중…' : onboardMode === 'create' ? '가족방 만들기' : '가족방 참가'}</button>{boot && <button className="text-link centered" onClick={() => go('home')}>{me?.authenticated ? '현재 가족방으로 돌아가기' : '데모로 둘러보기'}</button>}</>
  if (boot && screen === 'calendar') page = <><div className="eyebrow">업무 캘린더 연결</div><h2 className="hero-title">업무 일정 다음엔<br />개인 루틴도 알려주세요</h2><p className="hero-copy">Google 또는 Outlook의 일정은 내 계정에 연결됩니다. 연결 뒤 운동·정기 모임 같은 개인 루틴도 일정 탭에서 추가할 수 있어요.</p>{calendarConnections.map(connection => { const label = connection.provider === 'google' ? 'Google Calendar' : 'Outlook Calendar'; return <Card key={connection.provider} className="calendar-provider"><img className="provider-icon" src={connection.provider === 'google' ? googleIcon : outlookIcon} alt="" /><div><strong>{label}</strong><p>{connection.connected ? `연결됨${connection.synced_at ? ' · 최근 동기화 ' + formatDate(connection.synced_at) : ''}` : connection.configured ? '계정을 연결할 수 있어요' : 'OAuth 앱 설정이 필요해요'}</p></div>{connection.connected ? <button className="text-link" onClick={() => syncCalendar(connection.provider)}>동기화</button> : <button className="text-link" disabled={!connection.configured} onClick={() => connectCalendar(connection.provider)}>{connection.configured ? '연결' : '설정 전'}</button>}</Card> })}<Card className="info-note">{calendarsReady ? 'Google·Outlook OAuth 설정을 모두 확인했어요. 연결 버튼을 누르고 각 계정에서 일정 읽기 권한을 허용하면 동기화할 수 있어요.' : '사용할 캘린더의 OAuth Client ID와 Secret을 backend/.env에 설정하면 연결 버튼이 활성화돼요.'}</Card><button className="primary-button wide-button" onClick={() => { setScheduleForm('PERSONAL'); setScheduleKind('ROUTINE'); go('schedule') }}>개인 루틴 직접 등록</button></>
  if (boot && screen === 'permissions') { const targetMember = me?.member.id ?? viewer; page = <><div className="eyebrow">내 정보 공개 범위</div><h2 className="hero-title">보여주고 싶은 정보만<br />직접 선택해요</h2><p className="hero-copy">각 구성원이 자신의 정보 공개 범위를 직접 관리해요. 다른 가족의 설정은 변경할 수 없어요.</p><Section>{member(targetMember)}님의 공개 범위</Section>{[['SCHEDULE_DETAIL', '개인 일정 내용', '켜면 제목까지, 끄면 시간과 바쁨 여부만 표시'], ['CHILD_DETAIL', '아이 정보', '이름과 돌봄 일정'], ['LOCATION', '위치', '이동과 인수인계 위치'], ['HEALTH', '건강 정보', '복약과 건강 관련 내용'], ['NOTE', '특이사항', '돌봄 완료 메모'], ['PHOTO', '사진', '완료 사진과 앨범']].map(([scope, name, detail]) => { const allowed = !!boot.permissions.find(p => p.member_id === targetMember && p.scope === scope)?.is_allowed; return <Card key={scope} className="permission-row"><div><strong>{name}</strong><p>{detail}</p></div><button className={'switch ' + (allowed ? 'on' : '')} role="switch" aria-checked={allowed} aria-label={name + ' 공개'} onClick={() => run(() => send('/members/' + targetMember + '/permissions', 'PATCH', { scope, is_allowed: !allowed }), '내 공개 범위를 변경했어요')}><span /></button></Card> })}<Card className="info-note">개인 일정 내용은 기본 비공개예요. 꺼두면 다른 가족에게 일정 제목 대신 ‘바쁨’으로 보여요.</Card></> }
  if (boot && screen === 'settings') page = <><div className="eyebrow">알림 설정</div><h2 className="hero-title">조용하지만<br />놓치지 않게</h2><p className="hero-copy">돌봄 요청이 오면 앱 알림함과 허용된 브라우저 알림으로 알려드려요.</p><Section>앱 알림</Section><Card className="permission-row"><div><strong>돌봄 알림 받기</strong><p>등록, 배정, 인수인계, 완료</p></div><button className={'switch ' + (appNotices ? 'on' : '')} role="switch" aria-checked={appNotices} aria-label="돌봄 알림 받기" onClick={() => run(() => send('/members/' + viewer + '/notification-preferences', 'PATCH', { app_enabled: !appNotices }), '알림 설정을 변경했어요')}><span /></button></Card><Card className="permission-row"><div><strong>이 기기 시스템 알림</strong><p>앱이 열려 있을 때 새 요청을 브라우저 알림으로 표시</p></div><button className="text-link" onClick={() => void enableBrowserNotifications()}>{'Notification' in window && Notification.permission === 'granted' ? '허용됨' : '허용하기'}</button></Card><Card className="permission-row"><div><strong>하루 1회 모아보기</strong><p>21:00에 확인할 정보만 요약</p></div><button className={'switch ' + (dailyDigest ? 'on' : '')} role="switch" aria-checked={dailyDigest} aria-label="하루 1회 모아보기" onClick={() => run(() => send('/members/' + viewer + '/notification-preferences', 'PATCH', { daily_digest_enabled: !dailyDigest }), '모아보기 설정을 변경했어요')}><span /></button></Card><Section>가전 알림 <Pro /></Section><Card className="permission-row"><div><strong>ThinQ 가전으로 알림</strong><p>{plan === 'PRO' ? 'Pro 화면 설정 체험 · 실제 ThinQ 가전 연결 없음' : 'Pro 구독이 필요해요 · 가전 연결은 아직 없음'}</p></div><button className={'switch ' + (deviceNoticeDemo ? 'on' : '')} role="switch" aria-checked={deviceNoticeDemo} aria-label="가전 알림 화면 체험" onClick={() => plan === 'PRO' ? setDeviceNoticeDemo(value => !value) : go('plan')}><span /></button></Card></>
  if (boot && screen === 'plan') page = <><div className="eyebrow">플랜·결제</div><h2 className="hero-title">우리 가족에게<br />맞는 돌봄</h2><p className="hero-copy">서버 요금제: {subscription?.plan ?? plan} · {subscription?.status === 'DEV_PREVIEW' ? '개발자 미리보기' : subscription?.status === 'ACTIVE' ? '구독 중' : '미구독'}. 결제·구독 신청은 아직 연결되지 않았어요.</p>{subscription?.dev_switch_available && <Card className="dev-plan-card"><strong>개발용 플랜 테스트</strong><p>결제 없이 이 가족방의 기능 권한을 바꿔 확인해요. 가족방 관리자에게만 보여요.</p><div className="dev-plan-switch"><button aria-pressed={plan === "FREE"} disabled={planBusy || plan === "FREE"} onClick={() => previewPlan("FREE")}>Free</button><button aria-pressed={plan === "PRO"} disabled={planBusy || plan === "PRO"} onClick={() => previewPlan("PRO")}>Pro</button></div></Card>}<Card className="plan-card current"><span className="small-badge ok">{plan === 'FREE' ? '현재 플랜' : '무료 플랜'}</span><h3>Family Care Free</h3><strong className="price">무료</strong><p>구성원 3명 · 자녀 2명</p><p>Family Inbox · Role Match · 완료 확인 · 하루 2회 OCR · 기본 AI 채팅</p></Card><Card className="plan-card pro"><Pro /><h3>Family Care Pro</h3><strong className="price">{plan === 'PRO' ? '현재 플랜' : plans.find(p => p.id === 'PRO')?.status === 'AVAILABLE' ? 'Pro 상품 제공 · 결제 연결 전' : '상태 조회 중'}</strong><p>긴급 요청 · OCR/채팅 한도 확장 · 음성 입력</p><p>패밀리 앨범과 돌봄 제도 검색은 API 연결 완료, 돌봄 공백 예측은 화면 데모예요.</p></Card><Section>기능 준비 상태</Section>{features.filter(f => ['chat_daily_10000_tokens', 'ocr_daily_2', 'emergency_request', 'family_album', 'care_programs', 'device_alerts'].includes(f.id)).map(f => <Card key={f.id} className="simple-list-card"><strong>{f.id}</strong><p>{f.available ? '사용 권한 있음' : 'Pro 필요'} · {f.backend_state === 'READY' ? 'API 준비됨' : '서버 미연결'}</p></Card>)}<Section>기능 화면 둘러보기</Section><div className="family-menu-list">{([['chat', '케어 어시스턴트'], ['emergency', '긴급 도움 요청'], ['gap', '돌봄 공백 예측'], ['album', '패밀리 앨범'], ['programs', '돌봄 제도 안내']] as [Screen, string][]).map(([target, label]) => <button key={target} onClick={() => go(target)}>{label}<span>›</span></button>)}</div></>
  if (boot && screen === 'chat') page = <><div className="eyebrow">케어 어시스턴트 · {plan === 'PRO' ? 'PRO' : 'FREE'}</div><Card className="chat-intro"><img className="voice-mark" src={voiceIcon} alt="" /><strong>무엇을 도와드릴까요?</strong><p>가족방의 일정·돌봄 정보·배정을 바탕으로 서버 AI가 답해요. 배정 변경은 확인 없이 실행하지 않아요.</p>{plan === 'FREE' && <small>오늘 사용: {chatUsedToday.toLocaleString()} / 10,000 토큰</small>}</Card><div className="chat-thread">{!chatMessages.length && <div className="chat-bubble agent">일정이나 배정에 대해 물어보세요.</div>}{chatMessages.map((m, index) => <div key={index} className={'chat-bubble ' + m.from}>{m.text}</div>)}</div><div className="chat-prompts">{['확인할 알림 알려줘', '오늘 담당 배정은?', '등록된 일정은?'].map(text => <button key={text} disabled={chatBusy} onClick={() => sendChat(text)}>{text}</button>)}</div><form className="chat-composer" onSubmit={e => { e.preventDefault(); sendChat() }}><input aria-label="케어 어시스턴트에게 질문" value={chatDraft} onChange={e => setChatDraft(e.target.value)} placeholder="일정이나 배정을 물어보세요" /><button type="submit" disabled={chatBusy || !chatDraft.trim()}>{chatBusy ? '답변 중…' : '보내기'}</button></form><div className="voice-actions"><button className="outline-button" disabled={chatBusy} onClick={toggleRecording}>{recording ? '■ 녹음 끝내고 보내기' : chatBusy ? '음성 처리 중…' : '● 음성 녹음'}</button></div><p className="helper-text">{window.isSecureContext ? '녹음을 끝내면 Whisper가 채팅으로 옮기고 AI가 이어서 답해요.' : '휴대폰 음성 녹음은 HTTPS 접속이 필요해요. 일반 Wi-Fi 주소에서는 파일이나 카메라를 열지 않아요.'}</p></>
  if (boot && screen === 'emergency') page = <><div className="eyebrow urgent">긴급 도움 요청 <Pro /></div><h2 className="hero-title">갑자기 돌봄이<br />어려워졌나요?</h2><p className="hero-copy">Pro 부모가 가족에게 요청할 수 있어요. 서버 알림 기록은 남지만 ThinQ 푸시는 아직 연결되지 않았어요.</p><Card className="form-card"><label className="form-label">도움이 필요한 돌봄</label><select className="form-control" value={emergencyItem} onChange={e => setEmergencyItem(e.target.value)}><option value="">선택하세요</option>{assignments.filter(a => ['PROPOSED', 'ACCEPTED'].includes(a.status)).map(a => <option key={a.id} value={a.id}>{itemFor(a)?.title ?? '돌봄'} · {member(a.assignee_id)}</option>)}</select><label className="form-label">요청 사유</label><input className="form-control" value={emergencyReason} onChange={e => setEmergencyReason(e.target.value)} /><Section>요청을 받을 가족</Section><p>{members.filter(m => m.id !== me?.member.id).map(m => m.name).join(' · ') || '참여 중인 다른 가족이 없어요'}</p></Card><button className="primary-button wide-button" disabled={!emergencyItem || plan !== 'PRO' || (me?.authenticated && me.member.role !== 'PARENT')} onClick={() => run(async () => { await send('/emergency-requests', 'POST', { assignment_id: emergencyItem, reason: emergencyReason.trim() }); const result = await api<{ requests: EmergencyRequest[] }>('/emergency-requests'); setEmergencyRequests(result.requests); setEmergencyItem('') }, '가족에게 긴급 요청을 보냈어요')}>{plan !== 'PRO' ? 'Pro 구독 필요' : '가족 전체에 실제 요청'}</button>{plan !== 'PRO' && <button className="text-link centered" onClick={() => go('plan')}>플랜 확인하기</button>}
    <Section>요청 현황</Section>{emergencyRequests.length ? emergencyRequests.map(r => { const original = boot.assignments.find(a => a.id === r.assignment_id); const canClaim = r.status === 'OPEN' && me?.member.id !== r.requested_by_member_id && me?.member.id !== original?.assignee_id; const canCancel = r.status === 'OPEN' && (me?.member.id === r.requested_by_member_id || !!me?.member.is_owner); return <Card key={r.id} className="urgent-card"><span className={'small-badge ' + (r.status === 'OPEN' ? 'danger' : 'ok')}>{r.status === 'OPEN' ? '도움 대기' : r.status === 'CLAIMED' ? '담당 확정' : '취소됨'}</span><strong>{r.item_title}</strong><p>{r.reason}</p>{r.claimed_by_member_id && <p>새 담당 · {member(r.claimed_by_member_id)}</p>}{canClaim && <button className="primary-button wide-button" onClick={() => run(async () => { await send('/emergency-requests/' + r.id + '/claim', 'POST'); setEmergencyRequests((await api<{ requests: EmergencyRequest[] }>('/emergency-requests')).requests) }, '새 담당자로 확정됐어요')}>제가 맡을게요</button>}{canCancel && <button className="outline-button wide-button" onClick={() => run(async () => { await send('/emergency-requests/' + r.id + '/cancel', 'POST'); setEmergencyRequests((await api<{ requests: EmergencyRequest[] }>('/emergency-requests')).requests) }, '긴급 요청을 취소했어요')}>요청 취소</button>}</Card> }) : <Empty title="진행 중인 긴급 요청이 없어요" text="요청이 생기면 이곳에서 응답할 수 있어요" />}</>
  if (boot && screen === 'location') page = <><div className="eyebrow">돌봄 동선</div><h2 className="hero-title">지금 어디쯤<br />오고 있나요?</h2><p className="hero-copy">인수인계된 위치와 이동 시간을 한눈에 확인해요.</p><div className="map-panel"><div className="map-road one" /><div className="map-road two" /><span className="map-pin school">학교</span><span className="map-pin academy">태권도</span><span className="map-pin home">집</span><span className="map-route" /></div><Card className="route-card"><strong>학교 → 태권도</strong><p>할머니와 이동 중 · 10분 후 도착 예정</p><div className="route-progress"><span /></div></Card></>
  if (boot && screen === 'gap') page = <><div className="eyebrow">돌봄 공백 살펴보기 <Pro /></div><h2 className="hero-title">담당자가 없는 일을<br />미리 살펴봐요</h2><p className="hero-copy">예측 엔진 연결 전 데모입니다. 현재 등록된 돌봄 중 아직 배정되지 않은 항목을 보여줘요.</p>{boot.items.filter(i => i.status === 'CONFIRMED' && !assignments.some(a => a.item_id === i.id)).map(i => <button key={i.id} className="family-alert" onClick={() => openSuggestion(i)}><span className="small-badge danger">배정 필요</span><strong>{i.title} · {child(i.child_id)}</strong><span>›</span></button>)}<Section>다음 준비</Section><div className="family-menu-list"><button onClick={() => go('schedule')}>가족 일정 등록<span>›</span></button><button onClick={() => go('assignments')}>담당 배정 확인<span>›</span></button><button onClick={() => go('programs')}>지원 제도 살펴보기<span>›</span></button></div></>
  if (boot && screen === 'album') page = <AlbumPage plan={plan} busy={albumBusy} groups={albumGroups} onUpload={files => void addAlbumPhotos(files)} onSelect={openAlbumPhoto} onPlan={() => go('plan')} />
  if (boot && screen === 'programs') page = <ProgramsPage plan={plan} keyword={benefitKeyword} city={benefitCity} district={benefitDistrict} savedLocation={benefitLocation} busy={benefitsBusy} locationBusy={benefitLocationBusy} programs={benefits} institutions={careInstitutions} eligibility={eligibilityCriteria} active={activeBenefit} onKeyword={setBenefitKeyword} onCity={setBenefitCity} onDistrict={setBenefitDistrict} onSaveLocation={() => void saveBenefitLocation()} onSearch={() => void searchBenefits()} onSelect={setProgramSelected} onPlan={() => go('plan')} />

  if (screen === 'onboarding' && !invitationFromUrl && devLoginOptions.length > 0) page = <>{page}<Card className="dev-login-card"><span className="small-badge danger">TEST LOGIN</span><strong>테스트 사용자로 바로 입장</strong><p>개발 중에만 표시되며 원하는 가족 구성원 권한으로 확인할 수 있어요.</p><div className="dev-login-list">{devLoginOptions.map(option => <button key={option.member_id} disabled={onboardBusy} onClick={() => void loginForTest(option.member_id)}><span>{option.family_name}</span><strong>{option.member_name}{option.is_owner ? ' · 주돌봄자' : ''}</strong></button>)}</div></Card></>
  if (boot && screen === 'members' && me?.authenticated && !me.member.is_owner) page = <>{page}<Section>가족 초대</Section><Card className="form-card invite-share-card"><p>모든 가족 구성원이 초대 링크를 만들어 공유할 수 있어요. Free는 구성원 3명까지예요.</p>{inviteCode && <><div className="invite-code"><strong>{inviteCode}</strong><small>만료: {formatDate(inviteExpiresAt)}</small></div><label className="form-label">초대할 가족의 역할</label><select className="form-control" value={inviteRole} onChange={e => setInviteRole(e.target.value)}><option value="PARENT">부모</option><option value="GRANDPARENT">조부모</option><option value="CAREGIVER">돌봄 참여자</option></select><input className="invite-link" aria-label="가족방 초대 링크" value={inviteLink} readOnly /><button className="kakao-share wide-button" onClick={shareInvite}>링크 복사·공유하기</button></>}<button className="outline-button wide-button" onClick={() => run(async () => { const result = await send<{ invite_code: string; invite_expires_at: string }>('/families/invite-code/rotate', 'POST'); setInviteCode(result.invite_code); setInviteExpiresAt(result.invite_expires_at) }, '새 초대 링크를 만들었어요')}>{inviteCode ? '초대 링크 새로 만들기' : '초대 링크 만들기'}</button></Card></>

  const isRoot = rootScreens.includes(screen)
  const showChrome = !!boot && screen !== 'onboarding'
  const showBack = showChrome && !isRoot
  const backTarget: Screen = ['capture', 'review', 'family', 'calendar'].includes(screen) ? 'schedule'
    : ['assignments', 'suggestion', 'tasks', 'exception', 'emergency', 'location'].includes(screen) ? 'careHub'
      : ['members', 'permissions'].includes(screen) ? 'familyHub'
        : ['notifications', 'settings', 'gap', 'album', 'programs', 'plan'].includes(screen) ? 'more' : 'home'
  const scheduleActive = ['schedule', 'calendar', 'capture', 'review', 'family'].includes(screen)
  const careActive = ['careHub', 'assignments', 'suggestion', 'tasks', 'exception', 'emergency', 'location'].includes(screen)
  const familyActive = ['familyHub', 'members', 'permissions'].includes(screen)
  const moreActive = ['more', 'notifications', 'settings', 'gap', 'album', 'programs', 'plan'].includes(screen)

  return <div className="app-shell"><aside className="screen-index"><div className="brand"><span className="brand-mark">LG</span><div><strong>Family Care</strong><small>기능 목업 개발 버전</small></div></div><p className="index-intro">Figma 기능 페이지의 주요 흐름을 화면별로 확인할 수 있어요.</p>{groups.map(g => <div key={g.title} className="index-group"><h2>{g.title}</h2>{g.pages.map(([id, label]) => <button key={id} className={screen === id ? 'active' : ''} onClick={() => go(id)}>{label}</button>)}</div>)}</aside>
    <div className="phone-wrap"><div className="phone">{showChrome && <header className="app-header"><div><strong>Family Care</strong><small>{boot.family.name}</small></div><button className="header-bell" aria-label="알림함" onClick={() => go('notifications')}>🔔{unread > 0 && <i>{unread}</i>}</button><button className="header-profile" aria-label="내 프로필과 가족 설정" onClick={() => go('members')}>{(me?.member.name ?? '가').slice(0, 1)}</button></header>}<main ref={contentRef} className="phone-content">{showBack && <button className="inline-back" aria-label="이전 메뉴로 돌아가기" onClick={() => go(backTarget)}>← 이전</button>}{page}</main>{showChrome && screen !== 'chat' && <button className="floating-assistant" aria-label="케어 어시스턴트 열기" onClick={() => go('chat')}><img src={floatingIcon} alt="" /></button>}{showChrome && <nav className="bottom-nav" aria-label="Family Care 주요 메뉴"><button aria-current={screen === 'home' ? 'page' : undefined} className={screen === 'home' ? 'active' : ''} onClick={() => go('home')}><span className="nav-icon" style={{ WebkitMaskImage: `url("${homeTabIcon}")`, maskImage: `url("${homeTabIcon}")` }} />홈</button><button aria-current={careActive ? 'page' : undefined} className={careActive ? 'active' : ''} onClick={() => go('careHub')}><span className="nav-icon" style={{ WebkitMaskImage: `url("${careTabIcon}")`, maskImage: `url("${careTabIcon}")` }} />케어</button><button aria-current={scheduleActive ? 'page' : undefined} className={scheduleActive ? 'active' : ''} onClick={() => go('schedule')}><span className="nav-icon" style={{ WebkitMaskImage: `url("${calendarTabIcon}")`, maskImage: `url("${calendarTabIcon}")` }} />일정</button><button aria-current={familyActive ? 'page' : undefined} className={familyActive ? 'active' : ''} onClick={() => go('familyHub')}><span className="nav-icon family-icon" style={{ WebkitMaskImage: `url("${familyTabIcon}")`, maskImage: `url("${familyTabIcon}")` }} />가족</button><button aria-current={moreActive ? 'page' : undefined} className={moreActive ? 'active' : ''} onClick={() => go('more')}><span className="nav-icon" style={{ WebkitMaskImage: `url("${moreTabIcon}")`, maskImage: `url("${moreTabIcon}")` }} />더보기</button></nav>}</div>{error && <div className="error-toast" role="alert"><button aria-label="닫기" onClick={() => setError('')}>×</button>{error}</div>}{toast && <div className="success-toast" role="status">{toast}</div>}</div>
    {selectedAlbumPhoto && <AlbumLightbox photo={selectedAlbumPhoto} onClose={() => history.back()} />}
    {scheduleSheet === 'DAY' && boot && <div className="schedule-overlay" onClick={() => setScheduleSheet('NONE')}><section className="schedule-day-sheet" onClick={e => e.stopPropagation()}><header><div><small>선택한 날짜</small><h2>{new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(selectedDate + 'T12:00:00'))}</h2></div><button aria-label="날짜 일정 닫기" onClick={() => setScheduleSheet('NONE')}>×</button></header><div className="day-sheet-events">{scheduleScope === 'all' && boot.schedules.filter(s => dateKey(s.starts_at) === selectedDate).map(s => <Card key={s.id} className="calendar-event personal"><i /><time>{formatTime(s.starts_at)}</time><div><strong>{s.title}</strong><p>{member(s.member_id)} · {s.kind === 'WORK' ? '업무 일정' : '고정 루틴'}</p></div><span className="caregiver-pill self">본인</span></Card>)}{filteredChildSchedules.filter(s => dateKey(s.starts_at) === selectedDate).map(s => { const caregiver = caregiverForChildSchedule(s.id); return <Card key={s.id} className="calendar-event"><i style={{ background: childColor(s.child_id) }} /><time>{formatTime(s.starts_at)}</time><div><strong>{s.title}</strong><p>{child(s.child_id)} · {childScheduleLabel[s.category] ?? '아이 일정'}</p></div><span className={'caregiver-pill ' + (caregiver?.status === 'ACCEPTED' ? 'confirmed' : '')}>{caregiver ? `${caregiver.status === 'ACCEPTED' ? '담당' : '요청 중'} · ${caregiver.name}` : '미배정'}</span></Card> })}{filteredCareSchedules.filter(i => dateKey(i.starts_at!) === selectedDate).map(i => { const caregiver = caregiverForCareItem(i.id); return <Card key={i.id} className="calendar-event"><i style={{ background: childColor(i.child_id) }} /><time>{formatTime(i.starts_at)}</time><div><strong>{i.title}</strong><p>{child(i.child_id)} · 알림장</p></div><span className={'caregiver-pill ' + (caregiver?.status === 'ACCEPTED' ? 'confirmed' : '')}>{caregiver ? `${caregiver.status === 'ACCEPTED' ? '담당' : '요청 중'} · ${caregiver.name}` : '미배정'}</span></Card> })}{calendarEventsFor(selectedDate).length === 0 && <Empty title="등록된 일정이 없어요" text="아래 + 버튼으로 이 날의 일정을 추가해보세요" />}</div><button className="day-add-button" aria-label="선택한 날짜에 일정 추가" onClick={() => setScheduleSheet('CHOOSER')}>＋</button></section></div>}
    {scheduleSheet === 'CHOOSER' && <div className="sheet-overlay" onClick={() => setScheduleSheet('DAY')}><div className="bottom-sheet schedule-chooser" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><h2>누구의 일정인가요?</h2><p>등록할 일정의 주인을 먼저 선택해주세요.</p><div className="schedule-owner-options"><button onClick={() => { setScheduleForm('CHILD'); setScheduleSheet('FORM') }}><i>아</i><strong>아이</strong><small>학원·학교·방과후 루틴</small></button><button onClick={() => { setScheduleForm('PERSONAL'); setScheduleSheet('FORM') }}><i>나</i><strong>본인</strong><small>운동·업무·개인 루틴</small></button></div><button className="text-link centered" onClick={() => setScheduleSheet('DAY')}>돌아가기</button></div></div>}
    {scheduleSheet === 'FORM' && boot && <div className="sheet-overlay" onClick={() => setScheduleSheet('CHOOSER')}><div className="bottom-sheet schedule-form-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><div className="form-segment"><button className={scheduleForm === 'CHILD' ? 'active' : ''} onClick={() => setScheduleForm('CHILD')}>아이</button><button className={scheduleForm === 'PERSONAL' ? 'active' : ''} onClick={() => setScheduleForm('PERSONAL')}>본인</button></div><h2>{scheduleForm === 'CHILD' ? '아이 일정 등록' : '내 일정 등록'}</h2>{scheduleForm === 'CHILD' ? <><label className="form-label">아이 이름 (필수)</label><select className="form-control" value={childScheduleChild} onChange={e => setChildScheduleChild(e.target.value)}><option value="">아이를 선택하세요</option>{boot.children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><label className="form-label">일정 종류</label><select className="form-control" value={childScheduleCategory} onChange={e => setChildScheduleCategory(e.target.value)}><option value="ACADEMY">학원</option><option value="AFTER_SCHOOL">방과후</option><option value="SCHOOL">학교</option><option value="ACTIVITY">활동</option><option value="OTHER">기타</option></select></> : <><label className="form-label">일정 종류</label><select className="form-control" value={scheduleKind} onChange={e => setScheduleKind(e.target.value as 'WORK' | 'ROUTINE')}><option value="ROUTINE">개인 루틴·운동</option><option value="WORK">업무 일정</option></select></>}<label className="form-label">일정 이름</label><input className="form-control" value={scheduleTitle} onChange={e => setScheduleTitle(e.target.value)} placeholder={scheduleForm === 'CHILD' ? '예: 태권도, 방과후 미술' : '예: 헬스, 오전 회의'} /><ScheduleTimeFields date={scheduleDate} start={scheduleStartTime} end={scheduleEndTime} onDate={setScheduleDate} onStart={setScheduleStartTime} onEnd={setScheduleEndTime} /><div className="repeat-setting"><button className={'switch ' + (scheduleRepeat ? 'on' : '')} role="switch" aria-checked={scheduleRepeat} aria-label="매주 반복" onClick={() => setScheduleRepeat(value => !value)}><span /></button><div><strong>매주 반복하는 고정 루틴</strong><p>선택한 요일과 시간으로 한 번에 등록해요.</p></div></div>{scheduleRepeat && <><div className="weekday-picker">{['월', '화', '수', '목', '금', '토', '일'].map((label, day) => <button key={label} className={scheduleRepeatDays.includes(day) ? 'active' : ''} onClick={() => setScheduleRepeatDays(current => current.includes(day) ? current.filter(value => value !== day) : [...current, day])}>{label}</button>)}</div><label className="form-label">반복 종료일</label><input className="form-control" type="date" value={scheduleRepeatUntil} onChange={e => setScheduleRepeatUntil(e.target.value)} /></>}<button className="primary-button wide-button" onClick={saveSchedule}>{scheduleRepeat ? '고정 루틴 일괄 등록' : '이 일정 등록'}</button>{scheduleForm === 'PERSONAL' && <button className="outline-button wide-button" onClick={() => { setScheduleSheet('NONE'); go('calendar') }}>Google·Outlook 캘린더 연동</button>}{scheduleForm === 'CHILD' && <button className="outline-button wide-button" onClick={() => { setScheduleSheet('NONE'); go('capture') }}>알림장 사진으로 등록</button>}<button className="text-link centered" onClick={() => setScheduleSheet('CHOOSER')}>이전</button></div></div>}
    {showSheet && <div className="sheet-overlay" onClick={() => setShowSheet(false)}><div className="bottom-sheet completion-sheet" onClick={e => e.stopPropagation()}><div className="sheet-handle" /><h2>특이사항이 있었나요?</h2><p>여기서 남긴 내용이 다음 돌봄자에게 자동으로 인수인계돼요.</p><label className="form-label">특이사항</label><textarea className="text-area" rows={4} value={note} onChange={e => setNote(e.target.value)} placeholder="수기로 입력하거나 아래에서 말해주세요. 없으면 빈칸도 괜찮아요." /><button className="outline-button wide-button" disabled={completionVoiceBusy} onClick={toggleCompletionRecording}>{completionRecording ? '■ 녹음 끝내기' : completionVoiceBusy ? '음성 인식 중…' : '● 음성 녹음'}</button><label className="form-label">완료 사진 (선택)</label><input ref={completionCameraInputRef} className="hidden-capture-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e => { selectCompletionPhoto(e.currentTarget.files?.[0]); e.currentTarget.value = '' }} /><input ref={completionPhotoInputRef} className="hidden-capture-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { selectCompletionPhoto(e.currentTarget.files?.[0]); e.currentTarget.value = '' }} />{completionPreview && <div className="completion-preview"><img src={completionPreview} alt="선택한 완료 사진" /><button onClick={() => { setCompletionPhoto(null); setCompletionPreview('') }}>×</button></div>}<div className="completion-photo-actions"><button className="outline-button" disabled={plan !== 'PRO'} onClick={() => completionCameraInputRef.current?.click()}>사진 촬영</button><button className="outline-button" disabled={plan !== 'PRO'} onClick={() => completionPhotoInputRef.current?.click()}>앨범에서 선택</button></div>{plan !== 'PRO' && <button className="text-link centered" onClick={() => { setShowSheet(false); go('plan') }}>완료 사진은 Pro에서 사용할 수 있어요</button>}<button className="primary-button wide-button" disabled={completionVoiceBusy || completionRecording} onClick={complete}>완료하고 인수인계하기</button><button className="text-link centered" onClick={() => setShowSheet(false)}>돌아가기</button></div></div>}
  </div>
}

export default App
