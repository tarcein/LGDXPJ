import { Capacitor, registerPlugin } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { PushNotifications } from '@capacitor/push-notifications'
import { api, hasFamilyToken } from './api'

const channelId = 'family-care-live'
const liveStatusChannelId = 'family-care-status'
const pushTokenKey = 'family-care-fcm-token'
const LiveCareStatus = registerPlugin<{
  update(options: { child: string; caregiver: string; status: string; detail: string; progress: number }): Promise<void>
  clear(): Promise<void>
}>('LiveCareStatus')
export type NativeNoticeAction = { actionType?: string | null; actionId?: string | null }

export const isNativeApp = () => Capacitor.isNativePlatform()
export const isAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
export const isIosApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'

export async function setupNativeNotifications(onAction?: (action: NativeNoticeAction) => void) {
  if (!isNativeApp()) return false

  const localPermission = await LocalNotifications.requestPermissions()
  if (localPermission.display === 'granted') {
    if (isAndroidApp()) {
      await LocalNotifications.createChannel({
        id: channelId,
        name: '가족 돌봄 실시간 알림',
        description: '이동·인수인계 상태를 잠금화면에 표시합니다.',
        importance: 4,
        visibility: 1,
      })
      await LocalNotifications.createChannel({
        id: liveStatusChannelId,
        name: '돌봄 현황판',
        description: '현재 돌봄 진행 상태를 표시합니다.',
        importance: 2,
        visibility: 1,
      })
    }
    if (onAction) {
      await LocalNotifications.addListener('localNotificationActionPerformed', event => {
        const notification = event.notification as typeof event.notification & { data?: { extra?: unknown } }
        const raw = notification.extra ?? notification.data?.extra
        let extra: NativeNoticeAction = {}
        if (typeof raw === 'string') {
          try { extra = JSON.parse(raw) as NativeNoticeAction } catch { /* ignore malformed metadata */ }
        } else if (raw && typeof raw === 'object') {
          extra = raw as NativeNoticeAction
        }
        console.info('[native notification action]', extra)
        onAction(extra)
      })
    }
  }

  // FCM is opt-in until google-services.json and a sending server are configured.
  if (import.meta.env.VITE_FCM_ENABLED === 'true') {
    try {
      console.error('[FCM] registration requested')
      await PushNotifications.addListener('registration', token => {
        console.error('[FCM registration token]', token.value)
        localStorage.setItem(pushTokenKey, token.value)
        void syncPushToken()
      })
      await PushNotifications.addListener('registrationError', error => {
        console.error('[FCM registration error]', error)
      })
      if (onAction) {
        await PushNotifications.addListener('pushNotificationActionPerformed', event => {
          const data = event.notification.data ?? {}
          onAction({
            actionType: data.action_type ?? data.actionType,
            actionId: data.action_id ?? data.actionId,
          })
        })
        await PushNotifications.addListener('pushNotificationReceived', event => {
          const data = event.notification.data ?? {}
          void showNativeNotice(
            `fcm-${Date.now()}`,
            event.notification.title ?? '가족 돌봄 알림',
            event.notification.body ?? '',
            data.action_type ?? data.actionType,
            data.action_id ?? data.actionId,
          )
        })
      }
      const pushPermission = await PushNotifications.requestPermissions()
      if (pushPermission.receive === 'granted') await PushNotifications.register()
    } catch (error) {
      console.warn('FCM registration failed.', error)
    }
  }
  return true
}

export async function syncPushToken() {
  const token = localStorage.getItem(pushTokenKey)
  if (!token || !hasFamilyToken()) return false
  try {
    const platform = isIosApp() ? 'IOS' : 'ANDROID'
    await api('/push-tokens', { method: 'POST', body: JSON.stringify({ token, platform }) })
    return true
  } catch {
    return false
  }
}

export async function showNativeNotice(id: string, title: string, body: string, actionType?: string | null, actionId?: string | null) {
  if (!isNativeApp()) return false
  const androidOptions = isAndroidApp() ? { channelId, ongoing: true, autoCancel: false } : {}
  await LocalNotifications.schedule({ notifications: [{ id: Math.abs(hash(id)), title, body, ...androidOptions, extra: { actionType, actionId } }] })
  return true
}

/** A separate, single ongoing notification for the current care status. */
export async function updateLiveCareStatus(title: string, body: string, detail: string, route = '', progress = 1) {
  if (!isAndroidApp()) return false
  const [child, caregiver] = title.split(' · ')
  await LiveCareStatus.update({ child: child || title, caregiver: caregiver || '담당자', status: body, detail: route || detail, progress })
  return true
}

export async function clearLiveCareStatus() {
  if (!isAndroidApp()) return false
  await LiveCareStatus.clear()
  return true
}

function hash(value: string) {
  let result = 0
  for (let index = 0; index < value.length; index += 1) result = ((result << 5) - result + value.charCodeAt(index)) | 0
  return result || 1
}
