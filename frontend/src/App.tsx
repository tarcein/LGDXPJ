import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api, send, upload, setFamilyToken, hasFamilyToken, ApiError, formatDate, formatTime, type Assignment, type Bootstrap, type CareItem, type Screen, type Suggestion, type FamilyMe, type FamilySession, type ChatAnswer, type EmergencyRequest, type CalendarConnection, type Notice, type AlbumPhoto, type Benefit, type BenefitLocation, type CareInstitution, type EligibilityCriteria, type BillingConfig, type BillingOrder, type ChatCard } from './api'
import voiceIcon from '../../asset/assistant-main-logo-centered.png'
import googleIcon from '../../asset/google.png'
import outlookIcon from '../../asset/outlook.png'
import homeScheduleDoneIcon from '../../asset/서비스홈화면/오늘일정완료체크.png'
import homeAttentionIcon from '../../asset/서비스홈화면/확인필요.png'
import homeHandoffIcon from '../../asset/서비스홈화면/인수인계.png'
import homeSupplyIcon from '../../asset/서비스홈화면/준비물확인.png'
import scheduleOwnerIcon from '../../asset/온보딩일정등록/본인_web.png'
import scheduleChildIcon from '../../asset/온보딩일정등록/아이_web.png'
import selectedRoleIcon from '../../asset/가족방만들기온보딩/선택한역할.png'
import inviteKakaoIcon from '../../asset/가족방만들기온보딩/KakaoIcon.png'
import inviteMessageIcon from '../../asset/가족방만들기온보딩/말풍선.png'
import inviteLinkIcon from '../../asset/가족방만들기온보딩/🔗.png'
import inviteMoreIcon from '../../asset/가족방만들기온보딩/⋯.png'
import careEmergencyIcon from '../../asset/케어탭서비스/긴급도움요청.png'
import careAssignmentIcon from '../../asset/케어탭서비스/역할배정.png'
import careDoneNode from '../../asset/케어탭서비스/완료일정.png'
import careDoneLine from '../../asset/케어탭서비스/완료동선.png'
import careActiveNode from '../../asset/케어탭서비스/진행중일정.png'
import careActiveLine from '../../asset/케어탭서비스/실행중동선.png'
import careFutureNode from '../../asset/케어탭서비스/미실행일정.png'
import careFutureLine from '../../asset/케어탭서비스/미실행동선.png'
import chatHeaderIcon from '../../asset/AI채팅/좌측상단.png'
import chatSendIcon from '../../asset/AI채팅/전송.png'
import chatMicIcon from '../../asset/AI채팅/음성인식.png'
import chatLoading1 from '../../asset/AI채팅/로딩1.png'
import chatLoading2 from '../../asset/AI채팅/로딩2.png'
import chatLoading3 from '../../asset/AI채팅/로딩3.png'
import chatLoading4 from '../../asset/AI채팅/로딩4.png'
import schoolIcon from '../../asset/학교.png'
import backpackIcon from '../../asset/책가방.png'
import lockIcon from '../../asset/잠금.png'
import familySettingsUiIcon from '../../asset/아이콘/가족설정_web.png'
import familyAlbumUiIcon from '../../asset/아이콘/패밀리앨범.png'
import informationUiIcon from '../../asset/아이콘/정보공개_web.png'
import notificationsUiIcon from '../../asset/아이콘/알림함_web.png'
import notificationSettingsUiIcon from '../../asset/아이콘/알림설정_web.png'
import careGapUiIcon from '../../asset/아이콘/돌봄공백예측_web.png'
import careProgramUiIcon from '../../asset/아이콘/돌봄제도.png'
import planPaymentUiIcon from '../../asset/아이콘/플랜결제_web.png'
import familyOnboardingUiIcon from '../../asset/아이콘/가족방온보딩_web.png'
import scheduleOnboardingUiIcon from '../../asset/아이콘/일정등록온보딩_web.png'
import proCharacter from '../../asset/프로안내화면/프로캐릭터.png'
import proPlanBadge from '../../asset/프로안내화면/프로플랜.png'
import proStartButton from '../../asset/프로안내화면/프로시작.png'
import memberProfile1 from '../../asset/구성원프로필/구성원1.png'
import memberProfile2 from '../../asset/구성원프로필/구성원2.png'
import memberProfile3 from '../../asset/구성원프로필/구성원3.png'
import memberProfile4 from '../../asset/구성원프로필/구성원4.png'
import memberProfile5 from '../../asset/구성원프로필/구성원5.png'
import memberProfile6 from '../../asset/구성원프로필/구성원6.png'
import memberProfile7 from '../../asset/구성원프로필/구성원7.png'
import memberProfile8 from '../../asset/구성원프로필/구성원8.png'
import memberActiveIcon from '../../asset/구성원프로필/활동중.png'
import memberInactiveIcon from '../../asset/구성원프로필/활동중아님.png'
import { AppHeader, BottomNav, FloatingAssistant, MobileStatusBar } from './components/AppChrome'
import { LockscreenPreview, ServiceLoading, ThinQEntry, ThinQHomeSelector } from './components/EntryScreens'
import { BottomSheet, Card, Empty, Pro, Section } from './components/ui'

const groups: { title: string; pages: [Screen, string][] }[] = [
  { title: 'ThinQ 진입 · 외부 화면', pages: [['thinq', 'ThinQ 홈'], ['lockscreen', '잠금화면 동선']] },
  { title: '서비스 탭', pages: [['home', '홈'], ['careHub', '케어'], ['schedule', '일정'], ['familyHub', '가족'], ['more', '더보기']] },
  { title: '돌봄 정보', pages: [['family', '알림장·돌봄 정보'], ['capture', '알림장 등록'], ['review', '추출 결과 확인'], ['assignments', '오늘의 배정'], ['suggestion', '배정 제안'], ['tasks', '오늘 할 일']] },
  { title: '돌봄 흐름', pages: [['scheduleOnboarding', '일정 등록 온보딩'], ['schedule', '개인 일정'], ['exception', '예외 상황'], ['notifications', '알림함']] },
  { title: '가족 · 설정', pages: [['onboarding', '온보딩'], ['calendar', '캘린더 연동'], ['members', '가족 구성원'], ['permissions', '정보 공개 권한'], ['album', '우리집 기록함'], ['settings', '알림 설정'], ['plan', '플랜 비교']] },
  { title: '확장 화면', pages: [['chat', 'AI 채팅'], ['emergency', '긴급 요청'], ['location', '돌봄 동선'], ['gap', '돌봄 공백 예측'], ['programs', '돌봄 제도']] },
]
const typeLabel: Record<string, string> = { SCHEDULE: '일정', SUPPLY: '준비물', TODO: '할 일', CHANGE: '변경사항' }
const childScheduleLabel: Record<string, string> = { ACADEMY: '학원', SCHOOL: '학교', AFTER_SCHOOL: '방과후', ACTIVITY: '활동', OTHER: '기타' }
const roleLabel: Record<string, string> = { PARENT: '부모', GRANDPARENT: '조부모', CAREGIVER: '돌봄 참여자' }
const chatScreenLabel: Partial<Record<Screen, string>> = { schedule: '캘린더 보기', calendar: '캘린더 연동 보기', tasks: '내 할 일 보기', assignments: '담당 배정 보기', notifications: '알림함 보기', members: '가족 구성원 보기', album: '우리집 기록함 보기', programs: '돌봄 제도 보기', plan: '플랜 보기', home: '홈으로 가기', careHub: '케어 보기', familyHub: '가족 설정 보기', settings: '설정 보기' }
type ChatMessage = { from: 'me' | 'agent'; text: string; cards?: ChatCard[] }
type EditingSchedule = { type: 'PERSONAL' | 'CHILD'; id: string }
type SubscriptionState = { plan: string; status: string; developer_preview: boolean; dev_switch_available: boolean; current_period_end?: string | null; next_billing_at?: string | null; cancel_at_period_end: boolean; canceled_at?: string | null; auto_renew_available: boolean; renewal_mode: 'AUTO_BILLING' | 'ONE_TIME' }
type TossPayment = { requestBillingAuth: (request: { method: 'CARD'; successUrl: string; failUrl: string; customerName?: string; windowTarget?: 'self' | 'iframe' }) => Promise<void> }
type TossRenderedWidget = { destroy: () => void }
type TossWidgets = {
  setAmount: (amount: { currency: 'KRW'; value: number }) => Promise<void>
  renderPaymentMethods: (options: { selector: string; variantKey: string }) => Promise<TossRenderedWidget>
  renderAgreement: (options: { selector: string; variantKey: string }) => Promise<TossRenderedWidget>
  requestPayment: (request: { orderId: string; orderName: string; successUrl: string; failUrl: string; customerName?: string }) => Promise<void>
}
type TossFactory = (clientKey: string) => {
  payment: (options: { customerKey: string }) => TossPayment
  widgets: (options: { customerKey: string }) => TossWidgets
}
type DevLoginOption = { family_id: string; family_name: string; member_id: string; member_name: string; role: string; is_owner: boolean }
type OnboardingStep = 'ROOM' | 'ROLE' | 'CHILD' | 'INVITE_SETUP' | 'INVITE'
type ScheduleOnboardingStep = 'OWNER' | 'CALENDAR' | 'ROUTINE'
type OnboardChild = { name: string; ageLabel: string }
type KakaoSdk = {
  init: (key: string) => void
  isInitialized: () => boolean
  Share: { sendDefault: (options: { objectType: 'text'; text: string; link: { mobileWebUrl: string; webUrl: string }; buttonTitle: string }) => Promise<unknown> }
}
declare global { interface Window { Kakao?: KakaoSdk } }
const kakaoJavaScriptKey = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY?.trim()
const memberProfileAssets = [memberProfile1, memberProfile2, memberProfile3, memberProfile4, memberProfile5, memberProfile6, memberProfile7, memberProfile8]
const localDateTime = (value: string | null) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ''
const localClock = (value: string) => new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
const normalizeClock = (value: string) => {
  const compact = value.trim().replace(/\s/g, '')
  const digits = compact.replace(/\D/g, '')
  const candidate = compact.includes(':') ? compact : digits.length === 3 ? `0${digits[0]}:${digits.slice(1)}` : digits.length === 4 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : compact
  const match = candidate.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return ''
  const hour = Number(match[1]); const minute = Number(match[2])
  return hour <= 23 && minute <= 59 ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : ''
}

function ScheduleTimeFields({ date, start, end, onDate, onStart, onEnd }: {
  date: string; start: string; end: string
  onDate: (value: string) => void; onStart: (value: string) => void; onEnd: (value: string) => void
}) {
  const clean = (value: string) => value.replace(/[^\d:]/g, '').slice(0, 5)
  return <><label className="form-label">날짜</label><input className="form-control" type="date" value={date} onChange={event => onDate(event.target.value)} /><div className="time-pair direct-time"><label><span>시작 시간</span><input className="form-control" type="text" inputMode="numeric" autoComplete="off" placeholder="09:00" value={start} onChange={event => onStart(clean(event.target.value))} onBlur={() => { const normalized = normalizeClock(start); if (normalized) onStart(normalized) }} /></label><label><span>종료 시간 (선택)</span><input className="form-control" type="text" inputMode="numeric" autoComplete="off" placeholder="없으면 비워두기" value={end} onChange={event => onEnd(clean(event.target.value))} onBlur={() => { const normalized = normalizeClock(end); if (normalized) onEnd(normalized) }} /></label></div><p className="time-input-help">퇴근처럼 한 시점의 일정은 종료 시간을 비워두세요. 예: 930 → 09:30</p></>
}
function AlbumPage({ plan, busy, groups, selectedDate, onUpload, onSelect, onOpenFolder, onBackFolders, onPlan }: {
  plan: string; busy: boolean; groups: [string, AlbumPhoto[]][]; selectedDate: string
  onUpload: (files: File[]) => void; onSelect: (photo: AlbumPhoto) => void
  onOpenFolder: (date: string) => void; onBackFolders: () => void; onPlan: () => void
}) {
  const selected = groups.find(([date]) => date === selectedDate)
  const selectedPhotos = selected?.[1] ?? []
  const dateLabel = (date: string) => new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(date + 'T12:00:00'))
  return <><div className="eyebrow">우리집 기록함 <Pro /></div><h2 className="hero-title">가족의 순간을<br />날짜별로 모아요</h2><p className="hero-copy">직접 올린 사진과 돌봄 완료 사진을 날짜 폴더로 나눠 저장하고 함께 봐요.</p>{plan === 'PRO' ? <><label className="album-upload">{busy ? '저장 중…' : '＋ 사진 선택'}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={event => { onUpload(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = '' }} /></label>{selectedDate ? <section className="album-folder-view"><button className="album-folder-back" onClick={onBackFolders}>‹ 날짜 폴더</button><Section>{dateLabel(selectedDate)}</Section><small className="album-folder-path">폴더 · {selectedPhotos[0]?.date_folder ?? selectedDate.replaceAll('-', '/')} · 사진 {selectedPhotos.length}장</small><div className="album-grid">{selectedPhotos.map(photo => <button key={photo.id} onClick={() => onSelect(photo)}><img src={photo.data_url} alt={photo.caption || photo.file_name} /><small>{photo.kind === 'CARE_COMPLETION' ? '돌봄 완료 · ' : ''}{photo.caption || photo.file_name}</small></button>)}</div>{!selectedPhotos.length && <Empty title="이 폴더에 사진이 없어요" text="날짜 폴더 목록으로 돌아가 다른 날짜를 선택해주세요" />}</section> : <><Section>날짜 폴더</Section><div className="album-folder-list">{groups.map(([date, photos]) => <button className="album-folder-card" key={date} onClick={() => onOpenFolder(date)}><span className="album-folder-icon">◆</span><span><strong>{dateLabel(date)}</strong><small>{photos.length}장 · {photos[0]?.date_folder ?? date.replaceAll('-', '/')}</small></span><span className="album-folder-preview">{photos.slice(0, 3).map(photo => <img key={photo.id} src={photo.data_url} alt="" />)}</span><b>›</b></button>)}</div>{!groups.length && <Empty title="아직 사진이 없어요" text="사진을 올리거나 돌봄 완료 때 사진을 남겨보세요" />}</>}</> : <button className="primary-button wide-button" onClick={onPlan}>Pro에서 우리집 기록함 사용</button>}</>
}
function AlbumLightbox({ photo, deleting, onClose, onDelete }: { photo: AlbumPhoto; deleting: boolean; onClose: () => void; onDelete: () => void }) {
  const [shareFile, setShareFile] = useState<File | null>(null)
  const [saveMode, setSaveMode] = useState<'loading' | 'share' | 'download'>(() => typeof navigator.share === 'function' ? 'loading' : 'download')

  useEffect(() => {
    let cancelled = false
    if (typeof navigator.share !== 'function') return
    void fetch(photo.data_url).then(async response => {
      if (!response.ok) throw new Error('사진을 불러오지 못했어요')
      const blob = await response.blob()
      if (cancelled) return
      const mimeType = blob.type || photo.mime_type || 'image/jpeg'
      const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' } as Record<string, string>)[mimeType] || 'jpg'
      const baseName = photo.file_name || `family-photo-${photo.id}`
      const fileName = /\.[a-z0-9]+$/i.test(baseName) ? baseName : `${baseName}.${extension}`
      const file = new File([blob], fileName, { type: mimeType })
      const canShare = typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] })
      if (canShare) {
        setShareFile(file)
        setSaveMode('share')
      } else {
        setSaveMode('download')
      }
    }).catch(() => {
      if (!cancelled) setSaveMode('download')
    })

    return () => { cancelled = true }
  }, [photo.data_url, photo.file_name, photo.id, photo.mime_type])

  const downloadPhoto = () => {
    const link = document.createElement('a')
    link.href = photo.data_url
    link.download = photo.file_name || `family-photo-${photo.id}`
    link.click()
  }
  const savePhoto = () => {
    if (saveMode !== 'share' || !shareFile) {
      downloadPhoto()
      return
    }
    try {
      void navigator.share({ files: [shareFile], title: photo.caption || photo.file_name || '가족 사진' }).catch(error => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) downloadPhoto()
      })
    } catch {
      downloadPhoto()
    }
  }

  return <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label="사진 크게 보기" onClick={onClose}><div className="photo-lightbox-panel" onClick={event => event.stopPropagation()}><button className="photo-lightbox-close" aria-label="사진 닫기" onClick={onClose}>×</button><img src={photo.data_url} alt={photo.caption || photo.file_name} /><div className="photo-lightbox-info"><strong>{photo.caption || photo.file_name}</strong><small>{formatDate(photo.created_at)} · {photo.kind === 'CARE_COMPLETION' ? '돌봄 완료 사진' : '우리집 기록함'}</small><div className="photo-lightbox-actions"><button className="primary-button" disabled={saveMode === 'loading'} onClick={savePhoto}>{saveMode === 'loading' ? '사진 준비 중…' : saveMode === 'share' ? '사진 앱에 저장' : '사진 다운로드'}</button>{photo.can_delete && <button className="photo-delete-button" disabled={deleting} onClick={onDelete}>{deleting ? '삭제 중…' : '사진 삭제'}</button>}</div>{saveMode === 'share' && <small className="photo-save-hint">iPhone에서는 공유 메뉴에서 ‘이미지 저장’을 눌러주세요.</small>}</div></div></div>
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
        <strong>내 돌봄 정보 검색 지역</strong>
        <div className="benefit-location-fields">
          <label><span>시·도</span><input className="form-control" aria-label="혜택 지역 시·도" value={city} onChange={event => onCity(event.target.value)} /></label>
          <label><span>시·군·구</span><input className="form-control" aria-label="혜택 지역 시·군·구" value={district} onChange={event => onDistrict(event.target.value)} /></label>
        </div>
        <button className="outline-button wide-button" disabled={locationBusy || !city.trim() || !district.trim()} onClick={onSaveLocation}>{locationBusy ? '지역 확인 중…' : hasLocation ? '지역 변경하고 다시 찾기' : '이 지역으로 찾기'}</button>
        <small>가족 구성원마다 각자의 검색 지역을 저장할 수 있고, 상세 주소는 저장하지 않아요.</small>
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
  const initialQuery = new URLSearchParams(location.search)
  const invitationFromUrl = initialQuery.get('invite')?.trim().toUpperCase() ?? ''
  const roleFromUrl = initialQuery.get('role')?.trim().toUpperCase() ?? ''
  const billingResultFromUrl = initialQuery.get('payment') ?? initialQuery.get('billing') ?? ''
  const scheduleCalendarReturn = sessionStorage.getItem('family-care-schedule-calendar-return') === '1'
  const invitedRole = ['PARENT', 'GRANDPARENT', 'CAREGIVER'].includes(roleFromUrl) ? roleFromUrl : 'CAREGIVER'
  const [boot, setBoot] = useState<Bootstrap | null>(null)
  const [me, setMe] = useState<FamilyMe | null>(null)
  const [screen, setScreen] = useState<Screen>(() => invitationFromUrl ? 'onboarding' : hasFamilyToken() && billingResultFromUrl ? 'plan' : hasFamilyToken() && initialQuery.has('calendar') ? (scheduleCalendarReturn ? 'scheduleOnboarding' : 'calendar') : 'thinq')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [noticeScope, setNoticeScope] = useState<'mine' | 'family'>('mine')
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
  const [scheduleEndTime, setScheduleEndTime] = useState('')
  const [scheduleScope, setScheduleScope] = useState('all')
  const [scheduleForm, setScheduleForm] = useState<'PERSONAL' | 'CHILD'>(() => sessionStorage.getItem('family-care-schedule-owner') === 'PERSONAL' ? 'PERSONAL' : 'CHILD')
  const [scheduleEntryMode, setScheduleEntryMode] = useState<'SINGLE' | 'REPEAT'>('SINGLE')
  const [scheduleSheet, setScheduleSheet] = useState<'NONE' | 'DAY' | 'ADD_MENU' | 'CHOOSER' | 'FORM'>('NONE')
  const [scheduleRepeat, setScheduleRepeat] = useState(false)
  const [scheduleRepeatMode, setScheduleRepeatMode] = useState<'WEEKLY' | 'INTERVAL' | 'MONTHLY' | 'DATES'>('WEEKLY')
  const [scheduleRepeatDays, setScheduleRepeatDays] = useState<number[]>([])
  const [scheduleRepeatUntil, setScheduleRepeatUntil] = useState('')
  const [scheduleRepeatInterval, setScheduleRepeatInterval] = useState(2)
  const [scheduleRepeatMonthDay, setScheduleRepeatMonthDay] = useState(new Date().getDate())
  const [scheduleRepeatDates, setScheduleRepeatDates] = useState<string[]>([])
  const [scheduleRepeatDateInput, setScheduleRepeatDateInput] = useState('')
  const [editingSchedule, setEditingSchedule] = useState<EditingSchedule | null>(null)
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
  const [onboardStep, setOnboardStep] = useState<OnboardingStep>('ROOM')
  const [scheduleOnboardStep, setScheduleOnboardStep] = useState<ScheduleOnboardingStep>(() => scheduleCalendarReturn ? 'CALENDAR' : 'OWNER')
  const [scheduleOnboardBusy, setScheduleOnboardBusy] = useState(false)
  const [thinqSelector, setThinqSelector] = useState(false)
  const [familySessionReady, setFamilySessionReady] = useState(hasFamilyToken())
  const [onboardFamilyName, setOnboardFamilyName] = useState('')
  const [onboardName, setOnboardName] = useState('')
  const [onboardBusy, setOnboardBusy] = useState(false)
  const [onboardInviteCode, setOnboardInviteCode] = useState(invitationFromUrl)
  const [onboardRole, setOnboardRole] = useState(invitedRole)
  const [onboardRoleChoice, setOnboardRoleChoice] = useState('PARENT')
  const [inviteRole, setInviteRole] = useState('GRANDPARENT')
  const [inviteStep, setInviteStep] = useState<'preview' | 'role' | 'notifications'>(() => invitationFromUrl ? 'preview' : 'role')
  const [invitePreview, setInvitePreview] = useState<{ family_name: string; owner_name: string; expires_at: string } | null>(null)
  const [inviteCode, setInviteCode] = useState('')
  const [inviteExpiresAt, setInviteExpiresAt] = useState('')
  const [devLoginOptions, setDevLoginOptions] = useState<DevLoginOption[]>([])
  const [childNameInput, setChildNameInput] = useState('')
  const [childAgeInput, setChildAgeInput] = useState('')
  const [onboardChildren, setOnboardChildren] = useState<OnboardChild[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatUsedToday, setChatUsedToday] = useState(0)
  const [chatTokenLimit, setChatTokenLimit] = useState(50_000)
  const [chatBusy, setChatBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [completionRecording, setCompletionRecording] = useState(false)
  const [completionVoiceBusy, setCompletionVoiceBusy] = useState(false)
  const [completionPhoto, setCompletionPhoto] = useState<File | null>(null)
  const [completionPreview, setCompletionPreview] = useState('')
  const [emergencyItem, setEmergencyItem] = useState('')
  const [emergencyReason, setEmergencyReason] = useState('긴급 돌봄 도움이 필요합니다')
  const [emergencyRecording, setEmergencyRecording] = useState(false)
  const [emergencyVoiceBusy, setEmergencyVoiceBusy] = useState(false)
  const [emergencyRequests, setEmergencyRequests] = useState<EmergencyRequest[]>([])
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null)
  const [planBusy, setPlanBusy] = useState(false)
  const [billingBusy, setBillingBusy] = useState(false)
  const [billingOpen, setBillingOpen] = useState(false)
  const [billingOrder, setBillingOrder] = useState<BillingOrder | null>(null)
  const [billingWidgetReady, setBillingWidgetReady] = useState(false)
  const [features, setFeatures] = useState<{ id: string; available: boolean; backend_state: string }[]>([])
  const [albumPhotos, setAlbumPhotos] = useState<AlbumPhoto[]>([])
  const [albumBusy, setAlbumBusy] = useState(false)
  const [albumFolder, setAlbumFolder] = useState('')
  const [albumDeleteBusy, setAlbumDeleteBusy] = useState(false)
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
  const emergencyRecorderRef = useRef<MediaRecorder | null>(null)
  const emergencyCancelRecordingRef = useRef(false)
  const completionCameraInputRef = useRef<HTMLInputElement>(null)
  const completionPhotoInputRef = useRef<HTMLInputElement>(null)
  const initialScreenRef = useRef(screen)
  const seenNoticeIdsRef = useRef<Set<string>>(new Set())
  const benefitsLoadedRef = useRef(false)
  const billingHandledRef = useRef(false)
  const tossWidgetsRef = useRef<TossWidgets | null>(null)

  const reportError = (failure: unknown) => {
    if (failure instanceof ApiError && failure.status === 401) {
      const hadToken = hasFamilyToken()
      setFamilyToken(null); setFamilySessionReady(false); setBoot(null); setMe(null); setOnboardStep('ROOM'); setScreen('thinq')
      history.replaceState({ ...history.state, lgdxScreen: 'thinq' }, '')
      setError(hadToken ? '가족방 세션이 만료됐어요. 다시 참가해주세요.' : '가족방을 만들거나 초대코드로 참가해주세요.')
    } else if (failure instanceof ApiError) {
      const guide: Record<string, string> = {
        OCR_DAILY_LIMIT: '오늘의 무료 사진 OCR을 모두 사용했어요. 사진 선택을 취소하고 직접 입력해주세요.',
        CHAT_DAILY_LIMIT: '오늘의 AI 채팅 한도를 모두 사용했어요. 내일 다시 이용해주세요.',
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
    if (!billingResultFromUrl || billingHandledRef.current || !hasFamilyToken()) return
    billingHandledRef.current = true
    const query = new URLSearchParams(location.search)
    const cleanPaymentQuery = () => {
      for (const key of ['payment', 'billing', 'paymentKey', 'orderId', 'amount', 'authKey', 'customerKey', 'code', 'message']) query.delete(key)
      history.replaceState({ ...history.state, lgdxScreen: 'plan' }, '', location.pathname + (query.size ? '?' + query : ''))
    }
    if (billingResultFromUrl === 'success') {
      const paymentKey = query.get('paymentKey'); const orderId = query.get('orderId'); const amount = Number(query.get('amount'))
      const authKey = query.get('authKey'); const customerKey = query.get('customerKey')
      const isWidgetPayment = !!paymentKey && !!orderId && Number.isInteger(amount) && amount > 0
      if (!isWidgetPayment && (!authKey || !customerKey)) { void Promise.resolve().then(() => setError('결제 인증 결과가 올바르지 않아요. 다시 시도해주세요.')); cleanPaymentQuery(); return }
      void Promise.resolve().then(() => setBillingBusy(true))
      const activation = isWidgetPayment
        ? send<{ plan: string; status: string; current_period_end: string }>('/billing/confirm', 'POST', { payment_key: paymentKey, order_id: orderId, amount })
        : send<{ plan: string; status: string; next_billing_at: string }>('/billing/activate', 'POST', { auth_key: authKey, customer_key: customerKey })
      activation
        .then(async result => {
          cleanPaymentQuery(); await load()
          const endAt = 'current_period_end' in result ? result.current_period_end : result.next_billing_at
          setToast(`Family Care Pro 이용이 시작됐어요. 이용 종료일: ${formatDate(endAt)}`)
        })
        .catch(error => { cleanPaymentQuery(); reportError(error) })
        .finally(() => setBillingBusy(false))
    } else {
      void Promise.resolve().then(() => setError(query.get('message') || '결제가 취소되었어요.'))
      cleanPaymentQuery()
    }
  }, [billingResultFromUrl])
  useEffect(() => {
    if (!billingOpen || screen !== 'plan' || subscription?.status === 'ACTIVE') return
    let cancelled = false
    let paymentMethods: TossRenderedWidget | undefined
    let agreement: TossRenderedWidget | undefined
    send<BillingOrder>('/billing/orders', 'POST')
      .then(async order => {
        if (cancelled) return
        setBillingOrder(order)
        const tossFactory = (window as unknown as { TossPayments?: TossFactory }).TossPayments
        if (!tossFactory) throw new Error('토스페이먼츠 결제창을 불러오지 못했어요. 네트워크 연결을 확인해주세요.')
        const widgets = tossFactory(order.client_key).widgets({ customerKey: order.customer_key })
        tossWidgetsRef.current = widgets
        await widgets.setAmount({ currency: 'KRW', value: order.amount })
        if (cancelled) return
        ;[paymentMethods, agreement] = await Promise.all([
          widgets.renderPaymentMethods({ selector: '#toss-payment-methods', variantKey: 'DEFAULT' }),
          widgets.renderAgreement({ selector: '#toss-agreement', variantKey: 'AGREEMENT' }),
        ])
        if (!cancelled) setBillingWidgetReady(true)
      })
      .catch(failure => { if (!cancelled) reportError(failure) })
      .finally(() => { if (!cancelled) setBillingBusy(false) })
    return () => {
      cancelled = true
      paymentMethods?.destroy(); agreement?.destroy()
      tossWidgetsRef.current = null
    }
  }, [billingOpen, screen, subscription?.status])
  useEffect(() => {
    history.replaceState({ ...history.state, lgdxScreen: initialScreenRef.current }, '')
    const handleBack = (event: PopStateEvent) => {
      setScheduleSheet('NONE'); setShowSheet(false); setSelectedAlbumPhoto(null)
      const target = event.state?.lgdxScreen as Screen | undefined
      if (target) {
        setError(''); setScreen(target)
        return
      }
      const fallback: Screen = hasFamilyToken() ? 'home' : 'thinq'
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
      api<{ usage: { chat_tokens_today: number; chat_tokens_limit: number } }>('/features'),
    ]).then(([history, available]) => {
      setChatMessages(history.messages.map(m => ({ from: m.role === 'user' ? 'me' : 'agent', text: m.content })))
      setChatUsedToday(available.usage.chat_tokens_today)
      setChatTokenLimit(available.usage.chat_tokens_limit)
    }).catch(reportError)
    if ((screen === 'plan' || screen === 'more') && activeFamilyId) Promise.all([
      api<SubscriptionState>('/subscription'),
      api<{ features: { id: string; available: boolean; backend_state: string }[] }>('/features'),
    ]).then(([current, available]) => { setSubscription(current); setFeatures(available.features) }).catch(reportError)
    if (screen === 'emergency' && activeFamilyId) api<{ requests: EmergencyRequest[] }>('/emergency-requests')
      .then(result => setEmergencyRequests(result.requests)).catch(reportError)
    if ((screen === 'calendar' || screen === 'scheduleOnboarding') && activeFamilyId) api<{ connections: CalendarConnection[] }>('/calendar-connections')
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
  useEffect(() => {
    if (screen !== 'serviceLoading') return
    const timer = setTimeout(() => {
      history.replaceState({ ...history.state, lgdxScreen: 'home' }, '')
      setScreen('home')
      void load().catch(reportError)
    }, 1120)
    return () => clearTimeout(timer)
  }, [screen])
  useEffect(() => { if (screen !== 'chat' && recorderRef.current?.state === 'recording') { cancelRecordingRef.current = true; recorderRef.current.stop() } }, [screen])
  useEffect(() => { if (!showSheet && completionRecorderRef.current?.state === 'recording') { completionCancelRecordingRef.current = true; completionRecorderRef.current.stop() } }, [showSheet])
  useEffect(() => { if (screen !== 'emergency' && emergencyRecorderRef.current?.state === 'recording') { emergencyCancelRecordingRef.current = true; emergencyRecorderRef.current.stop() } }, [screen])
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
  const openFamilyService = () => {
    if (familySessionReady) {
      setThinqSelector(false)
      go('serviceLoading')
      return
    }
    setThinqSelector(true)
  }
  const openThinQHomes = () => {
    setThinqSelector(true)
  }
  const startFamilyOnboarding = () => {
    setThinqSelector(false)
    setOnboardMode('create')
    setOnboardStep('ROOM')
    setOnboardRole('PARENT')
    setOnboardRoleChoice('PARENT')
    setOnboardChildren([])
    setChildNameInput('')
    setChildAgeInput('')
    go('onboarding')
  }
  const startScheduleOnboarding = (owner: 'PERSONAL' | 'CHILD' | null = null) => {
    setScheduleOnboardStep(owner === 'CHILD' ? 'ROUTINE' : owner ? 'CALENDAR' : 'OWNER')
    if (owner) { setScheduleForm(owner); sessionStorage.setItem('family-care-schedule-owner', owner) }
    setScheduleTitle('')
    setScheduleEntryMode('REPEAT')
    setScheduleRepeat(true)
    setScheduleRepeatMode('WEEKLY')
    const selected = new Date(scheduleDate + 'T12:00:00')
    setScheduleRepeatDays([(selected.getDay() + 6) % 7])
    const until = new Date(selected.getFullYear(), selected.getMonth() + 6, selected.getDate())
    setScheduleRepeatUntil(until.toLocaleDateString('sv-SE'))
    go('scheduleOnboarding')
  }
  const openScheduleRegistration = () => {
    setEditingSchedule(null)
    setScheduleSheet('ADD_MENU')
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
    } else if (notice.action_type === 'EMERGENCY_REQUEST') {
      go('emergency')
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
  const finishInviteJoin = async (allowNotifications: boolean) => {
    if (allowNotifications && 'Notification' in window) {
      try { await Notification.requestPermission() } catch { /* Joining must still continue when device permission fails. */ }
    }
    await enterFamily()
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
      setFamilySessionReady(true)
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
      const targetScreen: Screen = onboardMode === 'create' ? 'onboarding' : 'home'
      history.replaceState({ ...history.state, lgdxScreen: targetScreen }, '')
      setScreen(targetScreen)
      if (onboardMode === 'create') {
        setOnboardRole('PARENT')
        setOnboardRoleChoice('PARENT')
        setOnboardStep('ROLE')
        setToast('가족방을 만들었어요. 가족 설정을 이어서 완료해주세요.')
      } else setToast('가족방에 참여했어요.')
    } catch (e) { reportError(e) }
    finally { setOnboardBusy(false) }
  }
  const addOnboardChild = () => {
    if (!childNameInput.trim() || !childAgeInput.trim()) { setError('아이 이름과 나이·학교를 입력해주세요.'); return }
    setError('')
    setOnboardChildren(current => [...current, { name: childNameInput.trim(), ageLabel: childAgeInput.trim() }])
    setChildNameInput(''); setChildAgeInput('')
  }
  const saveOnboardChildren = async (next: 'INVITE' | 'SCHEDULE' = 'INVITE') => {
    if (onboardBusy) return
    const pending = [...onboardChildren]
    if (childNameInput.trim() || childAgeInput.trim()) {
      if (!childNameInput.trim() || !childAgeInput.trim()) { setError('작성 중인 아이의 이름과 나이·학교를 모두 입력해주세요.'); return }
      pending.push({ name: childNameInput.trim(), ageLabel: childAgeInput.trim() })
    }
    setOnboardBusy(true); setError('')
    try {
      for (const childDraft of pending) await send('/children', 'POST', { name: childDraft.name, age_label: childDraft.ageLabel })
      setOnboardChildren([]); setChildNameInput(''); setChildAgeInput('')
      await load()
      if (next === 'SCHEDULE') startScheduleOnboarding('CHILD')
      else setOnboardStep('INVITE_SETUP')
      if (pending.length) setToast(`${pending.length}명의 아이 정보를 등록했어요.`)
    } catch (failure) { reportError(failure) }
    finally { setOnboardBusy(false) }
  }
  const resetFamilySession = (targetScreen: Screen = 'thinq') => {
    setFamilyToken(null); setFamilySessionReady(false); setBoot(null); setMe(null); setChatMessages([]); setInviteCode(''); setSubscription(null); setFeatures([])
    setOnboardStep('ROOM'); setOnboardMode('create'); setOnboardFamilyName(''); setOnboardName(''); setOnboardInviteCode(''); setThinqSelector(false)
    history.replaceState({ ...history.state, lgdxScreen: targetScreen }, '')
    setScreen(targetScreen)
  }
  const logout = () => { resetFamilySession('onboarding'); setToast('로그아웃했어요') }
  const loginForTest = async (memberId: string) => {
    if (onboardBusy) return
    setOnboardBusy(true)
    try {
      const result = await send<FamilySession>('/families/dev-login', 'POST', { member_id: memberId })
      setFamilyToken(result.access_token)
      setFamilySessionReady(true)
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
  const copyInvite = async () => {
    if (!inviteLink) return
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(inviteLink)
    else {
      const field = document.createElement('textarea')
      field.value = inviteLink; field.style.position = 'fixed'; field.style.opacity = '0'
      document.body.appendChild(field); field.select(); document.execCommand('copy'); field.remove()
    }
    setToast('초대 링크를 복사했어요.')
  }
  const shareInvite = async (target: 'kakao' | 'sms' | 'system' = 'kakao') => {
    if (!inviteLink) return
    const text = `${boot?.family.name ?? 'Family Care'} 가족방 초대 링크예요. 링크를 열고 이름을 입력해 참여해주세요.`
    try {
      if (target === 'sms') {
        location.href = `sms:?&body=${encodeURIComponent(`${text}\n${inviteLink}`)}`
        return
      }
      if (target === 'kakao' && kakaoJavaScriptKey && window.Kakao) {
        if (!window.Kakao.isInitialized()) window.Kakao.init(kakaoJavaScriptKey)
        await window.Kakao.Share.sendDefault({
          objectType: 'text',
          text,
          link: { mobileWebUrl: inviteLink, webUrl: inviteLink },
          buttonTitle: '가족방 참여하기',
        })
        setToast('카카오톡 공유창을 열었어요.')
        return
      }
      if (navigator.share) {
        await navigator.share({ title: boot?.family.name ?? 'Family Care 가족방', text, url: inviteLink })
        setToast(target === 'kakao' ? '공유창에서 카카오톡을 선택해주세요.' : '공유창을 열었어요.')
      } else {
        await copyInvite()
      }
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError') return
      setError('공유창을 열지 못했어요. 잠시 후 다시 시도해주세요.')
    }
  }
  const members = boot?.members.filter(member => member.status === 'ACTIVE') ?? []
  const profileForMember = (targetMemberId: string) => {
    const index = (boot?.members.filter(item => item.status !== 'REMOVED').findIndex(item => item.id === targetMemberId) ?? 0)
    return memberProfileAssets[Math.max(0, index) % memberProfileAssets.length]
  }
  const memberIsOnline = (targetMemberId: string) => targetMemberId === me?.member.id || !!boot?.members.find(item => item.id === targetMemberId)?.is_online
  const member = (id: string) => boot?.members.find(m => m.id === id)?.name ?? '가족'
  const child = (id: string | null) => boot?.children.find(c => c.id === id)?.name ?? '가족'
  const items = boot?.items.filter(i => filter === 'all' || i.child_id === filter) ?? []
  const pending = items.filter(i => i.status === 'NEEDS_REVIEW')
  const allPending = boot?.items.filter(i => i.status === 'NEEDS_REVIEW') ?? []
  const assignments = boot?.assignments.filter(a => !['CANCELED', 'REJECTED'].includes(a.status)) ?? []
  const viewerAssignments = assignments.filter(a => a.assignee_id === viewer)
  const itemFor = (a: Assignment) => boot?.items.find(i => i.id === a.item_id)
  const activeAssignmentForItem = (careItemId: string) => assignments.find(a => a.item_id === careItemId && ['ACCEPTED', 'CANDIDATE_ACCEPTED', 'PROPOSED'].includes(a.status))
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
  const calendarOptions: CalendarConnection[] = (calendarConnections.length ? calendarConnections : [
    { provider: 'microsoft', configured: true, connected: false, connected_at: null, synced_at: null },
    { provider: 'google', configured: true, connected: false, connected_at: null, synced_at: null },
  ] as CalendarConnection[]).toSorted((left, right) => left.provider === right.provider ? 0 : left.provider === 'microsoft' ? -1 : 1)
  const calendarsReady = calendarConnections.length === 2 && calendarConnections.every(connection => connection.configured)
  const todayKey = dateKey(new Date())
  const todayCare = boot?.items.filter(i => !i.child_schedule_id && i.starts_at && dateKey(i.starts_at) === todayKey && i.item_type !== 'SUPPLY') ?? []
  const todayPersonal = boot?.schedules.filter(s => dateKey(s.starts_at) === todayKey) ?? []
  const todayChildSchedules = boot?.child_schedules.filter(s => dateKey(s.starts_at) === todayKey) ?? []
  const activeSupplies = boot?.items.filter(i => i.item_type === 'SUPPLY' && i.status !== 'DONE') ?? []
  const pendingHandoffs = boot?.handoffs.filter(h => h.to_member_id === viewer && h.status === 'PENDING') ?? []
  const movingAssignment = assignments.find(a => a.status === 'ACCEPTED')
  const movingItem = movingAssignment ? itemFor(movingAssignment) : undefined
  const homeEvents = [
    ...todayCare.map(item => { const assignment = activeAssignmentForItem(item.id); return { id: `care-${item.id}`, time: item.starts_at!, title: item.title, meta: child(item.child_id), active: assignment?.status === 'ACCEPTED', done: item.status === 'DONE' } }),
    ...todayChildSchedules.map(item => ({ id: `child-${item.id}`, time: item.starts_at, title: item.title, meta: child(item.child_id), active: false, done: false })),
    ...todayPersonal.map(item => ({ id: `personal-${item.id}`, time: item.starts_at, title: item.title, meta: member(item.member_id), active: false, done: false })),
  ].sort((left, right) => left.time.localeCompare(right.time))
  const visibleNotices = boot?.notifications.filter(notice => noticeScope === 'family' || !me?.member.id || !notice.member_id || notice.member_id === me.member.id) ?? []
  const yesterdayKey = dateKey(new Date(new Date().setDate(new Date().getDate() - 1)))
  const noticeGroups = Object.entries(visibleNotices.reduce<Record<string, Notice[]>>((groups, notice) => {
    const key = dateKey(notice.created_at)
    ;(groups[key] ??= []).push(notice)
    return groups
  }, {})).sort(([left], [right]) => right.localeCompare(left))
  const childPalette = ['#c4123f', '#7c5cff', '#ef8f32', '#e6538f', '#8a63d2']
  const myScheduleColor = '#2f80ed'
  const otherCaregiverColor = '#20a474'
  const childColor = (childId: string | null) => childPalette[Math.max(0, boot?.children.findIndex(c => c.id === childId) ?? 0) % childPalette.length]
  const caregiverColor = (memberId: string) => memberId === me?.member.id ? myScheduleColor : otherCaregiverColor
  const personalScheduleVisible = (memberId: string) => scheduleScope === 'all' || (scheduleScope === 'me' && memberId === me?.member.id)
  const calendarCellCount = Math.ceil((calendarMonth.getDay() + new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate()) / 7) * 7
  const calendarDays = Array.from({ length: calendarCellCount }, (_, index) => {
    const start = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1 - calendarMonth.getDay())
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
  })
  const filteredChildSchedules = boot?.child_schedules.filter(s => scheduleScope === 'all' || s.child_id === scheduleScope) ?? []
  const filteredCareSchedules = boot?.items.filter(i => !i.child_schedule_id && i.starts_at && ['SCHEDULE', 'CHANGE', 'TODO'].includes(i.item_type) && (scheduleScope === 'all' || i.child_id === scheduleScope)) ?? []
  const calendarEventsFor = (key: string) => [
    ...(boot?.schedules ?? []).filter(s => dateKey(s.starts_at) === key && personalScheduleVisible(s.member_id)).map(s => ({ id: 'personal-' + s.id, title: s.title, color: caregiverColor(s.member_id), startsAt: s.starts_at, endsAt: s.ends_at, meta: `${member(s.member_id)} · ${s.kind === 'WORK' ? '업무 일정' : '개인 루틴'}` })),
    ...filteredChildSchedules.filter(s => dateKey(s.starts_at) === key).map(s => ({ id: 'child-' + s.id, title: s.title, color: childColor(s.child_id), startsAt: s.starts_at, endsAt: s.ends_at, meta: `${child(s.child_id)} · ${childScheduleLabel[s.category] ?? '아이 일정'}` })),
    ...filteredCareSchedules.filter(i => dateKey(i.starts_at!) === key).map(i => ({ id: 'care-' + i.id, title: i.title, color: childColor(i.child_id), startsAt: i.starts_at!, endsAt: i.starts_at!, meta: `${child(i.child_id)} · 알림장` })),
  ]
  const scheduleStartMinutes = normalizeClock(scheduleStartTime).split(':').reduce((total, value, index) => total + Number(value) * (index ? 1 : 60), 0)
  const scheduleEndMinutes = scheduleEndTime.trim() ? normalizeClock(scheduleEndTime).split(':').reduce((total, value, index) => total + Number(value) * (index ? 1 : 60), 0) : scheduleStartMinutes + 1
  const schedulePreviewCollision = calendarEventsFor(scheduleDate).find(event => {
    const start = new Date(event.startsAt); const end = new Date(event.endsAt)
    const eventStart = start.getHours() * 60 + start.getMinutes(); const eventEnd = Math.max(eventStart + 1, end.getHours() * 60 + end.getMinutes())
    return scheduleStartMinutes < eventEnd && scheduleEndMinutes > eventStart
  })
  const rootScreens: Screen[] = ['schedule', 'careHub', 'home', 'familyHub', 'more']
  const chatRemaining = Math.max(0, chatTokenLimit - chatUsedToday)
  const chatRemainingPercent = chatTokenLimit ? Math.max(0, Math.min(100, chatRemaining / chatTokenLimit * 100)) : 0
  const sendChat = async (question = chatDraft) => {
    const text = question.trim()
    if (!text || chatBusy) return
    setChatBusy(true); setError('')
    try {
      const result = await send<ChatAnswer>('/assistant/chat', 'POST', { message: text })
      setChatMessages(previous => [...previous, { from: 'me', text: result.message }, { from: 'agent', text: result.answer, cards: result.cards }])
      setChatUsedToday(result.usage.used_today); setChatTokenLimit(result.usage.limit); setChatDraft('')
      if (result.schedule_changes.length || result.schedule_creations?.length) await load()
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
      setChatMessages(previous => [...previous, { from: 'me', text: result.transcript }, { from: 'agent', text: result.answer, cards: result.cards }])
      setChatUsedToday(result.usage.used_today); setChatTokenLimit(result.usage.limit)
      if (result.schedule_changes.length || result.schedule_creations?.length) await load()
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
  const transcribeEmergencyReason = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) { setError('음성은 20MB 이하만 보낼 수 있어요'); return }
    setEmergencyVoiceBusy(true); setError('')
    try {
      const form = new FormData(); form.append('file', file); form.append('purpose', 'EMERGENCY')
      const result = await upload<{ text: string }>('/audio/transcribe', form)
      setEmergencyReason(result.text.trim())
      setToast('음성을 긴급 요청 사유로 옮겼어요')
    } catch (e) { reportError(e) }
    finally { setEmergencyVoiceBusy(false) }
  }
  const toggleEmergencyRecording = async () => {
    if (emergencyRecording) { emergencyRecorderRef.current?.stop(); return }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('음성 녹음은 HTTPS 주소 또는 이 PC의 localhost에서 사용할 수 있어요.'); return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      const chunks: BlobPart[] = []
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = () => {
        setEmergencyRecording(false); stream.getTracks().forEach(track => track.stop())
        const type = recorder.mimeType.split(';')[0] || 'audio/webm'
        if (chunks.length && !emergencyCancelRecordingRef.current) void transcribeEmergencyReason(
          new File(chunks, `emergency.${type.includes('mp4') ? 'm4a' : 'webm'}`, { type }),
        )
      }
      emergencyCancelRecordingRef.current = false; emergencyRecorderRef.current = recorder
      recorder.start(); setEmergencyRecording(true)
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
        return upload<{ items: CareItem[]; transcript: string; ocr_used_today: number; registered_child_schedules?: unknown[] }>('/intakes/photo', form)
      })() : await send<{ items: CareItem[]; transcript?: string }>('/intakes', 'POST', {
        child_id: captureChild, raw_content: captureText.trim(), input_type: 'TEXT',
      })
      const registered = result.items.find(item => item.status === 'CONFIRMED' && item.child_schedule_id)
      if (registered) {
        const ranked = await api<{ suggestions: Suggestion[] }>('/items/' + registered.id + '/suggestions')
        setItemId(registered.id); setSuggestions(ranked.suggestions)
      } else if (result.items[0]) selectReview(result.items[0])
      else setItemId(null)
      setCaptureFromPhoto(!!captureFile)
      setCaptureTranscript(result.transcript ?? captureText.trim())
      setCaptureText(''); setCaptureFile(null); setCapturePreview(''); go(registered ? 'suggestion' : result.items[0] || captureFile ? 'review' : 'family')
    }, '확인할 항목을 정리했어요')
    setCaptureBusy(false)
  }
  const saveReview = () => run(async () => {
    if (!activeItem) return
    await send('/items/' + activeItem.id, 'PATCH', { title: reviewTitle, item_type: reviewType, ...(reviewStart ? { starts_at: new Date(reviewStart).toISOString() } : {}) })
    await send('/items/' + activeItem.id + '/confirm', 'POST')
    go('family')
  }, '돌봄 정보를 저장했어요')
  const openNewScheduleForm = (type: 'PERSONAL' | 'CHILD', mode: 'SINGLE' | 'REPEAT' = 'SINGLE') => {
    const start = new Date(scheduleDate + 'T12:00:00')
    const until = new Date(start.getFullYear(), start.getMonth() + 3, start.getDate())
    setEditingSchedule(null); setScheduleForm(type); setScheduleEntryMode(mode); setScheduleTitle(''); setScheduleEndTime(''); setScheduleRepeat(mode === 'REPEAT')
    setScheduleRepeatMode('WEEKLY'); setScheduleRepeatDays([(start.getDay() + 6) % 7]); setScheduleRepeatUntil(until.toLocaleDateString('sv-SE'))
    setScheduleRepeatInterval(2); setScheduleRepeatMonthDay(start.getDate()); setScheduleRepeatDates([]); setScheduleRepeatDateInput(scheduleDate); setScheduleSheet('FORM')
  }
  const openPersonalScheduleEdit = (schedule: Bootstrap['schedules'][number]) => {
    setEditingSchedule({ type: 'PERSONAL', id: schedule.id }); setScheduleForm('PERSONAL')
    setScheduleTitle(schedule.title); setScheduleMember(schedule.member_id); setScheduleKind(schedule.kind)
    setScheduleDate(dateKey(schedule.starts_at)); setScheduleStartTime(localClock(schedule.starts_at)); setScheduleEndTime(schedule.has_end_time === false || schedule.has_end_time === 0 ? '' : localClock(schedule.ends_at))
    setScheduleRepeat(false); setScheduleSheet('FORM')
  }
  const openChildScheduleEdit = (schedule: Bootstrap['child_schedules'][number]) => {
    setEditingSchedule({ type: 'CHILD', id: schedule.id }); setScheduleForm('CHILD')
    setScheduleTitle(schedule.title); setChildScheduleChild(schedule.child_id); setChildScheduleCategory(schedule.category)
    setScheduleDate(dateKey(schedule.starts_at)); setScheduleStartTime(localClock(schedule.starts_at)); setScheduleEndTime(schedule.has_end_time === false || schedule.has_end_time === 0 ? '' : localClock(schedule.ends_at))
    setScheduleRepeat(false); setScheduleSheet('FORM')
  }
  const calculatedRepeatDates = () => {
    if (!scheduleRepeat || scheduleRepeatMode === 'WEEKLY') return []
    if (scheduleRepeatMode === 'DATES') return [...new Set(scheduleRepeatDates)].sort()
    if (!scheduleDate || !scheduleRepeatUntil) return []
    const start = new Date(scheduleDate + 'T12:00:00')
    const until = new Date(scheduleRepeatUntil + 'T12:00:00')
    const dates: string[] = []
    if (scheduleRepeatMode === 'INTERVAL') {
      for (let current = start; current <= until; current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + scheduleRepeatInterval, 12)) dates.push(dateKey(current))
    } else {
      for (let month = new Date(start.getFullYear(), start.getMonth(), 1, 12); month <= until; month = new Date(month.getFullYear(), month.getMonth() + 1, 1, 12)) {
        const current = new Date(month.getFullYear(), month.getMonth(), scheduleRepeatMonthDay, 12)
        if (current.getMonth() === month.getMonth() && current >= start && current <= until) dates.push(dateKey(current))
      }
    }
    return dates
  }
  const saveSchedule = () => run(async () => {
    const startClock = normalizeClock(scheduleStartTime)
    const endClock = scheduleEndTime.trim() ? normalizeClock(scheduleEndTime) : ''
    if (!scheduleTitle || !scheduleDate || !startClock || (scheduleEndTime.trim() && !endClock)) throw new Error('날짜와 시작 시간을 09:30 형식으로 입력해주세요')
    const scheduleStart = new Date(`${scheduleDate}T${startClock}`)
    const scheduleEnd = endClock ? new Date(`${scheduleDate}T${endClock}`) : null
    if (scheduleEnd && scheduleEnd <= scheduleStart) throw new Error('종료 시간은 시작 시간보다 늦어야 해요')
    const repeatDates = calculatedRepeatDates()
    if (scheduleRepeat && scheduleRepeatMode === 'WEEKLY' && (!scheduleRepeatDays.length || !scheduleRepeatUntil)) throw new Error('반복 요일과 종료일을 선택해주세요')
    if (scheduleRepeat && ['INTERVAL', 'MONTHLY'].includes(scheduleRepeatMode) && !scheduleRepeatUntil) throw new Error('반복 종료일을 선택해주세요')
    if (scheduleRepeat && scheduleRepeatMode !== 'WEEKLY' && !repeatDates.length) throw new Error('선택한 기간에 등록할 반복 날짜가 없어요')
    const recurrence = {
      repeat_days: scheduleRepeat && scheduleRepeatMode === 'WEEKLY' ? scheduleRepeatDays : [],
      repeat_until: scheduleRepeat && scheduleRepeatMode === 'WEEKLY' ? scheduleRepeatUntil : null,
      repeat_dates: repeatDates,
    }
    if (editingSchedule) {
      if (editingSchedule.type === 'CHILD') {
        if (!childScheduleChild) throw new Error('아이 이름을 선택해주세요')
        const updated = await send<{ care_item_id: string | null; suggestions: Suggestion[] }>('/child-schedules/' + editingSchedule.id, 'PATCH', {
          child_id: childScheduleChild, title: scheduleTitle, category: childScheduleCategory,
          starts_at: scheduleStart.toISOString(), ends_at: scheduleEnd?.toISOString() ?? null,
        })
        setEditingSchedule(null); setScheduleTitle(''); setScheduleSheet('NONE')
        if (updated.care_item_id) { setItemId(updated.care_item_id); setSuggestions(updated.suggestions); go('suggestion') }
        else { setSelectedDate(scheduleDate); setScheduleSheet('DAY') }
        return
      } else {
        const updated = await send<{ collisions: { item_id: string }[] }>('/schedules/' + editingSchedule.id, 'PATCH', {
          title: scheduleTitle, starts_at: scheduleStart.toISOString(), ends_at: scheduleEnd?.toISOString() ?? null, kind: scheduleKind,
        })
        if (updated.collisions[0]) {
          const ranked = await api<{ item: CareItem; suggestions: Suggestion[] }>('/items/' + updated.collisions[0].item_id + '/suggestions')
          setItemId(ranked.item.id); setSuggestions(ranked.suggestions); setEditingSchedule(null); setScheduleSheet('NONE'); go('suggestion')
          return
        }
      }
      setEditingSchedule(null); setScheduleTitle(''); setSelectedDate(scheduleDate); setScheduleSheet('DAY')
      return
    }
    if (scheduleForm === 'CHILD') {
      if (!childScheduleChild) throw new Error('아이 이름을 선택해주세요')
      const created = await send<{ care_item_id: string; suggestions: Suggestion[] }>('/child-schedules', 'POST', { child_id: childScheduleChild, title: scheduleTitle,
        category: childScheduleCategory, starts_at: scheduleStart.toISOString(),
        ends_at: scheduleEnd?.toISOString() ?? null, source: 'MANUAL', ...recurrence })
      setItemId(created.care_item_id); setSuggestions(created.suggestions)
      setScheduleTitle(''); setScheduleRepeat(false); setScheduleSheet('NONE')
      go('suggestion')
      return
    }
    const result = await send<{ collisions: { item_id: string }[] }>('/schedules', 'POST', { member_id: me?.authenticated ? me.member.id : scheduleMember, title: scheduleTitle, starts_at: scheduleStart.toISOString(), ends_at: scheduleEnd?.toISOString() ?? null, kind: scheduleKind, ...recurrence })
    setScheduleTitle(''); setScheduleRepeat(false); setScheduleSheet('NONE')
    if (result.collisions[0]) {
      const ranked = await api<{ item: CareItem; suggestions: Suggestion[] }>('/items/' + result.collisions[0].item_id + '/suggestions')
      setItemId(ranked.item.id); setSuggestions(ranked.suggestions); go('suggestion')
    }
  }, editingSchedule ? '일정을 수정했어요' : scheduleRepeat ? '반복 루틴 일정을 한 번에 등록했어요' : scheduleForm === 'CHILD' ? '아이 일정을 등록했어요' : '개인 일정을 등록했어요')
  const deleteSchedule = () => {
    if (!editingSchedule || !confirm('이 일정 한 건을 삭제할까요?')) return
    const target = editingSchedule
    void run(async () => {
      await send(`/${target.type === 'CHILD' ? 'child-schedules' : 'schedules'}/${target.id}`, 'DELETE')
      setEditingSchedule(null); setScheduleTitle(''); setScheduleSheet('DAY')
    }, '일정을 삭제했어요')
  }

  const pickCalendarDate = (date: Date) => {
    const key = date.toLocaleDateString('sv-SE')
    setSelectedDate(key)
    setEditingSchedule(null)
    if (date.getMonth() !== calendarMonth.getMonth() || date.getFullYear() !== calendarMonth.getFullYear()) setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1))
    setScheduleDate(key)
    setScheduleStartTime('09:00')
    setScheduleEndTime('')
    const weekday = (date.getDay() + 6) % 7
    setScheduleRepeatDays([weekday])
    const until = new Date(date.getFullYear(), date.getMonth() + 3, date.getDate())
    setScheduleRepeatUntil(until.toLocaleDateString('sv-SE'))
  }
  const connectCalendar = async (provider: 'google' | 'microsoft', fromOnboarding = false) => {
    try {
      if (fromOnboarding) sessionStorage.setItem('family-care-schedule-calendar-return', '1')
      const result = await send<{ authorization_url: string }>('/calendar-connections/' + provider + '/authorize', 'POST')
      location.assign(result.authorization_url)
    } catch (e) {
      if (fromOnboarding) sessionStorage.removeItem('family-care-schedule-calendar-return')
      reportError(e)
    }
  }
  const saveOnboardingRoutine = async () => {
    if (scheduleOnboardBusy) return
    const startClock = normalizeClock(scheduleStartTime)
    const endClock = scheduleEndTime.trim() ? normalizeClock(scheduleEndTime) : ''
    if (!scheduleTitle.trim() || !scheduleDate || !startClock || (scheduleEndTime.trim() && !endClock)) { setError('루틴 이름과 시작 시간을 입력해주세요.'); return }
    if (scheduleForm === 'CHILD' && !childScheduleChild) { setError('아이를 선택해주세요.'); return }
    if (!scheduleRepeatDays.length || !scheduleRepeatUntil) { setError('반복 요일과 종료일을 선택해주세요.'); return }
    const startsAt = new Date(`${scheduleDate}T${startClock}`)
    const endsAt = endClock ? new Date(`${scheduleDate}T${endClock}`) : null
    if (endsAt && endsAt <= startsAt) { setError('종료 시간은 시작 시간보다 늦어야 해요.'); return }
    setScheduleOnboardBusy(true); setError('')
    try {
      const recurrence = { repeat_days: scheduleRepeatDays, repeat_until: scheduleRepeatUntil, repeat_dates: [] }
      if (scheduleForm === 'CHILD') await send('/child-schedules', 'POST', {
        child_id: childScheduleChild, title: scheduleTitle.trim(), category: childScheduleCategory,
        starts_at: startsAt.toISOString(), ends_at: endsAt?.toISOString() ?? null, source: 'MANUAL', ...recurrence,
      })
      else await send('/schedules', 'POST', {
        member_id: me?.authenticated ? me.member.id : scheduleMember, title: scheduleTitle.trim(), kind: 'ROUTINE',
        starts_at: startsAt.toISOString(), ends_at: endsAt?.toISOString() ?? null, ...recurrence,
      })
      setScheduleTitle('')
      const key = `family-care-schedule-onboarding:${boot?.family.id ?? 'demo'}:${me?.member.id ?? 'viewer'}`
      localStorage.setItem(key, 'done')
      sessionStorage.removeItem('family-care-schedule-calendar-return')
      sessionStorage.removeItem('family-care-schedule-owner')
      const clean = new URL(location.href)
      for (const name of ['calendar', 'status', 'code', 'scope', 'state']) clean.searchParams.delete(name)
      history.replaceState({ ...history.state, lgdxScreen: 'schedule' }, '', clean.pathname + clean.search + clean.hash)
      await load(); setScreen('schedule'); setScheduleSheet('DAY'); setToast('반복 루틴을 등록했어요.')
    } catch (failure) { reportError(failure) }
    finally { setScheduleOnboardBusy(false) }
  }
  const finishScheduleOnboarding = async () => {
    if (scheduleOnboardBusy) return
    setScheduleOnboardBusy(true); setError('')
    try {
      const key = `family-care-schedule-onboarding:${boot?.family.id ?? 'demo'}:${me?.member.id ?? 'viewer'}`
      localStorage.setItem(key, 'done')
      sessionStorage.removeItem('family-care-schedule-calendar-return')
      sessionStorage.removeItem('family-care-schedule-owner')
      const clean = new URL(location.href)
      for (const name of ['calendar', 'status', 'code', 'scope', 'state']) clean.searchParams.delete(name)
      history.replaceState({ ...history.state, lgdxScreen: 'schedule' }, '', clean.pathname + clean.search + clean.hash)
      await load(); setScreen('schedule'); setScheduleSheet('DAY'); setToast('일정 등록 준비를 마쳤어요.')
    } catch (failure) { reportError(failure) }
    finally { setScheduleOnboardBusy(false) }
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
  const toggleBilling = async () => {
    if (billingBusy) return
    if (billingOpen) {
      setBillingOpen(false); setBillingOrder(null); setBillingWidgetReady(false)
      return
    }
    setBillingBusy(true); setError('')
    try {
      const config = await api<BillingConfig>('/billing/config')
      if (!config.configured || !config.client_key) throw new Error('토스페이먼츠 결제 키가 아직 설정되지 않았어요. backend/.env 설정을 확인해주세요.')
      const tossFactory = (window as unknown as { TossPayments?: TossFactory }).TossPayments
      if (!tossFactory) throw new Error('토스페이먼츠 결제창을 불러오지 못했어요. 네트워크 연결을 확인해주세요.')
      if (config.integration_mode === 'WIDGET') {
        setBillingOrder(null); setBillingWidgetReady(false); setBillingOpen(true)
        return
      }
      const successUrl = new URL(location.origin + location.pathname); successUrl.searchParams.set('billing', 'success')
      const failUrl = new URL(location.origin + location.pathname); failUrl.searchParams.set('billing', 'fail')
      const payment = tossFactory(config.client_key).payment({ customerKey: config.customer_key })
      await payment.requestBillingAuth({
        method: 'CARD', successUrl: successUrl.toString(), failUrl: failUrl.toString(),
        customerName: me?.member.name, windowTarget: 'self',
      })
    } catch (e) { reportError(e); setBillingBusy(false) }
  }
  const startWidgetPayment = async () => {
    if (!billingOrder || !tossWidgetsRef.current || !billingWidgetReady || billingBusy) return
    setBillingBusy(true); setError('')
    try {
      const successUrl = new URL(location.origin + location.pathname); successUrl.searchParams.set('payment', 'success')
      const failUrl = new URL(location.origin + location.pathname); failUrl.searchParams.set('payment', 'fail')
      await tossWidgetsRef.current.requestPayment({
        orderId: billingOrder.order_id,
        orderName: billingOrder.order_name,
        successUrl: successUrl.toString(),
        failUrl: failUrl.toString(),
        customerName: me?.member.name,
      })
    } catch (failure) { reportError(failure); setBillingBusy(false) }
  }
  const cancelSubscription = async () => {
    if (billingBusy || !confirm('구독을 취소할까요? 이미 결제한 기간까지는 Pro를 계속 이용할 수 있고 다음 결제부터 중단돼요.')) return
    setBillingBusy(true); setError('')
    try {
      await send('/billing/cancel', 'POST')
      setSubscription(await api<SubscriptionState>('/subscription'))
      setToast('구독 취소를 예약했어요. 현재 결제 기간까지 Pro가 유지돼요.')
    } catch (failure) { reportError(failure) }
    finally { setBillingBusy(false) }
  }
  const resumeSubscription = async () => {
    if (billingBusy) return
    setBillingBusy(true); setError('')
    try {
      await send('/billing/resume', 'POST')
      setSubscription(await api<SubscriptionState>('/subscription'))
      setToast('자동 갱신을 다시 켰어요.')
    } catch (failure) { reportError(failure) }
    finally { setBillingBusy(false) }
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
      setToast(`${files.length}장의 사진을 우리집 기록함에 저장했어요`)
    } catch (e) { reportError(e) }
    finally { setAlbumBusy(false) }
  }
  const deleteAlbumPhoto = async (photo: AlbumPhoto) => {
    if (!photo.can_delete || albumDeleteBusy || !confirm('이 사진을 우리집 기록함에서 삭제할까요?')) return
    setAlbumDeleteBusy(true); setError('')
    try {
      await send('/album/photos/' + photo.id, 'DELETE')
      const next = (await api<{ photos: AlbumPhoto[] }>('/album/photos')).photos
      setAlbumPhotos(next)
      setSelectedAlbumPhoto(null)
      history.back()
      if (albumFolder && !next.some(item => dateKey(item.created_at) === albumFolder)) setAlbumFolder('')
      setToast('사진을 삭제했어요')
    } catch (failure) { reportError(failure) }
    finally { setAlbumDeleteBusy(false) }
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
  const activeExceptions = boot?.exceptions.filter(exception => exception.status === 'PENDING') ?? []

  let page: ReactNode = <div className="loading">가족의 하루를 불러오고 있어요</div>
  if (screen === 'thinq') page = <ThinQEntry selectorOpen={thinqSelector} hasFamily={familySessionReady} familyName={boot?.family.name ?? '민솔이네 집'} onOpenSelector={() => setThinqSelector(true)} onCloseSelector={() => setThinqSelector(false)} onOpenService={openFamilyService} onStartOnboarding={startFamilyOnboarding} />
  if (screen === 'serviceLoading') page = <ServiceLoading />
  if (screen === 'lockscreen') page = <LockscreenPreview onOpen={() => familySessionReady && boot ? go('assignments') : openFamilyService()} />
  if (boot && screen === 'home') page = <div className="figma-home">
    {movingAssignment && movingItem && <button className="home-travel" onClick={() => go('location')}><span className="travel-avatar">{member(movingAssignment.assignee_id).slice(0, 1)}</span><span><strong>{member(movingAssignment.assignee_id)}와 {movingItem.title} 이동 중</strong><small>{child(movingItem.child_id)} · 동선 보기</small></span><b>›</b></button>}
    {allPending.length > 0 ? <button className="family-alert home-alert" onClick={() => openReview(allPending[0])}><span className="small-badge danger">확인 {allPending.length}</span><strong>{allPending[0].title}</strong><span>›</span></button> : activeExceptions.length > 0 ? <button className="family-alert home-alert" onClick={() => go('exception')}><span className="small-badge danger">확인 {activeExceptions.length}</span><strong>{activeExceptions[0].reason}</strong><span>›</span></button> : null}
    <Section>오늘 일정</Section>
    <Card className="home-timeline exact-timeline">
      {homeEvents.map(event => <button key={event.id} className={'home-schedule-row ' + (event.active ? 'current' : 'muted')} onClick={() => go(event.active ? 'location' : 'schedule')}><time>{formatTime(event.time)}</time><span><strong>{event.title}</strong><small>{event.active ? `진행 중 · ${event.meta}` : event.meta}</small></span>{event.done ? <b className="done"><img src={homeScheduleDoneIcon} alt="완료" /></b> : event.active ? <b>›</b> : null}</button>)}
      {!homeEvents.length && <p className="empty-line">오늘 등록된 일정이 없어요</p>}
    </Card>
    <Section>지금 해야 할 것</Section>
    <div className="home-now-list">
      {activeExceptions.slice(0, 1).map(exception => <button key={exception.id} className="attention" onClick={() => go('exception')}><i><img src={homeAttentionIcon} alt="" /></i><span><strong>지금 확인이 필요해요</strong><small>{exception.reason}</small></span><b>›</b></button>)}
      {pendingHandoffs.slice(0, 1).map(handoff => <button key={handoff.id} onClick={() => go('tasks')}><i><img src={homeHandoffIcon} alt="" /></i><span><strong>인수인계 확인</strong><small>{member(handoff.from_member_id)} → {member(handoff.to_member_id)} · {handoff.briefing}</small></span><b>›</b></button>)}
      {activeSupplies.slice(0, 3).map(item => <button key={item.id} className="attention" onClick={() => openReview(item)}><i><img src={homeSupplyIcon} alt="" /></i><span><strong>내일 준비물 확인</strong><small>{item.title} · {child(item.child_id)}{item.detail ? ` · ${item.detail}` : ''}</small></span><b>›</b></button>)}
      {!activeExceptions.length && !pendingHandoffs.length && !activeSupplies.length && <div className="home-now-empty"><i>✓</i><span><strong>지금 확인할 일이 없어요</strong><small>새 요청이나 준비물이 생기면 여기에 표시돼요.</small></span></div>}
    </div>
    <p className="figma-home-note">평소와 같은 배정은 알리지 않습니다.</p>
  </div>
  if (boot && screen === 'family') page = <><div className="eyebrow">아이별 돌봄 정보</div><h2 className="page-title">일정과 준비물을 나눠 확인해요</h2>{tabs}
    {pending.length > 0 && <Card className="inbox-summary" onClick={() => pending[0] && openReview(pending[0])}><span className="summary-dot">●</span><div><strong>확인할 돌봄 정보 {pending.length}건</strong><p>등록한 내용은 확인 후 역할 배정에 반영돼요</p></div><span className="chevron">›</span></Card>}
    <Section>확인 필요 {pending.length}</Section>{pending.length ? pending.map(i => <Card key={i.id} className="review-card"><div className="review-meta"><span className="child-pill">{child(i.child_id)}</span><span>{typeLabel[i.item_type]}</span></div><strong>{i.title}</strong><p>{i.detail || '추출된 내용을 확인해주세요'}</p><div className="card-actions"><button onClick={() => openReview(i)}>확인하기</button><button onClick={() => setToast('나중에 다시 확인할 수 있어요')}>나중에</button></div></Card>) : <Empty title="확인할 것이 없어요" text="새로운 알림장이 들어오면 이곳에 표시돼요" />}
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
    {activeItem && <Card className="detail-review-card"><div className="review-meta"><span>{child(activeItem.child_id)}</span></div><label className="form-label">항목 종류</label><select className="form-control" value={reviewType} onChange={e => setReviewType(e.target.value)}>{Object.entries(typeLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><label className="form-label">내용</label><input className="form-control" value={reviewTitle} onChange={e => setReviewTitle(e.target.value)} />{activeItem.detail && <p className="source-text">원문 근거 · {activeItem.detail}</p>}<label className="form-label">돌봄 예정 일시 (선택)</label><input className="form-control" type="datetime-local" value={reviewStart} onChange={e => setReviewStart(e.target.value)} /><p className="helper-text">일시를 입력하면 가족 일정과 겹치는지 확인할 수 있어요.</p><p className="source-text">출처 · {activeItem.intake_id ? '등록한 돌봄 정보' : '별빛유치원 알림장'}</p></Card>}
    {!activeItem && captureFromPhoto && <Empty title="일정 관련 항목이 없어요" text="읽은 글씨는 아래에서 확인할 수 있어요. 필요한 내용이 있다면 직접 입력해주세요." />}
    {captureTranscript && <details className="card source-transcript"><summary>인식한 원문 보기</summary><p>{captureTranscript}</p></details>}
    {activeItem ? <button className="primary-button wide-button" onClick={saveReview}>확인하고 저장</button> : captureFromPhoto && <button className="primary-button wide-button" onClick={() => go('capture')}>내용 직접 입력하기</button>}
  </>
  if (boot && screen === 'assignments') {
    const finalCandidates = assignments.filter(a => a.status === 'CANDIDATE_ACCEPTED')
    page = <><div className="eyebrow">ROLE MATCH</div><h2 className="hero-title">오늘의 배정</h2><p className="hero-copy">가족에게 보낸 요청과 확정된 담당자를 한곳에서 확인해요.</p>{finalCandidates.length > 0 && <><Section>최종 확인 필요</Section>{finalCandidates.map(a => <Card key={a.id} className="urgent-card"><span className="small-badge danger">수락 응답</span><strong>{itemFor(a)?.title ?? '돌봄'} · {member(a.assignee_id)}</strong><p>이 가족을 최종 담당자로 확정하면 다른 후보 요청은 자동으로 마감돼요.</p>{me?.member.is_owner && <button className="primary-button wide-button" onClick={() => run(() => send('/assignments/' + a.id + '/confirm', 'POST'), member(a.assignee_id) + '님을 최종 담당자로 확정했어요')}>최종 담당자로 확정</button>}</Card>)}</>}<Section>배정 현황</Section>{timeline(assignments)}<Section>배정이 필요한 일</Section>{items.filter(i => i.status === 'CONFIRMED' && !assignments.some(a => a.item_id === i.id && ['PROPOSED', 'CANDIDATE_ACCEPTED', 'ACCEPTED'].includes(a.status))).map(i => <Card key={i.id} className="suggest-card" onClick={() => openSuggestion(i)}><div><strong>{i.title}</strong><p>{child(i.child_id)} · {formatTime(i.starts_at) || '시간 미정'}</p></div><span className="chevron">›</span></Card>)}<Card className="info-note" onClick={() => go('schedule')}>개인 일정을 등록하면 가능한 시간을 참고해요 ›</Card></>
  }
  if (boot && screen === 'suggestion') {
    const visibleSuggestions = suggestions.filter(s => s.member_id !== me?.member.id || s.available)
    page = <><div className="eyebrow">CARE SCHEDULE AGENT · 배정 추천</div><h2 className="hero-title">{activeItem?.title || '아이 일정'}</h2><p className="hero-copy">여러 가족에게 동시에 요청할 수 있어요. 두 명 이상에게 요청하면 수락 응답 뒤 주돌봄자가 최종 담당자를 정해요.</p>{visibleSuggestions.map(s => { const isMe = s.member_id === me?.member.id; const requested = assignments.some(a => a.item_id === activeItem?.id && a.assignee_id === s.member_id && ['PROPOSED', 'CANDIDATE_ACCEPTED', 'ACCEPTED'].includes(a.status)); return <Card key={s.member_id} className={'person-card ' + (s.priority === 1 ? 'recommended' : '')}><div className="person-avatar">{s.name.slice(0, 1)}</div><div className="person-info"><strong>{isMe ? `${s.name} (나)` : s.name}</strong><p>{s.reason}</p></div><span className={'small-badge ' + (s.available ? 'ok' : 'danger')}>{s.available ? (isMe ? '내가 가능' : s.priority === 1 ? 'AI 추천 1순위' : s.priority + '순위') : '바쁨'}</span><button className={s.priority === 1 ? 'primary-button' : 'outline-button'} disabled={!s.available || !activeItem || requested} onClick={() => run(async () => { await send('/assignments', 'POST', { item_id: activeItem!.id, assignee_id: s.member_id }); if (isMe) go('assignments') }, isMe ? '내 담당으로 바로 확정했어요' : s.name + '님에게 요청했어요')}>{requested ? '요청 보냄' : isMe ? '내가 맡기' : `${s.name}에게 요청`}</button></Card>})}{!visibleSuggestions.length && <Empty title="맡을 수 있는 가족이 없어요" text="개인 일정 충돌을 확인하거나 가족 구성원을 초대해주세요" />}<button className="outline-button wide-button" onClick={() => go('assignments')}>요청 현황 보기</button><Section>판단 근거</Section><Card className="reason-card"><p>개인 캘린더 충돌, 같은 시간대 돌봄, 현재 맡은 돌봄 건수를 함께 비교합니다.</p><p>같은 시간대에 여러 아이를 함께 돌볼 수 있으면 묶음 돌봄 가능으로 표시해요.</p></Card></>
  }
  if (boot && screen === 'tasks') page = <>
    <div className="viewer-switch"><span>{me?.authenticated ? '내 담당' : '담당자 보기 (데모)'}</span><select value={viewer} disabled={!!me?.authenticated} onChange={e => setViewer(e.target.value)}>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
    <Card className="task-summary"><span className="green-check">✓</span><div><strong>오늘 맡은 일 {viewerAssignments.length}건</strong><p>요청을 열어 세부내용을 확인하고 응답할 수 있어요</p></div></Card>
    {boot.handoffs.some(h => h.to_member_id === viewer && h.status === 'PENDING') && <><Section>받은 인수인계</Section>{boot.handoffs.filter(h => h.to_member_id === viewer && h.status === 'PENDING').map(h => <Card key={h.id} className="handoff-card inline-handoff"><span className="small-badge danger">확인 필요</span><strong>{h.briefing}</strong>{h.special_note && <p>특이사항 · {h.special_note}</p>}<small>{member(h.from_member_id)}님이 전달</small><button className="outline-button wide-button" onClick={() => run(() => send('/handoffs/' + h.id + '/acknowledge', 'POST'), '인수인계를 확인했어요')}>확인했어요</button></Card>)}</>}
    <Section>오늘 할 일</Section>
    {viewerAssignments.map(a => { const i = itemFor(a); return i && <Card key={a.id} className={'task-card ' + (assignmentId === a.id ? 'selected-request' : '')}><div className="task-top"><span className="time">{formatTime(i.starts_at) || '시간 미정'}</span><span className="small-badge ok">{a.status === 'COMPLETED' ? '완료' : a.status === 'PROPOSED' ? '수락 대기' : a.status === 'CANDIDATE_ACCEPTED' ? '최종 확인 대기' : a.status === 'RECONFIRMATION_REQUIRED' ? '재배정 필요' : '담당'}</span></div><strong>{i.title} — {child(i.child_id)}</strong><p>{i.detail}</p>{a.status === 'PROPOSED' ? <div className="task-actions"><button className="primary-button" onClick={() => run(() => send('/assignments/' + a.id + '/respond', 'POST', { decision: 'ACCEPTED' }), '배정을 수락했어요')}>맡을게요</button><button className="outline-button" onClick={() => run(() => send('/assignments/' + a.id + '/respond', 'POST', { decision: 'REJECTED' }), '다른 담당자를 찾을게요')}>어려워요</button></div> : a.status === 'CANDIDATE_ACCEPTED' ? <p className="source-text">수락 응답을 보냈어요. 주돌봄자의 최종 확정을 기다리고 있어요.</p> : a.status === 'ACCEPTED' ? <button className="primary-button wide-button" onClick={() => { setAssignmentId(a.id); setNote(''); setCompletionPhoto(null); setCompletionPreview(''); setShowSheet(true) }}>완료 체크</button> : <p className="source-text">{a.note ? '특이사항 · ' + a.note : '특이사항 없음'}</p>}</Card> })}
    {viewerAssignments.length ? <><Section>이번 주 내 담당</Section><Card className="stats-card"><div><strong>{viewerAssignments.length}</strong><span>맡은 일</span></div><div><strong>{viewerAssignments.filter(a => a.status === 'COMPLETED').length}</strong><span>완료</span></div><div><strong>{viewerAssignments.filter(a => a.note).length}</strong><span>특이사항</span></div></Card></> : <Empty title="아직 맡은 일이 없어요" text="가족이 돌봄을 요청하면 이곳에서 확인할 수 있어요" />}
  </>
  if (boot && screen === 'schedule') {
    const selectedEvents = calendarEventsFor(selectedDate)
    page = <section className="figma-calendar-page" data-figma-node="702:1663">
      <div className="figma-calendar-card">
        <div className="figma-calendar-head"><div className="figma-month-control"><button aria-label="이전 달" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button><h2>{calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월</h2><button aria-label="다음 달" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button></div><button className="figma-calendar-add" aria-label="등록 메뉴 열기" onClick={openScheduleRegistration}>＋</button></div>
        <div className="figma-calendar-legend"><button className={scheduleScope === 'all' ? 'active' : ''} onClick={() => setScheduleScope('all')}><i className="all-dot" />전체</button><button className={scheduleScope === 'me' ? 'active' : ''} onClick={() => setScheduleScope(scheduleScope === 'me' ? 'all' : 'me')}><i style={{ background: myScheduleColor }} />나</button>{boot.children.map((childItem, index) => <button key={childItem.id} title={childItem.name} className={scheduleScope === childItem.id ? 'active' : ''} onClick={() => setScheduleScope(scheduleScope === childItem.id ? 'all' : childItem.id)}><i style={{ background: childColor(childItem.id) }} />아이{index + 1}</button>)}</div>
        <div className="weekdays figma-weekdays">{['일', '월', '화', '수', '목', '금', '토'].map((day, index) => <span className={index === 0 ? 'sun' : index === 6 ? 'sat' : ''} key={day}>{day}</span>)}</div>
        <div className="month-grid figma-month-grid">{calendarDays.map(day => {
          const key = dateKey(day); const dayEvents = calendarEventsFor(key); const outside = day.getMonth() !== calendarMonth.getMonth()
          return <button key={key} disabled={outside} aria-label={outside ? undefined : `${key} · 일정 ${dayEvents.length}개`} className={(outside ? 'muted ' : '') + (selectedDate === key ? 'selected' : '')} onClick={() => pickCalendarDate(day)}><span>{outside ? '' : day.getDate()}</span><i className="month-day-events" aria-hidden="true">{dayEvents.slice(0, 3).map(event => <b key={event.id} style={{ background: event.color }} />)}{dayEvents.length > 3 && <small>+{dayEvents.length - 3}</small>}</i></button>
        })}</div>
        <div className="figma-calendar-agenda"><small>{selectedDate === todayKey ? '오늘 일정' : '선택한 일정'} · {selectedEvents.length}건</small>{selectedEvents.map(event => <button key={event.id} onClick={() => setScheduleSheet('DAY')}><i style={{ background: event.color }} /><span><strong>{event.title}</strong><small>{selectedDate.slice(5).replace('-', '/')} · {formatTime(event.startsAt)} · {event.meta.split(' · ')[0]}</small></span></button>)}{!selectedEvents.length && <p>등록된 일정이 없어요</p>}</div>
      </div>
      <button className="figma-calendar-connect" onClick={() => go('calendar')}><span><strong>개인 캘린더 연동</strong><small>개인 일정을 편하게 연동해보세요</small></span><b>›</b></button>
    </section>
  }
  if (boot && screen === 'careHub') {
    const myNext = viewerAssignments.find(a => a.status !== 'COMPLETED') ?? viewerAssignments[0]
    const myNextItem = myNext ? itemFor(myNext) : undefined
    page = <>
      <div className="section-kicker">돌봄 현황</div>
      <section className="care-status-panel">
        <div className="care-status-title"><span className="care-avatar">{movingAssignment ? member(movingAssignment.assignee_id).slice(0, 1) : '✓'}</span><div><strong>{movingAssignment && movingItem ? `${child(movingItem.child_id)} · ${movingItem.title}` : '진행 중인 돌봄이 없어요'}</strong><small>{movingAssignment ? `${member(movingAssignment.assignee_id)} 담당` : '현재 확정된 이동 일정이 없습니다'}</small></div><em>{movingAssignment ? '실시간' : '오늘'}</em></div>
        {movingAssignment && movingItem && <><div className="care-route-assets"><span><img src={careDoneNode} alt="학교 완료" /><small>학교</small></span><img src={careDoneLine} alt="" /><span><img src={careDoneNode} alt="방과후 완료" /><small>방과후</small></span><img src={careActiveLine} alt="" /><span className="active"><img src={careActiveNode} alt="이동 중" /><small>이동 중</small></span><img src={careFutureLine} alt="" /><span><img src={careFutureNode} alt="도착 전" /><small>집</small></span></div><button className="care-live-row" onClick={() => go('location')}><span>{member(movingAssignment.assignee_id)}와 함께 {movingItem.title} 이동 중</span><small>동선 보기 ›</small></button></>}
      </section>
      <button className={'care-state-strip ' + (activeExceptions.length ? 'danger' : 'safe')} onClick={() => go('exception')}><b>{activeExceptions.length ? '!' : '✓'}</b><span><strong>{activeExceptions.length ? '지금 확인이 필요해요' : '충돌되는 일정이 없어요'}</strong><small>{activeExceptions.length ? `${activeExceptions.length}개의 예외 상황` : '등록된 가족 일정 기준'}</small></span><em>›</em></button>
      <Section action={<button className="text-link" onClick={() => go('tasks')}>전체 이력 ›</button>}>내가 맡은 일</Section>
      {myNext && myNextItem ? <Card className="care-duty-card exact-duty"><div><time>{formatTime(myNextItem.starts_at) || '시간 미정'}</time><span className="small-badge ok">{myNext.status === 'COMPLETED' ? '완료' : '담당'}</span></div><strong>{myNextItem.title} — {child(myNextItem.child_id)}</strong><p>{myNextItem.detail || '등록된 돌봄 일정'}</p><button aria-label="내 돌봄·완료 완료 체크" onClick={() => { setAssignmentId(myNext.id); go('tasks') }}>{myNext.status === 'COMPLETED' ? '완료 기록 보기' : '완료 체크'}</button><div className="care-duty-stats"><span><strong>{viewerAssignments.length}</strong><small>맡은 일</small></span><span><strong>{viewerAssignments.filter(a => a.status === 'COMPLETED').length}</strong><small>완료</small></span><span><strong>{viewerAssignments.filter(a => a.note).length}</strong><small>특이사항</small></span></div></Card> : <Empty title="오늘 맡은 일이 없어요" text="새로운 돌봄 요청이 오면 여기에 표시돼요" />}
      <Section>빠른 실행</Section><div className="care-quick-grid"><button className="urgent" onClick={() => go('emergency')}><i><img src={careEmergencyIcon} alt="" /></i><span><strong>긴급 도움 요청</strong><small>가족 전체에 도움 요청</small></span></button><button onClick={() => go('assignments')}><i><img src={careAssignmentIcon} alt="" /></i><span><strong>역할 배정</strong><small>오늘의 담당 확인</small></span></button></div>
    </>
  }
  if (boot && screen === 'familyHub') page = <><div className="eyebrow">FAMILY</div><p className="hero-copy family-main-copy">구성원과 아이를 관리하고 누구에게 어떤 정보를 보여줄지 정해요.</p><Section>구성원</Section><div className="family-people exact-family-people">{members.map(person => <button key={person.id} onClick={() => go('members')}><i className="member-profile-asset"><img src={profileForMember(person.id)} alt="" /></i><span>{person.name}</span><small>{person.id === me?.member.id ? `${roleLabel[person.role] ?? '가족'} (나)` : roleLabel[person.role] ?? '가족'}</small><b className="member-presence"><img src={memberIsOnline(person.id) ? memberActiveIcon : memberInactiveIcon} alt={memberIsOnline(person.id) ? '활동 중' : '비활동 중'} /></b></button>)}<button className="invite-person" onClick={() => go('members')}><i>＋</i><span>초대</span><small>가족 추가</small></button></div><Section>아이</Section><div className="family-children exact-family-children">{boot.children.map((kid, index) => <button key={kid.id} onClick={() => { setScheduleScope(kid.id); go('schedule') }}><i><img src={index % 2 ? schoolIcon : backpackIcon} alt="" /></i><strong>{kid.name}</strong><small>{kid.age_label}</small></button>)}{!boot.children.length && <button className="family-child-empty" onClick={() => go('members')}><i>＋</i><strong>등록된 아이가 없어요</strong><small>가족 설정에서 아이를 추가해 주세요</small></button>}</div><div className="hub-list family-actions"><button onClick={() => go('members')}><i><img src={familySettingsUiIcon} alt="" /></i><span><strong>가족 설정</strong><small>가족 구성원 · 아이 · 초대코드</small></span><b>›</b></button><button aria-label="우리집 기록함 · 패밀리 앨범" onClick={() => plan === 'PRO' ? go('album') : go('plan')}><i><img src={familyAlbumUiIcon} alt="" /></i><span><strong>패밀리 앨범 {plan === 'PRO' ? <em className="small-badge ok">이용 가능</em> : <Pro />}</strong><small>돌봄 완료 사진 자동 모음</small></span><b>›</b></button><button onClick={() => go('permissions')}><i><img src={informationUiIcon} alt="" /></i><span><strong>정보 공개</strong><small>위치 · 건강 · 사진 권한</small></span><b>›</b></button></div><Card className="privacy-note">구성원마다 볼 수 있는 정보 범위를 따로 설정할 수 있어요. 기본값은 최소 공개입니다.</Card></>
  if (boot && screen === 'more') page = <div className="figma-more">
    <button className="profile-summary" onClick={() => go('members')}>
      <span><img src={profileForMember(me?.member.id ?? viewer)} alt="" /></span>
      <div><strong>{me?.member.name || member(viewer)} {plan === 'PRO' && <Pro />}</strong><small>{boot.family.name} · 구성원 {members.length}명</small></div>
      <b>›</b>
    </button>
    {subscription?.dev_switch_available && <Card className="dev-plan-card compact">
      <span className="small-badge danger">DEVELOPER MODE</span><strong>Free / Pro 화면 전환</strong>
      <p>결제 없이 현재 가족방의 기능 권한을 바꿔 두 버전을 확인해요.</p>
      <div className="dev-plan-switch"><button aria-pressed={plan === 'FREE'} disabled={planBusy || plan === 'FREE'} onClick={() => previewPlan('FREE')}>Free</button><button aria-pressed={plan === 'PRO'} disabled={planBusy || plan === 'PRO'} onClick={() => previewPlan('PRO')}>Pro</button></div>
    </Card>}
    <Section>알림과 설정</Section>
    <div className="more-tile-grid">
      <button onClick={() => go('notifications')}><i><img src={notificationsUiIcon} alt="" /></i><strong>알림함</strong><small>{unread ? `새 알림 ${unread}건` : '새 알림 없음'}</small><span>›</span></button>
      <button onClick={() => go('settings')}><i><img src={notificationSettingsUiIcon} alt="" /></i><strong>알림 설정</strong><small>종류별 on/off</small><span>›</span></button>
    </div>
    <Section>혜택·부가서비스</Section>
    <div className="family-menu-list more-list">
      <button onClick={() => plan === 'PRO' ? go('gap') : go('plan')}><i><img src={careGapUiIcon} alt="" /></i><span><strong>돌봄 공백 예측</strong><small>다음 주 공백 시간 미리 확인</small></span>{plan === 'PRO' ? <em className="small-badge ok">이용 가능</em> : <Pro />}<b>›</b></button>
      <button onClick={() => plan === 'PRO' ? go('programs') : go('plan')}><i><img src={careProgramUiIcon} alt="" /></i><span><strong>돌봄 제도 안내</strong><small>정부 지원 제도 맞춤 안내</small></span>{plan === 'PRO' ? <em className="small-badge ok">이용 가능</em> : <Pro />}<b>›</b></button>
    </div>
    <Section>계정</Section>
    <div className="more-tile-grid">
      <button onClick={() => go('plan')}><i><img src={planPaymentUiIcon} alt="" /></i><strong>플랜·결제</strong><small>{plan === 'PRO' ? 'Pro 구독 중' : 'Free 이용 중'}</small><span>›</span></button>
      <button onClick={startFamilyOnboarding}><i><img src={familyOnboardingUiIcon} alt="" /></i><strong>가족방 온보딩</strong><small>가족방 만들기 흐름 다시 보기</small><span>›</span></button>
      <button onClick={() => startScheduleOnboarding()}><i><img src={scheduleOnboardingUiIcon} alt="" /></i><strong>일정 등록 온보딩</strong><small>첫 일정 등록 흐름 다시 보기</small><span>›</span></button>
    </div>
    <div className="more-policy-list"><button>🏳️ <span>서비스 이용 약관</span><b>›</b></button><button><img src={lockIcon} alt="" /> <span>개인정보 처리방침</span><b>›</b></button><button className="logout" onClick={logout}>↩️ <span>로그아웃</span><b>›</b></button></div>
    <small className="app-version">Family Care v0.9.1 · 개발 중</small>
  </div>
  if (boot && screen === 'exception') page = <><div className="eyebrow urgent">EXCEPTION CARE</div><h2 className="hero-title">{activeExceptions.length ? <>지금 확인이<br />필요해요</> : <>현재 예외 상황이<br />없어요</>}</h2>{activeExceptions.length ? <Card className="urgent-card"><span className="small-badge danger">예외 상황 {activeExceptions.length}건</span><strong>{activeExceptions[0].reason}</strong><p>진행 중인 대안을 확인하고 담당자를 조정해 주세요.</p></Card> : <Card className="urgent-card safe"><span className="small-badge ok">정상</span><strong>감지된 일정 충돌이 없어요.</strong><p>가족 일정이 겹치면 이 화면에서 바로 알려드릴게요.</p></Card>}<Section>진행 중인 대안</Section>{activeExceptions.length ? activeExceptions.map(e => <Card key={e.id} className="exception-card"><strong>{e.reason}</strong><p>대안 · {member(e.alternative_member_id)}</p><span className="small-badge danger">확인 대기</span><button className="primary-button" onClick={() => run(() => send('/exceptions/' + e.id + '/approve', 'POST'), '대안을 요청했어요')}>대안 승인</button></Card>) : <Empty title="새로운 대안이 없어요" text="충돌이 생기면 해결책을 이곳에서 확인할 수 있어요" />}<Section>직접 대안 제안</Section><Card className="form-card"><label className="form-label">조정할 배정</label><select className="form-control" value={assignmentId || ''} onChange={e => setAssignmentId(e.target.value)}><option value="">배정을 선택하세요</option>{assignments.filter(a => a.status === 'ACCEPTED').map(a => <option key={a.id} value={a.id}>{itemFor(a)?.title} · {member(a.assignee_id)}</option>)}</select><label className="form-label">다른 담당자</label><select className="form-control" value={alternative} onChange={e => setAlternative(e.target.value)}>{members.filter(m => m.id !== me?.member.id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><label className="form-label">사유</label><input className="form-control" value={reason} onChange={e => setReason(e.target.value)} /><button className="primary-button wide-button" onClick={() => run(async () => { if (!assignmentId) throw new Error('배정을 선택해주세요'); await send('/exceptions', 'POST', { assignment_id: assignmentId, alternative_member_id: alternative, reason }) }, '대안을 등록했어요')}>대안 만들기</button></Card></>
  if (boot && screen === 'notifications') page = <div className="figma-notifications">
    <div className="notification-title-row"><h2>알림</h2><button disabled={!visibleNotices.some(notice => !notice.is_read)} onClick={() => run(async () => { await Promise.all(visibleNotices.filter(notice => !notice.is_read).map(notice => send('/notifications/' + notice.id + '/read', 'PATCH'))) }, '알림을 모두 읽었어요')}>모두 읽음</button></div>
    <div className="notification-scope" role="tablist" aria-label="알림 범위"><button role="tab" aria-selected={noticeScope === 'mine'} className={noticeScope === 'mine' ? 'active' : ''} onClick={() => setNoticeScope('mine')}>나에게 온 것</button><button role="tab" aria-selected={noticeScope === 'family'} className={noticeScope === 'family' ? 'active' : ''} onClick={() => setNoticeScope('family')}>전체 가족</button></div>
    <div className="notification-groups">{noticeGroups.map(([key, notices]) => <section key={key}><h3>{key === todayKey ? '오늘' : key === yesterdayKey ? '어제' : formatDate(key + 'T00:00:00')}</h3><div>{notices.map(notice => <button key={notice.id} className={'notification-row ' + (notice.is_read ? 'read' : '')} onClick={() => void openNotice(notice)}><i className={notice.level === 'IMPORTANT' ? 'important' : ''} /><span><strong>{notice.title}</strong><small>{notice.body}</small><em>{formatTime(notice.created_at)}</em></span>{!notice.is_read && <b />}</button>)}</div></section>)}</div>
    {!visibleNotices.length && <Empty title="새로운 알림이 없어요" text="돌봄 요청이나 완료 소식이 오면 여기에 표시돼요" />}
    <button className="notification-settings-link" onClick={() => go('settings')}>알림 설정</button>
    <p className="notification-note">탭하면 해당 화면으로 바로 이동합니다.</p>
  </div>
  if (boot && screen === 'members') page = <><div className="eyebrow">우리 가족 · {boot.family.name}</div><h2 className="hero-title">돌봄 구성원</h2><p className="hero-copy">현재 사용자: {me?.member.name ?? member(viewer)} · {me?.authenticated ? '가족방 세션 연결됨' : '데모 가족'}</p>
    <Section>가족 구성원</Section>{boot.members.filter(m => m.status !== 'REMOVED').map(m => <Card key={m.id} className="member-card"><div className="person-avatar profile"><img src={profileForMember(m.id)} alt="" /><img className="presence" src={memberIsOnline(m.id) ? memberActiveIcon : memberInactiveIcon} alt={memberIsOnline(m.id) ? '활동 중' : '비활동 중'} /></div><div><strong>{m.name}{m.is_owner ? ' · 주돌봄자' : ''}</strong><p>{m.role === 'GRANDPARENT' ? '조부모' : m.role === 'CAREGIVER' ? '돌봄 참여자' : '부모'} · {m.status === 'PENDING' ? '초대 대기' : memberIsOnline(m.id) ? '활동 중' : '비활동 중'}</p></div>{m.status === 'PENDING' && !me?.authenticated && <button className="text-link" onClick={() => run(() => send('/members/' + m.id + '/accept', 'POST'), '가족에 합류했어요')}>합류</button>}{me?.authenticated && !!me.member.is_owner && !m.is_owner && <div className="member-actions">{m.status === 'ACTIVE' && <button className="member-owner-transfer" onClick={() => transferOwnership(m.id, m.name)}>주돌봄자 지정</button>}<button className="member-remove" onClick={() => { if (confirm(m.name + '님을 가족방에서 퇴장시킬까요?')) void run(() => send('/members/' + m.id + '/remove', 'POST'), m.name + '님을 가족방에서 퇴장시켰어요') }}>퇴장</button></div>}</Card>)}
    <Section>아이</Section>{boot.children.map(c => <Card key={c.id} className="member-card"><div className="child-avatar">{c.name.slice(0, 1)}</div><div><strong>{c.name}</strong><p>{c.age_label}</p></div></Card>)}
    {(!me?.authenticated || me.member.is_owner) && <Card className="form-card"><strong>아이 등록</strong><label className="form-label">이름</label><input className="form-control" aria-label="아이 이름" value={childNameInput} onChange={e => setChildNameInput(e.target.value)} placeholder="아이 이름" /><label className="form-label">나이·학교</label><input className="form-control" aria-label="아이 나이·학교" value={childAgeInput} onChange={e => setChildAgeInput(e.target.value)} placeholder="예: 7세 · 초등학교" /><button className="primary-button wide-button" onClick={() => run(async () => { if (!childNameInput.trim() || !childAgeInput.trim()) throw new Error('아이 이름과 나이·학교를 입력해주세요'); await send('/children', 'POST', { name: childNameInput.trim(), age_label: childAgeInput.trim() }); setChildNameInput(''); setChildAgeInput('') }, '아이를 등록했어요')}>아이 등록</button></Card>}
    {me?.authenticated && me.member.is_owner && <><Section>가족 초대</Section><Card className="form-card invite-share-card"><p>같은 초대 링크로 만료 전까지 여러 가족이 참가할 수 있어요. Free는 구성원 3명까지예요.</p>{inviteCode && <><div className="invite-code"><strong>{inviteCode}</strong><small>만료: {formatDate(inviteExpiresAt)}</small></div><label className="form-label">초대할 가족의 역할</label><select className="form-control" value={inviteRole} onChange={e => setInviteRole(e.target.value)}><option value="PARENT">부모</option><option value="GRANDPARENT">조부모</option><option value="CAREGIVER">돌봄 참여자</option></select><input className="invite-link" aria-label="가족방 초대 링크" value={inviteLink} readOnly /><button className="kakao-share wide-button" onClick={() => void shareInvite('kakao')}>카카오톡으로 초대 링크 공유</button></>}<button className="outline-button wide-button" onClick={() => run(async () => { const result = await send<{ invite_code: string; invite_expires_at: string }>('/families/invite-code/rotate', 'POST'); setInviteCode(result.invite_code); setInviteExpiresAt(result.invite_expires_at) }, '새 초대 링크를 만들었어요')}>{inviteCode ? '초대 링크 새로 만들기' : '초대 링크 만들기'}</button></Card></>}
    {!me?.authenticated && <><Section>데모 구성원 추가</Section><Card className="form-card"><label className="form-label">이름</label><input className="form-control" value={memberNameInput} onChange={e => setMemberNameInput(e.target.value)} placeholder="가족 이름" /><label className="form-label">역할</label><select className="form-control" value={memberRole} onChange={e => setMemberRole(e.target.value)}><option value="PARENT">부모</option><option value="GRANDPARENT">조부모</option><option value="CAREGIVER">돌봄 참여자</option></select><button className="primary-button wide-button" onClick={() => run(async () => { if (!memberNameInput.trim()) throw new Error('이름을 입력해주세요'); await send('/members', 'POST', { name: memberNameInput.trim(), role: memberRole }); setMemberNameInput('') }, '초대 대기 구성원을 추가했어요')}>구성원 추가</button></Card></>}
    <button className="text-link centered" onClick={() => go('permissions')}>정보 공개 권한 관리</button>{me?.authenticated && !me.member.is_owner ? <button className="danger-link centered" onClick={() => void leaveFamily()}>가족방 나가기</button> : !me?.authenticated ? <button className="text-link centered" onClick={() => void leaveFamily()}>다른 가족방 만들기·참가</button> : <p className="helper-text centered">다른 구성원에게 주돌봄자 권한을 넘긴 뒤 가족방을 나갈 수 있어요.</p>}
  </>
  if (boot && screen === 'scheduleOnboarding' && scheduleOnboardStep === 'OWNER') page = <div className="onboard-flow schedule-onboard">
    <div className="onboard-step-head"><button aria-label="일정 화면으로 돌아가기" onClick={() => go('schedule')}>‹</button><div className="onboard-step-track two"><span className="active" /><span /></div><small>1/2</small></div>
    <span className="eyebrow">STEP 0</span><h2 className="hero-title">누구의 일정인가요?</h2>
    <div className="schedule-owner-list"><button onClick={() => startScheduleOnboarding('PERSONAL')}><img src={scheduleOwnerIcon} alt="" /><span><strong>본인</strong><small>업무 일정과 개인 루틴</small></span><b>›</b></button><button onClick={() => startScheduleOnboarding('CHILD')}><img src={scheduleChildIcon} alt="" /><span><strong>아이</strong><small>학원·학교·방과후 일정</small></span><b>›</b></button></div>
  </div>
  if (boot && screen === 'scheduleOnboarding' && scheduleOnboardStep === 'CALENDAR') {
    const connected = calendarConnections.some(connection => connection.connected)
    page = <div className="onboard-flow schedule-onboard">
      <div className="onboard-step-head"><button aria-label="일정 주체 선택으로 돌아가기" onClick={() => setScheduleOnboardStep('OWNER')}>‹</button><div className="onboard-step-track two"><span className="active" /><span /></div><small>1/2</small></div>
      <span className="eyebrow">STEP 1</span><h2 className="hero-title">업무 캘린더를<br />연결해주세요</h2><p className="hero-copy">아이 일정과 겹치는 시간대를 미리 찾기 위해 사용합니다.<br />회의 제목과 참석자는 가져오지 않습니다.</p>
      <div className="calendar-onboard-list">{calendarOptions.map(connection => <button key={connection.provider} disabled={!connection.configured} onClick={() => connection.connected ? syncCalendar(connection.provider) : void connectCalendar(connection.provider, true)}><img src={connection.provider === 'google' ? googleIcon : outlookIcon} alt="" /><span><strong>{connection.provider === 'google' ? 'Google 캘린더' : 'Outlook 캘린더'}</strong><small>{connection.connected ? '연결됨 · 누르면 동기화' : connection.configured ? (connection.provider === 'google' ? '개인·업무 계정 모두 가능' : '회사 계정으로 로그인') : 'OAuth 설정이 필요해요'}</small></span><b>{connection.connected ? '✓' : '›'}</b></button>)}</div>
      <Card className="calendar-privacy-note">연동은 부모 개인 계정에 걸립니다.<br />자녀가 여러 명이어도 한 번만 연결하면 됩니다.</Card>
      <div className="onboard-bottom-actions">{connected && <button className="primary-button wide-button" onClick={() => setScheduleOnboardStep('ROUTINE')}>다음</button>}<button className="text-link centered" onClick={() => setScheduleOnboardStep('ROUTINE')}>나중에 연결하기</button></div>
    </div>
  }
  if (boot && screen === 'scheduleOnboarding' && scheduleOnboardStep === 'ROUTINE') page = <div className="onboard-flow schedule-onboard">
    <div className="onboard-step-head"><button aria-label="이전 단계로 돌아가기" onClick={() => setScheduleOnboardStep(scheduleForm === 'CHILD' ? 'OWNER' : 'CALENDAR')}>‹</button><div className="onboard-step-track two"><span className="active" /><span className="active" /></div><small>2/2</small></div>
    <span className="eyebrow">STEP 2</span><h2 className="hero-title">루틴이 있다면<br />입력해주세요</h2><p className="hero-copy">반복되는 일정을 등록해두면 담당자 추천에 함께 반영해요.</p>
    <Card className="onboard-routine-card"><label className="form-label">루틴 이름</label><input className="form-control" value={scheduleTitle} onChange={event => setScheduleTitle(event.target.value)} placeholder={scheduleForm === 'CHILD' ? '예: 태권도 데려다주기' : '예: 화요일 저녁 운동'} />
      <label className="form-label">대상</label><div className="routine-targets"><button className={scheduleForm === 'PERSONAL' ? 'active' : ''} onClick={() => setScheduleForm('PERSONAL')}>본인</button>{boot.children.map(kid => <button key={kid.id} className={scheduleForm === 'CHILD' && childScheduleChild === kid.id ? 'active' : ''} onClick={() => { setScheduleForm('CHILD'); setChildScheduleChild(kid.id) }}>{kid.name}</button>)}</div>
      {scheduleForm === 'CHILD' && <><label className="form-label">일정 종류</label><select className="form-control" value={childScheduleCategory} onChange={event => setChildScheduleCategory(event.target.value)}>{Object.entries(childScheduleLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></>}
      <label className="form-label">반복 주기</label><div className="weekday-picker routine-weekdays">{[['일', 6], ['월', 0], ['화', 1], ['수', 2], ['목', 3], ['금', 4], ['토', 5]].map(([label, day]) => <button key={label} className={scheduleRepeatDays.includes(day as number) ? 'active' : ''} onClick={() => { const value = day as number; setScheduleRepeatDays(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]) }}>{label}</button>)}</div>
      <ScheduleTimeFields date={scheduleDate} start={scheduleStartTime} end={scheduleEndTime} onDate={setScheduleDate} onStart={setScheduleStartTime} onEnd={setScheduleEndTime} />
      <label className="form-label">반복 종료일</label><input className="form-control" type="date" value={scheduleRepeatUntil} onChange={event => setScheduleRepeatUntil(event.target.value)} />
      <button className="primary-button wide-button" disabled={scheduleOnboardBusy} onClick={() => void saveOnboardingRoutine()}>{scheduleOnboardBusy ? '저장 중…' : '저장하고 완료'}</button>
    </Card><button className="text-link centered" disabled={scheduleOnboardBusy} onClick={() => void finishScheduleOnboarding()}>등록할 루틴이 없어요</button>
  </div>
  if (screen === 'onboarding' && invitationFromUrl && inviteStep === 'preview') page = <div className="invite-landing"><div className="invite-brand"><i /><strong>초대장</strong></div><Card className="invite-welcome"><h2>{invitePreview?.owner_name ?? '가족'}님이<br />{invitePreview?.family_name ?? '가족 케어'}에<br />초대했어요</h2><div className="invite-role"><span>{roleLabel[onboardRole].slice(0, 1)}</span><div><strong>역할 — {roleLabel[onboardRole]}</strong><small>역할은 다음 화면에서 바꿀 수 있어요</small></div></div><ul><li>오늘 내게 부탁된 일만 보여요</li><li>가족 캘린더는 권한에 맞게 보여요</li><li>가전 제어 권한은 없어요</li></ul><button className="primary-button wide-button" onClick={() => setInviteStep('role')}>합류할게요</button><small className="invite-account-note">이미 계정이 있어 추가 가입 없이 바로 합류합니다.</small></Card><button className="text-link centered invite-later" onClick={() => { const clean = new URL(location.href); clean.search = ''; history.replaceState(null, '', clean.pathname); setOnboardMode('create'); setInviteStep('role') }}>나중에 결정하기</button></div>
  if (screen === 'onboarding' && invitationFromUrl && inviteStep === 'role') page = <div className="onboard-flow"><div className="onboard-step-head"><button aria-label="초대장으로 돌아가기" onClick={() => setInviteStep('preview')}>‹</button><div className="onboard-step-track"><span className="active" /><span /><span /><span /></div><small>1/4</small></div><h2 className="hero-title">이 가족에서<br />어떤 역할인가요?</h2><p className="hero-copy">역할에 따라 보이는 정보와 알림이 자동으로 정해집니다.</p><div className="onboard-role-list">{([['PARENT', '제2돌봄자', '업무 캘린더 동기화 + 내 배정'], ['GRANDPARENT', '조부모 / 친척', '오늘 내게 배정된 태스크 카드만'], ['CAREGIVER', '기타 돌봄자', '시터·돌봄선생님']] as const).map(([value, title, detail]) => <button key={value} className={onboardRole === value ? 'active' : ''} onClick={() => setOnboardRole(value)}>{onboardRole === value ? <img src={selectedRoleIcon} alt="선택됨" /> : <i />}<span><strong>{title}</strong><small>{detail}</small></span></button>)}</div><label className="form-label join-name-label">가족에게 보일 내 이름</label><input className="form-control" value={onboardName} onChange={event => setOnboardName(event.target.value)} placeholder="예: 이지윤" /><button className="primary-button wide-button onboard-next" disabled={!onboardName.trim()} onClick={() => setInviteStep('notifications')}>다음</button></div>
  if (screen === 'onboarding' && invitationFromUrl && inviteStep === 'notifications') page = <div className="onboard-flow notification-onboard"><h2 className="hero-title">중요한 순간에만<br />알려드려요</h2><div className="notification-examples"><Card><i className="red" /><span><strong>픽업 담당자가 필요할 때</strong><small>즉시 알림</small></span></Card><Card><i className="gold" /><span><strong>준비물이 빠졌을 때</strong><small>출발 임박에만 진동</small></span></Card><Card><i className="pink" /><span><strong>그 밖의 정보</strong><small>하루 1회 모아서</small></span></Card></div><Card className="notification-promise">평소와 같은 배정은 알리지 않습니다. 달라질 때만 말을 겁니다.</Card><div className="onboard-bottom-actions"><button className="primary-button wide-button" disabled={onboardBusy} onClick={() => void finishInviteJoin(true)}>알림 허용하기</button><button className="text-link centered" disabled={onboardBusy} onClick={() => void finishInviteJoin(false)}>나중에 설정</button></div></div>
  if (screen === 'onboarding' && !invitationFromUrl && onboardStep === 'ROOM') page = <div className="family-onboard-start"><span className="eyebrow">FAMILY CARE · 가족방 시작</span><h2 className="hero-title">가족의 돌봄을<br />함께 이어요</h2><p className="hero-copy">새 가족방을 만들거나,<br />가족에게 받은 초대 링크·코드로 참여하세요.</p><div className="choice-row"><button className={'choice-chip ' + (onboardMode === 'create' ? 'active' : '')} onClick={() => setOnboardMode('create')}>가족방 만들기</button><button className={'choice-chip ' + (onboardMode === 'join' ? 'active' : '')} onClick={() => setOnboardMode('join')}>초대코드로 참가</button></div><Card className="form-card">{onboardMode === 'create' ? <><label className="form-label">가족방 이름</label><input className="form-control" value={onboardFamilyName} onChange={event => setOnboardFamilyName(event.target.value)} placeholder="예: 지우네 가족" /></> : <><label className="form-label">초대 코드</label><input className="form-control" value={onboardInviteCode} onChange={event => setOnboardInviteCode(event.target.value.toUpperCase())} placeholder="가족에게 받은 코드" /></>}<label className="form-label">내 이름</label><input className="form-control" value={onboardName} onChange={event => setOnboardName(event.target.value)} placeholder="예: 김지연" /></Card><button className="primary-button wide-button" disabled={onboardBusy || !onboardName.trim() || (onboardMode === 'create' ? !onboardFamilyName.trim() : !onboardInviteCode.trim())} onClick={enterFamily}>{onboardBusy ? '연결 중…' : onboardMode === 'create' ? '가족방 만들기' : '가족방 참가'}</button>{boot && <button className="text-link centered" onClick={() => go('home')}>현재 가족방으로 돌아가기</button>}</div>
  if (screen === 'onboarding' && !invitationFromUrl && onboardStep === 'ROLE') page = <div className="onboard-flow"><div className="onboard-step-head"><button aria-label="가족방 정보로 돌아가기" onClick={() => setOnboardStep('ROOM')}>‹</button><div className="onboard-step-track"><span className="active" /><span /><span /><span /></div><small>1/4</small></div><h2 className="hero-title">이 가족에서<br />어떤 역할인가요?</h2><p className="hero-copy">역할에 따라 보이는 정보와 알림이 자동으로 정해집니다. 나중에 바꿀 수 있습니다.</p><div className="onboard-role-list">{([['PARENT', '주양육자', '전체 가족 캘린더 풀뷰'], ['PARENT_HELPER', '제2양육자', '업무 캘린더 동기화 + 내 배정'], ['GRANDPARENT', '조부모 / 친척', '오늘 내게 배정된 태스크 카드만'], ['CAREGIVER', '기타 돌봄자', '시터·돌봄선생님']] as const).map(([value, title, detail]) => <button key={value} className={onboardRoleChoice === value ? 'active' : ''} onClick={() => { setOnboardRoleChoice(value); setOnboardRole(value === 'PARENT_HELPER' ? 'PARENT' : value) }}>{onboardRoleChoice === value ? <img src={selectedRoleIcon} alt="선택됨" /> : <i />}<span><strong>{title}</strong><small>{detail}</small></span></button>)}</div><button className="primary-button wide-button onboard-next" onClick={() => setOnboardStep('CHILD')}>다음</button></div>
  if (screen === 'onboarding' && !invitationFromUrl && onboardStep === 'CHILD') page = <div className="onboard-flow"><div className="onboard-step-head"><button aria-label="역할 선택으로 돌아가기" onClick={() => setOnboardStep('ROLE')}>‹</button><div className="onboard-step-track"><span className="active" /><span className="active" /><span className="active" /><span /></div><small>3/4</small></div><h2 className="hero-title">아이 정보를 알려주세요</h2>{onboardChildren.length > 0 && <div className="onboard-child-list">{onboardChildren.map((kid, index) => <Card key={`${kid.name}-${index}`}><span><strong>{kid.name}</strong><small>{kid.ageLabel}</small></span><button aria-label={`${kid.name} 삭제`} onClick={() => setOnboardChildren(current => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></Card>)}</div>}<Card className="form-card child-onboard-card"><label className="form-label">이름</label><input className="form-control" value={childNameInput} onChange={event => setChildNameInput(event.target.value)} placeholder="아이 이름" /><label className="form-label">생년월일·나이·기관</label><input className="form-control" value={childAgeInput} onChange={event => setChildAgeInput(event.target.value)} placeholder="예: 만 7세 · 한빛초등학교" /><button className="outline-button wide-button" onClick={addOnboardChild}>＋ 자녀 추가</button></Card><Card className="academy-optional"><strong>학원 시간표 (선택)</strong><p>나중에 알림장을 찍으면 자동으로 채워집니다.</p><button onClick={() => void saveOnboardChildren('SCHEDULE')}>지금 입력</button><button onClick={() => void saveOnboardChildren()}>건너뛰기</button></Card><button className="primary-button wide-button onboard-next" disabled={onboardBusy} onClick={() => void saveOnboardChildren()}>{onboardBusy ? '등록 중…' : '다음'}</button></div>
  if (screen === 'onboarding' && !invitationFromUrl && onboardStep === 'INVITE_SETUP') page = <div className="onboard-flow"><div className="onboard-step-head"><button aria-label="아이 정보로 돌아가기" onClick={() => setOnboardStep('CHILD')}>‹</button><div className="onboard-step-track"><span className="active" /><span className="active" /><span className="active" /><span className="active" /></div><small>4/4</small></div><h2 className="hero-title">함께 챙길 가족을 초대해보세요</h2><p className="hero-copy">새로 초대하기</p><div className="invite-role-buttons">{([['PARENT', '배우자 초대', '초대코드 · 링크 초대'], ['GRANDPARENT', '조부모 초대', '초대코드 · 링크 초대'], ['CAREGIVER', '시터 / 돌봄선생님 초대', '초대코드 · 링크 초대']] as const).map(([role, title, detail]) => <button key={role} onClick={() => { setInviteRole(role); setOnboardStep('INVITE') }}><span>＋</span><span><strong>{title}</strong><small>{detail}</small></span></button>)}</div><Card className="permission-separation"><strong>권한은 분리됩니다</strong><p>가족 케어에 초대해도 가전 제어 권한은 따라가지 않습니다.</p></Card><button className="secondary-bottom-button" onClick={() => { setOnboardStep('ROOM'); go('home') }}>나중에 할게요</button></div>
  if (screen === 'onboarding' && !invitationFromUrl && onboardStep === 'INVITE') page = <div className="onboard-flow invite-code-page"><span className="eyebrow">초대하기</span><h2 className="hero-title">{inviteRole === 'PARENT' ? '배우자' : inviteRole === 'GRANDPARENT' ? '조부모' : '돌봄자'} 초대하기</h2><p className="hero-copy">아래 코드나 링크를 공유하면 Family Care에 함께할 수 있어요.</p><Card className="invite-code-card"><label>초대 코드</label><div><strong>{inviteCode || '코드 생성 중'}</strong><button onClick={() => { void navigator.clipboard?.writeText(inviteCode); setToast('초대 코드를 복사했어요.') }}>복사 ✓</button></div><small>코드는 만료 전까지 여러 가족이 사용할 수 있어요.</small></Card><Card className="invite-link-card"><label>초대 링크</label><div><input value={inviteLink} readOnly /><button onClick={() => void copyInvite()}>복사 ✓</button></div></Card><button className="kakao-share wide-button" onClick={() => void shareInvite('kakao')}><img src={inviteKakaoIcon} alt="" />카카오톡으로 공유하기</button><div className="invite-share-options"><button onClick={() => void shareInvite('sms')}><img src={inviteMessageIcon} alt="" />문자 메시지</button><button onClick={() => void copyInvite()}><img src={inviteLinkIcon} alt="" />링크 복사</button><button onClick={() => void shareInvite('system')}><img src={inviteMoreIcon} alt="" />더보기</button></div><Card className="permission-separation"><strong>권한은 분리됩니다</strong><p>가족 케어에 초대해도 가전 제어 권한은 따라가지 않습니다.</p></Card><button className="primary-button wide-button" onClick={() => go('home')}>가족방으로 들어가기</button></div>
  if (boot && screen === 'calendar') page = <><div className="eyebrow">개인 캘린더 연동</div><h2 className="hero-title">개인 일정을<br />편하게 연동해보세요</h2><p className="hero-copy">Google Calendar나 Outlook을 연결하면 업무·약속·개인 일정을 가족 캘린더에서 한 번에 확인할 수 있어요.</p>{calendarConnections.map(connection => { const label = connection.provider === 'google' ? 'Google Calendar' : 'Outlook Calendar'; return <Card key={connection.provider} className="calendar-provider"><img className="provider-icon" src={connection.provider === 'google' ? googleIcon : outlookIcon} alt="" /><div><strong>{label}</strong><p>{connection.connected ? `연결됨${connection.synced_at ? ' · 최근 동기화 ' + formatDate(connection.synced_at) : ''}` : connection.configured ? '계정을 연결할 수 있어요' : 'OAuth 앱 설정이 필요해요'}</p></div>{connection.connected ? <button className="text-link" onClick={() => syncCalendar(connection.provider)}>동기화</button> : <button className="text-link" disabled={!connection.configured} onClick={() => connectCalendar(connection.provider)}>{connection.configured ? '연결' : '설정 전'}</button>}</Card> })}<Card className="info-note">{calendarsReady ? 'Google·Outlook OAuth 설정을 모두 확인했어요. 연결 버튼을 누르고 각 계정에서 일정 읽기 권한을 허용하면 동기화할 수 있어요.' : '사용할 캘린더의 OAuth Client ID와 Secret을 backend/.env에 설정하면 연결 버튼이 활성화돼요.'}</Card><button className="primary-button wide-button" onClick={() => { setScheduleForm('PERSONAL'); setScheduleKind('ROUTINE'); go('schedule') }}>개인 루틴 직접 등록</button></>
  if (boot && screen === 'permissions') { const targetMember = me?.member.id ?? viewer; page = <><div className="eyebrow">내 정보 공개 범위</div><h2 className="hero-title">보여주고 싶은 정보만<br />직접 선택해요</h2><p className="hero-copy">각 구성원이 자신의 정보 공개 범위를 직접 관리해요. 다른 가족의 설정은 변경할 수 없어요.</p><Section>{member(targetMember)}님의 공개 범위</Section>{[['SCHEDULE_DETAIL', '개인 일정 내용', '켜면 제목까지, 끄면 시간과 바쁨 여부만 표시'], ['CHILD_DETAIL', '아이 정보', '이름과 돌봄 일정'], ['LOCATION', '위치', '이동과 인수인계 위치'], ['HEALTH', '건강 정보', '복약과 건강 관련 내용'], ['NOTE', '특이사항', '돌봄 완료 메모'], ['PHOTO', '사진', '완료 사진과 앨범']].map(([scope, name, detail]) => { const allowed = !!boot.permissions.find(p => p.member_id === targetMember && p.scope === scope)?.is_allowed; return <Card key={scope} className="permission-row"><div><strong>{name}</strong><p>{detail}</p></div><button className={'switch ' + (allowed ? 'on' : '')} role="switch" aria-checked={allowed} aria-label={name + ' 공개'} onClick={() => run(() => send('/members/' + targetMember + '/permissions', 'PATCH', { scope, is_allowed: !allowed }), '내 공개 범위를 변경했어요')}><span /></button></Card> })}<Card className="info-note">개인 일정 내용은 기본 비공개예요. 꺼두면 다른 가족에게 일정 제목 대신 ‘바쁨’으로 보여요.</Card></> }
  if (boot && screen === 'settings') page = <><div className="eyebrow">알림 설정</div><h2 className="hero-title">조용하지만<br />놓치지 않게</h2><p className="hero-copy">돌봄 요청이 오면 앱 알림함과 허용된 브라우저 알림으로 알려드려요.</p><Section>앱 알림</Section><Card className="permission-row"><div><strong>돌봄 알림 받기</strong><p>등록, 배정, 인수인계, 완료</p></div><button className={'switch ' + (appNotices ? 'on' : '')} role="switch" aria-checked={appNotices} aria-label="돌봄 알림 받기" onClick={() => run(() => send('/members/' + viewer + '/notification-preferences', 'PATCH', { app_enabled: !appNotices }), '알림 설정을 변경했어요')}><span /></button></Card><Card className="permission-row"><div><strong>이 기기 시스템 알림</strong><p>앱이 열려 있을 때 새 요청을 브라우저 알림으로 표시</p></div><button className="text-link" onClick={() => void enableBrowserNotifications()}>{'Notification' in window && Notification.permission === 'granted' ? '허용됨' : '허용하기'}</button></Card><Card className="permission-row"><div><strong>하루 1회 모아보기</strong><p>21:00에 확인할 정보만 요약</p></div><button className={'switch ' + (dailyDigest ? 'on' : '')} role="switch" aria-checked={dailyDigest} aria-label="하루 1회 모아보기" onClick={() => run(() => send('/members/' + viewer + '/notification-preferences', 'PATCH', { daily_digest_enabled: !dailyDigest }), '모아보기 설정을 변경했어요')}><span /></button></Card><Section>가전 알림 <Pro /></Section><Card className="permission-row"><div><strong>ThinQ 가전으로 알림</strong><p>{plan === 'PRO' ? 'Pro 화면 설정 체험 · 실제 ThinQ 가전 연결 없음' : 'Pro 구독이 필요해요 · 가전 연결은 아직 없음'}</p></div><button className={'switch ' + (deviceNoticeDemo ? 'on' : '')} role="switch" aria-checked={deviceNoticeDemo} aria-label="가전 알림 화면 체험" onClick={() => plan === 'PRO' ? setDeviceNoticeDemo(value => !value) : go('plan')}><span /></button></Card></>
  if (boot && screen === 'plan') page = <section className="pro-guide-page">
    <div className="pro-guide-hero">
      <button className="pro-guide-close" aria-label="플랜 화면 닫기" onClick={() => go('more')}>× <span>플랜</span></button>
      <img className="pro-plan-badge" src={proPlanBadge} alt="PRO 플랜" />
      <div className="pro-guide-title"><div><h2>Pro로 할 수 있는 것</h2><p>가족의 돌봄을 더 넉넉하게 이어가세요.</p></div><img src={proCharacter} alt="Family Care Pro 캐릭터" /></div>
      <div className="pro-cycle-tabs"><button className="active">월간</button><button>연간 <small>-20%</small></button></div>
    </div>
    <div className="pro-guide-body">
      <div className="pro-compare-table">
        <div className="head"><span>기능</span><span>무료</span><strong>PRO ●</strong></div>
        {([['알림장 인식', '2회', '10회'], ['보호자 인원', '3명', '8명'], ['아이 인원', '2명', '무제한'], ['AI 대화', '기본', '더 많은 사용량'], ['음성 등록', '—', '✓'], ['긴급 도움 요청', '—', '✓'], ['가전 알림', '—', '✓']] as const).map(([feature, free, pro]) => <div className="row" key={feature}><strong>{feature}</strong><span>{free}</span><em>{pro}</em></div>)}
      </div>
      <div className="pro-guide-price"><strong>7,900원</strong><span>/ 월</span></div>
      {subscription?.status === 'ACTIVE' && !subscription.developer_preview
        ? <div className="subscription-active pro-guide-subscription"><div><strong>{subscription.cancel_at_period_end ? '구독 취소 예약됨' : 'Pro 이용 중'}</strong><small>{formatDate(subscription.current_period_end ?? subscription.next_billing_at)}까지 Pro 이용 가능</small><small>{subscription.cancel_at_period_end ? '다음 결제는 진행되지 않아요.' : subscription.auto_renew_available ? '취소 전까지 매월 자동으로 갱신돼요.' : '현재 결제는 1개월 이용권이에요.'}</small></div>{subscription.cancel_at_period_end && subscription.auto_renew_available ? <button className="subscription-resume-button" disabled={billingBusy} onClick={() => void resumeSubscription()}>자동 갱신 다시 켜기</button> : !subscription.cancel_at_period_end ? <button className="subscription-cancel-button" disabled={billingBusy || !me?.authenticated || !me.member.is_owner} onClick={() => void cancelSubscription()}>구독 취소</button> : null}</div>
        : <div className="pro-subscribe-area"><button className={'pro-start-asset ' + ((billingBusy && !billingOpen) || billingOpen ? 'dynamic' : '')} aria-expanded={billingOpen} disabled={billingBusy || !me?.authenticated || !me.member.is_owner} onClick={() => void toggleBilling()}><img src={proStartButton} alt="" /><span>{billingBusy && !billingOpen ? '결제 준비 중…' : billingOpen ? '결제창 접기' : 'Pro 시작하기'}</span></button>{(!me?.authenticated || !me.member.is_owner) && <small className="payment-owner-note">플랜 결제는 주돌봄자 계정에서 진행할 수 있어요.</small>}{billingOpen && <div className="toss-inline-checkout"><div className="toss-heading"><span className="toss-mark">T</span><div><strong>토스페이먼츠 테스트 결제</strong><p>아래에서 결제수단과 약관을 확인해주세요.</p></div><b>{(billingOrder?.amount ?? 7900).toLocaleString()}원</b></div><div id="toss-payment-methods" className="toss-widget-slot" /><div id="toss-agreement" className="toss-widget-slot agreement" /><button className="toss-pay-button" disabled={billingBusy || !billingWidgetReady} onClick={() => void startWidgetPayment()}>{billingBusy || !billingWidgetReady ? '결제수단 불러오는 중…' : `${(billingOrder?.amount ?? 7900).toLocaleString()}원 결제하고 시작하기`}</button><small className="payment-caption">결제가 완료되면 Pro가 바로 활성화됩니다.</small></div>}</div>}
      <small className="pro-trial-note">첫 7일 무료 체험 · 언제든 해지 가능</small>
      {subscription?.dev_switch_available && <Card className="dev-plan-card pro-dev-card"><span className="small-badge danger">DEVELOPER MODE</span><strong>Free / Pro 화면 전환</strong><p>결제 없이 현재 가족방의 기능 권한을 바꿔 확인해요.</p><div className="dev-plan-switch"><button aria-pressed={plan === 'FREE'} disabled={planBusy || plan === 'FREE'} onClick={() => previewPlan('FREE')}>Free</button><button aria-pressed={plan === 'PRO'} disabled={planBusy || plan === 'PRO'} onClick={() => previewPlan('PRO')}>Pro</button></div></Card>}
    </div>
  </section>
  if (boot && screen === 'chat') page = <section className="assistant-chat-page" data-figma-node="714:2989">
    <header className="assistant-chat-header"><button aria-label="채팅 닫기" onClick={() => history.back()}>‹</button><img src={chatHeaderIcon} alt="" /><strong>케어 어시스턴트</strong><span className="assistant-plan">{plan === 'PRO' ? <Pro /> : 'FREE'}</span></header>
    <div className="assistant-token-bar"><div><span><i />AI 토큰</span><strong>{chatRemaining.toLocaleString()} <small>/ {chatTokenLimit.toLocaleString()}</small></strong></div><div className="assistant-token-track"><i style={{ width: `${chatRemainingPercent}%` }} /></div></div>
    <div className="assistant-chat-body">
      {!chatMessages.length && <Card className="chat-intro"><img className="voice-mark" src={voiceIcon} alt="" /><strong>무엇을 도와드릴까요?</strong><p>가족방의 일정·돌봄 정보·배정을 바탕으로<br />AI가 답해요. 배정 변경은 확인 없이 실행하지 않아요.</p></Card>}
      <div className="chat-thread">{chatMessages.map((m, index) => <div key={index} className={'chat-bubble ' + m.from}><div className="chat-copy">{m.text}</div>{m.from === 'agent' && m.cards?.map((card, cardIndex) => <article className="chat-summary-card" key={card.title + cardIndex}><small>{card.eyebrow}</small><strong>{card.title}</strong><p>{card.description}</p>{card.screen && <button onClick={() => go(card.screen as Screen)}>{chatScreenLabel[card.screen as Screen] ?? '관련 화면 보기'}</button>}</article>)}</div>)}</div>
      <div className="chat-prompts">{['확인할 알림 알려줘', '오늘 담당 배정은?', '등록된 일정은?', '내일 준비물 확인'].map(text => <button key={text} disabled={chatBusy} onClick={() => sendChat(text)}>{text}</button>)}</div>
    </div>
    {chatBusy && <div className="assistant-chat-loading" role="status" aria-live="polite" aria-label="답변을 준비하고 있어요"><div>{[chatLoading1, chatLoading2, chatLoading3, chatLoading4].map((source, index) => <img key={source} src={source} alt="" style={{ animationDelay: `${index * .38}s` }} />)}</div><span>답변을 준비하고 있어요</span></div>}
    <form className="chat-composer" onSubmit={e => { e.preventDefault(); sendChat() }}><button className={recording ? 'chat-mic recording' : 'chat-mic'} type="button" aria-label={recording ? '녹음 끝내고 보내기' : chatBusy ? '음성 처리 중…' : '음성 녹음'} disabled={chatBusy} onClick={toggleRecording}><img src={chatMicIcon} alt="" /></button><label><input aria-label="케어 어시스턴트에게 질문" value={chatDraft} onChange={e => setChatDraft(e.target.value)} placeholder="일정이나 배정을 물어보세요" /><button type="submit" aria-label="질문 보내기" disabled={chatBusy || !chatDraft.trim()}><img src={chatSendIcon} alt="" /></button></label></form>
  </section>
  if (boot && screen === 'emergency') page = <><div className="eyebrow urgent">긴급 도움 요청 <Pro /></div><h2 className="hero-title">갑자기 돌봄이<br />어려워졌나요?</h2><p className="hero-copy">가족 전체에게 한 번에 알리고, 먼저 수락한 가족이 맡아요.</p><Card className="form-card"><label className="form-label">도움이 필요한 돌봄</label><select className="form-control" value={emergencyItem} onChange={e => setEmergencyItem(e.target.value)}><option value="">선택하세요</option>{assignments.filter(a => ['PROPOSED', 'ACCEPTED'].includes(a.status)).map(a => <option key={a.id} value={a.id}>{itemFor(a)?.title ?? '돌봄'} · {member(a.assignee_id)}</option>)}</select><label className="form-label">요청 사유</label><textarea className="text-area" rows={3} value={emergencyReason} onChange={e => setEmergencyReason(e.target.value)} /><button className="outline-button wide-button" disabled={emergencyVoiceBusy || plan !== 'PRO'} onClick={toggleEmergencyRecording}>{emergencyRecording ? '■ 녹음 끝내기' : emergencyVoiceBusy ? '음성 인식 중…' : '● 음성으로 사유 입력'}</button><Section>요청을 받을 가족</Section><p>{members.filter(m => m.id !== me?.member.id).map(m => m.name).join(' · ') || '참여 중인 다른 가족이 없어요'}</p></Card><button className="primary-button wide-button" disabled={!emergencyItem || plan !== 'PRO' || (me?.authenticated && me.member.role !== 'PARENT')} onClick={() => run(async () => { await send('/emergency-requests', 'POST', { assignment_id: emergencyItem, reason: emergencyReason.trim() }); const result = await api<{ requests: EmergencyRequest[] }>('/emergency-requests'); setEmergencyRequests(result.requests); setEmergencyItem('') }, '가족에게 긴급 요청을 보냈어요')}>{plan !== 'PRO' ? 'Pro 구독 필요' : '가족 전체에 도움 요청'}</button>{plan !== 'PRO' && <button className="text-link centered" onClick={() => go('plan')}>플랜 확인하기</button>}
    <Section>요청 현황</Section>{emergencyRequests.length ? emergencyRequests.map(r => { const original = boot.assignments.find(a => a.id === r.assignment_id); const canClaim = r.status === 'OPEN' && me?.member.id !== r.requested_by_member_id && me?.member.id !== original?.assignee_id; const canCancel = r.status === 'OPEN' && (me?.member.id === r.requested_by_member_id || !!me?.member.is_owner); return <Card key={r.id} className="urgent-card"><span className={'small-badge ' + (r.status === 'OPEN' ? 'danger' : 'ok')}>{r.status === 'OPEN' ? '도움 대기' : r.status === 'CLAIMED' ? '담당 확정' : '취소됨'}</span><strong>{r.item_title}</strong><p>{r.reason}</p>{r.claimed_by_member_id && <p>새 담당 · {member(r.claimed_by_member_id)}</p>}{canClaim && <button className="primary-button wide-button" onClick={() => run(async () => { await send('/emergency-requests/' + r.id + '/claim', 'POST'); setEmergencyRequests((await api<{ requests: EmergencyRequest[] }>('/emergency-requests')).requests) }, '새 담당자로 확정됐어요')}>제가 맡을게요</button>}{canCancel && <button className="outline-button wide-button" onClick={() => run(async () => { await send('/emergency-requests/' + r.id + '/cancel', 'POST'); setEmergencyRequests((await api<{ requests: EmergencyRequest[] }>('/emergency-requests')).requests) }, '긴급 요청을 취소했어요')}>요청 취소</button>}</Card> }) : <Empty title="진행 중인 긴급 요청이 없어요" text="요청이 생기면 이곳에서 응답할 수 있어요" />}</>
  if (boot && screen === 'location') page = <><div className="eyebrow">돌봄 동선</div><h2 className="hero-title">지금 어디쯤<br />오고 있나요?</h2><p className="hero-copy">인수인계된 위치와 이동 시간을 한눈에 확인해요.</p><div className="map-panel"><div className="map-road one" /><div className="map-road two" /><span className="map-pin school">학교</span><span className="map-pin academy">태권도</span><span className="map-pin home">집</span><span className="map-route" /></div><Card className="route-card"><strong>학교 → 태권도</strong><p>할머니와 이동 중 · 10분 후 도착 예정</p><div className="route-progress"><span /></div></Card><button className="outline-button wide-button" onClick={() => go('lockscreen')}>잠금화면 이동 현황 미리보기</button><p className="helper-text centered">정확한 좌표 대신 이동 단계와 예상 도착 시간만 가족에게 보여줘요.</p></>
  if (boot && screen === 'gap') page = <><div className="eyebrow">돌봄 공백 살펴보기 <Pro /></div><h2 className="hero-title">담당자가 없는 일을<br />미리 살펴봐요</h2><p className="hero-copy">등록된 일정과 배정을 비교해 아직 담당자가 없는 시간을 먼저 찾아요.</p>{boot.items.filter(i => i.status === 'CONFIRMED' && !assignments.some(a => a.item_id === i.id)).map(i => <button key={i.id} className="family-alert" onClick={() => openSuggestion(i)}><span className="small-badge danger">배정 필요</span><strong>{i.title} · {child(i.child_id)}</strong><span>›</span></button>)}<Section>다음 준비</Section><div className="family-menu-list"><button onClick={() => go('schedule')}>가족 일정 등록<span>›</span></button><button onClick={() => go('assignments')}>담당 배정 확인<span>›</span></button><button onClick={() => go('programs')}>지원 제도 살펴보기<span>›</span></button></div></>
  if (boot && screen === 'album') page = <AlbumPage plan={plan} busy={albumBusy} groups={albumGroups} selectedDate={albumFolder} onUpload={files => void addAlbumPhotos(files)} onSelect={openAlbumPhoto} onOpenFolder={setAlbumFolder} onBackFolders={() => setAlbumFolder('')} onPlan={() => go('plan')} />
  if (boot && screen === 'programs') page = <ProgramsPage plan={plan} keyword={benefitKeyword} city={benefitCity} district={benefitDistrict} savedLocation={benefitLocation} busy={benefitsBusy} locationBusy={benefitLocationBusy} programs={benefits} institutions={careInstitutions} eligibility={eligibilityCriteria} active={activeBenefit} onKeyword={setBenefitKeyword} onCity={setBenefitCity} onDistrict={setBenefitDistrict} onSaveLocation={() => void saveBenefitLocation()} onSearch={() => void searchBenefits()} onSelect={setProgramSelected} onPlan={() => go('plan')} />

  if (screen === 'onboarding' && !invitationFromUrl && onboardStep === 'ROOM' && devLoginOptions.length > 0) page = <>{page}<Card className="dev-login-card"><span className="small-badge danger">TEST LOGIN</span><strong>테스트 사용자로 바로 입장</strong><p>개발 중에만 표시되며 원하는 가족 구성원 권한으로 확인할 수 있어요.</p><div className="dev-login-list">{devLoginOptions.map(option => <button key={option.member_id} disabled={onboardBusy} onClick={() => void loginForTest(option.member_id)}><span>{option.family_name}</span><strong>{option.member_name}{option.is_owner ? ' · 주돌봄자' : ''}</strong></button>)}</div></Card></>
  if (boot && screen === 'members' && me?.authenticated && !me.member.is_owner) page = <>{page}<Section>가족 초대</Section><Card className="form-card invite-share-card"><p>모든 가족 구성원이 여러 번 사용할 수 있는 초대 링크를 만들어 공유할 수 있어요. Free는 구성원 3명까지예요.</p>{inviteCode && <><div className="invite-code"><strong>{inviteCode}</strong><small>만료: {formatDate(inviteExpiresAt)}</small></div><label className="form-label">초대할 가족의 역할</label><select className="form-control" value={inviteRole} onChange={e => setInviteRole(e.target.value)}><option value="PARENT">부모</option><option value="GRANDPARENT">조부모</option><option value="CAREGIVER">돌봄 참여자</option></select><input className="invite-link" aria-label="가족방 초대 링크" value={inviteLink} readOnly /><button className="kakao-share wide-button" onClick={() => void shareInvite('kakao')}>카카오톡으로 공유하기</button></>}<button className="outline-button wide-button" onClick={() => run(async () => { const result = await send<{ invite_code: string; invite_expires_at: string }>('/families/invite-code/rotate', 'POST'); setInviteCode(result.invite_code); setInviteExpiresAt(result.invite_expires_at) }, '새 초대 링크를 만들었어요')}>{inviteCode ? '초대 링크 새로 만들기' : '초대 링크 만들기'}</button></Card></>

  const isRoot = rootScreens.includes(screen)
  const showChrome = !!boot && !['onboarding', 'scheduleOnboarding', 'thinq', 'serviceLoading', 'lockscreen'].includes(screen)
  const showInviteNav = !!boot && screen === 'onboarding' && !invitationFromUrl && onboardStep === 'INVITE'
  const showTabHeader = showChrome && isRoot
  const showStatus = !['thinq', 'serviceLoading', 'lockscreen', 'plan'].includes(screen)
  const showBack = showChrome && !isRoot && screen !== 'chat' && screen !== 'plan'
  const backTarget: Screen = ['capture', 'review', 'family', 'calendar'].includes(screen) ? 'schedule'
    : ['assignments', 'suggestion', 'tasks', 'exception', 'emergency', 'location'].includes(screen) ? 'careHub'
      : ['members', 'permissions', 'album'].includes(screen) ? 'familyHub'
        : ['notifications', 'settings', 'gap', 'album', 'programs', 'plan'].includes(screen) ? 'more' : 'home'
  return <div className="app-shell"><aside className="screen-index"><div className="brand"><span className="brand-mark">LG</span><div><strong>Family Care</strong><small>기능 목업 개발 버전</small></div></div><p className="index-intro">Figma 기능 페이지의 주요 흐름을 화면별로 확인할 수 있어요.</p>{groups.map(g => <div key={g.title} className="index-group"><h2>{g.title}</h2>{g.pages.map(([id, label]) => <button key={id} className={screen === id ? 'active' : ''} onClick={() => go(id)}>{label}</button>)}</div>)}</aside>
    <div className="phone-wrap"><div className="phone">
      {showStatus && <MobileStatusBar />}
      {showTabHeader && <AppHeader screen={screen} familyName={boot.family.name} memberName={me?.member.name ?? ''} profileImage={profileForMember(me?.member.id ?? viewer)} profileOnline={memberIsOnline(me?.member.id ?? viewer)} contextLine={`${today} · ${boot.children.map(c => c.name).join(' · ') || '아이 등록 전'}`} unread={unread} onNavigate={go} onOpenThinQHomes={openThinQHomes} />}
      <main ref={contentRef} className={'phone-content ' + (['thinq', 'serviceLoading', 'lockscreen'].includes(screen) ? 'edge-to-edge ' : '') + (screen === 'schedule' ? 'calendar-content ' : '') + (screen === 'chat' ? 'chat-content ' : '') + (screen === 'plan' ? 'plan-content' : '')}>{showBack && <button className="inline-back" aria-label="이전 메뉴로 돌아가기" onClick={() => go(backTarget)}>← 이전</button>}{page}</main>
      {showChrome && !['chat', 'plan'].includes(screen) && <FloatingAssistant onOpen={() => go('chat')} />}
      {(showChrome || showInviteNav) && !['chat', 'plan'].includes(screen) && <BottomNav screen={showInviteNav ? 'home' : screen} onNavigate={go} />}
      {showTabHeader && thinqSelector && <ThinQHomeSelector hasFamily familyName={boot.family.name} onClose={() => setThinqSelector(false)} onSelectThinQHome={() => { setThinqSelector(false); go('thinq') }} onSelectFamily={() => setThinqSelector(false)} onStartOnboarding={startFamilyOnboarding} />}
    </div>{error && <div className="error-toast" role="alert"><button aria-label="닫기" onClick={() => setError('')}>×</button>{error}</div>}{toast && <div className="success-toast" role="status">{toast}</div>}</div>
    {selectedAlbumPhoto && <AlbumLightbox photo={selectedAlbumPhoto} deleting={albumDeleteBusy} onClose={() => history.back()} onDelete={() => void deleteAlbumPhoto(selectedAlbumPhoto)} />}
    {scheduleSheet === 'DAY' && boot && <div className="schedule-overlay" onClick={() => setScheduleSheet('NONE')}><section className="schedule-day-sheet" onClick={e => e.stopPropagation()}><header><div><small>선택한 날짜</small><h2>{new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(selectedDate + 'T12:00:00'))}</h2></div><button aria-label="날짜 일정 닫기" onClick={() => setScheduleSheet('NONE')}>×</button></header><div className="day-sheet-events">{boot.schedules.filter(s => dateKey(s.starts_at) === selectedDate && personalScheduleVisible(s.member_id)).map(s => <Card key={s.id} className="calendar-event personal"><i style={{ background: caregiverColor(s.member_id) }} /><time>{formatTime(s.starts_at)}</time><div><strong>{s.title}</strong><p>{member(s.member_id)} · {s.kind === 'WORK' ? '업무 일정' : '고정 루틴'}</p></div><span className={'caregiver-pill ' + (s.member_id === me?.member.id ? 'self' : '')}>{s.member_id === me?.member.id ? '나' : '돌봄자'}</span>{s.member_id === me?.member.id && !s.external_source && <button className="schedule-row-edit" onClick={() => openPersonalScheduleEdit(s)}>수정</button>}</Card>)}{filteredChildSchedules.filter(s => dateKey(s.starts_at) === selectedDate).map(s => { const caregiver = caregiverForChildSchedule(s.id); return <Card key={s.id} className="calendar-event"><i style={{ background: childColor(s.child_id) }} /><time>{formatTime(s.starts_at)}</time><div><strong>{s.title}</strong><p>{child(s.child_id)} · {childScheduleLabel[s.category] ?? '아이 일정'}</p></div><span className={'caregiver-pill ' + (caregiver?.status === 'ACCEPTED' ? 'confirmed' : '')}>{caregiver ? `${caregiver.status === 'ACCEPTED' ? '담당' : '요청 중'} · ${caregiver.name}` : '미배정'}</span>{me?.authenticated && <button className="schedule-row-edit" onClick={() => openChildScheduleEdit(s)}>수정</button>}</Card> })}{filteredCareSchedules.filter(i => dateKey(i.starts_at!) === selectedDate).map(i => { const caregiver = caregiverForCareItem(i.id); return <Card key={i.id} className="calendar-event"><i style={{ background: childColor(i.child_id) }} /><time>{formatTime(i.starts_at)}</time><div><strong>{i.title}</strong><p>{child(i.child_id)} · 알림장</p></div><span className={'caregiver-pill ' + (caregiver?.status === 'ACCEPTED' ? 'confirmed' : '')}>{caregiver ? `${caregiver.status === 'ACCEPTED' ? '담당' : '요청 중'} · ${caregiver.name}` : '미배정'}</span></Card> })}{calendarEventsFor(selectedDate).length === 0 && <Empty title="등록된 일정이 없어요" text="아래 + 버튼으로 이 날의 일정을 추가해보세요" />}</div><button className="day-add-button" aria-label="선택한 날짜에 일정 추가" onClick={() => { setScheduleSheet('NONE'); openScheduleRegistration() }}>＋</button></section></div>}
    {scheduleSheet === 'ADD_MENU' && boot && <div className="sheet-overlay schedule-quick-overlay" onClick={() => setScheduleSheet('NONE')}><section className="schedule-quick-menu" role="dialog" aria-modal="true" aria-label="일정 등록 방식 선택" onClick={event => event.stopPropagation()} data-figma-node="702:2203"><button className="schedule-quick-close" aria-label="등록 메뉴 닫기" onClick={() => setScheduleSheet('NONE')}>＋</button><div className="schedule-add-options"><button onClick={() => { setScheduleEntryMode('SINGLE'); setScheduleSheet('CHOOSER') }}><span><strong>일정 등록하기</strong><small>오늘 새롭게 추가된 일정이 있다면 등록해주세요</small></span></button><button onClick={() => { openNewScheduleForm(boot.children.length ? 'CHILD' : 'PERSONAL', 'REPEAT'); if (boot.children[0]) setChildScheduleChild(boot.children[0].id) }}><span><strong>루틴 설정하기</strong><small>주기적인 일정이 있다면 루틴으로 등록해주세요</small></span></button></div></section></div>}
    {scheduleSheet === 'CHOOSER' && <BottomSheet className="schedule-chooser" onDismiss={() => setScheduleSheet('ADD_MENU')}><h2>누구의 일정인가요?</h2><p>등록할 일정의 주인을 먼저 선택해주세요.</p><div className="schedule-owner-options"><button onClick={() => openNewScheduleForm('CHILD')}><i>아</i><strong>아이</strong><small>학원·학교·방과후 일정</small></button><button onClick={() => openNewScheduleForm('PERSONAL')}><i>나</i><strong>본인</strong><small>운동·업무·개인 일정</small></button></div><button className="text-link centered" onClick={() => setScheduleSheet('ADD_MENU')}>돌아가기</button></BottomSheet>}
    {scheduleSheet === 'FORM' && boot && !editingSchedule && scheduleEntryMode === 'SINGLE' && <div className="single-schedule-overlay"><section className="single-schedule-screen" role="dialog" aria-modal="true" aria-label="일정 등록" data-figma-node="460:3102">
      <header><button aria-label="일정 등록 닫기" onClick={() => setScheduleSheet('CHOOSER')}>×</button><strong>일정 등록</strong><span>{scheduleForm === 'CHILD' ? child(childScheduleChild) : '본인'}</span></header>
      <div className="single-schedule-context">{scheduleForm === 'CHILD' ? <><label><span>대상</span><select value={childScheduleChild} onChange={event => setChildScheduleChild(event.target.value)}>{boot.children.map(childItem => <option key={childItem.id} value={childItem.id}>{childItem.name}</option>)}</select></label><label><span>종류</span><select value={childScheduleCategory} onChange={event => setChildScheduleCategory(event.target.value)}><option value="ACADEMY">학원</option><option value="AFTER_SCHOOL">방과후</option><option value="SCHOOL">학교</option><option value="ACTIVITY">활동</option><option value="OTHER">기타</option></select></label></> : <label><span>종류</span><select value={scheduleKind} onChange={event => setScheduleKind(event.target.value as 'WORK' | 'ROUTINE')}><option value="ROUTINE">개인 일정</option><option value="WORK">업무 일정</option></select></label>}</div>
      <div className="single-schedule-card">
        <label className="single-title"><span>내용</span><input value={scheduleTitle} onChange={event => setScheduleTitle(event.target.value)} placeholder={scheduleForm === 'CHILD' ? '예: 현장학습, 치과 진료' : '예: 팀 워크숍'} /></label>
        <label className="single-date"><span>날짜</span><input aria-label="일정 날짜" type="date" value={scheduleDate} onChange={event => setScheduleDate(event.target.value)} /></label>
        <div className="single-time direct-time"><label><span>시작</span><input aria-label="일정 시작 시간" inputMode="numeric" placeholder="09:00" value={scheduleStartTime} onChange={event => setScheduleStartTime(event.target.value.replace(/[^\d:]/g, '').slice(0, 5))} onBlur={() => { const normalized = normalizeClock(scheduleStartTime); if (normalized) setScheduleStartTime(normalized) }} /></label><label><span>종료</span><input aria-label="일정 종료 시간" inputMode="numeric" placeholder="없으면 비워두기" value={scheduleEndTime} onChange={event => setScheduleEndTime(event.target.value.replace(/[^\d:]/g, '').slice(0, 5))} onBlur={() => { const normalized = normalizeClock(scheduleEndTime); if (normalized) setScheduleEndTime(normalized) }} /></label></div>
      </div>
      <div className={'single-collision ' + (schedulePreviewCollision ? 'danger' : 'safe')}><strong>{schedulePreviewCollision ? '가족 일정과 시간이 겹쳐요' : '겹치는 가족 일정이 없어요'}</strong>{schedulePreviewCollision ? <><b>{formatTime(schedulePreviewCollision.startsAt)} {schedulePreviewCollision.title}</b><p>저장하면 대체 담당자를 바로 찾아드릴게요.</p></> : <p>현재 등록된 가족 일정 기준입니다.</p>}</div>
      {scheduleForm === 'PERSONAL' && <button className="single-work-toggle" onClick={() => setScheduleKind(value => value === 'WORK' ? 'ROUTINE' : 'WORK')}><span><strong>업무 일정으로 등록</strong><small>가족 일정 충돌 확인에만 사용</small></span><i className={'switch ' + (scheduleKind === 'WORK' ? 'on' : '')}><span /></i></button>}
      <button className="single-schedule-save" aria-label="이 일정 등록" onClick={saveSchedule}>저장</button>
    </section></div>}
    {scheduleSheet === 'FORM' && boot && !editingSchedule && scheduleEntryMode === 'REPEAT' && <div className="routine-screen-overlay"><section className="routine-screen" role="dialog" aria-modal="true" aria-label="루틴 등록" data-figma-node="557:1551">
      <header className="routine-header"><strong>루틴 등록</strong><button aria-label="루틴 등록 닫기" onClick={() => setScheduleSheet('NONE')}>×</button></header>
      <div className="routine-form-card">
        <label className="routine-name"><span>루틴 이름</span><input value={scheduleTitle} onChange={event => setScheduleTitle(event.target.value)} placeholder={scheduleForm === 'CHILD' ? '예: 태권도, 방과후 미술' : '예: 헬스, 오전 회의'} /></label>
        <fieldset className="routine-target"><legend>대상 자녀</legend><div><button className={scheduleForm === 'PERSONAL' ? 'active' : ''} onClick={() => setScheduleForm('PERSONAL')}>본인</button>{boot.children.map(childItem => <button key={childItem.id} className={scheduleForm === 'CHILD' && childScheduleChild === childItem.id ? 'active' : ''} onClick={() => { setScheduleForm('CHILD'); setChildScheduleChild(childItem.id) }}>{childItem.name}</button>)}</div></fieldset>
        <fieldset className="routine-repeat"><legend>반복 주기</legend><div className="routine-repeat-tabs"><button className={scheduleRepeatMode === 'WEEKLY' ? 'active' : ''} onClick={() => { setScheduleRepeat(true); setScheduleRepeatMode('WEEKLY') }}>요일</button><button className={scheduleRepeatMode === 'INTERVAL' ? 'active' : ''} onClick={() => { setScheduleRepeat(true); setScheduleRepeatMode('INTERVAL') }}>N일마다</button><button className={scheduleRepeatMode === 'MONTHLY' ? 'active' : ''} onClick={() => { setScheduleRepeat(true); setScheduleRepeatMode('MONTHLY') }}>월간</button><button className={scheduleRepeatMode === 'DATES' ? 'active' : ''} onClick={() => { setScheduleRepeat(true); setScheduleRepeatMode('DATES') }}>특정일</button></div>
          {scheduleRepeatMode === 'WEEKLY' && <div className="weekday-picker routine-weekdays">{[['일', 6], ['월', 0], ['화', 1], ['수', 2], ['목', 3], ['금', 4], ['토', 5]].map(([label, day]) => <button key={label} className={scheduleRepeatDays.includes(day as number) ? 'active' : ''} onClick={() => { const value = day as number; setScheduleRepeat(true); setScheduleRepeatDays(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]) }}>{label}</button>)}</div>}
          {scheduleRepeatMode === 'INTERVAL' && <label className="routine-number-option">매 <input aria-label="반복 간격" type="number" min="1" max="366" value={scheduleRepeatInterval} onChange={event => setScheduleRepeatInterval(Math.min(366, Math.max(1, Number(event.target.value) || 1)))} />일마다</label>}
          {scheduleRepeatMode === 'MONTHLY' && <label className="routine-number-option">매월 <input aria-label="매월 반복일" type="number" min="1" max="31" value={scheduleRepeatMonthDay} onChange={event => setScheduleRepeatMonthDay(Math.min(31, Math.max(1, Number(event.target.value) || 1)))} />일</label>}
          {scheduleRepeatMode === 'DATES' && <div className="routine-specific-dates"><div><input aria-label="특정 반복일" type="date" value={scheduleRepeatDateInput} onChange={event => setScheduleRepeatDateInput(event.target.value)} /><button onClick={() => { if (scheduleRepeatDateInput) setScheduleRepeatDates(current => [...new Set([...current, scheduleRepeatDateInput])].sort()) }}>추가</button></div><p>{scheduleRepeatDates.map(value => <button key={value} aria-label={`${value} 삭제`} onClick={() => setScheduleRepeatDates(current => current.filter(item => item !== value))}>{value.slice(5).replace('-', '/')} ×</button>)}</p></div>}
        </fieldset>
        <div className="routine-time-row"><strong>시간</strong><div className="routine-time-fields direct-time"><input aria-label="시작 시간" inputMode="numeric" placeholder="09:00" value={scheduleStartTime} onChange={event => setScheduleStartTime(event.target.value.replace(/[^\d:]/g, '').slice(0, 5))} onBlur={() => { const normalized = normalizeClock(scheduleStartTime); if (normalized) setScheduleStartTime(normalized) }} /><span>–</span><input aria-label="종료 시간" inputMode="numeric" placeholder="없으면 비워두기" value={scheduleEndTime} onChange={event => setScheduleEndTime(event.target.value.replace(/[^\d:]/g, '').slice(0, 5))} onBlur={() => { const normalized = normalizeClock(scheduleEndTime); if (normalized) setScheduleEndTime(normalized) }} /></div></div>
        <div className="routine-period-row"><div><strong>기간 정하기</strong><small>학기 단위로 끝나는 루틴</small></div><button className={'switch ' + (scheduleRepeat ? 'on' : '')} role="switch" aria-checked={scheduleRepeat} aria-label="매주 반복" onClick={() => setScheduleRepeat(value => !value)}><span /></button></div>
        {scheduleRepeat && scheduleRepeatMode !== 'DATES' && <div className="routine-date-range"><label><span>시작일</span><input aria-label="반복 시작일" type="date" value={scheduleDate} onChange={event => setScheduleDate(event.target.value)} /></label><b>→</b><label><span>반복 종료일</span><input aria-label="반복 종료일" type="date" value={scheduleRepeatUntil} onChange={event => setScheduleRepeatUntil(event.target.value)} /></label></div>}
        <button className="routine-save" aria-label={scheduleRepeat ? '고정 루틴 일괄 등록' : '이 일정 등록'} onClick={saveSchedule}>저장하기</button>
      </div>
    </section></div>}
    {scheduleSheet === 'FORM' && boot && editingSchedule && <BottomSheet className="schedule-form-sheet" onDismiss={() => setScheduleSheet('DAY')}><h2>{scheduleForm === 'CHILD' ? '아이 일정 수정' : '내 일정 수정'}</h2><p className="schedule-edit-help">반복 일정이어도 선택한 날짜의 일정 한 건만 변경돼요.</p>{scheduleForm === 'CHILD' ? <><label className="form-label">아이 이름 (필수)</label><select className="form-control" value={childScheduleChild} onChange={event => setChildScheduleChild(event.target.value)}>{boot.children.map(childItem => <option key={childItem.id} value={childItem.id}>{childItem.name}</option>)}</select></> : <><label className="form-label">일정 종류</label><select className="form-control" value={scheduleKind} onChange={event => setScheduleKind(event.target.value as 'WORK' | 'ROUTINE')}><option value="ROUTINE">개인 루틴·운동</option><option value="WORK">업무 일정</option></select></>}<label className="form-label">일정 이름</label><input className="form-control" value={scheduleTitle} onChange={event => setScheduleTitle(event.target.value)} placeholder={scheduleForm === 'CHILD' ? '예: 태권도, 방과후 미술' : '예: 헬스, 오전 회의'} /><ScheduleTimeFields date={scheduleDate} start={scheduleStartTime} end={scheduleEndTime} onDate={setScheduleDate} onStart={setScheduleStartTime} onEnd={setScheduleEndTime} /><button className="primary-button wide-button" onClick={saveSchedule}>수정 내용 저장</button><button className="schedule-delete-button wide-button" onClick={deleteSchedule}>이 일정 삭제</button><button className="text-link centered" onClick={() => setScheduleSheet('DAY')}>이전</button></BottomSheet>}
    {showSheet && <BottomSheet className="completion-sheet" onDismiss={() => setShowSheet(false)}><h2>특이사항이 있었나요?</h2><p>여기서 남긴 내용이 다음 돌봄자에게 자동으로 인수인계돼요.</p><label className="form-label">특이사항</label><textarea className="text-area" rows={4} value={note} onChange={e => setNote(e.target.value)} placeholder="수기로 입력하거나 아래에서 말해주세요. 없으면 빈칸도 괜찮아요." /><button className="outline-button wide-button" disabled={completionVoiceBusy} onClick={toggleCompletionRecording}>{completionRecording ? '■ 녹음 끝내기' : completionVoiceBusy ? '음성 인식 중…' : '● 음성 녹음'}</button><label className="form-label">완료 사진 (선택)</label><input ref={completionCameraInputRef} className="hidden-capture-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e => { selectCompletionPhoto(e.currentTarget.files?.[0]); e.currentTarget.value = '' }} /><input ref={completionPhotoInputRef} className="hidden-capture-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { selectCompletionPhoto(e.currentTarget.files?.[0]); e.currentTarget.value = '' }} />{completionPreview && <div className="completion-preview"><img src={completionPreview} alt="선택한 완료 사진" /><button onClick={() => { setCompletionPhoto(null); setCompletionPreview('') }}>×</button></div>}<div className="completion-photo-actions"><button className="outline-button" disabled={plan !== 'PRO'} onClick={() => completionCameraInputRef.current?.click()}>사진 촬영</button><button className="outline-button" disabled={plan !== 'PRO'} onClick={() => completionPhotoInputRef.current?.click()}>앨범에서 선택</button></div>{plan !== 'PRO' && <button className="text-link centered" onClick={() => { setShowSheet(false); go('plan') }}>완료 사진은 Pro에서 사용할 수 있어요</button>}<button className="primary-button wide-button" disabled={completionVoiceBusy || completionRecording} onClick={complete}>완료하고 인수인계하기</button><button className="text-link centered" onClick={() => setShowSheet(false)}>돌아가기</button></BottomSheet>}
  </div>
}

export default App
