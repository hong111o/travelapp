/* 行程本 · look up the coordinates we are missing
 *
 * A stop with a mapQuery but no lat/lng is not really missing anything —
 * the place is findable, the navigation button works. It just cannot be
 * drawn on the day map. Asking someone to copy 21 coordinates by hand for
 * places that are all on Google Maps is the app being lazy, so it looks
 * them up itself.
 *
 * Uses Nominatim (OpenStreetMap's own geocoder): free, no key, CORS open.
 * Their usage policy asks for at most one request a second and no bulk
 * work, so lookups are serialised with a gap and only ever run when you
 * press the button. Results are written into the trip, so a place is
 * never looked up twice.
 */
(function (global) {
  'use strict';

  var ENDPOINT = 'https://nominatim.openstreetmap.org/search';
  var GAP_MS = 1100;          /* one a second, with room to spare */
  var MAX_PER_RUN = 60;

  function wait(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  /* A bare restaurant name matches a hundred towns, so the trip's city is
     appended when the query does not already name it. */
  function queryFor(stop, trip) {
    var q = (stop.mapQuery || stop.title || '').trim();
    var city = (trip.place && trip.place.name) || '';
    if (!q) return '';
    if (city && q.toLowerCase().indexOf(city.toLowerCase()) === -1) {
      /* The city name may be in Chinese while the place is not; send both
         only when it looks like it would help. */
      return q + ', ' + city;
    }
    return q;
  }

  function lookup(query, near) {
    var url = ENDPOINT + '?format=jsonv2&limit=1&q=' + encodeURIComponent(query);
    /* A viewbox biases results towards the trip without excluding a
       genuine day trip an hour down the coast. */
    if (near && near.lat != null && near.lng != null) {
      var d = 1.5;
      url += '&viewbox=' + (near.lng - d) + ',' + (near.lat + d) + ',' +
             (near.lng + d) + ',' + (near.lat - d);
    }
    return fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('搵座標服務回應 ' + r.status);
        return r.json();
      })
      .then(function (list) {
        if (!list || !list.length) return null;
        var hit = list[0];
        var lat = parseFloat(hit.lat), lng = parseFloat(hit.lon);
        if (!isFinite(lat) || !isFinite(lng)) return null;
        return { lat: lat, lng: lng, label: hit.display_name || '' };
      });
  }

  /* Every stop worth looking up: named, navigable, and not already placed. */
  function pending(trip) {
    var out = [];
    trip.days.forEach(function (day) {
      day.stops.forEach(function (s) {
        if (s.lat != null && s.lng != null) return;
        if (!s.mapQuery && !s.title) return;
        out.push({ uid: s.uid, dayId: day.id, stop: s, query: queryFor(s, trip) });
      });
    });
    return out.filter(function (x) { return x.query; });
  }

  /* Fills in place and reports as it goes. Returns what it found and what
     it could not, so the caller can say so rather than claim success. */
  function fillTrip(trip, onProgress) {
    var todo = pending(trip).slice(0, MAX_PER_RUN);
    var found = [], missed = [];

    if (!todo.length) return Promise.resolve({ found: found, missed: missed, total: 0 });

    var chain = Promise.resolve();
    todo.forEach(function (item, i) {
      chain = chain.then(function () {
        return lookup(item.query, trip.place).then(function (hit) {
          if (hit) {
            item.stop.lat = hit.lat;
            item.stop.lng = hit.lng;
            found.push({ uid: item.uid, title: item.stop.title, label: hit.label });
          } else {
            missed.push({ uid: item.uid, title: item.stop.title, query: item.query });
          }
        }).catch(function (err) {
          console.warn('[geocode]', item.query, err);
          missed.push({ uid: item.uid, title: item.stop.title, query: item.query });
        }).then(function () {
          if (onProgress) onProgress(i + 1, todo.length, found.length);
          /* No gap after the last one — nothing follows it. */
          return i + 1 < todo.length ? wait(GAP_MS) : null;
        });
      });
    });

    return chain.then(function () {
      return { found: found, missed: missed, total: todo.length };
    });
  }

  function countPending(trip) { return pending(trip).length; }

  global.Geocode = {
    lookup: lookup, fillTrip: fillTrip, countPending: countPending,
    MAX_PER_RUN: MAX_PER_RUN
  };
})(window);
