/* Travel Marvel · comparing hotels
 *
 * Booking.com, Expedia and the rest do not let another website read
 * their pages, and offer no public way to pull a price or a review
 * score, so the app cannot open a hotel link and fill itself in. What
 * it can do is the same trick as the AI trip import: hand an AI that
 * browses a prompt with your links in it, take back its JSON, and lay
 * the hotels out side by side — with the one thing no booking site
 * does, which is measuring each hotel against *your* plan: how far it
 * is from the places you are actually going.
 *
 * Everything here is pure: building the prompt, reading the reply,
 * guessing what a link is, scoring, and drawing. The app wires it up.
 */
(function (global) {
  'use strict';

  var esc = U.esc, rich = U.rich;

  /* --- what a link is ------------------------------------------------ */

  var PLATFORMS = [
    [/booking\.com/i, 'Booking.com'],
    [/expedia\./i, 'Expedia'],
    [/agoda\./i, 'Agoda'],
    [/hotels\.com/i, 'Hotels.com'],
    [/airbnb\./i, 'Airbnb'],
    [/trip\.com|ctrip\./i, 'Trip.com'],
    [/tripadvisor\./i, 'Tripadvisor'],
    [/google\.[a-z.]+\/travel|google\.[a-z.]+\/maps/i, 'Google'],
    [/hostelworld\./i, 'Hostelworld'],
    [/marriott|hilton|ihg|accor|hyatt/i, '官網']
  ];

  function platformOf(url) {
    for (var i = 0; i < PLATFORMS.length; i++) if (PLATFORMS[i][0].test(url)) return PLATFORMS[i][1];
    var m = String(url || '').match(/^https?:\/\/(?:www\.)?([^/]+)/i);
    return m ? m[1] : '';
  }

  function titleCase(words) {
    return words.split(/[-_+]+/).filter(Boolean).map(function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  /* A name worth starting from, where the link carries one. Booking.com
     and Expedia put the hotel in the path; Airbnb only has a number. */
  function nameFromUrl(url) {
    var u = String(url || '');
    var m = u.match(/booking\.com\/hotel\/[a-z]{2}\/([^.?#/]+)/i);
    if (m) return titleCase(decodeURIComponent(m[1]));
    m = u.match(/expedia\.[^/]+\/(?:[^/]+\/)?[^/]*?-Hotels-([^.?#/]+)\.h\d+/i);
    if (m) return titleCase(decodeURIComponent(m[1]));
    m = u.match(/agoda\.com\/(?:[a-z-]+\/)?([^/?#]+)\/hotel\//i);
    if (m) return titleCase(decodeURIComponent(m[1]));
    m = u.match(/hotels\.com\/ho\d+\/([^/?#]+)/i);
    if (m) return titleCase(decodeURIComponent(m[1]));
    return '';
  }

  function linksIn(text) {
    var seen = {}, out = [];
    String(text || '').split(/\s+/).forEach(function (w) {
      var m = w.match(/https?:\/\/[^\s<>"']+/i);
      if (!m) return;
      var url = m[0].replace(/[),.;]+$/, '');
      if (seen[url]) return;
      seen[url] = true;
      out.push(url);
    });
    return out;
  }

  /* --- the prompt ------------------------------------------------------ */

  function nightsOf(trip) {
    var a = U.parseISODate(trip.startDate), b = U.parseISODate(trip.endDate);
    if (!a || !b) return null;
    var n = Math.round((b - a) / 86400000);
    return n > 0 ? n : null;
  }

  function prompt(trip, links) {
    var nights = nightsOf(trip);
    var city = trip.place && trip.place.name ? trip.place.name + '（' + trip.title + '）' : trip.title;
    var spots = [];
    trip.days.forEach(function (d) {
      d.stops.forEach(function (s) {
        var name = U.plain(s.mapLabel || s.title);
        if (name && spots.indexOf(name) < 0) spots.push(name);
      });
    });

    return [
      '幫我比較下面幾間酒店。請**逐條連結打開睇**（唔好靠估），然後淨係輸出一個 JSON array，',
      '前後唔好有任何其他文字，唔好用 ``` 包住。',
      '',
      '行程：' + city + (trip.startDate ? '，' + trip.startDate + ' 入住' : '') +
        (trip.endDate ? '，' + trip.endDate + ' 退房' : '') + (nights ? '（' + nights + ' 晚）' : ''),
      spots.length ? '我會去嘅地方：' + spots.slice(0, 20).join('、') : '',
      '',
      '酒店連結：',
      links.map(function (l, i) { return (i + 1) + '. ' + l; }).join('\n'),
      '',
      '每間酒店一個 object，格式：',
      '{',
      '  "url": "原本條連結",',
      '  "name": "酒店全名",',
      '  "platform": "Booking.com / Expedia / Agoda / Airbnb…",',
      '  "pricePerNight": 120,',
      '  "total": 360,',
      '  "currency": "EUR",',
      '  "rating": 8.9,',
      '  "ratingScale": 10,',
      '  "reviews": 1234,',
      '  "address": "街道地址",',
      '  "lat": 36.7201,',
      '  "lng": -4.4203,',
      '  "freeCancel": true,',
      '  "breakfast": false,',
      '  "pros": ["優點，每點一句，最多 4 點，盡量引住客評語"],',
      '  "cons": ["缺點，每點一句，最多 4 點"],',
      '  "notes": "其他值得知嘅嘢，例如 check-in 時間、有冇電梯、城市稅"',
      '}',
      '',
      '規則：',
      '- 數字唔好加引號。價錢用連結顯示嗰個貨幣，total 係成段住宿嘅總價（連稅）。',
      '- 價錢、評分睇唔到就寫 null，**唔好作**。',
      '- ratingScale：Booking.com、Expedia、Agoda、Hotels.com 係 10；Google、Airbnb、Tripadvisor 係 5。',
      '- lat / lng 請查返酒店真實位置（地圖或者酒店頁面上面有），唔肯定先寫 null。',
      '- freeCancel / breakfast 唔清楚就寫 null。',
      '- 全部文字用繁體中文。'
    ].filter(function (l) { return l !== null; }).join('\n');
  }

  /* --- reading the reply ------------------------------------------------ */

  /* Takes whatever the AI sent back — fenced, prefaced, an array, or an
     object holding one — and returns plain rows for Schema to clean. */
  function parse(text) {
    var data = Store.extractJSON(text);
    if (data && !Array.isArray(data)) data = data.hotels || data.compare || [data];
    if (!Array.isArray(data)) throw new Error('睇唔明 —— 要一個 JSON array');
    var rows = data.filter(function (h) { return h && typeof h === 'object' && (h.name || h.url); });
    if (!rows.length) throw new Error('搵唔到酒店資料');
    return rows;
  }

  /* Fold incoming rows into the list: a hotel already there (same link,
     or same name) is updated in place, keeping your own edits where the
     reply has nothing; anything else is added. */
  function merge(existing, incoming) {
    var out = existing.slice();
    incoming.forEach(function (h) {
      var key = String(h.url || '').split('?')[0], name = String(h.name || '').toLowerCase();
      var at = -1;
      for (var i = 0; i < out.length; i++) {
        var u = String(out[i].url || '').split('?')[0];
        if ((key && u === key) || (name && String(out[i].name || '').toLowerCase() === name)) { at = i; break; }
      }
      if (at < 0) { out.push(h); return; }
      var merged = {};
      Object.keys(out[at]).forEach(function (k) { merged[k] = out[at][k]; });
      Object.keys(h).forEach(function (k) {
        var v = h[k];
        if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return;
        merged[k] = v;
      });
      merged.uid = out[at].uid;
      out[at] = merged;
    });
    return out;
  }

  /* --- measuring each against the plan ----------------------------------- */

  function placedStops(trip) {
    var out = [];
    trip.days.forEach(function (d) {
      d.stops.forEach(function (s) { if (s.lat != null && s.lng != null) out.push(s); });
    });
    return out;
  }

  /* Average distance to the places on the itinerary, and how many of them
     are a walk away. A booking site measures from "the centre"; you are
     not going to the centre, you are going to these. */
  function reach(trip, h) {
    if (h.lat == null || h.lng == null) return null;
    var stops = placedStops(trip);
    if (!stops.length) return null;
    var sum = 0, walk = 0;
    stops.forEach(function (s) {
      var m = U.metresBetween(h, s);
      sum += m;
      if (m <= 1500) walk++;
    });
    return { avg: sum / stops.length, walkable: walk, of: stops.length };
  }

  function score10(h) {
    if (h.rating == null) return null;
    return h.ratingScale && h.ratingScale !== 10 ? h.rating * 10 / h.ratingScale : h.rating;
  }

  /* Which hotel wins each measure, among those that have it. Totals are
     only compared within one currency: a cheapest-of-EUR-and-JPY badge
     would be nonsense. */
  function winners(trip, list) {
    var best = { cheap: null, rated: null, near: null };
    var cur = null, mixed = false;
    list.forEach(function (h) {
      if (h.total == null && h.pricePerNight == null) return;
      if (cur && h.currency && h.currency !== cur) mixed = true;
      cur = cur || h.currency;
    });
    var lo = Infinity, hi = -Infinity, near = Infinity;
    list.forEach(function (h) {
      var price = h.total != null ? h.total : h.pricePerNight;
      if (!mixed && price != null && price < lo) { lo = price; best.cheap = h.uid; }
      var sc = score10(h);
      if (sc != null && sc > hi) { hi = sc; best.rated = h.uid; }
      var r = reach(trip, h);
      if (r && r.avg < near) { near = r.avg; best.near = h.uid; }
    });
    /* A badge among one is no comparison. */
    var counted = list.length > 1;
    return counted ? best : { cheap: null, rated: null, near: null };
  }

  /* --- drawing ------------------------------------------------------------- */

  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function money(n, cur) {
    if (n == null) return '';
    var r = Math.round(n * 100) / 100;
    return (cur ? esc(cur) + ' ' : '') + (r % 1 === 0 ? String(r) : r.toFixed(2));
  }

  function yesNo(v, yes, no) {
    if (v === true) return '<span class="hc-chip ok">✓ ' + yes + '</span>';
    if (v === false) return '<span class="hc-chip no">✗ ' + no + '</span>';
    return '';
  }

  function cardHTML(trip, h, i, best, chosen) {
    var r = reach(trip, h);
    var badges = [];
    if (best.cheap === h.uid) badges.push('<span class="hc-badge cheap">最平</span>');
    if (best.rated === h.uid) badges.push('<span class="hc-badge rated">最高分</span>');
    if (best.near === h.uid) badges.push('<span class="hc-badge near">最就腳</span>');
    if (chosen) badges.push('<span class="hc-badge picked">已揀</span>');

    var sc = h.rating != null
      ? '<b>' + esc(String(h.rating)) + '</b><small> / ' + esc(String(h.ratingScale || 10)) + '</small>' +
        (h.reviews ? '<small> · ' + esc(String(h.reviews)) + ' 個評語</small>' : '')
      : '<small>冇評分</small>';

    return '<article class="hc-card' + (chosen ? ' chosen' : '') + '" data-uid="' + esc(h.uid) + '">' +
      '<header class="hc-head"><span class="hc-letter" aria-hidden="true">' + LETTERS.charAt(i % 26) + '</span>' +
        '<div class="hc-title"><h3>' + esc(h.name || '未知酒店') + '</h3>' +
          (h.url ? '<a class="hc-src" href="' + esc(h.url) + '" target="_blank" rel="noopener">' +
            esc(h.platform || platformOf(h.url) || '連結') + ' ↗</a>' : '') +
        '</div></header>' +
      (badges.length ? '<div class="hc-badges">' + badges.join('') + '</div>' : '') +

      '<dl class="hc-facts">' +
        '<div><dt>每晚</dt><dd>' + (h.pricePerNight != null ? money(h.pricePerNight, h.currency) : '—') + '</dd></div>' +
        '<div><dt>總價</dt><dd>' + (h.total != null ? money(h.total, h.currency) : '—') + '</dd></div>' +
        '<div><dt>評分</dt><dd>' + sc + '</dd></div>' +
        '<div><dt>位置</dt><dd>' + (r
          ? '平均離景點 ' + esc(U.distanceText(r.avg)) + '<small> · ' + r.walkable + ' / ' + r.of + ' 個行得到</small>'
          : (h.lat == null ? '<small>未有座標</small>' : '<small>行程未有座標</small>')) + '</dd></div>' +
      '</dl>' +

      '<div class="hc-chips">' + yesNo(h.freeCancel, '免費取消', '唔退得') + yesNo(h.breakfast, '包早餐', '冇早餐') + '</div>' +

      (h.pros.length ? '<ul class="hc-pros">' + h.pros.map(function (x) { return '<li>' + rich(x) + '</li>'; }).join('') + '</ul>' : '') +
      (h.cons.length ? '<ul class="hc-cons">' + h.cons.map(function (x) { return '<li>' + rich(x) + '</li>'; }).join('') + '</ul>' : '') +
      (h.notes ? '<p class="hc-notes">' + rich(h.notes) + '</p>' : '') +
      (h.address ? '<p class="hc-addr">📍 ' + esc(h.address) + '</p>' : '') +

      '<div class="hc-acts">' +
        '<button class="btn btn-sm' + (chosen ? '' : ' btn-primary') + '" data-act="hc-pick" data-uid="' + esc(h.uid) + '">' +
          (chosen ? '✓ 已經揀咗' : '揀呢間') + '</button>' +
        '<button class="btn btn-sm" data-act="hc-edit" data-uid="' + esc(h.uid) + '">✏️ 改</button>' +
        '<button class="btn btn-sm btn-danger" data-act="hc-del" data-uid="' + esc(h.uid) +
          '" aria-label="刪除 ' + esc(h.name || '呢間') + '">🗑</button>' +
      '</div>' +
    '</article>';
  }

  /* A hotel counts as chosen when the trip's own hotel has its name. */
  function isChosen(trip, h) {
    var n = String(h.name || '').trim().toLowerCase();
    return !!n && trip.hotels.some(function (x) { return String(x.name || '').trim().toLowerCase() === n; });
  }

  function viewHTML(trip) {
    var list = trip.compare;
    var best = winners(trip, list);
    var placed = list.filter(function (h) { return h.lat != null && h.lng != null; });

    var intro = '<div class="card hc-add">' +
      '<h2>🏨 加酒店入嚟比較</h2>' +
      '<p class="tinynote" style="margin-top:0">貼上酒店連結（Booking.com、Expedia、Agoda、Airbnb… 一行一條），' +
        '然後 copy 提示俾識上網嘅 AI（ChatGPT、Claude、Gemini），佢會打開每條連結搵價錢同評語。' +
        '訂房網站唔畀其他網站直接讀佢哋嘅頁面，所以要經 AI 呢一步。</p>' +
      '<textarea id="hc-links" class="jsonarea" rows="4" placeholder="https://www.booking.com/hotel/…&#10;https://www.expedia.com/…"></textarea>' +
      '<div class="pasterow">' +
        '<button class="btn btn-primary" data-act="hc-prompt">📋 copy 提示俾 AI</button>' +
        '<button class="btn" data-act="hc-manual">＋ 自己填</button>' +
      '</div>' +
      '<details class="hc-paste"' + (list.length ? '' : ' open') + '><summary>貼返 AI 嘅回覆</summary>' +
        '<textarea id="hc-reply" class="jsonarea" rows="6" placeholder="將 AI 俾你嗰段 JSON 貼喺度…"></textarea>' +
        '<div class="jsonerr" id="hc-err" hidden></div>' +
        '<div class="pasterow"><button class="btn btn-primary" data-act="hc-import">匯入</button></div>' +
      '</details>' +
    '</div>';

    var cards = list.length
      ? '<div class="hc-grid">' + list.map(function (h, i) {
          return cardHTML(trip, h, i, best, isChosen(trip, h));
        }).join('') + '</div>'
      : '';

    var map = placed.length
      ? '<div class="card hc-mapcard"><h2>📍 位置對比</h2>' +
          '<div id="hc-map" class="daymap"></div>' +
          '<p class="maphint">字母係酒店，細點係你行程入面嘅景點。</p></div>'
      : '';

    return '<div class="subview" data-sub="hotels"><div class="wrap">' +
      '<div class="backbar"><button class="backbtn" data-act="home"><span class="ar">‹</span> 首頁</button>' +
        '<span class="sp"></span><span class="bt">🏨 酒店比較</span></div>' +
      (list.length ? cards + map : '') + intro +
      '</div></div>';
  }

  function statusCardHTML(trip) {
    var n = trip.compare.length;
    var chosen = trip.compare.filter(function (h) { return isChosen(trip, h); })[0];
    return '<button class="dcard hccard" data-act="hotels">' +
      '<div class="num" aria-hidden="true"><b>🏨</b><small>' + (n || '') + '</small></div>' +
      '<div class="txt"><div class="d">住邊度</div><div class="t">酒店比較</div>' +
      '<div class="s">' + (chosen ? '揀咗 ' + esc(chosen.name)
        : n ? n + ' 間比較緊' : '貼幾條酒店連結，並排比較價錢、評分、位置') + '</div></div>' +
      '<div class="arrow" aria-hidden="true">›</div></button>';
  }

  function editSheetHTML(h) {
    h = h || { pros: [], cons: [], ratingScale: 10 };
    function f(label, id, val, attrs) {
      return '<div class="f"><label for="' + id + '">' + label + '</label>' +
        '<input id="' + id + '" value="' + esc(val == null ? '' : String(val)) + '" ' + (attrs || 'type="text"') + '></div>';
    }
    function tri(label, id, v) {
      return '<div class="f"><label for="' + id + '">' + label + '</label><select id="' + id + '">' +
        '<option value=""' + (v == null ? ' selected' : '') + '>唔清楚</option>' +
        '<option value="1"' + (v === true ? ' selected' : '') + '>有</option>' +
        '<option value="0"' + (v === false ? ' selected' : '') + '>冇</option></select></div>';
    }
    return '<div class="sheet" id="hc-sheet" aria-labelledby="hc-sheet-h"><div class="sheet-in">' +
      '<div class="sheet-head"><h2 id="hc-sheet-h">' + (h.uid ? '✏️ 改酒店資料' : '＋ 加一間酒店') + '</h2>' +
        '<button class="iconbtn" data-hc="close" aria-label="閂">✕</button></div>' +
      f('酒店名', 'hc-name', h.name) +
      f('連結', 'hc-url', h.url, 'type="url" placeholder="https://…"') +
      '<div class="frow">' +
        f('每晚', 'hc-pn', h.pricePerNight, 'type="text" inputmode="decimal"') +
        f('總價', 'hc-total', h.total, 'type="text" inputmode="decimal"') +
        f('貨幣', 'hc-cur', h.currency, 'type="text" maxlength="3" placeholder="EUR"') +
      '</div>' +
      '<div class="frow">' +
        f('評分', 'hc-rating', h.rating, 'type="text" inputmode="decimal"') +
        '<div class="f"><label for="hc-scale">滿分</label><select id="hc-scale">' +
          '<option value="10"' + (h.ratingScale !== 5 ? ' selected' : '') + '>10</option>' +
          '<option value="5"' + (h.ratingScale === 5 ? ' selected' : '') + '>5</option></select></div>' +
        f('評語數目', 'hc-reviews', h.reviews, 'type="text" inputmode="numeric"') +
      '</div>' +
      f('地址', 'hc-addr', h.address) +
      f('地圖連結或者座標 <span class="opt">（有就計到離景點幾遠）</span>', 'hc-loc',
        h.lat != null && h.lng != null ? h.lat + ', ' + h.lng : '',
        'type="text" placeholder="Google Maps 連結，或者 36.72, -4.42"') +
      '<div class="frow">' + tri('免費取消', 'hc-fc', h.freeCancel) + tri('早餐', 'hc-bf', h.breakfast) + '</div>' +
      '<div class="f"><label for="hc-pros">優點 <span class="opt">（一行一點）</span></label>' +
        '<textarea id="hc-pros" rows="3">' + esc(h.pros.join('\n')) + '</textarea></div>' +
      '<div class="f"><label for="hc-cons">缺點 <span class="opt">（一行一點）</span></label>' +
        '<textarea id="hc-cons" rows="3">' + esc(h.cons.join('\n')) + '</textarea></div>' +
      '<div class="f"><label for="hc-notes">備註</label><textarea id="hc-notes" rows="2">' + esc(h.notes || '') + '</textarea></div>' +
      '<div class="jsonerr" id="hc-sheet-err" hidden></div>' +
      '<div class="sheet-foot"><button class="btn" data-hc="close">取消</button>' +
        '<button class="btn btn-primary" data-hc="save">儲存</button></div>' +
      '</div></div>';
  }

  /* Read the sheet back into a row. Throws with something worth showing. */
  function readSheet(base) {
    function v(id) { return (document.getElementById(id).value || '').trim(); }
    function n(id) {
      var raw = v(id).replace(/[^0-9.]/g, '');
      if (!raw) return null;
      var x = Number(raw);
      return isFinite(x) ? x : null;
    }
    function tri(id) { var x = v(id); return x === '' ? null : x === '1'; }
    function lines(id) { return v(id).split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean); }

    var name = v('hc-name'), url = v('hc-url');
    if (!name && !url) throw new Error('至少填個名或者連結');

    var lat = null, lng = null, loc = v('hc-loc');
    if (loc) {
      try { var p = MapLink.parse(loc); lat = p.lat; lng = p.lng; }
      catch (e) { throw new Error('地圖連結：' + e.message); }
    }

    var row = {};
    if (base) Object.keys(base).forEach(function (k) { row[k] = base[k]; });
    row.name = name || nameFromUrl(url);
    row.url = url;
    row.platform = url ? (base && base.url === url && base.platform) || platformOf(url) : '';
    row.pricePerNight = n('hc-pn');
    row.total = n('hc-total');
    row.currency = v('hc-cur').toUpperCase().slice(0, 3);
    row.rating = n('hc-rating');
    row.ratingScale = Number(v('hc-scale')) || 10;
    row.reviews = n('hc-reviews');
    row.address = v('hc-addr');
    row.lat = lat; row.lng = lng;
    row.freeCancel = tri('hc-fc');
    row.breakfast = tri('hc-bf');
    row.pros = lines('hc-pros');
    row.cons = lines('hc-cons');
    row.notes = v('hc-notes');
    return row;
  }

  /* The pins for the comparison map: hotels lettered, stops as dots. */
  function mapPoints(trip) {
    var pts = [];
    trip.compare.forEach(function (h, i) {
      if (h.lat == null || h.lng == null) return;
      pts.push({ kind: 'hotel', label: LETTERS.charAt(i % 26), name: h.name, lat: h.lat, lng: h.lng });
    });
    placedStops(trip).forEach(function (s) {
      pts.push({ kind: 'stop', label: '', name: U.plain(s.mapLabel || s.title), lat: s.lat, lng: s.lng });
    });
    return pts;
  }

  global.Hotels = {
    platformOf: platformOf, nameFromUrl: nameFromUrl, linksIn: linksIn,
    prompt: prompt, parse: parse, merge: merge, reach: reach, winners: winners,
    viewHTML: viewHTML, statusCardHTML: statusCardHTML,
    editSheetHTML: editSheetHTML, readSheet: readSheet, mapPoints: mapPoints, isChosen: isChosen
  };
})(window);
