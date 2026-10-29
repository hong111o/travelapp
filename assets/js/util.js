/* Travel Marvel · shared helpers */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Light inline markup so a description can carry emphasis without
     letting raw HTML from a trip file through: **bold** and line breaks. */
  function rich(s) {
    return esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  }

  /* Strip the inline markup for places that must be plain text
     (map legends, marker popups, card subtitles). */
  function plain(s) {
    return String(s == null ? '' : s).replace(/\*\*([^*]+)\*\*/g, '$1');
  }

  function el(id) { return document.getElementById(id); }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 7);
  }

  /* Filename-safe slug. Accents are folded to their base letter first,
     so "Malaga" with an accent becomes "malaga" rather than "m-laga". */
  function slug(s) {
    var base = String(s || '');
    if (base.normalize) base = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    base = base.toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return base || 'trip';
  }

  function mapsUrl(query) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
  }

  /* --- dates -------------------------------------------------- */

  function parseISODate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  var WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];

  function weekdayZH(iso) {
    var d = parseISODate(iso);
    return d ? WEEKDAY_ZH[d.getUTCDay()] : '';
  }

  /* "18/9" — the short form used on day cards. */
  function shortDate(iso) {
    var d = parseISODate(iso);
    return d ? d.getUTCDate() + '/' + (d.getUTCMonth() + 1) : '';
  }

  /* "2026 年 9 月 18–21 日", collapsing same-month ranges. */
  function dateRangeZH(startISO, endISO) {
    var a = parseISODate(startISO), b = parseISODate(endISO);
    if (!a) return '';
    if (!b || +a === +b) return a.getUTCFullYear() + ' 年 ' + (a.getUTCMonth() + 1) + ' 月 ' + a.getUTCDate() + ' 日';
    if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
      return a.getUTCFullYear() + ' 年 ' + (a.getUTCMonth() + 1) + ' 月 ' +
        a.getUTCDate() + '–' + b.getUTCDate() + ' 日';
    }
    if (a.getUTCFullYear() === b.getUTCFullYear()) {
      return a.getUTCFullYear() + ' 年 ' + (a.getUTCMonth() + 1) + ' 月 ' + a.getUTCDate() + ' 日 – ' +
        (b.getUTCMonth() + 1) + ' 月 ' + b.getUTCDate() + ' 日';
    }
    return a.getUTCFullYear() + '/' + (a.getUTCMonth() + 1) + '/' + a.getUTCDate() + ' – ' +
      b.getUTCFullYear() + '/' + (b.getUTCMonth() + 1) + '/' + b.getUTCDate();
  }

  function addDays(iso, n) {
    var d = parseISODate(iso);
    if (!d) return '';
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /* Pull a clock time out of a free-text stop time. Trip files write
     things like "09:55", "~13:00", "~9:15" or "硬 timing" — the first two
     shapes give a time, the last simply has none. Returns minutes past
     midnight, or null. */
  function stopMinutes(timeText) {
    var m = /(\d{1,2})\s*[:：]\s*(\d{2})/.exec(String(timeText || ''));
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  function nowMinutes() {
    var d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  /* Where you are in a day: the stop you are at (last one whose time has
     passed) and the one coming up. Stops without a time are skipped for
     this calculation but still render normally.

     Uses the device clock deliberately — a phone abroad picks up local
     time, which is the time the itinerary is written in. */
  function dayProgress(day, minutesOverride) {
    var now = minutesOverride == null ? nowMinutes() : minutesOverride;
    var timed = [];
    (day.stops || []).forEach(function (s, i) {
      var mins = stopMinutes(s.time);
      if (mins != null) timed.push({ i: i, mins: mins, stop: s });
    });
    if (!timed.length) return { current: null, next: null, timed: timed };

    var current = null, next = null;
    for (var k = 0; k < timed.length; k++) {
      if (timed[k].mins <= now) current = timed[k];
      else { next = timed[k]; break; }
    }
    return { current: current, next: next, timed: timed };
  }

  /* The day of the trip that is happening today, or null. */
  function todaysDay(trip) {
    var t = todayISO();
    var found = (trip.days || []).filter(function (d) { return d.date === t; });
    return found.length ? found[0] : null;
  }

  /* "3 個鐘 20 分" / "45 分鐘" — gap until the next stop. */
  function untilText(minutes) {
    if (minutes == null || minutes < 0) return '';
    if (minutes < 1) return '就快到';
    if (minutes < 60) return minutes + ' 分鐘';
    var h = Math.floor(minutes / 60), m = minutes % 60;
    return h + ' 個鐘' + (m ? ' ' + m + ' 分' : '');
  }

  /* upcoming | live | past — drives the badge on the library card. */
  function tripPhase(trip) {
    var t = todayISO();
    if (trip.startDate && t < trip.startDate) return 'upcoming';
    if (trip.endDate && t > trip.endDate) return 'past';
    if (trip.startDate || trip.endDate) return 'live';
    return 'upcoming';
  }

  /* A timestamp as a person would say it: today becomes a clock time,
     anything older carries its date. Used where the app has to say when
     something was taken, such as the restore point. */
  function shortDateTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var hh = ('0' + d.getHours()).slice(-2), mm = ('0' + d.getMinutes()).slice(-2);
    var now = new Date();
    var sameDay = d.getFullYear() === now.getFullYear() &&
                  d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (sameDay) return '今日 ' + hh + ':' + mm;
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hh + ':' + mm;
  }

  /* --- distance -------------------------------------------------
     Straight-line, from coordinates the trip already carries. No API, no
     key, works offline. Real walking is longer than the crow flies, so
     the time estimate pads for that rather than pretending to route. */

  function metresBetween(a, b) {
    if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
    var R = 6371000;
    var toRad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toRad;
    var dLng = (b.lng - a.lng) * toRad;
    var la1 = a.lat * toRad, la2 = b.lat * toRad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
  }

  /* ~4.5 km/h, times 1.3 because streets are not straight lines, plus a
     minute of getting out of one door and into the next. */
  function walkMinutes(metres) {
    if (metres == null) return null;
    return Math.max(1, Math.round((metres * 1.3) / 75) + 1);
  }

  /* How you would actually cover a gap. Estimating a walk at every
     distance produced nonsense — "行路要 ~800 分鐘" between two cities
     110 km apart, and a 35-minute march out of an airport with luggage.
     Walking is only the headline when walking is plausible; past that the
     app reports the distance and says to take something, rather than
     quoting a pace nobody is going to walk. */

  var TRANSIT_WORDS = new RegExp([
    '機場', '空港', 'airport', 'aeropuerto', 'aeroporto', 'a[ée]roport', 'flughafen',
    '車站', '火車站', '總站', '高鐵', 'station', 'gare', 'bahnhof', 'hbf',
    'terminal', '碼頭', '港口', 'ferry', 'cruise'
  ].join('|'), 'i');

  /* An airport or a terminus is a transport leg even when it is close:
     you arrive with luggage, and the walk out of the building is not the
     walk the straight line measured. */
  function looksTransit(s) {
    if (!s) return false;
    return TRANSIT_WORDS.test([s.title, s.mapQuery, s.mapLabel].join(' '));
  }

  /* Fastest the leg could plausibly go, door to door. Used to spot a gap
     that is not merely tight but impossible — never to promise a journey
     time. Crossing a city and crossing a region are different problems:
     nothing covers 7 km of streets at motorway speed, and no tram covers
     100 km at all, so each gets its own ceiling.
       intercity — 80 km/h, plus a quarter hour at the terminals
       in town   — 24 km/h door to door, which already assumes a taxi
                   rather than waiting for the next bus */
  function minTravelMinutes(metres, intercity) {
    if (metres == null) return null;
    return intercity ? Math.round(metres / 1333) + 15
                     : Math.round(metres / 400) + 6;
  }

  function minutesText(mins) {
    if (mins == null) return '';
    if (mins < 90) return mins + ' 分鐘';
    var h = Math.floor(mins / 60), m = mins % 60;
    return h + ' 個鐘' + (m ? ' ' + m + ' 分' : '');
  }

  /* mode: 'walk'      — just walk it
            'either'   — walkable, but most people would ride
            'ride'     — across town, take something
            'intercity'— another town entirely */
  function legInfo(a, b) {
    var metres = metresBetween(a, b);
    if (metres == null) return null;
    var hub = looksTransit(a) || looksTransit(b);
    var mode;
    if (metres > 30000) mode = 'intercity';
    else if (metres > 2500 || (hub && metres > 1200)) mode = 'ride';
    else if (metres > 1500 || (hub && metres > 600)) mode = 'either';
    else mode = 'walk';
    return {
      metres: metres, mode: mode, hub: hub,
      walkable: mode === 'walk' || mode === 'either',
      walk: walkMinutes(metres),
      floor: minTravelMinutes(metres, mode === 'intercity')
    };
  }

  function distanceText(metres) {
    if (metres == null) return '';
    if (metres < 1000) return Math.round(metres / 10) * 10 + ' m';
    return (metres / 1000).toFixed(metres < 10000 ? 1 : 0) + ' km';
  }

  /* --- object paths (used by the editor's data binding) -------- */

  function getPath(obj, path) {
    var parts = String(path).split('.'), cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function setPath(obj, path, value) {
    var parts = String(path).split('.'), cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i];
      if (cur[k] == null || typeof cur[k] !== 'object') {
        cur[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      }
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function move(arr, from, to) {
    if (to < 0 || to >= arr.length) return false;
    arr.splice(to, 0, arr.splice(from, 1)[0]);
    return true;
  }

  /* --- misc --------------------------------------------------- */

  var toastTimer = null;
  function toast(msg, bad) {
    var t = el('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast' + (bad ? ' bad' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, bad ? 4200 : 2200);
  }

  function download(filename, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  global.U = {
    esc: esc, rich: rich, plain: plain, el: el, uid: uid, slug: slug, mapsUrl: mapsUrl,
    parseISODate: parseISODate, weekdayZH: weekdayZH, shortDate: shortDate,
    dateRangeZH: dateRangeZH, addDays: addDays, todayISO: todayISO, tripPhase: tripPhase,
    shortDateTime: shortDateTime,
    getPath: getPath, setPath: setPath, clone: clone, move: move,
    stopMinutes: stopMinutes, nowMinutes: nowMinutes, dayProgress: dayProgress,
    metresBetween: metresBetween, walkMinutes: walkMinutes, distanceText: distanceText,
    legInfo: legInfo, looksTransit: looksTransit,
    minTravelMinutes: minTravelMinutes, minutesText: minutesText,
    todaysDay: todaysDay, untilText: untilText,
    toast: toast, download: download
  };
})(window);
