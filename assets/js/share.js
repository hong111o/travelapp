/* 行程本 · send a trip to someone
 *
 * Builds one self-contained .html file holding the itinerary and enough
 * of the app to display it. The recipient needs no account, no install
 * and no copy of this app — they open the file and read the trip, the
 * same way the original Málaga page worked before any of this existed.
 *
 * The app's own files are fetched and inlined rather than reimplemented,
 * so a shared copy can never drift from what you see. Served from the
 * service worker cache, this works with no connection.
 *
 * What is deliberately left out: photos (they live in IndexedDB and a
 * phone photo would bloat the file past sending), and everything that
 * writes — ticks, notes, finds — since the reader's copy is a snapshot,
 * not a second place to record things.
 */
(function (global) {
  'use strict';

  var PARTS = [
    'assets/vendor/leaflet/leaflet.css',
    'assets/css/app.css',
    'assets/vendor/leaflet/leaflet.js',
    'assets/js/util.js',
    'assets/js/schema.js',
    'assets/js/widgets.js',
    'assets/js/render.js'
  ];

  function grab(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(path + ' (' + r.status + ')');
      return r.text();
    });
  }

  /* </script> inside a string literal ends the block it sits in, so the
     trip data has to be escaped before being embedded. */
  function safeJSON(obj) {
    return JSON.stringify(obj)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  var BOOT = [
    '(function () {',
    '  var trip = Schema.normalize(window.__TRIP__);',
    '  Render.setReadOnly(true);',
    '  var host = document.getElementById("view-trip");',
    '  Render.trip(trip, host);',
    '',
    '  function show(sub) {',
    '    var subs = host.querySelectorAll(".subview");',
    '    var found = false;',
    '    for (var i = 0; i < subs.length; i++) {',
    '      var on = subs[i].getAttribute("data-sub") === sub;',
    '      subs[i].style.display = on ? "block" : "none";',
    '      if (on) found = true;',
    '    }',
    '    if (!found && subs.length) subs[0].style.display = "block";',
    '    window.scrollTo(0, 0);',
    '    var day = trip.days.filter(function (d) { return d.id === sub; })[0];',
    '    if (day) Widgets.ensureMap(day);',
    '  }',
    '',
    '  document.addEventListener("click", function (e) {',
    '    var b = e.target.closest ? e.target.closest("[data-act]") : null;',
    '    if (!b) return;',
    '    var act = b.getAttribute("data-act");',
    '    if (act === "day") { e.preventDefault(); show(b.getAttribute("data-day")); }',
    '    else if (act === "food") { e.preventDefault(); show("food"); }',
    '    else if (act === "home") { e.preventDefault(); show("home"); }',
    '  });',
    '',
    '  show("home");',
    '  Widgets.loadWeather(trip.place);',
    '  Widgets.loadFX(trip.currency);',
    '  Widgets.startCountdown(trip.departure);',
    '})();'
  ].join('\n');

  function build(trip) {
    return Promise.all(PARTS.map(grab)).then(function (parts) {
      var leafletCss = parts[0], appCss = parts[1];
      var js = parts.slice(2).join('\n;\n');
      var title = trip.title || '行程';

      return '<!DOCTYPE html>\n' +
        '<html lang="zh-HK">\n<head>\n' +
        '<meta charset="UTF-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n' +
        '<meta name="theme-color" content="#0E4D64">\n' +
        '<title>' + U.esc(title) + '</title>\n' +
        '<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&family=Noto+Sans+HK:wght@400;500;700&display=swap" rel="stylesheet">\n' +
        '<style>\n' + leafletCss + '\n' + appCss + '\n' +
        /* No library to go back to, so the back buttons become the title. */
        '.view{display:block}\n.hero-top{display:none}\n' +
        '</style>\n</head>\n<body>\n' +
        '<div id="view-trip" class="view active"></div>\n' +
        '<script>window.__TRIP__ = ' + safeJSON(trip) + ';<\/script>\n' +
        '<script>\n' + js + '\n<\/script>\n' +
        '<script>\n' + BOOT + '\n<\/script>\n' +
        '</body>\n</html>\n';
    });
  }

  function download(trip) {
    return build(trip).then(function (html) {
      var name = U.slug(trip.title || 'trip') + '.html';
      var blob = new Blob([html], { type: 'text/html' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return { name: name, bytes: blob.size };
    });
  }

  global.Share = { build: build, download: download };
})(window);
