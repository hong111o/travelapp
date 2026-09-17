/* 行程本 · live widgets
 *
 * Weather, sunset, FX and the countdown used to be hardcoded to Málaga.
 * Each one now takes its configuration from the trip, and hides itself
 * when the trip doesn't supply what it needs.
 */
(function (global) {
  'use strict';

  var timers = [];

  /* Called on every view change so a previous trip's countdown doesn't
     keep ticking into a detached DOM node. */
  function stopAll() {
    timers.forEach(clearInterval);
    timers = [];
  }

  /* --- weather + sunset (Open-Meteo, no API key) --------------- */

  function wxIcon(code) {
    if (code === 0) return ['☀️', '晴'];
    if (code <= 2) return ['🌤️', '部分多雲'];
    if (code === 3) return ['☁️', '多雲'];
    if (code === 45 || code === 48) return ['🌫️', '有霧'];
    if (code >= 51 && code <= 57) return ['🌦️', '毛毛雨'];
    if (code >= 61 && code <= 67) return ['🌧️', '有雨'];
    if (code >= 71 && code <= 77) return ['❄️', '落雪'];
    if (code >= 80 && code <= 82) return ['🌦️', '驟雨'];
    if (code >= 95) return ['⛈️', '雷雨'];
    return ['🌡️', ''];
  }

  function loadWeather(place) {
    var body = U.el('wx-body'), sb = U.el('sun-body');
    if (!body || place.lat == null || place.lng == null) return;

    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + encodeURIComponent(place.lat) +
      '&longitude=' + encodeURIComponent(place.lng) +
      '&current=temperature_2m,weather_code' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset' +
      '&timezone=auto&forecast_days=2';

    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error('weather ' + r.status); return r.json(); })
      .then(function (j) {
        if (!j || !j.daily || !j.daily.temperature_2m_max) throw new Error('weather: unexpected shape');
        var d = j.daily;
        var now = j.current ? Math.round(j.current.temperature_2m) : null;
        var t0 = wxIcon(d.weather_code[0]), t1 = wxIcon(d.weather_code[1]);
        var hi0 = Math.round(d.temperature_2m_max[0]), lo0 = Math.round(d.temperature_2m_min[0]);
        var upd = new Date().toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' });

        var html = '<div class="wxmini"><span class="dd">今日</span><span class="ic">' + t0[0] +
          '</span><b>' + hi0 + '°</b><small>/' + lo0 + '°' +
          (now == null ? '' : ' · 現' + now + '°') + '</small></div>';
        if (d.temperature_2m_max.length > 1) {
          var hi1 = Math.round(d.temperature_2m_max[1]), lo1 = Math.round(d.temperature_2m_min[1]);
          html += '<div class="wxmini"><span class="dd">聽日</span><span class="ic">' + t1[0] +
            '</span><b>' + hi1 + '°</b><small>/' + lo1 + '°</small></div>';
        }
        html += '<div class="wx-upd">更新 ' + upd + '</div>';
        body.innerHTML = html;

        if (sb && d.sunset && d.sunset.length) {
          var s = '<div class="wxmini"><span class="dd">今日</span><b>' + d.sunset[0].slice(11, 16) + '</b></div>';
          if (d.sunset.length > 1) {
            s += '<div class="wxmini"><span class="dd">聽日</span><b>' + d.sunset[1].slice(11, 16) + '</b></div>';
          }
          sb.innerHTML = s;
        }
      })
      .catch(function (err) {
        console.warn('[weather]', err);
        body.innerHTML = '<span style="font-size:.85rem">需上網先更新</span>';
        if (sb) sb.innerHTML = '<span style="font-size:.85rem">需上網先更新</span>';
      });
  }

  /* --- FX converter ------------------------------------------- */

  function loadFX(cur) {
    var rateEl = U.el('fx-rate'), updEl = U.el('fx-upd');
    var a = U.el('fx-a'), b = U.el('fx-b');
    if (!a || !b || !cur.base || !cur.quote) return;

    var rate = null;

    function calc(from) {
      if (rate == null) return;
      if (from === 'a') {
        var v = parseFloat(a.value);
        b.value = isNaN(v) ? '' : (v * rate).toFixed(2);
      } else {
        var w = parseFloat(b.value);
        a.value = isNaN(w) ? '' : (w / rate).toFixed(2);
      }
    }

    function apply(r, dateStr) {
      rate = r;
      if (rateEl) rateEl.textContent = '1 ' + cur.base + ' ≈ ' + rate.toFixed(4) + ' ' + cur.quote;
      if (updEl) updEl.textContent = '參考匯率' + (dateStr ? '（' + dateStr + '）' : '');
      calc('a');
    }

    a.addEventListener('input', function () { calc('a'); });
    b.addEventListener('input', function () { calc('b'); });

    var lo = cur.base.toLowerCase(), qlo = cur.quote.toLowerCase();
    fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/' + lo + '.json')
      .then(function (r) { if (!r.ok) throw new Error('fx ' + r.status); return r.json(); })
      .then(function (j) {
        var v = j && j[lo] && j[lo][qlo];
        if (typeof v !== 'number') throw new Error('fx: no ' + qlo);
        apply(v, j.date);
      })
      .catch(function () {
        /* Secondary source, different vendor — one of the two is
           usually reachable even on flaky hotel wifi. */
        return fetch('https://open.er-api.com/v6/latest/' + cur.base)
          .then(function (r) { return r.json(); })
          .then(function (j) {
            var v = j && j.rates && j.rates[cur.quote];
            if (typeof v !== 'number') throw new Error('fx fallback: no ' + cur.quote);
            apply(v, String(j.time_last_update_utc || '').slice(0, 16));
          });
      })
      .catch(function (err) {
        console.warn('[fx]', err);
        if (rateEl) rateEl.textContent = '需上網更新';
      });
  }

  /* --- countdown ----------------------------------------------- */

  /* "2027-04-10T07:30" + "+01:00" -> epoch ms. A blank offset means the
     viewer's own clock, which is what you want when you're departing
     from where you live. */
  function departureMs(dep) {
    if (!dep || !dep.datetime) return null;
    var s = String(dep.datetime).trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s);
    if (!m) return null;
    var off = String(dep.utcOffset || '').trim();
    if (off) {
      var om = /^([+-])(\d{2}):?(\d{2})$/.exec(off);
      if (om) {
        var mins = (+om[2]) * 60 + (+om[3]);
        if (om[1] === '-') mins = -mins;
        return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - mins * 60000;
      }
    }
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  }

  function startCountdown(dep) {
    var elm = U.el('countdown');
    var target = departureMs(dep);
    if (!elm || target == null) return;

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    function tick() {
      if (!document.body.contains(elm)) return;
      var diff = target - Date.now();
      if (diff <= 0) { elm.textContent = '出發喇 ✈️'; return; }
      var d = Math.floor(diff / 86400000);
      var h = Math.floor(diff % 86400000 / 3600000);
      var mi = Math.floor(diff % 3600000 / 60000);
      var s = Math.floor(diff % 60000 / 1000);
      elm.innerHTML = d + '<u>DAY</u> ' + pad(h) + '<u>HR</u> ' + pad(mi) + '<u>MIN</u> ' + pad(s) + '<u>SEC</u>';
    }

    tick();
    timers.push(setInterval(tick, 1000));
  }

  /* --- day maps ------------------------------------------------ */

  var maps = {};

  function resetMaps() {
    Object.keys(maps).forEach(function (k) {
      try { maps[k].map.remove(); } catch (e) { /* already gone */ }
    });
    maps = {};
  }

  /* Only stops that carry coordinates get a pin; the numbers match the
     legend under the map, not the stop's position in the day. The label
     is plain text — a legend is too cramped for the stop's full title,
     so mapLabel wins when it's set. */
  function pointsFor(day) {
    var pts = [];
    (day.stops || []).forEach(function (s) {
      if (s.lat == null || s.lng == null) return;
      pts.push({
        n: pts.length + 1,
        name: U.plain(s.mapLabel || s.title || s.mapQuery || ''),
        lat: s.lat,
        lng: s.lng
      });
    });
    return pts;
  }

  function build(day) {
    var pts = pointsFor(day);
    var container = U.el('map-' + day.id);
    if (!container || !pts.length || typeof L === 'undefined') return;

    var map = L.map('map-' + day.id, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap'
    }).addTo(map);

    var latlngs = [];
    pts.forEach(function (p) {
      var icon = L.divIcon({ className: 'nmk', html: '<span>' + p.n + '</span>', iconSize: [26, 26], iconAnchor: [13, 13] });
      L.marker([p.lat, p.lng], { icon: icon }).addTo(map)
        .bindPopup('<b>' + p.n + '.</b> ' + U.esc(p.name));
      latlngs.push([p.lat, p.lng]);
    });

    if (day.drawRoute && latlngs.length > 1) {
      L.polyline(latlngs, { color: '#E4952B', weight: 3, opacity: .85, dashArray: '6 7' }).addTo(map);
    }

    if (latlngs.length === 1) map.setView(latlngs[0], 15);
    else map.fitBounds(latlngs, { padding: [34, 34] });

    maps[day.id] = { map: map, bounds: latlngs };
  }

  /* Leaflet mis-measures a container that was display:none when it was
     created, so re-fit after the view is actually visible. */
  function ensureMap(day) {
    if (!maps[day.id]) build(day);
    var m = maps[day.id];
    if (!m) return;
    [30, 120].forEach(function (delay) {
      setTimeout(function () {
        if (!maps[day.id]) return;
        m.map.invalidateSize();
        if (m.bounds.length === 1) m.map.setView(m.bounds[0], 15);
        else m.map.fitBounds(m.bounds, { padding: [34, 34] });
      }, delay);
    });
  }

  global.Widgets = {
    stopAll: stopAll, resetMaps: resetMaps,
    loadWeather: loadWeather, loadFX: loadFX,
    startCountdown: startCountdown, departureMs: departureMs,
    ensureMap: ensureMap, pointsFor: pointsFor
  };
})(window);
