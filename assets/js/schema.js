/* Travel Marvel · trip data model
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
 *     flights:  [ { when, route, ref, note } ],        // fixed card
 *     hotels:   [ { name, address, dates, cancelBy, ref, note, mapQuery } ],
 *     infoCards:[ { icon, title, mapQuery, rows:[{k,v,sub}] } ],   // free-form
 *     todos:    [ { uid, level:'now'|'soon'|'day', text, done } ],
 *     links:    [ { icon, label, url } ],
 *     days:     [ { id, title, date, theme, drawRoute, mapNote,
 *                   stops:[{ uid, time, title, star, unplanned, desc, note, backup, pin,
 *                            mapQuery, mapLabel, lat, lng }] } ],
 *     food:     { quick:[{when,name,star,note}], picks:[{uid,icon,title,desc,mapQuery}], legend },
 *     progress: { "<uid>": "<ISO timestamp>" },      // visited marks
 *     journal:  { "<uid>": {note, at} },            // notes written on the day
 *     budget:   number | null,                     // in the trip's own currency
 *     spend:    [{uid, at, amount, cat, note, dayId, stopUid}],
 *     bookings: [{uid, at, when, title, ref, note, mapQuery}],
 *     packing:  [{uid, text, done}],
 *     compare:  [{uid, url, name, platform, pricePerNight, total, currency, rating,
 *                 ratingScale, reviews, address, lat, lng, freeCancel, breakfast,
 *                 pros:[], cons:[], notes}],   // hotels being weighed up
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
    return { uid: U.uid('s'), time: '', title: '', star: false, unplanned: false, desc: '', note: '', backup: '', pin: '', mapQuery: '', mapLabel: '', lat: null, lng: null };
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
      flights: [],
      hotels: [],
      infoCards: [],
      todos: [],
      links: [],
      days: [blankDay(0, today)],
      food: { quick: [], picks: [], legend: '' },
      progress: {},
      journal: {},
      bookings: [],
      compare: [],
      packing: [],
      budget: null,
      spend: [],
      notes: '',
      updatedAt: new Date().toISOString()
    };
  }

  /* Coerce anything trip-shaped into the canonical form. Runs on load,
     on import and before save, so hand-edited JSON and older files still
     render instead of throwing. */
  /* --- migration ------------------------------------------------
     Every trip carries the schema version it was written under. Until
     now that number was written and never read, which made it a promise
     the code did not keep: the first time a field changes shape, trips
     saved before the change would be read as if they had the new shape.
     MIGRATIONS[n] upgrades a trip from version n to n + 1, and migrate()
     walks a trip up to the current version before normalize() sees it.
     There is nothing to do yet — that is the point of adding it while it
     is still free. */
  var MIGRATIONS = {
    /* 1: function (t) { ...turn a v1 trip into a v2 one, in place... } */
  };

  function migrate(t) {
    if (!t || typeof t !== 'object') return t;
    /* A trip with no version is one written before versions existed,
       which is version 1 by definition. */
    var from = Number(t.schema);
    if (!isFinite(from) || from < 1) from = 1;

    /* Newer than this build understands: leave it alone rather than
       guess. normalize() keeps the fields it knows and drops the rest,
       so an old app shows a newer trip as best it can instead of
       mangling it. */
    if (from > SCHEMA) return t;

    for (var v = from; v < SCHEMA; v++) {
      var step = MIGRATIONS[v];
      if (!step) continue;
      try {
        step(t);
      } catch (e) {
        console.warn('[schema] migration ' + v + ' → ' + (v + 1) + ' failed', e);
        break;
      }
    }
    return t;
  }

  function normalize(raw) {
    var t = migrate((raw && typeof raw === 'object') ? raw : {});
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
      /* Flights and hotels are fixed fields, not improvised info cards:
         every trip has them, they always render in the same place, and an
         assistant filling the format cannot decide to merge them into
         something called "Transport" or "Booked items". */
      flights: arr(t.flights).map(function (f) {
        return {
          when: str(f && f.when),
          route: str(f && f.route),
          ref: str(f && f.ref),
          note: str(f && f.note)
        };
      }),
      hotels: arr(t.hotels).map(function (h) {
        return {
          name: str(h && h.name),
          address: str(h && h.address),
          dates: str(h && h.dates),
          cancelBy: str(h && h.cancelBy),
          ref: str(h && h.ref),
          note: str(h && h.note),
          mapQuery: str(h && h.mapQuery)
        };
      }),
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
          uid: str(d && d.uid) || U.uid('td'),
          level: (lvl === 'now' || lvl === 'soon' || lvl === 'day') ? lvl : 'soon',
          text: str(d && d.text),
          /* Ticked once it is booked. A record, like a visited mark. */
          done: !!(d && d.done)
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
              /* Walked into on the day rather than planned. Same shape as
                 any other stop, so it gets a map pin, search, ticks and a
                 journal for free — only the badge differs. */
              unplanned: !!s.unplanned,
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
      /* Everything else that is booked. Flights and hotels have their
         own fixed fields; this is the train to the coast, the museum
         slot, the table at 20:00 — which used to be scattered across
         infoCards, todos and stop pins. `at` is optional and only
         needed for the countdown; `when` is what you read. */
      bookings: arr(t.bookings).map(function (b) {
        return {
          uid: str(b && b.uid) || U.uid('bk'),
          at: str(b && b.at),
          when: str(b && b.when),
          title: str(b && b.title),
          ref: str(b && b.ref),
          note: str(b && b.note),
          mapQuery: str(b && b.mapQuery)
        };
      }).filter(function (b) { return b.title || b.when; }),

      /* Hotels being weighed up, before one is chosen. Part of the plan
         (choosing is planning), so edits move updatedAt like any other. */
      compare: arr(t.compare).map(function (h) {
        h = h || {};
        var list = function (v) {
          return (Array.isArray(v) ? v : String(v || '').split(/\n+/))
            .map(function (x) { return String(x == null ? '' : x).trim(); })
            .filter(Boolean);
        };
        return {
          uid: str(h.uid) || U.uid('hc'),
          url: str(h.url),
          name: str(h.name),
          platform: str(h.platform),
          pricePerNight: num(h.pricePerNight),
          total: num(h.total),
          currency: str(h.currency).toUpperCase().slice(0, 3),
          rating: num(h.rating),
          ratingScale: num(h.ratingScale) || 10,
          reviews: num(h.reviews),
          address: str(h.address),
          lat: num(h.lat),
          lng: num(h.lng),
          freeCancel: h.freeCancel == null ? null : !!h.freeCancel,
          breakfast: h.breakfast == null ? null : !!h.breakfast,
          pros: list(h.pros),
          cons: list(h.cons),
          notes: str(h.notes)
        };
      }).filter(function (h) { return h.name || h.url; }),

      /* What to bring. Ticking one is a record, like a visited mark, so
         it does not move updatedAt. */
      packing: arr(t.packing).map(function (x) {
        if (typeof x === 'string') return { uid: U.uid('pk'), text: x, done: false };
        return {
          uid: str(x && x.uid) || U.uid('pk'),
          text: str(x && x.text),
          done: !!(x && x.done)
        };
      }).filter(function (x) { return x.text; }),

      /* What the trip actually cost. Written on the day, like a tick or
         a note, so it is a record rather than part of the plan. */
      budget: num(t.budget),
      spend: arr(t.spend).map(function (e) {
        return {
          uid: str(e && e.uid) || U.uid('sp'),
          at: str(e && e.at) || new Date().toISOString(),
          amount: num(e && e.amount),
          cat: str(e && e.cat) || 'other',
          note: str(e && e.note),
          dayId: str(e && e.dayId),
          stopUid: str(e && e.stopUid)
        };
      }).filter(function (e) { return e.amount != null; }),
      notes: str(t.notes),
      updatedAt: str(t.updatedAt) || new Date().toISOString(),
      /* When anything about the trip last changed on any device — the
         plan or a record of the day. updatedAt only moves for the plan
         (it drives re-rendering); sync needs to know about a tick too.
         Stamped by Store on write, never by hand. */
      touchedAt: str(t.touchedAt)
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
    out.spend.forEach(function (e) { claim(e, 'sp'); });
    out.bookings.forEach(function (b) { claim(b, 'bk'); });
    out.packing.forEach(function (x) { claim(x, 'pk'); });
    out.todos.forEach(function (x) { claim(x, 'td'); });
    out.compare.forEach(function (x) { claim(x, 'hc'); });
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
    migrate: migrate,
    blankTrip: blankTrip,
    blankDay: blankDay,
    blankStop: blankStop,
    normalize: normalize,
    looksLikeTrip: looksLikeTrip
  };
})(window);
