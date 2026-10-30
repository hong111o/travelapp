/* A new version arrives whole.
 *
 * GitHub Pages lets browsers keep each file for 10 minutes. The service
 * worker used to precache a new version with a plain fetch, so for ten
 * minutes after a visit it could store the new index.html beside the old
 * app.js — the page showed a 🛂 護照 button its code did not know, and
 * tapping it did nothing. That happened on a phone.
 *
 * This serves a copy of the app with the same 10-minute caching, deploys
 * a new version inside that window, and checks the page and its scripts
 * come from the same version afterwards. */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { makeSuite, launch } = require('./helpers.js');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8791;

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === 'tests' || e.name === '.git' || e.name === 'node_modules') continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

(async () => {
  const t = makeSuite('update');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-update-'));
  copyDir(ROOT, dir);

  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dir, p);
    if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream',
      /* What GitHub Pages sends; sw.js itself is checked by the browser
         with updateViaCache:'none', as the app registers it. */
      'Cache-Control': 'max-age=600'
    });
    fs.createReadStream(f).pipe(res);
  }).listen(PORT);

  const { browser, page, errors } = await launch({ serviceWorkers: 'allow' });
  await page.route(/tile\.openstreetmap|fonts\.g|jsdelivr|er-api|open-meteo/, r => r.abort());
  const base = `http://localhost:${PORT}/index.html`;

  await t.step('the first version installs and takes control', async () => {
    await page.goto(base);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 });
    await page.reload();
    await page.waitForSelector('#lib-list', { state: 'attached' });
  });

  await t.step('a version deployed within the cache window arrives with matching scripts', async () => {
    /* Deploy: new page, new script, new worker version — all inside the
       ten minutes the browser may keep the old copies. */
    const sw = path.join(dir, 'sw.js');
    fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/const VERSION = '[^']+'/, "const VERSION = 'vNEXT'"));
    const idx = path.join(dir, 'index.html');
    fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace('<head>', '<head>\n<meta name="tm-build" content="NEXT">'));
    const app = path.join(dir, 'assets/js/app.js');
    fs.writeFileSync(app, fs.readFileSync(app, 'utf8') + '\nwindow.TM_BUILD = "NEXT";\n');

    const reloaded = page.waitForEvent('load', { timeout: 30000 });
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r && r.update()));
    await reloaded;
    await page.waitForSelector('#lib-list', { state: 'attached' });

    const got = await page.evaluate(() => ({
      page: (document.querySelector('meta[name="tm-build"]') || {}).content || 'OLD',
      script: window.TM_BUILD || 'OLD'
    }));
    if (got.page !== 'NEXT') throw new Error('the page did not update');
    if (got.script !== 'NEXT') throw new Error('new page, old app.js: the mix that broke 護照 on the phone');
  });

  await t.step('and it stays consistent offline', async () => {
    await page.context().setOffline(true);
    await page.reload();
    await page.waitForSelector('#lib-list', { state: 'attached' });
    const script = await page.evaluate(() => window.TM_BUILD || 'OLD');
    await page.context().setOffline(false);
    if (script !== 'NEXT') throw new Error('offline it served ' + script);
  });

  const failed = t.done(errors);
  await browser.close();
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})();
