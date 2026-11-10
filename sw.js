// Service worker: app werkt offline en laadt snel.
const VERSION = 'natuur-v1';
const SHELL = ['./', 'index.html', 'styles.css?v=4', 'app.js?v=4', 'data/species.json', 'manifest.webmanifest', 'icons/icon.svg', 'icons/apple-touch-icon.png'];
const IMG_CACHE = 'natuur-img';
const IMG_MAX = 1500;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== IMG_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim() {
  const c = await caches.open(IMG_CACHE);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - IMG_MAX; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Foto's: eerst uit cache, anders ophalen en bewaren
  if (/inaturalist/.test(url.hostname)) {
    e.respondWith(caches.open(IMG_CACHE).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') { c.put(e.request, res.clone()); trim(); }
      return res;
    }));
    return;
  }

  // Eigen bestanden: netwerk eerst (zodat updates direct binnenkomen), cache als terugval
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: url.pathname.endsWith('.json') }).then(r => r || caches.match('index.html'))));
  }
});
