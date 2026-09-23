import { useEffect, useRef, useState } from 'react'
import { api, formatDate, formatTime, type Assignment, type Bootstrap, type DeviceAlertSettings, type DeviceAlertsResponse, type DeviceCatalogItem, type EmergencyRequest, type FamilyMe } from './api'
import { beep, contentKeyForNotice, resolveDeviceAlertChannel, speak, speechMessageFor, tierForNotice, type DeviceAlert } from './deviceAlertShared'
import './tv.css'

const asAssignmentKey = (assignment: Assignment) => `schedule:${assignment.id}`

const isWithinQuietHours = (start: string, end: string) => {
  const now = new Date()
  const minutesNow = now.getHours() * 60 + now.getMinutes()
  const [startH, startM] = start.split(':').map(Number)
  const [endH, endM] = end.split(':').map(Number)
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM
  if (startMinutes === endMinutes) return false
  return startMinutes < endMinutes
    ? minutesNow >= startMinutes && minutesNow < endMinutes
    : minutesNow >= startMinutes || minutesNow < endMinutes
}

function VoiceDeviceDisplay() {
  const [started, setStarted] = useState(false)
  const [connected, setConnected] = useState(true)
  const [activeDevice, setActiveDevice] = useState<DeviceCatalogItem | null>(null)
  const [lastSpoken, setLastSpoken] = useState<{ message: string; at: number } | null>(null)
  const [muted, setMuted] = useState(false)
  const seenNoticeIds = useRef(new Set<string>())
  const seenKeys = useRef(new Set<string>())
  const startedRef = useRef(false)

  useEffect(() => { startedRef.current = started }, [started])

  useEffect(() => {
    let cancelled = false
    const announce = (alert: DeviceAlert, settings: DeviceAlertSettings) => {
      if (!startedRef.current || muted) return
      beep(alert.tier === 4)
      const message = speechMessageFor(alert)
      speak(message, { volume: settings.speech_volume / 100 })
      setLastSpoken({ message, at: Date.now() })
    }

    const load = async () => {
      try {
        const fresh = `?voice_refresh=${Date.now()}`
        const [nextMe, nextSnapshot, emergencyResult, deviceAlerts] = await Promise.all([
          api<FamilyMe>(`/families/me${fresh}`),
          api<Bootstrap>(`/bootstrap${fresh}`),
          api<{ requests: EmergencyRequest[] }>(`/emergency-requests${fresh}`),
          api<DeviceAlertsResponse>(`/device-alerts${fresh}`),
        ])
        if (cancelled) return
        setConnected(true)
        const { settings, catalog, tv_online: tvOnline } = deviceAlerts
        const winner = resolveDeviceAlertChannel(settings.priority, settings.devices, catalog, tvOnline)
        // Only take over as the active voice device when the winning entry is
        // actually a voice appliance — if it resolved to an online screen, that
        // screen is already showing the alert and this page should stay silent.
        const device = winner?.type === 'VOICE' ? winner : null
        setActiveDevice(device)

        const preferenceOn = nextSnapshot.notification_preferences.find(item => item.member_id === nextMe.member.id)?.device_enabled
        if (!preferenceOn || !device) {
          nextSnapshot.notifications.forEach(notice => seenNoticeIds.current.add(notice.id))
          return
        }
        if (isWithinQuietHours(settings.quiet_start, settings.quiet_end)) return

        const matrix = settings.content_matrix

        const openEmergency = emergencyResult.requests.find(request => request.status === 'OPEN')
        if (openEmergency) {
          const key = `emergency:${openEmergency.id}`
          if (!seenKeys.current.has(key) && matrix.emergency_request?.voice) {
            seenKeys.current.add(key)
            announce({
              key, tier: 4, kind: 'emergency', contentKey: 'emergency_request',
              title: `🚨 ${openEmergency.item_title}`, body: openEmergency.reason, meta: '',
            }, settings)
          }
        }

        if (!seenNoticeIds.current.size) {
          nextSnapshot.notifications.forEach(notice => seenNoticeIds.current.add(notice.id))
        } else {
          const incoming = nextSnapshot.notifications.find(notice => !seenNoticeIds.current.has(notice.id))
          nextSnapshot.notifications.forEach(notice => seenNoticeIds.current.add(notice.id))
          if (incoming && !openEmergency) {
            const contentKey = contentKeyForNotice(incoming)
            if (matrix[contentKey]?.voice) {
              announce({
                key: `notice:${incoming.id}`, tier: tierForNotice(incoming), kind: 'notice', contentKey,
                title: incoming.title, body: incoming.body, meta: '',
              }, settings)
            }
          }
        }

        if (!openEmergency && matrix.departure_reminder?.voice) {
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
            const key = asAssignmentKey(soon.assignment)
            if (!seenKeys.current.has(key)) {
              seenKeys.current.add(key)
              const member = nextSnapshot.members.find(candidate => candidate.id === soon.assignment.assignee_id)?.name ?? '담당 가족'
              announce({
                key, tier: 2, kind: 'schedule', contentKey: 'departure_reminder',
                title: `${soon.careItem.title} 픽업 시간이에요`,
                body: `${formatDate(soon.careItem.starts_at)} ${formatTime(soon.careItem.starts_at)} · 담당 ${member}`,
                meta: '',
              }, settings)
            }
          }
        }
      } catch {
        if (!cancelled) setConnected(false)
      }
    }
    void load()
    const timer = window.setInterval(load, 2_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [muted])

  return <main className="tv-display voice-display">
    <div className="voice-status-card">
      <span className="tv-brand-mark large">🔊</span>
      <h1>{activeDevice ? activeDevice.name : '음성 알림 가전'}</h1>
      <p>{activeDevice ? `${activeDevice.location} · 지금 우선순위 차례라 이 가전이 음성으로 안내해요` : '지금은 화면 가전이 켜져 있거나, 우선순위에 등록된 음성 가전이 없어요'}</p>
      {lastSpoken && <div className="voice-last-spoken"><small>방금 말한 내용</small><strong>“{lastSpoken.message}”</strong></div>}
      {!started && <button onClick={() => { setStarted(true); beep() }}>시연 시작 (소리 재생 허용)</button>}
      {started && <button className="voice-mute-toggle" onClick={() => setMuted(value => !value)}>{muted ? '🔇 음소거 중 · 해제' : '🔊 음성 켜짐 · 끄기'}</button>}
      <small className="voice-connection">{connected ? '가족 앱과 연결됨' : '가족 앱에서 먼저 로그인한 뒤 다시 열어주세요.'}</small>
    </div>
  </main>
}

export default VoiceDeviceDisplay
