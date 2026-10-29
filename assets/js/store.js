/* Travel Marvel · storage
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
  /* The value KEY held before the most recent write. One step of undo is
     enough for the accident that actually happens: a delete you meant for
     the other trip, or an import that overwrote the wrong one. */
  var BACKUP = 'tripbook.trips.bak';
  var BACKUP_AT = 'tripbook.trips.bak.at';

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
    var next;
    try {
      next = JSON.stringify(list);
    } catch (e) {
      console.warn('[store] could not serialise trips', e);
      U.toast('儲存唔到（資料有問題）', true);
      return false;
    }

    /* Keep what was there before this write, so one bad move is
       recoverable. Written first and separately: if the backup fails on
       quota, the real save should still get its chance. */
    var prev = null;
    try { prev = localStorage.getItem(KEY); } catch (e) { /* unreadable; carry on */ }
    if (prev != null && prev !== next) {
      try {
        localStorage.setItem(BACKUP, prev);
        localStorage.setItem(BACKUP_AT, new Date().toISOString());
      } catch (e) {
        /* A backup is a nicety; losing it must not block the save. Drop
           the stale one rather than leave a backup that lies about when
           it was taken. */
        try { localStorage.removeItem(BACKUP); localStorage.removeItem(BACKUP_AT); } catch (e2) { /* ignore */ }
      }
    }

    try {
      localStorage.setItem(KEY, next);
      return true;
    } catch (e) {
      /* Quota is the realistic failure here — a long trip with many
         stops is still only a few KB, but the budget is shared. */
      console.warn('[store] could not save trips', e);
      U.toast('儲存唔到（瀏覽器空間滿咗或者無痕模式）', true);
      return false;
    }
  }

  /* --- one step back -------------------------------------------- */

  /* What the backup holds, for the button that offers it: how many trips
     and when it was taken, or null when there is nothing to go back to. */
  function backupInfo() {
    var raw, at;
    try {
      raw = localStorage.getItem(BACKUP);
      at = localStorage.getItem(BACKUP_AT);
    } catch (e) { return null; }
    if (!raw) return null;
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return null; }
    if (!Array.isArray(parsed)) return null;
    var titles = parsed.map(function (t) { return (t && t.title) || '未命名'; });
    return { count: parsed.length, at: at || '', titles: titles };
  }

  /* Swap the backup back in. The state being replaced becomes the new
     backup, so this undoes itself — press it twice and you are back
     where you started, which is what people expect of one-step undo. */
  function restoreBackup() {
    var info = backupInfo();
    if (!info) return false;
    var raw;
    try { raw = localStorage.getItem(BACKUP); } catch (e) { return false; }
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return false; }
    if (!Array.isArray(parsed)) return false;
    return writeRaw(parsed.map(Schema.normalize));
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

  /* --- booked, and packed ---------------------------------------
     A booking is part of the plan, so it moves updatedAt. Packing items
     are too — but ticking one off is a record of what you have done,
     like a visited mark, so the tick alone does not. */
  function addBooking(tripId, booking) {
    var t = get(tripId);
    if (!t) return null;
    var row = {
      uid: U.uid('bk'),
      at: String((booking && booking.at) || ''),
      when: String((booking && booking.when) || '').trim(),
      title: String((booking && booking.title) || '').trim(),
      ref: String((booking && booking.ref) || '').trim(),
      note: String((booking && booking.note) || '').trim(),
      mapQuery: String((booking && booking.mapQuery) || '').trim()
    };
    if (!row.title && !row.when) return null;
    t.bookings.push(row);
    return save(t) ? row : null;
  }

  function removeBooking(tripId, uid) {
    var t = get(tripId);
    if (!t) return false;
    t.bookings = t.bookings.filter(function (b) { return b.uid !== uid; });
    return !!save(t);
  }

  function addPacking(tripId, text) {
    var t = get(tripId);
    if (!t) return null;
    var clean = String(text == null ? '' : text).trim();
    if (!clean) return null;
    var row = { uid: U.uid('pk'), text: clean, done: false };
    t.packing.push(row);
    return save(t) ? row : null;
  }

  function removePacking(tripId, uid) {
    var t = get(tripId);
    if (!t) return false;
    t.packing = t.packing.filter(function (x) { return x.uid !== uid; });
    return !!save(t);
  }

  /* Skips updatedAt deliberately — see setDone. */
  function setPacked(tripId, uid, done) {
    var list = readRaw();
    for (var i = 0; i < list.length; i++) {
      if (!list[i] || list[i].id !== tripId) continue;
      var packing = Array.isArray(list[i].packing) ? list[i].packing : [];
      for (var j = 0; j < packing.length; j++) {
        if (packing[j] && packing[j].uid === uid) {
          packing[j].done = !!done;
          list[i].packing = packing;
          return writeRaw(list);
        }
      }
      return false;
    }
    return false;
  }

  /* --- what it cost ---------------------------------------------
     Spend is a record of the day, like a tick or a note, so it skips
     updatedAt for the same reason: the plan has not changed, and
     rebuilding the page (and its maps) under you after every entry
     would make logging a coffee feel like an edit. */
  function addSpend(tripId, entry) {
    var list = readRaw();
    for (var i = 0; i < list.length; i++) {
      if (!list[i] || list[i].id !== tripId) continue;
      var amount = Number(entry && entry.amount);
      if (!isFinite(amount) || amount <= 0) return null;
      var spend = Array.isArray(list[i].spend) ? list[i].spend : [];
      var row = {
        uid: U.uid('sp'),
        at: new Date().toISOString(),
        amount: amount,
        cat: String((entry && entry.cat) || 'other'),
        note: String((entry && entry.note) || '').trim(),
        dayId: String((entry && entry.dayId) || ''),
        stopUid: String((entry && entry.stopUid) || '')
      };
      spend.push(row);
      list[i].spend = spend;
      return writeRaw(list) ? row : null;
    }
    return null;
  }

  function removeSpend(tripId, uid) {
    var list = readRaw();
    for (var i = 0; i < list.length; i++) {
      if (!list[i] || list[i].id !== tripId) continue;
      var spend = Array.isArray(list[i].spend) ? list[i].spend : [];
      list[i].spend = spend.filter(function (e) { return !e || e.uid !== uid; });
      return writeRaw(list);
    }
    return false;
  }

  /* The budget IS part of the plan, so this one does move updatedAt. */
  function setBudget(tripId, amount) {
    var t = get(tripId);
    if (!t) return false;
    var n = Number(amount);
    t.budget = (amount === '' || amount == null || !isFinite(n) || n <= 0) ? null : n;
    return !!save(t);
  }

  /* Record somewhere you actually went that was never in the plan.
     Slotted into the day by time so it reads in order, and marked visited
     immediately — you are standing in it. */
  function addFind(tripId, dayId, stop) {
    var list = readRaw();
    for (var i = 0; i < list.length; i++) {
      if (!list[i] || list[i].id !== tripId) continue;

      var trip = Schema.normalize(list[i]);
      var day = trip.days.filter(function (d) { return d.id === dayId; })[0];
      if (!day) return null;

      var fresh = Schema.blankStop();
      Object.keys(stop).forEach(function (k) { fresh[k] = stop[k]; });
      fresh.unplanned = true;

      var mins = U.stopMinutes(fresh.time);
      var at = day.stops.length;
      if (mins != null) {
        for (var j = 0; j < day.stops.length; j++) {
          var other = U.stopMinutes(day.stops[j].time);
          if (other != null && other > mins) { at = j; break; }
        }
      }
      day.stops.splice(at, 0, fresh);

      trip.progress[fresh.uid] = new Date().toISOString();
      trip.updatedAt = new Date().toISOString();
      list[i] = trip;
      return writeRaw(list) ? fresh : null;
    }
    return null;
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
    setDone: setDone, setNote: setNote, addFind: addFind,
    addSpend: addSpend, removeSpend: removeSpend, setBudget: setBudget,
    addBooking: addBooking, removeBooking: removeBooking,
    addPacking: addPacking, removePacking: removePacking, setPacked: setPacked,
    clearProgress: clearProgress, migrateUids: migrateUids,
    backupInfo: backupInfo, restoreBackup: restoreBackup,
    exportTrip: exportTrip, importText: importText, extractJSON: extractJSON
  };
})(window);
