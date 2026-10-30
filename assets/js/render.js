/* Travel Marvel · itinerary renderer
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
          (readOnly ? '' :
            '<button class="btn btn-sm" data-act="library">‹ Travel Marvel</button>' +
            '<button class="btn btn-sm" data-act="edit">✏️ 編輯</button>') +
        '</div>' +
        '<div class="hero-inner">' +
          (trip.kicker ? '<div class="kicker">' + esc(trip.kicker) + '</div>' : '') +
          '<h1>' + esc(trip.title || '未命名行程') + '</h1>' +
          (trip.subtitle ? '<div class="sub">' + esc(trip.subtitle) + '</div>' : '') +
          (dates ? '<div class="dates">' + esc(dates) + '</div>' : '') +
        '</div>' +
        '<svg class="wave" viewBox="0 0 1440 46" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">' +
          '<path d="M0,24 C240,44 480,4 720,20 C960,36 1200,10 1440,26 L1440,46 L0,46 Z" fill="currentColor"/>' +
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
      '<div class="tw-btns">' +
        '<button class="btn btn-sm tw-go" data-act="day" data-day="' + esc(day.id) + '">睇今日行程 ›</button>' +
        (readOnly ? '' :
          '<button class="btn btn-sm tw-go" data-act="addfind" data-day="' + esc(day.id) + '">＋ 即興發現</button>') +
      '</div>';
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

  /* Fixed cards, always in this order and this shape. Rows with nothing
     in them are skipped, so a one-way trip or a hotel with no booking
     reference still reads cleanly. */
  function flightsHTML(trip) {
    var legs = trip.flights.filter(function (f) { return f.when || f.route; });
    if (!legs.length) return '';
    return '<div class="card"><h2>\u2708\ufe0f \u822a\u73ed</h2>' +
      legs.map(function (f) {
        var sub = [f.note, f.ref ? '\u8a02\u4f4d\u7de8\u865f ' + f.ref : ''].filter(Boolean).join(' \u00b7 ');
        return '<div class="kv"><span class="k">' + esc(f.when) + '</span>' +
          '<span class="v">' + rich(f.route) +
          (sub ? '<small>' + rich(sub) + '</small>' : '') + '</span></div>';
      }).join('') + '</div>';
  }

  function hotelsHTML(trip) {
    var stays = trip.hotels.filter(function (h) { return h.name || h.address; });
    if (!stays.length) return '';
    return stays.map(function (h, i) {
      var nav = h.mapQuery || h.name
        ? ' <a class="gmap" style="margin-left:6px" href="' +
          esc(U.mapsUrl(h.mapQuery || h.name)) + '" target="_blank" rel="noopener">\ud83e\udded \u5c0e\u822a</a>'
        : '';
      var title = '\ud83c\udfe8 \u9152\u5e97' + (stays.length > 1 ? ' ' + (i + 1) : '');
      var rows = [
        ['\u540d\u7a31', h.name, ''],
        ['\u4f4d\u7f6e', h.address, ''],
        ['\u5165 / \u9000\u623f', h.dates, h.note],
        ['\u514d\u8cbb\u53d6\u6d88', h.cancelBy, ''],
        ['\u8a02\u4f4d\u7de8\u865f', h.ref, '']
      ].filter(function (r) { return r[1]; });

      return '<div class="card"><h2>' + title + nav + '</h2>' +
        rows.map(function (r) {
          return '<div class="kv"><span class="k">' + r[0] + '</span><span class="v">' +
            rich(r[1]) + (r[2] ? '<small>' + rich(r[2]) + '</small>' : '') + '</span></div>';
        }).join('') +
        /* A note with no 入/退房 row to hang off still belongs somewhere. */
        (h.note && !h.dates ? '<p class="tinynote">' + rich(h.note) + '</p>' : '') +
        '</div>';
    }).join('');
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
      var label = 'Day ' + (i + 1) + '：' + U.plain(d.title || ('Day ' + (i + 1))) +
        (short ? '，' + (wd ? '星期' + wd + ' ' : '') + short : '');
      return '<button class="dcard" data-act="day" data-day="' + esc(d.id) + '"' +
        ' aria-label="' + esc(label) + '">' +
        '<div class="num" aria-hidden="true"><b>' + (i + 1) + '</b>' + (short ? '<small>' + esc((wd ? wd + ' ' : '') + short) + '</small>' : '') + '</div>' +
        '<div class="txt">' +
          (short ? '<div class="d">' + esc((wd ? '星期' + wd + ' · ' : '') + short) + '</div>' : '') +
          '<div class="t">' + esc(d.title || ('Day ' + (i + 1))) + '</div>' +
          (sub ? '<div class="s">' + esc(sub) + '</div>' : '') +
        '</div><div class="arrow" aria-hidden="true">›</div></button>';
    }).join('');

    if (!cards) return '';
    /* The days alone. The whole-trip tools used to be appended to this
       same stack in the same style, so on a ten-day trip the toolbox
       sat under ten day cards and looked like an eleventh day. They
       live in the tab bar now, and what is left here is a sequence. */
    return '<h2 class="secttl">逐日行程</h2>' +
      '<div class="daycards">' + cards + '</div>';
  }

  /* The two that genuinely belong on the home screen, because they are
     about this trip's state rather than a place to go: how much of it
     you have done, and whether anything in it looks wrong. */
  function statusCardsHTML(trip) {
    var cards = bookingsCardHTML(trip) + checkCardHTML(trip) + checkupCardHTML(trip);
    return cards ? '<div class="daycards statuscards">' + cards + '</div>' : '';
  }

  /* Offer the tile download only when the trip actually has maps to cache,
     and only where a service worker can exist (not on file://). */
  /* Sending the trip on, and getting it onto paper. Both are about the
     finished plan, so they sit together near the foot of the home page. */
  function shareHTML(trip) {
    if (readOnly) return '';
    return '<div class="card" id="share-card">' +
      '<h2>📤 分享 · 列印</h2>' +
      '<p class="tinynote" style="margin-top:0">' +
        'send 俾同行嘅人，或者印一份袋住做後備。' +
      '</p>' +
      '<div class="pasterow">' +
        '<button class="btn" data-act="share">📤 存成一個檔案</button>' +
        '<button class="btn" data-act="print">🖨️ 列印 / PDF</button>' +
      '</div>' +
      '<p class="tinynote">' +
        '檔案入面已經連埋 app 本身，對方唔使裝咩，撳開就睇到成個行程（相片唔會跟住走）。' +
      '</p>' +
    '</div>';
  }

  function offlineHTML(trip) {
    if (readOnly) return '';
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

  /* One home screen, two arrangements. On a phone it is a single column
     in this order. On a desktop the plan (today, the days, progress)
     takes the wide column and the reference cards (weather, money,
     flights, hotels, links) the narrow one.

     The markup is grouped by column and every piece carries its phone
     position as a flex `order`. Under the desktop breakpoint the column
     wrappers are display:contents, so the pieces fall back into one flex
     column in exactly the sequence below — neither layout has to be a
     compromise of the other. */
  function slot(order, html) {
    return html ? '<div class="hs" style="order:' + order + '">' + html + '</div>' : '';
  }

  function homeHTML(trip) {
    return '<div class="subview" data-sub="home">' +
      heroHTML(trip) +
      '<div class="wrap homegrid">' +
        '<div class="hcol hmain">' +
          slot(1, todayHTML(trip)) +
          slot(8, dayCardsHTML(trip)) +
          slot(9, statusCardsHTML(trip)) +
          slot(11, todosHTML(trip)) +
        '</div>' +
        '<div class="hcol hside">' +
          slot(2, weatherHTML(trip)) +
          slot(3, fxHTML(trip)) +
          slot(4, countdownHTML(trip)) +
          slot(5, flightsHTML(trip)) +
          slot(6, hotelsHTML(trip)) +
          slot(7, infoCardsHTML(trip)) +
          slot(10, linksHTML(trip)) +
          slot(12, shareHTML(trip)) +
          slot(13, offlineHTML(trip)) +
          slot(14, trip.notes ? '<div class="card"><h2>📝 備註</h2><p style="font-size:.88rem;color:var(--ink-soft)">' +
            rich(trip.notes) + '</p></div>' : '') +
        '</div>' +
        '<footer class="hfoot">' + esc(trip.title || '行程') + '　<span class="heart">✦</span></footer>' +
      '</div></div>';
  }

  /* --- one day ------------------------------------------------- */

  /* The trip currently being rendered, so stop/pick markup can ask whether
     something has been ticked without threading the trip through every call. */
  var activeTrip = null;

  /* Read-only is for the single-file copy you send someone: the same
     renderer, with everything that writes to a device they do not own
     left out. */
  var readOnly = false;

  function isDone(uid) {
    return !!(activeTrip && activeTrip.progress && activeTrip.progress[uid]);
  }

  /* A row of bare ✓ buttons is unusable by ear; each one needs the name
     of the thing it ticks. */
  function nameForTickUid(uid) {
    if (!activeTrip || !uid) return '';
    for (var i = 0; i < activeTrip.days.length; i++) {
      var stops = activeTrip.days[i].stops;
      for (var j = 0; j < stops.length; j++) {
        if (stops[j].uid === uid) return U.plain(stops[j].mapLabel || stops[j].title);
      }
    }
    var picks = activeTrip.food.picks;
    for (var k = 0; k < picks.length; k++) {
      if (picks[k].uid === uid) return U.plain(picks[k].title);
    }
    return '';
  }

  function tickBtn(uid) {
    if (!uid || readOnly) return '';
    var done = isDone(uid);
    var name = nameForTickUid(uid);
    return '<button class="tick' + (done ? ' on' : '') + '" data-act="tick" data-uid="' + esc(uid) +
      '" aria-pressed="' + (done ? 'true' : 'false') +
      '" aria-label="' + esc(name ? name + (done ? '：已經去咗' : '：標做去咗')
                                   : (done ? '已經去咗' : '標做去咗')) + '"' +
      ' title="' + (done ? '已經去咗' : '標做去咗') + '"><span aria-hidden="true">✓</span></button>';
  }

  function noteOf(uid) {
    var j = activeTrip && activeTrip.journal && activeTrip.journal[uid];
    return j ? j.note : '';
  }

  /* The record of what actually happened, under the plan: your note and
     your photos. Photo thumbnails are filled in asynchronously once
     IndexedDB answers — see App.paintPhotos. */
  function journalHTML(uid) {
    if (!uid) return '';
    var note = noteOf(uid);
    /* A shared copy keeps the notes, which are part of the story, but not
       the buttons that would write to the reader's own device. */
    if (readOnly) {
      return note
        ? '<div class="jr"><div class="jr-note">' + rich(note) + '</div></div>'
        : '';
    }
    return '<div class="jr" data-jr="' + esc(uid) + '">' +
      '<div class="jr-photos" data-photos="' + esc(uid) + '"></div>' +
      (note ? '<div class="jr-note" data-note="' + esc(uid) + '">' + rich(note) + '</div>' : '') +
      '<div class="jr-acts">' +
        '<button class="jr-b" data-act="note" data-uid="' + esc(uid) + '">' +
          (note ? '✏️ 改筆記' : '✏️ 加筆記') + '</button>' +
        '<button class="jr-b" data-act="photo" data-uid="' + esc(uid) + '">📷 加相</button>' +
      '</div>' +
    '</div>';
  }

  function stopHTML(s) {
    if (!s.title && !s.desc && !s.time) return '';
    var nav = s.mapQuery
      ? '<a class="gmap" href="' + esc(U.mapsUrl(s.mapQuery)) + '" target="_blank" rel="noopener">🧭 導航</a>'
      : '';
    return '<div class="stop' + (isDone(s.uid) ? ' done' : '') +
      (s.unplanned ? ' unplanned' : '') + '" data-uid="' + esc(s.uid) + '">' +
      '<div class="time">' + esc(s.time) + '</div>' +
      '<div>' +
        '<h4>' + rich(s.title) + (s.star ? ' <span class="star">★</span>' : '') +
          (s.unplanned ? ' <span class="findbadge">即興</span>' : '') + '</h4>' +
        nav +
        (s.desc ? '<p>' + rich(s.desc) + '</p>' : '') +
        (s.pin ? '<span class="pin">📍 ' + esc(s.pin) + '</span>' : '') +
        (s.backup ? '<span class="bk"><b>Backup：</b>' + rich(s.backup) + '</span>' : '') +
        (s.note ? '<span class="bk">' + rich(s.note) + '</span>' : '') +
        journalHTML(s.uid) +
      '</div>' + tickBtn(s.uid) + '</div>';
  }

  /* The gap between two stops, shown where both have coordinates. Reads
     as part of the timeline rather than as a separate fact. Only says
     how long the walk is where walking is the realistic answer — see
     U.legInfo. A straight-line walking estimate across 50 km, or out of
     an airport with the bags, is worse than saying nothing. */
  var LEG = {
    walk:      { icon: '🚶', far: false },
    either:    { icon: '🚶', far: false },
    ride:      { icon: '🚍', far: true  },
    intercity: { icon: '🚆', far: true  }
  };

  function legHTML(a, b) {
    if (!a || !b) return '';
    var leg = U.legInfo(a, b);
    if (!leg || leg.metres < 60) return '';
    var dist = esc(U.distanceText(leg.metres));
    var body;
    if (leg.mode === 'walk')           body = '行 ~' + leg.walk + ' 分鐘 · ' + dist;
    else if (leg.mode === 'either')    body = dist + ' · 行 ~' + leg.walk + ' 分鐘，搭車快啲';
    else if (leg.mode === 'ride')      body = '相距 ' + dist + ' · 要搭車';
    else                               body = '相距 ' + dist + ' · 唔係行路距離，要搭車／火車';
    return '<div class="leg' + (LEG[leg.mode].far ? ' far' : '') + '">' +
      '<span class="leg-i">' + LEG[leg.mode].icon + '</span>' + body +
      '</div>';
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

    return '<div class="subview dayview" data-sub="' + esc(day.id) + '"><div class="wrap">' +
      '<div class="backbar"><button class="backbtn" data-act="home"><span class="ar">‹</span> 首頁</button>' +
        '<span class="sp"></span>' +
        '<span class="bt">Day ' + (index + 1) + ' / ' + trip.days.length + '</span></div>' +
      '<div class="day-top"><div class="dn">' + esc(dn) + '</div>' +
        '<h3>' + esc(day.title || ('Day ' + (index + 1))) + '</h3>' +
        (day.theme ? '<div class="theme">' + esc(day.theme) + '</div>' : '') + '</div>' +
      /* Stops and map share a body: one column on a phone, side by side
         on a desktop with the map holding still while the list scrolls. */
      '<div class="daybody' + (map ? ' hasmap' : '') + '">' +
      '<div class="stops">' + day.stops.map(function (st, i) {
          var html = stopHTML(st);
          if (!html) return '';
          /* Find the next stop that will actually render, so a leg never
             spans a row that was dropped. */
          for (var j = i + 1; j < day.stops.length; j++) {
            if (stopHTML(day.stops[j])) return html + legHTML(st, day.stops[j]);
          }
          return html;
        }).join('') +
        (readOnly ? '' : '<div class="findrow">' +
          '<button class="btn findbtn" data-act="addfind" data-day="' + esc(day.id) + '">' +
            '＋ 即興發現</button>' +
          '<button class="btn findbtn" data-act="spend-add" data-day="' + esc(day.id) + '">' +
            '＋ 記一筆</button>' +
        '</div>') +
      '</div>' +
      map +
      '</div>' +
      dayStepHTML(trip, index) +
      '</div></div>';
  }

  /* A day is the unit people actually move through, so one should lead
     to the next. Without this, Day 2 to Day 3 meant going back to the
     home screen and finding it in the list. */
  function dayStepHTML(trip, index) {
    var prev = trip.days[index - 1], next = trip.days[index + 1];
    if (!prev && !next) return '';
    function side(day, i, dir, label) {
      if (!day) return '<span class="daystep-x"></span>';
      var name = U.plain(day.title || ('Day ' + (i + 1)));
      return '<button class="daystep-b" data-act="day" data-day="' + esc(day.id) + '">' +
        '<span class="daystep-d">' + label + '</span>' +
        '<span class="daystep-t">' + esc(name) + '</span></button>';
    }
    return '<nav class="daystep" aria-label="前後一日">' +
      side(prev, index - 1, 'prev', '‹ 前一日') +
      side(next, index + 1, 'next', '後一日 ›') +
      '</nav>';
  }

  /* --- what is booked -------------------------------------------
     Flights and hotels already have fixed cards. Everything else that
     is booked — the train to the coast, the museum slot, the table at
     20:00 — used to be scattered across infoCards, todos and stop
     pins. This gathers all three into one list in time order, so the
     question "what is next and what is the reference" has one answer.

     A booking reference exists to be read out at a desk, so each one
     is a button that copies itself. */
  function refBtn(ref) {
    if (!ref) return '';
    return '<button class="refb" data-act="copyref" data-ref="' + esc(ref) +
      '" title="撳一下 copy">' + esc(ref) + ' <span aria-hidden="true">⧉</span></button>';
  }

  /* Everything booked, in one shape, sorted: the ones with a real
     datetime first and in order, then the rest as written. */
  function bookingRows(trip) {
    var rows = [];
    trip.flights.forEach(function (f) {
      if (!f.when && !f.route) return;
      rows.push({ icon: '✈️', when: f.when, title: f.route, ref: f.ref, note: f.note, at: '', mapQuery: '' });
    });
    trip.hotels.forEach(function (h) {
      if (!h.name && !h.address) return;
      rows.push({
        icon: '🏨', when: h.dates, title: h.name || h.address, ref: h.ref,
        note: [h.address, h.note, h.cancelBy ? '免費取消到 ' + h.cancelBy : ''].filter(Boolean).join(' · '),
        at: '', mapQuery: h.mapQuery || h.name
      });
    });
    trip.bookings.forEach(function (b) {
      rows.push({
        icon: '🎫', when: b.when, title: b.title, ref: b.ref, note: b.note,
        at: b.at, mapQuery: b.mapQuery, uid: b.uid
      });
    });
    var timed = rows.filter(function (r) { return r.at; })
      .sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
    return timed.concat(rows.filter(function (r) { return !r.at; }));
  }

  /* The next one still ahead, for the countdown on the card. */
  function nextBooking(trip) {
    var now = new Date().toISOString().slice(0, 16);
    var ahead = bookingRows(trip)
      .filter(function (r) { return r.at && r.at >= now; })
      .sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
    return ahead[0] || null;
  }

  /* untilText counts minutes; `at` is a datetime. Passing one for the
     other printed "NaN 個鐘" on the card. */
  function countdownText(at) {
    var mins = U.minutesUntil(at);
    if (mins == null) return '';
    return mins < 0 ? '' : '仲有 ' + U.untilText(mins);
  }

  function bookingWhenText(row) {
    var cd = countdownText(row.at);
    if (cd) return ' · ' + cd;
    return row.when ? ' · ' + U.plain(row.when) : '';
  }

  function bookingsCardHTML(trip) {
    var rows = bookingRows(trip);
    if (!rows.length || readOnly) return '';
    var next = nextBooking(trip);
    return '<button class="dcard booked" data-act="bookings">' +
      '<div class="num"><b>🎫</b><small>' + rows.length + '</small></div>' +
      '<div class="txt"><div class="d">全程</div><div class="t">訂咗嘅嘢</div>' +
      '<div class="s">' + (next
        ? esc(U.plain(next.title || next.when)) + bookingWhenText(next)
        : rows.length + ' 樣已經訂好') + '</div></div>' +
      '<div class="arrow" aria-hidden="true">›</div></button>';
  }

  function bookingsHTML(trip) {
    if (readOnly) return '';
    var rows = bookingRows(trip);
    var next = nextBooking(trip);

    var head = '';
    if (next) {
      head = '<div class="card cd nextbk"><div class="cd-label">下一樣</div>' +
        '<div class="nb-t">' + rich(next.title || next.when) + '</div>' +
        '<div class="cd-sub">' + esc([next.when, countdownText(next.at)].filter(Boolean).join(' · ')) + '</div>' +
        '</div>';
    }

    var list = rows.length
      ? '<div class="card"><h2>全部</h2>' + rows.map(function (r) {
          var nav = r.mapQuery
            ? ' <a class="gmap" href="' + esc(U.mapsUrl(r.mapQuery)) +
              '" target="_blank" rel="noopener">🧭 導航</a>'
            : '';
          return '<div class="bkrow"><span class="bki">' + r.icon + '</span>' +
            '<span class="bkt">' + rich(r.title || r.when) + nav +
              (r.when && r.title ? '<small>' + esc(r.when) + '</small>' : '') +
              (r.note ? '<small>' + rich(r.note) + '</small>' : '') +
              (r.ref ? '<span class="bkref">訂位編號 ' + refBtn(r.ref) + '</span>' : '') +
            '</span>' +
            (r.uid ? '<button class="iconbtn" data-act="bk-del" data-uid="' + esc(r.uid) +
              '" aria-label="刪除">✕</button>' : '') +
            '</div>';
        }).join('') + '</div>'
      : '<div class="card empty"><h2>仲未訂過嘢</h2>' +
        '<p class="tinynote">機票同酒店填咗就會自動出喺度。其他（火車、博物館時段、餐廳）可以喺下面加。</p></div>';

    return '<div class="subview" data-sub="bookings"><div class="wrap">' +
      '<div class="backbar"><button class="backbtn" data-act="home"><span class="ar">‹</span> 首頁</button>' +
        '<span class="sp"></span><span class="bt">🎫 訂咗嘅嘢</span></div>' +
      head + list +
      '<div class="findrow"><button class="btn" data-act="bk-add">＋ 加一樣訂咗嘅嘢</button></div>' +
      '</div></div>';
  }

  function bookingSheetHTML() {
    return '<div class="sheet" id="bk-sheet" aria-labelledby="bk-sheet-h"><div class="sheet-in">' +
      '<div class="sheet-head"><h2 id="bk-sheet-h">＋ 訂咗嘅嘢</h2>' +
        '<button class="iconbtn" data-bk="close" aria-label="閂">✕</button></div>' +
      '<p class="tinynote" style="margin-top:0">機票同酒店唔使喺度加 —— 佢哋有自己嘅欄位，會自動出。</p>' +
      '<div class="f"><label>係咩嚟</label>' +
        '<input id="bk-title" type="text" placeholder="例如 火車去 Nerja、Alhambra 入場" autocomplete="off"></div>' +
      '<div class="f"><label>幾時 <span class="opt">（寫得幾清楚都得）</span></label>' +
        '<input id="bk-when" type="text" placeholder="例如 D3 09:15" autocomplete="off"></div>' +
      '<div class="f"><label>準確時間 <span class="opt">（填咗先有倒數，可留空）</span></label>' +
        '<input id="bk-at" type="datetime-local"></div>' +
      '<div class="f"><label>訂位編號 <span class="opt">（可留空）</span></label>' +
        '<input id="bk-ref" type="text" autocomplete="off"></div>' +
      '<div class="f"><label>備註 <span class="opt">（可留空）</span></label>' +
        '<input id="bk-note" type="text" autocomplete="off"></div>' +
      '<div class="sheet-foot">' +
        '<button class="btn" data-bk="close">取消</button>' +
        '<button class="btn btn-primary" data-bk="save">加入</button>' +
      '</div></div></div>';
  }

  /* --- what it cost ---------------------------------------------
     The FX widget converts one number, which is a calculator. The
     question on a trip is how much has gone so far and whether that is
     fine, so this is a running total with a per-day and per-category
     breakdown under it. */

  var CATS = [
    { key: 'food',  icon: '🍽️', label: '食' },
    { key: 'trans', icon: '🚆', label: '車' },
    { key: 'stay',  icon: '🏨', label: '住' },
    { key: 'see',   icon: '🎟️', label: '玩' },
    { key: 'shop',  icon: '🛍️', label: '買' },
    { key: 'other', icon: '💠', label: '其他' }
  ];

  function catOf(key) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].key === key) return CATS[i];
    return CATS[CATS.length - 1];
  }

  /* Money is counted in whole units of the trip's own currency, with
     decimals only where they exist — "€12" not "€12.00", but "€12.50"
     stays. */
  function moneyText(n, cur) {
    if (n == null || !isFinite(n)) return '';
    var rounded = Math.round(n * 100) / 100;
    var body = (rounded % 1 === 0) ? String(rounded) : rounded.toFixed(2);
    return (cur ? esc(cur) + ' ' : '') + body;
  }

  function spendTotals(trip) {
    var total = 0, byDay = {}, byCat = {};
    trip.spend.forEach(function (e) {
      total += e.amount;
      if (e.dayId) byDay[e.dayId] = (byDay[e.dayId] || 0) + e.amount;
      byCat[e.cat] = (byCat[e.cat] || 0) + e.amount;
    });
    return { total: total, byDay: byDay, byCat: byCat };
  }

  function moneyHTML(trip) {
    if (readOnly) return '';
    var cur = trip.currency.base || '';
    var tot = spendTotals(trip);
    var budget = trip.budget;

    var head = '<div class="card moneysum">' +
      '<div class="ms-t">用咗</div>' +
      '<div class="ms-n">' + moneyText(tot.total, cur) + '</div>';
    if (budget) {
      var pct = Math.min(100, Math.round((tot.total / budget) * 100));
      var left = budget - tot.total;
      head += '<div class="ms-bar"><i style="width:' + pct + '%" class="' +
          (tot.total > budget ? 'over' : '') + '"></i></div>' +
        '<div class="ms-b">' +
          (left >= 0 ? '仲有 ' + moneyText(left, cur) : '超咗 ' + moneyText(-left, cur)) +
          ' · 預算 ' + moneyText(budget, cur) + '</div>';
    }
    head += '<div class="ms-row">' +
      '<button class="btn btn-primary" data-act="spend-add">＋ 記一筆</button>' +
      '<button class="btn" data-act="budget">' + (budget ? '改預算' : '設預算') + '</button>' +
      '</div></div>';

    var cats = '';
    var catRows = CATS
      .map(function (c) { return { c: c, n: tot.byCat[c.key] || 0 }; })
      .filter(function (r) { return r.n > 0; })
      .sort(function (a, b) { return b.n - a.n; });
    if (catRows.length) {
      cats = '<div class="card"><h2>邊度用咗</h2>' +
        catRows.map(function (r) {
          var pct = tot.total ? Math.round((r.n / tot.total) * 100) : 0;
          return '<div class="catrow"><span class="ci">' + r.c.icon + '</span>' +
            '<span class="cn">' + esc(r.c.label) + '</span>' +
            '<span class="cb"><i style="width:' + pct + '%"></i></span>' +
            '<span class="cv">' + moneyText(r.n, cur) + '</span></div>';
        }).join('') + '</div>';
    }

    var days = '';
    var dayRows = trip.days
      .map(function (d, i) { return { d: d, i: i, n: tot.byDay[d.id] || 0 }; })
      .filter(function (r) { return r.n > 0; });
    if (dayRows.length) {
      days = '<div class="card"><h2>逐日</h2>' +
        dayRows.map(function (r) {
          return '<button class="kv kvb" data-act="day" data-day="' + esc(r.d.id) + '">' +
            '<span class="k">Day ' + (r.i + 1) +
              (r.d.title ? ' · ' + esc(U.plain(r.d.title)) : '') + '</span>' +
            '<span class="v">' + moneyText(r.n, cur) + '</span></button>';
        }).join('') + '</div>';
    }

    var list = '';
    if (trip.spend.length) {
      var rows = trip.spend.slice().sort(function (a, b) {
        return String(b.at).localeCompare(String(a.at));
      });
      list = '<div class="card"><h2>每一筆</h2>' +
        rows.map(function (e) {
          var c = catOf(e.cat);
          var where = '';
          if (e.dayId) {
            for (var i = 0; i < trip.days.length; i++) {
              if (trip.days[i].id === e.dayId) { where = 'Day ' + (i + 1); break; }
            }
          }
          return '<div class="sprow"><span class="si">' + c.icon + '</span>' +
            '<span class="st">' + (e.note ? esc(e.note) : esc(c.label)) +
              '<small>' + esc([where, U.shortDateTime(e.at)].filter(Boolean).join(' · ')) + '</small></span>' +
            '<span class="sv">' + moneyText(e.amount, cur) + '</span>' +
            '<button class="iconbtn" data-act="spend-del" data-uid="' + esc(e.uid) +
              '" aria-label="刪除呢筆">✕</button></div>';
        }).join('') + '</div>';
    } else {
      list = '<div class="card empty"><h2>仲未記過數</h2>' +
        '<p class="tinynote">撳「＋ 記一筆」，或者喺每一日嘅行程度直接記。</p></div>';
    }

    return '<div class="subview" data-sub="money"><div class="wrap">' +
      '<div class="backbar"><button class="backbtn" data-act="home"><span class="ar">‹</span> 首頁</button>' +
        '<span class="sp"></span><span class="bt">💰 使費</span></div>' +
      head + cats + days + list +
      '</div></div>';
  }

  /* Two taps from anywhere: amount, category, done. The day is filled in
     from wherever you pressed it, so logging a coffee on Day 3 does not
     start with choosing Day 3. */
  function spendSheetHTML(trip, dayId) {
    var cur = trip.currency.base || '';
    var days = trip.days.map(function (d, i) {
      var label = 'Day ' + (i + 1) + (d.title ? ' · ' + U.plain(d.title) : '');
      return '<option value="' + esc(d.id) + '"' + (d.id === dayId ? ' selected' : '') + '>' +
        esc(label) + '</option>';
    }).join('');

    return '<div class="sheet" id="spend-sheet" aria-labelledby="spend-sheet-h"><div class="sheet-in">' +
      '<div class="sheet-head"><h2 id="spend-sheet-h">＋ 記一筆</h2>' +
        '<button class="iconbtn" data-spend="close" aria-label="閂">✕</button></div>' +

      '<div class="f"><label>幾多錢' + (cur ? ' <span class="opt">（' + esc(cur) + '）</span>' : '') + '</label>' +
        '<input id="spend-amt" type="text" inputmode="decimal" placeholder="0" autocomplete="off"></div>' +

      '<div class="f"><label>類別</label><div class="kindrow">' +
        CATS.map(function (c, i) {
          return '<button class="kindb' + (i === 0 ? ' on' : '') + '" data-cat="' + esc(c.key) + '">' +
            c.icon + ' ' + esc(c.label) + '</button>';
        }).join('') + '</div></div>' +

      '<div class="f"><label>邊一日</label><select id="spend-day">' +
        '<option value="">唔關邊日事</option>' + days + '</select></div>' +

      '<div class="f"><label>備註 <span class="opt">（可留空）</span></label>' +
        '<input id="spend-note" type="text" placeholder="例如 午餐、火車飛" autocomplete="off"></div>' +

      '<div class="sheet-foot">' +
        '<button class="btn" data-spend="close">取消</button>' +
        '<button class="btn btn-primary" data-spend="save">記低</button>' +
      '</div></div></div>';
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
                     unplanned: s.unplanned,
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
    return '<div class="ckrow' + (done ? ' done' : '') +
      (it.unplanned ? ' unplanned' : '') + '" data-uid="' + esc(it.uid) + '">' +
      tickBtn(it.uid) +
      '<div class="ckb">' +
        '<div class="ckt">' + rich(it.title) + (it.star ? ' <span class="star">★</span>' : '') +
          (it.unplanned ? ' <span class="findbadge">即興</span>' : '') + '</div>' +
        (it.time ? '<div class="ckm">' + esc(it.time) + '</div>' : '') +
        '<div class="ckj" data-ckj="' + esc(it.uid) + '">' +
          (noteOf(it.uid) ? '<span class="ckjn">✏️ ' + esc(noteOf(it.uid)) + '</span>' : '') +
        '</div>' +
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

  /* What to bring. The same kind of thing as the visited list — a list
     you tick — so it shares this screen rather than taking a tab of its
     own. Ticking one is a record and does not touch the plan. */
  function packingHTML(trip) {
    var items = trip.packing;
    var done = items.filter(function (x) { return x.done; }).length;
    return '<div class="card packcard"><h2>🎒 執嘢清單' +
      (items.length ? ' <small class="pkn">' + done + ' / ' + items.length + '</small>' : '') + '</h2>' +
      (items.length
        ? '<ul class="pklist">' + items.map(function (x) {
            return '<li class="pkrow' + (x.done ? ' on' : '') + '">' +
              '<button class="tick' + (x.done ? ' on' : '') + '" data-act="pack" data-uid="' + esc(x.uid) +
                '" aria-pressed="' + (x.done ? 'true' : 'false') +
                '" aria-label="' + esc(x.text) + (x.done ? '：執咗' : '：標做執咗') + '">' +
                '<span aria-hidden="true">✓</span></button>' +
              '<span class="pkt">' + esc(x.text) + '</span>' +
              '<button class="iconbtn" data-act="pack-del" data-uid="' + esc(x.uid) +
                '" aria-label="刪除 ' + esc(x.text) + '">✕</button>' +
            '</li>';
          }).join('') + '</ul>'
        : '<p class="tinynote">仲未加過嘢。充電器、轉換插頭、藥 —— 加一次，下次複製行程就跟住嚟。</p>') +
      '<div class="pkadd">' +
        '<input id="pk-new" type="text" placeholder="加一樣嘢…" autocomplete="off" aria-label="加一樣要帶嘅嘢">' +
        '<button class="btn" data-act="pack-add">加</button>' +
      '</div></div>';
  }

  function checklistHTML(trip) {
    if (readOnly) return '';
    var items = checkItems(trip);

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
      (items.length
        ? '<div class="card ckcard">' +
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
          '</div>'
        : '') +
      packingHTML(trip) +
    '</div></div>';
  }

  /* Nav card on the itinerary home. */
  function checkCardHTML(trip) {
    if (readOnly) return '';
    var c = checkCounts(trip);
    if (!c.total) return '';
    return '<button class="dcard check" data-act="check">' +
      '<div class="num"><b>' + c.done + '</b><small>/ ' + c.total + '</small></div>' +
      '<div class="txt"><div class="d">全程</div><div class="t">打卡清單</div>' +
      '<div class="s">去過嘅景點同餐廳一覽</div></div><div class="arrow" aria-hidden="true">›</div></button>';
  }

  /* --- 行程體檢 -------------------------------------------------- */

  var LEVEL = {
    bad:  { cls: 'bad',  label: '要睇下' },
    warn: { cls: 'warn', label: '注意' },
    info: { cls: 'info', label: '資料' }
  };

  function checkupHTML(trip) {
    if (readOnly) return '';
    var findings = Checkup.run(trip);
    var c = Checkup.counts(findings);

    var body = findings.length
      ? findings.map(function (f) {
          var lv = LEVEL[f.level] || LEVEL.info;
          var attrs = f.goTo
            ? ' data-act="goto" data-sub="' + esc(f.goTo) + '"' +
              (f.uid ? ' data-uid="' + esc(f.uid) + '"' : '')
            : '';
          return '<button class="cu' + lv.cls + '"' + attrs + '>' +
            '<span class="cu-i">' + esc(f.icon) + '</span>' +
            '<span class="cu-b">' +
              '<span class="cu-t">' + esc(f.text) + '</span>' +
              '<span class="cu-s">' + esc(f.sub) + '</span>' +
            '</span>' +
            (f.goTo ? '<span class="arrow" aria-hidden="true">›</span>' : '') +
          '</button>';
        }).join('')
      : '<div class="card cuok"><div class="cuok-i">✓</div>' +
        '<h2>睇落冇問題</h2>' +
        '<p class="tinynote">座標、時間、行程密度都查過晒。</p></div>';

    return '<div class="subview" data-sub="checkup"><div class="wrap">' +
      '<div class="backbar"><button class="backbtn" data-act="home"><span class="ar">‹</span> 首頁</button>' +
        '<span class="sp"></span><span class="bt">行程體檢</span></div>' +
      '<div class="day-top"><div class="dn">出發前</div><h3>行程體檢</h3>' +
        '<div class="theme">查座標、時間、行唔行得切、仲欠咩</div></div>' +
      (Geocode.countPending(trip)
        ? '<div class="card gccard" id="gc-card">' +
            '<h2>\ud83d\udd0e \u81ea\u52d5\u88dc\u5ea7\u6a19</h2>' +
            '<p class="tinynote" style="margin-top:0">' +
              '\u6709 <b>' + Geocode.countPending(trip) + '</b> \u500b\u9ede\u5187\u5ea7\u6a19\uff0c\u5514\u6703\u51fa\u73fe\u55ba\u5730\u5716\u3002' +
              '\u6309\u4e00\u4e0b\u5c31\u81ea\u52d5\u6435\u8fd4\uff08\u7528 OpenStreetMap\uff0c\u5514\u4f7f key\uff09\u3002' +
              '\u4e00\u79d2\u6435\u4e00\u500b\uff0c\u8981\u4e0a\u7db2\u3002' +
            '</p>' +
            '<div class="dlrow"><div class="dlbar"><i id="gc-bar"></i></div>' +
            '<span class="dlpct" id="gc-pct"></span></div>' +
            '<button class="btn addrow" style="border-style:solid" data-act="geocode">' +
              '\u81ea\u52d5\u88dc\u8fd4\u5ea7\u6a19</button>' +
          '</div>'
        : '') +
      (findings.length
        ? '<div class="cusum">' +
            (c.bad ? '<span class="cupill bad">' + c.bad + ' 要睇下</span>' : '') +
            (c.warn ? '<span class="cupill warn">' + c.warn + ' 注意</span>' : '') +
            (c.info ? '<span class="cupill info">' + c.info + ' 資料</span>' : '') +
          '</div>'
        : '') +
      body +
      '<p class="legend">撳一下就會跳去嗰個點。「資料」嗰啲唔一定要改，' +
        '淨係話你知有啲功能未開到。</p>' +
    '</div></div>';
  }

  function checkupCardHTML(trip) {
    if (readOnly) return '';
    var c = Checkup.counts(Checkup.run(trip));
    var sub = c.total
      ? (c.bad ? c.bad + ' 個要睇下 · ' : '') + (c.warn ? c.warn + ' 個注意' : (c.info + ' 個資料'))
      : '睇落冇問題';
    return '<button class="dcard checkup' + (c.bad ? ' hasbad' : '') + '" data-act="checkup">' +
      '<div class="num"><b>' + (c.total || '✓') + '</b>' + (c.total ? '<small>項</small>' : '') + '</div>' +
      '<div class="txt"><div class="d">出發前</div><div class="t">行程體檢</div>' +
      '<div class="s">' + esc(sub) + '</div></div><div class="arrow" aria-hidden="true">›</div></button>';
  }

  /* --- search ---------------------------------------------------
     One box over everything in the trip: stop titles and descriptions,
     backups, pins, restaurant blurbs and your own notes. Results are
     built live in App.runSearch; this only lays out the page. */

  function searchHTML(trip) {
    if (readOnly) return '';
    if (searchIndex(trip).length <= 5) return '';
    return '<div class="subview" data-sub="search"><div class="wrap">' +
      '<div class="backbar"><button class="backbtn" data-act="home"><span class="ar">‹</span> 首頁</button>' +
        '<span class="sp"></span><span class="bt">搵嘢</span></div>' +
      '<div class="card schcard">' +
        '<input id="sch-q" class="schin" type="search" autocomplete="off" ' +
          'placeholder="搵景點、餐廳、筆記…" aria-label="搵嘢">' +
        '<p class="tinynote" id="sch-hint">打幾個字就會即刻搵。</p>' +
      '</div>' +
      '<div id="sch-results"></div>' +
    '</div></div>';
  }

  /* Everything searchable, flattened once per trip. */
  function searchIndex(trip) {
    var rows = [];
    trip.days.forEach(function (day, i) {
      day.stops.forEach(function (st) {
        if (!st.title && !st.desc) return;
        rows.push({
          uid: st.uid, dayId: day.id, sub: day.id,
          where: 'Day ' + (i + 1) + (day.title ? ' · ' + day.title : ''),
          time: st.time, title: st.title, star: st.star,
          hay: [st.title, st.desc, st.backup, st.pin, st.mapQuery, st.mapLabel,
                noteOf(st.uid)].join(' ').toLowerCase()
        });
      });
    });
    trip.food.picks.forEach(function (pk) {
      if (!pk.title) return;
      rows.push({
        uid: pk.uid, dayId: null, sub: 'food',
        where: '餐廳清單', time: pk.icon || '🍽️', title: pk.title, star: false,
        hay: [pk.title, pk.desc, pk.mapQuery, noteOf(pk.uid)].join(' ').toLowerCase()
      });
    });
    return rows;
  }

  function searchResultHTML(row) {
    return '<button class="schres" data-act="goto" data-sub="' + esc(row.sub) +
      '" data-uid="' + esc(row.uid) + '">' +
      '<div class="schb">' +
        '<div class="schw">' + esc(row.where) + (row.time ? ' · ' + esc(row.time) : '') + '</div>' +
        '<div class="scht">' + rich(row.title) + (row.star ? ' <span class="star">★</span>' : '') +
          (isDone(row.uid) ? ' <span class="schdone">✓ 去咗</span>' : '') + '</div>' +
        (noteOf(row.uid) ? '<div class="schn">✏️ ' + esc(noteOf(row.uid)) + '</div>' : '') +
      '</div><div class="arrow" aria-hidden="true">›</div></button>';
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
            journalHTML(p.uid) +
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

  /* The capture sheet. Deliberately short: you are standing in a bar
     with one hand free, so a name and a tap on 用我而家位置 is enough and
     everything else is optional. */
  function findSheetHTML(trip, dayId) {
    var now = new Date();
    var hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    var days = trip.days.map(function (d, i) {
      var label = 'Day ' + (i + 1) + (d.title ? ' · ' + U.plain(d.title) : '');
      return '<option value="' + esc(d.id) + '"' + (d.id === dayId ? ' selected' : '') + '>' +
        esc(label) + '</option>';
    }).join('');

    var kinds = [['🍽️', '食'], ['☕', '飲'], ['🛍️', '買'], ['📍', '景點']];

    return '<div class="sheet" id="find-sheet" aria-labelledby="find-sheet-h"><div class="sheet-in">' +
      '<div class="sheet-head"><h2 id="find-sheet-h">＋ 即興發現</h2>' +
        '<button class="iconbtn" data-find="close" aria-label="閂">✕</button></div>' +
      '<p class="tinynote" style="margin-top:0">唔喺計劃入面、但係去咗嘅地方。記低咗會自動當做「去咗」。</p>' +

      '<div class="f"><label>叫咩名</label>' +
        '<input id="find-name" type="text" placeholder="例如 Bar Alfaia" autocomplete="off"></div>' +

      '<div class="f"><label>類型</label><div class="kindrow">' +
        kinds.map(function (k, i) {
          return '<button class="kindb' + (i === 0 ? ' on' : '') + '" data-kind="' + esc(k[0]) + '">' +
            esc(k[0]) + ' ' + esc(k[1]) + '</button>';
        }).join('') + '</div></div>' +

      '<div class="frow">' +
        '<div class="f"><label>幾點</label><input id="find-time" type="text" value="~' + hhmm + '"></div>' +
        '<div class="f"><label>邊一日</label><select id="find-day">' + days + '</select></div>' +
      '</div>' +

      '<div class="f"><label>想講啲咩 <span class="opt">（可留空）</span></label>' +
        '<textarea id="find-note" placeholder="好唔好食？值唔值得再嚟？"></textarea></div>' +

      '<div class="pasterow">' +
        '<button class="btn" id="find-gps">📍 用我而家位置</button>' +
        '<button class="btn" id="find-link">📋 貼地圖連結</button>' +
      '</div>' +
      '<p class="tinynote" id="find-gps-note">攞到位置就會喺地圖見到呢個點。兩個方法都得。</p>' +

      '<div class="sheet-acts">' +
        '<button class="btn" data-find="close">取消</button>' +
        '<button class="btn btn-primary" id="find-save">記低佢</button>' +
      '</div>' +
    '</div></div>';
  }

  /* --- entry point --------------------------------------------- */

  /* The toolbox, always within reach. Everything used to route through
     the home screen: to get from a day to the food list you went back,
     scrolled past every day card, and found it at the bottom. */
  function tabBarHTML(t) {
    if (readOnly) return '';
    var tabs = [{ tab: 'home', icon: '📋', label: '行程' }];
    if (t.food.quick.length || t.food.picks.length) tabs.push({ tab: 'food', icon: '◎', label: '美食' });
    tabs.push({ tab: 'money', icon: '💰', label: '使費' });
    tabs.push({ tab: 'check', icon: '✓', label: '清單' });
    if (searchIndex(t).length > 5) tabs.push({ tab: 'search', icon: '🔍', label: '搵嘢' });
    /* On a desktop the bar becomes a sidebar, which has room for what a
       phone's bar does not: whose app this is, which trip you are in,
       and a way back to the shelf. Hidden below the breakpoint. */
    var brand = '<div class="sb-brand">' +
        '<img src="assets/icon-192.png" alt="" width="40" height="40">' +
        '<div><b>Travel Marvel</b><span>' + esc(U.plain(t.title || '行程')) + '</span></div>' +
      '</div>';
    var shelf = '<button class="tab tab-lib" data-act="library">' +
        '<span class="ti" aria-hidden="true">‹</span><span class="tl">所有行程</span></button>';
    return '<nav class="tabbar" aria-label="行程導覽">' + brand + shelf +
      tabs.map(function (x) {
        return '<button class="tab" data-tab="' + x.tab + '" data-act="' + x.tab + '">' +
          '<span class="ti" aria-hidden="true">' + x.icon + '</span>' +
          '<span class="tl">' + x.label + '</span></button>';
      }).join('') + '</nav>';
  }

  function trip(t, container) {
    activeTrip = t;
    container.innerHTML = homeHTML(t) +
      t.days.map(function (d, i) { return dayHTML(t, d, i); }).join('') +
      foodHTML(t) +
      moneyHTML(t) +
      bookingsHTML(t) +
      checklistHTML(t) +
      searchHTML(t) +
      checkupHTML(t) +
      tabBarHTML(t);
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

  /* Redraw every copy of one place's journal strip (day view, food view,
     checklist) without touching the rest of the page. */
  function refreshJournal(t, uid) {
    activeTrip = t;
    var strips = document.querySelectorAll('#view-trip [data-jr="' + uid + '"]');
    for (var i = 0; i < strips.length; i++) {
      strips[i].outerHTML = journalHTML(uid);
    }
    var marks = document.querySelectorAll('#view-trip [data-ckj="' + uid + '"]');
    var note = noteOf(uid);
    for (var j = 0; j < marks.length; j++) {
      marks[j].innerHTML = note ? '<span class="ckjn">✏️ ' + esc(note) + '</span>' : '';
    }
  }

  global.Render = {
    trip: trip, refreshToday: refreshToday, applyDayProgress: applyDayProgress,
    refreshJournal: refreshJournal, journalHTML: journalHTML,
    setReadOnly: function (v) { readOnly = !!v; },
    searchIndex: searchIndex, searchResultHTML: searchResultHTML,
    findSheetHTML: findSheetHTML,
    spendSheetHTML: spendSheetHTML, moneyHTML: moneyHTML,
    bookingSheetHTML: bookingSheetHTML, bookingsHTML: bookingsHTML,
    checklistHTML: checklistHTML,
    spendTotals: spendTotals, moneyText: moneyText,
    refreshCounts: refreshCounts, setActiveTrip: function (t) { activeTrip = t; }
  };
})(window);
