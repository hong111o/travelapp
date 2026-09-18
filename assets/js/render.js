/* 行程本 · itinerary renderer
 *
 * Turns a trip object into the itinerary screens. Every section is
 * conditional: a trip with no flights card, no food list or no
 * coordinates just renders without those blocks.
 */
(function (global) {
  'use strict';

  var esc = U.esc, rich = U.rich;

  /* --- home ---------------------------------------------------- */

  function heroHTML(trip) {
    var dates = U.dateRangeZH(trip.startDate, trip.endDate);
    return '' +
      '<header class="hero">' +
        '<div class="hero-top">' +
          '<button class="btn btn-sm" data-act="library">‹ 行程本</button>' +
          '<button class="btn btn-sm" data-act="edit">✏️ 編輯</button>' +
        '</div>' +
        '<div class="hero-inner">' +
          (trip.kicker ? '<div class="kicker">' + esc(trip.kicker) + '</div>' : '') +
          '<h1>' + esc(trip.title || '未命名行程') + '</h1>' +
          (trip.subtitle ? '<div class="sub">' + esc(trip.subtitle) + '</div>' : '') +
          (dates ? '<div class="dates">' + esc(dates) + '</div>' : '') +
        '</div>' +
        '<svg class="wave" viewBox="0 0 1440 46" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">' +
          '<path d="M0,24 C240,44 480,4 720,20 C960,36 1200,10 1440,26 L1440,46 L0,46 Z" fill="#FAF6EF"/>' +
        '</svg>' +
      '</header>';
  }

  /* ---- today: now & next -------------------------------------
     Only rendered while the trip is actually running. Turns the
     itinerary from something you navigate into something that tells
     you where you should be. */

  function stopLine(label, entry, showUntil) {
    if (!entry) return '';
    var s = entry.stop;
    var until = '';
    if (showUntil) {
      var gap = entry.mins - U.nowMinutes();
      var txt = U.untilText(gap);
      if (txt) until = '<span class="tw-in">' + esc(txt) + '後</span>';
    }
    var nav = s.mapQuery
      ? '<a class="gmap" href="' + esc(U.mapsUrl(s.mapQuery)) + '" target="_blank" rel="noopener">🧭 導航</a>'
      : '';
    return '<div class="twrow">' +
      '<div class="tw-l">' + esc(label) + '</div>' +
      '<div class="tw-b">' +
        '<div class="tw-t">' + esc(s.time) + until + '</div>' +
        '<div class="tw-n">' + rich(s.title) + (s.star ? ' <span class="star">★</span>' : '') + '</div>' +
        nav +
      '</div></div>';
  }

  function todayInner(trip) {
    var day = U.todaysDay(trip);
    if (!day) return '';
    var index = trip.days.indexOf(day);
    var p = U.dayProgress(day);

    var body;
    if (!p.timed.length) {
      body = '<div class="twnote">今日冇寫時間，撳入去睇成日安排。</div>';
    } else if (!p.current && p.next) {
      body = stopLine('第一站', p.next, true);
    } else if (p.current && !p.next) {
      body = stopLine('最後一站', p.current, false) +
        '<div class="twnote">今日行程行完喇 🌙</div>';
    } else {
      body = stopLine('而家', p.current, false) + stopLine('下一站', p.next, true);
    }

    return '<div class="tw-head">' +
        '<span class="tw-badge">Day ' + (index + 1) + '</span>' +
        '<span class="tw-ttl">' + esc(day.title || ('Day ' + (index + 1))) + '</span>' +
        '<span class="tw-live">● 今日</span>' +
      '</div>' + body +
      '<button class="btn btn-sm tw-go" data-act="day" data-day="' + esc(day.id) + '">睇今日行程 ›</button>';
  }

  function todayHTML(trip) {
    var inner = todayInner(trip);
    if (!inner) return '';
    return '<div class="card todaycard" id="today-card">' + inner + '</div>';
  }

  /* Re-mark the stops in today's day view. Called on a timer so an app
     left open overnight does not keep pointing at yesterday's lunch. */
  function applyDayProgress(trip) {
    /* Clear first, unconditionally: yesterday's marks must not survive
       into a day that is no longer today. */
    var all = document.querySelectorAll('#view-trip .stop');
    for (var i = 0; i < all.length; i++) {
      all[i].classList.remove('is-past', 'is-now', 'is-next');
    }

    var day = U.todaysDay(trip);
    if (!day) return;
    var container = document.querySelector(
      '#view-trip .subview[data-sub="' + day.id + '"] .stops');
    if (!container) return;

    var p = U.dayProgress(day);
    var nodes = container.querySelectorAll('.stop');
    /* Stops that render to nothing are dropped from the DOM, so walk the
       data and the nodes together by counting rendered stops. */
    var rendered = [];
    day.stops.forEach(function (s, i) {
      if (s.title || s.desc || s.time) rendered.push(i);
    });
    rendered.forEach(function (dataIx, nodeIx) {
      var node = nodes[nodeIx];
      if (!node) return;
      var mins = U.stopMinutes(day.stops[dataIx].time);
      if (mins == null) return;
      if (p.current && dataIx === p.current.i) node.classList.add('is-now');
      else if (p.next && dataIx === p.next.i) node.classList.add('is-next');
      else if (mins < U.nowMinutes()) node.classList.add('is-past');
    });
  }

  function refreshToday(trip) {
    var card = U.el('today-card');
    if (card) {
      var inner = todayInner(trip);
      if (inner) card.innerHTML = inner;
      else card.remove();
    }
    applyDayProgress(trip);
  }

  function weatherHTML(trip) {
    if (trip.place.lat == null || trip.place.lng == null) return '';
    var label = trip.place.name ? esc(trip.place.name) + '天氣' : '天氣';
    return '' +
      '<div class="card wxcard">' +
        '<div class="wxcol"><div class="l">🌤️ ' + label + '</div><div id="wx-body">載入中…</div></div>' +
        '<div class="wxdiv"></div>' +
        '<div class="wxcol"><div class="l">🌅 日落</div><div id="sun-body">載入中…</div></div>' +
      '</div>';
  }

  function fxHTML(trip) {
    var c = trip.currency;
    if (!c.base || !c.quote) return '';
    return '' +
      '<div class="card">' +
        '<h2>💱 匯率換算 <span style="font-size:.72rem;font-weight:400;color:var(--ink-soft)" id="fx-rate">載入中…</span></h2>' +
        '<div class="fxgrid">' +
          '<div class="fxcell"><label>' + esc(c.base) + '</label>' +
            '<input id="fx-a" type="number" inputmode="decimal" value="100"></div>' +
          '<div class="fxswap">⇄</div>' +
          '<div class="fxcell"><label>' + esc(c.quote) + '</label>' +
            '<input id="fx-b" type="number" inputmode="decimal"></div>' +
        '</div>' +
        '<p class="tinynote" id="fx-upd">即時參考匯率</p>' +
      '</div>';
  }

  function countdownHTML(trip) {
    if (Widgets.departureMs(trip.departure) == null) return '';
    return '' +
      '<div class="card cd">' +
        '<div class="cd-label">距離出發仲有</div>' +
        '<div id="countdown" class="cd-num">—</div>' +
        (trip.departure.note ? '<div class="cd-sub">' + esc(trip.departure.note) + '</div>' : '') +
      '</div>';
  }

  function infoCardsHTML(trip) {
    return trip.infoCards.map(function (c) {
      var rows = c.rows.filter(function (r) { return r.k || r.v; });
      if (!rows.length && !c.title) return '';
      var nav = c.mapQuery
        ? ' <a class="gmap" style="margin-left:6px" href="' + esc(U.mapsUrl(c.mapQuery)) +
          '" target="_blank" rel="noopener">🧭 導航</a>'
        : '';
      return '<div class="card"><h2>' + esc((c.icon ? c.icon + ' ' : '') + c.title) + nav + '</h2>' +
        rows.map(function (r) {
          return '<div class="kv"><span class="k">' + esc(r.k) + '</span><span class="v">' + rich(r.v) +
            (r.sub ? '<small>' + rich(r.sub) + '</small>' : '') + '</span></div>';
        }).join('') +
        '</div>';
    }).join('');
  }

  function dayCardsHTML(trip) {
    var cards = trip.days.map(function (d, i) {
      var wd = U.weekdayZH(d.date);
      var short = U.shortDate(d.date);
      var sub = (d.stops || []).filter(function (s) { return s.title; })
        .slice(0, 3).map(function (s) { return U.plain(s.mapLabel || s.title); }).join(' · ');
      return '<button class="dcard" data-act="day" data-day="' + esc(d.id) + '">' +
        '<div class="num"><b>' + (i + 1) + '</b>' + (short ? '<small>' + esc((wd ? wd + ' ' : '') + short) + '</small>' : '') + '</div>' +
        '<div class="txt">' +
          (short ? '<div class="d">' + esc((wd ? '星期' + wd + ' · ' : '') + short) + '</div>' : '') +
          '<div class="t">' + esc(d.title || ('Day ' + (i + 1))) + '</div>' +
          (sub ? '<div class="s">' + esc(sub) + '</div>' : '') +
        '</div><div class="arrow">›</div></button>';
    }).join('');

    cards += checkCardHTML(trip);

    var hasFood = trip.food.quick.length || trip.food.picks.length;
    if (hasFood) {
      cards += '<button class="dcard food" data-act="food">' +
        '<div class="num"><b>◎</b><small>food</small></div>' +
        '<div class="txt"><div class="d">全程</div><div class="t">美食速查</div>' +
        '<div class="s">每餐 Plan A + 備選一覽</div></div><div class="arrow">›</div></button>';
    }
    return cards ? '<div class="daycards">' + cards + '</div>' : '';
  }

  /* Offer the tile download only when the trip actually has maps to cache,
     and only where a service worker can exist (not on file://). */
  function offlineHTML(trip) {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return '';
    var hasPoints = trip.days.some(function (d) { return Widgets.pointsFor(d).length; });
    if (!hasPoints) return '';
    return '<div class="card" id="offline-card">' +
      '<h2>📥 離線地圖</h2>' +
      '<p class="tinynote" style="margin-top:0">出發前喺 wifi 撳一次，之後冇網都睇到每日地圖。' +
      '行程本身一直都係離線可睇。</p>' +
      '<div class="dlrow"><div class="dlbar"><i id="dl-bar"></i></div>' +
      '<span class="dlpct" id="dl-pct"></span></div>' +
      '<button class="btn addrow" style="border-style:solid" data-act="dlmaps">下載呢個行程嘅地圖</button>' +
      '</div>';
  }

  function linksHTML(trip) {
    var links = trip.links.filter(function (l) { return l.label && l.url; });
    if (!links.length) return '';
    return '<div class="card"><h2>🔗 實用連結</h2><div class="linkrow">' +
      links.map(function (l) {
        var external = /^https?:/i.test(l.url) ? ' target="_blank" rel="noopener"' : '';
        return '<a class="ilink" href="' + esc(l.url) + '"' + external + '>' +
          esc((l.icon ? l.icon + ' ' : '') + l.label) + '</a>';
      }).join('') + '</div></div>';
  }

  var TODO_TAG = {
    now:  { cls: 't-now',  label: '而家' },
    soon: { cls: 't-soon', label: '出發前' },
    day:  { cls: 't-ok',   label: '當日' }
  };

  function todosHTML(trip) {
    var todos = trip.todos.filter(function (d) { return d.text; });
    if (!todos.length) return '';
    return '<div class="card book"><h2>要訂嘅嘢</h2><ul>' +
      todos.map(function (d) {
        var tag = TODO_TAG[d.level] || TODO_TAG.soon;
        return '<li><span class="tag ' + tag.cls + '">' + tag.label + '</span><div>' + rich(d.text) + '</div></li>';
      }).join('') + '</ul></div>';
  }

  function homeHTML(trip) {
    return '<div class="subview" data-sub="home">' +
      heroHTML(trip) +
      '<div class="wrap">' +
        todayHTML(trip) +
        weatherHTML(trip) +
        fxHTML(trip) +
        countdownHTML(trip) +
        infoCardsHTML(trip) +
        dayCardsHTML(trip) +
        linksHTML(trip) +
        todosHTML(trip) +
        offlineHTML(trip) +
        (trip.notes ? '<div class="card"><h2>📝 備註</h2><p style="font-size:.88rem;color:var(--ink-soft)">' +
          rich(trip.notes) + '</p></div>' : '') +
        '<footer>' + esc(trip.title || '行程') + '　<span class="heart">✦</span></footer>' +
      '</div></div>';
  }

  /* --- one day ------------------------------------------------- */

  /* The trip currently being rendered, so stop/pick markup can ask whether
     something has been ticked without threading the trip through every call. */
  var activeTrip = null;

  function isDone(uid) {
    return !!(activeTrip && activeTrip.progress && activeTrip.progress[uid]);
  }

  function tickBtn(uid) {
    if (!uid) return '';
    var done = isDone(uid);
    return '<button class="tick' + (done ? ' on' : '') + '" data-act="tick" data-uid="' + esc(uid) +
      '" aria-pressed="' + (done ? 'true' : 'false') +
      '" title="' + (done ? '已經去咗' : '標做去咗') + '"><span>✓</span></button>';
  }

  function stopHTML(s) {
    if (!s.title && !s.desc && !s.time) return '';
    var nav = s.mapQuery
      ? '<a class="gmap" href="' + esc(U.mapsUrl(s.mapQuery)) + '" target="_blank" rel="noopener">🧭 導航</a>'
      : '';
    return '<div class="stop' + (isDone(s.uid) ? ' done' : '') + '" data-uid="' + esc(s.uid) + '">' +
      '<div class="time">' + esc(s.time) + '</div>' +
      '<div>' +
        '<h4>' + rich(s.title) + (s.star ? ' <span class="star">★</span>' : '') + '</h4>' +
        nav +
        (s.desc ? '<p>' + rich(s.desc) + '</p>' : '') +
        (s.pin ? '<span class="pin">📍 ' + esc(s.pin) + '</span>' : '') +
        (s.backup ? '<span class="bk"><b>Backup：</b>' + rich(s.backup) + '</span>' : '') +
        (s.note ? '<span class="bk">' + rich(s.note) + '</span>' : '') +
      '</div>' + tickBtn(s.uid) + '</div>';
  }

  function dayHTML(trip, day, index) {
    var wd = U.weekdayZH(day.date), short = U.shortDate(day.date);
    var dn = 'Day ' + (index + 1) + (short ? ' · ' + (wd ? '星期' + wd + ' ' : '') + short : '');
    var pts = Widgets.pointsFor(day);

    var map = '';
    if (pts.length) {
      map = '<div class="mapwrap"><div class="mh">📍 今日路線</div>' +
        '<div id="map-' + esc(day.id) + '" class="daymap"></div>' +
        '<div class="maplegend">' +
          pts.map(function (p) { return '<span><b>' + p.n + '</b>' + esc(p.name) + '</span>'; }).join('') +
        '</div>' +
        (day.mapNote ? '<p class="maphint">' + rich(day.mapNote) + '</p>' : '') +
        '</div>';
    }

    return '<div class="subview" data-sub="' + esc(day.id) + '"><div class="wrap">' +
      '<div class="backbar"><button class="backbtn" data-act="home"><span class="ar">‹</span> 首頁</button>' +
        '<span class="sp"></span>' +
        '<span class="bt">Day ' + (index + 1) + ' / ' + trip.days.length + '</span></div>' +
      '<div class="day-top"><div class="dn">' + esc(dn) + '</div>' +
        '<h3>' + esc(day.title || ('Day ' + (index + 1))) + '</h3>' +
        (day.theme ? '<div class="theme">' + esc(day.theme) + '</div>' : '') + '</div>' +
      '<div class="stops">' + day.stops.map(stopHTML).join('') + '</div>' +
      map +
      '</div></div>';
  }

  /* --- checklist ------------------------------------------------
     Everything worth ticking, across the whole trip, in one page: the
     stops of every day plus the standalone restaurant list. */

  /* A stop only counts if it is a real place — a bare "日落 🌅" marker or
     a timing note is not somewhere you arrive at. */
  function tickable(s) {
    return !!(s.title && (s.mapQuery || s.lat != null || s.desc || s.star));
  }

  function checkItems(trip) {
    var items = [];
    trip.days.forEach(function (day, i) {
      day.stops.filter(tickable).forEach(function (s) {
        items.push({ uid: s.uid, title: s.title, time: s.time, star: s.star,
                     mapQuery: s.mapQuery, group: 'Day ' + (i + 1), dayId: day.id,
                     groupTitle: day.title || ('Day ' + (i + 1)) });
      });
    });
    trip.food.picks.filter(function (p) { return p.title; }).forEach(function (p) {
      items.push({ uid: p.uid, title: p.title, time: p.icon || '🍽️', star: false,
                   mapQuery: p.mapQuery, group: '餐廳清單', dayId: null, groupTitle: '餐廳清單' });
    });
    return items;
  }

  function checkCounts(trip) {
    var items = checkItems(trip);
    var done = items.filter(function (it) { return isDone(it.uid); }).length;
    return { done: done, total: items.length };
  }

  function checkRow(it) {
    var done = isDone(it.uid);
    return '<div class="ckrow' + (done ? ' done' : '') + '" data-uid="' + esc(it.uid) + '">' +
      tickBtn(it.uid) +
      '<div class="ckb">' +
        '<div class="ckt">' + rich(it.title) + (it.star ? ' <span class="star">★</span>' : '') + '</div>' +
        (it.time ? '<div class="ckm">' + esc(it.time) + '</div>' : '') +
      '</div>' +
      (it.mapQuery ? '<a class="gmap ckn" href="' + esc(U.mapsUrl(it.mapQuery)) +
        '" target="_blank" rel="noopener">🧭</a>' : '') +
      '</div>';
  }

  function checkBarHTML(trip) {
    var c = checkCounts(trip);
    var pct = c.total ? Math.round(c.done / c.total * 100) : 0;
    return '<div class="ckhead" id="ck-head">' +
      '<div class="cknum"><b>' + c.done + '</b> / ' + c.total + ' 去咗</div>' +
      '<div class="ckbar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="ckpct">' + pct + '%</div>' +
      '</div>';
  }

  function checklistHTML(trip) {
    var items = checkItems(trip);
    if (!items.length) return '';

    var groups = [], byGroup = {};
    items.forEach(function (it) {
      if (!byGroup[it.group]) { byGroup[it.group] = []; groups.push(it.group); }
      byGroup[it.group].push(it);
    });

    var body = groups.map(function (g) {
      var first = byGroup[g][0];
      return '<div class="ckgroup">' +
        '<div class="ckgh">' + esc(g) +
          (first.groupTitle && first.groupTitle !== g ? ' · ' + esc(first.groupTitle) : '') +
        '</div>' +
        byGroup[g].map(checkRow).join('') +
      '</div>';
    }).join('');

    return '<div class="subview" data-sub="check"><div class="wrap">' +
      '<div class="backbar"><button class="backbtn" data-act="home"><span class="ar">‹</span> 首頁</button>' +
        '<span class="sp"></span><span class="bt">打卡清單</span></div>' +
      '<div class="day-top"><div class="dn">全程</div><h3>打卡清單</h3>' +
        '<div class="theme">去過嘅撳一下，日程頁面同呢度一齊更新</div></div>' +
      '<div class="card ckcard">' +
        checkBarHTML(trip) +
        '<div class="ckfilters">' +
          '<button class="ckf on" data-filter="all">全部</button>' +
          '<button class="ckf" data-filter="todo">未去</button>' +
          '<button class="ckf" data-filter="done">去咗</button>' +
        '</div>' +
      '</div>' +
      '<div id="ck-list">' + body + '</div>' +
      '<div class="card" style="text-align:center">' +
        '<button class="btn btn-sm btn-danger" data-act="ckreset">清空所有打卡記錄</button>' +
      '</div>' +
    '</div></div>';
  }

  /* Nav card on the itinerary home. */
  function checkCardHTML(trip) {
    var c = checkCounts(trip);
    if (!c.total) return '';
    return '<button class="dcard check" data-act="check">' +
      '<div class="num"><b>' + c.done + '</b><small>/ ' + c.total + '</small></div>' +
      '<div class="txt"><div class="d">全程</div><div class="t">打卡清單</div>' +
      '<div class="s">去過嘅景點同餐廳一覽</div></div><div class="arrow">›</div></button>';
  }

  /* --- food ---------------------------------------------------- */

  function foodHTML(trip) {
    var f = trip.food;
    if (!f.quick.length && !f.picks.length) return '';

    var quick = f.quick.filter(function (q) { return q.name || q.when; });
    var quickBlock = quick.length
      ? '<div class="stops">' + quick.map(function (q) {
          return '<div class="foodrow"><div class="when">' + esc(q.when) + '</div><div>' +
            '<div class="a">' + rich(q.name) + (q.star ? ' <span class="star">★</span>' : '') + '</div>' +
            (q.note ? '<div class="b">' + rich(q.note) + '</div>' : '') +
          '</div></div>';
        }).join('') + '</div>'
      : '';

    var picks = f.picks.filter(function (p) { return p.title; });
    var picksBlock = picks.length
      ? '<div class="day-top" style="margin-top:20px"><div class="dn">想食咩就搵邊間</div>' +
        '<h3>餐廳清單</h3><div class="theme">撳 🧭 直接導航</div></div>' +
        '<div class="stops">' + picks.map(function (p) {
          return '<div class="stop' + (isDone(p.uid) ? ' done' : '') + '" data-uid="' + esc(p.uid) + '">' +
            '<div class="time">' + esc(p.icon || '🍽️') + '</div><div>' +
            '<h4>' + rich(p.title) + '</h4>' +
            (p.mapQuery ? '<a class="gmap" href="' + esc(U.mapsUrl(p.mapQuery)) +
              '" target="_blank" rel="noopener">🧭 導航</a>' : '') +
            (p.desc ? '<p>' + rich(p.desc) + '</p>' : '') +
          '</div>' + tickBtn(p.uid) + '</div>';
        }).join('') + '</div>'
      : '';

    return '<div class="subview" data-sub="food"><div class="wrap">' +
      '<div class="backbar"><button class="backbtn" data-act="home"><span class="ar">‹</span> 首頁</button>' +
        '<span class="sp"></span><span class="bt">美食速查</span></div>' +
      '<div class="day-top"><div class="dn">全程</div><h3>美食速查</h3>' +
        '<div class="theme">每餐 Plan A（★）+ 備選</div></div>' +
      quickBlock +
      (f.legend ? '<p class="legend">' + rich(f.legend) + '</p>' : '') +
      picksBlock +
      '</div></div>';
  }

  /* --- entry point --------------------------------------------- */

  function trip(t, container) {
    activeTrip = t;
    container.innerHTML = homeHTML(t) +
      t.days.map(function (d, i) { return dayHTML(t, d, i); }).join('') +
      foodHTML(t) +
      checklistHTML(t);
  }

  /* Repaint just the counters after a tick, so the page does not rebuild. */
  function refreshCounts(t) {
    activeTrip = t;
    var head = U.el('ck-head');
    if (head) head.outerHTML = checkBarHTML(t);
    var card = document.querySelector('#view-trip .dcard.check .num');
    if (card) {
      var c = checkCounts(t);
      card.innerHTML = '<b>' + c.done + '</b><small>/ ' + c.total + '</small>';
    }
  }

  global.Render = {
    trip: trip, refreshToday: refreshToday, applyDayProgress: applyDayProgress,
    refreshCounts: refreshCounts, setActiveTrip: function (t) { activeTrip = t; }
  };
})(window);
