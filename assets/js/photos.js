/* 行程本 · photo store
 *
 * Photos live in IndexedDB, not in the trip JSON. A phone photo is 4–12MB;
 * a dozen of them would blow past the ~5MB localStorage budget and would
 * make every export unusable. So the trip file carries your notes and
 * ticks, and the images stay on the device.
 *
 * Everything is resized before storing: a 4000px original is pointless on
 * a phone screen and costs ~20x the space of a 1600px one.
 */
(function (global) {
  'use strict';

  var DB = 'tripbook-photos';
  var STORE = 'photos';
  var MAX_EDGE = 1600;      // longest side, px
  var QUALITY = 0.82;
  var dbPromise = null;

  function supported() {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!supported()) { reject(new Error('呢個瀏覽器唔支援相片儲存')); return; }
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          /* Lookups are always "photos for this stop" or "photos for this
             trip", so index both. */
          store.createIndex('place', ['tripId', 'uid'], { unique: false });
          store.createIndex('trip', 'tripId', { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('開唔到相片資料庫')); };
    });
    return dbPromise;
  }

  function tx(mode) {
    return open().then(function (db) {
      return db.transaction(STORE, mode).objectStore(STORE);
    });
  }

  /* --- resizing ------------------------------------------------- */

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('讀唔到呢張相')); };
      img.src = url;
    });
  }

  function shrink(file) {
    return loadImage(file).then(function (img) {
      var w = img.naturalWidth, h = img.naturalHeight;
      var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * scale));
      var ch = Math.max(1, Math.round(h * scale));

      var canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);

      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (blob) resolve({ blob: blob, w: cw, h: ch });
          /* Safari private mode has been known to hand back null here. */
          else reject(new Error('壓縮唔到呢張相'));
        }, 'image/jpeg', QUALITY);
      });
    });
  }

  /* --- CRUD ------------------------------------------------------ */

  function add(tripId, uid, file) {
    if (!/^image\//.test(file.type)) return Promise.reject(new Error('淨係加得相片'));
    return shrink(file).then(function (out) {
      return tx('readwrite').then(function (store) {
        return new Promise(function (resolve, reject) {
          var rec = {
            tripId: tripId, uid: uid, blob: out.blob,
            w: out.w, h: out.h, at: new Date().toISOString()
          };
          var req = store.add(rec);
          req.onsuccess = function () { rec.id = req.result; resolve(rec); };
          req.onerror = function () {
            reject(req.error && req.error.name === 'QuotaExceededError'
              ? new Error('部機冇位喇，刪走啲相先')
              : (req.error || new Error('存唔到')));
          };
        });
      });
    });
  }

  function listFor(tripId, uid) {
    return tx('readonly').then(function (store) {
      return new Promise(function (resolve, reject) {
        var out = [];
        var req = store.index('place').openCursor(IDBKeyRange.only([tripId, uid]));
        req.onsuccess = function () {
          var cur = req.result;
          if (!cur) { resolve(out); return; }
          out.push(cur.value);
          cur.continue();
        };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  /* uid -> count, for the badges shown without loading any image data. */
  function countsFor(tripId) {
    return tx('readonly').then(function (store) {
      return new Promise(function (resolve, reject) {
        var counts = {};
        var req = store.index('trip').openCursor(IDBKeyRange.only(tripId));
        req.onsuccess = function () {
          var cur = req.result;
          if (!cur) { resolve(counts); return; }
          counts[cur.value.uid] = (counts[cur.value.uid] || 0) + 1;
          cur.continue();
        };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return {}; });
  }

  function remove(id) {
    return tx('readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.delete(id);
        req.onsuccess = function () { resolve(true); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function clearTrip(tripId) {
    return tx('readwrite').then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.index('trip').openCursor(IDBKeyRange.only(tripId));
        req.onsuccess = function () {
          var cur = req.result;
          if (!cur) { resolve(true); return; }
          cur.delete();
          cur.continue();
        };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  /* Object URLs leak until revoked, so every URL handed out is tracked and
     dropped when the view changes. */
  var urls = [];

  function urlFor(blob) {
    var url = URL.createObjectURL(blob);
    urls.push(url);
    return url;
  }

  function releaseUrls() {
    urls.forEach(function (u) {
      try { URL.revokeObjectURL(u); } catch (e) { /* already gone */ }
    });
    urls = [];
  }

  global.Photos = {
    supported: supported, add: add, listFor: listFor, countsFor: countsFor,
    remove: remove, clearTrip: clearTrip, urlFor: urlFor, releaseUrls: releaseUrls,
    MAX_EDGE: MAX_EDGE
  };
})(window);
