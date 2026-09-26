import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { api, send, upload, setFamilyToken, hasFamilyToken, trackPerformanceEvent, ApiError, formatDate, formatTime, type Assignment, type Bootstrap, type CareItem, type Child, type Screen, type Suggestion, type FamilyMe, type FamilySession, type ChatAnswer, type EmergencyRequest, type CalendarConnection, type Notice, type Handoff, type AlbumPhoto, type Benefit, type BenefitLocation, type CareInstitution, type EligibilityCriteria, type BillingConfig, type BillingOrder, type ChatCard, type DeviceAlertsResponse, type DeviceAlertTestResult } from './api'
import { speechMessageFor } from './deviceAlertShared'
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
import otherRoleIcon from '../../asset/가족방만들기온보딩/그외의역할.png'
import inviteKakaoIcon from '../../asset/가족방만들기온보딩/KakaoIcon.png'
import inviteMessageIcon from '../../asset/가족방만들기온보딩/말풍선.png'
import inviteLinkIcon from '../../asset/가족방만들기온보딩/🔗.png'
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
import lockIcon from '../../asset/잠금.png'
import familySettingsUiIcon from '../../asset/아이콘/가족설정_web.png'
import familyAlbumUiIcon from '../../asset/아이콘/패밀리앨범.png'
import informationUiIcon from '../../asset/아이콘/정보공개_web.png'
import notificationsUiIcon from '../../asset/아이콘/알림함_web.png'
import notificationSettingsUiIcon from '../../asset/아이콘/알림설정_web.png'
import careGapUiIcon from '../../asset/아이콘/돌봄공백예측_web.png'
import careProgramUiIcon from '../../asset/아이콘/돌봄제도.png'
import deviceAlertPriorityUiIcon from '../../asset/아이콘/가전알림우선순위.png'
import planPaymentUiIcon from '../../asset/아이콘/플랜결제_web.png'
import proCharacter from '../../asset/프로안내화면/프로캐릭터.png'
import proPlanBadge from '../../asset/프로안내화면/프로플랜.png'
import proMonthlyOffer from '../../asset/프로안내화면/7900한달.png'
import proAnnualOffer from '../../asset/프로안내화면/76000연간.png'
import proComparisonAsset from '../../asset/프로안내화면/무료차이설명.png'
import memberActiveIcon from '../../asset/구성원프로필/활동중.png'
import memberInactiveIcon from '../../asset/구성원프로필/활동중아님.png'
import { AppHeader, BottomNav, FloatingAssistant, MobileStatusBar } from './components/AppChrome'
import { LockscreenPreview, ServiceLoading, ThinQEntry, ThinQHomeSelector } from './components/EntryScreens'
import { BottomSheet, Card, Empty, Pro, Section } from './components/ui'
import { setupNativeNotifications, showNativeNotice, syncPushToken, updateLiveCareStatus, clearLiveCareStatus } from './nativeNotifications'

const nativeCalendarReturnUrl = 'com.lgdx.family://calendar'

const groups: { title: string; pages: [Screen, string][] }[] = [
  { title: 'ThinQ 진입 · 외부 화면', pages: [['thinq', 'ThinQ 홈'], ['lockscreen', '잠금화면 동선']] },
  { title: '서비스 탭', pages: [['home', '홈'], ['careHub', '케어'], ['schedule', '일정'], ['familyHub', '가족'], ['more', '더보기']] },
  { title: '돌봄 정보', pages: [['family', '알림장·돌봄 정보'], ['capture', '알림장 등록'], ['review', '추출 결과 확인'], ['supplies', '준비물 확인'], ['homework', '숙제 확인'], ['assignments', '오늘의 배정'], ['assignmentDetail', '배정 상세'], ['suggestion', '배정 제안'], ['tasks', '오늘 할 일']] },
  { title: '돌봄 흐름', pages: [['schedule', '개인 일정'], ['exception', '예외 상황'], ['notifications', '알림함']] },
  { title: '가족 · 설정', pages: [['onboarding', '온보딩'], ['calendar', '캘린더 연동'], ['members', '가족 구성원'], ['childProfile', '아이 프로필 수정'], ['permissions', '정보 공개 권한'], ['album', '모음ZIP'], ['settings', '알림 설정'], ['plan', '플랜 비교']] },
  { title: '확장 화면', pages: [['chat', 'AI 채팅'], ['emergency', '긴급 요청'], ['gap', '돌봄 공백 예측'], ['programs', '돌봄 제도'], ['deviceAlerts', '가전 알림 우선순위']] },
]
const typeLabel: Record<string, string> = { SCHEDULE: '일정', SUPPLY: '준비물', TODO: '할 일', CHANGE: '변경사항', HOMEWORK: '숙제' }
const childScheduleLabel: Record<string, string> = { ACADEMY: '학원', SCHOOL: '학교', AFTER_SCHOOL: '방과후', ACTIVITY: '활동', OTHER: '기타' }
const roleLabel: Record<string, string> = { PARENT: '부모', GRANDPARENT: '조부모', CAREGIVER: '돌봄 참여자' }
const chatScreenLabel: Partial<Record<Screen, string>> = { schedule: '캘린더 보기', calendar: '캘린더 연동 보기', supplies: '준비물 확인', homework: '숙제 확인', tasks: '내 할 일 보기', assignments: '담당 배정 보기', assignmentDetail: '배정 상세 보기', notifications: '알림함 보기', members: '가족 구성원 보기', album: '모음ZIP 보기', programs: '돌봄 제도 보기', plan: '플랜 보기', home: '홈으로 가기', careHub: '케어 보기', familyHub: '가족 설정 보기', settings: '설정 보기' }
type PolicyKind = 'TERMS' | 'PRIVACY'
const policyContent: Record<PolicyKind, { title: string; notice: string; sections: { title: string; body: string }[] }> = {
  TERMS: {
    title: '서비스 이용약관',
    notice: '베타 서비스용 초안 · 시행일 2026년 9월 25일',
    sections: [
      { title: '1. 목적', body: '이 약관은 ZIPPY가 제공하는 가족 일정·돌봄 관리, 역할 배정, 알림, AI 도우미 및 연결 기능의 이용 조건과 권리·의무를 정합니다.' },
      { title: '2. 서비스 내용', body: '이용자는 가족방을 만들거나 초대로 참여하고, 아이·가족 일정, 준비물, 돌봄 요청·응답·인수인계를 공유할 수 있습니다. Google·Microsoft 캘린더, 알림, 결제 및 AI 기능은 이용자가 선택한 경우에만 제공됩니다.' },
      { title: '3. 가족방과 계정 관리', body: '초대 링크와 접속 수단을 타인에게 양도하면 안 됩니다. 주돌봄자는 구성원을 초대·해제하고 배정을 확정할 수 있으며, 구성원은 자신이 입력하거나 공유한 정보의 정확성을 확인해야 합니다.' },
      { title: '4. AI 및 추천 기능', body: 'OCR, 음성 인식, 일정 정리, 담당자 추천 결과는 보조 정보입니다. 중요한 일정과 배정은 이용자가 원문과 비교해 확인해야 하며, 서비스가 사람의 최종 판단을 대신하지 않습니다.' },
      { title: '5. 유료 서비스', body: '유료 플랜의 기간, 금액, 자동 갱신 여부 및 해지 조건은 결제 화면에 표시됩니다. 청약철회·환불은 관련 법령과 결제사 정책을 따르며, 개발자 미리보기 플랜은 실제 결제가 아닙니다.' },
      { title: '6. 제한·중단 및 책임', body: '보안, 점검, 통신망 장애, 외부 서비스 오류 또는 부정 이용 방지를 위해 일부 기능이 일시 제한될 수 있습니다. ZIPPY는 고의·중대한 과실이 없는 한 외부 서비스 장애나 이용자가 확인하지 않은 입력·추천 결과에 대해 책임을 지지 않습니다.' },
      { title: '7. 탈퇴·데이터 삭제', body: '구성원은 가족방을 나갈 수 있고, 주돌봄자는 가족방을 삭제할 수 있습니다. 삭제 시 관련 정보는 원칙적으로 파기하되, 법령상 보존 의무가 있는 결제·분쟁 기록은 해당 기간 분리 보관됩니다.' },
      { title: '8. 약관 변경·문의', body: '중요한 변경은 적용 전 앱 내에서 알립니다. 현재는 베타 단계이며, 운영자 상호·대표자·주소·연락처·통신판매 정보는 정식 출시 전 확정하여 고지해야 합니다.' },
    ],
  },
  PRIVACY: {
    title: '개인정보 처리방침',
    notice: '베타 서비스용 초안 · 시행일 2026년 9월 25일',
    sections: [
      { title: '1. 처리 목적', body: '가족방 구성원 확인, 공유 일정·돌봄 배정·알림 제공, 캘린더 동기화, AI·OCR·음성 기능, 사진 보관, 결제·구독, 안정적인 서비스 운영을 위해 필요한 정보를 처리합니다.' },
      { title: '2. 처리하는 항목', body: '필수·서비스 생성 정보: 가족방, 구성원 이름·역할, 아이 이름·나이/기관, 일정, 돌봄 항목·배정·인수인계·알림, 접속 세션. 선택 정보: 프로필·알림장·완료 사진, 음성·AI 질문, 푸시 토큰, 관심 지역, 결제 기록, 외부 캘린더 일정과 OAuth 연결 토큰.' },
      { title: '3. 보유 기간', body: '원칙적으로 가족방 삭제, 구성원 탈퇴, 연동 해제 또는 처리 목적 달성 시 지체 없이 파기합니다. 다만 전자상거래 관련 법령이 적용되는 경우 표시·광고 6개월, 계약·청약철회 5년, 대금결제·서비스 공급 5년, 소비자 불만·분쟁 3년간 분리 보관할 수 있습니다.' },
      { title: '4. 가족 구성원 공개', body: '가족방에 초대된 구성원은 권한 범위에서 일정과 돌봄 정보를 볼 수 있습니다. 개인·업무 일정 제목은 기본 비공개이며, 이용자가 정보 공개 설정을 켠 경우에만 제목이 보입니다. 꺼두면 시간과 ‘바쁨’ 여부만 공개됩니다.' },
      { title: '5. 외부 서비스·위탁', body: '이용자가 해당 기능을 선택할 때 Google·Microsoft(캘린더 인증·동기화), AI·음성·OCR 제공사(내용 분석), 토스페이먼츠(결제), 푸시·브라우저 알림 제공사가 정보를 처리할 수 있습니다. 정식 출시 전 수탁자, 국외 이전 국가·일시·방법과 거부 방법을 실제 계약에 맞게 확정해 별도 고지해야 합니다.' },
      { title: '6. 정보주체의 권리', body: '이용자와 법정대리인은 앱의 가족 설정·정보 공개에서 일부 정보를 조회·정정·변경하고, 가족방 나가기·삭제 및 캘린더 연동 해제를 요청할 수 있습니다. 법령상 예외를 제외하고 열람·정정·삭제·처리정지 요구를 접수해야 합니다.' },
      { title: '7. 파기·안전성 확보', body: '보유 기간이 끝난 정보는 복구하기 어려운 방법으로 삭제하고, 법령상 보존 정보는 다른 정보와 분리합니다. 접근권한 제한, 전송 보호, 접속기록 관리 등 필요한 보호조치를 적용해야 합니다.' },
      { title: '8. 아동 정보', body: '만 14세 미만 아동의 정보는 보호자가 가족 돌봄을 위해 입력하는 구조입니다. 보호자는 필요한 최소 정보만 입력하고 공유 권한을 정기적으로 확인해야 합니다.' },
      { title: '9. 책임자·고충처리', body: '현재는 베타 단계입니다. 개인정보 보호책임자의 성명, 전화번호, 이메일과 열람청구 접수 부서는 정식 출시 전 확정하여 고지해야 합니다. 권익침해 상담은 개인정보침해신고센터(118) 등 공식 구제 기관을 이용할 수 있습니다.' },
    ],
  },
}
type ChatMessage = { from: 'me' | 'agent'; text: string; cards?: ChatCard[] }
type EditingSchedule = { type: 'PERSONAL' | 'CHILD'; id: string }
type ReviewDraft = { title: string; itemType: string; startsAt: string }
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
type OnboardChild = { name: string; ageLabel: string; photo: File | null }
type KakaoSdk = {
  init: (key: string) => void
  isInitialized: () => boolean
  Share: { sendDefault: (options: { objectType: 'text'; text: string; link: { mobileWebUrl: string; webUrl: string }; buttonTitle: string }) => Promise<unknown> }
}
declare global { interface Window { Kakao?: KakaoSdk } }
const memberProfileColors = ['#a9cbed', '#b4d99d', '#dfcdad', '#d8b2ea', '#f1b1be', '#9fd8d1', '#f2c58f', '#aeb8e8']
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
const compactChatTimes = (value: string) => {
  const clock = (iso: string) => {
    const parsed = new Date(iso)
    if (Number.isNaN(parsed.getTime())) return iso
    const hour = parsed.getHours()
    const minute = parsed.getMinutes()
    return minute ? `${hour}시 ${minute}분` : `${hour}시`
  }
  const isoPattern = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:?\\d{2})?'
  return value
    .replace(new RegExp(`(${isoPattern})\\s*(?:~|〜|–|—|부터)\\s*(${isoPattern})`, 'g'), (_match, start, end) => `${clock(start)}~${clock(end)}`)
    .replace(new RegExp(isoPattern, 'g'), match => clock(match))
}
const visibleCareItemDetail = (detail: string | null | undefined) => {
  const value = detail?.trim() ?? ''
  if (!value) return ''
  // Schedule metadata is stored for matching, but it is not user-facing copy.
  if (/^(ACADEMY|SCHOOL|AFTER_SCHOOL|ACTIVITY|OTHER)\s*·\s*\d{4}-\d{2}-\d{2}T/.test(value)) return ''
  return value
}

function ScheduleTimeFields({ date, start, end, onDate, onStart, onEnd }: {
  date: string; start: string; end: string
  onDate: (value: string) => void; onStart: (value: string) => void; onEnd: (value: string) => void
}) {
  return <><label className="form-label">날짜</label><input className="form-control" type="date" value={date} onChange={event => onDate(event.target.value)} /><div className="time-pair direct-time"><label><span>시작 시간</span><input className="form-control" type="time" step="60" value={start} onChange={event => onStart(event.target.value)} /></label><label><span>종료 시간 (선택)</span><input className="form-control" type="time" step="60" value={end} onChange={event => onEnd(event.target.value)} /></label></div><p className="time-input-help">퇴근처럼 한 시점의 일정은 종료 시간을 비워두세요.</p></>
}
function AlbumPage({ plan, busy, groups, selectedDate, onUpload, onSelect, onOpenFolder, onBackFolders, onPlan }: {
  plan: string; busy: boolean; groups: [string, AlbumPhoto[]][]; selectedDate: string
  onUpload: (files: File[]) => void; onSelect: (photo: AlbumPhoto) => void
  onOpenFolder: (date: string) => void; onBackFolders: () => void; onPlan: () => void
}) {
  const selected = groups.find(([date]) => date === selectedDate)
  const selectedPhotos = selected?.[1] ?? []
  const dateLabel = (date: string) => new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(date + 'T12:00:00'))
  return <><div className="eyebrow">모음ZIP <Pro /></div><h2 className="hero-title one-line">가족의 순간을 날짜별로 모아요</h2><p className="hero-copy">직접 올린 사진과 돌봄 완료 사진을 날짜 폴더로 나눠 저장하고 함께 봐요.</p>{plan === 'PRO' ? <><label className="album-upload">{busy ? '저장 중…' : '＋ 사진 선택'}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={event => { onUpload(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = '' }} /></label>{selectedDate ? <section className="album-folder-view"><button className="album-folder-back" onClick={onBackFolders}>‹ 날짜 폴더</button><Section>{dateLabel(selectedDate)}</Section><small className="album-folder-path">폴더 · {selectedPhotos[0]?.date_folder ?? selectedDate.replaceAll('-', '/')} · 사진 {selectedPhotos.length}장</small><div className="album-grid">{selectedPhotos.map(photo => <button key={photo.id} onClick={() => onSelect(photo)}><img src={photo.data_url} alt={photo.caption || photo.file_name} /><small>{photo.kind === 'CARE_COMPLETION' ? '돌봄 완료 · ' : ''}{photo.caption || photo.file_name}</small></button>)}</div>{!selectedPhotos.length && <Empty title="이 폴더에 사진이 없어요" text="날짜 폴더 목록으로 돌아가 다른 날짜를 선택해주세요" />}</section> : <><Section>날짜 폴더</Section><div className="album-folder-list">{groups.map(([date, photos]) => <button className="album-folder-card" key={date} onClick={() => onOpenFolder(date)}><span className="album-folder-icon">◆</span><span><strong>{dateLabel(date)}</strong><small>{photos.length}장 · {photos[0]?.date_folder ?? date.replaceAll('-', '/')}</small></span><span className="album-folder-preview">{photos.slice(0, 3).map(photo => <img key={photo.id} src={photo.data_url} alt="" />)}</span><b>›</b></button>)}</div>{!groups.length && <Empty title="아직 사진이 없어요" text="사진을 올리거나 돌봄 완료 때 사진을 남겨보세요" />}</>}</> : <button className="primary-button wide-button" onClick={onPlan}>Pro에서 모음ZIP 사용</button>}</>
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

  return <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label="사진 크게 보기" onClick={onClose}><div className="photo-lightbox-panel" onClick={event => event.stopPropagation()}><button className="photo-lightbox-close" aria-label="사진 닫기" onClick={onClose}>×</button><img src={photo.data_url} alt={photo.caption || photo.file_name} /><div className="photo-lightbox-info"><strong>{photo.caption || photo.file_name}</strong><small>{formatDate(photo.created_at)} · {photo.kind === 'CARE_COMPLETION' ? '돌봄 완료 사진' : '모음ZIP'}</small><div className="photo-lightbox-actions"><button className="primary-button" disabled={saveMode === 'loading'} onClick={savePhoto}>{saveMode === 'loading' ? '사진 준비 중…' : saveMode === 'share' ? '사진 앱에 저장' : '사진 다운로드'}</button>{photo.can_delete && <button className="photo-delete-button" disabled={deleting} onClick={onDelete}>{deleting ? '삭제 중…' : '사진 삭제'}</button>}</div>{saveMode === 'share' && <small className="photo-save-hint">iPhone에서는 공유 메뉴에서 ‘이미지 저장’을 눌러주세요.</small>}</div></div></div>
}

function ProgramsPage({ plan, keyword, city, district, savedLocation, busy, locationBusy, programs, institutions, eligibility, active, onKeyword, onCity, onDistrict, onSaveLocation, onSearch, onSelect, onPlan }: {
  plan: string; keyword: string; city: string; district: string; savedLocation: BenefitLocation; busy: boolean; locationBusy: boolean
  programs: Benefit[]; institutions: CareInstitution[]; eligibility: EligibilityCriteria | null; active?: Benefit
  onKeyword: (value: string) => void; onCity: (value: string) => void; onDistrict: (value: string) => void
  onSaveLocation: () => void; onSearch: (keyword?: string) => void; onSelect: (id: string) => void; onPlan: () => void
}) {
  const [locationEditorOpen, setLocationEditorOpen] = useState(false)
  const scopeLabel = (program: Benefit) => program.scope === 'DISTRICT' ? savedLocation.district + ' 사업' : program.scope === 'CITY' ? savedLocation.city + ' 사업' : '전국 공통'
  const hasLocation = !!savedLocation.city && !!savedLocation.district
  const currency = (value: number) => new Intl.NumberFormat('ko-KR').format(value) + '원'
  const households = eligibility ? [...new Set(eligibility.household_income.map(row => row.household_size))].sort((a, b) => a - b) : []
  const incomeFor = (size: number, percent: number) => eligibility?.household_income.find(row => row.household_size === size && row.median_percent === percent)?.monthly_income
  const dataDate = eligibility?.data_date?.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')
  const featured = programs[0]
  const shareBenefit = (program: Benefit) => {
    const text = `${program.name}\n${program.summary}\n${program.url || ''}`.trim()
    if (navigator.share) void navigator.share({ title: program.name, text }).catch(() => undefined)
    else void navigator.clipboard?.writeText(text)
  }
  const selectKeyword = (value: string) => {
    onKeyword(value)
    onSearch(value)
  }
  const selectProgram = (id: string) => {
    setLocationEditorOpen(false)
    onSelect(id)
  }
  const locationForm = <Card className="benefit-location benefit-location-editor">
    <strong>검색 지역 변경</strong>
    <div className="benefit-location-fields">
      <label><span>시·도</span><input className="form-control" aria-label="혜택 지역 시·도" value={city} onChange={event => onCity(event.target.value)} /></label>
      <label><span>시·군·구</span><input className="form-control" aria-label="혜택 지역 시·군·구" value={district} onChange={event => onDistrict(event.target.value)} /></label>
    </div>
    <button className="outline-button wide-button" disabled={locationBusy || !city.trim() || !district.trim()} onClick={() => { onSaveLocation(); setLocationEditorOpen(false) }}>{locationBusy ? '지역 확인 중…' : '지역 변경하고 다시 찾기'}</button>
  </Card>

  return <>
    <div className="care-feature-heading"><strong>돌봄 제도</strong><Pro /></div>
    {plan !== 'PRO' ? <button className="primary-button wide-button" onClick={onPlan}>Pro에서 돌봄 제도 검색</button> : !hasLocation ? <><h2 className="hero-title">우리 지역 돌봄 제도를<br />맞춤으로 찾아드려요</h2><p className="hero-copy">상세 주소 없이 시·도와 시·군·구만 저장합니다.</p><Card className="benefit-location"><strong>내 돌봄 정보 검색 지역</strong><div className="benefit-location-fields"><label><span>시·도</span><input className="form-control" aria-label="혜택 지역 시·도" value={city} onChange={event => onCity(event.target.value)} /></label><label><span>시·군·구</span><input className="form-control" aria-label="혜택 지역 시·군·구" value={district} onChange={event => onDistrict(event.target.value)} /></label></div><button className="primary-button wide-button" disabled={locationBusy || !city.trim() || !district.trim()} onClick={onSaveLocation}>{locationBusy ? '지역 확인 중…' : '이 지역으로 찾기'}</button></Card></> : <section className="figma-benefits-page">
      <div className="benefit-filter-pills" role="group" aria-label="돌봄 제도 검색 조건">
        <button className={locationEditorOpen ? 'active' : ''} aria-pressed={locationEditorOpen} onClick={() => setLocationEditorOpen(value => !value)}>{savedLocation.district || savedLocation.city} ▾</button>
        <button className={keyword === '맞벌이' ? 'active' : ''} aria-pressed={keyword === '맞벌이'} onClick={() => selectKeyword('맞벌이')}>맞벌이</button>
        <button className={keyword === '가족돌봄' ? 'active' : ''} aria-pressed={keyword === '가족돌봄'} onClick={() => selectKeyword('가족돌봄')}>가족돌봄</button>
      </div>
      {locationEditorOpen && locationForm}
      {!active && featured && <><div className="benefit-deadline"><b>D-{featured.deadline ? '5' : '추천'}</b><strong>{featured.deadline ? `${featured.name} 신청 일정을 확인해주세요` : `${featured.name}이 우리 가족 조건과 잘 맞아요`}</strong></div><Card className="featured-benefit"><header><strong>{featured.name}</strong>{featured.deadline && <em>{featured.deadline}</em>}</header><h2>{featured.category || '돌봄 지원'}</h2><p>{featured.summary || featured.target}</p><button className="primary-button wide-button" onClick={() => selectProgram(featured.id)}>신청서류 자동 준비</button><button className="benefit-share-button" onClick={() => shareBenefit(featured)}>가족에게 요약 보내기</button></Card></>}
      {!active && institutions[0] && <Card className="featured-institution"><header><strong>{institutions[0].name}</strong><small>상시</small></header><h3>{institutions[0].service_area || '지역 돌봄 연계'}</h3><p>{institutions[0].address}</p>{(institutions[0].direct_phone || institutions[0].phone) && <a href={'tel:' + (institutions[0].direct_phone || institutions[0].phone)}>전화 문의</a>}</Card>}
      {active && <Card className="benefit-detail"><span className={'program-scope ' + active.scope.toLowerCase()}>{scopeLabel(active)}</span><h3>{active.name}</h3><p className="benefit-summary">{active.summary}</p>{active.target && <div className="benefit-copy-block"><strong>지원 대상</strong><p>{active.target}</p></div>}{active.content && <div className="benefit-copy-block"><strong>지원 내용</strong><p>{active.content}</p></div>}{active.criteria && <div className="benefit-copy-block"><strong>선정 기준</strong><p>{active.criteria}</p></div>}{active.deadline && <div className="benefit-copy-block"><strong>신청 기한</strong><p>{active.deadline}</p></div>}{active.method && <div className="benefit-copy-block"><strong>신청 방법</strong><p>{active.method}</p></div>}{active.contact && <div className="benefit-copy-block"><strong>문의</strong><p>{active.contact}</p></div>}{active.url && <a className="primary-button benefit-official-link" href={active.url} target="_blank" rel="noreferrer">공식 상세 보기</a>}<button className="outline-button wide-button" onClick={() => selectProgram('')}>목록으로</button></Card>}
      {!active && <details className="benefit-more"><summary>조건과 전체 제도 보기</summary>{!locationEditorOpen && locationForm}<form className="benefit-search" onSubmit={event => { event.preventDefault(); onSearch() }}><input className="form-control" aria-label="돌봄 혜택 검색어" value={keyword} onChange={event => onKeyword(event.target.value)} placeholder="예: 돌봄, 아이돌봄, 보육" /><button className="primary-button" disabled={busy || !keyword.trim()}>{busy ? '검색 중…' : '검색'}</button></form>{programs.slice(1).map(program => <button key={program.id} className="program-choice" onClick={() => selectProgram(program.id)}><span><em className={'program-scope ' + program.scope.toLowerCase()}>{scopeLabel(program)}</em><strong>{program.name}</strong><small>{program.organization} · {program.category}</small></span><b>›</b></button>)}{eligibility && <Card className="eligibility-card"><div className="eligibility-heading"><strong>{eligibility.year || '공개'}년 소득 기준</strong><small>갱신 {dataDate || '확인 필요'}</small></div><div className="criteria-scroll"><table><thead><tr><th>가구원</th><th>75%</th><th>120%</th><th>150%</th></tr></thead><tbody>{households.map(size => <tr key={size}><th>{size}인</th>{[75, 120, 150].map(percent => <td key={percent}>{incomeFor(size, percent) ? currency(incomeFor(size, percent)!) : '—'}</td>)}</tr>)}</tbody></table></div></Card>}</details>}
      {!busy && !active && !programs.length && <Empty title="이 지역의 검색 결과가 없어요" text="조건과 전체 제도 보기에서 다른 검색어를 입력해보세요" />}
      <p className="benefit-bottom-note">조건을 바꾸면 해당하는 제도만 다시 추려드립니다.</p>
    </section>}
  </>
}

function App() {
  const initialQuery = new URLSearchParams(location.search)
  const requestedScreen = initialQuery.get('screen')
  const debugScreen = groups.flatMap(group => group.pages).find(([id]) => id === requestedScreen)?.[0]
  const invitationFromUrl = initialQuery.get('invite')?.trim().toUpperCase() ?? ''
  const roleFromUrl = initialQuery.get('role')?.trim().toUpperCase() ?? ''
  const billingResultFromUrl = initialQuery.get('payment') ?? initialQuery.get('billing') ?? ''
  const calendarResultFromUrl = initialQuery.get('calendar') ?? ''
  const invitedRole = ['PARENT', 'GRANDPARENT', 'CAREGIVER'].includes(roleFromUrl) ? roleFromUrl : 'CAREGIVER'
  const [boot, setBoot] = useState<Bootstrap | null>(null)
  const [me, setMe] = useState<FamilyMe | null>(null)
  const [screen, setScreen] = useState<Screen>(() => invitationFromUrl ? 'onboarding' : debugScreen ?? (hasFamilyToken() && billingResultFromUrl ? 'plan' : hasFamilyToken() && initialQuery.has('calendar') ? 'calendar' : 'thinq'))
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [calendarResult, setCalendarResult] = useState(calendarResultFromUrl)
  const [noticeScope, setNoticeScope] = useState<'mine' | 'family'>('mine')
  const [filter, setFilter] = useState('all')
  const [viewer, setViewer] = useState('mom')
  const [itemId, setItemId] = useState<string | null>(null)
  const [assignmentId, setAssignmentId] = useState<string | null>(null)
  const [handoffId, setHandoffId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [reviewTitle, setReviewTitle] = useState('')
  const [reviewType, setReviewType] = useState('TODO')
  const [reviewStart, setReviewStart] = useState('')
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({})
  const [childProfileId, setChildProfileId] = useState('')
  const [childProfileName, setChildProfileName] = useState('')
  const [childProfileAge, setChildProfileAge] = useState('')
  const [captureText, setCaptureText] = useState('')
  const [captureChild, setCaptureChild] = useState('')
  const [captureFile, setCaptureFile] = useState<File | null>(null)
  const [captureSource, setCaptureSource] = useState<'CAMERA' | 'ALBUM'>('ALBUM')
  const [capturePreview, setCapturePreview] = useState('')
  const [captureTranscript, setCaptureTranscript] = useState('')
  const [captureFromPhoto, setCaptureFromPhoto] = useState(false)
  const [captureBusy, setCaptureBusy] = useState(false)
  const [homeworkChild, setHomeworkChild] = useState('')
  const [homeworkTitle, setHomeworkTitle] = useState('')
  const [homeworkDate, setHomeworkDate] = useState('')
  const [editingHomeworkId, setEditingHomeworkId] = useState('')
  const [editHomeworkTitle, setEditHomeworkTitle] = useState('')
  const [editHomeworkDate, setEditHomeworkDate] = useState('')
  const [scheduleTitle, setScheduleTitle] = useState('')
  const [scheduleMember, setScheduleMember] = useState('mom')
  const [scheduleKind, setScheduleKind] = useState<'WORK' | 'ROUTINE'>('ROUTINE')
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toLocaleDateString('sv-SE'))
  const [scheduleStartTime, setScheduleStartTime] = useState('09:00')
  const [scheduleEndTime, setScheduleEndTime] = useState('')
  const [scheduleScope, setScheduleScope] = useState('all')
  const [careStatusChild, setCareStatusChild] = useState('')
  const [scheduleForm, setScheduleForm] = useState<'PERSONAL' | 'CHILD'>('CHILD')
  const [scheduleEntryMode, setScheduleEntryMode] = useState<'SINGLE' | 'REPEAT'>('SINGLE')
  const [scheduleSheet, setScheduleSheet] = useState<'NONE' | 'DAY' | 'ADD_MENU' | 'CHOOSER' | 'FORM'>('NONE')
  const [scheduleQuickAnchor, setScheduleQuickAnchor] = useState<{ top: number; left: number; width: number; height: number; phoneWidth: number } | null>(null)
  const [scheduleRepeat, setScheduleRepeat] = useState(false)
  const [scheduleRepeatMode, setScheduleRepeatMode] = useState<'WEEKLY' | 'INTERVAL' | 'MONTHLY' | 'DATES'>('WEEKLY')
  const [scheduleRepeatDays, setScheduleRepeatDays] = useState<number[]>([])
  const [scheduleRepeatUntil, setScheduleRepeatUntil] = useState('')
  const [scheduleRepeatInterval, setScheduleRepeatInterval] = useState(2)
  const [scheduleRepeatMonthDay, setScheduleRepeatMonthDay] = useState(new Date().getDate())
  const [scheduleRepeatDates, setScheduleRepeatDates] = useState<string[]>([])
  const [scheduleRepeatDateInput, setScheduleRepeatDateInput] = useState('')
  const [editingSchedule, setEditingSchedule] = useState<EditingSchedule | null>(null)
  const [recurrenceEditPrompt, setRecurrenceEditPrompt] = useState(false)
  const [recurrenceEditScope, setRecurrenceEditScope] = useState<'SINGLE' | 'FUTURE'>('SINGLE')
  const [recurrenceDeletePrompt, setRecurrenceDeletePrompt] = useState(false)
  const [recurrenceDeleteScope, setRecurrenceDeleteScope] = useState<'SINGLE' | 'FUTURE'>('SINGLE')
  const [weeklyTimetableOpen, setWeeklyTimetableOpen] = useState(false)
  const [scheduleReturnToWeekly, setScheduleReturnToWeekly] = useState(false)
  const [weeklyTimetableChild, setWeeklyTimetableChild] = useState('')
  const [patternSuggestionOpen, setPatternSuggestionOpen] = useState(false)
  const [childScheduleChild, setChildScheduleChild] = useState('')
  const [childScheduleCategory, setChildScheduleCategory] = useState('ACADEMY')
  const [childScheduleLocation, setChildScheduleLocation] = useState('')
  const [addingChildScheduleLocation, setAddingChildScheduleLocation] = useState(false)
  const [routineStartAssignee, setRoutineStartAssignee] = useState('')
  const [routineStartExternalName, setRoutineStartExternalName] = useState('')
  const [routineEndAssignee, setRoutineEndAssignee] = useState('')
  const [routineEndExternalName, setRoutineEndExternalName] = useState('')
  const [routineMergePrompt, setRoutineMergePrompt] = useState<{ location: string; start: string; end: string } | null>(null)
  const [timelineNow, setTimelineNow] = useState(() => Date.now())
  const [selectedDate, setSelectedDate] = useState(() => new Date().toLocaleDateString('sv-SE'))
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [calendarConnections, setCalendarConnections] = useState<CalendarConnection[]>([])
  const [calendarPrivacyPromptOpen, setCalendarPrivacyPromptOpen] = useState(false)
  const [calendarPrivacyBusy, setCalendarPrivacyBusy] = useState(false)
  const [kakaoJavaScriptKey, setKakaoJavaScriptKey] = useState('')
  const [memberNameInput, setMemberNameInput] = useState('')
  const [familyNameInput, setFamilyNameInput] = useState('')
  const [memberRole, setMemberRole] = useState('GRANDPARENT')
  const [note, setNote] = useState('')
  const [showSheet, setShowSheet] = useState(false)
  const [policyOpen, setPolicyOpen] = useState<PolicyKind | null>(null)
  const [alternative, setAlternative] = useState('grandma')
  const [reason, setReason] = useState('일정이 겹쳐 다른 담당자가 필요해요')
  const [onboardMode, setOnboardMode] = useState<'create' | 'join'>(() => invitationFromUrl ? 'join' : 'create')
  const [onboardStep, setOnboardStep] = useState<OnboardingStep>('ROOM')
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
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false)
  const [devLoginOptions, setDevLoginOptions] = useState<DevLoginOption[]>([])
  const [childNameInput, setChildNameInput] = useState('')
  const [childAgeInput, setChildAgeInput] = useState('')
  const [childPhotoInput, setChildPhotoInput] = useState<File | null>(null)
  const [childPhotoPreview, setChildPhotoPreview] = useState('')
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
  const [emergencyDeselected, setEmergencyDeselected] = useState<Set<string>>(new Set())
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null)
  const [planBusy, setPlanBusy] = useState(false)
  const [billingBusy, setBillingBusy] = useState(false)
  const [billingOpen, setBillingOpen] = useState(false)
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY')
  const [proGateFeature, setProGateFeature] = useState('')
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
  const [deviceAlertData, setDeviceAlertData] = useState<DeviceAlertsResponse | null>(null)
  const [deviceAlertStep, setDeviceAlertStep] = useState<'main' | 'devices' | 'priority' | 'content' | 'quiet' | 'test'>('main')
  const [deviceAlertDraftDevices, setDeviceAlertDraftDevices] = useState<string[]>([])
  const [deviceAlertDraftPriority, setDeviceAlertDraftPriority] = useState<string[]>([])
  const [deviceAlertTestResult, setDeviceAlertTestResult] = useState<DeviceAlertTestResult | null>(null)
  const [deviceAlertTestForceOff, setDeviceAlertTestForceOff] = useState(false)
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
  const calendarSyncHandledRef = useRef(false)
  const performanceOpenedFamilyRef = useRef('')
  const openNoticeRef = useRef<(notice: Notice) => Promise<void>>(async () => undefined)
  const tossWidgetsRef = useRef<TossWidgets | null>(null)

  const reportError = (failure: unknown) => {
    if (failure instanceof ApiError && failure.status === 401) {
      const hadToken = hasFamilyToken()
      setFamilyToken(null); setFamilySessionReady(false); setBoot(null); setMe(null); setOnboardStep('ROOM'); setScreen('thinq')
      history.replaceState({ ...history.state, lgdxScreen: 'thinq' }, '')
      setError(hadToken ? '가족방 세션이 만료됐어요. 다시 참가해주세요.' : '가족방을 만들거나 초대코드로 참가해주세요.')
    } else if (failure instanceof ApiError) {
      if (failure.code === 'SUBSCRIPTION_REQUIRED') {
        setProGateFeature('선택한 기능')
        return
      }
      const guide: Record<string, string> = {
        OCR_DAILY_LIMIT: '오늘의 무료 사진 OCR을 모두 사용했어요. 사진 선택을 취소하고 직접 입력해주세요.',
        CHAT_DAILY_LIMIT: '오늘의 AI 채팅 한도를 모두 사용했어요. 내일 다시 이용해주세요.',
        AI_NOT_CONFIGURED: '서버 AI 설정이 완료되지 않았어요. 백엔드 설정을 확인해주세요.',
        OPENAI_CREDITS_EXHAUSTED: 'AI 제공 계정의 크레딧이 부족해요. 백엔드 담당자에게 확인해주세요.',
      }
      setError(guide[failure.code ?? ''] ?? failure.message)
    } else setError((failure as Error).message)
  }
  const load = async () => {
    const requestedWithToken = hasFamilyToken()
    let nextMe: FamilyMe
    let nextBoot: Bootstrap
    try {
      ;[nextMe, nextBoot] = await Promise.all([api<FamilyMe>('/families/me'), api<Bootstrap>('/bootstrap')])
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 404 && !hasFamilyToken()) throw new ApiError('가족방을 만들거나 초대코드로 참가해주세요.', 401)
      if (!(failure instanceof ApiError) || failure.status !== 401 || !requestedWithToken) throw failure
      setFamilyToken(null)
      setFamilySessionReady(false)
      try {
        ;[nextMe, nextBoot] = await Promise.all([api<FamilyMe>('/families/me'), api<Bootstrap>('/bootstrap')])
      } catch (retryFailure) {
        if (retryFailure instanceof ApiError && retryFailure.status === 404) throw new ApiError('가족방을 만들거나 초대코드로 참가해주세요.', 401)
        throw retryFailure
      }
    }
    nextMe.member.is_owner = Boolean(nextMe.member.is_owner)
    nextBoot.members = nextBoot.members.map(item => ({ ...item, is_owner: Boolean(item.is_owner) }))
    setMe(nextMe); setBoot(nextBoot); setFamilyNameInput(nextBoot.family.name)
    setDeviceNoticeDemo(Boolean(nextBoot.notification_preferences.find(item => item.member_id === nextMe.member.id)?.device_enabled))
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
          setToast(`ZIPPY Pro 이용이 시작됐어요. 이용 종료일: ${formatDate(endAt)}`)
        })
        .catch(error => { cleanPaymentQuery(); reportError(error) })
        .finally(() => setBillingBusy(false))
    } else {
      void Promise.resolve().then(() => setError(query.get('message') || '결제가 취소되었어요.'))
      trackPerformanceEvent('payment_abandoned', { step_abandoned: 'payment_window' })
      cleanPaymentQuery()
    }
  }, [billingResultFromUrl])
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let listener: { remove: () => Promise<void> } | undefined
    let disposed = false
    const handleReturn = (url?: string) => {
      if (!url) return
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'com.lgdx.family:' || parsed.host !== 'calendar') return
        const result = parsed.searchParams.get('calendar') ?? ''
        if (!['google-connected', 'microsoft-connected'].includes(result)) return
        calendarSyncHandledRef.current = false
        setCalendarResult(result)
        setScreen('calendar')
        void Browser.close().catch(() => undefined)
      } catch { /* ignore unrelated app links */ }
    }
    void CapacitorApp.addListener('appUrlOpen', event => handleReturn(event.url)).then(handle => {
      if (disposed) void handle.remove()
      else listener = handle
    })
    void CapacitorApp.getLaunchUrl().then(result => handleReturn(result?.url))
    return () => { disposed = true; void listener?.remove() }
  }, [])
  useEffect(() => {
    const provider = calendarResult.replace(/-connected$/, '')
    if (!activeFamilyId || calendarSyncHandledRef.current || !['google', 'microsoft'].includes(provider)) return
    calendarSyncHandledRef.current = true
    send<{ imported: number }>(`/calendar-connections/${provider}/sync`, 'POST')
      .then(async result => {
        await load()
        setCalendarConnections((await api<{ connections: CalendarConnection[] }>('/calendar-connections')).connections)
        const query = new URLSearchParams(location.search)
        query.delete('calendar')
        history.replaceState(history.state, '', location.pathname + (query.size ? '?' + query : '') + location.hash)
        setToast(`${provider === 'google' ? 'Google' : 'Outlook'} 일정 ${result.imported}건을 동기화했어요`)
        setCalendarPrivacyPromptOpen(true)
      })
      .catch(reportError)
  }, [activeFamilyId, calendarResult])
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
    history.replaceState({ ...history.state, lgdxScreen: initialScreenRef.current, lgdxDepth: 0, lgdxDeviceAlertStep: undefined }, '')
    const handleBack = (event: PopStateEvent) => {
      setScheduleSheet('NONE'); setShowSheet(false); setSelectedAlbumPhoto(null)
      const target = event.state?.lgdxScreen as Screen | undefined
      if (target) {
        setError(''); setScreen(target)
        if (target === 'deviceAlerts') setDeviceAlertStep((event.state?.lgdxDeviceAlertStep as typeof deviceAlertStep | undefined) ?? 'main')
        return
      }
      const fallback: Screen = hasFamilyToken() ? 'home' : 'thinq'
      history.replaceState({ ...history.state, lgdxScreen: fallback, lgdxDepth: 0 }, '')
      setScreen(fallback)
    }
    addEventListener('popstate', handleBack)
    return () => removeEventListener('popstate', handleBack)
  }, [])
  useEffect(() => {
    api<{ kakao_javascript_key: string }>('/public-config')
      .then(config => setKakaoJavaScriptKey(config.kakao_javascript_key.trim()))
      .catch(() => setKakaoJavaScriptKey(''))
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
    if ((screen === 'emergency' || screen === 'home' || screen === 'careHub') && activeFamilyId) api<{ requests: EmergencyRequest[] }>('/emergency-requests')
      .then(result => setEmergencyRequests(result.requests)).catch(reportError)
    if ((screen === 'calendar' || screen === 'schedule') && activeFamilyId) api<{ connections: CalendarConnection[] }>('/calendar-connections')
      .then(result => setCalendarConnections(result.connections)).catch(reportError)
    if (screen === 'deviceAlerts' && activeFamilyId) api<DeviceAlertsResponse>('/device-alerts')
      .then(result => { setDeviceAlertData(result); setDeviceAlertDraftDevices(result.settings.devices); setDeviceAlertDraftPriority(result.settings.priority) }).catch(reportError)
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
  useEffect(() => {
    const timer = window.setInterval(() => setTimelineNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!deviceAlertTestResult) return
    const timer = setTimeout(() => setDeviceAlertTestResult(null), 4200)
    return () => clearTimeout(timer)
  }, [deviceAlertTestResult])
  useEffect(() => { contentRef.current?.scrollTo(0, 0) }, [screen])
  useEffect(() => {
    if (!activeFamilyId) return
    if (performanceOpenedFamilyRef.current !== activeFamilyId) {
      performanceOpenedFamilyRef.current = activeFamilyId
      trackPerformanceEvent('app_opened', { entry_screen: screen })
    }
    trackPerformanceEvent('screen_view', { screen })
    if (screen === 'plan' && boot?.family.plan !== 'PRO') {
      trackPerformanceEvent('pro_paywall_viewed', { entry_point: 'plan_screen' })
    }
  }, [activeFamilyId, screen, boot?.family.plan])
  useEffect(() => {
    if (!activeFamilyId) return
    const recordResume = () => {
      if (document.visibilityState === 'visible') {
        trackPerformanceEvent('app_opened', { entry_screen: screen, resumed: true })
      }
    }
    document.addEventListener('visibilitychange', recordResume)
    return () => document.removeEventListener('visibilitychange', recordResume)
  }, [activeFamilyId, screen])
  useEffect(() => {
    if (!proGateFeature || !activeFamilyId) return
    trackPerformanceEvent('limit_reached_screen_viewed', { feature: proGateFeature })
    trackPerformanceEvent('pro_paywall_viewed', { entry_point: 'feature_gate', feature: proGateFeature })
  }, [proGateFeature, activeFamilyId])
  useEffect(() => {
    if (screen !== 'serviceLoading') return
    let cancelled = false
    const timer = setTimeout(() => {
      void load().then(() => {
        if (cancelled) return
        history.replaceState({ ...history.state, lgdxScreen: 'home' }, '')
        setScreen('home')
      }).catch(reportError)
    }, 1120)
    return () => { cancelled = true; clearTimeout(timer) }
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
    const paidFeatureNames: Partial<Record<Screen, string>> = {
      emergency: '긴급 도움 요청', gap: '돌봄 공백 예측', programs: '돌봄 제도 안내', album: '모음ZIP', deviceAlerts: '가전 알림 우선순위',
    }
    if (boot?.family.plan !== 'PRO' && paidFeatureNames[target]) {
      setProGateFeature(paidFeatureNames[target]!)
      return
    }
    // lgdxDeviceAlertStep must never survive a jump to a different top-level screen —
    // otherwise it leaks forward through this spread into every later history entry
    // (including ones unrelated to deviceAlerts) and a later hardware/browser back
    // press can resurrect a stale sub-step instead of landing on that screen's own start.
    if (target !== screen) history.pushState({ ...history.state, lgdxScreen: target, lgdxDepth: Number(history.state?.lgdxDepth ?? 0) + 1, lgdxDeviceAlertStep: undefined }, '')
    setScreen(target)
    if (target === 'home') load().catch(reportError)
  }
  const navigateBack = (fallback: Screen) => {
    setError('')
    if (Number(history.state?.lgdxDepth ?? 0) > 0) {
      history.back()
      return
    }
    history.replaceState({ ...history.state, lgdxScreen: fallback, lgdxDepth: 0, lgdxDeviceAlertStep: undefined }, '')
    setScreen(fallback)
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
    setChildPhotoInput(null)
    setChildPhotoPreview('')
    go('onboarding')
  }
  const openScheduleRegistration = (target?: HTMLElement) => {
    const phone = target?.closest('.phone')?.getBoundingClientRect()
    const anchor = target?.getBoundingClientRect()
    setScheduleQuickAnchor(phone && anchor ? {
      top: anchor.top - phone.top,
      left: anchor.left - phone.left,
      width: anchor.width,
      height: anchor.height,
      phoneWidth: phone.width,
    } : null)
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
      const target = boot?.assignments.find(item => item.id === notice.action_id)
      setViewer(target?.assignee_id ?? me?.member.id ?? viewer)
      go('assignmentDetail')
    } else if (notice.action_type === 'ASSIGNMENT_RESULT') {
      setAssignmentId(notice.action_id ?? null)
      go(notice.action_id ? 'assignmentDetail' : 'assignments')
    } else if (notice.action_type === 'CARE_SUGGESTION' && notice.action_id) {
      const result = await api<{ item: CareItem; suggestions: Suggestion[] }>('/items/' + notice.action_id + '/suggestions')
      setItemId(result.item.id); setSuggestions(result.suggestions); go('suggestion')
    } else if (notice.action_type === 'HANDOFF') {
      setHandoffId(notice.action_id ?? null)
      if (me?.member.id) setViewer(me.member.id)
      go('tasks')
    } else if (notice.action_type === 'EMERGENCY_REQUEST') {
      go('emergency')
    } else if (notice.action_type === 'MEMBERS') {
      go('members')
    } else if (notice.action_type === 'CARE_REVIEW') {
      const target = boot?.items.find(item => item.intake_id === notice.action_id && item.status === 'NEEDS_REVIEW')
        ?? boot?.items.find(item => item.status === 'NEEDS_REVIEW')
      if (target) {
        setCaptureTranscript(''); setCaptureFromPhoto(false); setItemId(target.id)
        setReviewTitle(target.title); setReviewType(target.item_type); setReviewStart(localDateTime(target.starts_at))
        go('review')
      } else go('family')
    } else if (notice.action_type === 'EXCEPTION') {
      go('exception')
    } else if (notice.action_type === 'SCHEDULE') {
      go('schedule')
    } else if (/긴급/.test(notice.title)) {
      go('emergency')
    } else if (/배정|담당/.test(notice.title)) {
      go('assignments')
    } else if (/일정|캘린더/.test(notice.title)) {
      go('schedule')
    } else if (/초대|구성원|주돌봄자|권한/.test(notice.title)) {
      go('members')
    } else if (/알림장|돌봄 정보|들어온 정보|확인해/.test(notice.title)) {
      const target = boot?.items.find(item => item.status === 'NEEDS_REVIEW')
      if (target) {
        setCaptureTranscript(''); setCaptureFromPhoto(false); setItemId(target.id)
        setReviewTitle(target.title); setReviewType(target.item_type); setReviewStart(localDateTime(target.starts_at))
        go('review')
      } else go('family')
    } else if (/대안|충돌|예외/.test(notice.title)) {
      go('exception')
    } else go('home')
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
  useEffect(() => { openNoticeRef.current = openNotice })
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
  const selectChildPhoto = (file: File | undefined) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) { setError('8MB 이하 JPG, PNG, WebP 사진을 선택해주세요'); return }
    setError(''); setChildPhotoInput(file)
    const reader = new FileReader()
    reader.onload = () => setChildPhotoPreview(String(reader.result))
    reader.readAsDataURL(file)
  }
  const addOnboardChild = () => {
    if (!childNameInput.trim() || !childAgeInput.trim()) { setError('아이 이름과 나이·학교를 입력해주세요.'); return }
    setError('')
    setOnboardChildren(current => [...current, { name: childNameInput.trim(), ageLabel: childAgeInput.trim(), photo: childPhotoInput }])
    setChildNameInput(''); setChildAgeInput(''); setChildPhotoInput(null); setChildPhotoPreview('')
  }
  const saveOnboardChildren = async () => {
    if (onboardBusy) return
    const pending = [...onboardChildren]
    if (childNameInput.trim() || childAgeInput.trim()) {
      if (!childNameInput.trim() || !childAgeInput.trim()) { setError('작성 중인 아이의 이름과 나이·학교를 모두 입력해주세요.'); return }
      pending.push({ name: childNameInput.trim(), ageLabel: childAgeInput.trim(), photo: childPhotoInput })
    }
    setOnboardBusy(true); setError('')
    try {
      for (const childDraft of pending) {
        const created = await send<Child>('/children', 'POST', { name: childDraft.name, age_label: childDraft.ageLabel })
        if (childDraft.photo) {
          const form = new FormData(); form.append('file', childDraft.photo)
          await upload('/children/' + created.id + '/photo', form)
        }
      }
      setOnboardChildren([]); setChildNameInput(''); setChildAgeInput(''); setChildPhotoInput(null); setChildPhotoPreview('')
      await load()
      setOnboardStep('INVITE_SETUP')
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
    if (me.member.is_owner) return
    if (!confirm('이 가족방에서 나갈까요? 다시 들어오려면 새 초대 링크가 필요해요.')) return
    try { await send('/families/leave', 'POST'); resetFamilySession(); setToast('가족방에서 나왔어요') }
    catch (e) { reportError(e) }
  }
  const deleteFamily = async () => {
    if (!confirm('가족방과 구성원, 일정, 돌봄 기록을 모두 삭제할까요? 삭제한 내용은 되돌릴 수 없어요.')) return
    try {
      await send('/families', 'DELETE')
      resetFamilySession()
      setToast('가족방과 저장된 데이터를 삭제했어요.')
    } catch (e) { reportError(e) }
  }
  const transferOwnership = (targetMemberId: string, targetName: string) => {
    if (!confirm(`${targetName}님에게 주돌봄자 권한을 넘길까요? 이후 나는 일반 구성원으로 변경됩니다.`)) return
    void run(() => send('/members/' + targetMemberId + '/transfer-ownership', 'POST'), `${targetName}님에게 주돌봄자 권한을 넘겼어요`)
  }
  const plan = boot?.family.plan ?? 'FREE'
  const inviteLink = inviteCode ? (() => {
    const url = new URL(location.pathname, 'https://zippy.dx6project.site')
    url.searchParams.set('invite', inviteCode)
    url.searchParams.set('role', inviteRole)
    return url.toString()
  })() : ''
  const copyInvite = async () => {
    if (!inviteLink) return
    let copied = false
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(inviteLink); copied = true } catch { copied = false }
    }
    if (!copied) {
      const field = document.createElement('textarea')
      field.value = inviteLink; field.style.position = 'fixed'; field.style.opacity = '0'
      document.body.appendChild(field); field.select(); copied = document.execCommand('copy'); field.remove()
    }
    if (!copied) throw new Error('초대 링크를 복사하지 못했어요')
    setToast('초대 링크를 복사했어요.')
  }
  const shareInvite = async (target: 'kakao' | 'sms' | 'system' = 'kakao') => {
    if (!inviteLink) return
    const text = `${boot?.family.name ?? 'ZIPPY'} 가족방 초대 링크예요. 링크를 열고 이름을 입력해 참여해주세요.`
    try {
      if (target === 'sms') {
        location.href = `sms:?&body=${encodeURIComponent(`${text}\n${inviteLink}`)}`
        return
      }
      if (target === 'kakao') {
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
        if (isMobile && navigator.share) {
          await navigator.share({ title: boot?.family.name ?? 'ZIPPY 가족방', text, url: inviteLink })
          setToast('공유할 앱에서 카카오톡을 선택해주세요.')
          return
        }
        if (kakaoJavaScriptKey && window.Kakao) {
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
          await navigator.share({ title: boot?.family.name ?? 'ZIPPY 가족방', text, url: inviteLink })
          setToast('공유할 앱에서 카카오톡을 선택해주세요.')
          return
        }
        await copyInvite()
        setToast('카카오톡 공유를 열 수 없어 초대 링크를 복사했어요.')
        return
      }
      if (navigator.share) {
        await navigator.share({ title: boot?.family.name ?? 'ZIPPY 가족방', text, url: inviteLink })
        setToast('공유창을 열었어요.')
      } else {
        await copyInvite()
      }
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError') return
      if (target === 'kakao') {
        try {
          await copyInvite()
          setToast('공유창을 열 수 없어 초대 링크를 복사했어요.')
        } catch { setError('초대 링크를 복사하지 못했어요. 브라우저의 클립보드 권한을 확인해주세요.') }
        return
      }
      setError('공유창을 열지 못했어요. 잠시 후 다시 시도해주세요.')
    }
  }
  const openInviteShare = async () => {
    if (!me?.authenticated) { go('members'); return }
    setInviteSheetOpen(true)
    if (inviteCode) return
    try {
      const result = await send<{ invite_code: string; invite_expires_at: string }>('/families/invite-code/rotate', 'POST')
      setInviteCode(result.invite_code)
      setInviteExpiresAt(result.invite_expires_at)
    } catch (failure) {
      setInviteSheetOpen(false)
      reportError(failure)
    }
  }
  const members = boot?.members.filter(member => member.status === 'ACTIVE') ?? []
  const profileColorForMember = (targetMemberId: string) => {
    const index = (boot?.members.filter(item => item.status !== 'REMOVED').findIndex(item => item.id === targetMemberId) ?? 0)
    return memberProfileColors[Math.max(0, index) % memberProfileColors.length]
  }
  const memberIsOnline = (targetMemberId: string) => targetMemberId === me?.member.id || !!boot?.members.find(item => item.id === targetMemberId)?.is_online
  const member = (id: string) => boot?.members.find(m => m.id === id)?.name ?? '가족'
  const child = (id: string | null) => boot?.children.find(c => c.id === id)?.name ?? '가족'
  const hiddenMergedCareItemIds = useMemo(() => {
    const schedules = boot?.child_schedules ?? []
    const groups = new Map<string, typeof schedules>()
    schedules.forEach(schedule => {
      const location = (schedule.location_name ?? '').trim().toLocaleLowerCase()
      if (!location) return
      const day = new Date(schedule.starts_at).toLocaleDateString('sv-SE')
      const key = `${location}|${day}`
      groups.set(key, [...(groups.get(key) ?? []), schedule])
    })

    const hiddenStarts = new Set<string>()
    const hiddenEnds = new Set<string>()
    groups.forEach(group => {
      const ordered = [...group].sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime())
      const eligible = ordered.filter(schedule => schedule.merge_same_location !== false && schedule.merge_same_location !== 0 && !!schedule.has_end_time)
      const visited = new Set<string>()
      eligible.forEach(schedule => {
        if (visited.has(schedule.id)) return
        const component: typeof schedules = []
        const stack = [schedule]
        while (stack.length) {
          const current = stack.pop()!
          if (visited.has(current.id)) continue
          visited.add(current.id)
          component.push(current)
          const currentStart = new Date(current.starts_at).getTime()
          const currentEnd = new Date(current.ends_at).getTime()
          eligible.forEach(candidate => {
            if (visited.has(candidate.id)) return
            const candidateStart = new Date(candidate.starts_at).getTime()
            const candidateEnd = new Date(candidate.ends_at).getTime()
            const separation = Math.max(currentStart - candidateEnd, candidateStart - currentEnd, 0)
            if (candidate.child_id === current.child_id || separation <= 60 * 60_000) stack.push(candidate)
          })
        }
        if (component.length > 1) {
          const first = component.reduce((earliest, item) => new Date(item.starts_at).getTime() < new Date(earliest.starts_at).getTime() ? item : earliest)
          const last = component.reduce((latest, item) => new Date(item.ends_at).getTime() > new Date(latest.ends_at).getTime() ? item : latest)
          component.forEach(item => {
            if (item.id !== first.id) hiddenStarts.add(item.id)
            if (item.id !== last.id) hiddenEnds.add(item.id)
          })
        }
      })
    })

    const scheduleById = new Map(schedules.map(schedule => [schedule.id, schedule]))
    return new Set((boot?.items ?? []).filter(item => {
      if (!item.child_schedule_id) return false
      const schedule = scheduleById.get(item.child_schedule_id)
      if (!schedule) return false
      const boundary = item.boundary_type ?? (schedule.has_end_time && item.starts_at === schedule.ends_at ? 'END' : 'START')
      return boundary === 'START' ? hiddenStarts.has(schedule.id) : hiddenEnds.has(schedule.id)
    }).map(item => item.id))
  }, [boot])
  const visibleCareItems = useMemo(() => boot?.items.filter(item => !hiddenMergedCareItemIds.has(item.id)) ?? [], [boot, hiddenMergedCareItemIds])
  // boot.items/assignments keep growing as a family uses the app, and these lists feed
  // O(n) lookups (itemFor) used all over the render — memoized so typing in an unrelated
  // field elsewhere doesn't re-filter/re-scan them on every keystroke.
  const items = useMemo(() => visibleCareItems.filter(i => filter === 'all' || i.child_id === filter), [visibleCareItems, filter])
  const pending = items.filter(i => i.status === 'NEEDS_REVIEW')
  const assignments = useMemo(() => boot?.assignments.filter(a => !['CANCELED', 'REJECTED'].includes(a.status) && !hiddenMergedCareItemIds.has(a.item_id)) ?? [], [boot, hiddenMergedCareItemIds])
  const careViewerId = me?.authenticated ? me.member.id : viewer
  const viewerAssignments = useMemo(() => assignments.filter(a => a.assignee_id === careViewerId), [assignments, careViewerId])
  const itemFor = (a: Assignment | undefined) => a ? visibleCareItems.find(i => i.id === a.item_id) : undefined
  const activeAssignmentForItem = (careItemId: string) => {
    const priority: Record<string, number> = { COMPLETED: 4, ACCEPTED: 3, CANDIDATE_ACCEPTED: 2, PROPOSED: 1 }
    return assignments.filter(a => a.item_id === careItemId && a.status in priority)
      .toSorted((left, right) => priority[right.status] - priority[left.status])[0]
  }
  const confirmedAssignmentForItem = (careItemId: string) => assignments.find(a => a.item_id === careItemId && a.status === 'COMPLETED')
    ?? assignments.find(a => a.item_id === careItemId && a.status === 'ACCEPTED')
  const isLiveAssignment = (assignment?: Assignment) => {
    if (assignment?.status !== 'ACCEPTED') return false
    const careItem = itemFor(assignment)
    if (!careItem?.starts_at || careItem.status === 'DONE') return false
    const startsAt = new Date(careItem.starts_at).getTime()
    if (!Number.isFinite(startsAt)) return false
    const careDate = new Date(careItem.starts_at).toLocaleDateString('sv-SE')
    if (careDate !== new Date(timelineNow).toLocaleDateString('sv-SE')) return false
    const activeWindow = 30 * 60 * 1000
    return timelineNow >= startsAt - activeWindow && timelineNow <= startsAt + activeWindow
  }
  const caregiverForCareItem = (careItemId: string) => {
    const assignment = confirmedAssignmentForItem(careItemId)
    if (assignment) return { name: member(assignment.assignee_id), status: assignment.status }
    const externalName = visibleCareItems.find(item => item.id === careItemId)?.external_assignee_name?.trim()
    return externalName ? { name: externalName, status: 'EXTERNAL' } : null
  }
  const caregiverStatusLabel = (status: string) => status === 'EXTERNAL' ? '외부 담당' : status === 'COMPLETED' ? '완료' : status === 'ACCEPTED' ? '담당 확정' : status === 'PROPOSED' ? '수락 확인 중' : status === 'CANDIDATE_ACCEPTED' ? '최종 확인 중' : status === 'RECONFIRMATION_REQUIRED' ? '재배정 필요' : '요청 중'
  const activeItem = visibleCareItems.find(i => i.id === itemId) ?? null
  const activeAssignment = boot?.assignments.find(a => a.id === assignmentId) ?? null
  const activeChildProfile = boot?.children.find(item => item.id === childProfileId) ?? null
  const unread = boot?.notifications.filter(n => !n.is_read).length ?? 0
  const notificationMemberId = me?.member.id ?? viewer
  const preference = boot?.notification_preferences.find(p => p.member_id === notificationMemberId)
  const appNotices = !!(preference?.app_enabled ?? 1)
  const dailyDigest = !!(preference?.daily_digest_enabled ?? 1)
  useEffect(() => {
    if (!boot || !me?.authenticated) return
    const now = Date.now()
    const candidates = assignments
      .filter(item => !['COMPLETED', 'CANCELED', 'CANCELLED', 'REJECTED'].includes(item.status))
      .map(assignment => ({ assignment, item: visibleCareItems.find(item => item.id === assignment.item_id) }))
      .filter(candidate => candidate.item)
      .sort((left, right) => {
        const statusRank = (status: string) => status === 'ACCEPTED' ? 0 : 1
        const rankDiff = statusRank(left.assignment.status) - statusRank(right.assignment.status)
        if (rankDiff) return rankDiff
        const leftTime = left.item?.starts_at ? Math.abs(new Date(left.item.starts_at).getTime() - now) : Number.MAX_SAFE_INTEGER
        const rightTime = right.item?.starts_at ? Math.abs(new Date(right.item.starts_at).getTime() - now) : Number.MAX_SAFE_INTEGER
        return leftTime - rightTime
      })
    const active = candidates[0]?.assignment
    if (!active) {
      void clearLiveCareStatus()
      return
    }
    const careItem = visibleCareItems.find(item => item.id === active.item_id)
    const child = boot.children.find(item => item.id === careItem?.child_id)
    const caregiver = boot.members.find(item => item.id === active.assignee_id)
    const schedule = boot.child_schedules.find(item => item.id === careItem?.child_schedule_id)
    const statusText = isLiveAssignment(active) ? '돌봄 진행 중' : '돌봄 담당 확인 중'
    const currentPlace = schedule?.title ?? careItem?.title ?? '돌봄 시작'
    const route = `${currentPlace} → ${caregiver?.name ?? '담당자'} → 집`
    const progress = isLiveAssignment(active) ? 1 : 0
    void updateLiveCareStatus(
      `${child?.name ?? '아이'} · ${caregiver?.name ?? '담당자'}`,
      statusText,
      careItem?.title ?? '현재 돌봄 현황',
      route,
      progress,
    )
  }, [boot, me?.authenticated, timelineNow])
  useEffect(() => {
    void setupNativeNotifications(action => {
      window.dispatchEvent(new CustomEvent('family-care-notification-action', { detail: action }))
    })
  }, [])
  useEffect(() => {
    if (me?.authenticated) void syncPushToken()
  }, [me?.authenticated])
  useEffect(() => {
    const onNativeAction = (event: Event) => {
      const { actionType, actionId } = (event as CustomEvent<{ actionType?: string; actionId?: string }>).detail ?? {}
      window.focus()
      if (actionType === 'ASSIGNMENT_REQUEST' && actionId) {
        setAssignmentId(actionId); setViewer(me?.member.id ?? viewer)
        history.pushState({ ...history.state, lgdxScreen: 'tasks' }, ''); setScreen('tasks')
      } else if (actionType === 'ASSIGNMENT_RESULT') {
        setAssignmentId(actionId ?? null)
        history.pushState({ ...history.state, lgdxScreen: 'assignments' }, ''); setScreen('assignments')
      } else if (actionType === 'CARE_SUGGESTION' && actionId) {
        void api<{ item: CareItem; suggestions: Suggestion[] }>('/items/' + actionId + '/suggestions').then(result => {
          setItemId(result.item.id); setSuggestions(result.suggestions)
          history.pushState({ ...history.state, lgdxScreen: 'suggestion' }, ''); setScreen('suggestion')
        }).catch(reportError)
      } else if (actionType === 'HANDOFF') {
        setViewer(me?.member.id ?? viewer)
        history.pushState({ ...history.state, lgdxScreen: 'tasks' }, ''); setScreen('tasks')
      } else {
        history.pushState({ ...history.state, lgdxScreen: 'notifications' }, ''); setScreen('notifications')
      }
    }
    window.addEventListener('family-care-notification-action', onNativeAction)
    return () => window.removeEventListener('family-care-notification-action', onNativeAction)
  }, [me?.member.id, viewer])
  useEffect(() => {
    if (!activeFamilyId || !me?.authenticated) return
    const poll = async () => {
      try {
        const [next, emergencyResult] = await Promise.all([
          api<Bootstrap>('/bootstrap'),
          api<{ requests: EmergencyRequest[] }>('/emergency-requests'),
        ])
        const incoming = next.notifications.filter(notice => !notice.is_read && !seenNoticeIdsRef.current.has(notice.id))
        next.notifications.forEach(notice => seenNoticeIdsRef.current.add(notice.id))
        setBoot(next)
        setEmergencyRequests(emergencyResult.requests)
        if (appNotices) {
          incoming.forEach(notice => {
            void showNativeNotice(notice.id, notice.title, notice.body, notice.action_type, notice.action_id)
            if ('Notification' in window && Notification.permission === 'granted') {
              const systemNotice = new Notification(notice.title, { body: notice.body, tag: notice.id })
              systemNotice.onclick = () => { window.focus(); void openNoticeRef.current(notice); systemNotice.close() }
            }
          })
        }
      } catch (e) { reportError(e) }
    }
    const timer = setInterval(poll, 2_000)
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
  const connectedCalendarCount = calendarConnections.filter(connection => connection.connected).length
  const todayKey = dateKey(new Date())
  const todayCare = visibleCareItems.filter(i => !i.child_schedule_id && i.starts_at && dateKey(i.starts_at) === todayKey && i.item_type !== 'SUPPLY' && i.item_type !== 'HOMEWORK')
  const todayChildSchedules = boot?.child_schedules.filter(s => dateKey(s.starts_at) === todayKey) ?? []
  const dueDateOf = (item: CareItem) => {
    if (item.starts_at) return dateKey(item.starts_at)
    const nextDay = new Date(item.created_at); nextDay.setDate(nextDay.getDate() + 1)
    return dateKey(nextDay)
  }
  const activeSupplies = visibleCareItems.filter(i => i.item_type === 'SUPPLY' && i.status !== 'DONE')
  const allSupplies = visibleCareItems.filter(i => i.item_type === 'SUPPLY')
  const supplyWindowEnd = new Date(); supplyWindowEnd.setDate(supplyWindowEnd.getDate() + 6)
  const weekSupplies = activeSupplies.filter(item => {
    const due = dueDateOf(item)
    return due >= todayKey && due <= dateKey(supplyWindowEnd)
  }).sort((left, right) => dueDateOf(left).localeCompare(dueDateOf(right)))
  const weekSuppliesAll = allSupplies.filter(item => {
    const due = dueDateOf(item)
    return due >= todayKey && due <= dateKey(supplyWindowEnd)
  }).sort((left, right) => dueDateOf(left).localeCompare(dueDateOf(right)))
  const supplyGroups = Object.entries(weekSuppliesAll.reduce<Record<string, CareItem[]>>((groups, item) => {
    ;(groups[dueDateOf(item)] ??= []).push(item)
    return groups
  }, {})).sort(([left], [right]) => left.localeCompare(right))
  const activeHomework = visibleCareItems.filter(i => i.item_type === 'HOMEWORK' && i.status !== 'DONE')
  const allHomework = visibleCareItems.filter(i => i.item_type === 'HOMEWORK')
  const weekHomework = activeHomework.filter(item => {
    const due = dueDateOf(item)
    return due >= todayKey && due <= dateKey(supplyWindowEnd)
  }).sort((left, right) => dueDateOf(left).localeCompare(dueDateOf(right)))
  const homeworkGroups = Object.entries(allHomework.reduce<Record<string, CareItem[]>>((groups, item) => {
    ;(groups[dueDateOf(item)] ??= []).push(item)
    return groups
  }, {})).sort(([left], [right]) => left.localeCompare(right))
  const tomorrowKey = dateKey(new Date(new Date().setDate(new Date().getDate() + 1)))
  // The home screen's "지금 해야 할 것" preview is meant for things due imminently —
  // supplies due today or tomorrow, homework due today — not the full week's worth
  // shown on the dedicated 준비물/숙제 확인 screens.
  const homeSupplyAlerts = weekSupplies.filter(item => dueDateOf(item) === todayKey || dueDateOf(item) === tomorrowKey)
  const homeHomeworkAlerts = weekHomework.filter(item => dueDateOf(item) === todayKey)
  const pendingHandoffs = boot?.handoffs.filter(h => h.to_member_id === careViewerId && h.status === 'PENDING' && h.special_note?.trim()) ?? []
  const handoffSummary = (handoff: Handoff) => {
    const assignment = assignments.find(item => item.id === handoff.assignment_id)
    const careItem = assignment ? itemFor(assignment) : undefined
    return {
      title: careItem?.title ?? '돌봄 인수인계',
      time: careItem?.starts_at ? formatTime(careItem.starts_at) : '',
      note: handoff.special_note?.trim() ?? '',
    }
  }
  // "오늘의 배정" / "맡은 일" counts must reflect actual today's duties, not every
  // still-active assignment ever created — otherwise stale items pile the count up forever.
  // Chained off the memoized assignments/viewerAssignments above so an unrelated
  // keystroke elsewhere doesn't re-scan these (itemFor is an O(n) lookup per assignment).
  const todayAssignments = useMemo(() => assignments.filter(a => { const item = itemFor(a); return !!item?.starts_at && dateKey(item.starts_at) === todayKey }), [assignments, todayKey])
  const todayViewerAssignments = useMemo(() => todayAssignments.filter(a => a.assignee_id === careViewerId), [todayAssignments, careViewerId])
  const weekWindowEndKey = dateKey(supplyWindowEnd)
  const weekViewerAssignments = useMemo(() => viewerAssignments.filter(a => { const item = itemFor(a); const due = item?.starts_at ? dateKey(item.starts_at) : ''; return !!due && due >= todayKey && due <= weekWindowEndKey }), [viewerAssignments, todayKey, weekWindowEndKey])
  const homeOpenEmergency = emergencyRequests.find(request => request.status === 'OPEN')
  const homeEmergencyAssignment = homeOpenEmergency ? assignments.find(assignment => assignment.id === homeOpenEmergency.assignment_id) : undefined
  const homeEmergencyItem = homeEmergencyAssignment ? itemFor(homeEmergencyAssignment) : undefined
  const movingAssignment = assignments.find(a => isLiveAssignment(a) && (!careStatusChild || itemFor(a)?.child_id === careStatusChild))
  const movingItem = movingAssignment ? itemFor(movingAssignment) : undefined
  const careDisplayAssignment = movingAssignment
    ?? todayAssignments.find(a => a.status === 'ACCEPTED' && (!careStatusChild || itemFor(a)?.child_id === careStatusChild))
    ?? [...todayAssignments].reverse().find(a => a.status === 'COMPLETED' && (!careStatusChild || itemFor(a)?.child_id === careStatusChild))
  const careDisplayItem = careDisplayAssignment ? itemFor(careDisplayAssignment) : undefined
  const careRouteChildId = careStatusChild || careDisplayItem?.child_id || boot?.children[0]?.id
  const careRouteDate = movingItem?.starts_at ? dateKey(movingItem.starts_at) : todayKey
  const careRouteAssignment = (careItemId: string) => assignments.find(a => a.item_id === careItemId && a.status === 'COMPLETED')
    ?? assignments.find(a => a.item_id === careItemId && a.status === 'ACCEPTED')
    ?? assignments.find(a => a.item_id === careItemId)
  const routeStatus = (careItem?: CareItem): 'done' | 'active' | 'future' => {
    if (!careItem) return 'future'
    const assignment = careRouteAssignment(careItem.id)
    if (careItem.status === 'DONE' || assignment?.status === 'COMPLETED') return 'done'
    const startsAt = careItem.starts_at ? new Date(careItem.starts_at).getTime() : Number.NaN
    if (careItem.external_assignee_name?.trim() && Number.isFinite(startsAt) && Math.abs(timelineNow - startsAt) <= 30 * 60_000) return 'active'
    return isLiveAssignment(assignment) ? 'active' : 'future'
  }
  const careRouteSteps = [
    ...(boot?.child_schedules ?? []).filter(schedule => schedule.child_id === careRouteChildId && dateKey(schedule.starts_at) === careRouteDate).map(schedule => {
      const scheduleCareItems = visibleCareItems.filter(item => item.child_schedule_id === schedule.id)
      const statuses = scheduleCareItems.map(routeStatus)
      const status = statuses.includes('active') ? 'active' : statuses.length && statuses.every(value => value === 'done') ? 'done' : 'future'
      return { id: `schedule-${schedule.id}`, label: schedule.title, startsAt: schedule.starts_at, status }
    }),
    ...visibleCareItems.filter(item => !item.child_schedule_id && item.child_id === careRouteChildId && item.starts_at && dateKey(item.starts_at) === careRouteDate && item.item_type !== 'SUPPLY').map(item => ({
      id: `care-${item.id}`, label: item.title, startsAt: item.starts_at!, status: routeStatus(item),
    })),
  ].sort((left, right) => left.startsAt.localeCompare(right.startsAt))
  if (careRouteSteps.length && careRouteSteps.at(-1)?.label !== '집') {
    careRouteSteps.push({ id: 'home', label: '집', startsAt: '9999', status: careRouteSteps.every(step => step.status === 'done') ? 'done' : 'future' })
  }
  const homeEventRows = [
    ...todayCare.map(item => {
      const assignment = activeAssignmentForItem(item.id)
      const confirmed = confirmedAssignmentForItem(item.id)
      const assignedName = confirmed ? member(confirmed.assignee_id) : item.external_assignee_name?.trim()
      return { id: `care-${item.id}`, time: item.starts_at!, title: item.title, meta: assignedName ? `${child(item.child_id)} · 담당 ${assignedName}` : child(item.child_id), completed: item.status === 'DONE' || confirmed?.status === 'COMPLETED', unassigned: !assignment && !assignedName, careItem: item, assignment }
    }),
    ...todayChildSchedules.flatMap(item => {
      const careItems = visibleCareItems.filter(candidate => candidate.child_schedule_id === item.id)
      if (!careItems.length) return [{ id: `child-${item.id}`, time: item.starts_at, title: item.title, meta: child(item.child_id), completed: false, unassigned: false, careItem: undefined as CareItem | undefined, assignment: undefined as Assignment | undefined }]
      return careItems.map(careItem => {
        const assignment = activeAssignmentForItem(careItem.id)
        const confirmed = confirmedAssignmentForItem(careItem.id)
        const externalName = careItem.external_assignee_name?.trim()
        const assignedName = confirmed ? member(confirmed.assignee_id) : externalName
        return { id: `child-${careItem.id}`, time: careItem.starts_at ?? item.starts_at, title: careItem.title, meta: assignedName ? `${child(item.child_id)} · 담당 ${assignedName}` : child(item.child_id), completed: careItem.status === 'DONE' || confirmed?.status === 'COMPLETED', unassigned: !assignment && !externalName, careItem, assignment }
      })
    }),
  ].sort((left, right) => left.time.localeCompare(right.time))
  const homeActiveWindow = 30 * 60 * 1000
  const homeEvents = homeEventRows.map(event => {
    const startsAt = new Date(event.time).getTime()
    const active = !event.completed && Number.isFinite(startsAt) && timelineNow >= startsAt - homeActiveWindow && timelineNow <= startsAt + homeActiveWindow
    const elapsed = !event.completed && Number.isFinite(startsAt) && timelineNow > startsAt + homeActiveWindow
    return { ...event, active, elapsed }
  })
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
  // These feed the 35-cell month grid (3 filter passes per day) — memoized so
  // typing in an unrelated field (e.g. the registration form open on top of this
  // same screen) doesn't re-run that work on every keystroke.
  const filteredChildSchedules = useMemo(() => boot?.child_schedules.filter(s => scheduleScope === 'all' || s.child_id === scheduleScope) ?? [], [boot, scheduleScope])
  const filteredCareSchedules = useMemo(() => visibleCareItems.filter(i => !i.child_schedule_id && i.starts_at && ['SCHEDULE', 'CHANGE', 'TODO'].includes(i.item_type) && (scheduleScope === 'all' || i.child_id === scheduleScope)), [visibleCareItems, scheduleScope])
  const calendarEventsFor = (key: string) => [
    ...(boot?.schedules ?? []).filter(s => dateKey(s.starts_at) === key && personalScheduleVisible(s.member_id)).map(s => ({ id: 'personal-' + s.id, title: s.title, color: caregiverColor(s.member_id), startsAt: s.starts_at, endsAt: s.ends_at, meta: `${member(s.member_id)} · ${s.kind === 'WORK' ? '업무 일정' : '개인 루틴'}` })),
    ...filteredChildSchedules.filter(s => dateKey(s.starts_at) === key).map(s => ({ id: 'child-' + s.id, title: s.title, color: childColor(s.child_id), startsAt: s.starts_at, endsAt: s.ends_at, meta: `${child(s.child_id)} · ${childScheduleLabel[s.category] ?? '아이 일정'}` })),
    ...filteredCareSchedules.filter(i => dateKey(i.starts_at!) === key).map(i => ({ id: 'care-' + i.id, title: i.title, color: childColor(i.child_id), startsAt: i.starts_at!, endsAt: i.starts_at!, meta: `${child(i.child_id)} · 알림장` })),
  ]
  const calendarMonthEvents = useMemo(() => {
    const map: Record<string, ReturnType<typeof calendarEventsFor>> = {}
    calendarDays.forEach(day => { map[dateKey(day)] = calendarEventsFor(dateKey(day)) })
    return map
  }, [boot, scheduleScope, calendarMonth])
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
      setChatMessages(previous => [...previous, { from: 'me', text: compactChatTimes(result.message) }, { from: 'agent', text: compactChatTimes(result.answer), cards: result.cards.map(card => ({ ...card, description: compactChatTimes(card.description) })) }])
      setChatUsedToday(result.usage.used_today); setChatTokenLimit(result.usage.limit); setChatDraft('')
      if (result.schedule_changes.length || result.schedule_creations?.length) await load()
    } catch (e) { reportError(e) }
    finally { setChatBusy(false) }
  }
  const sendVoice = async (file: File) => {
    if (chatBusy) return
    if (file.size > 20 * 1024 * 1024) { setError('음성 인식 파일은 20MB 이하만 보낼 수 있어요'); return }
    setChatBusy(true); setError('')
    try {
      const form = new FormData(); form.append('file', file)
      const result = await upload<ChatAnswer & { transcript: string }>('/assistant/voice', form)
      setChatMessages(previous => [...previous, { from: 'me', text: compactChatTimes(result.transcript) }, { from: 'agent', text: compactChatTimes(result.answer), cards: result.cards.map(card => ({ ...card, description: compactChatTimes(card.description) })) }])
      setChatUsedToday(result.usage.used_today); setChatTokenLimit(result.usage.limit)
      if (result.schedule_changes.length || result.schedule_creations?.length) await load()
    } catch (e) { reportError(e) }
    finally { setChatBusy(false) }
  }
  const toggleRecording = async () => {
    if (recording) { recorderRef.current?.stop(); return }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('음성 인식은 HTTPS 주소 또는 이 PC의 localhost에서 사용할 수 있어요. 휴대폰은 start-secure-phone.ps1로 실행한 HTTPS 주소로 접속해주세요.'); return
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
      setError('음성 인식은 HTTPS 주소 또는 이 PC의 localhost에서 사용할 수 있어요. 휴대폰은 start-secure-phone.ps1로 실행한 HTTPS 주소로 접속해주세요.'); return
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
      setError('음성 인식은 HTTPS 주소 또는 이 PC의 localhost에서 사용할 수 있어요.'); return
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

  const reviewDraftOf = (item: CareItem): ReviewDraft => ({ title: item.title, itemType: item.item_type, startsAt: localDateTime(item.starts_at) })
  const selectReview = (item: CareItem) => {
    setReviewDrafts(current => {
      const next = { ...current }
      if (itemId) next[itemId] = { title: reviewTitle, itemType: reviewType, startsAt: reviewStart }
      if (!next[item.id]) next[item.id] = reviewDraftOf(item)
      return next
    })
    const draft = reviewDrafts[item.id] ?? reviewDraftOf(item)
    setItemId(item.id); setReviewTitle(draft.title); setReviewType(draft.itemType); setReviewStart(draft.startsAt)
  }
  const prepareReview = (reviewItems: CareItem[]) => {
    const drafts = Object.fromEntries(reviewItems.map(item => [item.id, reviewDraftOf(item)]))
    setReviewDrafts(drafts)
    const first = reviewItems[0]
    if (first) {
      setItemId(first.id); setReviewTitle(first.title); setReviewType(first.item_type); setReviewStart(localDateTime(first.starts_at))
    } else setItemId(null)
  }
  const openReview = (item: CareItem) => {
    setCaptureTranscript(''); setCaptureFromPhoto(false)
    const siblings = boot?.items.filter(candidate => candidate.status === 'NEEDS_REVIEW' && candidate.intake_id === item.intake_id) ?? [item]
    prepareReview(siblings.length ? siblings : [item]); go('review')
  }
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
      prepareReview(result.items)
      setCaptureFromPhoto(!!captureFile)
      setCaptureTranscript(result.transcript ?? captureText.trim())
      setCaptureText(''); setCaptureFile(null); setCapturePreview(''); go(result.items.length || captureFile ? 'review' : 'family')
    }, '확인할 항목을 정리했어요')
    setCaptureBusy(false)
  }
  const saveReview = () => run(async () => {
    if (!activeItem) return
    const pendingItems = boot?.items.filter(item => item.status === 'NEEDS_REVIEW' && item.intake_id === activeItem.intake_id) ?? [activeItem]
    const drafts = { ...reviewDrafts, [activeItem.id]: { title: reviewTitle, itemType: reviewType, startsAt: reviewStart } }
    for (const item of pendingItems) {
      const draft = drafts[item.id] ?? reviewDraftOf(item)
      await send('/items/' + item.id, 'PATCH', {
        title: draft.title.trim(), item_type: draft.itemType,
        ...(draft.startsAt ? { starts_at: new Date(draft.startsAt).toISOString() } : {}),
      })
      await send('/items/' + item.id + '/confirm', 'POST')
    }
    setReviewDrafts({}); setItemId(null); go('family')
  }, '확인한 내용을 일정·준비물·숙제에 반영했어요')
  const openNewScheduleForm = (type: 'PERSONAL' | 'CHILD', mode: 'SINGLE' | 'REPEAT' = 'SINGLE', returnToWeekly = false) => {
    const start = new Date(scheduleDate + 'T12:00:00')
    const until = new Date(start.getFullYear(), start.getMonth() + 3, start.getDate())
    setEditingSchedule(null); setScheduleForm(type); setScheduleEntryMode(mode); setScheduleReturnToWeekly(returnToWeekly); setScheduleTitle(''); setScheduleEndTime(''); setScheduleRepeat(mode === 'REPEAT')
    const knownLocations = [...new Set((boot?.child_schedules ?? []).map(item => item.location_name?.trim()).filter((value): value is string => !!value))]
    setChildScheduleLocation(knownLocations[0] ?? ''); setAddingChildScheduleLocation(!knownLocations.length)
    setRoutineStartAssignee(''); setRoutineStartExternalName(''); setRoutineEndAssignee(''); setRoutineEndExternalName('')
    setScheduleRepeatMode('WEEKLY'); setScheduleRepeatDays([(start.getDay() + 6) % 7]); setScheduleRepeatUntil(until.toLocaleDateString('sv-SE'))
    setScheduleRepeatInterval(2); setScheduleRepeatMonthDay(start.getDate()); setScheduleRepeatDates([]); setScheduleRepeatDateInput(scheduleDate); setScheduleSheet('FORM')
  }
  const openPersonalScheduleEdit = (schedule: Bootstrap['schedules'][number]) => {
    setScheduleReturnToWeekly(false)
    setEditingSchedule({ type: 'PERSONAL', id: schedule.id }); setScheduleForm('PERSONAL')
    setScheduleTitle(schedule.title); setScheduleMember(schedule.member_id); setScheduleKind(schedule.kind)
    setScheduleDate(dateKey(schedule.starts_at)); setScheduleStartTime(localClock(schedule.starts_at)); setScheduleEndTime(schedule.has_end_time === false || schedule.has_end_time === 0 ? '' : localClock(schedule.ends_at))
    setScheduleRepeat(false); setScheduleSheet('FORM')
  }
  const openChildScheduleEdit = (schedule: Bootstrap['child_schedules'][number], returnToWeekly = false) => {
    setScheduleReturnToWeekly(returnToWeekly)
    setWeeklyTimetableOpen(false)
    setEditingSchedule({ type: 'CHILD', id: schedule.id }); setScheduleForm('CHILD')
    setScheduleTitle(schedule.title); setChildScheduleChild(schedule.child_id); setChildScheduleCategory(schedule.category)
    setChildScheduleLocation(schedule.location_name ?? ''); setAddingChildScheduleLocation(!(schedule.location_name ?? '').trim())
    const responsibility = (boundary: 'START' | 'END') => {
      const prefix = boundary === 'START' ? 'start' : 'end'
      const required = schedule[`${prefix}_assignment_required` as 'start_assignment_required' | 'end_assignment_required']
      const storedAssignee = schedule[`${prefix}_assignee_id` as 'start_assignee_id' | 'end_assignee_id']
      const storedExternal = schedule[`${prefix}_external_assignee_name` as 'start_external_assignee_name' | 'end_external_assignee_name'] ?? ''
      const careItem = visibleCareItems.find(item => item.child_schedule_id === schedule.id && (item.boundary_type ?? 'START') === boundary)
      const assignment = careItem ? activeAssignmentForItem(careItem.id) : undefined
      const externalName = storedExternal || careItem?.external_assignee_name || ''
      return { selection: required === false || required === 0 ? '__NONE__' : externalName ? '__EXTERNAL__' : storedAssignee || assignment?.assignee_id || '', externalName }
    }
    const startResponsibility = responsibility('START')
    const endResponsibility = responsibility('END')
    setRoutineStartAssignee(startResponsibility.selection); setRoutineStartExternalName(startResponsibility.externalName)
    setRoutineEndAssignee(endResponsibility.selection); setRoutineEndExternalName(endResponsibility.externalName)
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
  const saveSchedule = (updateScope?: 'SINGLE' | 'FUTURE', mergeSameLocation?: boolean) => {
    const editingRecord = editingSchedule?.type === 'CHILD'
      ? boot?.child_schedules.find(item => item.id === editingSchedule.id)
      : boot?.schedules.find(item => item.id === editingSchedule?.id)
    if (editingSchedule && editingRecord?.recurrence_id && !updateScope) {
      setRecurrenceEditScope('SINGLE')
      setRecurrenceEditPrompt(true)
      return
    }
    if (!editingSchedule && scheduleForm === 'CHILD' && scheduleEndTime.trim() && childScheduleLocation.trim() && mergeSameLocation === undefined) {
      const proposedStart = new Date(`${scheduleDate}T${normalizeClock(scheduleStartTime)}`)
      const proposedEnd = new Date(`${scheduleDate}T${normalizeClock(scheduleEndTime)}`)
      const adjacent = boot?.child_schedules.find(item => {
        if ((item.location_name ?? '').trim().toLocaleLowerCase() !== childScheduleLocation.trim().toLocaleLowerCase()) return false
        if (item.merge_same_location === false || item.merge_same_location === 0 || !item.has_end_time) return false
        const existingStart = new Date(item.starts_at); const existingEnd = new Date(item.ends_at)
        if (dateKey(existingStart) !== dateKey(proposedStart)) return false
        const separation = Math.max(
          proposedStart.getTime() - existingEnd.getTime(),
          existingStart.getTime() - proposedEnd.getTime(),
          0,
        )
        return item.child_id === childScheduleChild || separation <= 60 * 60_000
      })
      if (adjacent && !Number.isNaN(proposedStart.getTime()) && !Number.isNaN(proposedEnd.getTime())) {
        const first = new Date(Math.min(proposedStart.getTime(), new Date(adjacent.starts_at).getTime()))
        const last = new Date(Math.max(proposedEnd.getTime(), new Date(adjacent.ends_at).getTime()))
        setRoutineMergePrompt({ location: childScheduleLocation.trim(), start: localClock(first.toISOString()), end: localClock(last.toISOString()) })
        return
      }
    }
    void run(async () => {
    const startClock = normalizeClock(scheduleStartTime)
    const endClock = scheduleEndTime.trim() ? normalizeClock(scheduleEndTime) : ''
    if (!scheduleTitle || !scheduleDate || !startClock || (scheduleEndTime.trim() && !endClock)) throw new Error('날짜와 시작 시간을 09:30 형식으로 입력해주세요')
    const scheduleStart = new Date(`${scheduleDate}T${startClock}`)
    const scheduleEnd = endClock ? new Date(`${scheduleDate}T${endClock}`) : null
    if (scheduleEnd && scheduleEnd <= scheduleStart) throw new Error('종료 시간은 시작 시간보다 늦어야 해요')
    if (scheduleForm === 'CHILD' && !childScheduleLocation.trim()) throw new Error('아이 일정의 위치를 선택하거나 새로 입력해주세요')
    if (scheduleForm === 'CHILD' && routineStartAssignee === '__EXTERNAL__' && !routineStartExternalName.trim()) throw new Error('등원 외부 담당자의 이름을 입력해주세요')
    if (scheduleForm === 'CHILD' && scheduleEnd && routineEndAssignee === '__EXTERNAL__' && !routineEndExternalName.trim()) throw new Error('하원 외부 담당자의 이름을 입력해주세요')
    const homeSchedule = scheduleForm === 'CHILD' && isHomeScheduleLocation()
    const responsibility = {
      start_assignment_required: !homeSchedule && routineStartAssignee !== '__NONE__',
      start_assignee_id: !homeSchedule && routineStartAssignee && !routineStartAssignee.startsWith('__') ? routineStartAssignee : null,
      start_external_assignee_name: !homeSchedule && routineStartAssignee === '__EXTERNAL__' ? routineStartExternalName.trim() : '',
      end_assignment_required: !homeSchedule && routineEndAssignee !== '__NONE__',
      end_assignee_id: !homeSchedule && routineEndAssignee && !routineEndAssignee.startsWith('__') ? routineEndAssignee : null,
      end_external_assignee_name: !homeSchedule && routineEndAssignee === '__EXTERNAL__' ? routineEndExternalName.trim() : '',
    }
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
          location_name: childScheduleLocation.trim(),
          merge_same_location: editingRecord && 'merge_same_location' in editingRecord
            ? editingRecord.merge_same_location !== false && editingRecord.merge_same_location !== 0 : true,
          ...responsibility,
          update_scope: updateScope ?? 'SINGLE',
        })
        if (updateScope === 'FUTURE') setPatternSuggestionOpen(true)
        setEditingSchedule(null); setScheduleTitle(''); setScheduleSheet('NONE')
        if (updated.care_item_id) { setItemId(updated.care_item_id); setSuggestions(updated.suggestions); go('suggestion') }
        else { setSelectedDate(scheduleDate); setScheduleSheet('DAY') }
        return
      } else {
        const updated = await send<{ collisions: { item_id: string }[] }>('/schedules/' + editingSchedule.id, 'PATCH', {
          title: scheduleTitle, starts_at: scheduleStart.toISOString(), ends_at: scheduleEnd?.toISOString() ?? null, kind: scheduleKind, update_scope: updateScope ?? 'SINGLE',
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
      const created = await send<{ care_item_id: string | null; care_item_ids: string[]; assigned_count: number; suggestions: Suggestion[] }>('/child-schedules', 'POST', { child_id: childScheduleChild, title: scheduleTitle,
        category: childScheduleCategory, starts_at: scheduleStart.toISOString(),
        ends_at: scheduleEnd?.toISOString() ?? null, location_name: childScheduleLocation.trim(),
        merge_same_location: mergeSameLocation ?? true,
        ...(scheduleEntryMode === 'REPEAT' ? responsibility : {}),
        source: 'MANUAL', ...recurrence })
      setItemId(created.care_item_id); setSuggestions(created.suggestions); setRoutineMergePrompt(null)
      setScheduleTitle(''); setScheduleRepeat(false); setScheduleSheet('NONE')
      if (scheduleEntryMode === 'REPEAT' || !created.care_item_id) {
        setSelectedDate(scheduleDate)
        if (scheduleReturnToWeekly) setWeeklyTimetableOpen(true)
        else setScheduleSheet('DAY')
      } else go('suggestion')
      setScheduleReturnToWeekly(false)
      return
    }
    const result = await send<{ collisions: { item_id: string }[] }>('/schedules', 'POST', { member_id: me?.authenticated ? me.member.id : scheduleMember, title: scheduleTitle, starts_at: scheduleStart.toISOString(), ends_at: scheduleEnd?.toISOString() ?? null, kind: scheduleKind, ...recurrence })
    setScheduleTitle(''); setScheduleRepeat(false); setScheduleSheet('NONE')
    if (result.collisions[0]) {
      const ranked = await api<{ item: CareItem; suggestions: Suggestion[] }>('/items/' + result.collisions[0].item_id + '/suggestions')
      setItemId(ranked.item.id); setSuggestions(ranked.suggestions); go('suggestion')
    }
    }, editingSchedule ? (updateScope === 'FUTURE' ? '이후 반복 일정도 함께 수정했어요' : '일정을 수정했어요') : scheduleRepeat ? '반복 루틴 일정을 한 번에 등록했어요' : scheduleForm === 'CHILD' ? '아이 일정을 등록했어요' : '개인 일정을 등록했어요')
  }
  const deleteCareItem = (careItem: CareItem) => {
    if (!confirm(`${careItem.title}을(를) 삭제할까요?`)) return
    void run(() => send('/care-items/' + careItem.id, 'DELETE'), '삭제했어요')
  }
  const deleteSchedule = (deleteScope?: 'SINGLE' | 'FUTURE') => {
    if (!editingSchedule) return
    const original = editingSchedule.type === 'CHILD'
      ? boot?.child_schedules.find(item => item.id === editingSchedule.id)
      : boot?.schedules.find(item => item.id === editingSchedule.id)
    if (original?.recurrence_id && !deleteScope) {
      setRecurrenceDeleteScope('SINGLE')
      setRecurrenceDeletePrompt(true)
      return
    }
    if (!original?.recurrence_id && !confirm('이 일정을 삭제할까요?')) return
    const target = editingSchedule
    void run(async () => {
      await send(`/${target.type === 'CHILD' ? 'child-schedules' : 'schedules'}/${target.id}?delete_scope=${deleteScope ?? 'SINGLE'}`, 'DELETE')
      setEditingSchedule(null); setScheduleTitle(''); setScheduleSheet('DAY')
    }, deleteScope === 'FUTURE' ? '이후 반복 일정도 함께 삭제했어요' : '일정을 삭제했어요')
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
  const connectCalendar = async (provider: 'google' | 'microsoft') => {
    try {
      const native = Capacitor.isNativePlatform()
      const result = await send<{ authorization_url: string }>('/calendar-connections/' + provider + '/authorize', 'POST', native ? { return_url: nativeCalendarReturnUrl } : {})
      if (native) await Browser.open({ url: result.authorization_url })
      else location.assign(result.authorization_url)
    } catch (e) {
      reportError(e)
    }
  }
  const syncCalendar = (provider: 'google' | 'microsoft') => run(async () => {
    await send('/calendar-connections/' + provider + '/sync', 'POST')
    setCalendarConnections((await api<{ connections: CalendarConnection[] }>('/calendar-connections')).connections)
  }, '업무 캘린더 일정을 가져왔어요')
  const disconnectCalendar = async (provider: 'google' | 'microsoft') => {
    const label = provider === 'google' ? 'Google Calendar' : 'Outlook Calendar'
    if (!confirm(`${label} 연동을 해제할까요?\nZIPPY로 가져온 일정은 삭제되지만 원본 캘린더 일정은 그대로 유지돼요.`)) return
    await run(async () => {
      await send('/calendar-connections/' + provider + '/disconnect', 'POST')
      setCalendarConnections((await api<{ connections: CalendarConnection[] }>('/calendar-connections')).connections)
    }, `${label} 연동을 해제했어요`)
  }
  const saveCalendarVisibility = async (showTitles: boolean) => {
    if (!me?.member.id || calendarPrivacyBusy) return
    setCalendarPrivacyBusy(true)
    try {
      await Promise.all(['SCHEDULE_DETAIL', 'WORK_DETAIL'].map(scope => send('/members/' + me.member.id + '/permissions', 'PATCH', { scope, is_allowed: showTitles })))
      await load()
      setCalendarPrivacyPromptOpen(false)
      setToast(showTitles ? '가족에게 일정 제목을 공개해요' : '가족에게 일정 시간만 공개해요')
    } catch (failure) { reportError(failure) }
    finally { setCalendarPrivacyBusy(false) }
  }
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
  const patchDeviceAlertSettings = (payload: Record<string, unknown>, message: string) => run(async () => {
    const result = await send<DeviceAlertsResponse>('/device-alerts', 'PATCH', payload)
    setDeviceAlertData(result)
  }, message)
  const runDeviceAlertTest = () => run(async () => {
    setDeviceAlertTestResult(await send<DeviceAlertTestResult>('/device-alerts/test', 'POST', { assume_tv_off: deviceAlertTestForceOff }))
  }, '테스트 알림을 보냈어요')
  const toggleBilling = async () => {
    if (billingBusy) return
    if (billingOpen) {
      setBillingOpen(false); setBillingOrder(null); setBillingWidgetReady(false)
      return
    }
    trackPerformanceEvent('pro_cta_clicked', { cycle: billingCycle, entry_point: 'plan_screen' })
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
  }, note.trim() ? '완료 기록과 인수인계를 가족에게 전했어요' : '완료 기록을 저장했어요')

  const updateChildPhoto = (childId: string, file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) { setError('8MB 이하 JPG, PNG, WebP 사진을 선택해주세요'); return }
    void run(async () => {
      const form = new FormData(); form.append('file', file)
      await upload('/children/' + childId + '/photo', form)
    }, '아이 프로필 사진을 변경했어요')
  }
  const removeChildPhoto = (childId: string) => {
    void run(() => send('/children/' + childId + '/photo', 'DELETE'), '아이 프로필 사진을 삭제했어요')
  }
  const openChildProfile = (target: Child) => {
    setChildProfileId(target.id); setChildProfileName(target.name); setChildProfileAge(target.age_label); go('childProfile')
  }
  const saveChildProfile = () => {
    if (!childProfileId || !childProfileName.trim() || !childProfileAge.trim()) { setError('아이 이름과 나이·학교 정보를 입력해주세요'); return }
    void run(
      () => send('/children/' + childProfileId, 'PATCH', { name: childProfileName.trim(), age_label: childProfileAge.trim() }),
      '아이 프로필을 변경했어요',
    )
  }
  const toggleItemDone = (item: CareItem) => {
    void run(() => send('/items/' + item.id + '/done', 'PATCH', { done: item.status !== 'DONE' }), item.status === 'DONE' ? '완료 표시를 해제했어요' : '완료로 표시했어요')
  }
  const addHomework = () => {
    if (!homeworkChild || !homeworkTitle.trim()) { setError('아이와 숙제 내용을 입력해주세요'); return }
    void run(async () => {
      await send('/homework', 'POST', { child_id: homeworkChild, title: homeworkTitle.trim(), due_date: homeworkDate || null })
      setHomeworkTitle(''); setHomeworkDate('')
    }, '숙제를 등록했어요')
  }
  const saveHomeworkEdit = (itemId: string) => {
    if (!editHomeworkTitle.trim()) { setError('숙제 내용을 입력해주세요'); return }
    void run(async () => {
      await send('/items/' + itemId, 'PATCH', {
        title: editHomeworkTitle.trim(),
        starts_at: editHomeworkDate ? `${editHomeworkDate}T00:00:00+09:00` : undefined,
      })
      setEditingHomeworkId('')
    }, '숙제를 수정했어요')
  }
  const addAlbumPhotos = async (files: File[]) => {
    if (!files.length || albumBusy) return
    setAlbumBusy(true); setError('')
    try {
      for (const file of files) {
        const form = new FormData(); form.append('file', file)
        await upload('/album/photos', form)
      }
      setAlbumPhotos((await api<{ photos: AlbumPhoto[] }>('/album/photos')).photos)
      setToast(`${files.length}장의 사진을 모음ZIP에 저장했어요`)
    } catch (e) { reportError(e) }
    finally { setAlbumBusy(false) }
  }
  const deleteAlbumPhoto = async (photo: AlbumPhoto) => {
    if (!photo.can_delete || albumDeleteBusy || !confirm('이 사진을 모음ZIP에서 삭제할까요?')) return
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
  const searchBenefits = async (requestedKeyword?: string) => {
    const keyword = (requestedKeyword ?? benefitKeyword).trim()
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
  const timeline = (list: Assignment[]) => {
    const statusPriority: Record<string, number> = { COMPLETED: 6, ACCEPTED: 5, CANDIDATE_ACCEPTED: 4, PROPOSED: 3, RECONFIRMATION_REQUIRED: 2, REJECTED: 1, CANCELED: 0 }
    const currentByItem = [...list].reduce<Map<string, Assignment>>((result, assignment) => {
      const current = result.get(assignment.item_id)
      if (!current || (statusPriority[assignment.status] ?? 0) > (statusPriority[current.status] ?? 0)) result.set(assignment.item_id, assignment)
      return result
    }, new Map())
    return <Card className="timeline-card">{[...currentByItem.values()].sort((a, b) => (itemFor(a)?.starts_at || '').localeCompare(itemFor(b)?.starts_at || '')).map(a => { const i = itemFor(a); const statusClass = a.status === 'COMPLETED' ? 'status-done' : ['PROPOSED', 'CANDIDATE_ACCEPTED'].includes(a.status) ? 'status-pending' : 'status-progress'; return i && <button key={a.id} className="timeline-row" onClick={() => { setAssignmentId(a.id); setViewer(a.assignee_id); go('assignmentDetail') }}><span className="time">{formatTime(i.starts_at) || '—'}</span><span className="timeline-content"><strong><em className="timeline-child-name">{child(i.child_id)}</em>{i.title} — {a.status === 'PROPOSED' ? `${member(a.assignee_id)}님에게 요청` : a.status === 'CANDIDATE_ACCEPTED' ? `${member(a.assignee_id)}님 수락` : `담당 ${member(a.assignee_id)}`}</strong><small className={statusClass}>{caregiverStatusLabel(a.status)}</small></span><span className="timeline-status">{a.status === 'COMPLETED' ? '✓' : '›'}</span></button> })}</Card>
  }
  const activeExceptions = boot?.exceptions.filter(exception => exception.status === 'PENDING') ?? []
  const scheduleLocationOptions = [...new Set((boot?.child_schedules ?? []).map(item => item.location_name?.trim()).filter((value): value is string => !!value))]
  const isHomeScheduleLocation = (value = childScheduleLocation) => ['집', '우리집', '우리 집', '자택', 'home'].includes(value.trim().toLocaleLowerCase())
  const activeWeeklyChild = weeklyTimetableChild || boot?.children[0]?.id || ''
  const weeklyEntries = boot?.child_schedules.filter(item => item.child_id === activeWeeklyChild && !!item.recurrence_id) ?? []
  const weeklyDisplayEntries = [...new Map(weeklyEntries.map(item => {
    const start = new Date(item.starts_at); const end = new Date(item.ends_at)
    const key = `${start.getDay()}-${start.getHours()}:${start.getMinutes()}-${end.getHours()}:${end.getMinutes()}-${item.title}-${item.location_name ?? ''}`
    return [key, item] as const
  })).values()]
  const weeklyStartMinute = weeklyDisplayEntries.length
    ? Math.floor(Math.min(...weeklyDisplayEntries.map(item => { const value = new Date(item.starts_at); return value.getHours() * 60 + value.getMinutes() })) / 60) * 60
    : 0
  const weeklyEndMinute = weeklyDisplayEntries.length
    ? Math.min(24 * 60, Math.ceil(Math.max(...weeklyDisplayEntries.map(item => { const value = item.has_end_time ? new Date(item.ends_at) : new Date(item.starts_at); return value.getHours() * 60 + value.getMinutes() })) / 60) * 60)
    : 0
  const weeklyHourLabels = weeklyDisplayEntries.length
    ? Array.from({ length: Math.max(2, (weeklyEndMinute - weeklyStartMinute) / 60 + 1) }, (_, index) => weeklyStartMinute / 60 + index)
    : []
  const weeklyPixelsPerMinute = .72
  const weeklyTimelineHeight = Math.max(84, (weeklyEndMinute - weeklyStartMinute) * weeklyPixelsPerMinute)
  const childLocationControl = (className = '') => <div className={`schedule-location-field ${className}`.trim()}>
    <label><span>위치</span><select aria-label="아이 일정 위치" value={addingChildScheduleLocation ? '__new__' : childScheduleLocation} onChange={event => {
      if (event.target.value === '__new__') { setAddingChildScheduleLocation(true); setChildScheduleLocation('') }
      else { setAddingChildScheduleLocation(false); setChildScheduleLocation(event.target.value) }
    }}><option value="">위치를 선택해주세요</option>{scheduleLocationOptions.map(location => <option key={location} value={location}>{location}</option>)}<option value="__new__">＋ 새 위치 추가</option></select></label>
    {addingChildScheduleLocation && <input aria-label="새 아이 일정 위치" value={childScheduleLocation} maxLength={100} onChange={event => setChildScheduleLocation(event.target.value)} placeholder="예: 한빛초등학교, 별빛유치원" />}
    <small>{isHomeScheduleLocation() ? '집에서 하는 일정은 돌봄 담당자를 배정하지 않아요.' : '같은 위치 이름을 선택하면 이어지는 일정의 중간 픽업을 자동으로 정리해요.'}</small>
  </div>
  const routineResponsibilityControl = (
    boundary: 'START' | 'END',
    selection: string,
    setSelection: (value: string) => void,
    externalName: string,
    setExternalName: (value: string) => void,
  ) => <label className="routine-boundary-assignee">
    <span>{boundary === 'START' ? '등원 담당' : '하원 담당'}</span>
    <select value={selection} onChange={event => {
      setSelection(event.target.value)
      if (event.target.value !== '__EXTERNAL__') setExternalName('')
    }}>
      <option value="">나중에 설정할게요</option>
      <option value="__NONE__">담당자 필요 없음</option>
      {members.map(person => <option key={person.id} value={person.id}>{person.name}{person.id === me?.member.id ? ' (나)' : ''}</option>)}
      <option value="__EXTERNAL__">가족방에 없는 담당자</option>
    </select>
    {selection === '__EXTERNAL__' && <input value={externalName} maxLength={100} onChange={event => setExternalName(event.target.value)} placeholder="예: 태권도 학원 차량, 이웃 김선생님" />}
  </label>

  let page: ReactNode = <div className="loading">가족의 하루를 불러오고 있어요</div>
  if (screen === 'thinq') page = <ThinQEntry selectorOpen={thinqSelector} hasFamily={familySessionReady} familyName={boot?.family.name ?? '민솔이네 집'} onOpenSelector={() => setThinqSelector(true)} onCloseSelector={() => setThinqSelector(false)} onOpenService={openFamilyService} onStartOnboarding={startFamilyOnboarding} />
  if (screen === 'serviceLoading') page = <ServiceLoading />
  if (screen === 'lockscreen') page = <LockscreenPreview onOpen={() => {
    if (!familySessionReady || !boot) { openFamilyService(); return }
    if (movingAssignment) {
      setAssignmentId(movingAssignment.id)
      setViewer(movingAssignment.assignee_id)
      go('assignmentDetail')
      return
    }
    go('assignments')
  }} />
  if (boot && screen === 'home') page = <div className="figma-home">
    {homeEmergencyAssignment && homeEmergencyItem ? <button className="home-travel emergency" onClick={() => go('assignments')}><span className="travel-avatar">!</span><span><strong>긴급 도움 요청으로 조율 중</strong><small>{child(homeEmergencyItem.child_id)} · {homeEmergencyItem.title} · 대체 담당자를 찾고 있어요</small></span><b>›</b></button> : movingAssignment && movingItem ? <button className="home-travel" onClick={() => go('assignments')}><span className="travel-avatar">{member(movingAssignment.assignee_id).slice(0, 1)}</span><span><strong>{member(movingAssignment.assignee_id)}와 함께 {movingItem.title} 이동 중</strong><small>{child(movingItem.child_id)} · {member(movingAssignment.assignee_id)} 담당</small></span><b>›</b></button> : null}
    {activeExceptions.length > 0 && <button className="family-alert home-alert" onClick={() => go('exception')}><span className="small-badge danger">확인 {activeExceptions.length}</span><strong>{activeExceptions[0].reason}</strong><span>›</span></button>}
    <Section>오늘 일정</Section>
    <Card className="home-timeline exact-timeline">
      {homeEvents.map(event => <div key={event.id} className="home-schedule-row-wrap">
        <button className={`home-schedule-row ${event.completed ? 'completed' : event.active ? 'current' : event.elapsed ? 'elapsed' : 'upcoming'}`} onClick={() => { if (event.assignment && !['ACCEPTED', 'COMPLETED'].includes(event.assignment.status)) { setAssignmentId(event.assignment.id); setViewer(event.assignment.assignee_id); go('assignmentDetail') } else if (event.unassigned && event.careItem) void openSuggestion(event.careItem); else go('schedule') }}><time>{formatTime(event.time)}</time><span><strong>{event.title}</strong><small>{event.active ? `진행 중 · ${event.meta}` : event.meta}</small></span>{event.completed ? <b className="done"><img src={homeScheduleDoneIcon} alt="완료" /></b> : event.active || event.assignment ? <b>›</b> : null}</button>
        {event.careItem && <button className="home-schedule-row-delete" aria-label="일정 삭제" onClick={() => deleteCareItem(event.careItem!)}>✕</button>}
      </div>)}
      {!homeEvents.length && <p className="empty-line">오늘 등록된 일정이 없어요</p>}
    </Card>
    <Section>지금 해야 할 것</Section>
    <div className="home-now-list">
      {activeExceptions.slice(0, 1).map(exception => <button key={exception.id} className="attention" onClick={() => go('exception')}><i><img src={homeAttentionIcon} alt="" /></i><span><strong>지금 확인이 필요해요</strong><small>{exception.reason}</small></span><b>›</b></button>)}
      {pendingHandoffs.slice(0, 1).map(handoff => { const summary = handoffSummary(handoff); return <button key={handoff.id} onClick={() => go('tasks')}><i><img src={homeHandoffIcon} alt="" /></i><span><strong>인수인계 확인</strong><small>{member(handoff.from_member_id)} → {member(handoff.to_member_id)}{summary.time ? ` · ${summary.time}` : ''} · {summary.note}</small></span><b>›</b></button> })}
      {homeSupplyAlerts.slice(0, 3).map(item => <button key={item.id} className="attention" onClick={() => go('supplies')}><i><img src={homeSupplyIcon} alt="" /></i><span><strong>{dueDateOf(item) === todayKey ? '오늘 준비물 확인' : '내일 준비물 확인'}</strong><small>{item.title} · {child(item.child_id)}{item.detail ? ` · ${item.detail}` : ''}</small></span><b>›</b></button>)}
      {homeHomeworkAlerts.slice(0, 3).map(item => <button key={item.id} className="attention" onClick={() => go('homework')}><i style={{ fontSize: 22 }}>📝</i><span><strong>오늘 숙제 확인</strong><small>{item.title} · {child(item.child_id)}</small></span><b>›</b></button>)}
      {!activeExceptions.length && !pendingHandoffs.length && !homeSupplyAlerts.length && !homeHomeworkAlerts.length && <div className="home-now-empty"><i>✓</i><span><strong>지금 확인할 일이 없어요</strong><small>새 요청이나 준비물이 생기면 여기에 표시돼요.</small></span></div>}
    </div>
    <p className="figma-home-note">평소와 같은 배정은 알리지 않습니다.</p>
  </div>
  if (boot && screen === 'family') page = <><div className="eyebrow">아이별 돌봄 정보</div><h2 className="page-title">일정과 준비물을 나눠 확인해요</h2>{tabs}
    {pending.length > 0 && <Card className="inbox-summary" onClick={() => pending[0] && openReview(pending[0])}><span className="summary-dot">●</span><div><strong>확인할 돌봄 정보 {pending.length}건</strong><p>등록한 내용은 확인 후 역할 배정에 반영돼요</p></div><span className="chevron">›</span></Card>}
    <Section>확인 필요 {pending.length}</Section>{pending.length ? pending.map(i => <Card key={i.id} className="review-card"><div className="review-meta"><span className="child-pill">{child(i.child_id)}</span><span>{typeLabel[i.item_type]}</span></div><strong>{i.title}</strong><p>{visibleCareItemDetail(i.detail) || '추출된 내용을 확인해주세요'}</p><div className="card-actions"><button onClick={() => openReview(i)}>확인하기</button><button onClick={() => setToast('나중에 다시 확인할 수 있어요')}>나중에</button></div></Card>) : <Empty title="확인할 것이 없어요" text="새로운 알림장이 들어오면 이곳에 표시돼요" />}
    <Section>아이 일정</Section>{boot.child_schedules.filter(s => filter === 'all' || s.child_id === filter).slice(0, 5).map(s => <Card key={s.id} className="schedule-card"><i className="child-color" style={{ background: childColor(s.child_id) }} /><span className="time">{formatTime(s.starts_at) || '—'}</span><div><strong>{s.title}</strong><p>{child(s.child_id)} · {childScheduleLabel[s.category] ?? '기타'}</p></div><span className="green-check">✓</span></Card>)}{items.filter(i => !i.child_schedule_id && ['SCHEDULE', 'CHANGE', 'TODO'].includes(i.item_type) && ['CONFIRMED', 'ASSIGNED', 'DONE'].includes(i.status)).slice(0, 5).map(i => <Card key={i.id} className="schedule-card"><i className="child-color" style={{ background: childColor(i.child_id) }} /><span className="time">{formatTime(i.starts_at) || '—'}</span><div><strong>{i.title}</strong><p>{child(i.child_id)} · 알림장</p></div><span className="green-check">✓</span></Card>)}
    <Section>준비물</Section>{items.filter(i => i.item_type === 'SUPPLY' && ['CONFIRMED', 'ASSIGNED', 'DONE'].includes(i.status)).slice(0, 5).map(i => <Card key={i.id} className="schedule-card"><i className="child-color" style={{ background: childColor(i.child_id) }} /><div><strong>{i.title}</strong><p>{child(i.child_id)} · {i.detail}</p></div><span className="green-check">✓</span></Card>)}
    <Section action={<button className="text-link" onClick={() => go('homework')}>숙제 확인 ›</button>}>숙제</Section>{items.filter(i => i.item_type === 'HOMEWORK' && ['CONFIRMED', 'ASSIGNED', 'DONE'].includes(i.status)).slice(0, 5).map(i => <Card key={i.id} className="schedule-card"><i className="child-color" style={{ background: childColor(i.child_id) }} /><div><strong>{i.title}</strong><p>{child(i.child_id)}</p></div><span className="green-check">✓</span></Card>)}
    <div className="inbox-buttons"><button className="primary-button" onClick={() => go('capture')}>알림장 촬영</button><button className="outline-button" onClick={() => go('capture')}>직접 입력</button></div>
  </>
  if (boot && screen === 'capture') page = <><div className="eyebrow">FAMILY INBOX</div><h2 className="hero-title">흩어진 안내를<br />한 번에 정리해요</h2><p className="hero-copy">알림장, 문자, 가정통신문에 적힌 돌봄 정보를 모아주세요.</p>
    <div className="capture-actions"><input ref={cameraInputRef} className="photo-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="카메라로 알림장 촬영" onChange={e => { selectCarePhoto(e.currentTarget.files?.[0], 'CAMERA'); e.currentTarget.value = '' }} /><input ref={uploadInputRef} className="photo-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="앨범에서 알림장 사진 업로드" onChange={e => { selectCarePhoto(e.currentTarget.files?.[0], 'ALBUM'); e.currentTarget.value = '' }} /><button className="primary-button" onClick={() => cameraInputRef.current?.click()}>사진 촬영</button><button className="outline-button" onClick={() => uploadInputRef.current?.click()}>사진 업로드</button></div>
    <div className="capture-frame">{capturePreview ? <img className="capture-preview" src={capturePreview} alt="선택한 알림장" /> : <span className="camera-glyph">▣</span>}<strong>{captureFile?.name || '선택된 사진이 없어요'}</strong><small>{captureFile ? '사진의 글씨를 읽고 일정 관련 내용만 AI가 추려요. 다음 화면에서 확인해주세요.' : '사진 없이 입력하면 수기로 등록돼요. 무료 OCR은 하루 2회 사용할 수 있어요.'}</small></div>
    <Section>아이 선택</Section><div className="choice-row">{boot.children.map(c => <button key={c.id} className={'choice-chip ' + (captureChild === c.id ? 'active' : '')} onClick={() => setCaptureChild(c.id)}>{c.name}</button>)}</div>
    <label className="form-label">직접 입력 (사진 없이 등록할 때)</label><textarea className="text-area" rows={5} value={captureText} onChange={e => setCaptureText(e.target.value)} placeholder={'예: 금요일 하원 시간이 15시로 변경\n준비물: 도시락, 모자'} /><p className="helper-text">OCR 한도나 사진 오류가 있으면 사진을 다시 선택해 해제하고 수기로 입력할 수 있어요.</p>{captureFile && <button className="text-link centered" onClick={() => { setCaptureFile(null); setCapturePreview('') }}>사진 선택 취소 · 수기 입력</button>}<button className="primary-button wide-button" disabled={captureBusy || !captureChild || (!captureFile && !captureText.trim())} onClick={capture}>{captureBusy ? '분석 중…' : captureFile ? '사진 분석하기' : '내용 정리하기'}</button>
  </>
  if (boot && screen === 'review') page = <><div className="eyebrow">추출 결과 확인</div><h2 className="hero-title one-line">{captureFromPhoto ? '일정 관련 내용만 확인해주세요' : '표시된 부분만 확인해주세요'}</h2><p className="hero-copy">{captureFromPhoto ? 'AI가 고른 항목을 원문과 비교하고, 틀린 부분을 고쳐주세요.' : '틀린 부분만 고치고 저장하면 돼요.'}</p>
    {activeItem && <div className="review-switcher">{boot.items.filter(i => i.status === 'NEEDS_REVIEW' && i.intake_id === activeItem.intake_id).slice(0, 8).map(i => <button key={i.id} className={itemId === i.id ? 'active' : ''} onClick={() => selectReview(i)}>{typeLabel[i.item_type]} · {i.title.slice(0, 20)}</button>)}</div>}
    {activeItem && <Card className="detail-review-card"><div className="review-meta"><span>{child(activeItem.child_id)}</span></div><label className="form-label">항목 종류</label><select className="form-control" value={reviewType} onChange={e => setReviewType(e.target.value)}>{Object.entries(typeLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><label className="form-label">내용</label><input className="form-control" value={reviewTitle} onChange={e => setReviewTitle(e.target.value)} />{visibleCareItemDetail(activeItem.detail) && <p className="source-text">원문 근거 · {visibleCareItemDetail(activeItem.detail)}</p>}<label className="form-label">돌봄 예정 일시 (선택)</label><input className="form-control" type="datetime-local" value={reviewStart} onChange={e => setReviewStart(e.target.value)} /><p className="helper-text">일시를 입력하면 가족 일정과 겹치는지 확인할 수 있어요.</p><p className="source-text">출처 · {activeItem.intake_id ? '등록한 돌봄 정보' : '별빛유치원 알림장'}</p></Card>}
    {!activeItem && captureFromPhoto && <Empty title="일정 관련 항목이 없어요" text="읽은 글씨는 아래에서 확인할 수 있어요. 필요한 내용이 있다면 직접 입력해주세요." />}
    {captureTranscript && <details className="card source-transcript"><summary>인식한 원문 보기</summary><p>{captureTranscript}</p></details>}
    {activeItem ? <button className="primary-button wide-button" onClick={saveReview}>모두 확인하고 저장 · {boot.items.filter(i => i.status === 'NEEDS_REVIEW' && i.intake_id === activeItem.intake_id).length}건</button> : captureFromPhoto && <button className="primary-button wide-button" onClick={() => go('capture')}>내용 직접 입력하기</button>}
  </>
  if (boot && screen === 'assignments') {
    const finalCandidates = assignments.filter(a => a.status === 'CANDIDATE_ACCEPTED')
    const unassignedItems = items.filter(i => i.status === 'CONFIRMED' && !!i.starts_at && dateKey(i.starts_at) >= todayKey && !assignments.some(a => a.item_id === i.id && ['PROPOSED', 'CANDIDATE_ACCEPTED', 'ACCEPTED'].includes(a.status)))
      .toSorted((left, right) => (left.starts_at ?? '').localeCompare(right.starts_at ?? ''))
    page = <section className="assignment-overview">
      <div className="care-subscreen-title"><strong>역할 배정</strong><button onClick={() => unassignedItems[0] ? openSuggestion(unassignedItems[0]) : go('tasks')}>전체 보기 ›</button></div>
      {finalCandidates.length > 0 && <><Section>최종 확인 필요</Section>{finalCandidates.map(a => <Card key={a.id} className="urgent-card"><span className="small-badge danger">수락 응답</span><strong>{itemFor(a)?.title ?? '돌봄'} · {member(a.assignee_id)}</strong><p>이 가족을 최종 담당자로 확정하면 다른 후보 요청은 자동으로 마감돼요.</p>{me?.member.is_owner && <button className="primary-button wide-button" onClick={() => run(() => send('/assignments/' + a.id + '/confirm', 'POST'), member(a.assignee_id) + '님을 최종 담당자로 확정했어요')}>최종 담당자로 확정</button>}</Card>)}</>}
      <Section>오늘의 배정</Section>
      {todayAssignments.length ? timeline(todayAssignments) : <Empty title="오늘 확정된 배정이 없어요" text="새로운 돌봄 일정을 등록하면 담당자를 추천해요" />}
      <Section>미리 확인할 변경</Section>
      <Card className="assignment-preview-card">{unassignedItems.slice(0, 2).map((item, index) => <button key={item.id} onClick={() => openSuggestion(item)}><i className={index ? 'muted' : ''} /><span><strong>{item.starts_at ? `${formatDate(item.starts_at)} · ${formatTime(item.starts_at)}` : '날짜·시간 미정'} · {item.title} 담당자 조정이 필요해요</strong><small>{child(item.child_id)} · 가능한 가족을 추천해드릴게요</small></span><b>›</b></button>)}{!unassignedItems.length && <div className="assignment-preview-empty"><i />등록된 일정에서 필요한 변경이 없어요</div>}</Card>
      <Section>아이별 오늘</Section>
      <div className="assignment-child-grid">{boot.children.map(kid => { const childItems = items.filter(item => item.child_id === kid.id); const next = childItems.find(item => item.starts_at && dateKey(item.starts_at) >= todayKey); return <button className="card assignment-child-card" key={kid.id} onClick={() => { setFilter(kid.id); go('family') }}><strong>{kid.name} <small>{kid.age_label}</small></strong><span><img src={scheduleChildIcon} alt="" />{next?.title ?? '등록된 일정 없음'} {next?.starts_at ? formatTime(next.starts_at) : ''}</span><span>✓ {assignments.some(assignment => childItems.some(item => item.id === assignment.item_id) && assignment.status === 'ACCEPTED') ? '담당 배정 완료' : '배정 확인 필요'}</span></button> })}</div>
      <button className="assignment-pattern-link" onClick={() => go('schedule')}>📅 평소 배정 기본값 보기 <b>›</b></button>
      <p className="figma-home-note">평소와 같은 배정은 알리지 않습니다.</p>
    </section>
  }
  if (boot && screen === 'assignmentDetail') {
    const detailItem = activeAssignment ? itemFor(activeAssignment) : null
    const coordinating = !!activeAssignment && ['PROPOSED', 'CANDIDATE_ACCEPTED', 'RECONFIRMATION_REQUIRED'].includes(activeAssignment.status)
    const detailStatus = activeAssignment?.status === 'COMPLETED' ? '완료' : activeAssignment?.status === 'PROPOSED' ? (activeAssignment.assignee_id === me?.member.id ? '응답 필요' : '답변 대기 중') : activeAssignment?.status === 'CANDIDATE_ACCEPTED' ? '최종 확인 대기' : activeAssignment?.status === 'REJECTED' ? '거절됨' : activeAssignment?.status === 'CANCELED' ? '취소됨' : activeAssignment?.status === 'RECONFIRMATION_REQUIRED' ? '재배정 필요' : '담당 확정'
    page = <section className="assignment-detail-page"><div className="care-subscreen-title"><strong>{coordinating ? '역할 조율 현황' : '배정 상세'}</strong><button onClick={() => go('assignments')}>전체 배정 ›</button></div>{activeAssignment && detailItem ? <><Card className="assignment-detail-card"><div className="assignment-detail-head"><time>{formatTime(detailItem.starts_at) || '시간 미정'}</time><span className={'small-badge ' + (['PROPOSED', 'CANDIDATE_ACCEPTED'].includes(activeAssignment.status) ? 'pending' : ['REJECTED', 'CANCELED', 'RECONFIRMATION_REQUIRED'].includes(activeAssignment.status) ? 'danger' : 'ok')}>{detailStatus}</span></div><h2>{detailItem.title}</h2><dl><div><dt>아이</dt><dd>{child(detailItem.child_id)}</dd></div><div><dt>{coordinating ? '요청한 가족' : '담당'}</dt><dd>{member(activeAssignment.assignee_id)}</dd></div><div><dt>일정</dt><dd>{detailItem.starts_at ? `${formatDate(detailItem.starts_at)} ${formatTime(detailItem.starts_at)}` : '시간 미정'}</dd></div></dl>{activeAssignment.status === 'PROPOSED' && <p>{activeAssignment.assignee_id === me?.member.id ? '요청 내용을 확인하고 맡을 수 있는지 알려주세요.' : `${member(activeAssignment.assignee_id)}님의 답변을 기다리고 있어요.`}</p>}{activeAssignment.note && <div className="assignment-detail-note"><strong>특이사항</strong><span>{activeAssignment.note}</span></div>}</Card>{activeAssignment.status === 'PROPOSED' && activeAssignment.assignee_id === me?.member.id && <div className="task-actions assignment-detail-actions"><button className="primary-button" onClick={() => run(() => send('/assignments/' + activeAssignment.id + '/respond', 'POST', { decision: 'ACCEPTED' }), '배정을 수락했어요')}>맡을게요</button><button className="outline-button" onClick={() => run(() => send('/assignments/' + activeAssignment.id + '/respond', 'POST', { decision: 'REJECTED' }), '다른 담당자를 찾을게요')}>어려워요</button></div>}{activeAssignment.status === 'ACCEPTED' && activeAssignment.assignee_id === me?.member.id && <button className="primary-button wide-button" onClick={() => { setNote(''); setCompletionPhoto(null); setCompletionPreview(''); setShowSheet(true) }}>완료 체크</button>}</> : <Empty title="배정 정보를 찾을 수 없어요" text="역할 배정에서 확인할 항목을 다시 선택해주세요" />}</section>
  }
  if (boot && screen === 'suggestion') {
    const preferredMemberId = activeItem?.child_id ? localStorage.getItem(`family-care-pattern:${boot.family.id}:${activeItem.child_id}`) : ''
    const visibleSuggestions = suggestions.filter(s => s.member_id !== me?.member.id || s.available).toSorted((left, right) => left.member_id === preferredMemberId ? -1 : right.member_id === preferredMemberId ? 1 : left.priority - right.priority)
    page = <><div className="eyebrow">CARE SCHEDULE AGENT · 배정 추천</div><h2 className="hero-title">{activeItem?.title || '아이 일정'}</h2><p className="hero-copy">여러 가족에게 동시에 요청할 수 있어요. 두 명 이상에게 요청하면 수락 응답 뒤 주돌봄자가 최종 담당자를 정해요.</p>{visibleSuggestions.map(s => { const isMe = s.member_id === me?.member.id; const isPreferred = s.member_id === preferredMemberId; const requested = assignments.some(a => a.item_id === activeItem?.id && a.assignee_id === s.member_id && ['PROPOSED', 'CANDIDATE_ACCEPTED', 'ACCEPTED'].includes(a.status)); return <Card key={s.member_id} className={'person-card ' + (isPreferred || s.priority === 1 ? 'recommended' : '')}><div className="person-avatar">{s.name.slice(0, 1)}</div><div className="person-info"><strong>{isMe ? `${s.name} (나)` : s.name}</strong><p>{s.reason}</p></div><span className={'small-badge ' + (s.available ? 'ok' : 'danger')}>{s.available ? (isPreferred ? '기본 담당' : isMe ? '내가 가능' : s.priority === 1 ? 'AI 추천 1순위' : s.priority + '순위') : '바쁨'}</span><button className={isPreferred || s.priority === 1 ? 'primary-button' : 'outline-button'} disabled={!s.available || !activeItem || requested} onClick={() => run(async () => { await send('/assignments', 'POST', { item_id: activeItem!.id, assignee_id: s.member_id }); if (isMe) go('assignments') }, isMe ? '내 담당으로 바로 확정했어요' : s.name + '님에게 요청했어요')}>{requested ? '요청 보냄' : isMe ? '내가 맡기' : `${s.name}에게 요청`}</button></Card>})}{!visibleSuggestions.length && <Empty title="맡을 수 있는 가족이 없어요" text="개인 일정 충돌을 확인하거나 가족 구성원을 초대해주세요" />}<button className="outline-button wide-button" onClick={() => go('assignments')}>요청 현황 보기</button><Section>판단 근거</Section><Card className="reason-card"><p>개인 캘린더 충돌, 같은 시간대 돌봄, 현재 맡은 돌봄 건수를 함께 비교합니다.</p><p>같은 시간대에 여러 아이를 함께 돌볼 수 있으면 묶음 돌봄 가능으로 표시해요.</p></Card></>
  }
  if (boot && screen === 'tasks') page = <>
    <div className="viewer-switch"><strong>내 담당</strong></div>
    <Card className="task-summary"><span className="green-check">✓</span><div><strong>오늘 확인할 돌봄 {todayViewerAssignments.length}건</strong><p>요청을 열어 세부내용을 확인하고 응답할 수 있어요</p></div></Card>
    {pendingHandoffs.length > 0 && <><Section>받은 인수인계</Section>{pendingHandoffs.map(h => { const summary = handoffSummary(h); return <Card key={h.id} className={'handoff-card inline-handoff ' + (handoffId === h.id ? 'selected-request' : '')}><span className="small-badge danger">확인 필요</span><strong>{summary.title}{summary.time ? ` · ${summary.time}` : ''}</strong><p>특이사항 · {summary.note}</p><small>{member(h.from_member_id)}님이 전달</small><button className="outline-button wide-button" onClick={() => run(() => send('/handoffs/' + h.id + '/acknowledge', 'POST'), '인수인계를 확인했어요')}>확인했어요</button></Card> })}</>}
    <Section>오늘 할 일</Section>
    {todayViewerAssignments.map(a => { const i = itemFor(a); return i && <Card key={a.id} className={'task-card ' + (assignmentId === a.id ? 'selected-request' : '')}><div className="task-top"><span className="time">{formatTime(i.starts_at) || '시간 미정'}</span><span className={'small-badge ' + (['PROPOSED', 'CANDIDATE_ACCEPTED'].includes(a.status) ? 'pending' : a.status === 'RECONFIRMATION_REQUIRED' ? 'danger' : 'ok')}>{a.status === 'PROPOSED' ? '응답 필요' : caregiverStatusLabel(a.status)}</span></div><strong>{i.title} — {child(i.child_id)}</strong>{visibleCareItemDetail(i.detail) && <p>{visibleCareItemDetail(i.detail)}</p>}{a.status === 'PROPOSED' ? <div className="task-actions"><button className="primary-button" onClick={() => run(() => send('/assignments/' + a.id + '/respond', 'POST', { decision: 'ACCEPTED' }), '배정을 수락했어요')}>맡을게요</button><button className="outline-button" onClick={() => run(() => send('/assignments/' + a.id + '/respond', 'POST', { decision: 'REJECTED' }), '다른 담당자를 찾을게요')}>어려워요</button></div> : a.status === 'CANDIDATE_ACCEPTED' ? <p className="source-text">수락 응답을 보냈어요. 주돌봄자의 최종 확정을 기다리고 있어요.</p> : a.status === 'ACCEPTED' ? <button className="primary-button wide-button" onClick={() => { setAssignmentId(a.id); setNote(''); setCompletionPhoto(null); setCompletionPreview(''); setShowSheet(true) }}>완료 체크</button> : <p className="source-text">{a.note ? '특이사항 · ' + a.note : '특이사항 없음'}</p>}</Card> })}
    {weekViewerAssignments.length ? <><Section>이번 주 내 담당</Section><Card className="stats-card"><div><strong>{weekViewerAssignments.length}</strong><span>맡은 일</span></div><div><strong>{weekViewerAssignments.filter(a => a.status === 'COMPLETED').length}</strong><span>완료</span></div><div><strong>{weekViewerAssignments.filter(a => a.note).length}</strong><span>특이사항</span></div></Card></> : <Empty title="아직 맡은 일이 없어요" text="가족이 돌봄을 요청하면 이곳에서 확인할 수 있어요" />}
  </>
  if (boot && screen === 'schedule') {
    const selectedEvents = calendarEventsFor(selectedDate)
    page = <section className="figma-calendar-page" data-figma-node="702:1663">
      <button className="figma-calendar-connect" onClick={() => go('calendar')}><i><img src={googleIcon} alt="" /><img src={outlookIcon} alt="" /></i><span><strong>개인 캘린더 연동</strong><small>{connectedCalendarCount ? `${connectedCalendarCount}개 계정 연결됨 · 눌러서 동기화` : 'Google·Outlook 일정을 한곳에서 보기'}</small></span><b>›</b></button>
      <div className="figma-calendar-card">
        <div className="figma-calendar-head"><div className="figma-month-control"><button aria-label="이전 달" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button><h2>{calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월</h2><button aria-label="다음 달" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button></div><button className="figma-calendar-add" aria-label="등록 메뉴 열기" onClick={event => openScheduleRegistration(event.currentTarget)}>＋</button></div>
        <div className="figma-calendar-legend"><button className={scheduleScope === 'all' ? 'active' : ''} onClick={() => setScheduleScope('all')}><i className="all-dot" />전체</button><button className={scheduleScope === 'me' ? 'active' : ''} onClick={() => setScheduleScope(scheduleScope === 'me' ? 'all' : 'me')}><i style={{ background: myScheduleColor }} />나</button>{boot.children.map(childItem => <button key={childItem.id} title={childItem.name} className={scheduleScope === childItem.id ? 'active' : ''} onClick={() => setScheduleScope(scheduleScope === childItem.id ? 'all' : childItem.id)}><i style={{ background: childColor(childItem.id) }} />{childItem.name}</button>)}</div>
        <div className="weekdays figma-weekdays">{['일', '월', '화', '수', '목', '금', '토'].map((day, index) => <span className={index === 0 ? 'sun' : index === 6 ? 'sat' : ''} key={day}>{day}</span>)}</div>
        <div className="month-grid figma-month-grid">{calendarDays.map(day => {
          const key = dateKey(day); const dayEvents = calendarMonthEvents[key] ?? []; const outside = day.getMonth() !== calendarMonth.getMonth()
          return <button key={key} disabled={outside} aria-label={outside ? undefined : `${key} · 일정 ${dayEvents.length}개`} className={(outside ? 'muted ' : '') + (selectedDate === key ? 'selected' : '')} onClick={() => pickCalendarDate(day)}><span>{outside ? '' : day.getDate()}</span><i className="month-day-events" aria-hidden="true">{dayEvents.slice(0, 3).map(event => <b key={event.id} style={{ background: event.color }} />)}{dayEvents.length > 3 && <small>+{dayEvents.length - 3}</small>}</i></button>
        })}</div>
        <div className={'figma-calendar-agenda ' + (selectedEvents.length ? 'has-events' : 'is-empty')}><small>{selectedDate === todayKey ? '오늘 일정' : '선택한 일정'} · {selectedEvents.length}건</small>{selectedEvents.map(event => <button key={event.id} onClick={() => setScheduleSheet('DAY')}><i style={{ background: event.color }} /><span><strong>{event.title}</strong><small>{selectedDate.slice(5).replace('-', '/')} · {formatTime(event.startsAt)} · {event.meta.split(' · ')[0]}</small></span></button>)}{!selectedEvents.length && <p>등록된 일정이 없어요</p>}</div>
      </div>
      <button className="supply-week-link" onClick={() => go('supplies')}><i><img src={homeSupplyIcon} alt="" /></i><span><strong>준비물 확인</strong><small>오늘부터 일주일 · {weekSupplies.length ? `${weekSupplies.length}개 준비물` : '등록된 준비물 없음'}</small></span><b>›</b></button>
      <button className="weekly-timetable-link" onClick={() => { setWeeklyTimetableChild(weeklyTimetableChild || boot.children[0]?.id || ''); setWeeklyTimetableOpen(true) }}><span><strong>주간 시간표</strong><small>아이별 반복 루틴을 한눈에 확인하고 수정해요</small></span><b>›</b></button>
    </section>
  }
  if (boot && screen === 'supplies') page = <section className="supplies-page">
    <div className="eyebrow">앞으로 7일</div><h2 className="page-title">준비물 확인</h2><p className="hero-copy">오늘부터 일주일 동안 챙겨야 할 준비물을 날짜별로 모았어요.</p>
    {supplyGroups.map(([dueDate, dueItems]) => <section className="supply-day" key={dueDate}><h3>{dueDate === todayKey ? '오늘' : formatDate(dueDate + 'T12:00:00')}</h3><div>{dueItems.map(item => <Card className={'supply-item-card' + (item.status === 'DONE' ? ' item-done' : '')} key={item.id}>{item.status === 'NEEDS_REVIEW' ? <em className="item-review-badge">확인 필요</em> : <input type="checkbox" className="item-checkbox" checked={item.status === 'DONE'} onChange={() => toggleItemDone(item)} aria-label={item.title + ' 완료 체크'} />}<i><img src={homeSupplyIcon} alt="" /></i><span><strong>{item.title}</strong><small>{child(item.child_id)}{item.detail ? ` · ${item.detail}` : ''}</small></span><button className="supply-item-delete" aria-label="준비물 삭제" onClick={() => deleteCareItem(item)}>✕</button></Card>)}</div></section>)}
    {!supplyGroups.length && <Empty title="일주일 안에 챙길 준비물이 없어요" text="알림장을 등록하면 준비물을 날짜별로 정리해드려요" />}
    <button className="primary-button wide-button supply-register" onClick={() => go('capture')}>알림장 등록하기</button>
  </section>
  if (boot && screen === 'homework') page = <section className="supplies-page homework-page">
    <div className="eyebrow">숙제</div><h2 className="page-title">숙제 확인</h2><p className="hero-copy">등록된 숙제를 날짜별로 모았어요. 여기서 바로 등록하거나 수정할 수 있어요.</p>
    <Card className="form-card homework-form-card">
      <label className="form-label">아이</label>
      <div className="choice-row">{boot.children.map(c => <button key={c.id} className={'choice-chip ' + (homeworkChild === c.id ? 'active' : '')} onClick={() => setHomeworkChild(c.id)}>{c.name}</button>)}</div>
      <label className="form-label">숙제 내용</label>
      <input className="form-control" value={homeworkTitle} onChange={e => setHomeworkTitle(e.target.value)} placeholder="예: 수학 문제집 3단원" />
      <label className="form-label">날짜 (선택)</label>
      <input type="date" className="form-control" value={homeworkDate} onChange={e => setHomeworkDate(e.target.value)} />
      <button className="primary-button wide-button" onClick={addHomework}>숙제 등록</button>
    </Card>
    {homeworkGroups.map(([dueDate, dueItems]) => <section className="supply-day" key={dueDate}><h3>{dueDate === todayKey ? '오늘' : formatDate(dueDate + 'T12:00:00')}</h3><div>{dueItems.map(item => editingHomeworkId === item.id ? <Card className="homework-edit-card" key={item.id}>
      <input className="form-control" value={editHomeworkTitle} onChange={e => setEditHomeworkTitle(e.target.value)} placeholder="숙제 내용" />
      <input type="date" className="form-control" value={editHomeworkDate} onChange={e => setEditHomeworkDate(e.target.value)} />
      <div className="homework-edit-actions"><button className="outline-button" onClick={() => setEditingHomeworkId('')}>취소</button><button className="primary-button" onClick={() => saveHomeworkEdit(item.id)}>저장</button></div>
    </Card> : <Card className={'supply-item-card' + (item.status === 'DONE' ? ' item-done' : '')} key={item.id}>
      <input type="checkbox" className="item-checkbox" checked={item.status === 'DONE'} onChange={() => toggleItemDone(item)} aria-label={item.title + ' 완료 체크'} />
      <button className="homework-item-body" onClick={() => { setEditingHomeworkId(item.id); setEditHomeworkTitle(item.title); setEditHomeworkDate(item.starts_at ? dateKey(item.starts_at) : '') }}>
        <strong>{item.title}</strong><small>{child(item.child_id)}</small>
      </button>
      <button className="supply-item-delete" aria-label="숙제 삭제" onClick={() => deleteCareItem(item)}>✕</button>
    </Card>)}</div></section>)}
    {!homeworkGroups.length && <Empty title="등록된 숙제가 없어요" text="위에서 숙제를 등록하거나 알림장을 등록해서 정리해보세요" />}
  </section>
  if (boot && screen === 'careHub') {
    const myNext = todayViewerAssignments.find(a => a.status === 'PROPOSED') ?? todayViewerAssignments.find(a => a.status === 'RECONFIRMATION_REQUIRED') ?? todayViewerAssignments.find(a => a.status === 'ACCEPTED') ?? todayViewerAssignments[0]
    const myNextItem = myNext ? itemFor(myNext) : undefined
    const confirmedToday = todayViewerAssignments.filter(a => ['ACCEPTED', 'COMPLETED'].includes(a.status))
    page = <>
      <div className="care-status-kicker-row"><div className="section-kicker care-status-kicker">돌봄 현황</div><div className="care-status-scope">{boot.children.map(childItem => <button key={childItem.id} className={careStatusChild === childItem.id ? 'active' : ''} onClick={() => setCareStatusChild(careStatusChild === childItem.id ? '' : childItem.id)}>{childItem.name}</button>)}</div></div>
      <section className="care-status-panel">
        <div className="care-status-title"><span className="care-avatar">{careDisplayAssignment ? member(careDisplayAssignment.assignee_id).slice(0, 1) : '✓'}</span><div><strong>{careDisplayItem ? `${child(careDisplayItem.child_id)} · ${careDisplayItem.title}` : '진행 중인 돌봄이 없어요'}</strong><small>{careDisplayAssignment ? `${member(careDisplayAssignment.assignee_id)} 담당` : '현재 확정된 이동 일정이 없습니다'}</small></div><em>{movingAssignment ? '실시간' : '오늘'}</em></div>
        {!!careRouteSteps.length && <div className="care-route-assets">{careRouteSteps.map((step, index) => <Fragment key={step.id}>{index > 0 && <img src={careRouteSteps[index - 1].status === 'done' ? careDoneLine : careRouteSteps[index - 1].status === 'active' ? careActiveLine : careFutureLine} alt="" />}<span className={step.status}><img src={step.status === 'done' ? careDoneNode : step.status === 'active' ? careActiveNode : careFutureNode} alt={`${step.label} ${step.status === 'done' ? '완료' : step.status === 'active' ? '진행 중' : '예정'}`} /><small>{step.label}</small></span></Fragment>)}</div>}
        <button className="care-live-row" onClick={() => { if (careDisplayAssignment) { setAssignmentId(careDisplayAssignment.id); setViewer(careDisplayAssignment.assignee_id) }; go(careDisplayAssignment ? 'assignmentDetail' : 'assignments') }}><span>{movingAssignment && movingItem ? `${member(movingAssignment.assignee_id)}와 함께 ${movingItem.title} 이동 중` : careDisplayItem ? `${child(careDisplayItem.child_id)}의 오늘 배정을 확인해보세요` : '오늘의 배정을 확인해보세요'}</span><small>자세히 ›</small></button>
      </section>
      <button className={'care-state-strip ' + (activeExceptions.length ? 'danger' : 'safe')} onClick={() => go('exception')}><b>{activeExceptions.length ? '!' : '✓'}</b><span><strong>{activeExceptions.length ? '지금 확인이 필요해요' : '충돌되는 일정이 없어요'}</strong><small>{activeExceptions.length ? `${activeExceptions.length}개의 예외 상황` : '등록된 가족 일정 기준'}</small></span><em>›</em></button>
      <Section action={<button className="text-link" onClick={() => go('tasks')}>전체 이력 ›</button>}>내 돌봄·요청</Section>
      {myNext && myNextItem ? <Card className="care-duty-card exact-duty"><div><time>{formatTime(myNextItem.starts_at) || '시간 미정'}</time><span className={'small-badge ' + (['PROPOSED', 'CANDIDATE_ACCEPTED'].includes(myNext.status) ? 'pending' : myNext.status === 'RECONFIRMATION_REQUIRED' ? 'danger' : 'ok')}>{myNext.status === 'PROPOSED' ? '응답 필요' : caregiverStatusLabel(myNext.status)}</span></div><strong>{myNextItem.title} — {child(myNextItem.child_id)}</strong><button aria-label="내 돌봄 상세 보기" onClick={() => { setAssignmentId(myNext.id); setViewer(myNext.assignee_id); go('assignmentDetail') }}>{myNext.status === 'PROPOSED' ? '요청에 응답' : myNext.status === 'COMPLETED' ? '완료 기록 보기' : '자세히'}</button><div className="care-duty-stats"><span><strong>{confirmedToday.length}</strong><small>확정된 일</small></span><span><strong>{confirmedToday.filter(a => a.status === 'COMPLETED').length}</strong><small>완료</small></span><span><strong>{todayViewerAssignments.filter(a => a.status === 'PROPOSED').length}</strong><small>응답 필요</small></span></div></Card> : <Empty title="오늘 돌봄 일정이 없어요" text="새로운 돌봄 요청이 오면 여기에 표시돼요" />}
      <Section>빠른 실행</Section><div className="care-quick-grid"><button className="urgent" onClick={() => go('emergency')}><i><img src={careEmergencyIcon} alt="" /></i><span><strong>긴급 도움 요청</strong><small>가족 전체에 도움 요청</small></span></button><button onClick={() => go('assignments')}><i><img src={careAssignmentIcon} alt="" /></i><span><strong>역할 배정</strong><small>오늘의 담당 확인</small></span></button></div>
    </>
  }
  if (boot && screen === 'familyHub') page = <><div className="eyebrow">FAMILY</div><p className="hero-copy family-main-copy">구성원과 아이를 관리하고 누구에게 어떤 정보를 보여줄지 정해요.</p><Section>구성원</Section><div className="family-people exact-family-people">{members.map(person => <button key={person.id} onClick={() => go('members')}><i className="member-profile-initial" style={{ background: profileColorForMember(person.id) }}>{person.name.trim().slice(0, 1)}</i><span>{person.name}</span><small>{person.id === me?.member.id ? `${roleLabel[person.role] ?? '가족'} (나)` : roleLabel[person.role] ?? '가족'}</small><b className="member-presence"><img src={memberIsOnline(person.id) ? memberActiveIcon : memberInactiveIcon} alt={memberIsOnline(person.id) ? '활동 중' : '비활동 중'} /></b></button>)}<button className="invite-person" onClick={() => void openInviteShare()}><i>＋</i><span>초대</span><small>가족 추가</small></button></div><Section>아이</Section><div className="family-children exact-family-children">{boot.children.map(kid => <button key={kid.id} onClick={() => openChildProfile(kid)}><i className={kid.photo_url ? 'child-profile-asset' : ''}><img src={kid.photo_url || scheduleChildIcon} alt="" /></i><strong>{kid.name}</strong><small>{kid.age_label}</small></button>)}{!boot.children.length && <button className="family-child-empty" onClick={() => go('members')}><i>＋</i><strong>등록된 아이가 없어요</strong><small>가족 설정에서 아이를 추가해 주세요</small></button>}</div><div className="hub-list family-actions"><button onClick={() => go('members')}><i><img src={familySettingsUiIcon} alt="" /></i><span><strong>가족 설정</strong><small>가족 구성원 · 아이 · 초대코드</small></span><b>›</b></button><button aria-label="모음ZIP · 모음ZIP" onClick={() => go('album')}><i><img src={familyAlbumUiIcon} alt="" /></i><span><strong>모음ZIP {plan === 'PRO' ? <em className="small-badge ok">이용 가능</em> : <Pro />}</strong><small>돌봄 완료 사진 자동 모음</small></span><b>›</b></button><button onClick={() => go('permissions')}><i><img src={informationUiIcon} alt="" /></i><span><strong>정보 공개</strong><small>일정 관련 내용 · 돌봄 이동 현황 권한</small></span><b>›</b></button></div><Card className="privacy-note">구성원마다 볼 수 있는 정보 범위를 따로 설정할 수 있어요. 기본값은 최소 공개입니다.</Card></>
  if (boot && screen === 'more') page = <div className={'figma-more ' + (plan === 'PRO' ? 'pro-enabled' : '')}>
    <button className="profile-summary" onClick={() => go('members')}>
      <span style={{ background: profileColorForMember(me?.member.id ?? viewer) }}>{(me?.member.name || member(viewer)).trim().slice(0, 1)}</span>
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
    <div className={'family-menu-list more-list ' + (plan === 'PRO' ? 'pro-active' : '')}>
      <button onClick={() => go('plan')}><i><img src={planPaymentUiIcon} alt="" /></i><span><strong>플랜·결제</strong><small>{plan === 'PRO' ? 'Pro 구독 중' : 'Free 이용 중'}</small></span><b>›</b></button>
      <button onClick={() => go('gap')}><i><img src={careGapUiIcon} alt="" /></i><span><strong>돌봄 공백 예측</strong><small>다음 주 공백 시간 미리 확인</small></span>{plan === 'PRO' ? <em className="small-badge ok">이용 가능</em> : <Pro />}<b>›</b></button>
      <button onClick={() => go('programs')}><i><img src={careProgramUiIcon} alt="" /></i><span><strong>돌봄 제도 안내</strong><small>정부 지원 제도 맞춤 안내</small></span>{plan === 'PRO' ? <em className="small-badge ok">이용 가능</em> : <Pro />}<b>›</b></button>
      <button onClick={() => { setDeviceAlertStep('main'); go('deviceAlerts') }}><i><img src={deviceAlertPriorityUiIcon} alt="" /></i><span><strong>가전 알림 우선순위</strong><small>TV·정수기 등 어디로 먼저 보낼지 설정</small></span>{plan === 'PRO' ? <em className="small-badge ok">이용 가능</em> : <Pro />}<b>›</b></button>
    </div>
    <div className="more-policy-list"><button onClick={() => setPolicyOpen('TERMS')}>🏳️ <span>서비스 이용 약관</span><b>›</b></button><button onClick={() => setPolicyOpen('PRIVACY')}><img src={lockIcon} alt="" /> <span>개인정보 처리방침</span><b>›</b></button><button className="logout" onClick={logout}>↩️ <span>로그아웃</span><b>›</b></button></div>
    <small className="app-version">ZIPPY v0.9.1 · 개발 중</small>
  </div>
  if (boot && screen === 'exception') page = <><div className="eyebrow urgent">EXCEPTION CARE</div><h2 className="hero-title one-line">{activeExceptions.length ? '지금 확인이 필요해요' : '현재 예외 상황이 없어요'}</h2>{activeExceptions.length ? <Card className="urgent-card"><span className="small-badge danger">예외 상황 {activeExceptions.length}건</span><strong>{activeExceptions[0].reason}</strong><p>진행 중인 대안을 확인하고 담당자를 조정해 주세요.</p></Card> : <Card className="urgent-card safe"><span className="small-badge ok">정상</span><strong>감지된 일정 충돌이 없어요.</strong><p>가족 일정이 겹치면 이 화면에서 바로 알려드릴게요.</p></Card>}<Section>진행 중인 대안</Section>{activeExceptions.length ? activeExceptions.map(e => <Card key={e.id} className="exception-card"><strong>{e.reason}</strong><p>대안 · {member(e.alternative_member_id)}</p><span className="small-badge danger">확인 대기</span><button className="primary-button" onClick={() => run(() => send('/exceptions/' + e.id + '/approve', 'POST'), '대안을 요청했어요')}>대안 승인</button></Card>) : <Empty title="새로운 대안이 없어요" text="충돌이 생기면 해결책을 이곳에서 확인할 수 있어요" />}<Section>직접 대안 제안</Section><Card className="form-card"><label className="form-label">조정할 배정</label><select className="form-control" value={assignmentId || ''} onChange={e => setAssignmentId(e.target.value)}><option value="">배정을 선택하세요</option>{assignments.filter(a => a.status === 'ACCEPTED').map(a => <option key={a.id} value={a.id}>{itemFor(a)?.title} · {member(a.assignee_id)}</option>)}</select><label className="form-label">다른 담당자</label><select className="form-control" value={alternative} onChange={e => setAlternative(e.target.value)}>{members.filter(m => m.id !== me?.member.id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><label className="form-label">사유</label><input className="form-control" value={reason} onChange={e => setReason(e.target.value)} /><button className="primary-button wide-button" onClick={() => run(async () => { if (!assignmentId) throw new Error('배정을 선택해주세요'); await send('/exceptions', 'POST', { assignment_id: assignmentId, alternative_member_id: alternative, reason }) }, '대안을 등록했어요')}>대안 만들기</button></Card></>
  if (boot && screen === 'notifications') page = <div className="figma-notifications">
    <div className="notification-title-row"><h2>알림</h2><button disabled={!visibleNotices.some(notice => !notice.is_read)} onClick={() => run(async () => { await Promise.all(visibleNotices.filter(notice => !notice.is_read).map(notice => send('/notifications/' + notice.id + '/read', 'PATCH'))) }, '알림을 모두 읽었어요')}>모두 읽음</button></div>
    <div className="notification-scope" role="tablist" aria-label="알림 범위"><button role="tab" aria-selected={noticeScope === 'mine'} className={noticeScope === 'mine' ? 'active' : ''} onClick={() => setNoticeScope('mine')}>나에게 온 것</button><button role="tab" aria-selected={noticeScope === 'family'} className={noticeScope === 'family' ? 'active' : ''} onClick={() => setNoticeScope('family')}>전체 가족</button></div>
    <div className="notification-groups">{noticeGroups.map(([key, notices]) => <section key={key}><h3>{key === todayKey ? '오늘' : key === yesterdayKey ? '어제' : formatDate(key + 'T00:00:00')}</h3><div>{notices.map(notice => <button key={notice.id} className={'notification-row ' + (notice.is_read ? 'read' : '')} onClick={() => void openNotice(notice)}><i className={notice.level === 'IMPORTANT' ? 'important' : ''} /><span><strong>{notice.title}</strong><small>{notice.body}</small><em>{formatTime(notice.created_at)}</em></span>{!notice.is_read && <b />}</button>)}</div></section>)}</div>
    {!visibleNotices.length && <Empty title="새로운 알림이 없어요" text="돌봄 요청이나 완료 소식이 오면 여기에 표시돼요" />}
    <button className="notification-settings-link" onClick={() => go('settings')}>알림 설정</button>
    <p className="notification-note">탭하면 해당 화면으로 바로 이동합니다.</p>
  </div>
  if (boot && screen === 'members') page = <><div className="eyebrow">우리 가족 · {boot.family.name}</div><h2 className="hero-title">돌봄 구성원</h2><p className="hero-copy">현재 사용자: {me?.member.name ?? member(viewer)} · {me?.authenticated ? '가족방 세션 연결됨' : '데모 가족'}</p>
    {me?.authenticated && !!me.member.is_owner && <Card className="family-name-card"><label className="form-label">가족방 이름</label><div><input className="form-control" value={familyNameInput} maxLength={100} onChange={event => setFamilyNameInput(event.target.value)} /><button className="outline-button" disabled={!familyNameInput.trim() || familyNameInput.trim() === boot.family.name} onClick={() => run(() => send('/families', 'PATCH', { name: familyNameInput.trim() }), '가족방 이름을 변경했어요')}>이름 변경</button></div></Card>}
    <Section action={<button className="text-link" onClick={() => void openInviteShare()}>＋ 초대</button>}>가족 구성원</Section><div className="member-settings-list">{boot.members.filter(m => m.status !== 'REMOVED').map(m => <Card key={m.id} className="member-card"><div className="person-avatar profile member-initial-avatar" style={{ background: profileColorForMember(m.id) }}>{m.name.trim().slice(0, 1)}<img className="presence" src={memberIsOnline(m.id) ? memberActiveIcon : memberInactiveIcon} alt={memberIsOnline(m.id) ? '활동 중' : '비활동 중'} /></div><div><strong>{m.name}{m.id === me?.member.id ? <em className="member-me">나</em> : ''}</strong><p>{m.role === 'GRANDPARENT' ? '할머니·할아버지' : m.role === 'CAREGIVER' ? '돌봄 참여자' : m.is_owner ? '엄마·아빠 · 주돌봄자' : '엄마·아빠'}</p></div><span className={'member-status-pill ' + (m.status === 'PENDING' ? 'pending' : memberIsOnline(m.id) ? 'online' : '')}>{m.status === 'PENDING' ? '초대 중' : memberIsOnline(m.id) ? '활성' : '비활성'}</span>{m.status === 'PENDING' && !me?.authenticated && <button className="text-link" onClick={() => run(() => send('/members/' + m.id + '/accept', 'POST'), '가족에 합류했어요')}>합류</button>}{me?.authenticated && !!me.member.is_owner && !m.is_owner && <div className="member-actions">{m.status === 'ACTIVE' && <button className="member-owner-transfer" onClick={() => transferOwnership(m.id, m.name)}>주돌봄자 지정</button>}<button className="member-remove" onClick={() => { if (confirm(m.name + '님을 가족방에서 퇴장시킬까요?')) void run(() => send('/members/' + m.id + '/remove', 'POST'), m.name + '님을 가족방에서 퇴장시켰어요') }}>퇴장</button></div>}</Card>)}</div>
    <Section>아이</Section>{boot.children.map(c => <Card key={c.id} className="member-card child-setting-card">{c.photo_url ? <img className="child-avatar child-avatar-photo" src={c.photo_url} alt={`${c.name} 프로필 사진`} /> : <div className="child-avatar">{c.name.slice(0, 1)}</div>}<div><strong>{c.name}</strong><p>{c.age_label}</p></div><button className="child-profile-open" onClick={() => openChildProfile(c)}>프로필 수정</button></Card>)}
    {(!me?.authenticated || me.member.is_owner) && <Card className="form-card"><strong>아이 등록</strong><label className="form-label">이름</label><input className="form-control" aria-label="아이 이름" value={childNameInput} onChange={e => setChildNameInput(e.target.value)} placeholder="아이 이름" /><label className="form-label">나이·학교</label><input className="form-control" aria-label="아이 나이·학교" value={childAgeInput} onChange={e => setChildAgeInput(e.target.value)} placeholder="예: 7세 · 초등학교" /><button className="primary-button wide-button" onClick={() => run(async () => { if (!childNameInput.trim() || !childAgeInput.trim()) throw new Error('아이 이름과 나이·학교를 입력해주세요'); await send('/children', 'POST', { name: childNameInput.trim(), age_label: childAgeInput.trim() }); setChildNameInput(''); setChildAgeInput('') }, '아이를 등록했어요')}>아이 등록</button></Card>}
    {!me?.authenticated && <><Section>데모 구성원 추가</Section><Card className="form-card"><label className="form-label">이름</label><input className="form-control" value={memberNameInput} onChange={e => setMemberNameInput(e.target.value)} placeholder="가족 이름" /><label className="form-label">역할</label><select className="form-control" value={memberRole} onChange={e => setMemberRole(e.target.value)}><option value="PARENT">부모</option><option value="GRANDPARENT">조부모</option><option value="CAREGIVER">돌봄 참여자</option></select><button className="primary-button wide-button" onClick={() => run(async () => { if (!memberNameInput.trim()) throw new Error('이름을 입력해주세요'); await send('/members', 'POST', { name: memberNameInput.trim(), role: memberRole }); setMemberNameInput('') }, '초대 대기 구성원을 추가했어요')}>구성원 추가</button></Card></>}
    <button className="text-link centered" onClick={() => go('permissions')}>정보 공개 권한 관리</button>{me?.authenticated ? me.member.is_owner ? <button className="danger-link centered" onClick={() => void deleteFamily()}>가족방 삭제</button> : <button className="danger-link centered" onClick={() => void leaveFamily()}>가족방 나가기</button> : <button className="text-link centered" onClick={() => void leaveFamily()}>다른 가족방 만들기·참가</button>}
  </>
  if (boot && screen === 'childProfile') page = <section className="child-profile-page"><div className="eyebrow">아이 프로필 수정</div><h2 className="hero-title one-line">아이 정보를 최신으로 관리해요</h2><p className="hero-copy">전학이나 기관 변경이 생기면 이름·나이·학교 정보를 여기서 바꿀 수 있어요.</p>{activeChildProfile ? <><Card className="child-profile-photo-card"><label>{activeChildProfile.photo_url ? <img src={activeChildProfile.photo_url} alt={`${activeChildProfile.name} 프로필`} /> : <span>{activeChildProfile.name.slice(0, 1)}</span>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) updateChildPhoto(activeChildProfile.id, file) }} /><b>{activeChildProfile.photo_url ? '사진 변경' : '사진 추가'}</b></label>{activeChildProfile.photo_url && <button className="text-link" onClick={() => removeChildPhoto(activeChildProfile.id)}>사진 삭제</button>}</Card><Card className="form-card child-profile-form"><label className="form-label">아이 이름</label><input className="form-control" value={childProfileName} onChange={event => setChildProfileName(event.target.value)} placeholder="아이 이름" /><label className="form-label">생년월일·나이·학교/기관</label><input className="form-control" value={childProfileAge} onChange={event => setChildProfileAge(event.target.value)} placeholder="예: 만 7세 · 한빛초등학교" /><button className="primary-button wide-button" onClick={saveChildProfile}>프로필 저장</button></Card></> : <Empty title="아이 정보를 찾을 수 없어요" text="가족 설정에서 아이를 다시 선택해주세요" />}</section>
  if (screen === 'onboarding' && invitationFromUrl && inviteStep === 'preview') page = <div className="invite-landing"><div className="invite-brand"><i /><strong>초대장</strong></div><Card className="invite-welcome"><h2>{invitePreview?.owner_name ?? '가족'}님이<br />{invitePreview?.family_name ?? 'ZIPPY'}에<br />초대했어요</h2><div className="invite-role"><span>{roleLabel[onboardRole].slice(0, 1)}</span><div><strong>역할 — {roleLabel[onboardRole]}</strong><small>역할은 다음 화면에서 바꿀 수 있어요</small></div></div><ul><li>오늘 내게 부탁된 일만 보여요</li><li>가족 캘린더는 권한에 맞게 보여요</li><li>가전 제어 권한은 없어요</li></ul><button className="primary-button wide-button" onClick={() => setInviteStep('role')}>합류할게요</button><small className="invite-account-note">이미 계정이 있어 추가 가입 없이 바로 합류합니다.</small></Card><button className="text-link centered invite-later" onClick={() => { const clean = new URL(location.href); clean.search = ''; history.replaceState(null, '', clean.pathname); setOnboardMode('create'); setInviteStep('role') }}>나중에 결정하기</button></div>
  if (screen === 'onboarding' && invitationFromUrl && inviteStep === 'role') page = <div className="onboard-flow"><div className="onboard-step-head"><button aria-label="초대장으로 돌아가기" onClick={() => setInviteStep('preview')}>‹</button><div className="onboard-step-track"><span className="active" /><span /><span /><span /></div><small>1/4</small></div><h2 className="hero-title">이 가족에서<br />어떤 역할인가요?</h2><p className="hero-copy">역할에 따라 보이는 정보와 알림이 자동으로 정해집니다.</p><div className="onboard-role-list">{([['PARENT', '제2돌봄자', '업무 캘린더 동기화 + 내 배정'], ['GRANDPARENT', '조부모 / 친척', '오늘 내게 배정된 태스크 카드만'], ['CAREGIVER', '기타 돌봄자', '시터·돌봄선생님']] as const).map(([value, title, detail]) => <button key={value} className={onboardRole === value ? 'active' : ''} onClick={() => setOnboardRole(value)}>{onboardRole === value ? <img src={selectedRoleIcon} alt="선택됨" /> : <img src={otherRoleIcon} alt="" />}<span><strong>{title}</strong><small>{detail}</small></span></button>)}</div><label className="form-label join-name-label">가족에게 보일 내 이름</label><input className="form-control" value={onboardName} onChange={event => setOnboardName(event.target.value)} placeholder="예: 이지윤" /><button className="primary-button wide-button onboard-next" disabled={!onboardName.trim()} onClick={() => setInviteStep('notifications')}>다음</button></div>
  if (screen === 'onboarding' && invitationFromUrl && inviteStep === 'notifications') page = <div className="onboard-flow notification-onboard"><h2 className="hero-title">중요한 순간에만<br />알려드려요</h2><div className="notification-examples"><Card><i className="red" /><span><strong>픽업 담당자가 필요할 때</strong><small>즉시 알림</small></span></Card><Card><i className="gold" /><span><strong>준비물이 빠졌을 때</strong><small>출발 임박에만 진동</small></span></Card><Card><i className="pink" /><span><strong>그 밖의 정보</strong><small>하루 1회 모아서</small></span></Card></div><Card className="notification-promise">평소와 같은 배정은 알리지 않습니다. 달라질 때만 말을 겁니다.</Card><div className="onboard-bottom-actions"><button className="primary-button wide-button" disabled={onboardBusy} onClick={() => void finishInviteJoin(true)}>알림 허용하기</button><button className="text-link centered" disabled={onboardBusy} onClick={() => void finishInviteJoin(false)}>나중에 설정</button></div></div>
  if (screen === 'onboarding' && !invitationFromUrl && onboardStep === 'ROOM') page = <div className="family-onboard-start"><span className="eyebrow">ZIPPY · 가족방 시작</span><h2 className="hero-title">가족의 돌봄을<br />함께 이어요</h2><p className="hero-copy">새 가족방을 만들거나,<br />가족에게 받은 초대 링크·코드로 참여하세요.</p><div className="choice-row"><button className={'choice-chip ' + (onboardMode === 'create' ? 'active' : '')} onClick={() => setOnboardMode('create')}>가족방 만들기</button><button className={'choice-chip ' + (onboardMode === 'join' ? 'active' : '')} onClick={() => setOnboardMode('join')}>초대코드로 참가</button></div><Card className="form-card">{onboardMode === 'create' ? <><label className="form-label">가족방 이름</label><input className="form-control" value={onboardFamilyName} onChange={event => setOnboardFamilyName(event.target.value)} placeholder="예: 지우네 가족" /></> : <><label className="form-label">초대 코드</label><input className="form-control" value={onboardInviteCode} onChange={event => setOnboardInviteCode(event.target.value.toUpperCase())} placeholder="가족에게 받은 코드" /></>}<label className="form-label">내 이름</label><input className="form-control" value={onboardName} onChange={event => setOnboardName(event.target.value)} placeholder="예: 김지연" /></Card><button className="primary-button wide-button" disabled={onboardBusy || !onboardName.trim() || (onboardMode === 'create' ? !onboardFamilyName.trim() : !onboardInviteCode.trim())} onClick={enterFamily}>{onboardBusy ? '연결 중…' : onboardMode === 'create' ? '가족방 만들기' : '가족방 참가'}</button>{boot && <button className="text-link centered" onClick={() => go('home')}>현재 가족방으로 돌아가기</button>}</div>
  if (screen === 'onboarding' && !invitationFromUrl && onboardStep === 'ROLE') page = <div className="onboard-flow"><div className="onboard-step-head"><button aria-label="가족방 정보로 돌아가기" onClick={() => setOnboardStep('ROOM')}>‹</button><div className="onboard-step-track"><span className="active" /><span /><span /><span /></div><small>1/4</small></div><h2 className="hero-title">이 가족에서<br />어떤 역할인가요?</h2><p className="hero-copy">역할에 따라 보이는 정보와 알림이 자동으로 정해집니다. 나중에 바꿀 수 있습니다.</p><div className="onboard-role-list">{([['PARENT', '주양육자', '전체 가족 캘린더 풀뷰'], ['PARENT_HELPER', '제2양육자', '업무 캘린더 동기화 + 내 배정'], ['GRANDPARENT', '조부모 / 친척', '오늘 내게 배정된 태스크 카드만'], ['CAREGIVER', '기타 돌봄자', '시터·돌봄선생님']] as const).map(([value, title, detail]) => <button key={value} className={onboardRoleChoice === value ? 'active' : ''} onClick={() => { setOnboardRoleChoice(value); setOnboardRole(value === 'PARENT_HELPER' ? 'PARENT' : value) }}>{onboardRoleChoice === value ? <img src={selectedRoleIcon} alt="선택됨" /> : <img src={otherRoleIcon} alt="" />}<span><strong>{title}</strong><small>{detail}</small></span></button>)}</div><button className="primary-button wide-button onboard-next" onClick={() => setOnboardStep('CHILD')}>다음</button></div>
  if (screen === 'onboarding' && !invitationFromUrl && onboardStep === 'CHILD') page = <div className="onboard-flow"><div className="onboard-step-head"><button aria-label="역할 선택으로 돌아가기" onClick={() => setOnboardStep('ROLE')}>‹</button><div className="onboard-step-track"><span className="active" /><span className="active" /><span className="active" /><span /></div><small>3/4</small></div><h2 className="hero-title">아이 정보를 알려주세요</h2>{onboardChildren.length > 0 && <div className="onboard-child-list">{onboardChildren.map((kid, index) => <Card key={`${kid.name}-${index}`}><span><strong>{kid.name}</strong><small>{kid.ageLabel}{kid.photo ? ' · 사진 등록됨' : ''}</small></span><button aria-label={`${kid.name} 삭제`} onClick={() => setOnboardChildren(current => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></Card>)}</div>}<Card className="form-card child-onboard-card"><label className="child-photo-picker">{childPhotoPreview ? <img src={childPhotoPreview} alt="선택한 프로필 사진" /> : <span>＋ 프로필 사진</span>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { selectChildPhoto(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} /></label><label className="form-label">이름</label><input className="form-control" value={childNameInput} onChange={event => setChildNameInput(event.target.value)} placeholder="아이 이름" /><label className="form-label">생년월일·나이·기관</label><input className="form-control" value={childAgeInput} onChange={event => setChildAgeInput(event.target.value)} placeholder="예: 만 7세 · 한빛초등학교" /><button className="outline-button wide-button" onClick={addOnboardChild}>＋ 자녀 추가</button></Card><Card className="academy-optional"><strong>일정은 가족방에서 등록해요</strong><p>가족방에 들어간 뒤 캘린더의 ＋ 버튼에서 아이 일정과 루틴을 추가할 수 있어요.</p></Card><button className="primary-button wide-button onboard-next" disabled={onboardBusy} onClick={() => void saveOnboardChildren()}>{onboardBusy ? '등록 중…' : '다음'}</button></div>
  if (screen === 'onboarding' && !invitationFromUrl && onboardStep === 'INVITE_SETUP') page = <div className="onboard-flow"><div className="onboard-step-head"><button aria-label="아이 정보로 돌아가기" onClick={() => setOnboardStep('CHILD')}>‹</button><div className="onboard-step-track"><span className="active" /><span className="active" /><span className="active" /><span className="active" /></div><small>4/4</small></div><h2 className="hero-title">함께 챙길 가족을 초대해보세요</h2><p className="hero-copy">링크 하나로 가족과 돌봄자를 초대할 수 있어요.</p><div className="invite-role-buttons single"><button onClick={() => { setInviteRole('CAREGIVER'); setOnboardStep('INVITE') }}><span>＋</span><span><strong>가족 초대하기</strong><small>초대받은 사람이 참여할 역할을 직접 선택해요</small></span></button></div><Card className="permission-separation"><strong>권한은 분리됩니다</strong><p>ZIPPY에 초대해도 가전 제어 권한은 따라가지 않습니다.</p></Card><button className="secondary-bottom-button" onClick={() => { setOnboardStep('ROOM'); go('home') }}>나중에 할게요</button></div>
  if (screen === 'onboarding' && !invitationFromUrl && onboardStep === 'INVITE') page = <div className="onboard-flow invite-code-page"><span className="eyebrow">초대하기</span><h2 className="hero-title">가족 초대하기</h2><p className="hero-copy">아래 코드나 링크를 공유하면 ZIPPY에 함께할 수 있어요.</p><Card className="invite-code-card"><label>초대 코드</label><div><strong>{inviteCode || '코드 생성 중'}</strong><button onClick={() => { void navigator.clipboard?.writeText(inviteCode); setToast('초대 코드를 복사했어요.') }}>복사 ✓</button></div><small>코드는 만료 전까지 여러 가족이 사용할 수 있어요.</small></Card><Card className="invite-link-card"><label>초대 링크</label><div><input value={inviteLink} readOnly /><button onClick={() => void copyInvite()}>복사 ✓</button></div></Card><button className="kakao-share wide-button" onClick={() => void shareInvite('kakao')}><img src={inviteKakaoIcon} alt="" />카카오톡으로 공유하기</button><div className="invite-share-options"><button onClick={() => void shareInvite('sms')}><img src={inviteMessageIcon} alt="" />문자 메시지</button><button onClick={() => void copyInvite()}><img src={inviteLinkIcon} alt="" />링크 복사</button></div><Card className="permission-separation"><strong>권한은 분리됩니다</strong><p>ZIPPY에 초대해도 가전 제어 권한은 따라가지 않습니다.</p></Card><button className="primary-button wide-button" onClick={() => go('home')}>가족방으로 들어가기</button></div>
  if (boot && screen === 'calendar') page = <><div className="eyebrow">개인 캘린더 연동</div><h2 className="hero-title">개인 일정을<br />편하게 연동해보세요</h2><p className="hero-copy">Google Calendar나 Outlook을 연결하면 업무·약속·개인 일정을 가족 캘린더에서 한 번에 확인할 수 있어요.</p>{calendarConnections.map(connection => { const label = connection.provider === 'google' ? 'Google Calendar' : 'Outlook Calendar'; return <Card key={connection.provider} className="calendar-provider"><img className="provider-icon" src={connection.provider === 'google' ? googleIcon : outlookIcon} alt="" /><div><strong>{label}</strong><p>{connection.connected ? `연결됨${connection.synced_at ? ' · 최근 동기화 ' + formatDate(connection.synced_at) : ''}` : connection.configured ? '계정을 연결할 수 있어요' : 'OAuth 앱 설정이 필요해요'}</p></div>{connection.connected ? <span className="calendar-provider-actions"><button className="text-link" onClick={() => syncCalendar(connection.provider)}>동기화</button><button className="text-link disconnect" onClick={() => void disconnectCalendar(connection.provider)}>연동 해제</button></span> : <button className="text-link" disabled={!connection.configured} onClick={() => connectCalendar(connection.provider)}>{connection.configured ? '연결' : '설정 전'}</button>}</Card> })}<Card className="info-note">{calendarsReady ? 'Google·Outlook OAuth 설정을 모두 확인했어요. 연결 버튼을 누르고 각 계정에서 일정 읽기 권한을 허용하면 동기화할 수 있어요.' : '사용할 캘린더의 OAuth Client ID와 Secret을 backend/.env에 설정하면 연결 버튼이 활성화돼요.'}</Card><button className="primary-button wide-button" onClick={() => { setScheduleForm('PERSONAL'); setScheduleKind('ROUTINE'); go('schedule') }}>개인 루틴 직접 등록</button></>
  if (boot && screen === 'permissions') { const targetMember = me?.member.id ?? viewer; page = <><div className="eyebrow">내 정보 공개 범위</div><h2 className="hero-title">보여주고 싶은 정보만<br />직접 선택해요</h2><p className="hero-copy">각 구성원이 자신의 정보 공개 범위를 직접 관리해요. 다른 가족의 설정은 변경할 수 없어요.</p><Section>{member(targetMember)}님의 공개 범위</Section>{[['SCHEDULE_DETAIL', '개인 일정 내용', '켜면 제목까지, 끄면 시간과 바쁨 여부만 표시'], ['WORK_DETAIL', '업무 내용', '켜면 제목까지, 끄면 시간과 바쁨 여부만 표시'], ['LOCATION', '현황', '돌봄 이동 현황']].map(([scope, name, detail]) => { const allowed = !!boot.permissions.find(p => p.member_id === targetMember && p.scope === scope)?.is_allowed; return <Card key={scope} className="permission-row"><div><strong>{name}</strong><p>{detail}</p></div><button className={'switch ' + (allowed ? 'on' : '')} role="switch" aria-checked={allowed} aria-label={name + ' 공개'} onClick={() => run(() => send('/members/' + targetMember + '/permissions', 'PATCH', { scope, is_allowed: !allowed }), '내 공개 범위를 변경했어요')}><span /></button></Card> })}<Card className="info-note">개인 일정 내용은 기본 비공개예요. 꺼두면 다른 가족에게 일정 제목 대신 ‘바쁨’으로 보여요.</Card></> }
  if (boot && screen === 'settings') page = <><div className="eyebrow">알림 설정</div><h2 className="hero-title one-line">조용하지만 놓치지 않게</h2><p className="hero-copy">돌봄 요청이 오면 앱 알림함과 허용된 브라우저 알림으로 알려드려요.</p><Section>앱 알림</Section><Card className="permission-row"><div><strong>돌봄 알림 받기</strong><p>등록, 배정, 인수인계, 완료</p></div><button className={'switch ' + (appNotices ? 'on' : '')} role="switch" aria-checked={appNotices} aria-label="돌봄 알림 받기" onClick={() => run(() => send('/members/' + notificationMemberId + '/notification-preferences', 'PATCH', { app_enabled: !appNotices }), '알림 설정을 변경했어요')}><span /></button></Card><Card className="permission-row"><div><strong>이 기기 시스템 알림</strong><p>앱이 열려 있을 때 새 요청을 브라우저 알림으로 표시</p></div><button className="text-link" onClick={() => void enableBrowserNotifications()}>{'Notification' in window && Notification.permission === 'granted' ? '허용됨' : '허용하기'}</button></Card><Card className="permission-row"><div><strong>하루 1회 모아보기</strong><p>21:00에 확인할 정보만 요약</p></div><button className={'switch ' + (dailyDigest ? 'on' : '')} role="switch" aria-checked={dailyDigest} aria-label="하루 1회 모아보기" onClick={() => run(() => send('/members/' + notificationMemberId + '/notification-preferences', 'PATCH', { daily_digest_enabled: !dailyDigest }), '모아보기 설정을 변경했어요')}><span /></button></Card><Section>가전 알림 <Pro /></Section><Card className="permission-row"><div><strong>가전으로 알림 받기</strong><p>{plan === 'PRO' ? '켜면 TV·정수기 등 연동된 가전으로 돌봄 알림을 받아요.' : 'Pro 구독 후 가전 알림을 켤 수 있어요.'}</p></div><button className={'switch ' + (deviceNoticeDemo ? 'on' : '')} role="switch" aria-checked={deviceNoticeDemo} aria-label="가전으로 알림 받기" onClick={() => { if (plan !== 'PRO') { go('plan'); return }; const next = !deviceNoticeDemo; setDeviceNoticeDemo(next); void run(() => send('/members/' + notificationMemberId + '/notification-preferences', 'PATCH', { device_enabled: next }), next ? '가전 알림을 켰어요' : '가전 알림을 껐어요') }}><span /></button></Card>{plan === 'PRO' && deviceNoticeDemo && <button className="text-link settings-device-alert-link" onClick={() => { setDeviceAlertStep('main'); go('deviceAlerts') }}>어떤 가전에 어떤 알림을 보낼지 세부 설정 ›</button>}</>
  if (boot && screen === 'deviceAlerts') {
    const settings = deviceAlertData?.settings
    const catalog = deviceAlertData?.catalog ?? []
    const contentKeys = deviceAlertData?.content_keys ?? []
    const deviceName = (id: string) => catalog.find(item => item.id === id)?.name ?? id
    const screenDevices = catalog.filter(item => item.type === 'SCREEN')
    const voiceDevices = catalog.filter(item => item.type === 'VOICE')
    const noneDevices = catalog.filter(item => item.type === 'NONE')
    const enabledPriority = settings ? settings.priority.filter(id => settings.devices.includes(id)) : []
    const matrixOnCount = settings ? contentKeys.filter(key => settings.content_matrix[key.id]?.tv || settings.content_matrix[key.id]?.voice).length : 0
    const goDeviceAlertStep = (step: Exclude<typeof deviceAlertStep, 'main'>) => {
      setDeviceAlertStep(step)
      history.pushState({ ...history.state, lgdxScreen: 'deviceAlerts', lgdxDeviceAlertStep: step }, '')
    }
    const back = () => history.back()
    const patchMatrix = (keyId: string, channel: 'tv' | 'voice', value: boolean) => {
      if (!settings) return
      patchDeviceAlertSettings({ content_matrix: { [keyId]: { [channel]: value } } }, '알림 받을 내용을 변경했어요')
    }
    const moveDraftPriority = (index: number, direction: -1 | 1) => {
      const next = [...deviceAlertDraftPriority]
      const target = index + direction
      if (target < 0 || target >= next.length) return
      ;[next[index], next[target]] = [next[target], next[index]]
      setDeviceAlertDraftPriority(next)
    }

    if (!settings) {
      page = <section className="device-alert-page"><div className="care-subscreen-title"><strong>가전 알림</strong></div><Empty title="설정을 불러오는 중이에요" text="잠시만 기다려주세요" /></section>
    } else if (deviceAlertStep === 'devices') {
      page = <section className="device-alert-page">
        <div className="care-subscreen-title"><span /><strong>사용할 가전</strong><span /></div>
        <p className="hero-copy">연결된 가전 {catalog.length}대를 찾았어요<br />화면이나 스피커가 있는 가전만 선택할 수 있어요</p>
        <Section>화면 알림</Section>
        <div className="device-alert-list">{screenDevices.map(device => { const checked = deviceAlertDraftDevices.includes(device.id); return <button key={device.id} className={'device-alert-row' + (checked ? ' checked' : '')} onClick={() => setDeviceAlertDraftDevices(prev => checked ? prev.filter(id => id !== device.id) : [...prev, device.id])}><span><strong>{device.name}</strong><small>{device.location}{device.id === 'tv_living' && settings.tv_status === 'on' ? ' · ● 켜짐' : device.type === 'SCREEN' ? ' · ○ 꺼짐' : ''}</small></span><i>{checked && '✓'}</i></button> })}</div>
        <Section>음성 알림</Section>
        <div className="device-alert-list">{voiceDevices.map(device => { const checked = deviceAlertDraftDevices.includes(device.id); return <button key={device.id} className={'device-alert-row' + (checked ? ' checked' : '')} onClick={() => setDeviceAlertDraftDevices(prev => checked ? prev.filter(id => id !== device.id) : [...prev, device.id])}><span><strong>{device.name}</strong><small>{device.location}</small></span><i>{checked && '✓'}</i></button> })}</div>
        {!!noneDevices.length && <p className="helper-text device-alert-none-note">{noneDevices.map(device => device.name).join(' · ')} — 화면·스피커 없음 · 선택 불가</p>}
        <button className="primary-button wide-button" onClick={() => { patchDeviceAlertSettings({ devices: deviceAlertDraftDevices }, '사용할 가전을 저장했어요'); back() }}>{deviceAlertDraftDevices.length}대 사용하기</button>
      </section>
    } else if (deviceAlertStep === 'priority') {
      page = <section className="device-alert-page">
        <div className="care-subscreen-title"><span /><strong>우선순위</strong><button className="text-link" onClick={() => { patchDeviceAlertSettings({ priority: deviceAlertDraftPriority }, '우선순위를 저장했어요'); back() }}>저장</button></div>
        <p className="hero-copy">위에서부터 순서대로 확인해요<br />TV는 켜져 있을 때만, 나머지 가전은 항상 바로 알려드려요</p>
        <Card className="device-alert-rule-card">
          <p className="helper-text">버튼으로 순서를 바꿀 수 있어요 · 켜져 있지 않은 가전은 건너뛰고 다음 순위로 넘어가요</p>
          <div className="device-alert-priority-list">{deviceAlertDraftPriority.map((id, index) => { const device = catalog.find(item => item.id === id); return <div key={id} className={'device-alert-priority-row' + (deviceAlertDraftDevices.includes(id) ? '' : ' disabled')}><b>{index + 1}</b><span><strong>{deviceName(id)}</strong><small>{device?.location}{device?.type === 'SCREEN' ? ' · 화면' : ' · 음성'}{!deviceAlertDraftDevices.includes(id) ? ' · 사용 안 함' : ''}</small></span><div className="device-alert-priority-move"><button aria-label="위로" disabled={index === 0} onClick={() => moveDraftPriority(index, -1)}>▲</button><button aria-label="아래로" disabled={index === deviceAlertDraftPriority.length - 1} onClick={() => moveDraftPriority(index, 1)}>▼</button></div></div> })}</div>
        </Card>
        <div className="permission-row inline"><div><strong>긴급 알림은 TV 화면에도 소리로 함께</strong><p>순위와 상관없이 TV가 켜져 있으면 항상 울려요</p></div><button className={'switch ' + (settings.emergency_tv_sound ? 'on' : '')} role="switch" aria-checked={settings.emergency_tv_sound} aria-label="긴급 알림은 TV 화면에도 소리로 함께" onClick={() => patchDeviceAlertSettings({ emergency_tv_sound: !settings.emergency_tv_sound }, '설정을 변경했어요')}><span /></button></div>
      </section>
    } else if (deviceAlertStep === 'content') {
      const matrix = settings.content_matrix
      page = <section className="device-alert-page">
        <div className="care-subscreen-title"><span /><strong>알림 받을 내용</strong><span /></div>
        <table className="device-alert-matrix"><thead><tr><th>내용</th><th>TV</th><th>음성</th></tr></thead><tbody>{contentKeys.map(key => { const value = matrix[key.id] ?? { tv: false, voice: false }; return <tr key={key.id}><td><strong>{key.label}</strong>{key.locked && <small>항상 켜짐</small>}</td><td><input type="checkbox" className="item-checkbox" checked={value.tv} disabled={key.locked} onChange={() => patchMatrix(key.id, 'tv', !value.tv)} /></td><td><input type="checkbox" className="item-checkbox" checked={value.voice} disabled={key.locked} onChange={() => patchMatrix(key.id, 'voice', !value.voice)} /></td></tr> })}</tbody></table>
      </section>
    } else if (deviceAlertStep === 'quiet') {
      const previewAlert = { key: 'preview', tier: 2 as const, kind: 'schedule' as const, contentKey: 'departure_reminder', title: '민솔이 하원 30분 전이에요', body: '', meta: '' }
      const previewText = speechMessageFor(previewAlert)
      page = <section className="device-alert-page">
        <div className="care-subscreen-title"><span /><strong>음성 · 방해 금지</strong><span /></div>
        <Section>음성 안내</Section>
        <Card className="device-alert-rule-card">
          <strong>말하는 내용 미리듣기</strong>
          <p className="device-alert-preview-text">“{previewText}”</p>
          <label className="form-label">음량 {settings.speech_volume}%</label>
          <input type="range" min={0} max={100} value={settings.speech_volume} onChange={event => setDeviceAlertData(prev => prev ? { ...prev, settings: { ...prev.settings, speech_volume: Number(event.target.value) } } : prev)} onMouseUp={() => patchDeviceAlertSettings({ speech_volume: settings.speech_volume }, '음량을 변경했어요')} onTouchEnd={() => patchDeviceAlertSettings({ speech_volume: settings.speech_volume }, '음량을 변경했어요')} />
        </Card>
        <Section>방해 금지</Section>
        <Card className="device-alert-rule-card">
          <div className="device-alert-quiet-range"><label className="form-label">가전 알림 끄는 시간</label><div><input type="time" className="form-control" value={settings.quiet_start} onChange={event => patchDeviceAlertSettings({ quiet_start: event.target.value }, '방해 금지 시간을 변경했어요')} /><span>–</span><input type="time" className="form-control" value={settings.quiet_end} onChange={event => patchDeviceAlertSettings({ quiet_end: event.target.value }, '방해 금지 시간을 변경했어요')} /></div></div>
          <div className="permission-row inline"><div><strong>아이 낮잠 · 취침 중엔 음성 끄기</strong><p>루틴의 취침 시간 기준</p></div><button className={'switch ' + (settings.mute_during_naptime ? 'on' : '')} role="switch" aria-checked={settings.mute_during_naptime} aria-label="아이 낮잠 취침 중엔 음성 끄기" onClick={() => patchDeviceAlertSettings({ mute_during_naptime: !settings.mute_during_naptime }, '설정을 변경했어요')}><span /></button></div>
        </Card>
      </section>
    } else if (deviceAlertStep === 'test') {
      page = <section className="device-alert-page">
        <div className="care-subscreen-title"><span /><strong>테스트 알림</strong><span /></div>
        <p className="hero-copy">지금 보내면 이렇게 울려요<br />우선순위 순서대로 확인해서 가장 먼저 사용 가능한 가전으로 알려드려요</p>
        {deviceAlertTestResult && <Card className={'device-alert-test-result ' + (deviceAlertTestResult.channel === 'TV' ? 'tv' : 'voice')}>
          <span className="small-badge ok">{deviceAlertTestResult.channel === 'TV' ? '화면 알림' : deviceAlertTestResult.channel === 'VOICE' ? '음성 알림' : '알림 없음'}</span>
          <strong>{deviceAlertTestResult.device_name ?? '알림을 받을 가전이 없어요'}</strong>
          <p>“{deviceAlertTestResult.message}”</p>
        </Card>}
        <button className="primary-button wide-button" onClick={runDeviceAlertTest}>지금 테스트로 보내기</button>
        <button className="text-link centered" onClick={() => { setDeviceAlertTestForceOff(value => !value); setDeviceAlertTestResult(null) }}>{deviceAlertTestForceOff ? 'TV 켜짐 상태로 테스트' : 'TV 꺼짐 상태로 테스트'}</button>
      </section>
    } else {
      page = <section className="device-alert-page">
        <div className="care-subscreen-title"><strong>가전 알림</strong><Pro /></div>
        <Card className="permission-row"><div><strong>가전으로 알림 받기</strong><p>본 스위치는 알림 설정과 항상 함께 갑니다</p></div><button className={'switch ' + (deviceNoticeDemo ? 'on' : '')} role="switch" aria-checked={deviceNoticeDemo} aria-label="가전으로 알림 받기" onClick={() => { const next = !deviceNoticeDemo; setDeviceNoticeDemo(next); void run(() => send('/members/' + notificationMemberId + '/notification-preferences', 'PATCH', { device_enabled: next }), next ? '가전 알림을 켰어요' : '가전 알림을 껐어요') }}><span /></button></Card>
        <Section>지금 설정된 우선순위</Section>
        <div className="device-alert-summary-list">
          <div className="device-alert-summary-row"><span><strong>{enabledPriority.length ? enabledPriority.map((id, index) => `${index + 1} ${deviceName(id)}`).join(' → ') : '우선순위에 등록된 가전이 없어요'}</strong><small>맨 앞 가전부터 확인해서, 꺼져 있으면 자동으로 다음 순위로 넘어가요</small></span></div>
        </div>
        <div className="hub-list device-alert-menu">
          <button onClick={() => { setDeviceAlertDraftDevices(settings.devices); goDeviceAlertStep('devices') }}><span><strong>사용할 가전</strong></span><small>{settings.devices.length}대 선택</small><b>›</b></button>
          <button onClick={() => { setDeviceAlertDraftPriority(catalog.map(device => device.id).sort((a, b) => { const ai = settings.priority.indexOf(a); const bi = settings.priority.indexOf(b); return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) })); goDeviceAlertStep('priority') }}><span><strong>우선순위</strong></span><b>›</b></button>
          <button onClick={() => goDeviceAlertStep('content')}><span><strong>알림 받을 내용</strong></span><small>{matrixOnCount}/{contentKeys.length}</small><b>›</b></button>
          <button onClick={() => goDeviceAlertStep('quiet')}><span><strong>음성 · 방해 금지</strong></span><small>{settings.quiet_start}-{settings.quiet_end}시</small><b>›</b></button>
        </div>
        <button className="outline-button wide-button" onClick={() => { setDeviceAlertTestResult(null); setDeviceAlertTestForceOff(false); goDeviceAlertStep('test') }}>테스트 알림 보내기</button>
      </section>
    }
  }
  if (boot && screen === 'plan') page = <section className="pro-guide-page">
    <div className="pro-guide-hero">
      <button className="pro-guide-close" aria-label="플랜 화면 닫기" onClick={() => go('more')}>× <span>플랜</span></button>
      <img className="pro-plan-badge" src={proPlanBadge} alt="PRO 플랜" />
      <div className="pro-guide-title"><div><h2>Pro로 할 수 있는 것</h2><p>가족의 돌봄을 넉넉하게 이어가세요.</p></div><img src={proCharacter} alt="ZIPPY Pro 캐릭터" /></div>
      <div className="pro-cycle-tabs"><button className={billingCycle === 'MONTHLY' ? 'active' : ''} aria-pressed={billingCycle === 'MONTHLY'} onClick={() => setBillingCycle('MONTHLY')}>월간</button><button className={billingCycle === 'ANNUAL' ? 'active' : ''} aria-pressed={billingCycle === 'ANNUAL'} onClick={() => setBillingCycle('ANNUAL')}>연간 <small>-20%</small></button></div>
    </div>
    <div className="pro-guide-body">
      <img className="pro-comparison-asset" src={proComparisonAsset} alt="Free와 Pro 기능 비교. Pro는 알림장 인식 10회, 보호자 8명, 아이 무제한, 더 많은 AI 대화, 음성 등록, 긴급 도움 요청, 가전 알림을 제공합니다." />
      {subscription?.status === 'ACTIVE' || subscription?.developer_preview
        ? <div className="subscription-active pro-guide-subscription"><div><strong>{subscription.developer_preview ? 'Pro 체험 중 (개발자 모드)' : subscription.cancel_at_period_end ? '구독 취소 예약됨' : 'Pro 이용 중'}</strong><small>{subscription.developer_preview ? '실제 결제 없이 Pro 화면을 확인하고 있어요.' : `${formatDate(subscription.current_period_end ?? subscription.next_billing_at)}까지 Pro 이용 가능`}</small>{!subscription.developer_preview && <small>{subscription.cancel_at_period_end ? '다음 결제는 진행되지 않아요.' : subscription.auto_renew_available ? '취소 전까지 매월 자동으로 갱신돼요.' : '현재 결제는 1개월 이용권이에요.'}</small>}</div>{subscription.developer_preview ? <button className="subscription-cancel-button" disabled={planBusy} onClick={() => previewPlan('FREE')}>Pro 체험 종료</button> : subscription.cancel_at_period_end && subscription.auto_renew_available ? <button className="subscription-resume-button" disabled={billingBusy} onClick={() => void resumeSubscription()}>자동 갱신 다시 켜기</button> : !subscription.cancel_at_period_end ? <button className="subscription-cancel-button" disabled={billingBusy || !me?.authenticated || !me.member.is_owner} onClick={() => void cancelSubscription()}>구독 취소</button> : null}</div>
        : <div className="pro-subscribe-area"><button className="pro-offer-asset" aria-label={billingOpen ? '결제창 접기' : `${billingCycle === 'ANNUAL' ? '연간' : '월간'} Pro 시작하기`} aria-expanded={billingOpen} disabled={billingBusy || !me?.authenticated || !me.member.is_owner} onClick={() => void toggleBilling()}><img src={billingCycle === 'ANNUAL' ? proAnnualOffer : proMonthlyOffer} alt={billingCycle === 'ANNUAL' ? '연 76,000원, Pro 시작하기, 첫 한달 무료 체험' : '월 7,900원, Pro 시작하기, 첫 한달 무료 체험'} /></button>{billingBusy && !billingOpen && <small className="payment-progress">결제 준비 중…</small>}{(!me?.authenticated || !me.member.is_owner) && <small className="payment-owner-note">플랜 결제는 주돌봄자 계정에서 진행할 수 있어요.</small>}{billingOpen && <div className="toss-inline-checkout"><div className="toss-heading"><span className="toss-mark">T</span><div><strong>토스페이먼츠 테스트 결제</strong><p>아래에서 결제수단과 약관을 확인해주세요.</p></div><b>{(billingOrder?.amount ?? 7900).toLocaleString()}원</b></div><div id="toss-payment-methods" className="toss-widget-slot" /><div id="toss-agreement" className="toss-widget-slot agreement" /><button className="toss-pay-button" disabled={billingBusy || !billingWidgetReady} onClick={() => void startWidgetPayment()}>{billingBusy || !billingWidgetReady ? '결제수단 불러오는 중…' : `${(billingOrder?.amount ?? 7900).toLocaleString()}원 결제하고 시작하기`}</button><small className="payment-caption">결제가 완료되면 Pro가 바로 활성화됩니다.</small></div>}</div>}
      {subscription?.dev_switch_available && <Card className="dev-plan-card pro-dev-card"><span className="small-badge danger">DEVELOPER MODE</span><strong>Free / Pro 화면 전환</strong><p>결제 없이 현재 가족방의 기능 권한을 바꿔 확인해요.</p><div className="dev-plan-switch"><button aria-pressed={plan === 'FREE'} disabled={planBusy || plan === 'FREE'} onClick={() => previewPlan('FREE')}>Free</button><button aria-pressed={plan === 'PRO'} disabled={planBusy || plan === 'PRO'} onClick={() => previewPlan('PRO')}>Pro</button></div></Card>}
    </div>
  </section>
  if (boot && screen === 'chat') page = <section className="assistant-chat-page" data-figma-node="714:2989">
    <header className="assistant-chat-header"><button aria-label="채팅 닫기" onClick={() => history.back()}>‹</button><img src={chatHeaderIcon} alt="" /><strong>케어 어시스턴트</strong><span className="assistant-plan">{plan === 'PRO' ? <Pro /> : 'FREE'}</span></header>
    <div className="assistant-token-bar"><div><span><i />AI 토큰</span><strong>{chatRemaining.toLocaleString()} <small>/ {chatTokenLimit.toLocaleString()}</small></strong></div><div className="assistant-token-track"><i style={{ width: `${chatRemainingPercent}%` }} /></div></div>
    <div className="assistant-chat-body">
      {!chatMessages.length && <Card className="chat-intro"><img className="voice-mark" src={voiceIcon} alt="" /><strong>무엇을 도와드릴까요?</strong><p>가족방의 일정·돌봄 정보·배정을 바탕으로<br />AI가 답해요. 배정 변경은 확인 없이 실행하지 않아요.</p></Card>}
      <div className="chat-thread">{chatMessages.map((m, index) => <div key={index} className={'chat-bubble ' + m.from}><div className="chat-copy">{m.text}</div>{m.from === 'agent' && m.cards?.map((card, cardIndex) => <article className="chat-summary-card" key={card.title + cardIndex}><small>{card.eyebrow}</small><strong>{card.title}</strong><p>{card.description}</p>{card.screen && <button onClick={() => { trackPerformanceEvent('chatbot_action_opened', { screen: card.screen }); go(card.screen as Screen) }}>{chatScreenLabel[card.screen as Screen] ?? '관련 화면 보기'}</button>}</article>)}</div>)}</div>
      <div className="chat-prompts">{['확인할 알림 알려줘', '오늘 담당 배정은?', '등록된 일정은?', '내일 준비물 확인'].map(text => <button key={text} disabled={chatBusy} onClick={() => sendChat(text)}>{text}</button>)}</div>
    </div>
    {chatBusy && <div className="assistant-chat-loading" role="status" aria-live="polite" aria-label="답변을 준비하고 있어요"><div>{[chatLoading1, chatLoading2, chatLoading3, chatLoading4].map((source, index) => <img key={source} src={source} alt="" style={{ animationDelay: `${index * .38}s` }} />)}</div><span>답변을 준비하고 있어요</span></div>}
    <form className="chat-composer" onSubmit={e => { e.preventDefault(); sendChat() }}><button className={recording ? 'chat-mic recording' : 'chat-mic'} type="button" aria-label={recording ? '음성 인식 끝내고 보내기' : chatBusy ? '음성 인식 중…' : '음성 인식'} disabled={chatBusy} onClick={toggleRecording}><img src={chatMicIcon} alt="" /></button><label><input aria-label="케어 어시스턴트에게 질문" value={chatDraft} onChange={e => setChatDraft(e.target.value)} placeholder="일정이나 배정을 물어보세요" /><button type="submit" aria-label="질문 보내기" disabled={chatBusy || !chatDraft.trim()}><img src={chatSendIcon} alt="" /></button></label></form>
  </section>
  if (boot && screen === 'emergency') page = <section className="emergency-request-page">
    <div className="care-subscreen-title"><strong>긴급 도움 요청 <Pro /></strong></div>
    <Card className="emergency-form-card"><label className="form-label">도움이 필요한 내 돌봄</label><select className="form-control" value={emergencyItem} onChange={e => setEmergencyItem(e.target.value)}><option value="">선택하세요</option>{assignments.filter(a => a.assignee_id === me?.member.id && a.status === 'ACCEPTED' && itemFor(a)?.starts_at && dateKey(itemFor(a)!.starts_at!) >= todayKey && dateKey(itemFor(a)!.starts_at!) <= weekWindowEndKey).sort((left, right) => (itemFor(left)?.starts_at ?? '').localeCompare(itemFor(right)?.starts_at ?? '')).map(a => <option key={a.id} value={a.id}>{itemFor(a)?.title ?? '돌봄'} · {formatDate(itemFor(a)?.starts_at)} {formatTime(itemFor(a)?.starts_at) || '시간 미정'}</option>)}</select><label className="form-label">요청 사유</label><textarea className="text-area" rows={3} value={emergencyReason} onChange={e => setEmergencyReason(e.target.value)} /><button className="outline-button wide-button emergency-voice" disabled={emergencyVoiceBusy} onClick={toggleEmergencyRecording}>{emergencyRecording ? '■ 음성 인식 끝내기' : emergencyVoiceBusy ? '음성 인식 중…' : '● 음성 인식'}</button><label className="form-label">요청을 받을 돌봄자</label><small className="emergency-recipients-hint">탭해서 받을 사람을 고르세요 · 기본은 전체 전송</small><div className="emergency-recipients">{members.filter(m => m.id !== me?.member.id).map(m => { const selected = !emergencyDeselected.has(m.id); return <button type="button" key={m.id} className={'emergency-recipient' + (selected ? ' selected' : '')} onClick={() => setEmergencyDeselected(prev => { const next = new Set(prev); if (next.has(m.id)) next.delete(m.id); else next.add(m.id); return next })}><i style={{ background: profileColorForMember(m.id) }}>{m.name.trim().slice(0, 1)}</i><small>{m.name}</small></button> })}</div></Card>
    <button className="primary-button wide-button emergency-submit" disabled={!emergencyItem || members.filter(m => m.id !== me?.member.id && !emergencyDeselected.has(m.id)).length === 0} onClick={() => run(async () => { const recipientMemberIds = members.filter(m => m.id !== me?.member.id && !emergencyDeselected.has(m.id)).map(m => m.id); await send('/emergency-requests', 'POST', { assignment_id: emergencyItem, reason: emergencyReason.trim(), recipient_member_ids: recipientMemberIds }); const result = await api<{ requests: EmergencyRequest[] }>('/emergency-requests'); setEmergencyRequests(result.requests); setEmergencyItem(''); setEmergencyDeselected(new Set()) }, '가족에게 긴급 요청을 보냈어요')}>긴급 도움 요청 보내기</button>
    <Section>요청 현황</Section>{emergencyRequests.length ? emergencyRequests.map(r => { const original = boot.assignments.find(a => a.id === r.assignment_id); const canClaim = r.status === 'OPEN' && me?.member.id !== r.requested_by_member_id && me?.member.id !== original?.assignee_id; const canCancel = r.status === 'OPEN' && (me?.member.id === r.requested_by_member_id || !!me?.member.is_owner); return <Card key={r.id} className="urgent-card"><span className={'small-badge ' + (r.status === 'OPEN' ? 'danger' : 'ok')}>{r.status === 'OPEN' ? '응답 대기 중' : r.status === 'CLAIMED' ? '담당 확정' : '취소됨'}</span><strong>{r.item_title}</strong><p>{r.reason}</p>{r.claimed_by_member_id && <p>새 담당 · {member(r.claimed_by_member_id)}</p>}{canClaim && <button className="primary-button wide-button" onClick={() => run(async () => { await send('/emergency-requests/' + r.id + '/claim', 'POST'); setEmergencyRequests((await api<{ requests: EmergencyRequest[] }>('/emergency-requests')).requests) }, '새 담당자로 확정됐어요')}>제가 맡을게요</button>}{canCancel && <button className="outline-button wide-button" onClick={() => run(async () => { await send('/emergency-requests/' + r.id + '/cancel', 'POST'); setEmergencyRequests((await api<{ requests: EmergencyRequest[] }>('/emergency-requests')).requests) }, '긴급 요청을 취소했어요')}>요청 취소</button>}</Card> }) : <Empty title="진행 중인 긴급 요청이 없어요" text="요청이 생기면 이곳에서 응답할 수 있어요" />}
  </section>
  if (boot && screen === 'gap') {
    const predictionEnd = new Date(); predictionEnd.setDate(predictionEnd.getDate() + 45)
    const riskKeywords = /방학|휴원|휴교|재량휴업|단축|일정 변경|시간 변경|변경/
    const gapItems = boot.items.filter(item => {
      if (!item.starts_at || new Date(item.starts_at) < new Date() || new Date(item.starts_at) > predictionEnd) return false
      const related = assignments.filter(assignment => assignment.item_id === item.id)
      const hasConfirmedCaregiver = related.some(assignment => ['ACCEPTED', 'COMPLETED'].includes(assignment.status))
      const changedRoutineNeedsCheck = (item.item_type === 'CHANGE' || riskKeywords.test(`${item.title} ${item.detail}`)) && related.some(assignment => assignment.status === 'RECONFIRMATION_REQUIRED')
      return !hasConfirmedCaregiver || changedRoutineNeedsCheck
    }).sort((left, right) => (left.starts_at ?? '').localeCompare(right.starts_at ?? ''))
    const focusGap = gapItems[0]
    const linkedSchedule = focusGap?.child_schedule_id ? boot.child_schedules.find(item => item.id === focusGap.child_schedule_id) : undefined
    const gapTime = focusGap?.starts_at ? formatTime(focusGap.starts_at) : '시간 미정'
    const gapEnd = linkedSchedule?.has_end_time ? formatTime(linkedSchedule.ends_at) : ''
    const gapLeadDays = focusGap?.starts_at ? Math.max(0, Math.round((new Date(dateKey(focusGap.starts_at) + 'T00:00:00').getTime() - new Date(todayKey + 'T00:00:00').getTime()) / 86_400_000)) : 0
    const gapCause = focusGap && /방학/.test(`${focusGap.title} ${focusGap.detail}`) ? '방학 일정 변화' : focusGap && /휴원|휴교|재량휴업/.test(`${focusGap.title} ${focusGap.detail}`) ? '기관 휴원 일정' : focusGap?.item_type === 'CHANGE' || (focusGap && riskKeywords.test(`${focusGap.title} ${focusGap.detail}`)) ? '평소와 다른 일정 감지' : '담당자 없는 일정 감지'
    page = <section className="figma-gap-page">
      <div className="care-feature-heading"><strong>돌봄 공백 예측</strong><Pro /></div>
      <div className={'gap-risk-card ' + (!focusGap ? 'safe' : '')}><header><span>{focusGap ? gapCause : '앞으로 45일 일정 확인'}</span><b>{focusGap ? `D-${gapLeadDays}` : '안전'}</b></header><h2>{focusGap?.starts_at ? `${formatDate(focusGap.starts_at)} 공백 예상` : '예상되는 돌봄 공백이 없어요'}</h2><strong>{focusGap ? `${gapTime}${gapEnd ? `–${gapEnd}` : ''} · ${child(focusGap.child_id)} 담당자가 필요해요` : '방학·휴원·일정 변경과 담당자 충돌을 미리 살펴봤어요'}</strong><div><span><b>미리 알림 받기</b><small>공백 가능성을 발견하면 확정 전에 먼저 안내</small></span><button className={'switch gap-notice-switch ' + (appNotices ? 'on' : '')} role="switch" aria-checked={appNotices} aria-label="돌봄 공백 미리 알림" onClick={() => run(() => send('/members/' + viewer + '/notification-preferences', 'PATCH', { app_enabled: !appNotices }), '돌봄 공백 사전 알림 설정을 변경했어요')}><span /></button></div></div>
      <Card className="gap-prediction-basis"><strong>무엇을 먼저 확인하나요?</strong><p>아이의 방학·휴원, 평소와 다른 등하원 시간, 가족 일정 충돌, 담당자가 비어 있는 일정을 최대 45일 전에 확인해요.</p>{focusGap && <small>감지된 변화 · {focusGap.title} · {formatDate(focusGap.starts_at)} {gapTime}</small>}</Card>
      <Section>먼저 제안하는 해결 방법</Section>
      <div className="gap-alternatives"><button className="recommended" disabled={!focusGap} onClick={() => focusGap && openSuggestion(focusGap)}><span><b>A · 우선 추천</b><small>{focusGap ? `${gapLeadDays}일 전 미리 조율` : '공백 없음'}</small></span><strong>{focusGap ? '가능한 가족을 먼저 찾아 요청하기' : '공백 가능성이 생기면 바로 추천해드려요'}</strong><p>{focusGap ? `${focusGap.title} · ${child(focusGap.child_id)}` : '지금은 추가 조율이 필요한 일정이 없어요.'}</p></button><button onClick={() => go('assignments')}><b>B</b><span><strong>기존 담당 시간 조정</strong><small>오늘의 역할 배정과 수락 상태 확인</small></span></button><button onClick={() => go('programs')}><b>C</b><span><strong>지역 돌봄 대안 연결</strong><small>가족이 어려우면 제도와 기관까지 이어보기</small></span></button></div>
      <button className="primary-button wide-button gap-detail-button" onClick={() => focusGap ? openSuggestion(focusGap) : go('assignments')}>{focusGap ? '추천 담당자 확인하기' : '현재 배정 확인하기'}</button>
    </section>
  }
  if (boot && screen === 'album') page = <AlbumPage plan={plan} busy={albumBusy} groups={albumGroups} selectedDate={albumFolder} onUpload={files => void addAlbumPhotos(files)} onSelect={openAlbumPhoto} onOpenFolder={setAlbumFolder} onBackFolders={() => setAlbumFolder('')} onPlan={() => go('plan')} />
  if (boot && screen === 'programs') page = <ProgramsPage plan={plan} keyword={benefitKeyword} city={benefitCity} district={benefitDistrict} savedLocation={benefitLocation} busy={benefitsBusy} locationBusy={benefitLocationBusy} programs={benefits} institutions={careInstitutions} eligibility={eligibilityCriteria} active={activeBenefit} onKeyword={setBenefitKeyword} onCity={setBenefitCity} onDistrict={setBenefitDistrict} onSaveLocation={() => void saveBenefitLocation()} onSearch={value => void searchBenefits(value)} onSelect={id => { setProgramSelected(id); requestAnimationFrame(() => contentRef.current?.scrollTo(0, 0)) }} onPlan={() => go('plan')} />

  if (screen === 'onboarding' && !invitationFromUrl && onboardStep === 'ROOM' && devLoginOptions.length > 0) page = <>{page}<Card className="dev-login-card"><span className="small-badge danger">TEST LOGIN</span><strong>테스트 사용자로 바로 입장</strong><p>개발 중에만 표시되며 원하는 가족 구성원 권한으로 확인할 수 있어요.</p><div className="dev-login-list">{devLoginOptions.map(option => <button key={option.member_id} disabled={onboardBusy} onClick={() => void loginForTest(option.member_id)}><span>{option.family_name}</span><strong>{option.member_name}{option.is_owner ? ' · 주돌봄자' : ''}</strong></button>)}</div></Card></>

  const isRoot = rootScreens.includes(screen)
  const showChrome = !!boot && !['onboarding', 'thinq', 'serviceLoading', 'lockscreen'].includes(screen)
  const showInviteNav = !!boot && screen === 'onboarding' && !invitationFromUrl && onboardStep === 'INVITE'
  const showTabHeader = showChrome && isRoot
  const showStatus = !['thinq', 'serviceLoading', 'lockscreen', 'plan'].includes(screen)
  const showBack = showChrome && !isRoot && screen !== 'chat' && screen !== 'plan'
  const backTarget: Screen = ['capture', 'review', 'family', 'calendar', 'supplies'].includes(screen) ? 'schedule'
    : ['assignments', 'assignmentDetail', 'suggestion', 'tasks', 'exception', 'emergency'].includes(screen) ? 'careHub'
      : ['members', 'permissions', 'album'].includes(screen) ? 'familyHub'
        : ['notifications', 'settings', 'gap', 'album', 'programs', 'plan'].includes(screen) ? 'more' : 'home'
  return <div className="app-shell"><aside className="screen-index"><div className="brand"><span className="brand-mark">Z</span><div><strong>ZIPPY</strong><small>기능 목업 개발 버전</small></div></div><p className="index-intro">Figma 기능 페이지의 주요 흐름을 화면별로 확인할 수 있어요.</p>{groups.map(g => <div key={g.title} className="index-group"><h2>{g.title}</h2>{g.pages.map(([id, label]) => <button key={id} className={screen === id ? 'active' : ''} onClick={() => go(id)}>{label}</button>)}</div>)}<div className="index-group"><h2>가전 화면</h2><button onClick={() => { window.location.search = '?screen=tv' }}>뉴스 화면</button><button onClick={() => { window.location.search = '?screen=voice' }}>정수기 화면</button></div></aside>
    <div className="phone-wrap"><div className="phone">
      {showStatus && <MobileStatusBar />}
      {showTabHeader && <AppHeader screen={screen} familyName={boot.family.name} memberName={me?.member.name ?? ''} profileColor={profileColorForMember(me?.member.id ?? viewer)} contextLine={`${today} · ${boot.children.map(c => c.name).join(' · ') || '아이 등록 전'}`} unread={unread} onNavigate={go} onOpenThinQHomes={openThinQHomes} />}
      <main ref={contentRef} className={'phone-content ' + (['thinq', 'serviceLoading', 'lockscreen'].includes(screen) ? 'edge-to-edge ' : '') + (screen === 'schedule' ? 'calendar-content ' : '') + (screen === 'chat' ? 'chat-content ' : '') + (screen === 'plan' ? 'plan-content' : '')}>{showBack && <button className="inline-back" aria-label="이전 메뉴로 돌아가기" onClick={() => navigateBack(backTarget)}>← 이전</button>}{page}</main>
      {showChrome && !['chat', 'plan'].includes(screen) && <FloatingAssistant onOpen={() => go('chat')} />}
      {(showChrome || showInviteNav) && !['chat', 'plan'].includes(screen) && <BottomNav screen={showInviteNav ? 'home' : screen} onNavigate={go} />}
      {showTabHeader && thinqSelector && <ThinQHomeSelector hasFamily familyName={boot.family.name} onClose={() => setThinqSelector(false)} onSelectThinQHome={() => { setThinqSelector(false); go('thinq') }} onSelectFamily={() => setThinqSelector(false)} onStartOnboarding={startFamilyOnboarding} />}
    {selectedAlbumPhoto && <AlbumLightbox photo={selectedAlbumPhoto} deleting={albumDeleteBusy} onClose={() => history.back()} onDelete={() => void deleteAlbumPhoto(selectedAlbumPhoto)} />}
    {proGateFeature && <div className="pro-gate-overlay" role="presentation" onClick={() => setProGateFeature('')}><section className="pro-gate-dialog" role="dialog" aria-modal="true" aria-label="Pro 플랜 안내" onClick={event => event.stopPropagation()}><img src={planPaymentUiIcon} alt="" /><h2>{proGateFeature}은<br />Pro에서 이용할 수 있어요</h2><p>Pro 플랜으로 전환하면 이 기능과 가족 돌봄 자동화를 바로 사용할 수 있어요.</p><button className="primary-button wide-button" onClick={() => { setProGateFeature(''); go('plan') }}>Pro 알아보기</button><button className="text-link centered" onClick={() => setProGateFeature('')}>취소</button></section></div>}
    {inviteSheetOpen && boot && <BottomSheet className="invite-quick-sheet" onDismiss={() => setInviteSheetOpen(false)}><h2>가족 구성원 초대</h2><p>역할을 고른 뒤 카카오톡으로 바로 초대 링크를 보낼 수 있어요.</p><label className="form-label">초대할 가족의 역할</label><select className="form-control" value={inviteRole} onChange={event => setInviteRole(event.target.value)}><option value="PARENT">부모</option><option value="GRANDPARENT">조부모</option><option value="CAREGIVER">돌봄 참여자</option></select>{inviteCode ? <><div className="invite-code"><strong>{inviteCode}</strong><small>만료: {formatDate(inviteExpiresAt)}</small></div><button className="kakao-share wide-button" onClick={() => void shareInvite('kakao')}><img src={inviteKakaoIcon} alt="" />카카오톡으로 초대하기</button><div className="invite-quick-options"><button onClick={() => void shareInvite('sms')}><img src={inviteMessageIcon} alt="" />문자</button><button onClick={() => void copyInvite()}><img src={inviteLinkIcon} alt="" />링크 복사</button></div></> : <div className="invite-preparing" role="status">초대 링크를 준비하고 있어요…</div>}<button className="text-link centered" onClick={() => setInviteSheetOpen(false)}>닫기</button></BottomSheet>}
    {policyOpen && <BottomSheet className="policy-sheet" onDismiss={() => setPolicyOpen(null)}><header><div><span>법적 고지</span><h2>{policyContent[policyOpen].title}</h2><small>{policyContent[policyOpen].notice}</small></div><button aria-label="닫기" onClick={() => setPolicyOpen(null)}>×</button></header><div className="policy-draft-notice"><strong>정식 출시 전 법무 검토가 필요한 초안입니다.</strong><span>운영자·연락처·외부 수탁자 정보는 실제 계약에 맞게 확정해야 합니다.</span></div><div className="policy-body">{policyContent[policyOpen].sections.map(section => <section key={section.title}><h3>{section.title}</h3><p>{section.body}</p></section>)}</div><button className="primary-button wide-button" onClick={() => setPolicyOpen(null)}>확인</button></BottomSheet>}
    {calendarPrivacyPromptOpen && <BottomSheet className="calendar-privacy-sheet" onDismiss={() => setCalendarPrivacyPromptOpen(false)}><span className="privacy-prompt-icon">🗓️</span><h2>가족에게 일정 제목을<br />보여줄까요?</h2><p>캘린더 연동은 완료됐어요. 이제 가족방에서 보일 범위를 선택해주세요.</p><div className="calendar-privacy-options"><button className="recommended" disabled={calendarPrivacyBusy} onClick={() => void saveCalendarVisibility(false)}><i>✓</i><span><strong>시간만 공개</strong><small>일정 제목은 ‘바쁨’으로 표시</small></span><em>추천</em></button><button disabled={calendarPrivacyBusy} onClick={() => void saveCalendarVisibility(true)}><i /><span><strong>일정 제목 공개</strong><small>가족이 일정 내용까지 확인</small></span></button></div><small className="calendar-privacy-note">캘린더 제공자의 접근 권한과는 별개예요. 나중에 가족 › 정보 공개에서 바꿀 수 있어요.</small><button className="text-link centered" disabled={calendarPrivacyBusy} onClick={() => setCalendarPrivacyPromptOpen(false)}>나중에 설정</button></BottomSheet>}
    {scheduleSheet === 'DAY' && boot && <div className="schedule-overlay" onClick={() => setScheduleSheet('NONE')}><section className="schedule-day-sheet" onClick={e => e.stopPropagation()}><header><div><small>선택한 날짜</small><h2>{new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(selectedDate + 'T12:00:00'))}</h2></div><button aria-label="날짜 일정 닫기" onClick={() => setScheduleSheet('NONE')}>×</button></header><div className="day-sheet-events">{boot.schedules.filter(s => dateKey(s.starts_at) === selectedDate && personalScheduleVisible(s.member_id)).map(s => <Card key={s.id} className="calendar-event personal"><i style={{ background: caregiverColor(s.member_id) }} /><time>{formatTime(s.starts_at)}</time><div><strong>{s.title}</strong><p>{member(s.member_id)} · {s.kind === 'WORK' ? '업무 일정' : '고정 루틴'}</p></div><span className={'caregiver-pill ' + (s.member_id === me?.member.id ? 'self' : '')}>{s.member_id === me?.member.id ? '나' : '돌봄자'}</span>{s.member_id === me?.member.id && !s.external_source && <button className="schedule-row-edit" onClick={() => openPersonalScheduleEdit(s)}>수정</button>}</Card>)}{filteredChildSchedules.filter(s => dateKey(s.starts_at) === selectedDate).flatMap(s => {
  const linkedItems = visibleCareItems.filter(i => i.child_schedule_id === s.id)
  const rowsForSchedule: (CareItem | null)[] = linkedItems.length ? linkedItems : [null]
  return rowsForSchedule.map((careItem, index) => {
    const caregiver = careItem ? caregiverForCareItem(careItem.id) : null
    return <Card key={s.id + '-' + index} className="calendar-event"><i style={{ background: childColor(s.child_id) }} /><time>{formatTime(careItem?.starts_at ?? s.starts_at)}</time><div><strong>{careItem?.title ?? s.title}</strong><p>{child(s.child_id)} · {childScheduleLabel[s.category] ?? '아이 일정'}</p></div>{caregiver && <span className="caregiver-pill confirmed">담당 {caregiver.name}</span>}{me?.authenticated && <button className="schedule-row-edit" onClick={() => openChildScheduleEdit(s)}>수정</button>}</Card>
  })
})}{filteredCareSchedules.filter(i => dateKey(i.starts_at!) === selectedDate).map(i => { const caregiver = caregiverForCareItem(i.id); return <Card key={i.id} className="calendar-event"><i style={{ background: childColor(i.child_id) }} /><time>{formatTime(i.starts_at)}</time><div><strong>{i.title}</strong><p>{child(i.child_id)} · 알림장</p></div>{caregiver && <span className="caregiver-pill confirmed">담당 {caregiver.name}</span>}</Card> })}{calendarEventsFor(selectedDate).length === 0 && <Empty title="등록된 일정이 없어요" text="아래 + 버튼으로 이 날의 일정을 추가해보세요" />}</div><button className="day-add-button" aria-label="선택한 날짜에 일정 추가" onClick={event => { setScheduleSheet('NONE'); openScheduleRegistration(event.currentTarget) }}>＋</button></section></div>}
    {scheduleSheet === 'ADD_MENU' && boot && <div className="sheet-overlay schedule-quick-overlay" onClick={() => setScheduleSheet('NONE')}><button className="schedule-quick-close" aria-label="등록 메뉴 닫기" style={scheduleQuickAnchor ? { top: scheduleQuickAnchor.top, left: scheduleQuickAnchor.left, width: scheduleQuickAnchor.width, height: scheduleQuickAnchor.height } : undefined} onClick={() => setScheduleSheet('NONE')}>×</button><section className="schedule-quick-menu" role="dialog" aria-modal="true" aria-label="일정 등록 방식 선택" style={scheduleQuickAnchor ? { position: 'absolute', top: Math.max(12, scheduleQuickAnchor.top + scheduleQuickAnchor.height / 2 - 61), right: Math.max(58, scheduleQuickAnchor.phoneWidth - scheduleQuickAnchor.left + 17) } : undefined} onClick={event => event.stopPropagation()} data-figma-node="702:2203"><div className="schedule-add-options"><button onClick={() => { setScheduleEntryMode('SINGLE'); setScheduleSheet('CHOOSER') }}><span><strong>일정 등록하기</strong><small>새롭게 추가된 일정을 등록해주세요</small></span></button><button onClick={() => { openNewScheduleForm(boot.children.length ? 'CHILD' : 'PERSONAL', 'REPEAT'); if (boot.children[0]) setChildScheduleChild(boot.children[0].id) }}><span><strong>루틴 설정하기</strong><small>반복되는 일정을 등록해주세요</small></span></button><button onClick={() => { setScheduleSheet('NONE'); go('capture') }}><span><strong>알림장 등록</strong><small>사진을 읽어 일정과 준비물을 정리해요</small></span></button></div></section></div>}
    {scheduleSheet === 'CHOOSER' && <BottomSheet className="schedule-chooser" onDismiss={() => setScheduleSheet('ADD_MENU')}><h2>누구의 일정인가요?</h2><p>등록할 일정의 주인을 먼저 선택해주세요.</p><div className="schedule-owner-options"><button onClick={() => openNewScheduleForm('CHILD')}><i><img src={scheduleChildIcon} alt="" /></i><strong>아이</strong><small>학원·학교·방과후 일정</small></button><button onClick={() => openNewScheduleForm('PERSONAL')}><i><img src={scheduleOwnerIcon} alt="" /></i><strong>본인</strong><small>운동·업무·개인 일정</small></button></div><button className="text-link centered" onClick={() => setScheduleSheet('ADD_MENU')}>돌아가기</button></BottomSheet>}
    {scheduleSheet === 'FORM' && boot && !editingSchedule && scheduleEntryMode === 'SINGLE' && <div className="single-schedule-overlay"><section className="single-schedule-screen" role="dialog" aria-modal="true" aria-label="일정 등록" data-figma-node="460:3102">
      <header><button aria-label="일정 등록 닫기" onClick={() => setScheduleSheet('CHOOSER')}>×</button><strong>일정 등록</strong><span>{scheduleForm === 'CHILD' ? child(childScheduleChild) : '본인'}</span></header>
      <div className="single-schedule-scroll">
        <div className="single-schedule-context">{scheduleForm === 'CHILD' ? <><label><span>대상</span><select value={childScheduleChild} onChange={event => setChildScheduleChild(event.target.value)}>{boot.children.map(childItem => <option key={childItem.id} value={childItem.id}>{childItem.name}</option>)}</select></label><label><span>종류</span><select value={childScheduleCategory} onChange={event => setChildScheduleCategory(event.target.value)}><option value="ACADEMY">학원</option><option value="AFTER_SCHOOL">방과후</option><option value="SCHOOL">학교</option><option value="ACTIVITY">활동</option><option value="OTHER">기타</option></select></label></> : <label><span>종류</span><select value={scheduleKind} onChange={event => setScheduleKind(event.target.value as 'WORK' | 'ROUTINE')}><option value="ROUTINE">개인 일정</option><option value="WORK">업무 일정</option></select></label>}</div>
        <div className="single-schedule-card">
          <label className="single-title"><span>내용</span><input value={scheduleTitle} onChange={event => setScheduleTitle(event.target.value)} placeholder={scheduleForm === 'CHILD' ? '예: 현장학습, 치과 진료' : '예: 팀 워크숍'} /></label>
          {scheduleForm === 'CHILD' && childLocationControl('single-location')}
          <label className="single-date"><span>날짜</span><input aria-label="일정 날짜" type="date" value={scheduleDate} onChange={event => setScheduleDate(event.target.value)} /></label>
          <div className="single-time direct-time"><label><span>시작</span><input aria-label="일정 시작 시간" type="time" step="60" value={scheduleStartTime} onChange={event => setScheduleStartTime(event.target.value)} /></label><label><span>종료</span><input aria-label="일정 종료 시간" type="time" step="60" value={scheduleEndTime} onChange={event => setScheduleEndTime(event.target.value)} /></label></div>
        </div>
        <div className={'single-collision ' + (schedulePreviewCollision ? 'danger' : 'safe')}><strong>{schedulePreviewCollision ? '가족 일정과 시간이 겹쳐요' : '겹치는 가족 일정이 없어요'}</strong>{schedulePreviewCollision ? <><b>{formatTime(schedulePreviewCollision.startsAt)} {schedulePreviewCollision.title}</b><p>저장하면 대체 담당자를 바로 찾아드릴게요.</p></> : <p>현재 등록된 가족 일정 기준입니다.</p>}</div>
        {scheduleForm === 'PERSONAL' && <button className="single-work-toggle" onClick={() => setScheduleKind(value => value === 'WORK' ? 'ROUTINE' : 'WORK')}><span><strong>업무 일정으로 등록</strong><small>가족 일정 충돌 확인에만 사용</small></span><i className={'switch ' + (scheduleKind === 'WORK' ? 'on' : '')}><span /></i></button>}
      </div>
      <button className="single-schedule-save" aria-label="이 일정 등록" onClick={() => saveSchedule()}>저장</button>
    </section></div>}
    {scheduleSheet === 'FORM' && boot && !editingSchedule && scheduleEntryMode === 'REPEAT' && <div className="routine-screen-overlay"><section className="routine-screen" role="dialog" aria-modal="true" aria-label="루틴 등록" data-figma-node="557:1551">
      <header className="routine-header"><button className="routine-back" aria-label="이전 화면으로 돌아가기" onClick={() => { setScheduleSheet('NONE'); if (scheduleReturnToWeekly) setWeeklyTimetableOpen(true) }}>‹ 이전</button><strong>루틴 등록</strong><span aria-hidden="true" /></header>
      <div className="routine-form-card">
        <label className="routine-name"><span>루틴 이름</span><input value={scheduleTitle} onChange={event => setScheduleTitle(event.target.value)} placeholder={scheduleForm === 'CHILD' ? '예: 태권도, 방과후 미술' : '예: 헬스, 오전 회의'} /></label>
        <fieldset className="routine-target"><legend>대상 자녀</legend><div><button className={scheduleForm === 'PERSONAL' ? 'active' : ''} onClick={() => setScheduleForm('PERSONAL')}>본인</button>{boot.children.map(childItem => <button key={childItem.id} className={scheduleForm === 'CHILD' && childScheduleChild === childItem.id ? 'active' : ''} onClick={() => { setScheduleForm('CHILD'); setChildScheduleChild(childItem.id) }}>{childItem.name}</button>)}</div></fieldset>
        {scheduleForm === 'CHILD' && childLocationControl('routine-location')}
        <fieldset className="routine-repeat"><legend>반복 주기</legend><div className="routine-repeat-tabs"><button className={scheduleRepeatMode === 'WEEKLY' ? 'active' : ''} onClick={() => { setScheduleRepeat(true); setScheduleRepeatMode('WEEKLY') }}>요일</button><button className={scheduleRepeatMode === 'INTERVAL' ? 'active' : ''} onClick={() => { setScheduleRepeat(true); setScheduleRepeatMode('INTERVAL') }}>N일마다</button><button className={scheduleRepeatMode === 'MONTHLY' ? 'active' : ''} onClick={() => { setScheduleRepeat(true); setScheduleRepeatMode('MONTHLY') }}>월간</button><button className={scheduleRepeatMode === 'DATES' ? 'active' : ''} onClick={() => { setScheduleRepeat(true); setScheduleRepeatMode('DATES') }}>특정일</button></div>
          {scheduleRepeatMode === 'WEEKLY' && <div className="weekday-picker routine-weekdays">{[['일', 6], ['월', 0], ['화', 1], ['수', 2], ['목', 3], ['금', 4], ['토', 5]].map(([label, day]) => <button key={label} className={scheduleRepeatDays.includes(day as number) ? 'active' : ''} onClick={() => { const value = day as number; setScheduleRepeat(true); setScheduleRepeatDays(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]) }}>{label}</button>)}</div>}
          {scheduleRepeatMode === 'INTERVAL' && <label className="routine-number-option">매 <input aria-label="반복 간격" type="number" min="1" max="366" value={scheduleRepeatInterval} onChange={event => setScheduleRepeatInterval(Math.min(366, Math.max(1, Number(event.target.value) || 1)))} />일마다</label>}
          {scheduleRepeatMode === 'MONTHLY' && <label className="routine-number-option">매월 <input aria-label="매월 반복일" type="number" min="1" max="31" value={scheduleRepeatMonthDay} onChange={event => setScheduleRepeatMonthDay(Math.min(31, Math.max(1, Number(event.target.value) || 1)))} />일</label>}
          {scheduleRepeatMode === 'DATES' && <div className="routine-specific-dates"><div><input aria-label="특정 반복일" type="date" value={scheduleRepeatDateInput} onChange={event => setScheduleRepeatDateInput(event.target.value)} /><button onClick={() => { if (scheduleRepeatDateInput) setScheduleRepeatDates(current => [...new Set([...current, scheduleRepeatDateInput])].sort()) }}>추가</button></div><p>{scheduleRepeatDates.map(value => <button key={value} aria-label={`${value} 삭제`} onClick={() => setScheduleRepeatDates(current => current.filter(item => item !== value))}>{value.slice(5).replace('-', '/')} ×</button>)}</p></div>}
        </fieldset>
        <div className="routine-time-row"><strong>시간</strong><div className="routine-time-fields direct-time"><input aria-label="시작 시간" type="time" step="60" value={scheduleStartTime} onChange={event => setScheduleStartTime(event.target.value)} /><span>–</span><input aria-label="종료 시간" type="time" step="60" value={scheduleEndTime} onChange={event => setScheduleEndTime(event.target.value)} /></div></div>
        {scheduleForm === 'CHILD' && (isHomeScheduleLocation() ? <Card className="home-no-assignee"><strong>집 일정은 담당자 배정이 필요 없어요</strong><small>구몬처럼 집에서 진행하는 활동은 일정만 등록합니다.</small></Card> : <div className="routine-responsibility"><strong>돌봄 담당자</strong><small>등원과 하원을 각각 다르게 정할 수 있어요.</small><div>{routineResponsibilityControl('START', routineStartAssignee, setRoutineStartAssignee, routineStartExternalName, setRoutineStartExternalName)}{routineResponsibilityControl('END', routineEndAssignee, setRoutineEndAssignee, routineEndExternalName, setRoutineEndExternalName)}</div></div>)}
        <div className="routine-period-row"><div><strong>기간 정하기</strong><small>학기 단위로 끝나는 루틴</small></div><button className={'switch ' + (scheduleRepeat ? 'on' : '')} role="switch" aria-checked={scheduleRepeat} aria-label="매주 반복" onClick={() => setScheduleRepeat(value => !value)}><span /></button></div>
        {scheduleRepeat && scheduleRepeatMode !== 'DATES' && <div className="routine-date-range"><label><span>시작일</span><input aria-label="반복 시작일" type="date" value={scheduleDate} onChange={event => setScheduleDate(event.target.value)} /></label><b>→</b><label><span>반복 종료일</span><input aria-label="반복 종료일" type="date" value={scheduleRepeatUntil} onChange={event => setScheduleRepeatUntil(event.target.value)} /></label></div>}
        <button className="routine-save" aria-label={scheduleRepeat ? '고정 루틴 일괄 등록' : '이 일정 등록'} onClick={() => saveSchedule()}>저장하기</button>
      </div>
    </section></div>}
    {scheduleSheet === 'FORM' && boot && editingSchedule && <BottomSheet className="schedule-form-sheet" onDismiss={() => { setScheduleSheet(scheduleReturnToWeekly ? 'NONE' : 'DAY'); setWeeklyTimetableOpen(scheduleReturnToWeekly); setScheduleReturnToWeekly(false) }}><h2>{scheduleForm === 'CHILD' ? '아이 일정 수정' : '내 일정 수정'}</h2><p className="schedule-edit-help">반복 일정은 저장할 때 이번 일정만 바꿀지 이후 일정도 함께 바꿀지 선택할 수 있어요.</p>{scheduleForm === 'CHILD' ? <><label className="form-label">아이 이름 (필수)</label><select className="form-control" value={childScheduleChild} onChange={event => setChildScheduleChild(event.target.value)}>{boot.children.map(childItem => <option key={childItem.id} value={childItem.id}>{childItem.name}</option>)}</select>{childLocationControl('edit-location')}</> : <><label className="form-label">일정 종류</label><select className="form-control" value={scheduleKind} onChange={event => setScheduleKind(event.target.value as 'WORK' | 'ROUTINE')}><option value="ROUTINE">개인 루틴·운동</option><option value="WORK">업무 일정</option></select></>}<label className="form-label">일정 이름</label><input className="form-control" value={scheduleTitle} onChange={event => setScheduleTitle(event.target.value)} placeholder={scheduleForm === 'CHILD' ? '예: 태권도, 방과후 미술' : '예: 헬스, 오전 회의'} /><ScheduleTimeFields date={scheduleDate} start={scheduleStartTime} end={scheduleEndTime} onDate={setScheduleDate} onStart={setScheduleStartTime} onEnd={setScheduleEndTime} />{scheduleForm === 'CHILD' && (isHomeScheduleLocation() ? <Card className="home-no-assignee"><strong>집 일정은 담당자 배정이 필요 없어요</strong><small>저장하면 기존 등·하원 배정도 함께 해제됩니다.</small></Card> : <div className="routine-responsibility edit-responsibility"><strong>돌봄 담당자</strong><small>등원·하원별로 가족 또는 외부 담당자를 설정하세요.</small><div>{routineResponsibilityControl('START', routineStartAssignee, setRoutineStartAssignee, routineStartExternalName, setRoutineStartExternalName)}{routineResponsibilityControl('END', routineEndAssignee, setRoutineEndAssignee, routineEndExternalName, setRoutineEndExternalName)}</div></div>)}<button className="primary-button wide-button" onClick={() => saveSchedule()}>수정 내용 저장</button><button className="schedule-delete-button wide-button" onClick={() => deleteSchedule()}>이 일정 삭제</button><button className="text-link centered" onClick={() => { setScheduleSheet(scheduleReturnToWeekly ? 'NONE' : 'DAY'); setWeeklyTimetableOpen(scheduleReturnToWeekly); setScheduleReturnToWeekly(false) }}>이전</button></BottomSheet>}
    {weeklyTimetableOpen && boot && <div className="weekly-overlay" onClick={() => setWeeklyTimetableOpen(false)}><section className="weekly-timetable" role="dialog" aria-modal="true" aria-label="주간 시간표" onClick={event => event.stopPropagation()}>
      <header><button onClick={() => setWeeklyTimetableOpen(false)}>‹</button><strong>주간 시간표</strong><button onClick={() => setToast('주간 시간표 설정을 저장했어요')}>저장</button></header>
      <div className="weekly-child-tabs">{boot.children.map(childItem => <button key={childItem.id} className={activeWeeklyChild === childItem.id ? 'active' : ''} onClick={() => setWeeklyTimetableChild(childItem.id)}>{childItem.name}</button>)}</div>
      <p className="weekly-help">일정 블록의 높이가 실제 시작·종료 시간을 보여줘요. 눌러서 수정할 수 있어요.</p>
      {boot.children.length && weeklyHourLabels.length ? <div className="weekly-timeline">
        <div className="weekly-day-header"><span />{['월', '화', '수', '목', '금', '토', '일'].map(day => <strong key={day}>{day}</strong>)}</div>
        <div className="weekly-timeline-body">
          <div className="weekly-time-axis" style={{ height: weeklyTimelineHeight }}>{weeklyHourLabels.map(hour => <time key={hour} style={{ top: Math.min(weeklyTimelineHeight - 10, (hour * 60 - weeklyStartMinute) * weeklyPixelsPerMinute) }}>{hour}시</time>)}</div>
          <div className="weekly-day-columns" style={{ height: weeklyTimelineHeight }}>{[1, 2, 3, 4, 5, 6, 0].map(day => <div className="weekly-day-column" key={day}>{weeklyDisplayEntries.filter(item => new Date(item.starts_at).getDay() === day).map(item => {
            const start = new Date(item.starts_at); const end = item.has_end_time ? new Date(item.ends_at) : new Date(start.getTime() + 30 * 60_000)
            const startMinute = start.getHours() * 60 + start.getMinutes(); const duration = Math.max(20, (end.getTime() - start.getTime()) / 60_000)
            return <button key={item.id} className="weekly-event-block" style={{ top: (startMinute - weeklyStartMinute) * weeklyPixelsPerMinute, height: Math.max(24, duration * weeklyPixelsPerMinute) }} onClick={() => openChildScheduleEdit(item, true)}><strong>{item.title}</strong><small>{localClock(item.starts_at)}–{localClock(item.ends_at)}</small>{item.location_name && <em>{item.location_name}</em>}</button>
          })}</div>)}</div>
        </div>
      </div> : boot.children.length ? <Empty title="등록된 반복 일정이 없어요" text="반복 일정을 추가하면 해당 시간 범위로 시간표가 만들어져요" /> : <Empty title="등록된 아이가 없어요" text="가족 설정에서 아이를 먼저 추가해주세요" />}
      <div className="weekly-actions"><button className="primary-button" disabled={!boot.children.length} onClick={() => { const childId = activeWeeklyChild; setWeeklyTimetableOpen(false); openNewScheduleForm('CHILD', 'REPEAT', true); setChildScheduleChild(childId) }}>＋ 반복 일정 추가</button></div>
      <Card className="weekly-institutions"><strong>등록된 일정</strong><p>{[...new Set(weeklyEntries.map(item => `${item.title}${item.location_name ? ` (${item.location_name})` : ''}`))].slice(0, 4).join(' · ') || '아직 등록된 반복 일정이 없어요.'}</p></Card>
    </section></div>}
    {routineMergePrompt && <BottomSheet className="routine-merge-sheet" onDismiss={() => setRoutineMergePrompt(null)}><span className="sheet-handle" /><h2>같은 장소 일정을<br />하나로 정리할까요?</h2><p>오늘 {routineMergePrompt.location} 일정을 하나로 정리했어요. <strong>{routineMergePrompt.start} 등원, {routineMergePrompt.end} 하원</strong>에만 돌봄 담당자를 배정하면 될까요?</p><Card className="routine-merge-summary"><span><small>첫 돌봄 지점</small><strong>{routineMergePrompt.start} · 등원</strong></span><b>→</b><span><small>마지막 돌봄 지점</small><strong>{routineMergePrompt.end} · 하원</strong></span></Card><button className="primary-button wide-button" onClick={() => { setRoutineMergePrompt(null); saveSchedule(undefined, true) }}>네, 처음과 마지막만 배정</button><button className="outline-button wide-button" onClick={() => { setRoutineMergePrompt(null); saveSchedule(undefined, false) }}>아니요, 방과후도 따로 픽업</button></BottomSheet>}
    {recurrenceEditPrompt && editingSchedule && (() => { const original = editingSchedule.type === 'CHILD' ? boot?.child_schedules.find(item => item.id === editingSchedule.id) : boot?.schedules.find(item => item.id === editingSchedule.id); return <BottomSheet className="recurrence-edit-sheet" onDismiss={() => setRecurrenceEditPrompt(false)}><span className="sheet-handle" /><h2>매주 이렇게 바꿀까요?</h2><p>반복 일정에서 바꿀 범위를 선택해주세요.</p><div className="recurrence-time-change"><span><small>기존</small><strong>{formatTime(original?.starts_at)}</strong></span><b>→</b><span><small>{scheduleDate.slice(5).replace('-', '월 ')}일</small><strong>{normalizeClock(scheduleStartTime)}</strong></span></div><button className={recurrenceEditScope === 'SINGLE' ? 'scope-choice active' : 'scope-choice'} onClick={() => setRecurrenceEditScope('SINGLE')}><i /><span><strong>{scheduleDate.slice(5).replace('-', '월 ')}일만 변경</strong><small>이 날짜의 일정만 그대로 유지</small></span></button><button className={recurrenceEditScope === 'FUTURE' ? 'scope-choice active' : 'scope-choice'} onClick={() => setRecurrenceEditScope('FUTURE')}><i /><span><strong>이후 반복 일정도 변경</strong><small>선택한 날짜부터 같은 시간으로 바뀝니다</small></span></button><button className="primary-button wide-button recurrence-apply" onClick={() => { const scope = recurrenceEditScope; setRecurrenceEditPrompt(false); saveSchedule(scope) }}>적용</button></BottomSheet> })()}
    {recurrenceDeletePrompt && editingSchedule && <BottomSheet className="recurrence-edit-sheet recurrence-delete-sheet" onDismiss={() => setRecurrenceDeletePrompt(false)}><span className="sheet-handle" /><h2>반복 일정을 어떻게 삭제할까요?</h2><p>선택한 날짜만 지우거나 이후 일정을 함께 지울 수 있어요.</p><button className={recurrenceDeleteScope === 'SINGLE' ? 'scope-choice active' : 'scope-choice'} onClick={() => setRecurrenceDeleteScope('SINGLE')}><i /><span><strong>이 일정만 삭제하기</strong><small>선택한 날짜의 일정만 삭제합니다</small></span></button><button className={recurrenceDeleteScope === 'FUTURE' ? 'scope-choice active' : 'scope-choice'} onClick={() => setRecurrenceDeleteScope('FUTURE')}><i /><span><strong>이후 일정도 삭제하기</strong><small>선택한 날짜부터 반복 일정을 함께 삭제합니다</small></span></button><button className="schedule-delete-button wide-button recurrence-apply" onClick={() => { const scope = recurrenceDeleteScope; setRecurrenceDeletePrompt(false); deleteSchedule(scope) }}>선택한 범위 삭제</button></BottomSheet>}
    {patternSuggestionOpen && boot && <BottomSheet className="pattern-suggestion-sheet" onDismiss={() => setPatternSuggestionOpen(false)}><span className="sheet-handle" /><h2>이 패턴을 기본값으로<br />반영할까요?</h2><p>반복해서 바뀐 담당 패턴을 다음 추천에 반영할 수 있어요.</p><div className="pattern-change"><span><small>현재 기본값</small><strong>{me?.member.name ?? '나'}</strong></span><b>→</b><span><small>추천 담당</small><strong>{members.find(item => item.id !== me?.member.id)?.name ?? '다른 가족'}</strong></span></div><button className="primary-button wide-button" onClick={() => { localStorage.setItem(`family-care-pattern:${boot.family.id}:${childScheduleChild}`, members.find(item => item.id !== me?.member.id)?.id ?? ''); setPatternSuggestionOpen(false); setToast('다음 배정부터 새 기본 패턴을 반영해요') }}>기본값 바꾸기</button><div className="pattern-secondary"><button onClick={() => { setPatternSuggestionOpen(false); setToast('이번 변경만 유지했어요') }}>이번만 유지</button><button onClick={() => { localStorage.setItem(`family-care-pattern-dismissed:${boot.family.id}:${childScheduleChild}`, '1'); setPatternSuggestionOpen(false) }}>다시 묻지 않기</button></div></BottomSheet>}
    {showSheet && <BottomSheet className="completion-sheet" onDismiss={() => setShowSheet(false)}><h2>특이사항이 있었나요?</h2><p>여기서 남긴 내용이 다음 돌봄자에게 자동으로 인수인계돼요.</p><label className="form-label">특이사항</label><textarea className="text-area" rows={4} value={note} onChange={e => setNote(e.target.value)} placeholder="수기로 입력하거나 아래에서 말해주세요. 없으면 빈칸도 괜찮아요." /><button className="outline-button wide-button" disabled={completionVoiceBusy} onClick={toggleCompletionRecording}>{completionRecording ? '■ 음성 인식 끝내기' : completionVoiceBusy ? '음성 인식 중…' : '● 음성 인식'}</button><label className="form-label">완료 사진 (선택)</label><input ref={completionCameraInputRef} className="hidden-capture-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e => { selectCompletionPhoto(e.currentTarget.files?.[0]); e.currentTarget.value = '' }} /><input ref={completionPhotoInputRef} className="hidden-capture-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { selectCompletionPhoto(e.currentTarget.files?.[0]); e.currentTarget.value = '' }} />{completionPreview && <div className="completion-preview"><img src={completionPreview} alt="선택한 완료 사진" /><button onClick={() => { setCompletionPhoto(null); setCompletionPreview('') }}>×</button></div>}<div className="completion-photo-actions"><button className="outline-button" disabled={plan !== 'PRO'} onClick={() => completionCameraInputRef.current?.click()}>사진 촬영</button><button className="outline-button" disabled={plan !== 'PRO'} onClick={() => completionPhotoInputRef.current?.click()}>앨범에서 선택</button></div>{plan !== 'PRO' && <button className="text-link centered" onClick={() => { setShowSheet(false); go('plan') }}>완료 사진은 Pro에서 사용할 수 있어요</button>}<button className="primary-button wide-button" disabled={completionVoiceBusy || completionRecording} onClick={complete}>{note.trim() ? '완료하고 인수인계하기' : '완료하기'}</button><button className="text-link centered" onClick={() => setShowSheet(false)}>돌아가기</button></BottomSheet>}
    {error && <div className="error-toast" role="alert"><button aria-label="닫기" onClick={() => setError('')}>×</button>{error}</div>}{toast && <div className="success-toast" role="status">{toast}</div>}
    </div></div>
  </div>
}

export default App
