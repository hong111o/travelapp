/* Travel Marvel · test helpers
 *
 * These suites drive the real app in a real browser against a plain
 * static server — the same way it is served on GitHub Pages. No build,
 * no framework, so a suite is an ordinary Node script you can run on
 * its own: `node tests/smoke.js`.
 *
 * Playwright lives outside the repo in this environment, so resolve it
 * from wherever it actually is rather than assuming node_modules.
 */
'use strict';

const BASE = process.env.TM_BASE || 'http://localhost:8777';
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';

function requirePlaywright() {
  const candidates = [
    'playwright',
    '/opt/node-tools/node_modules/playwright',
    '/usr/local/lib/node_modules_global/playwright'
  ];
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* try the next */ }
  }
  throw new Error('playwright not found; install it or set NODE_PATH');
}

const { chromium } = requirePlaywright();

/* One place that knows how a suite reports itself, so the runner can
   read every suite the same way. */
function makeSuite(name) {
  let failed = 0;
  const step = async (label, fn) => {
    try {
      await fn();
      console.log('  ✓ ' + label);
    } catch (e) {
      failed++;
      process.exitCode = 1;
      console.log('  ✗ ' + label + ' — ' + (e && e.message ? e.message : e));
    }
  };
  return {
    step,
    done(errors) {
      if (errors && errors.length) {
        failed++;
        process.exitCode = 1;
        console.log('  ✗ page errors: ' + errors.join(' | '));
      }
      console.log(failed ? `${name}: ${failed} failed` : `${name}: ok`);
      return failed;
    }
  };
}

async function launch(opts) {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const ctx = await browser.newContext(Object.assign({
    viewport: { width: 420, height: 900 },
    /* Suites that are not about the worker block it: a cached shell
       would serve yesterday's code and the failure would look like a
       bug in the app. */
    serviceWorkers: 'block'
  }, opts || {}));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  return { browser, ctx, page, errors };
}

async function openLibrary(page) {
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('#lib-list .tripitem, #lib-empty:not([hidden])');
}

async function importTrip(page, trip) {
  await page.goto(BASE + '/index.html');
  await page.evaluate(t => {
    const saved = window.Store.save(t);
    if (!saved) throw new Error('save refused');
  }, trip);
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('#lib-list .tripitem');
}

async function openTrip(page, title) {
  await openLibrary(page);
  await page.locator('.tripitem').filter({ hasText: title }).first().locator('.dcard').click();
  await page.waitForSelector('#view-trip .hero h1');
}

async function openDay(page, n) {
  await page.click(`.subview[data-sub="home"] .daycards .dcard >> nth=${n || 0}`);
  await page.waitForSelector('.subview.active .stops, .subview[data-sub^="d"] .stops');
}

module.exports = { BASE, chromium, makeSuite, launch, openLibrary, importTrip, openTrip, openDay };
