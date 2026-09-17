#!/usr/bin/env node
/* Bundles data/trips/*.json into data/builtin.js.
 *
 * The app loads bundled trips from a plain <script> rather than fetch()
 * so that opening index.html straight off the disk (file://) still works
 * — fetch is blocked there by the browser's origin rules.
 *
 * Run after adding or editing a file in data/trips/:
 *   node tools/bundle-trips.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'data', 'trips');
const out = path.join(__dirname, '..', 'data', 'builtin.js');

const files = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
  : [];

const trips = files.map((f) => {
  const full = path.join(dir, f);
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    console.error(`✗ ${f}: ${err.message}`);
    process.exit(1);
  }
});

const banner = `/* GENERATED FILE — do not edit by hand.
 * Source: data/trips/*.json
 * Rebuild: node tools/bundle-trips.js
 */
`;

fs.writeFileSync(out, banner + 'window.BUILTIN_TRIPS = ' + JSON.stringify(trips, null, 2) + ';\n');

console.log(`✓ bundled ${trips.length} trip(s) into data/builtin.js`);
trips.forEach((t, i) => {
  const stops = (t.days || []).reduce((n, d) => n + (d.stops || []).length, 0);
  console.log(`   · ${files[i]} — ${t.title} (${(t.days || []).length} days, ${stops} stops)`);
});
