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

/* The AI prompt lives in AI-PROMPT.md so it can be read on GitHub, and is
   mirrored into a JS constant so the in-app copy button works offline.
   One source, generated copy — same arrangement as the trips above. */
const promptMd = path.join(__dirname, '..', 'AI-PROMPT.md');
const promptJs = path.join(__dirname, '..', 'assets', 'js', 'aiprompt.js');
if (fs.existsSync(promptMd)) {
  const md = fs.readFileSync(promptMd, 'utf8');
  const parts = md.split('\n---\n');
  if (parts.length < 2) {
    console.error('✗ AI-PROMPT.md: expected a --- separator before the prompt body');
    process.exit(1);
  }
  const body = parts.slice(1).join('\n---\n').trim();
  /* The blank template rides along in the same generated file so the
     download button works with no network. */
  const templatePath = path.join(__dirname, '..', 'trip-template.json');
  let template = null;
  if (fs.existsSync(templatePath)) {
    const text = fs.readFileSync(templatePath, 'utf8');
    try {
      JSON.parse(text);
    } catch (err) {
      console.error('✗ trip-template.json is not valid JSON:', err.message);
      process.exit(1);
    }
    template = text;
  }

  fs.writeFileSync(promptJs,
    '/* GENERATED FILE — do not edit by hand.\n' +
    ' * Sources: AI-PROMPT.md, trip-template.json\n' +
    ' * Rebuild: node tools/bundle-trips.js\n' +
    ' */\n' +
    'window.AI_PROMPT = ' + JSON.stringify(body) + ';\n' +
    'window.TRIP_TEMPLATE = ' + JSON.stringify(template) + ';\n');
  console.log(`✓ mirrored AI-PROMPT.md (${body.length} chars) into assets/js/aiprompt.js`);
  if (template) console.log(`✓ mirrored trip-template.json (${template.length} chars) too`);
}
trips.forEach((t, i) => {
  const stops = (t.days || []).reduce((n, d) => n + (d.stops || []).length, 0);
  console.log(`   · ${files[i]} — ${t.title} (${(t.days || []).length} days, ${stops} stops)`);
});
