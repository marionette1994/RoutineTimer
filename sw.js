/* 律帖 service worker — the app must start on a cold morning with no network. */
const CACHE = 'ritcho-v6';
const CORE = [
  './', './index.html', './app.js', './manifest.json', './icon.svg',
  './vendor/react.production.min.js',
  './vendor/react-dom.production.min.js'
];

self.addEventListener('install', e => {
  // No skipWaiting: a new worker waits until the page asks for it, so assets
  // are never swapped underneath a routine that is midway through.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts. The stylesheet comes back opaque (status 0) and cache.put
  // rejects on those, so the write is allowed to fail quietly.
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) {
    e.respondWith(
      caches.open(CACHE).then(c =>
        c.match(req).then(hit => {
          const net = fetch(req).then(res => {
            c.put(req, res.clone()).catch(() => {});
            return res;
          }).catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  // App shell: cache first, then network, then index.html for navigations.
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.status === 200 && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy).catch(() => {}));
      }
      return res;
    }).catch(() => req.mode === 'navigate' ? caches.match('./index.html') : undefined))
  );
});
