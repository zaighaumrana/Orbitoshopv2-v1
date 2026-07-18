const CACHE_NAME = 'orbitoshop-v1'

self.addEventListener('install', () => {
  console.log('[SW] install')
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  console.log('[SW] activate')
  e.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => {
      console.log('[SW] fetch fallback to cache for', e.request.url)
      return caches.match(e.request)
    })
  )
})