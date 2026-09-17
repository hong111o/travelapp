/* 行程本 · shared helpers */
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

  /* upcoming | live | past — drives the badge on the library card. */
  function tripPhase(trip) {
    var t = todayISO();
    if (trip.startDate && t < trip.startDate) return 'upcoming';
    if (trip.endDate && t > trip.endDate) return 'past';
    if (trip.startDate || trip.endDate) return 'live';
    return 'upcoming';
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
    getPath: getPath, setPath: setPath, clone: clone, move: move,
    toast: toast, download: download
  };
})(window);
