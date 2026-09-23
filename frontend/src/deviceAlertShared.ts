import type { DeviceCatalogItem, Notice } from './api'

export type Tier = 1 | 2 | 3 | 4
export type AlertKind = 'notice' | 'schedule' | 'emergency'
export type DeviceAlert = {
  key: string
  tier: Tier
  title: string
  body: string
  meta: string
  kind: AlertKind
  contentKey: string
}

export const tierForNotice = (notice: Notice): Tier => {
  if (notice.action_type === 'HANDOFF' || notice.action_type === 'ASSIGNMENT_REQUEST') return 3
  if (notice.action_type === 'ASSIGNMENT_RESULT' && /완료/.test(notice.title)) return 1
  if (notice.level === 'IMPORTANT') return 2
  return 1
}

// Maps a live alert to one of the 8 content categories configured in the
// "알림 받을 내용" screen. Several categories (도착 체크인, 저녁 브리핑, 제도·공백 마감)
// have no real trigger anywhere in the backend yet, so nothing ever maps to them —
// they exist in the settings UI as placeholders for features not built yet.
export const contentKeyForNotice = (notice: Notice): string => {
  if (notice.action_type === 'DEVICE_ALERT_TEST') return 'departure_reminder'
  if (notice.action_type === 'HANDOFF') return 'handoff_note'
  if (notice.action_type === 'ASSIGNMENT_REQUEST') return 'transit_delay'
  if (notice.action_type === 'CARE_SUGGESTION' || notice.action_type === 'EXCEPTION') return 'transit_delay'
  return 'supply_missing'
}

export const beep = (strong = false) => {
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

// TVs and voice appliances share one priority list (no separate "TV first" rule):
// walk it in order, and for each enabled device — a screen device wins only if
// it's currently online, otherwise it's skipped in favor of the next entry; a
// voice device always wins immediately since it has no way to report its state.
export const resolveDeviceAlertChannel = (
  priority: string[],
  enabledDevices: string[],
  catalog: DeviceCatalogItem[],
  isTvOnline: boolean,
): DeviceCatalogItem | null => {
  const byId = new Map(catalog.map(item => [item.id, item]))
  for (const id of priority) {
    if (!enabledDevices.includes(id)) continue
    const device = byId.get(id)
    if (!device) continue
    if (device.type === 'SCREEN') {
      if (isTvOnline) return device
      continue
    }
    return device
  }
  return null
}

export const speechMessageFor = (alert: DeviceAlert) =>
  alert.kind === 'emergency' ? '긴급 돌봄 요청이 발생했어요. 확인이 필요합니다.' : alert.title

export const speak = (message: string, options: { volume?: number; rate?: number; pitch?: number } = {}) => {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(message)
  utterance.lang = 'ko-KR'
  const koreanVoice = window.speechSynthesis.getVoices().find(voice => voice.lang.toLowerCase().startsWith('ko'))
  if (koreanVoice) utterance.voice = koreanVoice
  utterance.rate = options.rate ?? 1.02
  utterance.pitch = options.pitch ?? 1.32
  utterance.volume = options.volume ?? 1
  window.speechSynthesis.speak(utterance)
}
