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

  /* --- visited marks ------------------------------------------- */

  /* Ticking a place writes straight into the trip's progress map and
     deliberately does NOT touch updatedAt: the app re-renders a trip when
     updatedAt changes, and rebuilding the page (and its maps) under you
     every time you tick something would be awful. The plan did not change
     — only the record of what you have done. */
  function setDone(tripId, uid, done) {
    var list = readRaw();
    for (var i = 0; i < list.length; i++) {
      if (!list[i] || list[i].id !== tripId) continue;
      var progress = (list[i].progress && typeof list[i].progress === 'object')
        ? list[i].progress : {};
      if (done) progress[uid] = new Date().toISOString();
      else delete progress[uid];
      list[i].progress = progress;
      return writeRaw(list);
    }
    return false;
  }

  /* Notes are the same kind of thing as a tick — a record of the day, not
     a change to the plan — so they skip updatedAt for the same reason. */
  function setNote(tripId, uid, text) {
    var list = readRaw();
    for (var i = 0; i < list.length; i++) {
      if (!list[i] || list[i].id !== tripId) continue;
      var journal = (list[i].journal && typeof list[i].journal === 'object') ? list[i].journal : {};
      var clean = String(text == null ? '' : text).trim();
      if (clean) journal[uid] = { note: clean, at: new Date().toISOString() };
      else delete journal[uid];
      list[i].journal = journal;
      return writeRaw(list);
    }
    return false;
  }

  function clearProgress(tripId) {
    var list = readRaw();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === tripId) {
        list[i].progress = {};
        return writeRaw(list);
      }
    }
    return false;
  }

  /* Trips saved before stops had uids get them assigned by normalize, but
     normalize runs on every read — so without persisting them once, every
     read would mint fresh ids and a tick would never stick. Run at startup,
     before anything renders. */
  function migrateUids() {
    var list = readRaw();
    var needs = list.some(function (t) {
      if (!t || !Array.isArray(t.days)) return false;
      return t.days.some(function (d) {
        return (d && Array.isArray(d.stops) ? d.stops : []).some(function (s) { return s && !s.uid; });
      }) || ((t.food && Array.isArray(t.food.picks)) ? t.food.picks : []).some(function (p) { return p && !p.uid; });
    });
    if (!needs) return;
    writeRaw(list.map(Schema.normalize));
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

  /* Pull the JSON out of whatever an assistant actually produced. Asked
     for "only JSON", models still routinely wrap it in a ```json fence or
     top-and-tail it with a sentence, and making someone hand-trim that on
     a phone is a poor welcome. Anything beyond this is a genuine error
     and gets reported rather than guessed at. */
  function extractJSON(text) {
    var raw = String(text == null ? '' : text).trim();
    if (!raw) throw new Error('冇嘢喺度');

    /* Strip a fenced block, with or without a language tag. */
    var fence = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```\s*$/.exec(raw);
    if (fence) raw = fence[1].trim();

    try { return JSON.parse(raw); } catch (e) { /* fall through */ }

    /* Scan for the first balanced { } or [ ] at the top level, ignoring
       braces that live inside strings. */
    var open = raw.search(/[{[]/);
    if (open === -1) throw new Error('搵唔到 JSON — 睇落唔似係行程資料');

    var start = raw[open];
    var close = start === '{' ? '}' : ']';
    var depth = 0, inStr = false, esc = false;

    for (var i = open; i < raw.length; i++) {
      var c = raw[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === start) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) {
          return JSON.parse(raw.slice(open, i + 1));
        }
      }
    }
    throw new Error('JSON 似乎斷咗 —— 可能 copy 漏咗結尾');
  }

  /* Import always creates a new trip rather than overwriting an existing
     one — losing a trip to a re-import would be the worse surprise. */
  function importText(text) {
    var parsed = extractJSON(text);
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
    setDone: setDone, setNote: setNote, clearProgress: clearProgress, migrateUids: migrateUids,
    exportTrip: exportTrip, importText: importText, extractJSON: extractJSON
  };
})(window);
