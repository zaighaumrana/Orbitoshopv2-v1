// Online-only worker: retain the existing install lifecycle, but do not intercept
// requests. No offline cache is populated, so a cache-miss fallback is invalid.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim())
})
