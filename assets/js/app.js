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
  var pendingFlash = null;   /* uid to highlight once the view has rendered */

  /* Scroll to a place and flash it. Called from openTrip rather than on a
     timer, because the row only exists after the view has been built and
     guessing a delay raced the render. */
  function applyPendingFlash() {
    if (!pendingFlash) return;
    var uid = pendingFlash;
    pendingFlash = null;
    var node = document.querySelector('#view-trip .subview.active [data-uid="' + uid + '"]')
      || document.querySelector('#view-trip [data-uid="' + uid + '"]');
    if (!node) return;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    node.classList.add('flash');
    setTimeout(function () { node.classList.remove('flash'); }, 1600);
  }

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
      searchRows = null;   /* index is per-trip and per-edit */
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
    applyPendingFlash();
    if (actual === 'check') applyFilter();
    if (actual === 'search') {
      var q = U.el('sch-q');
      if (q && !q.dataset.bound) {
        q.dataset.bound = '1';
        q.addEventListener('input', runSearch);
      }
      if (q) setTimeout(function () { q.focus(); }, 60);
      runSearch();
    }
    paintPhotos();

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
    Photos.releaseUrls();
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

  /* --- unplanned finds ------------------------------------------------ */

  var findCoords = null;   /* set only when GPS actually answered */

  function openFindSheet(dayId) {
    if (!current) return;
    if (!dayId) {
      var today = U.todaysDay(current);
      dayId = today ? today.id : (current.days[0] && current.days[0].id);
    }
    if (!dayId) { U.toast('呢個行程仲未有日子', true); return; }

    findCoords = null;
    var wrap = document.createElement('div');
    wrap.innerHTML = Render.findSheetHTML(current, dayId);
    var sheet = wrap.firstChild;
    document.body.appendChild(sheet);
    setTimeout(function () {
      var n = U.el('find-name');
      if (n) n.focus();
    }, 80);

    sheet.addEventListener('click', function (e) {
      var kind = e.target.closest ? e.target.closest('[data-kind]') : null;
      if (kind) {
        var all = sheet.querySelectorAll('.kindb');
        for (var i = 0; i < all.length; i++) all[i].classList.toggle('on', all[i] === kind);
        return;
      }
      var close = e.target.closest ? e.target.closest('[data-find="close"]') : null;
      if (close || e.target === sheet) closeFindSheet();
    });

    U.el('find-gps').addEventListener('click', locateForFind);
    U.el('find-link').addEventListener('click', linkForFind);
    U.el('find-save').addEventListener('click', saveFind);
  }

  function closeFindSheet() {
    var sheet = U.el('find-sheet');
    if (sheet) sheet.remove();
    findCoords = null;
  }

  function locateForFind() {
    var note = U.el('find-gps-note'), btn = U.el('find-gps');
    if (!navigator.geolocation) { note.textContent = '呢個瀏覽器唔支援定位。'; return; }

    btn.disabled = true;
    note.textContent = '搵緊你喺邊…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      findCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      btn.disabled = false;
      btn.textContent = '📍 已經攞到位置 ✓';
      note.textContent = '準確度約 ' + Math.round(pos.coords.accuracy) + ' 米。再撳一次可以重新攞。';
    }, function (err) {
      btn.disabled = false;
      /* GPS works with no data connection, but permission can be refused
         and indoors it can simply time out. Neither should block saving. */
      note.textContent = err.code === err.PERMISSION_DENIED
        ? '冇咗定位權限 —— 照記低都得，淨係唔會出現喺地圖。'
        : '攞唔到位置（室內成日咁）—— 照記低都得。';
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  function linkForFind() {
    var text = prompt('貼 Google Maps 連結（或者一對經緯度）：', '');
    if (text === null) return;

    var got;
    try { got = MapLink.parse(text); }
    catch (ex) { U.el('find-gps-note').textContent = ex.message; return; }

    findCoords = { lat: got.lat, lng: got.lng };
    U.el('find-link').textContent = '📋 連結已讀 ✓';
    U.el('find-gps-note').textContent = '攞到座標喇。';
    var name = U.el('find-name');
    if (got.name && name && !name.value.trim()) name.value = got.name;
  }

  function saveFind() {
    var name = (U.el('find-name').value || '').trim();
    if (!name) { U.toast('填個名先', true); U.el('find-name').focus(); return; }

    var kindBtn = document.querySelector('#find-sheet .kindb.on');
    var icon = kindBtn ? kindBtn.getAttribute('data-kind') : '';
    var dayId = U.el('find-day').value;
    var city = (current.place && current.place.name) || '';

    var stop = {
      time: (U.el('find-time').value || '').trim(),
      title: (icon ? icon + ' ' : '') + name,
      desc: (U.el('find-note').value || '').trim(),
      /* Navigation should work even with no coordinates, so always give
         Maps something to search for. */
      mapQuery: city ? name + ' ' + city : name,
      mapLabel: name,
      lat: findCoords ? findCoords.lat : null,
      lng: findCoords ? findCoords.lng : null
    };

    var tripId = current.id;
    var saved = Store.addFind(tripId, dayId, stop);
    if (!saved) { U.toast('記唔到', true); return; }

    closeFindSheet();
    U.toast('記低咗 ✓');

    /* A new stop changes the plan, so the trip has to be re-rendered.
       Clearing `current` forces that, then we land on the day it joined. */
    current = null;
    pendingFlash = saved.uid;
    var target = '#/trip/' + encodeURIComponent(tripId) + '/' + encodeURIComponent(dayId);
    if (location.hash === target) route();
    else location.hash = target;
  }

  /* --- share and print ------------------------------------------------ */

  function shareTrip(btn) {
    if (!current) return;
    btn.disabled = true;
    var was = btn.textContent;
    btn.textContent = '整緊…';
    Share.download(current).then(function (res) {
      btn.disabled = false;
      btn.textContent = was;
      U.toast('整好咗 ' + res.name + '（' + Math.round(res.bytes / 1024) + ' KB）');
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = was;
      console.warn('[share]', err);
      U.toast('整唔到個檔案：' + err.message, true);
    });
  }

  /* Printing wants the whole trip at once, not whichever page you happen
     to be on, so every day is unfolded for the duration of the dialog. */
  function printTrip() {
    document.body.classList.add('printing');
    var subs = document.querySelectorAll('#view-trip .subview');
    var restore = [];
    for (var i = 0; i < subs.length; i++) {
      restore.push([subs[i], subs[i].style.display]);
      var sub = subs[i].getAttribute('data-sub');
      /* Days and food are the trip; the tools are not worth paper. */
      var wanted = sub === 'home' || sub === 'food' || /^d/.test(sub);
      subs[i].style.display = wanted ? 'block' : 'none';
    }

    function undo() {
      document.body.classList.remove('printing');
      restore.forEach(function (pair) { pair[0].style.display = pair[1]; });
      window.removeEventListener('afterprint', undo);
    }
    window.addEventListener('afterprint', undo);
    /* Safari on iOS never fires afterprint, so fall back to a timer. */
    setTimeout(undo, 60000);

    setTimeout(function () { window.print(); }, 60);
  }

  /* --- search --------------------------------------------------------- */

  var searchRows = null;

  function runSearch() {
    var input = U.el('sch-q'), out = U.el('sch-results'), hint = U.el('sch-hint');
    if (!input || !out || !current) return;

    var q = input.value.trim().toLowerCase();
    if (!q) {
      out.innerHTML = '';
      if (hint) hint.textContent = '打幾個字就會即刻搵。';
      return;
    }

    if (!searchRows) searchRows = Render.searchIndex(current);
    /* Every word must appear somewhere in the entry, in any order, so
       "market lunch" finds a lunch stop at a market. */
    var words = q.split(/\s+/).filter(Boolean);
    var hits = searchRows.filter(function (row) {
      return words.every(function (w) { return row.hay.indexOf(w) !== -1; });
    });

    if (hint) {
      hint.textContent = hits.length
        ? '搵到 ' + hits.length + ' 個'
        : '搵唔到「' + input.value.trim() + '」';
    }
    out.innerHTML = hits.map(Render.searchResultHTML).join('');
  }

  /* Jump from a result to the place itself and flash it, so you can see
     which row you landed on. */
  function gotoPlace(sub, uid) {
    if (!current) return;
    pendingFlash = uid || null;
    go('#/trip/' + encodeURIComponent(current.id) + '/' + encodeURIComponent(sub));
  }

  /* --- journal: notes + photos --------------------------------------- */

  function editNote(uid) {
    if (!current) return;
    var existing = (current.journal[uid] || {}).note || '';
    var next = prompt('喺呢度寫低當日嘅筆記：', existing);
    if (next === null) return;                 /* cancelled */
    if (!Store.setNote(current.id, uid, next)) {
      U.toast('儲存唔到筆記', true);
      return;
    }
    var clean = String(next).trim();
    if (clean) current.journal[uid] = { note: clean, at: new Date().toISOString() };
    else delete current.journal[uid];
    Render.refreshJournal(current, uid);
    searchRows = null;
    paintPhotos(uid);
    U.toast(clean ? '記低咗' : '刪咗筆記');
  }

  /* One hidden file input, retargeted at whichever place is being added to. */
  var photoInput = null;
  var photoTarget = null;

  function ensurePhotoInput() {
    if (photoInput) return photoInput;
    photoInput = document.createElement('input');
    photoInput.type = 'file';
    photoInput.accept = 'image/*';
    photoInput.multiple = true;
    photoInput.hidden = true;
    photoInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(photoInput.files || []);
      var uid = photoTarget;
      photoInput.value = '';
      if (!uid || !files.length || !current) return;

      U.toast('處理緊 ' + files.length + ' 張相…');
      var tripId = current.id;
      files.reduce(function (chain, file) {
        return chain.then(function (n) {
          return Photos.add(tripId, uid, file).then(function () { return n + 1; })
            .catch(function (err) {
              console.warn('[photo]', file.name, err);
              U.toast(err.message || '加唔到呢張相', true);
              return n;
            });
        });
      }, Promise.resolve(0)).then(function (n) {
        if (n) U.toast('加咗 ' + n + ' 張相 ✓');
        paintPhotos(uid);
      });
    });
    document.body.appendChild(photoInput);
    return photoInput;
  }

  function addPhoto(uid) {
    if (!Photos.supported()) { U.toast('呢個瀏覽器唔支援相片儲存', true); return; }
    photoTarget = uid;
    ensurePhotoInput().click();
  }

  /* Fill in the thumbnails for one place, or for every place on screen. */
  function paintPhotos(uid) {
    if (!current) return;
    var slots = uid
      ? document.querySelectorAll('#view-trip [data-photos="' + uid + '"]')
      : document.querySelectorAll('#view-trip [data-photos]');
    if (!slots.length || !Photos.supported()) return;

    var seen = {};
    Array.prototype.forEach.call(slots, function (slot) {
      var id = slot.getAttribute('data-photos');
      if (seen[id]) return;
      seen[id] = true;

      Photos.listFor(current.id, id).then(function (recs) {
        var html = recs.map(function (r) {
          return '<button class="jr-th" data-act="viewphoto" data-photo="' + r.id + '">' +
            '<img src="' + Photos.urlFor(r.blob) + '" alt="" loading="lazy"></button>';
        }).join('');
        var all = document.querySelectorAll('#view-trip [data-photos="' + id + '"]');
        for (var i = 0; i < all.length; i++) all[i].innerHTML = html;
      }).catch(function (err) { console.warn('[photos]', err); });
    });
  }

  /* --- lightbox ------------------------------------------------------- */

  function openPhoto(photoId) {
    if (!current) return;
    var box = document.createElement('div');
    box.className = 'lightbox';
    box.innerHTML = '<div class="lb-bar">' +
        '<button class="lb-b" data-lb="close">✕ 閂</button>' +
        '<button class="lb-b del" data-lb="del">🗑 刪除</button>' +
      '</div><div class="lb-img"></div>';
    document.body.appendChild(box);

    /* Reuse the thumbnail's object URL — it is the same blob, already
       decoded, so the full view opens instantly. */
    var thumb = document.querySelector('[data-photo="' + photoId + '"] img');
    var uid = findUidForPhoto(photoId);
    var img = document.createElement('img');
    img.src = thumb ? thumb.src : '';
    box.querySelector('.lb-img').appendChild(img);

    function close() { box.remove(); }

    box.addEventListener('click', function (e) {
      var act = e.target.closest ? e.target.closest('[data-lb]') : null;
      if (!act) { if (e.target === box || e.target.className === 'lb-img') close(); return; }
      if (act.getAttribute('data-lb') === 'close') { close(); return; }
      if (act.getAttribute('data-lb') === 'del') {
        if (!confirm('刪除呢張相？')) return;
        Photos.remove(Number(photoId)).then(function () {
          close();
          paintPhotos(uid || undefined);
          U.toast('刪咗');
        }).catch(function () { U.toast('刪唔到', true); });
      }
    });
  }

  function findUidForPhoto(photoId) {
    var node = document.querySelector('[data-photo="' + photoId + '"]');
    var slot = node && node.closest('[data-photos]');
    return slot ? slot.getAttribute('data-photos') : '';
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
    else if (act === 'search') { go('#/trip/' + encodeURIComponent(current.id) + '/search'); }
    else if (act === 'addfind') { e.preventDefault(); openFindSheet(btn.getAttribute('data-day')); }
    else if (act === 'checkup') { go('#/trip/' + encodeURIComponent(current.id) + '/checkup'); }
    else if (act === 'share') { e.preventDefault(); shareTrip(btn); }
    else if (act === 'print') { e.preventDefault(); printTrip(); }
    else if (act === 'goto') {
      e.preventDefault();
      gotoPlace(btn.getAttribute('data-sub'), btn.getAttribute('data-uid'));
    }
    else if (act === 'tick') { e.preventDefault(); toggleTick(btn.getAttribute('data-uid')); }
    else if (act === 'ckreset') { e.preventDefault(); resetProgress(); }
    else if (act === 'note') { e.preventDefault(); editNote(btn.getAttribute('data-uid')); }
    else if (act === 'photo') { e.preventDefault(); addPhoto(btn.getAttribute('data-uid')); }
    else if (act === 'viewphoto') { e.preventDefault(); openPhoto(btn.getAttribute('data-photo')); }
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
      if (!confirm('刪除「' + (target.title || '未命名行程') + '」？\n\n連相片同筆記一齊刪，冇得還原。想留底就先撳「⬇️ 匯出」。')) return;
      Store.remove(id);
      /* Photos live in IndexedDB, outside the trip record, so they would
         otherwise sit there forever taking up space. */
      if (Photos.supported()) {
        Photos.clearTrip(id).catch(function (err) { console.warn('[photos] cleanup', err); });
      }
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

  /* --- paste an AI-written trip ------------------------------------- */

  function togglePaste(show) {
    var panel = U.el('paste-panel');
    if (!panel) return;
    panel.hidden = !show;
    if (show) {
      U.el('paste-err').hidden = true;
      setTimeout(function () {
        var box = U.el('paste-box');
        if (box) box.focus();
      }, 60);
      panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  function copyPrompt() {
    var text = global.AI_PROMPT || '';
    if (!text) { U.toast('搵唔到提示內容', true); return; }

    function fallback() {
      /* clipboard API needs a secure context and permission; a hidden
         textarea + execCommand still works where it does not. */
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      U.toast(ok ? 'copy 咗，貼落 AI 度啦 ✓' : 'copy 唔到，試下手動揀', !ok);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { U.toast('copy 咗，貼落 AI 度啦 ✓'); })
        .catch(fallback);
    } else {
      fallback();
    }
  }

  function downloadTemplate() {
    var text = global.TRIP_TEMPLATE;
    if (!text) { U.toast('搵唔到範本檔案', true); return; }
    U.download('trip-template.json', text);
    U.toast('下載咗 — send 俾 AI 叫佢填返');
  }

  function importPasted() {
    var box = U.el('paste-box'), err = U.el('paste-err');
    if (!box) return;
    err.hidden = true;
    try {
      var saved = Store.importText(box.value);
      box.value = '';
      togglePaste(false);
      renderLibrary();
      U.toast('匯入咗 ' + saved.length + ' 個行程 ✓');
      /* Straight into the new trip — the point was to see it. */
      if (saved.length === 1) go('#/trip/' + encodeURIComponent(saved[0].id));
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message + '\n\n貼成段嘢落嚟都得，前言同 ``` 會自動略過。';
    }
  }

  /* --- boot ------------------------------------------------------ */

  function init() {
    Store.seedIfFirstRun();
    Store.migrateUids();
    DragSort.init();
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

    U.el('btn-paste').addEventListener('click', function () {
      togglePaste(U.el('paste-panel').hidden);
    });
    U.el('btn-copy-prompt').addEventListener('click', copyPrompt);
    U.el('btn-template').addEventListener('click', downloadTemplate);
    U.el('btn-paste-go').addEventListener('click', importPasted);
    U.el('btn-paste-cancel').addEventListener('click', function () { togglePaste(false); });

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
