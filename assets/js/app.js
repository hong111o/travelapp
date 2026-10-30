/* Travel Marvel · router + library
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
    ['library', 'trip', 'editor', 'passport'].forEach(function (v) {
      var node = U.el('view-' + v);
      if (node) node.classList.toggle('active', v === name);
    });
    /* The general bar lives outside the views (it is fixed to the
       window), so it follows the view by hand: on the trips page and on
       the passport, which are the two top-level pages. */
    var top = name === 'library' || name === 'passport';
    var bar = document.querySelector('.libbar');
    if (bar) {
      bar.hidden = !top;
      Array.prototype.forEach.call(bar.querySelectorAll('[data-lib="trips"],[data-lib="passport"]'), function (b) {
        var on = (b.getAttribute('data-lib') === 'trips') === (name === 'library');
        b.classList.toggle('on', on);
        b.setAttribute('aria-current', on ? 'page' : 'false');
      });
    }
    document.body.classList.toggle('on-library', top);
    /* Arrange mode belongs to the trip screen; never leave it switched on. */
    if (name !== 'trip' && Render.isArranging()) {
      Render.setArranging(false);
      document.body.classList.remove('arranging-now');
      current = null;
    }
  }

  /* Where you were on each screen of the current trip. The app used to
     end every navigation with scrollTo(0, 0), so coming back from a day
     threw away your place in a long home list. Keyed by subview and
     cleared when the trip changes. */
  /* Releases for whichever dialogs are open, so closing one undoes
     exactly what opening it did. Declared up here because the first
     sheet to use it is defined above the ones that follow. */
  var releaseTrap = {};

  var scrollMemory = {};
  var lastSub = null;

  function rememberScroll() {
    if (lastSub) scrollMemory[lastSub] = window.pageYOffset || 0;
  }

  /* Instantly, because the page sets scroll-behavior:smooth and nobody
     wants to watch the list slide past on every back press.

     Swapping which subview is displayed does not flush layout, so a
     scroll issued straight afterwards is clamped against the height of
     the screen we just left — going back to a long home screen from a
     short day landed at 163px instead of 900. Reading offsetHeight
     forces the reflow; the extra pass on the next frame covers a map or
     an image that only settles after it. */
  function setScroll(y) {
    try { window.scrollTo({ top: y, left: 0, behavior: 'instant' }); }
    catch (e) { window.scrollTo(0, y); }
  }

  function restoreScroll(at) {
    setScroll(at);
    if (!at) return;
    /* Swapping which subview is shown does not flush layout, so a scroll
       issued in the same task can be clamped against the height of the
       screen we just left. One pass on the next frame, once the new one
       has been laid out, is enough. */
    requestAnimationFrame(function () {
      if (Math.abs((window.pageYOffset || 0) - at) > 2) setScroll(at);
    });
  }

  function showSub(subId) {
    rememberScroll();
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
      lastSub = subs[0].getAttribute('data-sub');
      return lastSub;
    }
    lastSub = subId;
    return subId;
  }

  /* Which tab a subview belongs under, so the bar can light the right
     one from any screen — a day screen is still "行程". */
  function tabFor(sub) {
    if (sub === 'food' || sub === 'check' || sub === 'checkup' ||
        sub === 'search' || sub === 'money') return sub;
    /* A day screen, or the bookings list reached from the home card,
       is still somewhere inside 行程. */
    return 'home';
  }

  function paintTabs(sub) {
    var bar = document.querySelector('#view-trip .tabbar');
    if (!bar) return;
    var want = tabFor(sub);
    var tabs = bar.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-tab') === want;
      tabs[i].classList.toggle('on', on);
      tabs[i].setAttribute('aria-current', on ? 'page' : 'false');
    }
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
    if (Render.isArranging() && (subId || 'home') !== 'home') {
      Render.setArranging(false);
      document.body.classList.remove('arranging-now');
      current = null;
    }
    if (!current || current.id !== trip.id || current.updatedAt !== trip.updatedAt) {
      Widgets.stopAll();
      Widgets.resetMaps();
      current = trip;
      scrollMemory = {};        /* positions belong to the trip we are leaving */
      lastSub = null;
      searchRows = null;   /* index is per-trip and per-edit */
      Render.trip(trip, U.el('view-trip'));
      showView('trip');
      Widgets.loadWeather(trip.place);
      Widgets.loadFX(trip);
      Widgets.startCountdown(trip.departure);
      paintCover(trip);
      startTodayTicker(trip);
    } else {
      showView('trip');
      Render.setActiveTrip(trip);
    }

    var actual = showSub(subId || 'home');
    paintTabs(actual);
    /* Going somewhere new starts at the top; going back to a screen you
       have already read puts you where you left it. */
    restoreScroll(scrollMemory[actual] || 0);

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
    if (actual === 'hotels') setTimeout(drawHotelMap, 30);

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

  /* --- swipe between days ------------------------------------------
     A day is the unit you move through, and on a phone the natural way
     to move is sideways. Deliberately narrow: only on a day screen,
     only a clearly horizontal drag, and never when the gesture starts
     on the map, which does its own panning. */
  function wireSwipe() {
    var view = U.el('view-trip');
    if (!view) return;
    var x0 = 0, y0 = 0, tracking = false;

    view.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { tracking = false; return; }
      var t = e.target;
      if (t.closest && (t.closest('.daymap') || t.closest('.sheet') ||
                        t.closest('input') || t.closest('textarea'))) {
        tracking = false;
        return;
      }
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      tracking = true;
    }, { passive: true });

    view.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      if (!current || !e.changedTouches.length) return;

      var dx = e.changedTouches[0].clientX - x0;
      var dy = e.changedTouches[0].clientY - y0;
      /* A real sideways swipe: far enough, and more across than down,
         so scrolling the page never counts. */
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6) return;

      var i = -1;
      for (var k = 0; k < current.days.length; k++) {
        if (current.days[k].id === lastSub) { i = k; break; }
      }
      if (i < 0) return;                       /* not on a day screen */

      var to = current.days[dx < 0 ? i + 1 : i - 1];
      if (!to) return;
      go('#/trip/' + encodeURIComponent(current.id) + '/' + encodeURIComponent(to.id));
    }, { passive: true });
  }

  function showLibrary() { go('#/'); }

  /* --- routing --------------------------------------------------- */

  /* Opening a trip that is running should put you in today, not on the
     index — during the trip the question is almost always "what now".
     Only on the first open: once you have navigated, the hash says
     where you are and this is not consulted again. */
  var landed = {};

  function landingSub(id) {
    if (landed[id]) return 'home';
    landed[id] = true;
    var trip = Store.get(id);
    if (!trip) return 'home';
    var today = U.todaysDay(trip);
    return today ? today.id : 'home';
  }

  function route() {
    var hash = location.hash.replace(/^#\/?/, '');
    var parts = hash.split('/').filter(Boolean);

    if (parts[0] === 'trip' && parts[1]) {
      var id = decodeURIComponent(parts[1]);
      openTrip(id, parts[2] ? decodeURIComponent(parts[2]) : landingSub(id));
      return;
    }

    if (parts[0] === 'edit' && parts[1]) {
      var t = Store.get(decodeURIComponent(parts[1]));
      if (!t) { U.toast('搵唔到呢個行程', true); go('#/'); return; }
      showView('editor');
      Editor.open(t);
      return;
    }

    if (parts[0] === 'passport') {
      openPassport();
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
    releaseTrap['find'] = U.trapFocus(sheet, closeFindSheet);
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

  /* --- cover photo ------------------------------------------------- */

  var coverURL = null;

  function applyCover(rec) {
    var hero = document.querySelector('#view-trip .hero-trip');
    if (!hero) return;
    var layer = hero.querySelector('.hero-cover');
    var credit = hero.querySelector('.hero-credit');
    if (coverURL) { URL.revokeObjectURL(coverURL); coverURL = null; }

    if (!rec || !rec.blob) {
      hero.classList.remove('hascover');
      if (layer) layer.style.backgroundImage = '';
      if (credit) credit.hidden = true;
      return;
    }
    coverURL = URL.createObjectURL(rec.blob);
    layer.style.backgroundImage = 'url("' + coverURL + '")';
    hero.classList.add('hascover');

    /* Wikipedia photos are someone's work under a licence that asks for
       credit; one small line in the corner, linking to the file page. */
    var c = rec.kind === 'auto' && rec.credit;
    if (credit) {
      if (c) {
        credit.textContent = '📷 ' + [c.artist || 'Wikimedia Commons', c.license].filter(Boolean).join(' · ');
        if (c.url) credit.href = c.url; else credit.removeAttribute('href');
        credit.hidden = false;
      } else {
        credit.hidden = true;
      }
    }
  }

  function paintCover(trip) {
    if (typeof Cover === 'undefined' || !Cover.supported()) return;
    var id = trip.id;
    Cover.ensure(trip).then(function (rec) {
      /* The person may have moved to another trip while it loaded. */
      if (!current || current.id !== id) return;
      applyCover(rec);
    });
  }

  function openCoverSheet() {
    if (!current) return;
    var trip = current;
    Cover.get(trip.id).then(function (rec) {
      var kind = rec ? (rec.kind === 'auto' && !rec.blob ? 'auto' : rec.kind) : 'auto';
      var wrap = document.createElement('div');
      wrap.innerHTML = Render.coverSheetHTML(kind);
      var sheet = wrap.firstChild;
      document.body.appendChild(sheet);
      releaseTrap.cover = U.trapFocus(sheet, closeCoverSheet);
      var first = sheet.querySelector('[data-cv="own"]');
      if (first) first.focus();

      var file = U.el('cover-file');
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (!f) return;
        Cover.setOwn(trip.id, f).then(function (r) {
          closeCoverSheet();
          applyCover(r);
          U.toast('換咗封面');
        }, function (err) { U.toast(err.message || '用唔到呢張相', true); });
      });

      sheet.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-cv]') : null;
        if (!b) { if (e.target === sheet) closeCoverSheet(); return; }
        var what = b.getAttribute('data-cv');
        if (what === 'close') { closeCoverSheet(); return; }
        if (what === 'own') { file.click(); return; }
        if (what === 'none') {
          Cover.setNone(trip.id).then(function () { closeCoverSheet(); applyCover(null); });
          return;
        }
        if (what === 'auto') {
          Cover.useAuto(trip.id).then(function () {
            closeCoverSheet();
            applyCover(null);
            U.toast('搵緊相…');
            paintCover(trip);
          });
        }
      });
    });
  }

  function closeCoverSheet() {
    if (releaseTrap.cover) { releaseTrap.cover(); releaseTrap.cover = null; }
    var sheet = U.el('cover-sheet');
    if (sheet) sheet.remove();
  }

  /* --- booked, and packed ----------------------------------------- */

  function openBookingSheet() {
    if (!current) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = Render.bookingSheetHTML();
    var sheet = wrap.firstChild;
    document.body.appendChild(sheet);
    releaseTrap['bk'] = U.trapFocus(sheet, closeBookingSheet);
    setTimeout(function () {
      var el = U.el('bk-title');
      if (el) el.focus();
    }, 80);

    sheet.addEventListener('click', function (e) {
      var act = e.target.closest ? e.target.closest('[data-bk]') : null;
      if (act && act.getAttribute('data-bk') === 'save') { saveBooking(); return; }
      if ((act && act.getAttribute('data-bk') === 'close') || e.target === sheet) closeBookingSheet();
    });
  }

  function closeBookingSheet() {
    if (releaseTrap['bk']) { releaseTrap['bk'](); releaseTrap['bk'] = null; }
    var sheet = U.el('bk-sheet');
    if (sheet) sheet.remove();
  }

  function saveBooking() {
    if (!current) return;
    var title = (U.el('bk-title').value || '').trim();
    var when = (U.el('bk-when').value || '').trim();
    if (!title && !when) {
      U.toast('至少寫個名或者時間', true);
      U.el('bk-title').focus();
      return;
    }
    var row = Store.addBooking(current.id, {
      title: title, when: when,
      at: (U.el('bk-at').value || '').trim(),
      ref: U.el('bk-ref').value,
      note: U.el('bk-note').value
    });
    if (!row) { U.toast('加唔到', true); return; }
    closeBookingSheet();
    /* A booking is part of the plan, so the trip moved: reopen rather
       than patch, which also rebuilds the home card's countdown. */
    openTrip(current.id, 'bookings');
    U.toast('加咗');
  }

  function deleteBooking(uid) {
    if (!current || !uid) return;
    if (!Store.removeBooking(current.id, uid)) return;
    openTrip(current.id, 'bookings');
  }

  /* A booking reference exists to be read out at a desk. */
  function copyRef(ref, btn) {
    if (!ref) return;
    var done = function () {
      U.toast('Copy 咗 ' + ref);
      if (btn) {
        btn.classList.add('copied');
        setTimeout(function () { btn.classList.remove('copied'); }, 1200);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ref).then(done, function () { U.toast('copy 唔到', true); });
      return;
    }
    /* Older WebKit, and any page not served over https. */
    try {
      var ta = document.createElement('textarea');
      ta.value = ref;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      done();
    } catch (e) { U.toast('copy 唔到', true); }
  }

  function toggleTodo(uid) {
    if (!current || !uid) return;
    var item = current.todos.filter(function (d) { return d.uid === uid; })[0];
    if (!item) return;
    if (!Store.setTodoDone(current.id, uid, !item.done)) return;
    var fresh = Store.get(current.id);
    if (!fresh) return;
    current = fresh;
    Render.setActiveTrip(fresh);
    /* Repaint the card alone; the trip did not change, only a record. */
    var card = document.querySelector('#view-trip .subview[data-sub="home"] .card.book');
    if (!card) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = Render.todosHTML(fresh);
    if (wrap.firstChild) card.replaceWith(wrap.firstChild);
  }

  function addPacking() {
    if (!current) return;
    var input = U.el('pk-new');
    if (!input) return;
    var text = (input.value || '').trim();
    if (!text) { input.focus(); return; }
    if (!Store.addPacking(current.id, text)) { U.toast('加唔到', true); return; }
    input.value = '';
    refreshPacking(true);
  }

  function togglePacked(uid) {
    if (!current || !uid) return;
    var item = current.packing.filter(function (x) { return x.uid === uid; })[0];
    if (!item) return;
    if (!Store.setPacked(current.id, uid, !item.done)) return;
    refreshPacking();
  }

  function deletePacking(uid) {
    if (!current || !uid) return;
    if (!Store.removePacking(current.id, uid)) return;
    refreshPacking();
  }

  /* Repaint just the packing card. Rebuilding the whole trip would throw
     away every map already drawn, and ticking something off is not an
     edit to the plan. */
  function refreshPacking(focusInput) {
    if (!current) return;
    var fresh = Store.get(current.id);
    if (!fresh) return;
    current = fresh;
    Render.setActiveTrip(fresh);
    var card = document.querySelector('#view-trip .subview[data-sub="check"] .packcard');
    if (!card) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = Render.checklistHTML(fresh);
    var next = wrap.querySelector('.packcard');
    if (!next) return;
    card.replaceWith(next);
    if (focusInput) {
      var input = U.el('pk-new');
      if (input) input.focus();
    }
  }

  /* --- what it cost ---------------------------------------------- */

  function openSpendSheet(dayId) {
    if (!current) return;
    if (dayId === undefined) {
      /* Pressed from a day screen, that day; from anywhere else, today
         if the trip is running, otherwise nothing preselected. */
      var sub = lastSub || '';
      var onDay = current.days.filter(function (d) { return d.id === sub; })[0];
      var today = U.todaysDay(current);
      dayId = onDay ? onDay.id : (today ? today.id : '');
    }

    var wrap = document.createElement('div');
    wrap.innerHTML = Render.spendSheetHTML(current, dayId);
    var sheet = wrap.firstChild;
    document.body.appendChild(sheet);
    releaseTrap['spend'] = U.trapFocus(sheet, closeSpendSheet);
    setTimeout(function () {
      var a = U.el('spend-amt');
      if (a) a.focus();
    }, 80);

    sheet.addEventListener('click', function (e) {
      var cat = e.target.closest ? e.target.closest('[data-cat]') : null;
      if (cat) {
        var all = sheet.querySelectorAll('.kindb');
        for (var i = 0; i < all.length; i++) all[i].classList.toggle('on', all[i] === cat);
        return;
      }
      var act = e.target.closest ? e.target.closest('[data-spend]') : null;
      if (act && act.getAttribute('data-spend') === 'save') { saveSpend(); return; }
      if ((act && act.getAttribute('data-spend') === 'close') || e.target === sheet) closeSpendSheet();
    });

    /* Enter on the amount is the whole point of "two taps". */
    var amt = U.el('spend-amt');
    if (amt) {
      amt.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); saveSpend(); }
      });
    }
  }

  function closeSpendSheet() {
    if (releaseTrap['spend']) { releaseTrap['spend'](); releaseTrap['spend'] = null; }
    var sheet = U.el('spend-sheet');
    if (sheet) sheet.remove();
  }

  function saveSpend() {
    if (!current) return;
    var raw = (U.el('spend-amt').value || '').trim().replace(/[^0-9.]/g, '');
    var amount = Number(raw);
    if (!raw || !isFinite(amount) || amount <= 0) {
      U.toast('填個金額先', true);
      U.el('spend-amt').focus();
      return;
    }
    var catBtn = document.querySelector('#spend-sheet .kindb.on');
    var row = Store.addSpend(current.id, {
      amount: amount,
      cat: catBtn ? catBtn.getAttribute('data-cat') : 'other',
      note: U.el('spend-note').value,
      dayId: U.el('spend-day').value
    });
    if (!row) { U.toast('記唔到', true); return; }
    closeSpendSheet();
    refreshMoney();
    U.toast('記低咗 ' + Render.moneyText(amount, current.currency.base));
  }

  function deleteSpend(uid) {
    if (!current || !uid) return;
    if (!Store.removeSpend(current.id, uid)) return;
    refreshMoney();
  }

  function editBudget() {
    if (!current) return;
    var cur = current.currency.base || '';
    var now = current.budget ? String(current.budget) : '';
    var next = prompt('成個行程嘅預算' + (cur ? '（' + cur + '）' : '') + '：\n留空就當冇預算。', now);
    if (next === null) return;
    if (!Store.setBudget(current.id, next.trim())) { U.toast('改唔到', true); return; }
    /* The budget is part of the plan, so the trip was re-saved; pick the
       new copy up rather than repainting a stale one. */
    current = Store.get(current.id);
    refreshMoney();
  }

  /* Repaint the money screen in place. Spend does not move updatedAt, so
     openTrip would not rebuild, and we do not want it to: rebuilding the
     trip would throw away every map that is already drawn. */
  function refreshMoney() {
    if (!current) return;
    var fresh = Store.get(current.id);
    if (!fresh) return;
    current = fresh;
    Render.setActiveTrip(fresh);
    var view = document.querySelector('#view-trip .subview[data-sub="money"]');
    if (!view) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = Render.moneyHTML(fresh);
    var next = wrap.firstChild;
    if (!next) return;
    var wasActive = view.classList.contains('active');
    next.classList.toggle('active', wasActive);
    next.style.display = wasActive ? 'block' : 'none';
    view.replaceWith(next);
  }

  function closeFindSheet() {
    if (releaseTrap['find']) { releaseTrap['find'](); releaseTrap['find'] = null; }
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

  /* --- fill in missing coordinates ------------------------------------- */

  function geocodeTrip(btn) {
    if (!current) return;
    var bar = U.el('gc-bar'), pct = U.el('gc-pct');
    var total = Geocode.countPending(current);
    if (!total) { U.toast('冇嘢要補'); return; }
    if (!navigator.onLine) { U.toast('要上網先搵到座標', true); return; }

    btn.disabled = true;
    var was = btn.textContent;
    btn.textContent = '搵緊…';
    if (pct) pct.textContent = '0 / ' + total;

    /* fillTrip mutates a copy, so the saved trip only changes if it worked. */
    var work = Schema.normalize(U.clone(current));

    Geocode.fillTrip(work, function (done, all, hits) {
      if (bar) bar.style.width = Math.round(done / all * 100) + '%';
      if (pct) pct.textContent = done + ' / ' + all;
      btn.textContent = '搵緊… 已補 ' + hits;
    }).then(function (res) {
      btn.disabled = false;
      btn.textContent = was;

      if (!res.found.length) {
        U.toast('一個都搵唔到，可能要自己貼地圖連結', true);
        return;
      }
      work.updatedAt = new Date().toISOString();
      if (!Store.save(work)) { U.toast('儲存唔到', true); return; }

      var msg = '補咗 ' + res.found.length + ' 個座標';
      if (res.missed.length) msg += '，仲有 ' + res.missed.length + ' 個搵唔到';
      U.toast(msg + ' ✓');

      /* The trip changed, so re-render it and land back on the checkup so
         the remaining findings are visible. */
      current = null;
      var target = '#/trip/' + encodeURIComponent(work.id) + '/checkup';
      if (location.hash === target) route();
      else location.hash = target;
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = was;
      console.warn('[geocode]', err);
      U.toast('搵唔到座標：' + err.message, true);
    });
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
  /* The readable name of whatever a uid belongs to — a stop or a food
     pick — for photo alt text and labels. */
  function nameForUid(uid) {
    if (!current || !uid) return '';
    for (var i = 0; i < current.days.length; i++) {
      var stops = current.days[i].stops;
      for (var j = 0; j < stops.length; j++) {
        if (stops[j].uid === uid) return U.plain(stops[j].mapLabel || stops[j].title);
      }
    }
    var picks = current.food.picks;
    for (var k = 0; k < picks.length; k++) {
      if (picks[k].uid === uid) return U.plain(picks[k].title);
    }
    return '';
  }

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

      /* "相片" told a screen reader nothing. Name the place instead,
         and number them so two photos of one stop are distinguishable. */
      var place = nameForUid(id);
      Photos.listFor(current.id, id).then(function (recs) {
        var html = recs.map(function (r, i) {
          var alt = place
            ? place + ' 嘅相' + (recs.length > 1 ? ' ' + (i + 1) + '／' + recs.length : '')
            : '旅行相片' + (recs.length > 1 ? ' ' + (i + 1) : '');
          return '<button class="jr-th" data-act="viewphoto" data-photo="' + r.id +
            '" aria-label="放大 ' + U.esc(alt) + '">' +
            '<img src="' + Photos.urlFor(r.blob) + '" alt="' + U.esc(alt) + '" loading="lazy"></button>';
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
    box.setAttribute('aria-label', '相片');
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

    var release = U.trapFocus(box, function () { close(); });
    var closeBtn = box.querySelector('[data-lb="close"]');
    if (closeBtn) closeBtn.focus();

    function close() {
      release();
      box.remove();
    }

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
    if (U.el('view-passport').contains(btn)) return;  /* so does the passport */

    var act = btn.getAttribute('data-act');
    var id = btn.getAttribute('data-id');

    if (act === 'open') { go('#/trip/' + encodeURIComponent(id)); }
    else if (act === 'edit') { go('#/edit/' + encodeURIComponent(id || (current && current.id))); }
    else if (act === 'library') { go('#/'); }
    else if (act === 'cover') { e.preventDefault(); openCoverSheet(); }
    else if (act === 'hotels') { go('#/trip/' + encodeURIComponent(current.id) + '/hotels'); }
    else if (act === 'hc-prompt') { e.preventDefault(); hotelPrompt(); }
    else if (act === 'hc-import') { e.preventDefault(); hotelImport(); }
    else if (act === 'hc-manual') { e.preventDefault(); hotelManual(null); }
    else if (act === 'hc-edit') { e.preventDefault(); hotelManual(btn.getAttribute('data-uid')); }
    else if (act === 'hc-del') { e.preventDefault(); hotelDelete(btn.getAttribute('data-uid')); }
    else if (act === 'hc-pick') { e.preventDefault(); hotelPick(btn.getAttribute('data-uid')); }
    else if (act === 'lay-start') { e.preventDefault(); startArrange(); }
    else if (act === 'lay-done') { e.preventDefault(); endArrange(); }
    else if (act === 'lay-reset') { e.preventDefault(); Layout.reset(); repaintHome(); U.toast('排返預設次序'); }
    else if (act === 'lay-up') { e.preventDefault(); nudge(btn.getAttribute('data-key'), -1); }
    else if (act === 'lay-down') { e.preventDefault(); nudge(btn.getAttribute('data-key'), 1); }
    else if (act === 'lay-col') { e.preventDefault(); Layout.setCol(btn.getAttribute('data-key'), btn.getAttribute('data-col')); repaintHome(); }
    else if (act === 'home') { go('#/trip/' + encodeURIComponent(current.id)); }
    else if (act === 'day') { go('#/trip/' + encodeURIComponent(current.id) + '/' + encodeURIComponent(btn.getAttribute('data-day'))); }
    else if (act === 'food') { go('#/trip/' + encodeURIComponent(current.id) + '/food'); }
    else if (act === 'check') { go('#/trip/' + encodeURIComponent(current.id) + '/check'); }
    else if (act === 'search') { go('#/trip/' + encodeURIComponent(current.id) + '/search'); }
    else if (act === 'addfind') { e.preventDefault(); openFindSheet(btn.getAttribute('data-day')); }
    else if (act === 'checkup') { go('#/trip/' + encodeURIComponent(current.id) + '/checkup'); }
    else if (act === 'money') { go('#/trip/' + encodeURIComponent(current.id) + '/money'); }
    else if (act === 'spend-add') { e.preventDefault(); openSpendSheet(); }
    else if (act === 'spend-del') { e.preventDefault(); deleteSpend(btn.getAttribute('data-uid')); }
    else if (act === 'budget') { e.preventDefault(); editBudget(); }
    else if (act === 'bookings') { go('#/trip/' + encodeURIComponent(current.id) + '/bookings'); }
    else if (act === 'bk-add') { e.preventDefault(); openBookingSheet(); }
    else if (act === 'bk-del') { e.preventDefault(); deleteBooking(btn.getAttribute('data-uid')); }
    else if (act === 'copyref') { e.preventDefault(); copyRef(btn.getAttribute('data-ref'), btn); }
    else if (act === 'pack') { e.preventDefault(); togglePacked(btn.getAttribute('data-uid')); }
    else if (act === 'todo') { e.preventDefault(); toggleTodo(btn.getAttribute('data-uid')); }
    else if (act === 'pack-add') { e.preventDefault(); addPacking(); }
    else if (act === 'pack-del') { e.preventDefault(); deletePacking(btn.getAttribute('data-uid')); }
    else if (act === 'share') { e.preventDefault(); shareTrip(btn); }
    else if (act === 'print') { e.preventDefault(); printTrip(); }
    else if (act === 'geocode') { e.preventDefault(); geocodeTrip(btn); }
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
        Cover.remove(id);
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
    copyText(global.AI_PROMPT || '', 'copy 咗，貼落 AI 度啦 ✓');
  }

  function copyText(text, okMsg) {
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
      U.toast(ok ? okMsg : 'copy 唔到，試下手動揀', !ok);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { U.toast(okMsg); }, fallback);
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

  /* --- comparing hotels ---------------------------------------------- */

  /* Save a new compare list and show the comparison again. Comparing is
     planning, so this is an ordinary save and the trip re-renders. */
  function saveCompare(list, keepScroll) {
    if (!current) return false;
    var t = Store.get(current.id);
    if (!t) return false;
    t.compare = list;
    if (!Store.save(t)) return false;
    var y = window.pageYOffset;
    openTrip(t.id, 'hotels');
    if (keepScroll) window.scrollTo(0, y);
    return true;
  }

  function drawHotelMap() {
    if (!current || !U.el('hc-map')) return;
    Widgets.pinMap('hc-map', Hotels.mapPoints(current));
  }

  function compareRow(uid) {
    return current && current.compare.filter(function (h) { return h.uid === uid; })[0];
  }

  function hotelPrompt() {
    if (!current) return;
    var links = Hotels.linksIn(U.el('hc-links').value);
    if (!links.length) { U.toast('貼至少一條酒店連結先', true); U.el('hc-links').focus(); return; }
    copyText(Hotels.prompt(current, links), 'copy 咗 —— 貼俾 AI，再將佢嘅回覆貼返落嚟');
    var det = document.querySelector('#view-trip .hc-paste');
    if (det) det.open = true;
  }

  function hotelImport() {
    if (!current) return;
    var err = U.el('hc-err');
    err.hidden = true;
    var rows;
    try { rows = Hotels.parse(U.el('hc-reply').value); }
    catch (e) { err.textContent = e.message; err.hidden = false; return; }
    var before = current.compare.length;
    var merged = Hotels.merge(current.compare, rows);
    if (saveCompare(merged)) {
      var added = merged.length - before;
      U.toast(added > 0 ? '加咗 ' + added + ' 間' + (rows.length > added ? '，更新咗 ' + (rows.length - added) + ' 間' : '')
                        : '更新咗 ' + rows.length + ' 間');
    }
  }

  /* Links pasted without going through an AI still become rows: the
     name is read from the link where the site puts one there. */
  function hotelManual(uid) {
    if (!current) return;
    var base = uid ? compareRow(uid) : null;
    if (!base) {
      var links = Hotels.linksIn((U.el('hc-links') || {}).value || '');
      if (links.length > 1) {
        var rows = links.map(function (u) {
          return { url: u, name: Hotels.nameFromUrl(u) || '', platform: Hotels.platformOf(u) };
        });
        saveCompare(Hotels.merge(current.compare, rows));
        U.toast('加咗 ' + rows.length + ' 間，撳「✏️ 改」補返價錢同評分');
        return;
      }
      if (links.length === 1) base = { url: links[0], name: Hotels.nameFromUrl(links[0]), pros: [], cons: [], ratingScale: 10 };
    }

    var wrap = document.createElement('div');
    wrap.innerHTML = Hotels.editSheetHTML(base);
    var sheet = wrap.firstChild;
    document.body.appendChild(sheet);
    releaseTrap.hc = U.trapFocus(sheet, closeHotelSheet);
    setTimeout(function () { var n = U.el('hc-name'); if (n) n.focus(); }, 60);

    sheet.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-hc]') : null;
      if (!b) { if (e.target === sheet) closeHotelSheet(); return; }
      if (b.getAttribute('data-hc') === 'close') { closeHotelSheet(); return; }
      var row;
      try { row = Hotels.readSheet(base && base.uid ? base : null); }
      catch (err) {
        var box = U.el('hc-sheet-err'); box.textContent = err.message; box.hidden = false; return;
      }
      var list = current.compare.slice();
      if (base && base.uid) list = list.map(function (h) { return h.uid === base.uid ? row : h; });
      else list.push(row);
      closeHotelSheet();
      saveCompare(list, true);
    });
  }

  function closeHotelSheet() {
    if (releaseTrap.hc) { releaseTrap.hc(); releaseTrap.hc = null; }
    var sheet = U.el('hc-sheet');
    if (sheet) sheet.remove();
  }

  function hotelDelete(uid) {
    var h = compareRow(uid);
    if (!h || !confirm('喺比較入面刪除「' + (h.name || '呢間') + '」？')) return;
    saveCompare(current.compare.filter(function (x) { return x.uid !== uid; }), true);
  }

  /* Choosing makes it the trip's hotel — the fixed 🏨 card, the bookings
     list, the AI prompt — with what the comparison learned in its note. */
  function hotelPick(uid) {
    var h = compareRow(uid);
    if (!h || !current) return;
    if (Hotels.isChosen(current, h)) { U.toast('已經係呢個行程嘅酒店'); return; }
    var t = Store.get(current.id);
    var others = t.hotels.filter(function (x) { return x.name || x.address; });
    if (others.length && !confirm('將「' + h.name + '」設做呢個行程嘅酒店？\n\n' +
        '會取代現有嘅「' + others.map(function (x) { return x.name || x.address; }).join('、') + '」。')) return;

    var d = function (iso) { var p = U.parseISODate(iso); return p ? (p.getDate() + '/' + (p.getMonth() + 1)) : ''; };
    var money = function (n) { return n == null ? '' : (h.currency ? h.currency + ' ' : '') + n; };
    t.hotels = [{
      name: h.name,
      address: h.address,
      dates: t.startDate && t.endDate ? d(t.startDate) + ' in → ' + d(t.endDate) + ' out' : '',
      note: [h.total != null ? '總價 ' + money(h.total) : (h.pricePerNight != null ? '每晚 ' + money(h.pricePerNight) : ''),
             h.freeCancel ? '免費取消' : '', h.breakfast ? '包早餐' : '', h.platform].filter(Boolean).join(' · '),
      cancelBy: '',
      ref: '',
      mapQuery: h.name + (t.place && t.place.name ? ' ' + t.title : '')
    }];
    if (Store.save(t)) {
      openTrip(t.id, 'hotels');
      U.toast('揀咗「' + h.name + '」✓  記得訂埋，再喺編輯度填訂位編號');
    }
  }

  /* From the trips page: comparisons belong to a trip, so ask which. */
  function openHotelPicker() {
    var trips = Store.all();
    if (!trips.length) { U.toast('開咗個行程先，酒店比較係跟行程走嘅', true); return; }
    if (trips.length === 1) { go('#/trip/' + encodeURIComponent(trips[0].id) + '/hotels'); return; }
    var wrap = document.createElement('div');
    wrap.innerHTML = '<div class="sheet" id="pick-sheet" aria-labelledby="pick-sheet-h"><div class="sheet-in">' +
      '<div class="sheet-head"><h2 id="pick-sheet-h">🏨 邊個行程嘅酒店？</h2>' +
        '<button class="iconbtn" data-pick="close" aria-label="閂">✕</button></div>' +
      '<div class="cvopts">' + trips.map(function (t) {
        return '<button class="btn" data-pick="' + U.esc(t.id) + '">' + U.esc(t.title || '未命名') +
          (t.compare.length ? '（' + t.compare.length + ' 間）' : '') + '</button>';
      }).join('') + '</div></div></div>';
    var sheet = wrap.firstChild;
    document.body.appendChild(sheet);
    releaseTrap.pick = U.trapFocus(sheet, closePicker);
    sheet.querySelector('[data-pick]:not([data-pick="close"])').focus();
    sheet.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-pick]') : null;
      if (!b) { if (e.target === sheet) closePicker(); return; }
      var id = b.getAttribute('data-pick');
      closePicker();
      if (id !== 'close') go('#/trip/' + encodeURIComponent(id) + '/hotels');
    });
  }

  function closePicker() {
    if (releaseTrap.pick) { releaseTrap.pick(); releaseTrap.pick = null; }
    var sheet = U.el('pick-sheet');
    if (sheet) sheet.remove();
  }

  /* --- sync ---------------------------------------------------------- */

  var TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Travel%20Marvel';

  function syncStatusText(st) {
    if (!Sync.enabled()) return '未開';
    var when = st.at ? '，上次 ' + U.shortDateTime(st.at) : '';
    if (st.state === 'syncing') return '同步緊…';
    if (st.state === 'error') return '出錯：' + st.message;
    if (st.state === 'offline') return st.message;
    return '已同步' + when;
  }

  function paintSyncDot(st) {
    var dot = U.el('sync-dot');
    if (!dot) return;
    dot.hidden = !Sync.enabled();
    dot.classList.toggle('err', st.state === 'error');
    var tab = document.querySelector('.libbar [data-lib="sync"]');
    if (tab) tab.setAttribute('aria-label', '同步：' + syncStatusText(st));
  }

  function openSyncSheet() {
    var on = Sync.enabled(), st = Sync.status();
    var wrap = document.createElement('div');
    wrap.innerHTML = '<div class="sheet" id="sync-sheet" aria-labelledby="sync-sheet-h"><div class="sheet-in">' +
      '<div class="sheet-head"><h2 id="sync-sheet-h">☁️ 同步</h2>' +
        '<button class="iconbtn" data-sy="close" aria-label="閂">✕</button></div>' +
      (on
        ? '<p class="syncstate" id="sync-state">' + U.esc(syncStatusText(st)) + '</p>' +
          '<p class="tinynote">行程存喺你 GitHub 嘅一個私人 Gist' +
            (Sync.encrypted() ? '，加咗密，GitHub 睇唔到內容。' : '，<b>冇加密</b>。') +
            (Sync.gistUrl() ? ' <a href="' + U.esc(Sync.gistUrl()) + '" target="_blank" rel="noopener">睇吓個 Gist ↗</a>' : '') + '</p>' +
          '<div class="cvopts">' +
            '<button class="btn btn-primary" data-sy="now">🔄 即刻同步</button>' +
            '<button class="btn btn-danger" data-sy="off">停止喺呢部機同步</button>' +
          '</div>' +
          '<p class="tinynote">相片同封面相唔會同步，佢哋太大，亦都係最私人嘅嘢。</p>'
        : '<p class="tinynote" style="margin-top:0">行程會存去你自己 GitHub 帳戶入面一個私人 Gist，' +
            '每部機貼一次 token 就會自動同步。冇伺服器，冇新帳戶。</p>' +
          '<ol class="syncsteps">' +
            '<li><a href="' + TOKEN_URL + '" target="_blank" rel="noopener">喺 GitHub 整一個 token ↗</a>' +
              '：只剔 <b>gist</b>，揀個到期日，撳 Generate，copy 個 <code>ghp_…</code>。</li>' +
            '<li>貼喺下面。第二部機用<b>同一個 token</b>（或者另外整一個都得）。</li>' +
            '<li>設個加密密碼。每部機都要填同一個；唔記得就讀唔返雲端嗰份。</li>' +
          '</ol>' +
          '<div class="f"><label for="sy-token">GitHub token</label>' +
            '<input id="sy-token" type="password" autocomplete="off" spellcheck="false" placeholder="ghp_… 或者 github_pat_…"></div>' +
          '<div class="f"><label for="sy-pass">加密密碼 <span class="opt">（強烈建議）</span></label>' +
            '<input id="sy-pass" type="password" autocomplete="new-password"></div>' +
          '<p class="tinynote">GitHub 嘅「秘密」Gist 只係唔公開列出，有條連結嘅人都睇到。' +
            '設咗密碼，上載之前會喺你部機加密，GitHub 淨係見到亂碼。token 只會存喺呢部機。</p>' +
          '<div class="jsonerr" id="sy-err" hidden></div>' +
          '<div class="sheet-foot"><button class="btn" data-sy="close">取消</button>' +
            '<button class="btn btn-primary" data-sy="connect">開始同步</button></div>') +
      '</div></div>';
    var sheet = wrap.firstChild;
    document.body.appendChild(sheet);
    releaseTrap.sync = U.trapFocus(sheet, closeSyncSheet);
    setTimeout(function () {
      var f = U.el('sy-token') || sheet.querySelector('[data-sy="now"]');
      if (f) f.focus();
    }, 60);

    sheet.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-sy]') : null;
      if (!b) { if (e.target === sheet) closeSyncSheet(); return; }
      var what = b.getAttribute('data-sy');
      if (what === 'close') { closeSyncSheet(); return; }
      if (what === 'now') {
        b.disabled = true;
        Sync.now().then(function () { U.toast('同步咗'); }, function (err) { U.toast(err.message, true); })
          .then(function () { closeSyncSheet(); });
        return;
      }
      if (what === 'off') {
        if (!confirm('喺呢部機停止同步？\n\n呢部機嘅行程會留低，GitHub 上面嗰份都唔會刪。')) return;
        Sync.disconnect();
        closeSyncSheet();
        U.toast('已經停咗同步');
        return;
      }
      if (what === 'connect') {
        var err = U.el('sy-err');
        err.hidden = true;
        b.disabled = true;
        b.textContent = '連接緊…';
        Sync.connect(U.el('sy-token').value, U.el('sy-pass').value).then(function () {
          closeSyncSheet();
          U.toast('同步咗 ✓ 第二部機貼返同一個 token 同密碼就得');
        }, function (e2) {
          err.textContent = e2.message;
          err.hidden = false;
          b.disabled = false;
          b.textContent = '開始同步';
        });
      }
    });
  }

  function closeSyncSheet() {
    if (releaseTrap.sync) { releaseTrap.sync(); releaseTrap.sync = null; }
    var sheet = U.el('sync-sheet');
    if (sheet) sheet.remove();
  }

  /* Something arrived from another device: show it. The trip on screen
     is rebuilt only if it actually changed, so a sync never yanks the
     page out from under you for nothing. */
  function onPulled() {
    renderLibrary();
    if (U.el('view-passport').classList.contains('active') && global.TM_PLACES) paintPassport();
    if (!current) return;
    var fresh = Store.get(current.id);
    if (!fresh) { if (location.hash.indexOf('#/trip/') === 0) go('#/'); return; }
    if (JSON.stringify(fresh) === JSON.stringify(current)) return;
    var sub = lastSub || 'home';
    current = null;
    openTrip(fresh.id, sub);
  }

  /* --- the passport ---------------------------------------------------- */

  var passportYear = '';

  function openPassport() {
    showView('passport');
    var view = U.el('view-passport');
    if (!view.firstChild) view.innerHTML = '<div class="wrap"><p class="tinynote" style="padding:40px 0">載入緊護照…</p></div>';
    Passport.load().then(function () {
      paintPassport();
    }, function (err) {
      view.innerHTML = '<div class="wrap"><div class="card empty"><h2>開唔到護照</h2><p class="tinynote">' +
        U.esc(err.message) + '。上網開一次，之後離線都用得。</p></div></div>';
    });
  }

  function paintPassport() {
    var view = U.el('view-passport');
    var y = window.pageYOffset;
    view.innerHTML = Passport.viewHTML(passportYear);
    window.scrollTo(0, y);
  }

  function journeyByKey(key) {
    return Passport.all().filter(function (j) { return (j.auto ? j.key : j.uid) === key; })[0];
  }

  function openJourneySheet(j) {
    var wrap = document.createElement('div');
    wrap.innerHTML = Passport.journeySheetHTML(j);
    var sheet = wrap.firstChild;
    document.body.appendChild(sheet);
    releaseTrap.pj = U.trapFocus(sheet, closeJourneySheet);
    Passport.wirePlaceField(U.el('pj-from'));
    Passport.wirePlaceField(U.el('pj-to'));

    var mode = (j && j.mode) || 'flight';
    function showAir() { sheet.querySelector('.pj-air').classList.toggle('noair', mode !== 'flight'); }
    showAir();
    /* The sheet may already be gone by then (a quick delete). */
    setTimeout(function () { var f = U.el(j ? 'pj-date' : 'pj-from'); if (f) f.focus(); }, 60);

    sheet.addEventListener('click', function (e) {
      var m = e.target.closest ? e.target.closest('[data-mode]') : null;
      if (m) {
        mode = m.getAttribute('data-mode');
        Array.prototype.forEach.call(sheet.querySelectorAll('[data-mode]'), function (b) { b.classList.toggle('on', b === m); });
        showAir();
        return;
      }
      var b = e.target.closest ? e.target.closest('[data-pj]') : null;
      if (!b) { if (e.target === sheet) closeJourneySheet(); return; }
      var what = b.getAttribute('data-pj');
      if (what === 'close') { closeJourneySheet(); return; }
      if (what === 'delete') {
        if (!confirm(j.auto ? '喺護照度唔計呢段？\n\n行程本身唔會改。' : '刪除呢段旅程？')) return;
        Passport.remove(j);
        closeJourneySheet();
        paintPassport();
        return;
      }
      var err = U.el('pj-err');
      err.hidden = true;
      var from = Passport.placeOf('pj-from'), to = Passport.placeOf('pj-to');
      var date = U.el('pj-date').value;
      var fail = !from ? '「由」要喺建議入面揀一個地方' : !to ? '「去」要喺建議入面揀一個地方' :
        !date ? '填個出發日期' : '';
      var back = U.el('pj-back') ? U.el('pj-back').value : '';
      if (!fail && back && back < date) fail = '回程日期早過出發日期';
      if (fail) { err.textContent = fail; err.hidden = false; return; }

      var h = Number(U.el('pj-h').value) || 0, mi = Number(U.el('pj-m').value) || 0;
      var fnRaw = (U.el('pj-fn').value || '').toUpperCase().replace(/\s+/g, '');
      var row = {
        uid: j && !j.auto ? j.uid : '', autoKey: j && j.auto ? j.key : (j && j.autoKey) || '',
        from: from, to: to, date: date, mode: mode,
        flightNo: mode === 'flight' ? fnRaw : '', airline: mode === 'flight' ? fnRaw.slice(0, 2) : '',
        minutes: h * 60 + mi || null, note: ''
      };
      Passport.saveJourney(row);
      if (back) {
        Passport.saveJourney({ from: to, to: from, date: back, mode: mode, flightNo: '', airline: row.airline, minutes: row.minutes });
      }
      closeJourneySheet();
      paintPassport();
      U.toast(back ? '記低咗來回兩段' : '記低咗');
    });
  }

  function closeJourneySheet() {
    if (releaseTrap.pj) { releaseTrap.pj(); releaseTrap.pj = null; }
    var sheet = U.el('pj-sheet');
    if (sheet) sheet.remove();
  }

  function openHolderSheet() {
    var wrap = document.createElement('div');
    wrap.innerHTML = Passport.holderSheetHTML();
    var sheet = wrap.firstChild;
    document.body.appendChild(sheet);
    releaseTrap.ph = U.trapFocus(sheet, closeHolderSheet);
    Passport.wirePlaceField(U.el('ph-home'));
    setTimeout(function () { var f = U.el('ph-name'); if (f) f.focus(); }, 60);
    sheet.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-ph]') : null;
      if (!b) { if (e.target === sheet) closeHolderSheet(); return; }
      if (b.getAttribute('data-ph') === 'close') { closeHolderSheet(); return; }
      var typed = (U.el('ph-home').value || '').trim();
      var home = Passport.placeOf('ph-home');
      if (typed && !home) {
        var err = U.el('ph-err'); err.textContent = '「住喺邊」要喺建議入面揀一個地方'; err.hidden = false; return;
      }
      Passport.setHolder(U.el('ph-name').value, home);
      closeHolderSheet();
      paintPassport();
    });
  }

  function closeHolderSheet() {
    if (releaseTrap.ph) { releaseTrap.ph(); releaseTrap.ph = null; }
    var sheet = U.el('ph-sheet');
    if (sheet) sheet.remove();
  }

  /* The passport is its own page, outside any trip, so its buttons are
     handled here rather than in the trip view's click handler. */
  function wirePassport() {
    U.el('view-passport').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'pp-year') { passportYear = b.getAttribute('data-year'); paintPassport(); }
      else if (act === 'pj-add') openJourneySheet(null);
      else if (act === 'pj-edit') { var j = journeyByKey(b.getAttribute('data-key')); if (j) openJourneySheet(j); }
      else if (act === 'pp-holder') openHolderSheet();
    });
  }

  /* --- arranging the home cards --------------------------------------- */

  /* Repaint the home screen alone, in place. Arrange mode collapses every
     card to its bar, so nothing in it needs the live widgets. */
  function repaintHome() {
    if (!current) return;
    var view = document.querySelector('#view-trip .subview[data-sub="home"]');
    if (!view) return;
    var y = window.pageYOffset;
    var wrap = document.createElement('div');
    wrap.innerHTML = Render.homeHTML(current);
    var next = wrap.firstChild;
    var on = view.classList.contains('active');
    next.classList.toggle('active', on);
    next.style.display = on ? 'block' : 'none';
    view.replaceWith(next);
    window.scrollTo(0, y);
  }

  /* Leaving arrange mode rebuilds the whole trip, so the weather, the
     converter and the maps are drawn into the cards where they now sit. */
  function rebuildTrip() {
    if (!current) return;
    var id = current.id;
    current = null;
    openTrip(id, 'home');
  }

  function startArrange() {
    Render.setArranging(true);
    document.body.classList.add('arranging-now');
    repaintHome();
    var first = document.querySelector('#view-trip .hs-bar .iconbtn');
    if (first) first.focus();
  }

  function endArrange() {
    Render.setArranging(false);
    document.body.classList.remove('arranging-now');
    rebuildTrip();
  }

  function nudge(key, dir) {
    var list = Layout.get().filter(function (x) {
      return document.querySelector('#view-trip [data-card="' + x.k + '"]');
    });
    /* On a desktop a nudge stays within the card's own column. */
    var col = null;
    for (var i = 0; i < list.length; i++) if (list[i].k === key) col = list[i].col;
    var desk = !document.querySelector('#view-trip .harrange');
    var keys = list.filter(function (x) { return !desk || x.col === col; }).map(function (x) { return x.k; });
    var at = keys.indexOf(key), to = at + dir;
    if (at < 0 || to < 0 || to >= keys.length) return;
    Layout.moveKey(key, keys[to]);
    repaintHome();
    var again = document.querySelector('#view-trip [data-act="lay-' + (dir < 0 ? 'up' : 'down') + '"][data-key="' + key + '"]');
    if (again) again.focus();
  }

  function onLayoutDrop(list, from, to) {
    if (!current) return;
    var keys = Render.arrangedKeys(current, list);
    if (!keys[from] || !keys[to]) return;
    Layout.moveKey(keys[from], keys[to]);
    repaintHome();
  }

  /* --- the trips page's own bar ------------------------------------- */

  function wireLibBar() {
    var bar = document.querySelector('.libbar');
    if (!bar) return;
    bar.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-lib]') : null;
      if (!b) return;
      var what = b.getAttribute('data-lib');
      if (what === 'trips') { go('#/'); window.scrollTo(0, 0); }
      else if (what === 'new') go('#/new');
      else if (what === 'import') U.el('file-import').click();
      else if (what === 'paste') {
        togglePaste(true);
        U.el('paste-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
      else if (what === 'passport') go('#/passport');
      else if (what === 'hotels') openHotelPicker();
      else if (what === 'sync') openSyncSheet();
      else if (what === 'settings') openSettingsSheet();
    });
  }

  /* Settings gathers what used to sit only in the footer. The footer keeps
     its buttons — they are where people already look — so these simply
     press them rather than holding a second copy of each behaviour. */
  function openSettingsSheet() {
    var wrap = document.createElement('div');
    wrap.innerHTML = '<div class="sheet" id="set-sheet" aria-labelledby="set-sheet-h"><div class="sheet-in">' +
      '<div class="sheet-head"><h2 id="set-sheet-h">⚙️ 設定</h2>' +
        '<button class="iconbtn" data-set="close" aria-label="閂">✕</button></div>' +
      '<div class="cvopts">' +
        '<button class="btn" data-set="theme">' + U.esc(U.el('btn-theme').textContent) + '</button>' +
        '<button class="btn" data-set="restore">↩️ 復原上一次儲存</button>' +
        '<button class="btn" data-set="layout">🧩 卡片排位還原預設</button>' +
        '<button class="btn" data-set="update">🔄 檢查更新</button>' +
      '</div>' +
      '<p class="tinynote">Travel Marvel ' + U.esc(U.el('app-ver').textContent || '') +
        ' · 資料存喺你部機' + (typeof Sync !== 'undefined' && Sync.enabled() ? '，並同步去你嘅 GitHub' : '') + '</p>' +
      '</div></div>';
    var sheet = wrap.firstChild;
    document.body.appendChild(sheet);
    releaseTrap.settings = U.trapFocus(sheet, closeSettingsSheet);
    sheet.querySelector('[data-set="theme"]').focus();
    sheet.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-set]') : null;
      if (!b) { if (e.target === sheet) closeSettingsSheet(); return; }
      var what = b.getAttribute('data-set');
      if (what === 'close') { closeSettingsSheet(); return; }
      if (what === 'theme') { U.el('btn-theme').click(); b.textContent = U.el('btn-theme').textContent; return; }
      if (what === 'layout') { Layout.reset(); U.toast('卡片已經排返預設次序'); return; }
      closeSettingsSheet();
      if (what === 'restore') U.el('btn-restore').click();
      if (what === 'update') U.el('btn-update').click();
    });
  }

  function closeSettingsSheet() {
    if (releaseTrap.settings) { releaseTrap.settings(); releaseTrap.settings = null; }
    var sheet = U.el('set-sheet');
    if (sheet) sheet.remove();
  }

  function init() {
    Store.seedIfFirstRun();
    Store.migrateUids();
    DragSort.init();
    DragSort.register('layout', onLayoutDrop);
    Offline.init();

    document.addEventListener('click', onClick);
    window.addEventListener('hashchange', route);

    U.el('btn-new').addEventListener('click', function () { go('#/new'); });
    wireLibBar();

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

    Offline.version().then(function (v) {
      var el = U.el('app-ver');
      if (el && v) el.textContent = v;
    });

    U.el('btn-update').addEventListener('click', function (e) {
      var btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = '檢查緊…';
      Offline.checkNow().then(function (found) {
        if (found) {
          btn.textContent = '搵到新版，更新緊…';
          /* The reload is triggered by the worker taking over. */
        } else {
          btn.disabled = false;
          btn.textContent = '🔄 檢查更新';
          U.toast('已經係最新版');
        }
      }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = '🔄 檢查更新';
        U.toast(err.message || '檢查唔到', true);
      });
    });

    U.el('btn-restore-samples').addEventListener('click', function () {
      var n = Store.restoreSamples();
      if (n) { renderLibrary(); U.toast('載入咗 ' + n + ' 個示範行程'); }
    });

    wireTheme();
    wireRestore();
    wireSwipe();
    wirePassport();

    Sync.onStatus(function (st) {
      paintSyncDot(st);
      var line = U.el('sync-state');
      if (line) line.textContent = syncStatusText(st);
    });
    Sync.onPulled = onPulled;
    Sync.init();
    paintSyncDot(Sync.status());

    /* Enter in the packing field adds the row, so a list can be typed
       straight through without reaching for the button each time. */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var t = e.target;
      if (!t || t.id !== 'pk-new') return;
      e.preventDefault();
      addPacking();
    });

    route();
  }

  /* --- theme ------------------------------------------------------
     The OS choice is honoured by default; this only exists for the
     times it is wrong — a bright carriage at night, or a phone stuck
     on dark when you want to show someone the map. */
  var THEME_KEY = 'tripbook.theme';

  function currentTheme() {
    try { return localStorage.getItem(THEME_KEY) || ''; } catch (e) { return ''; }
  }

  function systemPrefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function isDark() {
    var set = currentTheme();
    return set ? set === 'dark' : systemPrefersDark();
  }

  function paintThemeButton() {
    var btn = U.el('btn-theme');
    if (!btn) return;
    /* The label says where the button takes you, not where you are. */
    btn.textContent = isDark() ? '☀️ 淺色' : '🌙 深色';
  }

  /* The attribute is always written, resolved — never left off for the
     OS to answer. The dark values live in exactly one CSS block that
     way, instead of one copy under a media query and one under the
     attribute, which had already drifted apart once. */
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', isDark() ? 'dark' : 'light');
    paintThemeButton();
  }

  function wireTheme() {
    applyTheme();
    var btn = U.el('btn-theme');
    if (btn) {
      btn.addEventListener('click', function () {
        var next = isDark() ? 'light' : 'dark';
        try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
        applyTheme();
      });
    }
    /* Follow the OS while no explicit choice has been made. */
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () { if (!currentTheme()) applyTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  /* --- one step back ----------------------------------------------
     Offers whatever the store kept before the last write. Says what it
     holds before doing it, because the whole point is that you reach
     for this after something went wrong and you are not sure what. */
  function wireRestore() {
    var btn = U.el('btn-restore');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var info = Store.backupInfo();
      if (!info) { U.toast('冇嘢可以復原'); return; }
      var when = U.shortDateTime(info.at);
      var names = info.titles.slice(0, 4).join('、') + (info.titles.length > 4 ? '…' : '');
      var msg = '回到上一次儲存之前？\n\n會變返：' + info.count + ' 個行程' +
        (names ? '\n' + names : '') + (when ? '\n（' + when + '）' : '') +
        '\n\n而家嘅狀態會變成下一個「復原」嘅對象，所以撳多次就返轉頭。';
      if (!confirm(msg)) return;
      if (Store.restoreBackup()) {
        current = null;          /* force a fresh read on the next open */
        renderLibrary();
        U.toast('復原咗');
      } else {
        U.toast('復原唔到', true);
      }
    });
  }

  global.App = { openTrip: openTrip, showLibrary: showLibrary, renderLibrary: renderLibrary };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
