const CACHE = 'zippy-pwa-v3'
const SHELL = ['/', '/manifest.webmanifest', '/app-icon.png']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]))
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) caches.open(CACHE).then(cache => cache.put('/', response.clone()))
        return response
      }).catch(() => caches.match('/') ),
    )
    return
  }

  if (!['script', 'style', 'image', 'font'].includes(request.destination)) return

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()))
      return response
    })),
  )
})

self.addEventListener('push', event => {
  let message = {}
  try { message = event.data?.json() ?? {} } catch { message = { body: event.data?.text() ?? '' } }
  event.waitUntil(self.registration.showNotification(message.title || 'ZIPPY 돌봄 알림', {
    body: message.body || '새로운 돌봄 요청을 확인해주세요.',
    icon: '/app-icon.png',
    tag: message.action_id || message.title || 'zippy-care',
    data: { url: message.url || '/?screen=notifications' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.url || '/?screen=notifications', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (windows[0]) {
      await windows[0].navigate(targetUrl)
      return windows[0].focus()
    }
    return clients.openWindow(targetUrl)
  })())
})
