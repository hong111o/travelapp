/* 行程本 · router + library
 *
 * Routes live in the hash so the phone's back button works:
 *   #/                     library
 *   #/trip/<id>            itinerary home
 *   #/trip/<id>/<sub>      one day, or "food"
 *   #/edit/<id>            editor
 *   #/new                  editor on a blank trip
 */
(function (global) {
  'use strict';

  var current = null;   // trip currently rendered in #view-trip
  var todayTimer = null;

  /* Keep "now & next" honest while the app sits open. Once a minute is
     plenty — stop times have minute resolution. */
  function startTodayTicker(trip) {
    stopTodayTicker();
    if (!U.todaysDay(trip)) return;
    todayTimer = setInterval(function () {
      if (!current || current.id !== trip.id) { stopTodayTicker(); return; }
      Render.refreshToday(trip);
    }, 60000);
  }

  function stopTodayTicker() {
    if (todayTimer) { clearInterval(todayTimer); todayTimer = null; }
  }

  /* --- view switching ------------------------------------------- */

  function showView(name) {
    ['library', 'trip', 'editor'].forEach(function (v) {
      var node = U.el('view-' + v);
      if (node) node.classList.toggle('active', v === name);
    });
  }

  function showSub(subId) {
    var subs = document.querySelectorAll('#view-trip .subview');
    var matched = false;
    for (var i = 0; i < subs.length; i++) {
      var on = subs[i].getAttribute('data-sub') === subId;
      subs[i].classList.toggle('active', on);
      subs[i].style.display = on ? 'block' : 'none';
      if (on) matched = true;
    }
    if (!matched && subs.length) {
      subs[0].style.display = 'block';
      return subs[0].getAttribute('data-sub');
    }
    return subId;
  }

  function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  /* --- library --------------------------------------------------- */

  var PHASE = {
    upcoming: { cls: '', label: '未出發' },
    live: { cls: 'live', label: '進行中' },
    past: { cls: 'past', label: '已完成' }
  };

  function renderLibrary() {
    var trips = Store.all();
    var list = U.el('lib-list'), empty = U.el('lib-empty');

    empty.hidden = trips.length > 0;
    list.innerHTML = trips.map(function (t) {
      var phase = PHASE[U.tripPhase(t)] || PHASE.upcoming;
      var dates = U.dateRangeZH(t.startDate, t.endDate);
      var nStops = t.days.reduce(function (n, d) { return n + d.stops.length; }, 0);
      return '<div class="tripitem">' +
        '<button class="dcard" data-act="open" data-id="' + U.esc(t.id) + '">' +
          '<div class="num"><b>' + t.days.length + '</b><small>days</small></div>' +
          '<div class="txt">' +
            '<div class="d">' + U.esc(dates || '未定日期') +
              '<span class="pillstate ' + phase.cls + '">' + phase.label + '</span></div>' +
            '<div class="t">' + U.esc(t.title || '未命名行程') + '</div>' +
            '<div class="s">' + U.esc(t.place.name || t.subtitle || '') +
              (nStops ? (t.place.name || t.subtitle ? ' · ' : '') + nStops + ' 個行程點' : '') + '</div>' +
          '</div><div class="arrow">›</div></button>' +
        '<div class="rowacts">' +
          '<button class="btn btn-sm" data-act="edit" data-id="' + U.esc(t.id) + '">✏️ 編輯</button>' +
          '<button class="btn btn-sm" data-act="dup" data-id="' + U.esc(t.id) + '">⧉ 複製</button>' +
          '<button class="btn btn-sm" data-act="export" data-id="' + U.esc(t.id) + '">⬇️ 匯出</button>' +
          '<button class="btn btn-sm btn-danger" data-act="del" data-id="' + U.esc(t.id) + '">🗑 刪除</button>' +
        '</div></div>';
    }).join('');
  }

  /* --- trip ------------------------------------------------------ */

  function openTrip(id, subId) {
    var trip = Store.get(id);
    if (!trip) {
      U.toast('搵唔到呢個行程', true);
      go('#/');
      return;
    }

    /* Re-render only when switching trips or after an edit, so moving
       between days keeps the maps that are already built. */
    if (!current || current.id !== trip.id || current.updatedAt !== trip.updatedAt) {
      Widgets.stopAll();
      Widgets.resetMaps();
      current = trip;
      Render.trip(trip, U.el('view-trip'));
      showView('trip');
      Widgets.loadWeather(trip.place);
      Widgets.loadFX(trip.currency);
      Widgets.startCountdown(trip.departure);
      startTodayTicker(trip);
    } else {
      showView('trip');
      Render.setActiveTrip(trip);
    }

    var actual = showSub(subId || 'home');
    window.scrollTo(0, 0);

    Render.applyDayProgress(trip);
    if (actual === 'check') applyFilter();

    var day = trip.days.filter(function (d) { return d.id === actual; })[0];
    if (day) {
      Widgets.ensureMap(day);
      /* Opening today's page should put you at the stop you are on, not at
         breakfast. Only ever scrolls within today. */
      if (U.todaysDay(trip) && U.todaysDay(trip).id === day.id) {
        setTimeout(function () {
          var mark = document.querySelector('.subview[data-sub="' + day.id + '"] .stop.is-now')
            || document.querySelector('.subview[data-sub="' + day.id + '"] .stop.is-next');
          if (mark) mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 80);
      }
    }
  }

  function showLibrary() { go('#/'); }

  /* --- routing --------------------------------------------------- */

  function route() {
    var hash = location.hash.replace(/^#\/?/, '');
    var parts = hash.split('/').filter(Boolean);

    if (parts[0] === 'trip' && parts[1]) {
      openTrip(decodeURIComponent(parts[1]), parts[2] ? decodeURIComponent(parts[2]) : 'home');
      return;
    }

    if (parts[0] === 'edit' && parts[1]) {
      var t = Store.get(decodeURIComponent(parts[1]));
      if (!t) { U.toast('搵唔到呢個行程', true); go('#/'); return; }
      showView('editor');
      Editor.open(t);
      return;
    }

    if (parts[0] === 'new') {
      showView('editor');
      Editor.open(Schema.blankTrip(), { isNew: true });
      return;
    }

    Widgets.stopAll();
    stopTodayTicker();
    current = null;
    renderLibrary();
    showView('library');
  }

  /* --- visited marks ----------------------------------------------- */

  /* Toggle in place. Re-rendering the trip would rebuild every map and
     throw away your scroll position, so only the affected nodes and the
     counters are touched. */
  function toggleTick(uid) {
    if (!current || !uid) return;
    var now = !current.progress[uid];

    if (!Store.setDone(current.id, uid, now)) {
      U.toast('儲存唔到打卡記錄', true);
      return;
    }
    if (now) current.progress[uid] = new Date().toISOString();
    else delete current.progress[uid];

    /* The same place appears in the day view and in the checklist. */
    var nodes = document.querySelectorAll('#view-trip [data-uid="' + uid.replace(/"/g, '\\"') + '"]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('done', now);
      var btn = nodes[i].querySelector('.tick');
      if (btn) {
        btn.classList.toggle('on', now);
        btn.setAttribute('aria-pressed', now ? 'true' : 'false');
        btn.title = now ? '已經去咗' : '標做去咗';
      }
    }

    Render.refreshCounts(current);
    applyFilter();
  }

  /* Checklist filter: 全部 / 未去 / 去咗 */
  var ckFilter = 'all';

  function applyFilter() {
    var list = U.el('ck-list');
    if (!list) return;
    var groups = list.querySelectorAll('.ckgroup');
    for (var g = 0; g < groups.length; g++) {
      var rows = groups[g].querySelectorAll('.ckrow');
      var visible = 0;
      for (var i = 0; i < rows.length; i++) {
        var done = rows[i].classList.contains('done');
        var show = ckFilter === 'all' || (ckFilter === 'done' ? done : !done);
        rows[i].hidden = !show;
        if (show) visible++;
      }
      /* A day heading with nothing left under it is noise. */
      groups[g].hidden = visible === 0;
    }
  }

  function setFilter(name, btn) {
    ckFilter = name;
    var all = document.querySelectorAll('#view-trip .ckf');
    for (var i = 0; i < all.length; i++) all[i].classList.toggle('on', all[i] === btn);
    applyFilter();
  }

  function resetProgress() {
    if (!current) return;
    var c = Object.keys(current.progress).length;
    if (!c) { U.toast('本來就冇打卡記錄'); return; }
    if (!confirm('清空 ' + c + ' 個打卡記錄？\n\n行程本身唔會改，只係當你全部未去過。')) return;
    if (!Store.clearProgress(current.id)) { U.toast('清唔到', true); return; }
    current.progress = {};
    var marked = document.querySelectorAll('#view-trip .done');
    for (var i = 0; i < marked.length; i++) marked[i].classList.remove('done');
    var ticks = document.querySelectorAll('#view-trip .tick.on');
    for (var j = 0; j < ticks.length; j++) {
      ticks[j].classList.remove('on');
      ticks[j].setAttribute('aria-pressed', 'false');
    }
    Render.refreshCounts(current);
    applyFilter();
    U.toast('清空咗');
  }

  /* --- offline maps ----------------------------------------------- */

  function downloadMaps(btn) {
    if (!current) return;
    var bar = U.el('dl-bar'), pct = U.el('dl-pct');
    var total = Offline.tileCount(current);
    if (!total) { U.toast('呢個行程冇地圖座標', true); return; }

    btn.disabled = true;
    btn.textContent = '下載緊…';
    if (pct) pct.textContent = '0 / ' + total;

    Offline.downloadMaps(current, function (done, t) {
      if (bar) bar.style.width = Math.round(done / t * 100) + '%';
      if (pct) pct.textContent = done + ' / ' + t;
    }).then(function (res) {
      btn.disabled = false;
      btn.textContent = '再下載一次';
      if (bar) bar.style.width = '100%';
      if (res.failed) {
        if (pct) pct.textContent = res.total - res.failed + ' / ' + res.total;
        U.toast('下載咗大部分，' + res.failed + ' 塊失敗（可以再撳一次）', true);
      } else {
        if (pct) pct.textContent = '完成 ✓';
        U.toast('離線地圖下載好喇 ✓');
      }
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = '下載呢個行程嘅地圖';
      if (bar) bar.style.width = '0';
      if (pct) pct.textContent = '';
      U.toast(err.message || '下載失敗', true);
    });
  }

  /* --- actions --------------------------------------------------- */

  function onClick(e) {
    var filterBtn = e.target.closest ? e.target.closest('.ckf[data-filter]') : null;
    if (filterBtn) {
      e.preventDefault();
      setFilter(filterBtn.getAttribute('data-filter'), filterBtn);
      return;
    }

    var btn = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!btn) return;
    if (U.el('view-editor').contains(btn)) return;  /* editor owns its own clicks */

    var act = btn.getAttribute('data-act');
    var id = btn.getAttribute('data-id');

    if (act === 'open') { go('#/trip/' + encodeURIComponent(id)); }
    else if (act === 'edit') { go('#/edit/' + encodeURIComponent(id || (current && current.id))); }
    else if (act === 'library') { go('#/'); }
    else if (act === 'home') { go('#/trip/' + encodeURIComponent(current.id)); }
    else if (act === 'day') { go('#/trip/' + encodeURIComponent(current.id) + '/' + encodeURIComponent(btn.getAttribute('data-day'))); }
    else if (act === 'food') { go('#/trip/' + encodeURIComponent(current.id) + '/food'); }
    else if (act === 'check') { go('#/trip/' + encodeURIComponent(current.id) + '/check'); }
    else if (act === 'tick') { e.preventDefault(); toggleTick(btn.getAttribute('data-uid')); }
    else if (act === 'ckreset') { e.preventDefault(); resetProgress(); }
    else if (act === 'export') {
      var t = Store.get(id);
      if (t) Store.exportTrip(t);
    }
    else if (act === 'dlmaps') {
      downloadMaps(btn);
    }
    else if (act === 'dup') {
      var copy = Store.duplicate(id);
      if (copy) { renderLibrary(); U.toast('複製咗'); }
    }
    else if (act === 'del') {
      var target = Store.get(id);
      if (!target) return;
      if (!confirm('刪除「' + (target.title || '未命名行程') + '」？\n\n呢個動作冇得還原。想留底就先撳「⬇️ 匯出」。')) return;
      Store.remove(id);
      renderLibrary();
      U.toast('刪除咗');
    }
  }

  /* --- import ---------------------------------------------------- */

  function readFiles(files) {
    var pending = files.length, saved = 0, failed = 0;
    if (!pending) return;

    Array.prototype.forEach.call(files, function (file) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          saved += Store.importText(String(reader.result)).length;
        } catch (err) {
          failed++;
          console.warn('[import]', file.name, err);
        }
        if (--pending === 0) finish();
      };
      reader.onerror = function () { failed++; if (--pending === 0) finish(); };
      reader.readAsText(file);
    });

    function finish() {
      renderLibrary();
      if (saved) U.toast('匯入咗 ' + saved + ' 個行程 ✓');
      if (failed) U.toast(failed + ' 個檔案讀唔到（要係 export 出嚟嘅 .json）', true);
    }
  }

  /* --- boot ------------------------------------------------------ */

  function init() {
    Store.seedIfFirstRun();
    Store.migrateUids();
    Offline.init();

    document.addEventListener('click', onClick);
    window.addEventListener('hashchange', route);

    U.el('btn-new').addEventListener('click', function () { go('#/new'); });

    var fileInput = U.el('file-import');
    U.el('btn-import').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      readFiles(fileInput.files);
      fileInput.value = '';
    });

    U.el('btn-restore-samples').addEventListener('click', function () {
      var n = Store.restoreSamples();
      if (n) { renderLibrary(); U.toast('載入咗 ' + n + ' 個示範行程'); }
    });

    route();
  }

  global.App = { openTrip: openTrip, showLibrary: showLibrary, renderLibrary: renderLibrary };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
