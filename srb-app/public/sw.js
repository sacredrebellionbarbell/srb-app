self.addEventListener('push', event => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: data.icon || '/logo.jpg',
        badge: data.badge || '/logo.jpg',
        tag: data.tag || 'srb-notification',
        renotify: data.renotify || true,
        vibrate: [200, 100, 200]
      }),
      self.navigator?.setAppBadge && data.badgeCount ? self.navigator.setAppBadge(data.badgeCount).catch(() => {}) : Promise.resolve()
    ])
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    Promise.all([
      self.navigator?.clearAppBadge ? self.navigator.clearAppBadge().catch(() => {}) : Promise.resolve(),
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus()
          }
        }
        if (clients.openWindow) return clients.openWindow('/')
      })
    ])
  )
})

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', () => self.clients.claim())
