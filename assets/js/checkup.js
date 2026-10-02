/* 行程本 · 行程體檢
 *
 * Reads a finished plan and reports what looks wrong, before you are
 * standing in the street finding out. Everything here comes from data the
 * trip already carries — no network, works offline.
 *
 * The findings worth the most are the ones a person cannot eyeball: a
 * coordinate in the wrong country still renders a perfectly normal-looking
 * row, and a twenty-minute gap across three kilometres looks fine until
 * you try to walk it.
 */
(function (global) {
  'use strict';

  /* A stop this far from everything else in the trip is almost certainly a
     bad coordinate rather than a real excursion. Generous on purpose:
     Málaga to Nerja is 49km, and a two-city trip can be 300km apart, so
     the test is "isolated from every other point", not "far from the
     centre". */
  var LONELY_METRES = 200000;

  function placeName(s) { return U.plain(s.mapLabel || s.title || '') || '（未命名）'; }

  function anchors(trip) {
    var pts = [];
    if (trip.place && trip.place.lat != null && trip.place.lng != null) {
      pts.push({ lat: trip.place.lat, lng: trip.place.lng });
    }
    trip.days.forEach(function (d) {
      d.stops.forEach(function (s) {
        if (s.lat != null && s.lng != null) pts.push({ lat: s.lat, lng: s.lng });
      });
    });
    return pts;
  }

  /* --- individual checks --------------------------------------- */

  function checkCoordinates(trip, out, suspect) {
    var pts = anchors(trip);

    trip.days.forEach(function (day, di) {
      day.stops.forEach(function (s) {
        /* Clearly meant to be a place — it has something to navigate to —
           but nothing to draw. */
        if (s.mapQuery && (s.lat == null || s.lng == null)) {
          out.push({
            level: 'info', icon: '📍',
            text: placeName(s) + ' 冇座標',
            sub: 'Day ' + (di + 1) + ' · 唔會出現喺地圖，但導航掣照用得',
            goTo: day.id, uid: s.uid
          });
          return;
        }
        if (s.lat == null || s.lng == null) return;

        /* Distance to the nearest *other* point in the trip. An invented
           coordinate has nothing near it. */
        var nearest = null;
        for (var i = 0; i < pts.length; i++) {
          var p = pts[i];
          if (p.lat === s.lat && p.lng === s.lng) continue;
          var m = U.metresBetween(s, p);
          if (m == null) continue;
          if (nearest == null || m < nearest) nearest = m;
        }
        if (nearest != null && nearest > LONELY_METRES) {
          suspect[s.uid] = true;
          out.push({
            level: 'bad', icon: '🌍',
            text: placeName(s) + ' 離行程其他地方 ' + U.distanceText(nearest),
            sub: 'Day ' + (di + 1) + ' · 座標好可能係錯嘅，撳 🧭 對一對',
            goTo: day.id, uid: s.uid
          });
        }
      });
    });
  }

  function checkTimes(trip, out) {
    trip.days.forEach(function (day, di) {
      var timed = [];
      day.stops.forEach(function (s) {
        var m = U.stopMinutes(s.time);
        if (m != null) timed.push({ m: m, s: s });
      });

      for (var i = 1; i < timed.length; i++) {
        if (timed[i].m < timed[i - 1].m) {
          out.push({
            level: 'warn', icon: '⏰',
            text: 'Day ' + (di + 1) + ' 時間倒轉',
            sub: timed[i - 1].s.time + ' ' + placeName(timed[i - 1].s) +
                 ' 之後係 ' + timed[i].s.time + ' ' + placeName(timed[i].s),
            goTo: day.id, uid: timed[i].s.uid
          });
        } else if (timed[i].m === timed[i - 1].m) {
          out.push({
            level: 'warn', icon: '⏰',
            text: 'Day ' + (di + 1) + ' 兩個點都係 ' + timed[i].s.time,
            sub: placeName(timed[i - 1].s) + ' 同 ' + placeName(timed[i].s),
            goTo: day.id, uid: timed[i].s.uid
          });
        }
      }
    });
  }

  function checkWalks(trip, out, suspect) {
    trip.days.forEach(function (day, di) {
      var seq = [];
      day.stops.forEach(function (s) {
        var m = U.stopMinutes(s.time);
        /* A stop whose coordinate is already suspect would produce an
           absurd walk ("~4700 minutes") that is the same fault reported
           twice. One root cause, one finding. */
        if (m != null && s.lat != null && s.lng != null && !suspect[s.uid]) {
          seq.push({ m: m, s: s });
        }
      });

      for (var i = 1; i < seq.length; i++) {
        var gap = seq[i].m - seq[i - 1].m;
        if (gap <= 0) continue;                 /* already reported by checkTimes */
        var metres = U.metresBetween(seq[i - 1].s, seq[i].s);
        var walk = U.walkMinutes(metres);
        if (walk == null || walk <= gap) continue;

        /* Over this distance nobody was going to walk anyway, so the
           complaint is about transport time, not pace. */
        var far = metres > 2500;
        out.push({
          level: 'warn', icon: far ? '🚕' : '🚶',
          text: placeName(seq[i - 1].s) + ' → ' + placeName(seq[i].s) +
                ' 得 ' + gap + ' 分鐘',
          sub: 'Day ' + (di + 1) + ' · 相距 ' + U.distanceText(metres) +
               (far ? '，行路要 ~' + walk + ' 分鐘，要搭車' : '，行路要 ~' + walk + ' 分鐘'),
          goTo: day.id, uid: seq[i].s.uid
        });
      }
    });
  }

  function checkStructure(trip, out) {
    trip.days.forEach(function (day, di) {
      var real = day.stops.filter(function (s) { return s.title; });
      if (!real.length) {
        out.push({
          level: 'warn', icon: '📅',
          text: 'Day ' + (di + 1) + ' 冇任何行程點',
          sub: day.date ? U.dateRangeZH(day.date, day.date) : '仲未填',
          goTo: day.id, uid: null
        });
      }
      if (!day.date) {
        out.push({
          level: 'info', icon: '📅',
          text: 'Day ' + (di + 1) + ' 冇日期',
          sub: '冇日期就唔會有「今日」提示',
          goTo: day.id, uid: null
        });
      }
    });

    var now = trip.todos.filter(function (t) { return t.level === 'now' && t.text; });
    if (now.length) {
      out.push({
        level: 'warn', icon: '📌',
        text: '仲有 ' + now.length + ' 樣「而家」要訂嘅嘢',
        sub: U.plain(now[0].text).slice(0, 28) + (now.length > 1 ? ' …' : ''),
        goTo: 'home', uid: null
      });
    }

    if (trip.place.lat == null || trip.place.lng == null) {
      out.push({
        level: 'info', icon: '🌤️',
        text: '冇填城市座標',
        sub: '填咗先會有天氣同日落',
        goTo: 'home', uid: null
      });
    }
    if (!trip.departure.datetime) {
      out.push({
        level: 'info', icon: '⏱️',
        text: '冇填出發時間',
        sub: '填咗先會有倒數',
        goTo: 'home', uid: null
      });
    }
  }

  /* --- entry point ---------------------------------------------- */

  var ORDER = { bad: 0, warn: 1, info: 2 };

  function run(trip) {
    var out = [];
    var suspect = {};
    checkCoordinates(trip, out, suspect);
    checkTimes(trip, out);
    checkWalks(trip, out, suspect);
    checkStructure(trip, out);
    out.sort(function (a, b) { return ORDER[a.level] - ORDER[b.level]; });
    return out;
  }

  function counts(findings) {
    return {
      bad: findings.filter(function (f) { return f.level === 'bad'; }).length,
      warn: findings.filter(function (f) { return f.level === 'warn'; }).length,
      info: findings.filter(function (f) { return f.level === 'info'; }).length,
      total: findings.length
    };
  }

  global.Checkup = { run: run, counts: counts, LONELY_METRES: LONELY_METRES };
})(window);
