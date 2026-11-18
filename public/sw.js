/* Service worker: network-first, falls back to cache when offline.
   Always fetches the newest build when online, so updates are never stuck. */
const CACHE = 'slide-editor-v1';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      // Pre-cache the app shell: index.html plus the JS/CSS it references.
      const res = await fetch('./', { cache: 'reload' });
      const html = await res.clone().text();
      await cache.put('./', res);
      const urls = new Set();
      for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        const u = new URL(m[1], self.registration.scope);
        if (u.origin === self.location.origin) urls.add(u.href);
      }
      await Promise.all([...urls].map((u) => cache.add(u).catch(() => {})));
    } catch (_) { /* offline at install time: runtime caching will fill in */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return; // let media range requests go straight through
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res && res.status === 200 && res.type === 'basic') {
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: false });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await cache.match('./');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
