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

    var hasFood = trip.food.quick.length || trip.food.picks.length;
    if (hasFood) {
      cards += '<button class="dcard food" data-act="food">' +
        '<div class="num"><b>◎</b><small>food</small></div>' +
        '<div class="txt"><div class="d">全程</div><div class="t">美食速查</div>' +
        '<div class="s">每餐 Plan A + 備選一覽</div></div><div class="arrow">›</div></button>';
    }
    return cards ? '<div class="daycards">' + cards + '</div>' : '';
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
        weatherHTML(trip) +
        fxHTML(trip) +
        countdownHTML(trip) +
        infoCardsHTML(trip) +
        dayCardsHTML(trip) +
        linksHTML(trip) +
        todosHTML(trip) +
        (trip.notes ? '<div class="card"><h2>📝 備註</h2><p style="font-size:.88rem;color:var(--ink-soft)">' +
          rich(trip.notes) + '</p></div>' : '') +
        '<footer>' + esc(trip.title || '行程') + '　<span class="heart">✦</span></footer>' +
      '</div></div>';
  }

  /* --- one day ------------------------------------------------- */

  function stopHTML(s) {
    if (!s.title && !s.desc && !s.time) return '';
    var nav = s.mapQuery
      ? '<a class="gmap" href="' + esc(U.mapsUrl(s.mapQuery)) + '" target="_blank" rel="noopener">🧭 導航</a>'
      : '';
    return '<div class="stop">' +
      '<div class="time">' + esc(s.time) + '</div>' +
      '<div>' +
        '<h4>' + rich(s.title) + (s.star ? ' <span class="star">★</span>' : '') + '</h4>' +
        nav +
        (s.desc ? '<p>' + rich(s.desc) + '</p>' : '') +
        (s.pin ? '<span class="pin">📍 ' + esc(s.pin) + '</span>' : '') +
        (s.backup ? '<span class="bk"><b>Backup：</b>' + rich(s.backup) + '</span>' : '') +
        (s.note ? '<span class="bk">' + rich(s.note) + '</span>' : '') +
      '</div></div>';
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
          return '<div class="stop"><div class="time">' + esc(p.icon || '🍽️') + '</div><div>' +
            '<h4>' + rich(p.title) + '</h4>' +
            (p.mapQuery ? '<a class="gmap" href="' + esc(U.mapsUrl(p.mapQuery)) +
              '" target="_blank" rel="noopener">🧭 導航</a>' : '') +
            (p.desc ? '<p>' + rich(p.desc) + '</p>' : '') +
          '</div></div>';
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
    container.innerHTML = homeHTML(t) +
      t.days.map(function (d, i) { return dayHTML(t, d, i); }).join('') +
      foodHTML(t);
  }

  global.Render = { trip: trip };
})(window);
