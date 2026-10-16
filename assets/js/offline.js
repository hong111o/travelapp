/* 行程本 · offline support
 *
 * Registers the service worker, reports connection state, and warms the
 * map tiles a trip needs so the maps still draw with no signal.
 *
 * Tile counts are capped on purpose. OpenStreetMap serves tiles free and
 * asks that clients not bulk-download; their policy treats more than ~250
 * tiles as bulk. So we budget 250 per trip, spread across the days, and
 * pick zoom levels around what the day maps actually display.
 */
(function (global) {
  'use strict';

  var TILE_BUDGET = 250;
  var ready = null;

  /* --- registration -------------------------------------------- */

  /* Reload once when a new worker takes over, so a published change
     actually reaches an installed app. Without this the browser decides
     when to re-check sw.js, and a phone that never re-checks keeps
     running last month's code while every new feature looks broken. */
  var reloading = false;

  function watchForUpdates(reg) {
    if (!reg) return;

    /* A page loaded before any worker existed is uncontrolled, and the
       first controllerchange is just that worker claiming it — reloading
       there would be a pointless flash. Every later one is a genuine
       update and must reload, so the flag is set when the first claim
       happens rather than read once at registration. */
    var sawController = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!sawController) { sawController = true; return; }
      if (reloading) return;
      reloading = true;
      location.reload();
    });

    /* Ask now, and again whenever the app comes back to the foreground —
       the moment someone reopens it from the home screen. */
    var check = function () {
      reg.update().catch(function (err) { console.warn('[offline] update check', err); });
    };
    check();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') check();
    });
  }

  function register() {
    if (!('serviceWorker' in navigator)) return;
    /* file:// has no service worker; that is fine, the app still runs. */
    if (location.protocol === 'file:') return;

    /* updateViaCache:'none' is the whole point of the update check: without
       it the browser answers reg.update() from its own HTTP cache, which
       can hold sw.js for a day, and the app keeps running old code while
       reporting itself up to date. */
    ready = navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then(function (reg) {
        watchForUpdates(reg);
        return navigator.serviceWorker.ready.then(function () { return reg; });
      })
      .catch(function (err) {
        console.warn('[offline] service worker not registered', err);
        return null;
      });
  }

  /* The running version, read off the active cache rather than asked for,
     so it reports what is actually serving the page. */
  function version() {
    if (!('caches' in window)) return Promise.resolve('');
    return caches.keys().then(function (keys) {
      var shell = keys.filter(function (k) { return k.indexOf('tripbook-shell-') === 0; })[0];
      return shell ? shell.replace('tripbook-shell-', '') : '';
    }).catch(function () { return ''; });
  }

  /* Manual "am I up to date?" for when the automatic check has not fired. */
  function checkNow() {
    if (!ready) return Promise.reject(new Error('\u96e2\u7dda\u529f\u80fd\u672a\u6e96\u5099\u597d'));
    return ready.then(function (reg) {
      if (!reg) throw new Error('\u96e2\u7dda\u529f\u80fd\u672a\u6e96\u5099\u597d');
      return reg.update().then(function () {
        /* A waiting worker means a new version is installed and ready;
           activating it triggers the reload above. */
        return !!(reg.waiting || reg.installing);
      });
    });
  }

  /* --- connection banner ---------------------------------------- */

  function paintConnection() {
    var bar = U.el('offbar');
    if (!navigator.onLine) {
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'offbar';
        bar.className = 'offbar';
        bar.innerHTML = '✈️ 離線模式 — 行程照睇，<b>天氣同匯率</b>要有網先更新';
        document.body.insertBefore(bar, document.body.firstChild);
      }
    } else if (bar) {
      bar.remove();
    }
  }

  /* --- tile maths ----------------------------------------------- */

  function lngToX(lng, z) { return Math.floor((lng + 180) / 360 * Math.pow(2, z)); }

  function latToY(lat, z) {
    var r = lat * Math.PI / 180;
    return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z));
  }

  function boundsOf(points) {
    var lats = points.map(function (p) { return p.lat; });
    var lngs = points.map(function (p) { return p.lng; });
    return {
      minLat: Math.min.apply(null, lats), maxLat: Math.max.apply(null, lats),
      minLng: Math.min.apply(null, lngs), maxLng: Math.max.apply(null, lngs)
    };
  }

  function tilesForBounds(b, z, pad) {
    var x0 = lngToX(b.minLng, z) - pad, x1 = lngToX(b.maxLng, z) + pad;
    var y0 = latToY(b.maxLat, z) - pad, y1 = latToY(b.minLat, z) + pad;
    var max = Math.pow(2, z) - 1;
    var out = [];
    for (var x = Math.max(0, x0); x <= Math.min(max, x1); x++) {
      for (var y = Math.max(0, y0); y <= Math.min(max, y1); y++) {
        out.push({ z: z, x: x, y: y });
      }
    }
    return out;
  }

  /* Pick zooms per day: a wide day (a whole region) needs low zoom, a
     walking day needs street level. Spread of ~3 levels around what
     fitBounds would settle on. */
  function zoomsFor(b) {
    var spanLat = Math.abs(b.maxLat - b.minLat);
    var spanLng = Math.abs(b.maxLng - b.minLng);
    var span = Math.max(spanLat, spanLng, 0.002);
    /* 360 degrees across 1 tile at z0; aim for the span to fit ~2 tiles. */
    var fit = Math.floor(Math.log2(360 / span)) ;
    var base = Math.max(9, Math.min(15, fit));
    return [base, base + 1, base + 2];
  }

  function tileUrl(t) {
    var sub = ['a', 'b', 'c'][(t.x + t.y) % 3];
    return 'https://' + sub + '.tile.openstreetmap.org/' + t.z + '/' + t.x + '/' + t.y + '.png';
  }

  /* Every tile the trip's day maps would need, deduped and capped. */
  function planTiles(trip) {
    var perDay = [];
    trip.days.forEach(function (day) {
      var pts = Widgets.pointsFor(day);
      if (!pts.length) return;
      var b = boundsOf(pts);
      var list = [];
      zoomsFor(b).forEach(function (z) {
        list = list.concat(tilesForBounds(b, z, z > 12 ? 1 : 0));
      });
      perDay.push(list);
    });
    if (!perDay.length) return [];

    /* Round-robin across days so a single sprawling day cannot eat the
       whole budget and leave the others with nothing. */
    var out = [], seen = {}, i = 0;
    while (out.length < TILE_BUDGET) {
      var added = false;
      for (var d = 0; d < perDay.length; d++) {
        var t = perDay[d][i];
        if (!t) continue;
        added = true;
        var url = tileUrl(t);
        if (!seen[url]) { seen[url] = true; out.push(url); }
        if (out.length >= TILE_BUDGET) break;
      }
      if (!added) break;
      i++;
    }
    return out;
  }

  /* --- download ------------------------------------------------- */

  function downloadMaps(trip, onProgress) {
    if (!ready) return Promise.reject(new Error('冇 service worker'));
    return ready.then(function (reg) {
      if (!reg || !navigator.serviceWorker.controller) {
        throw new Error('離線功能仲未準備好，refresh 一次再試');
      }
      var urls = planTiles(trip);
      if (!urls.length) throw new Error('呢個行程冇地圖座標');

      return new Promise(function (resolve, reject) {
        function onMessage(e) {
          var d = e.data || {};
          if (d.type === 'PREFETCH_PROGRESS' && onProgress) onProgress(d.done, d.total);
          if (d.type === 'PREFETCH_DONE') {
            navigator.serviceWorker.removeEventListener('message', onMessage);
            resolve(d);
          }
        }
        navigator.serviceWorker.addEventListener('message', onMessage);
        navigator.serviceWorker.controller.postMessage({ type: 'PREFETCH_TILES', urls: urls });
        /* Never leave the button spinning forever. */
        setTimeout(function () {
          navigator.serviceWorker.removeEventListener('message', onMessage);
          reject(new Error('下載超時，試下再撳一次'));
        }, 4 * 60 * 1000);
      });
    });
  }

  function tileCount(trip) { return planTiles(trip).length; }

  function init() {
    register();
    paintConnection();
    window.addEventListener('online', paintConnection);
    window.addEventListener('offline', paintConnection);
  }

  global.Offline = {
    init: init, version: version, checkNow: checkNow,
    downloadMaps: downloadMaps,
    tileCount: tileCount,
    TILE_BUDGET: TILE_BUDGET
  };
})(window);
