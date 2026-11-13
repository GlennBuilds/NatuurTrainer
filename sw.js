// Service worker: de app start snel en werkt ook zonder verbinding.
const V = 22; // ophogen bij elke wijziging (scripts/versie.py doet dit, ook in index.html)
const VERSION = `natuur-v${V}`;
const SHELL = ['./', 'index.html', `styles.css?v=${V}`, `app.js?v=${V}`, 'data/species.json', 'data/info.json?v=1', 'manifest.webmanifest', 'icons/icon.svg', 'icons/apple-touch-icon.png'];
const IMG_CACHE = 'natuur-img-2';
const IMG_MAX = 1500;
const TIMEOUT = 3500;

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

// Foto's: eerst uit de cache. Ophalen mét CORS, zodat de browser de echte grootte kent
// (zonder CORS telt elke foto als megabytes mee in de opslaglimiet).
async function photo(req) {
  const c = await caches.open(IMG_CACHE);
  const hit = await c.match(req.url);
  if (hit) return hit;
  try {
    // cache: 'reload' slaat de browsercache over: daar kan dezelfde foto nog zonder CORS-kop in staan
    const res = await fetch(req.url, { mode: 'cors', credentials: 'omit', cache: 'reload' });
    // foto's in volle grootte (alleen bij inzoomen) niet bewaren: die zijn groot en worden zelden opnieuw bekeken
    if (res.ok && !/\/original\./.test(req.url)) { c.put(req.url, res.clone()).then(trim).catch(() => {}); }
    return res;
  } catch {
    return fetch(req); // lukt CORS niet, dan gewoon tonen zonder te bewaren
  }
}

// Bestanden met ?v= veranderen nooit: cache eerst.
async function cacheFirst(req) {
  const c = await caches.open(VERSION);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) c.put(req, res.clone());
  return res;
}

// De pagina en de soortenlijst: netwerk eerst zodat updates direct binnenkomen,
// maar bij een trage of ontbrekende verbinding na een paar seconden de bewaarde versie.
async function networkFirst(req, fallbackKey) {
  const c = await caches.open(VERSION);
  const cached = () => c.match(req, { ignoreSearch: true }).then(r => r || (fallbackKey ? c.match(fallbackKey) : undefined));
  const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; });
  net.catch(() => {}); // fout wordt hieronder afgehandeld
  const slow = new Promise(resolve => setTimeout(resolve, TIMEOUT));
  try {
    const first = await Promise.race([net, slow]);
    if (first) return first;
    return (await cached()) || await net;
  } catch {
    const hit = await cached();
    if (hit) return hit;
    throw new Error('offline');
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/inaturalist/.test(url.hostname)) return e.respondWith(photo(req));
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') return e.respondWith(networkFirst(req, 'index.html'));
  if (url.searchParams.has('v')) return e.respondWith(cacheFirst(req));
  e.respondWith(networkFirst(req));
});
