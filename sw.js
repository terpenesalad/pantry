/* Pantry — service worker
 *
 * The previous version cached index.html once at install and never refreshed
 * it, so an offline or flaky-network load could serve a build from months ago.
 * The cache name was also a constant, so the stale copy was never evicted.
 * This version revalidates on every successful load and tells the page when a
 * newer build is ready.
 *
 * Bump VERSION whenever you want to guarantee a clean cache.
 */

var VERSION = 'v4';
var SHELL   = 'pantry-shell-' + VERSION;
var RUNTIME = 'pantry-runtime-' + VERSION;

var SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (cache) {
      // addAll rejects wholesale if any single file 404s, which would leave
      // the worker installed with an empty cache. Fetch each independently.
      return Promise.all(SHELL_URLS.map(function (url) {
        return cache.add(url).catch(function () { /* optional asset */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL && k !== RUNTIME) return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    }).then(function () {
      return self.clients.matchAll({ type: 'window' });
    }).then(function (clients) {
      clients.forEach(function (c) {
        c.postMessage({ type: 'SW_UPDATED', version: VERSION });
      });
    })
  );
});

// Lets the page activate a waiting worker on demand.
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isHtmlRequest(req) {
  return req.mode === 'navigate' ||
    (req.headers.get('accept') || '').indexOf('text/html') !== -1;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Leave Firebase, map tiles and audio streams entirely alone.
  if (url.origin !== self.location.origin) return;

  // HTML: network first, but always refresh the cached copy on success so the
  // offline fallback stays current instead of freezing at first install.
  if (isHtmlRequest(req)) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(SHELL).then(function (c) { c.put('./index.html', copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // Static same-origin assets: serve from cache immediately, refresh in the
  // background. Fast paint without going stale.
  e.respondWith(
    caches.match(req).then(function (hit) {
      var network = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(RUNTIME).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || network;
    })
  );
});
