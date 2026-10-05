/* 行程本 · read a map link
 *
 * Pulling coordinates out of a Google Maps URL by hand is the most
 * tedious part of entering a trip, and the usual way to fix one the
 * health check flags. All of this is string work — no network, no key.
 *
 * Short links (maps.app.goo.gl, goo.gl/maps) carry nothing but an id:
 * the coordinates only exist after a redirect, which a page cannot follow
 * cross-origin. Those are detected and reported rather than silently
 * failing.
 */
(function (global) {
  'use strict';

  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : null;
  }

  function plausible(lat, lng) {
    return lat != null && lng != null &&
      Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
      !(lat === 0 && lng === 0);          /* null island is never the answer */
  }

  function decode(s) {
    try { return decodeURIComponent(String(s).replace(/\+/g, ' ')).trim(); }
    catch (e) { return String(s).replace(/\+/g, ' ').trim(); }
  }

  function isShortLink(text) {
    return /(^|\/\/)(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(text);
  }

  /* --- coordinates ---------------------------------------------- */

  var COORD = '(-?\\d{1,3}(?:\\.\\d+)?)';

  function findCoords(text) {
    var m;

    /* The place pin itself, buried in Google's data parameter. More exact
       than @, which is only where the camera happens to be. */
    m = new RegExp('!3d' + COORD + '!4d' + COORD).exec(text);
    if (m && plausible(num(m[1]), num(m[2]))) return { lat: num(m[1]), lng: num(m[2]) };

    /* ?q= / ?query= / ?ll= / ?daddr=  — used by share sheets and Apple Maps */
    m = new RegExp('[?&](?:q|query|ll|daddr|sll)=' + COORD + '%2C\\s*' + COORD, 'i').exec(text) ||
        new RegExp('[?&](?:q|query|ll|daddr|sll)=' + COORD + ',\\s*' + COORD, 'i').exec(text);
    if (m && plausible(num(m[1]), num(m[2]))) return { lat: num(m[1]), lng: num(m[2]) };

    /* The map viewport. Least precise, so it comes last. */
    m = new RegExp('@' + COORD + ',' + COORD).exec(text);
    if (m && plausible(num(m[1]), num(m[2]))) return { lat: num(m[1]), lng: num(m[2]) };

    /* Someone pasted a bare pair, which is a perfectly good thing to do. */
    m = new RegExp('^\\s*' + COORD + '\\s*,\\s*' + COORD + '\\s*$').exec(text);
    if (m && plausible(num(m[1]), num(m[2]))) return { lat: num(m[1]), lng: num(m[2]) };

    return null;
  }

  /* --- name ------------------------------------------------------ */

  function findName(text) {
    var m = /\/maps\/place\/([^/@?]+)/.exec(text);
    if (m) {
      var name = decode(m[1]);
      /* Google falls back to the coordinates as the "place" segment when
         the pin is not a named business. */
      if (name && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(name)) return name;
    }
    /* Apple Maps and share links put the label in q= */
    m = /[?&]q=([^&]+)/.exec(text);
    if (m) {
      var q = decode(m[1]);
      if (q && !/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(q)) return q;
    }
    return '';
  }

  /* --- entry point ----------------------------------------------- */

  /* Returns { name, lat, lng } for anything usable. Throws with a message
     worth showing when the input is a short link or simply has no
     coordinates in it. */
  function parse(text) {
    var raw = String(text == null ? '' : text).trim();
    if (!raw) throw new Error('冇貼到嘢');

    var coords = findCoords(raw);
    if (!coords) {
      if (isShortLink(raw)) {
        throw new Error('呢個係短連結，入面冇座標。喺瀏覽器開一開佢，' +
                        '等網址變長咗（會見到 @ 同一串數字）再 copy 過嚟。');
      }
      throw new Error('呢條連結搵唔到座標。試下喺 Google Maps 長按個位置，' +
                      '佢會彈出一對經緯度，copy 嗰對數字都得。');
    }
    return { name: findName(raw), lat: coords.lat, lng: coords.lng };
  }

  global.MapLink = { parse: parse, isShortLink: isShortLink };
})(window);
