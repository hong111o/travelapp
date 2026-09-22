/* 行程本 · trip data model
 *
 * One trip = one JSON object. Everything the itinerary shows comes from
 * here, so adding a trip never means touching markup or code.
 *
 *   {
 *     schema, id, title, kicker, subtitle,
 *     startDate, endDate,                  // "YYYY-MM-DD"
 *     place:    { name, lat, lng },        // drives weather + sunset
 *     currency: { base, quote },           // drives the FX converter
 *     departure:{ datetime, utcOffset, note },  // drives the countdown
 *     infoCards:[ { icon, title, mapQuery, rows:[{k,v,sub}] } ],
 *     todos:    [ { level:'now'|'soon'|'day', text } ],
 *     links:    [ { icon, label, url } ],
 *     days:     [ { id, title, date, theme, drawRoute, mapNote,
 *                   stops:[{ uid, time, title, star, desc, note, backup, pin,
 *                            mapQuery, mapLabel, lat, lng }] } ],
 *     food:     { quick:[{when,name,star,note}], picks:[{uid,icon,title,desc,mapQuery}], legend },
 *     progress: { "<uid>": "<ISO timestamp>" },      // visited marks
 *     journal:  { "<uid>": {note, at} },            // notes written on the day
 *     notes
 *   }
 *
 * Every field is optional. A section with no content simply isn't rendered,
 * so a bare-bones trip (title + a couple of days) works fine.
 */
(function (global) {
  'use strict';

  var SCHEMA = 1;

  function str(v) { return v == null ? '' : String(v); }
  function num(v) {
    if (v === '' || v == null) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function arr(v) { return Array.isArray(v) ? v : []; }

  function blankStop() {
    return { uid: U.uid('s'), time: '', title: '', star: false, desc: '', note: '', backup: '', pin: '', mapQuery: '', mapLabel: '', lat: null, lng: null };
  }

  function blankDay(index, startDate) {
    return {
      id: 'd' + (index + 1),
      title: '',
      date: startDate ? U.addDays(startDate, index) : '',
      theme: '',
      drawRoute: true,
      mapNote: '',
      stops: [blankStop()]
    };
  }

  function blankTrip() {
    var today = U.todayISO();
    return {
      schema: SCHEMA,
      id: U.uid('trip'),
      title: '',
      kicker: '',
      subtitle: '',
      startDate: today,
      endDate: today,
      place: { name: '', lat: null, lng: null },
      currency: { base: '', quote: '' },
      departure: { datetime: '', utcOffset: '', note: '' },
      infoCards: [],
      todos: [],
      links: [],
      days: [blankDay(0, today)],
      food: { quick: [], picks: [], legend: '' },
      progress: {},
      journal: {},
      notes: '',
      updatedAt: new Date().toISOString()
    };
  }

  /* Coerce anything trip-shaped into the canonical form. Runs on load,
     on import and before save, so hand-edited JSON and older files still
     render instead of throwing. */
  function normalize(raw) {
    var t = (raw && typeof raw === 'object') ? raw : {};
    var out = {
      schema: SCHEMA,
      id: str(t.id) || U.uid('trip'),
      title: str(t.title),
      kicker: str(t.kicker),
      subtitle: str(t.subtitle),
      startDate: str(t.startDate),
      endDate: str(t.endDate),
      place: {
        name: str(t.place && t.place.name),
        lat: num(t.place && t.place.lat),
        lng: num(t.place && t.place.lng)
      },
      currency: {
        base: str(t.currency && t.currency.base).toUpperCase(),
        quote: str(t.currency && t.currency.quote).toUpperCase()
      },
      departure: {
        datetime: str(t.departure && t.departure.datetime),
        utcOffset: str(t.departure && t.departure.utcOffset),
        note: str(t.departure && t.departure.note)
      },
      infoCards: arr(t.infoCards).map(function (c) {
        return {
          icon: str(c && c.icon),
          title: str(c && c.title),
          mapQuery: str(c && c.mapQuery),
          rows: arr(c && c.rows).map(function (r) {
            return { k: str(r && r.k), v: str(r && r.v), sub: str(r && r.sub) };
          })
        };
      }),
      todos: arr(t.todos).map(function (d) {
        var lvl = str(d && d.level);
        return {
          level: (lvl === 'now' || lvl === 'soon' || lvl === 'day') ? lvl : 'soon',
          text: str(d && d.text)
        };
      }),
      links: arr(t.links).map(function (l) {
        return { icon: str(l && l.icon), label: str(l && l.label), url: str(l && l.url) };
      }),
      days: arr(t.days).map(function (d, i) {
        d = d || {};
        return {
          id: str(d.id) || ('d' + (i + 1)),
          title: str(d.title),
          date: str(d.date),
          theme: str(d.theme),
          drawRoute: d.drawRoute !== false,
          mapNote: str(d.mapNote),
          stops: arr(d.stops).map(function (s) {
            s = s || {};
            return {
              uid: str(s.uid) || U.uid('s'),
              time: str(s.time),
              title: str(s.title),
              star: !!s.star,
              desc: str(s.desc),
              note: str(s.note),
              backup: str(s.backup),
              pin: str(s.pin),
              mapQuery: str(s.mapQuery),
              mapLabel: str(s.mapLabel),
              lat: num(s.lat),
              lng: num(s.lng)
            };
          })
        };
      }),
      food: {
        quick: arr(t.food && t.food.quick).map(function (q) {
          return { when: str(q && q.when), name: str(q && q.name), star: !!(q && q.star), note: str(q && q.note) };
        }),
        picks: arr(t.food && t.food.picks).map(function (p) {
          return {
            uid: str(p && p.uid) || U.uid('p'),
            icon: str(p && p.icon), title: str(p && p.title),
            desc: str(p && p.desc), mapQuery: str(p && p.mapQuery)
          };
        }),
        legend: str(t.food && t.food.legend)
      },
      progress: {},
      journal: {},
      notes: str(t.notes),
      updatedAt: str(t.updatedAt) || new Date().toISOString()
    };

    /* Day ids must be unique — they're used as view keys and map container ids. */
    var seen = {};
    out.days.forEach(function (d, i) {
      if (!d.id || seen[d.id]) d.id = 'd' + (i + 1) + '-' + i;
      seen[d.id] = true;
    });

    /* Stop and pick uids must be unique too: they key the visited record,
       so a duplicate would tick two places at once. Duplicates can only
       come from a hand-edited or duplicated file. */
    var uids = {};
    function claim(item, prefix) {
      if (!item.uid || uids[item.uid]) item.uid = U.uid(prefix);
      uids[item.uid] = true;
    }
    out.days.forEach(function (d) {
      d.stops.forEach(function (s) { claim(s, 's'); });
    });
    out.food.picks.forEach(function (p) { claim(p, 'p'); });

    /* Carry over only the ticks that still point at something. Editing a
       trip can delete stops; their marks would otherwise pile up forever. */
    var incoming = (t.progress && typeof t.progress === 'object') ? t.progress : {};
    Object.keys(incoming).forEach(function (uid) {
      if (uids[uid]) out.progress[uid] = str(incoming[uid]);
    });

    /* Same for the notes you write on the day. */
    var notes = (t.journal && typeof t.journal === 'object') ? t.journal : {};
    Object.keys(notes).forEach(function (uid) {
      if (!uids[uid]) return;
      var raw = notes[uid];
      /* Accept a bare string as well as {note, at}. Reading .at off a
         string would pick up String.prototype.at, so only an object has
         a timestamp to read. */
      var isObj = raw !== null && typeof raw === 'object';
      var text = str(isObj ? raw.note : raw).trim();
      if (text) out.journal[uid] = { note: text, at: isObj ? str(raw.at) : '' };
    });

    if (!out.startDate && out.days.length) out.startDate = out.days[0].date;
    if (!out.endDate && out.days.length) out.endDate = out.days[out.days.length - 1].date;

    return out;
  }

  /* Reject files that clearly aren't trips, so a stray .json import
     doesn't silently create an empty entry. */
  function looksLikeTrip(o) {
    return !!o && typeof o === 'object' && !Array.isArray(o) &&
      (typeof o.title === 'string' || Array.isArray(o.days));
  }

  global.Schema = {
    SCHEMA: SCHEMA,
    blankTrip: blankTrip,
    blankDay: blankDay,
    blankStop: blankStop,
    normalize: normalize,
    looksLikeTrip: looksLikeTrip
  };
})(window);
