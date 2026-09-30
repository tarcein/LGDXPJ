import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/nativeNotifications.ts', import.meta.url), 'utf8')

// Exercise the actual module without a device or sending real notifications.
function harness({ platform = 'android', fcmEnabled, permission = 'granted', registerFails = false } = {}) {
  const listeners = new Map()
  const listenerCounts = new Map()
  const notices = []
  const requests = []
  const storage = new Map()
  let registrations = 0
  const addListener = async (name, handler) => {
    listeners.set(name, handler)
    listenerCounts.set(name, (listenerCounts.get(name) ?? 0) + 1)
    return { remove: async () => {} }
  }
  const modules = {
    '@capacitor/core': { Capacitor: {
      isNativePlatform: () => platform !== 'web',
      getPlatform: () => platform,
    } },
    '@capacitor/local-notifications': { LocalNotifications: {
      requestPermissions: async () => ({ display: permission }),
      getDeliveredNotifications: async () => ({ notifications: [] }),
      removeDeliveredNotifications: async () => {},
      deleteChannel: async () => {},
      createChannel: async () => {},
      addListener,
      schedule: async ({ notifications }) => { notices.push(...notifications) },
    } },
    '@capacitor/push-notifications': { PushNotifications: {
      addListener,
      requestPermissions: async () => ({ receive: permission }),
      register: async () => {
        if (registerFails) throw new Error('registration failed')
        registrations += 1
        listeners.get('registration')({ value: 'test-device-token' })
      },
    } },
    './api': {
      hasFamilyToken: () => true,
      api: async (path, options) => { requests.push({ path, ...JSON.parse(options.body) }) },
    },
  }
  const { outputText } = ts.transpileModule(
    source.replaceAll('import.meta.env.VITE_FCM_ENABLED', JSON.stringify(fcmEnabled) ?? 'undefined'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } },
  )
  const exports = {}
  runInNewContext(outputText, {
    exports,
    require: name => {
      assert.ok(modules[name], `Unexpected import: ${name}`)
      return modules[name]
    },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    console: { info() {}, warn() {}, error() {} },
  })
  return { ...exports, listeners, listenerCounts, notices, requests, get registrations() { return registrations } }
}

for (const fcmEnabled of [undefined, 'false', 'true']) {
  test(`Android registers and saves its push token with web-build flag ${fcmEnabled}`, async () => {
    const app = harness({ fcmEnabled })
    assert.equal(await app.setupNativeNotifications(), true)
    assert.equal(app.registrations, 1)
    assert.deepEqual(app.requests, [{ path: '/push-tokens', token: 'test-device-token', platform: 'ANDROID' }])
  })
}

test('foreground FCM payload displays once, repeated setup does not add duplicate listeners', async () => {
  const app = harness()
  let oldActions = 0
  let action
  await app.setupNativeNotifications(() => { oldActions += 1 })
  await app.setupNativeNotifications(value => { action = value })
  for (const count of app.listenerCounts.values()) assert.equal(count, 1)
  const notification = { id: 'message-1', title: '돌봄 요청', body: '담당 요청입니다', data: {
    action_type: 'ASSIGNMENT_REQUEST', action_id: 'assignment-1',
  } }
  app.listeners.get('pushNotificationReceived')(notification)
  assert.equal(app.notices.length, 1)
  const notice = app.notices[0]
  assert.equal(notice.title, notification.title)
  assert.equal(notice.body, notification.body)
  assert.equal(notice.channelId, 'family-care-live')
  assert.equal(notice.extra.actionId, 'assignment-1')
  app.listeners.get('pushNotificationReceived')(notification)
  assert.equal(app.notices[1].id, notice.id, 'A redelivery must reuse the OS notification ID')
  app.listeners.get('pushNotificationReceived')({ id: 'message-2', data: {} })
  assert.notEqual(app.notices[2].id, notice.id)
  assert.equal(app.notices[2].title, '가족 돌봄 알림')
  app.listeners.get('pushNotificationActionPerformed')({ notification })
  assert.equal(oldActions, 0)
  assert.equal(action.actionType, 'ASSIGNMENT_REQUEST')
  assert.equal(action.actionId, 'assignment-1')
})

test('denied permission and registration failures are not reported as enabled', async () => {
  const denied = harness({ permission: 'denied' })
  assert.equal(await denied.setupNativeNotifications(), false)
  assert.equal(denied.registrations, 0)
  assert.equal(await harness({ registerFails: true }).setupNativeNotifications(), false)
})

test('web/PWA does not start native FCM even when the flag is enabled', async () => {
  const app = harness({ platform: 'web', fcmEnabled: 'true' })
  assert.equal(await app.setupNativeNotifications(), false)
  assert.equal(app.registrations, 0)
  assert.equal(app.listenerCounts.size, 0)
})
