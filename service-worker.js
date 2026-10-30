// Caches the app's own files so it opens without internet.
const CACHE = 'anime-notes-v4';
const FILES = ['index.html', 'anime.html', 'trash.html', 'style.css', 'db.js',
  'app.js', 'anime.js', 'trash.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];

// /anime.html, /anime and /anime?id=... are all the same page; /index.html and / too
const keyOf = u => u.origin + u.pathname.replace(/\.html$/, '').replace(/\/index$/, '/');
// Fresh, non-redirected copy (a redirected response can't be used for page navigation)
const clean = async r => new Response(await r.blob(), { headers: { 'Content-Type': r.headers.get('Content-Type') || 'text/plain' } });

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    for (const f of FILES) {
      try { const r = await fetch(f); if (r.ok) await c.put(keyOf(new URL(f, self.location.href)), await clean(r)); } catch {}
    }
  })());
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  const key = keyOf(u);
  // network first (always the newest code), cache when offline
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) clean(r.clone()).then(x => caches.open(CACHE).then(c => c.put(key, x)));
    return r;
  }).catch(() => caches.match(key)));
});
