import { useEffect, useRef, useState } from 'react'
import { api, send, trackPerformanceEvent, formatDate, formatTime, type Assignment, type Bootstrap, type EmergencyRequest, type FamilyMe } from './api'
import { beep, contentKeyForNotice, speak, speechMessageFor, tierForNotice, type DeviceAlert } from './deviceAlertShared'
import './tv.css'
import tvNewsBackground from '../../asset/tv-news-background.png'

const tvNewsVideo = '/YTDown.com_YouTube_Media_enRjBDUlWGo_001_720p.mp4'

type TvAlert = DeviceAlert

// Focus can move to the controller app while a dedicated TV window remains
// visible, so focus loss must not mute the TV. Visibility plus the manual screen
// toggle below determines whether this display is on.
const isTvScreenActive = () => document.visibilityState === 'visible'
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
  const noticesInitialized = useRef(false)
  const seenEmergencyIds = useRef(new Set<string>())
  const emergenciesInitialized = useRef(false)
  const dismissedAlertKeys = useRef(new Set<string>())
  const activeAlertKey = useRef('')
  const alertRef = useRef<TvAlert | null>(null)
  const startedRef = useRef(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  // Visible TV alerts use a short chime. Emergency alerts additionally use a
  // stronger chime and speech when the emergency TV sound setting is enabled.
  // A locked/backgrounded TV stays silent so the priority voice appliance can
  // take over instead.
  const emergencyTvSoundRef = useRef(true)
  const tvActiveRef = useRef(true)
  // Real Windows session lock (Win+L) does not reliably fire visibilitychange or
  // blur/focus on every Chromium build — the lock screen is a separate "secure
  // desktop" that some Windows/Chrome combinations never tell the page about, so
  // automatic detection alone can't be trusted for a live demo. This lets the
  // presenter force the reported status directly instead of depending on it.
  const [manualForceOff, setManualForceOff] = useState(false)
  const manualForceOffRef = useRef(false)

  const playAlertSound = (next: TvAlert) => {
    if (!tvActiveRef.current || voiceMuted || (next.tier === 4 && !emergencyTvSoundRef.current)) return
    beep(next.tier === 4)
    if (next.tier === 4) speak(speechMessageFor(next))
  }

  const showAlert = (next: TvAlert) => {
    if (activeAlertKey.current === next.key || dismissedAlertKeys.current.has(next.key)) return
    activeAlertKey.current = next.key
    alertRef.current = next
    setAlert(next)
    if (tvActiveRef.current) {
      trackPerformanceEvent('device_alert_presented', {
        channel: 'TV', device_id: 'tv_living', alert_kind: next.kind, content_key: next.contentKey,
      }, next.key)
    }
    if (startedRef.current) playAlertSound(next)
    const timeout = next.tier === 4 ? 30_000 : next.tier === 3 ? 25_000 : next.tier === 2 ? 12_000 : 5_000
    window.setTimeout(() => {
      if (activeAlertKey.current === next.key) {
        dismissedAlertKeys.current.add(next.key)
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
    if (manualForceOff) videoRef.current?.pause()
    else if (startedRef.current) void videoRef.current?.play()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualForceOff])

  useEffect(() => {
    reportTvStatusNow()
    document.addEventListener('visibilitychange', reportTvStatusNow)
    window.addEventListener('pagehide', () => { tvActiveRef.current = false; reportTvStatus('off') })
    return () => {
      document.removeEventListener('visibilitychange', reportTvStatusNow)
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
        const incomingNotice = noticesInitialized.current
          ? nextSnapshot.notifications.find(notice => !seenNoticeIds.current.has(notice.id))
          : undefined
        nextSnapshot.notifications.forEach(notice => seenNoticeIds.current.add(notice.id))
        noticesInitialized.current = true
        const openEmergencies = emergencyResult.requests.filter(request => request.status === 'OPEN')
        const incomingEmergency = emergenciesInitialized.current
          ? openEmergencies.find(request => !seenEmergencyIds.current.has(request.id))
          : undefined
        openEmergencies.forEach(request => seenEmergencyIds.current.add(request.id))
        emergenciesInitialized.current = true
        if (!nextSnapshot.notification_preferences.find(item => item.member_id === nextMe.member.id)?.device_enabled) {
          if (alertRef.current) {
            activeAlertKey.current = ''
            alertRef.current = null
            setAlert(null)
          }
          return
        }

        const activeEmergencyId = alertRef.current?.kind === 'emergency' ? alertRef.current.key.replace('emergency:', '') : null
        if (activeEmergencyId && !openEmergencies.some(request => request.id === activeEmergencyId)) {
          activeAlertKey.current = ''
          alertRef.current = null
          setAlert(null)
        }
        if (startedRef.current && tvActiveRef.current && incomingEmergency) {
          showAlert({
            key: `emergency:${incomingEmergency.id}`,
            tier: 4,
            kind: 'emergency',
            contentKey: 'emergency_request',
            title: `🚨 ${incomingEmergency.item_title}`,
            body: incomingEmergency.reason,
            meta: '지금 대응 가능한 가족이 있나요?',
          })
        }
        emergencyResult.requests.filter(request => request.status !== 'OPEN').forEach(request => dismissedAlertKeys.current.delete(`emergency:${request.id}`))

        const routedElsewhere = incomingNotice?.action_type === 'DEVICE_ALERT_TEST' && incomingNotice.action_id && incomingNotice.action_id !== 'tv_living'
        if (startedRef.current && tvActiveRef.current && incomingNotice && !incomingEmergency && !routedElsewhere) {
          showAlert({
            key: `notice:${incomingNotice.id}`,
            tier: tierForNotice(incomingNotice),
            kind: 'notice',
            contentKey: contentKeyForNotice(incomingNotice),
            title: incomingNotice.title,
            body: incomingNotice.body,
            meta: incomingNotice.level === 'IMPORTANT' ? '휴대폰에서 확인해주세요' : '가족 돌봄 현황에 반영됐어요',
          })
        }

        if (startedRef.current && tvActiveRef.current && !incomingEmergency && !alertRef.current) {
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
    startedRef.current = true
    if (videoRef.current) {
      videoRef.current.muted = newsMuted
      void videoRef.current.play()
    }
    void document.documentElement.requestFullscreen?.()
    if (alertRef.current) playAlertSound(alertRef.current)
    else beep()
  }

  return <main className={`tv-display${manualForceOff ? ' tv-screen-off' : ''}`}>
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
        {voiceMuted ? '🔇 알림 소리 켜기' : '🔊 알림 소리 끄기'}
      </button>
      <button type="button" className={manualForceOff ? 'tv-force-off active' : 'tv-force-off'} role="switch" aria-checked={!manualForceOff} aria-label="TV 화면" onClick={() => setManualForceOff(value => !value)}>
        {manualForceOff ? 'TV 화면 켜기' : 'TV 화면 끄기'}
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
