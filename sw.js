const CACHE_NAME = 'pantry-v1';

self.addEventListener('install', (e) => {
  // Cache the shell so the app loads offline
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.add('./index.html'))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Clean up old caches
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Network first — keeps Firebase live data working
  // Falls back to cache if offline
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
