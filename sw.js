/* Travel Marvel · service worker
 *
 * Two caches with different rules:
 *
 *   shell — the app itself (HTML, CSS, JS, fonts, Leaflet). Precached on
 *           install, served cache-first, refreshed in the background.
 *           This is what makes the app open at all with no signal.
 *
 *   tiles — OpenStreetMap map tiles, cached as you look at them, plus
 *           whatever the "download offline maps" button fetches. Served
 *           cache-first; a miss with no network fails quietly and Leaflet
 *           draws a blank square rather than hanging.
 *
 * Live data (weather, FX) is never cached — a stale exchange rate is worse
 * than an honest "需上網更新".
 */
const VERSION = 'v30';
const SHELL = 'tripbook-shell-' + VERSION;
const TILES = 'tripbook-tiles-' + VERSION;

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/icon-48.png',
  './assets/icon-192.png',
  './assets/apple-touch-icon.png',
  './assets/icon-512.png',
  './assets/hero-wide.jpg',
  './assets/fonts/fonts.css',
  './assets/fonts/fraunces-latin-400-normal.woff2',
  './assets/fonts/fraunces-latin-400-italic.woff2',
  './assets/fonts/fraunces-latin-600-normal.woff2',
  './assets/fonts/fraunces-latin-900-normal.woff2',
  './assets/vendor/leaflet/leaflet.css',
  './assets/vendor/leaflet/leaflet.js',
  './assets/js/util.js',
  './assets/js/schema.js',
  './assets/js/store.js',
  './assets/js/sync.js',
  './assets/js/widgets.js',
  './assets/js/layout.js',
  './assets/js/maps.js',
  './assets/js/share.js',
  './assets/js/geocode.js',
  './assets/js/checkup.js',
  './assets/js/hotels.js',
  './assets/js/passport.js',
  './data/places.js',
  './data/world.js',
  './data/cities.js',
  './assets/js/offline.js',
  './assets/js/photos.js',
  './assets/js/cover.js',
  './assets/js/dragsort.js',
  './assets/js/render.js',
  './assets/js/editor.js',
  './assets/js/app.js',
  './data/builtin.js',
  './assets/js/aiprompt.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      /* Individually, so one failed file does not abort the whole install. */
      .then((cache) => Promise.all(
        /* cache: 'reload' goes past the browser's HTTP cache. GitHub
           Pages lets browsers keep a file for 10 minutes, so a plain add()
           made just after a visit stored the NEW index.html beside the OLD
           app.js: the page showed buttons its code did not know, and
           tapping them did nothing. Every file of a version comes from the
           server, or the version is not installed at all. */
        SHELL_FILES.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
          console.warn('[sw] could not precache', url, err);
        }))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL && k !== TILES).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isTile(url) {
  return /^https?:\/\/[abc]?\.?tile\.openstreetmap\.org\//.test(url) ||
         /tile\.openstreetmap\.org\//.test(url);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = req.url;

  if (isTile(url)) {
    event.respondWith(
      caches.open(TILES).then((cache) =>
        cache.match(req).then((hit) => {
          if (hit) return hit;
          return fetch(req).then((res) => {
            /* Leaflet requests tiles as plain <img>, so the response is
               opaque: status 0, not 200. Caching only 200s would silently
               skip every tile the map itself loads and leave just the
               explicit prefetch working. */
            if (res && (res.status === 200 || res.type === 'opaque')) {
              cache.put(req, res.clone());
            }
            return res;
          }).catch(() => new Response('', { status: 504, statusText: 'offline' }));
        })
      )
    );
    return;
  }

  /* Weather and FX must stay live; let them fail honestly when offline. */
  if (/api\.open-meteo\.com|currency-api|open\.er-api\.com|nominatim\.openstreetmap\.org/.test(url)) return;

  /* Google Fonts is a progressive enhancement — cache opportunistically so
     the Chinese face survives offline once it has been seen, but never
     block on it. */
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) {
    event.respondWith(
      caches.open(SHELL).then((cache) =>
        cache.match(req).then((hit) => hit || fetch(req).then((res) => {
          if (res && (res.status === 200 || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        }).catch(() => new Response('', { status: 504 })))
      )
    );
    return;
  }

  /* Same-origin app files: from this version's cache, as a set.

     There used to be a background refresh here as well, which rewrote
     single files in place. Between a deploy and the new worker taking
     over, that put one version's index.html next to another version's
     scripts. Every deploy ships a new VERSION, so a version's files never
     change after install; the whole set is replaced at once when the next
     worker activates. Only a file this version did not precache comes
     from the network, and is kept for next time. */
  if (new URL(url).origin === self.location.origin) {
    event.respondWith(
      caches.open(SHELL).then((cache) =>
        cache.match(req, { ignoreSearch: false }).then((hit) => {
          if (hit) return hit;
          return fetch(req, { cache: 'no-cache' }).then((res) => {
            if (res && res.status === 200 && req.method === 'GET') cache.put(req, res.clone());
            return res;
          }).catch(() => new Response('', { status: 504 }));
        })
      )
    );
  }
});

/* The page asks for a bounded set of tiles to be warmed before a trip.
   Bounded deliberately: OpenStreetMap's tile policy treats fetching large
   areas as bulk downloading, so the page caps the list and we fetch it
   politely, one at a time. */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'PREFETCH_TILES' || !Array.isArray(data.urls)) return;

  const urls = data.urls.slice(0, 250);
  const client = event.source;
  let done = 0, failed = 0;

  caches.open(TILES).then(async (cache) => {
    for (const url of urls) {
      try {
        const hit = await cache.match(url);
        if (!hit) {
          const res = await fetch(url, { mode: 'cors' });
          if (res && res.status === 200) await cache.put(url, res.clone());
          else failed++;
          /* Small gap between requests — we are a guest on someone's
             free tile server. */
          await new Promise((r) => setTimeout(r, 90));
        }
      } catch (e) {
        failed++;
      }
      done++;
      if (client) client.postMessage({ type: 'PREFETCH_PROGRESS', done, total: urls.length, failed });
    }
    if (client) client.postMessage({ type: 'PREFETCH_DONE', done, total: urls.length, failed });
  });
});
