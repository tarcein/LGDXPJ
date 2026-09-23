import { useEffect, useRef, useState } from 'react'
import { api, send, formatDate, formatTime, type Assignment, type Bootstrap, type EmergencyRequest, type FamilyMe } from './api'
import { beep, contentKeyForNotice, speak, speechMessageFor, tierForNotice, type DeviceAlert } from './deviceAlertShared'
import './tv.css'
import tvNewsBackground from '../../asset/tv-news-background.png'

const tvNewsVideo = '/YTDown.com_YouTube_Media_enRjBDUlWGo_001_720p.mp4'

type TvAlert = DeviceAlert

// Reports whether this screen is actually visible (not locked/minimized) so the
// backend's "TV on/off" rule can decide whether to pop it up here or speak it
// through the priority voice appliance instead. Windows screen lock (Win+L)
// does NOT reliably fire visibilitychange on every Chromium build — the OS lock
// screen is a separate secure desktop, so the browser tab can stay "visible" as
// far as the Page Visibility API is concerned. Losing window focus is the more
// reliable signal for that case, so a screen only counts as "on" when it is
// both visible AND focused, and both the visibilitychange/blur/focus events and
// the regular poll loop re-check and re-report this on every tick instead of
// only ever reporting "on" and waiting for a one-shot event to report "off".
const isTvScreenActive = () => document.visibilityState === 'visible' && document.hasFocus()
const reportTvStatus = (status: 'on' | 'off') => {
  void send('/device-alerts/tv-status', 'POST', { status, device_id: 'tv_living' }).catch(() => {})
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
  // TV is a visual channel now — it only makes sound for emergencies, and only
  // when "긴급 알림은 TV 화면에도 소리로 함께" is on (see 가전 알림 우선순위 설정 · 우선순위)
  // AND this screen currently counts as "on" — otherwise a locked/backgrounded
  // TV would keep beeping out loud even though the alert should have moved to
  // the priority voice appliance instead.
  const emergencyTvSoundRef = useRef(true)
  const tvActiveRef = useRef(true)
  // Real Windows session lock (Win+L) does not reliably fire visibilitychange or
  // blur/focus on every Chromium build — the lock screen is a separate "secure
  // desktop" that some Windows/Chrome combinations never tell the page about, so
  // automatic detection alone can't be trusted for a live demo. This lets the
  // presenter force the reported status directly instead of depending on it.
  const [manualForceOff, setManualForceOff] = useState(false)
  const manualForceOffRef = useRef(false)

  const showAlert = (next: TvAlert) => {
    if (activeAlertKey.current === next.key || dismissedAlertKeys.current.has(next.key)) return
    activeAlertKey.current = next.key
    alertRef.current = next
    setAlert(next)
    if (startedRef.current && next.tier === 4 && emergencyTvSoundRef.current && tvActiveRef.current) {
      if (!voiceMuted) beep(true)
      if (!voiceMuted) speak(speechMessageFor(next))
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

  const reportTvStatusNow = () => {
    const active = !manualForceOffRef.current && isTvScreenActive()
    tvActiveRef.current = active
    reportTvStatus(active ? 'on' : 'off')
  }

  useEffect(() => {
    startedRef.current = started
  }, [started])

  useEffect(() => {
    manualForceOffRef.current = manualForceOff
    reportTvStatusNow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualForceOff])

  useEffect(() => {
    reportTvStatusNow()
    document.addEventListener('visibilitychange', reportTvStatusNow)
    window.addEventListener('blur', reportTvStatusNow)
    window.addEventListener('focus', reportTvStatusNow)
    window.addEventListener('pagehide', () => { tvActiveRef.current = false; reportTvStatus('off') })
    return () => {
      document.removeEventListener('visibilitychange', reportTvStatusNow)
      window.removeEventListener('blur', reportTvStatusNow)
      window.removeEventListener('focus', reportTvStatusNow)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const fresh = `?tv_refresh=${Date.now()}`
        const [nextMe, nextSnapshot, emergencyResult, deviceAlertResult] = await Promise.all([
          api<FamilyMe>(`/families/me${fresh}`),
          api<Bootstrap>(`/bootstrap${fresh}`),
          api<{ requests: EmergencyRequest[] }>(`/emergency-requests${fresh}`),
          api<{ settings: { emergency_tv_sound: boolean } }>(`/device-alerts${fresh}`).catch(() => null),
        ])
        if (cancelled) return
        setConnected(true)
        if (deviceAlertResult) emergencyTvSoundRef.current = deviceAlertResult.settings.emergency_tv_sound
        reportTvStatusNow()
        if (!nextSnapshot.notification_preferences.find(item => item.member_id === nextMe.member.id)?.device_enabled) {
          nextSnapshot.notifications.forEach(notice => seenNoticeIds.current.add(notice.id))
          if (alertRef.current) {
            activeAlertKey.current = ''
            alertRef.current = null
            setAlert(null)
          }
          return
        }

        const openEmergency = emergencyResult.requests.find(request => request.status === 'OPEN')
        if (openEmergency) {
          showAlert({
            key: `emergency:${openEmergency.id}`,
            tier: 4,
            kind: 'emergency',
            contentKey: 'emergency_request',
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
              contentKey: contentKeyForNotice(incoming),
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
              contentKey: 'departure_reminder',
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
      <button type="button" className={manualForceOff ? 'tv-force-off active' : 'tv-force-off'} onClick={() => setManualForceOff(value => !value)}>
        {manualForceOff ? '🔒 TV 꺼짐으로 표시 중 · 되돌리기' : '시연용: TV 꺼짐으로 표시'}
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
