/* PrintDesk service worker: offline page + cached static assets.
   Pages are always fetched from the network; uploads, downloads, APIs and
   admin pages are never touched. Bump VERSION to drop old caches. */
const VERSION = 'v2';
const STATIC_CACHE = 'pd-static-' + VERSION;
const PAGES_CACHE = 'pd-pages-' + VERSION;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [
  '/css/app.css',
  '/js/app.js',
  '/icons/icon-192.png',
  '/icons/favicon.svg',
  '/fonts/jakarta/plus-jakarta-sans-latin-400-normal.woff2',
  '/fonts/jakarta/plus-jakarta-sans-latin-700-normal.woff2',
];
// Public marketing pages that may be shown from cache when offline.
const OFFLINE_PAGES = ['/', '/demo'];
const STATIC_RE = /^\/(css|js|fonts|icons|brand)\//;

function bypass(url) {
  const p = url.pathname;
  return (
    p.startsWith('/shop/api/') ||
    p.startsWith('/api/') ||
    p.includes('/files/') ||
    /\/o\/[^/]+\/f\//.test(p) ||
    p.startsWith('/logo/') ||
    p === '/admin' ||
    p.startsWith('/admin/') ||
    p === '/sw.js' ||
    p === '/shop/qr.png'
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        // The offline page is required; the rest is best effort.
        cache.add(new Request(OFFLINE_URL, { cache: 'reload' })).then(() =>
          Promise.all(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pd-') && k !== STATIC_CACHE && k !== PAGES_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || bypass(url)) return;
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(event, url));
  } else if (STATIC_RE.test(url.pathname)) {
    event.respondWith(staticAsset(event, req, url));
  }
});

async function networkFirst(event, url) {
  const keep = OFFLINE_PAGES.includes(url.pathname);
  try {
    const res = await fetch(event.request);
    if (keep && res.ok && !res.redirected && res.type === 'basic') {
      const copy = res.clone();
      event.waitUntil(caches.open(PAGES_CACHE).then((cache) => cache.put(url.pathname, copy)));
    }
    return res;
  } catch (err) {
    const cached = keep ? await caches.match(url.pathname, { cacheName: PAGES_CACHE }) : null;
    return cached || (await caches.match(OFFLINE_URL)) || new Response('You are offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

// Versioned (?v=) and font files never change: cache first. Others: stale-while-revalidate.
async function staticAsset(event, req, url) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(req);
  const immutable = url.searchParams.has('v') || url.pathname.startsWith('/fonts/');
  if (hit && immutable) return hit;
  const network = fetch(req)
    .then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        event.waitUntil(cache.put(req, copy).then(() => (url.search ? pruneVersions(cache, url) : null)));
      }
      return res;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(network);
    return hit;
  }
  return (await network) || Response.error();
}

// Keeps one cached copy per asset path (drops older ?v= versions).
async function pruneVersions(cache, url) {
  const keys = await cache.keys();
  await Promise.all(
    keys
      .map((k) => new URL(k.url))
      .filter((k) => k.pathname === url.pathname && k.search && k.search !== url.search)
      .map((k) => cache.delete(k.href))
  );
}
