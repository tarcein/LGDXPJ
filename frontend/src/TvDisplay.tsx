import { useEffect, useRef, useState } from 'react'
import { api, formatDate, formatTime, type Assignment, type Bootstrap, type EmergencyRequest, type Notice } from './api'
import './tv.css'
import tvNewsBackground from '../../asset/tv-news-background.png'

const tvNewsVideo = '/YTDown.com_YouTube_Media_enRjBDUlWGo_001_720p.mp4'

type Tier = 1 | 2 | 3 | 4
type TvAlert = {
  key: string
  tier: Tier
  title: string
  body: string
  meta: string
  kind: 'notice' | 'schedule' | 'emergency'
}

const tierForNotice = (notice: Notice): Tier => {
  if (notice.action_type === 'HANDOFF' || notice.action_type === 'ASSIGNMENT_REQUEST') return 3
  if (notice.action_type === 'ASSIGNMENT_RESULT' && /완료/.test(notice.title)) return 1
  if (notice.level === 'IMPORTANT') return 2
  return 1
}

const beep = (strong = false) => {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const context = new AudioContextClass()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = strong ? 720 : 520
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(strong ? 0.16 : 0.08, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + (strong ? 0.42 : 0.22))
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + (strong ? 0.45 : 0.25))
    oscillator.addEventListener('ended', () => void context.close())
  } catch { /* browser audio is optional for the display */ }
}

const speakAlert = (next: TvAlert, enabled = true) => {
  if (!enabled) return
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const message = next.kind === 'emergency'
    ? '긴급 돌봄 요청이 발생했어요. 확인이 필요합니다.'
    : next.kind === 'schedule'
      ? '픽업 시간이 가까워졌어요. 일정을 확인해주세요.'
      : next.title
  const utterance = new SpeechSynthesisUtterance(message)
  utterance.lang = 'ko-KR'
  const koreanVoice = window.speechSynthesis.getVoices().find(voice => voice.lang.toLowerCase().startsWith('ko'))
  if (koreanVoice) utterance.voice = koreanVoice
  utterance.rate = 1.02
  utterance.pitch = 1.32
  utterance.volume = 1
  window.speechSynthesis.speak(utterance)
}

const asAssignmentKey = (assignment: Assignment) => `schedule:${assignment.id}`

function TvDisplay() {
  const [alert, setAlert] = useState<TvAlert | null>(null)
  const [started, setStarted] = useState(false)
  const [newsMuted, setNewsMuted] = useState(true)
  const [voiceMuted, setVoiceMuted] = useState(false)
  const [connected, setConnected] = useState(true)
  const seenNoticeIds = useRef(new Set<string>())
  const dismissedAlertKeys = useRef(new Set<string>())
  const activeAlertKey = useRef('')
  const alertRef = useRef<TvAlert | null>(null)
  const startedRef = useRef(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const showAlert = (next: TvAlert) => {
    if (activeAlertKey.current === next.key || dismissedAlertKeys.current.has(next.key)) return
    activeAlertKey.current = next.key
    alertRef.current = next
    setAlert(next)
    if (startedRef.current) {
      if (!voiceMuted) beep(next.tier === 4)
      speakAlert(next, !voiceMuted)
    }
    const timeout = next.tier === 4 ? 0 : next.tier === 3 ? 25_000 : next.tier === 2 ? 12_000 : 5_000
    if (timeout) window.setTimeout(() => {
      if (activeAlertKey.current === next.key) {
        activeAlertKey.current = ''
        alertRef.current = null
        setAlert(null)
      }
    }, timeout)
  }

  useEffect(() => {
    startedRef.current = started
  }, [started])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [nextSnapshot, emergencyResult] = await Promise.all([
          api<Bootstrap>('/bootstrap'),
          api<{ requests: EmergencyRequest[] }>('/emergency-requests'),
        ])
        if (cancelled) return
        setConnected(true)

        const openEmergency = emergencyResult.requests.find(request => request.status === 'OPEN')
        if (openEmergency) {
          showAlert({
            key: `emergency:${openEmergency.id}`,
            tier: 4,
            kind: 'emergency',
            title: `🚨 ${openEmergency.item_title}`,
            body: openEmergency.reason,
            meta: '지금 대응 가능한 가족이 있나요?',
          })
        } else if (alertRef.current?.kind === 'emergency') {
          activeAlertKey.current = ''
          alertRef.current = null
          setAlert(null)
        }
        emergencyResult.requests.filter(request => request.status !== 'OPEN').forEach(request => dismissedAlertKeys.current.delete(`emergency:${request.id}`))

        if (!seenNoticeIds.current.size) {
          nextSnapshot.notifications.forEach(notice => seenNoticeIds.current.add(notice.id))
        } else {
          const incoming = nextSnapshot.notifications.find(notice => !seenNoticeIds.current.has(notice.id))
          nextSnapshot.notifications.forEach(notice => seenNoticeIds.current.add(notice.id))
          if (incoming && !openEmergency) {
            showAlert({
              key: `notice:${incoming.id}`,
              tier: tierForNotice(incoming),
              kind: 'notice',
              title: incoming.title,
              body: incoming.body,
              meta: incoming.level === 'IMPORTANT' ? '휴대폰에서 확인해주세요' : '가족 돌봄 현황에 반영됐어요',
            })
          }
        }

        if (!openEmergency && !alertRef.current) {
          const soon = nextSnapshot.assignments
            .filter(item => ['ACCEPTED', 'CANDIDATE_ACCEPTED'].includes(item.status))
            .map(item => ({ assignment: item, careItem: nextSnapshot.items.find(candidate => candidate.id === item.item_id) }))
            .filter(item => item.careItem?.starts_at)
            .sort((left, right) => new Date(left.careItem!.starts_at!).getTime() - new Date(right.careItem!.starts_at!).getTime())
            .find(item => {
              const minutes = (new Date(item.careItem!.starts_at!).getTime() - Date.now()) / 60_000
              return minutes >= -5 && minutes <= 15
            })
          if (soon?.careItem) {
            const member = nextSnapshot.members.find(candidate => candidate.id === soon.assignment.assignee_id)?.name ?? '담당 가족'
            showAlert({
              key: asAssignmentKey(soon.assignment),
              tier: 2,
              kind: 'schedule',
              title: `${soon.careItem.title} 픽업 시간이에요`,
              body: `${formatDate(soon.careItem.starts_at)} ${formatTime(soon.careItem.starts_at)} · 담당 ${member}`,
              meta: '출발 준비를 확인해주세요',
            })
          }
        }
      } catch {
        if (!cancelled) setConnected(false)
      }
    }
    void load()
    const timer = window.setInterval(load, 2_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [voiceMuted])

  const startDisplay = () => {
    setStarted(true)
    if (videoRef.current) {
      videoRef.current.muted = newsMuted
      void videoRef.current.play()
    }
    void document.documentElement.requestFullscreen?.()
    beep()
  }

  return <main className="tv-display">
    <section className="tv-broadcast" aria-label="실제 TV 방송 화면">
      <video
        className="tv-broadcast-video"
        ref={videoRef}
        src={tvNewsVideo}
        poster={tvNewsBackground}
        autoPlay
        muted={!started || newsMuted}
        loop
        playsInline
        aria-label="뉴스 방송 영상"
      />
    </section>

    <div className="tv-sound-controls" aria-label="소리 설정">
      <button type="button" onClick={() => {
        const nextMuted = !newsMuted
        setNewsMuted(nextMuted)
        if (videoRef.current) {
          videoRef.current.muted = nextMuted
          if (!nextMuted) void videoRef.current.play()
        }
      }}>{newsMuted ? '🔇 뉴스 소리 켜기' : '🔊 뉴스 소리 끄기'}</button>
      <button type="button" onClick={() => setVoiceMuted(value => !value)}>
        {voiceMuted ? '🔇 안내 음성 켜기' : '🔊 안내 음성 끄기'}
      </button>
    </div>

    {alert && <section className={`tv-alert tv-alert-tier-${alert.tier}`} role="status">
      <div className="tv-alert-top"><span>{alert.tier === 4 ? '긴급 도움 요청' : alert.tier === 3 ? '확인이 필요한 돌봄' : alert.tier === 2 ? '일정 알림' : '돌봄 소식'}</span><button aria-label="알림 닫기" onClick={() => { dismissedAlertKeys.current.add(alert.key); activeAlertKey.current = ''; alertRef.current = null; setAlert(null) }}>×</button></div>
      <h1>{alert.title}</h1>
      <p>{alert.body}</p>
      <strong>{alert.meta}</strong>
      {alert.tier >= 3 && <small>자세한 처리는 가족 앱에서 확인해주세요.</small>}
    </section>}

    {!started && <div className="tv-start-overlay"><div className="tv-start-card"><span className="tv-brand-mark large">LG</span><h1>가족 돌봄 TV 화면</h1><p>모니터 전체화면으로 시연을 시작합니다.<br />알림음 재생을 위해 한 번 눌러주세요.</p><button onClick={startDisplay}>시연 시작</button><small>{connected ? '가족 앱과 연결을 기다리고 있어요.' : '가족 앱에서 먼저 로그인한 뒤 다시 열어주세요.'}</small></div></div>}
  </main>
}

export default TvDisplay
