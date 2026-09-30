import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { PushNotifications } from '@capacitor/push-notifications'
import { api, hasFamilyToken } from './api'

const channelId = 'family-care-live'
const legacyLiveStatusChannelId = 'family-care-status'
const persistentCleanupKey = 'family-care-persistent-notifications-cleared-v1'
const pushTokenKey = 'family-care-fcm-token'
export type NativeNoticeAction = { actionType?: string | null; actionId?: string | null }
let nativeActionHandler: ((action: NativeNoticeAction) => void) | undefined
let localActionListenerSetup: Promise<void> | null = null
let pushListenerSetup: Promise<void> | null = null

export const isNativeApp = () => Capacitor.isNativePlatform()
export const isAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
export const isIosApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'

export async function setupNativeNotifications(onAction?: (action: NativeNoticeAction) => void) {
  if (!isNativeApp()) return false
  if (onAction) nativeActionHandler = onAction

  const localPermission = await LocalNotifications.requestPermissions()
  if (localPermission.display === 'granted') {
    if (isAndroidApp()) {
      if (!localStorage.getItem(persistentCleanupKey)) {
        const delivered = await LocalNotifications.getDeliveredNotifications()
        await LocalNotifications.removeDeliveredNotifications(delivered)
        await LocalNotifications.deleteChannel({ id: legacyLiveStatusChannelId })
        localStorage.setItem(persistentCleanupKey, '1')
      }
      await LocalNotifications.createChannel({
        id: channelId,
        name: '가족 돌봄 실시간 알림',
        description: '이동·인수인계 상태를 잠금화면에 표시합니다.',
        importance: 4,
        visibility: 1,
      })
    }
    if (!localActionListenerSetup) {
      localActionListenerSetup = LocalNotifications.addListener('localNotificationActionPerformed', event => {
        const notification = event.notification as typeof event.notification & { data?: { extra?: unknown } }
        const raw = notification.extra ?? notification.data?.extra
        let extra: NativeNoticeAction = {}
        if (typeof raw === 'string') {
          try { extra = JSON.parse(raw) as NativeNoticeAction } catch { /* ignore malformed metadata */ }
        } else if (raw && typeof raw === 'object') {
          extra = raw as NativeNoticeAction
        }
        console.info('[native notification action]', extra)
        nativeActionHandler?.(extra)
      }).then(() => undefined)
    }
    await localActionListenerSetup
  }

  // Android loads the deployed web bundle too: a missing web-build flag must not
  // disable FCM in an APK that already includes the native Firebase configuration.
  if (isAndroidApp() || import.meta.env.VITE_FCM_ENABLED === 'true') {
    try {
      if (!pushListenerSetup) {
        pushListenerSetup = Promise.all([
          PushNotifications.addListener('registration', token => {
            console.info('[FCM] device registered')
            localStorage.setItem(pushTokenKey, token.value)
            void syncPushToken()
          }),
          PushNotifications.addListener('registrationError', error => {
            console.error('[FCM registration error]', error)
          }),
          PushNotifications.addListener('pushNotificationActionPerformed', event => {
            const data = event.notification.data ?? {}
            nativeActionHandler?.({
              actionType: data.action_type ?? data.actionType,
              actionId: data.action_id ?? data.actionId,
            })
          }),
          PushNotifications.addListener('pushNotificationReceived', notification => {
            // Unlike the tap event, the receive event IS the notification.
            const data = notification.data ?? {}
            void showNativeNotice(
              `fcm-${notification.id}`,
              notification.title ?? '가족 돌봄 알림',
              notification.body ?? '',
              data.action_type ?? data.actionType,
              data.action_id ?? data.actionId,
            ).catch(error => console.warn('Foreground notification display failed.', error))
          }),
        ]).then(() => undefined)
      }
      await pushListenerSetup
      const pushPermission = await PushNotifications.requestPermissions()
      if (pushPermission.receive !== 'granted') return false
      await PushNotifications.register()
    } catch (error) {
      console.warn('FCM registration failed.', error)
      return false
    }
  }
  return localPermission.display === 'granted'
}

export async function syncPushToken() {
  const token = localStorage.getItem(pushTokenKey)
  if (!token || !hasFamilyToken()) return false
  try {
    const platform = isIosApp() ? 'IOS' : 'ANDROID'
    await api('/push-tokens', { method: 'POST', body: JSON.stringify({ token, platform }) })
    return true
  } catch {
    console.warn('FCM token registration could not be saved to the server.')
    return false
  }
}

export async function showNativeNotice(id: string, title: string, body: string, actionType?: string | null, actionId?: string | null) {
  if (!isNativeApp()) return false
  const androidOptions = isAndroidApp() ? { channelId, autoCancel: true } : {}
  await LocalNotifications.schedule({ notifications: [{ id: Math.abs(hash(id)), title, body, ...androidOptions, extra: { actionType, actionId } }] })
  return true
}

function hash(value: string) {
  let result = 0
  for (let index = 0; index < value.length; index += 1) result = ((result << 5) - result + value.charCodeAt(index)) | 0
  return result || 1
}
