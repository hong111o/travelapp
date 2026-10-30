/* Travel Marvel · a landscape for each trip
 *
 * The trip header was a flat gradient taking 40% of a desktop screen.
 * Each trip now gets a photo of its city: fetched from Wikipedia the
 * first time the trip is opened, or one of your own, which wins.
 *
 * Covers live in their own IndexedDB database, beside the trip rather
 * than inside it: an image is far too big for localStorage, and keeping
 * the record out of the trip means fetching one never counts as an edit
 * (which would rebuild the page and its maps). Like journal photos, a
 * cover stays on the device — an exported trip simply fetches its own
 * again wherever it is imported.
 *
 * One record per trip:
 *   { tripId, kind: 'auto' | 'own' | 'none', blob, credit, query, tried }
 *   auto  fetched; `query` is what was searched, so a renamed trip refetches
 *   own   chosen by you; never replaced automatically
 *   none  you asked for no cover
 *   an auto record with no blob means "Wikipedia had nothing suitable",
 *   remembered for a week so a city with no usable photo is not
 *   re-searched on every open.
 */
(function (global) {
  'use strict';

  var DB = 'tripbook-covers';
  var STORE = 'covers';
  var RETRY_MS = 7 * 24 * 3600 * 1000;
  var WIDTH = 1800;

  var dbPromise = null;

  function supported() {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'tripId' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('開唔到封面資料庫')); };
    });
    /* A failed open must not poison every later call. */
    dbPromise.catch(function () { dbPromise = null; });
    return dbPromise;
  }

  function run(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var store = db.transaction(STORE, mode).objectStore(STORE);
        var req = fn(store);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function get(tripId) {
    if (!supported() || !tripId) return Promise.resolve(null);
    return run('readonly', function (s) { return s.get(tripId); })
      .then(function (r) { return r || null; }, function () { return null; });
  }

  function put(rec) {
    return run('readwrite', function (s) { return s.put(rec); }).then(function () { return rec; });
  }

  function remove(tripId) {
    if (!supported() || !tripId) return Promise.resolve();
    return run('readwrite', function (s) { return s.delete(tripId); })
      .then(function () {}, function () {});
  }

  /* --- your own photo ------------------------------------------------
     Scaled to the width a hero is ever drawn at, so a 12-megapixel phone
     photo does not sit in the database at full size. */
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, WIDTH / img.naturalWidth);
        var w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('處理唔到呢張相')); }, 'image/jpeg', 0.84);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('讀唔到呢張相')); };
      img.src = url;
    });
  }

  function setOwn(tripId, file) {
    return shrink(file).then(function (blob) {
      return put({ tripId: tripId, kind: 'own', blob: blob, credit: null, query: '', tried: '' });
    });
  }

  function setNone(tripId) {
    return put({ tripId: tripId, kind: 'none', blob: null, credit: null, query: '', tried: '' });
  }

  /* Forget whatever is there, so the next open fetches from Wikipedia. */
  function useAuto(tripId) {
    return remove(tripId);
  }

  /* --- from Wikipedia --------------------------------------------------
     A city article's lead image is very often a portrait montage of six
     small pictures, or a flag, which makes a poor landscape. So rather
     than take the lead image blindly, walk the article's images in the
     order they appear and take the first real photograph that is
     clearly wider than it is tall. */

  var SKIP = /flag|bandera|bandeira|drapeau|coat[ _]of[ _]arms|escudo|blason|wappen|locator|location|map\b|mapa|karte|montage|collage|logo|seal|icon|diagram|chart|signature|\.svg$/i;

  function querySite(q) {
    return /[㐀-鿿]/.test(q) ? 'zh' : 'en';
  }

  function candidates(trip) {
    var out = [];
    [trip.title, trip.place && trip.place.name].forEach(function (q) {
      q = String(q || '').trim();
      if (q && out.indexOf(q) < 0) out.push(q);
    });
    return out;
  }

  /* Part of the cache key: change the city and the cover follows. */
  function queryKey(trip) {
    return candidates(trip).join('|');
  }

  function getJSON(url) {
    return fetch(url, { headers: { 'Accept': 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function plainText(html) {
    var d = document.createElement('div');
    d.innerHTML = String(html || '');
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /* Titles come back normalised (spaces, not underscores); compare that way. */
  function norm(t) { return String(t || '').replace(/_/g, ' ').trim(); }

  function findImage(q) {
    var site = 'https://' + querySite(q) + '.wikipedia.org';
    var page = encodeURIComponent(q.replace(/ /g, '_'));

    return getJSON(site + '/api/rest_v1/page/media-list/' + page).then(function (list) {
      var titles = (list && list.items || [])
        .filter(function (it) {
          return it && it.type === 'image' && /\.jpe?g$/i.test(it.title || '') && !SKIP.test(it.title || '');
        })
        .map(function (it) { return it.title; })
        .slice(0, 15);
      if (!titles.length) return null;

      return getJSON(site + '/w/api.php?action=query&format=json&origin=*' +
        '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=' + WIDTH +
        '&titles=' + encodeURIComponent(titles.join('|'))).then(function (res) {
          var pages = (res && res.query && res.query.pages) || {};
          var byTitle = {};
          Object.keys(pages).forEach(function (k) {
            var p = pages[k];
            if (p && p.imageinfo && p.imageinfo[0]) byTitle[norm(p.title)] = p.imageinfo[0];
          });

          for (var i = 0; i < titles.length; i++) {
            var info = byTitle[norm(titles[i])];
            if (!info || !/jpe?g/i.test(info.mime || '')) continue;
            var w = info.width, h = info.height;
            /* Landscape enough to fill a wide header, and big enough not
               to be soft once it is stretched across a desktop. */
            if (!w || !h || w < 1000 || w < h * 1.3) continue;
            var meta = info.extmetadata || {};
            return {
              src: info.thumburl || info.url,
              credit: {
                artist: plainText(meta.Artist && meta.Artist.value).slice(0, 80),
                license: plainText(meta.LicenseShortName && meta.LicenseShortName.value),
                url: info.descriptionurl || ''
              }
            };
          }
          return null;
        });
    });
  }

  /* Try each way of naming the city until one yields a usable photo. */
  function lookup(trip) {
    var qs = candidates(trip);
    var i = 0;
    function next() {
      if (i >= qs.length) return Promise.resolve(null);
      var q = qs[i++];
      return findImage(q).catch(function () { return null; }).then(function (hit) {
        return hit || next();
      });
    }
    return next();
  }

  var inFlight = {};

  /* Resolves to the record to show, or null for "show the plain header".
     Never rejects: a cover is decoration, and no network, a blocked host
     or an odd article must never surface as an error. */
  function ensure(trip) {
    if (!supported() || !trip || !trip.id) return Promise.resolve(null);
    if (inFlight[trip.id]) return inFlight[trip.id];

    var key = queryKey(trip);
    var p = get(trip.id).then(function (rec) {
      if (rec && (rec.kind === 'own' || rec.kind === 'none')) return rec;
      if (rec && rec.kind === 'auto' && rec.query === key) {
        if (rec.blob) return rec;
        /* Nothing suitable last time; ask again only after a while. */
        if (rec.tried && Date.now() - Date.parse(rec.tried) < RETRY_MS) return null;
      }
      if (!key || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
        return rec && rec.blob ? rec : null;
      }

      return lookup(trip).then(function (hit) {
        if (!hit) {
          return put({ tripId: trip.id, kind: 'auto', blob: null, credit: null, query: key,
            tried: new Date().toISOString() }).then(function () { return null; });
        }
        return fetch(hit.src).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.blob();
        }).then(function (blob) {
          return put({ tripId: trip.id, kind: 'auto', blob: blob, credit: hit.credit, query: key,
            tried: new Date().toISOString() });
        });
      }).catch(function () {
        /* A failed fetch keeps whatever cover was already there. */
        return rec && rec.blob ? rec : null;
      });
    }).catch(function () { return null; }).then(function (r) {
      delete inFlight[trip.id];
      return r;
    });

    inFlight[trip.id] = p;
    return p;
  }

  global.Cover = {
    supported: supported, ensure: ensure, get: get,
    setOwn: setOwn, setNone: setNone, useAuto: useAuto, remove: remove,
    queryKey: queryKey
  };
})(window);
