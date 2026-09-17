/* 行程本 · storage
 *
 * Trips live in localStorage, so the app works offline and needs no
 * server or account. The trade-off is that storage is per-device and
 * per-browser: clearing site data clears trips. Two escape hatches —
 *   1. every trip has an Export button (a .json you can keep anywhere);
 *   2. trips committed to data/trips/ in the repo are seeded on first
 *      run, so they ride along on every device.
 */
(function (global) {
  'use strict';

  var KEY = 'tripbook.trips.v1';
  var SEEDED = 'tripbook.seeded.v1';

  function readRaw() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[store] could not read trips', e);
      return [];
    }
  }

  function writeRaw(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      /* Quota is the realistic failure here — a long trip with many
         stops is still only a few KB, but the budget is shared. */
      console.warn('[store] could not save trips', e);
      U.toast('儲存唔到（瀏覽器空間滿咗或者無痕模式）', true);
      return false;
    }
  }

  function all() {
    return readRaw().map(Schema.normalize).sort(function (a, b) {
      return String(b.startDate || '').localeCompare(String(a.startDate || ''));
    });
  }

  function get(id) {
    var found = readRaw().filter(function (t) { return t && t.id === id; })[0];
    return found ? Schema.normalize(found) : null;
  }

  function save(trip) {
    var t = Schema.normalize(trip);
    t.updatedAt = new Date().toISOString();
    var list = readRaw();
    var i = -1;
    for (var k = 0; k < list.length; k++) {
      if (list[k] && list[k].id === t.id) { i = k; break; }
    }
    if (i >= 0) list[i] = t; else list.push(t);
    return writeRaw(list) ? t : null;
  }

  function remove(id) {
    return writeRaw(readRaw().filter(function (t) { return !t || t.id !== id; }));
  }

  function duplicate(id) {
    var t = get(id);
    if (!t) return null;
    t.id = U.uid('trip');
    t.title = (t.title || '未命名') + '（複本）';
    return save(t);
  }

  /* Seed bundled trips once, then leave them alone — after that they are
     ordinary trips the user can edit or delete without them coming back. */
  function seedIfFirstRun() {
    var builtin = global.BUILTIN_TRIPS;
    if (!Array.isArray(builtin) || !builtin.length) return;
    try {
      if (localStorage.getItem(SEEDED)) return;
    } catch (e) { return; }
    if (readRaw().length === 0) {
      builtin.forEach(function (t) { save(t); });
    }
    try { localStorage.setItem(SEEDED, '1'); } catch (e) { /* ignore */ }
  }

  /* Explicit "load the samples again" from the empty state. */
  function restoreSamples() {
    var builtin = global.BUILTIN_TRIPS;
    if (!Array.isArray(builtin) || !builtin.length) {
      U.toast('冇示範行程可以載入', true);
      return 0;
    }
    var n = 0;
    builtin.forEach(function (t) {
      var copy = Schema.normalize(t);
      if (get(copy.id)) copy.id = U.uid('trip');
      if (save(copy)) n++;
    });
    return n;
  }

  function exportTrip(trip) {
    var t = Schema.normalize(trip);
    delete t.updatedAt;
    var name = U.slug(t.title || 'trip') + '-' + (t.startDate || U.todayISO()).slice(0, 7) + '.json';
    U.download(name, JSON.stringify(t, null, 2));
  }

  /* Import always creates a new trip rather than overwriting an existing
     one — losing a trip to a re-import would be the worse surprise. */
  function importText(text) {
    var parsed = JSON.parse(text);
    var incoming = Array.isArray(parsed) ? parsed : [parsed];
    var saved = [];
    incoming.forEach(function (raw) {
      if (!Schema.looksLikeTrip(raw)) return;
      var t = Schema.normalize(raw);
      if (!t.id || get(t.id)) t.id = U.uid('trip');
      var s = save(t);
      if (s) saved.push(s);
    });
    if (!saved.length) throw new Error('檔案入面搵唔到行程資料');
    return saved;
  }

  global.Store = {
    all: all, get: get, save: save, remove: remove, duplicate: duplicate,
    seedIfFirstRun: seedIfFirstRun, restoreSamples: restoreSamples,
    exportTrip: exportTrip, importText: importText
  };
})(window);
