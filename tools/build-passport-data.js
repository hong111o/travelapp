#!/usr/bin/env node
/* Travel Marvel · build the passport's map and place data
 *
 * Inputs (download them, they are not kept in the repository):
 *   airportsdata    pip download airportsdata --no-deps   → airports.csv   (MIT)
 *   world-atlas     npm pack world-atlas@2                → countries-110m.json (ISC, Natural Earth)
 *   i18n-iso-countries  npm pack i18n-iso-countries@7     → codes.json (numeric ISO → alpha-2)
 *
 *   node tools/build-passport-data.js <airports.csv> <countries-110m.json> <codes.json>
 *
 * Outputs, loaded only when the passport is opened:
 *   data/places.js   every airport with an IATA code, one line each:
 *                    IATA|name|city|country|lat|lng
 *   data/world.js    one SVG path per country, already projected, keyed by
 *                    ISO alpha-2, so the app does no geometry at runtime.
 *
 * Projection: equirectangular on a 1000-wide box, cropped to 84°N–58°S
 * (Antarctica is all width and no destinations). App code projects its
 * points with the same two lines — keep them in step with assets/js/passport.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const [csvPath, worldPath, codesPath] = process.argv.slice(2);
if (!csvPath || !worldPath || !codesPath) {
  console.error('usage: node tools/build-passport-data.js <airports.csv> <countries-110m.json> <codes.json>');
  process.exit(1);
}

const W = 1000, NORTH = 84, SOUTH = -58;
const X = lng => (lng + 180) / 360 * W;
const Y = lat => (NORTH - lat) / 360 * W;

/* --- airports -------------------------------------------------------- */

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
const head = rows.shift();
const col = n => head.indexOf(n);
const clean = s => String(s || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

const seen = new Set();
const places = [];
for (const r of rows) {
  const iata = (r[col('iata')] || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iata) || seen.has(iata)) continue;
  const lat = Number(r[col('lat')]), lng = Number(r[col('lon')]);
  if (!isFinite(lat) || !isFinite(lng)) continue;
  seen.add(iata);
  places.push([iata, clean(r[col('name')]), clean(r[col('city')]), (r[col('country')] || '').trim().toUpperCase(),
    lat.toFixed(3).replace(/\.?0+$/, ''), lng.toFixed(3).replace(/\.?0+$/, '')].join('|'));
}
places.sort();

/* --- countries ------------------------------------------------------------ */

const topo = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
const codes = JSON.parse(fs.readFileSync(codesPath, 'utf8'));
const alpha2 = {};
codes.forEach(c => { alpha2[String(c[2]).padStart(3, '0')] = c[0]; });

/* TopoJSON arcs are delta-encoded and quantised; decode each once. */
const [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
const arcs = topo.arcs.map(arc => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
});
function ring(ids) {
  const pts = [];
  ids.forEach(id => {
    const a = id < 0 ? arcs[~id].slice().reverse() : arcs[id];
    a.forEach((p, i) => { if (i || !pts.length) pts.push(p); });
  });
  return pts;
}
const f = n => (Math.round(n * 10) / 10).toString();
function pathOf(geom) {
  const polys = geom.type === 'Polygon' ? [geom.arcs] : geom.type === 'MultiPolygon' ? geom.arcs : [];
  let d = '';
  polys.forEach(poly => poly.forEach(r => {
    let geo = ring(r);
    /* Russia and Fiji cross the 180° meridian, so their rings jump from
       +180 to -180 and back, and an outline drawn as-is streaks across
       the whole map. Put such a ring on one side of the line (the far
       part spills past the right edge and is clipped by the frame). */
    const crosses = geo.some((p, i) => i && Math.abs(p[0] - geo[i - 1][0]) > 180);
    if (crosses) geo = geo.map(([lng, lat]) => [lng < 0 ? lng + 360 : lng, lat]);
    let pts = geo.map(([lng, lat]) => [X(lng), Y(Math.max(SOUTH - 2, Math.min(NORTH, lat)))]);
    /* Drop points that round onto the one before: 110m data at this size
       has plenty of them, and they are pure weight. */
    pts = pts.filter((p, i) => !i || f(p[0]) !== f(pts[i - 1][0]) || f(p[1]) !== f(pts[i - 1][1]));
    if (pts.length < 3) return;
    d += 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
  }));
  return d;
}

const countries = {};
let unnamed = 0;
topo.objects.countries.geometries.forEach(g => {
  const id = String(g.id || '').padStart(3, '0');
  const code = alpha2[id] || (g.properties && g.properties.name === 'Kosovo' ? 'XK' : null);
  if (!code) { unnamed++; return; }
  if (code === 'AQ') return;
  const d = pathOf(g);
  if (d) countries[code] = (countries[code] || '') + d;
});

/* --- out ---------------------------------------------------------------- */

const root = path.resolve(__dirname, '..');
const banner = (what, src) => '/* GENERATED by tools/build-passport-data.js — do not edit.\n   ' + what +
  '\n   Source: ' + src + '\n*/\n';

fs.writeFileSync(path.join(root, 'data/places.js'),
  banner('Every airport with an IATA code: IATA|name|city|country|lat|lng',
    'airportsdata (MIT), itself from OurAirports and others — see data/LICENSES.md') +
  'window.TM_PLACES = ' + JSON.stringify(places.join('\n')) + ';\n');

fs.writeFileSync(path.join(root, 'data/world.js'),
  banner('Country outlines, projected: equirectangular, 1000 wide, 84°N to 58°S.',
    'world-atlas 2 (ISC), from Natural Earth 1:110m (public domain) — see data/LICENSES.md') +
  'window.TM_WORLD = { w: ' + W + ', h: ' + f(Y(SOUTH)) + ', north: ' + NORTH + ', south: ' + SOUTH +
  ', countries: ' + JSON.stringify(countries) + ' };\n');

const kb = p => (fs.statSync(path.join(root, p)).size / 1024).toFixed(0) + ' KB';
console.log('✓ data/places.js  ' + places.length + ' airports, ' + kb('data/places.js'));
console.log('✓ data/world.js   ' + Object.keys(countries).length + ' countries, ' + kb('data/world.js') +
  (unnamed ? ' (' + unnamed + ' shapes without an ISO code skipped)' : ''));
