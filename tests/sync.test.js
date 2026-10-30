/* Sync between two devices through a Gist.
 *
 * GitHub is replaced by an in-memory fake that speaks the parts of the
 * Gist API the app uses (list, get, create, update), shared by two
 * browser contexts standing in for two devices. Nothing reaches GitHub. */
'use strict';

const { makeSuite, chromium, BASE } = require('./helpers.js');

const TOKEN = 'ghp_' + 'a'.repeat(36);
const PASS = 'correct horse battery staple';

const gists = {};
let nextId = 1;
let failAuth = false;

async function fakeGitHub(ctx) {
  await ctx.route(/api\.github\.com/, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (status, body) => route.fulfill({ status, json: body,
      headers: { 'access-control-allow-origin': '*' } });
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, content-type, accept, x-github-api-version',
        'access-control-allow-methods': 'GET, POST, PATCH' } });
    }
    if (failAuth || req.headers()['authorization'] !== 'Bearer ' + TOKEN) return json(401, { message: 'Bad credentials' });

    const m = url.pathname.match(/^\/gists(?:\/(\w+))?$/);
    if (!m) return json(404, {});
    const view = g => ({ id: g.id, files: Object.fromEntries(Object.entries(g.files).map(([k, v]) =>
      [k, { filename: k, content: v.content, truncated: false }])) });

    if (req.method() === 'GET' && !m[1]) return json(200, Object.values(gists).map(view));
    if (req.method() === 'GET') return gists[m[1]] ? json(200, view(gists[m[1]])) : json(404, {});
    const body = JSON.parse(req.postData() || '{}');
    if (req.method() === 'POST') {
      const id = 'g' + (nextId++);
      gists[id] = { id, public: body.public, files: body.files };
      return json(201, view(gists[id]));
    }
    if (req.method() === 'PATCH' && gists[m[1]]) {
      Object.assign(gists[m[1]].files, body.files);
      return json(200, view(gists[m[1]]));
    }
    return json(404, {});
  });
}

async function device(browser, trips) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block' });
  await fakeGitHub(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(BASE + '/index.html');
  await page.evaluate(ts => { localStorage.clear(); ts.forEach(t => window.Store.save(t)); }, trips || []);
  await page.goto('about:blank');
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('#lib-list', { state: 'attached' });
  return { ctx, page, errors };
}

const titles = page => page.evaluate(() => window.Store.all().map(t => t.title).sort());
const syncNow = page => page.evaluate(() => window.Sync.now().then(() => 'ok', e => 'ERR ' + e.message));

async function connect(page, token, pass) {
  await page.click('.libbar [data-lib="sync"]');
  await page.waitForSelector('#sync-sheet');
  await page.fill('#sy-token', token);
  await page.fill('#sy-pass', pass);
  await page.click('#sync-sheet [data-sy="connect"]');
}

(async () => {
  const t = makeSuite('sync');
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium' });

  const A = await device(browser, [
    { id: 'm', title: 'Málaga', startDate: '2027-09-18', endDate: '2027-09-21',
      flights: [{ when: '去程', route: 'LGW → AGP', ref: 'SECRETREF' }],
      days: [{ id: 'd1', date: '2027-09-18', title: '舊城', stops: [{ title: 'Catedral', time: '10:00', mapQuery: 'c' }] }] },
    { id: 'b', title: 'Bordeaux', startDate: '2027-10-18', endDate: '2027-10-20', days: [] }
  ]);
  const B = await device(browser, [{ id: 's', title: 'Sevilla', startDate: '2027-11-01', endDate: '2027-11-03', days: [] }]);

  await t.step('something that is not a token is refused before anything is sent', async () => {
    await connect(A.page, 'my password', PASS);
    await A.page.waitForSelector('#sy-err:not([hidden])');
    if (Object.keys(gists).length) throw new Error('a gist was created');
    await A.page.click('#sync-sheet [data-sy="close"]');
  });

  await t.step('connecting creates one private gist', async () => {
    await connect(A.page, TOKEN, PASS);
    await A.page.waitForSelector('#sync-sheet', { state: 'detached' });
    const all = Object.values(gists);
    if (all.length !== 1) throw new Error(all.length + ' gists');
    if (all[0].public !== false) throw new Error('the gist is public');
  });

  await t.step('what reaches GitHub is ciphertext, not your trips', async () => {
    const content = Object.values(gists)[0].files['travel-marvel.json'].content;
    for (const leak of ['Málaga', 'Bordeaux', 'SECRETREF', 'Catedral']) {
      if (content.includes(leak)) throw new Error('"' + leak + '" is readable in the gist');
    }
    if (!JSON.parse(content).enc) throw new Error('not marked encrypted');
  });

  await t.step('a second device with the wrong passphrase is told so and left unconnected', async () => {
    await connect(B.page, TOKEN, 'wrong');
    await B.page.waitForSelector('#sy-err:not([hidden])');
    const msg = await B.page.textContent('#sy-err');
    if (!/密碼/.test(msg)) throw new Error('reads ' + msg);
    if (await B.page.evaluate(() => window.Sync.enabled())) throw new Error('left half set up');
    await B.page.click('#sync-sheet [data-sy="close"]');
  });

  await t.step('with the right one it finds the same gist and gets the trips', async () => {
    await connect(B.page, TOKEN, PASS);
    await B.page.waitForSelector('#sync-sheet', { state: 'detached' });
    if (Object.keys(gists).length !== 1) throw new Error('made a second gist');
    const got = await titles(B.page);
    if (got.join() !== 'Bordeaux,Málaga,Sevilla') throw new Error('B has ' + got.join());
  });

  await t.step('and the first device gets the second device\'s trip back', async () => {
    const r = await syncNow(A.page);
    if (r !== 'ok') throw new Error(r);
    const got = await titles(A.page);
    if (got.join() !== 'Bordeaux,Málaga,Sevilla') throw new Error('A has ' + got.join());
  });

  await t.step('a tick on one device reaches the other — on its own, a few seconds later', async () => {
    await A.page.evaluate(() => {
      const tr = window.Store.get('m');
      window.Store.setDone('m', tr.days[0].stops[0].uid, true);
    });
    await A.page.waitForFunction(() => window.Sync.status().state === 'syncing' || window.Sync.status().state === 'ok', null, { timeout: 2000 });
    await A.page.waitForTimeout(5200);
    const r = await syncNow(B.page);
    if (r !== 'ok') throw new Error(r);
    const ticked = await B.page.evaluate(() => {
      const tr = window.Store.get('m');
      return !!tr.progress[tr.days[0].stops[0].uid];
    });
    if (!ticked) throw new Error('the tick did not arrive');
  });

  await t.step('the newer change to a trip wins', async () => {
    await A.page.evaluate(() => { const tr = window.Store.get('b'); tr.subtitle = '舊嘅'; window.Store.save(tr); });
    await A.page.waitForTimeout(30);
    await B.page.evaluate(() => { const tr = window.Store.get('b'); tr.subtitle = '新嘅'; window.Store.save(tr); });
    await syncNow(A.page);
    await syncNow(B.page);
    await syncNow(A.page);
    const a = await A.page.evaluate(() => window.Store.get('b').subtitle);
    const b = await B.page.evaluate(() => window.Store.get('b').subtitle);
    if (a !== '新嘅' || b !== '新嘅') throw new Error(`A ${a}, B ${b}`);
  });

  await t.step('a trip deleted on one device is deleted on the other, and stays deleted', async () => {
    await B.page.evaluate(() => window.Store.remove('s'));
    await syncNow(B.page);
    await syncNow(A.page);
    let got = await titles(A.page);
    if (got.includes('Sevilla')) throw new Error('still on A');
    await syncNow(B.page);
    got = await titles(B.page);
    if (got.includes('Sevilla')) throw new Error('came back on B');
  });

  await t.step('a pulled change shows on screen without a reload', async () => {
    await A.page.goto(BASE + '/index.html');
    await A.page.waitForSelector('#lib-list .tripitem');
    await B.page.evaluate(() => { const tr = window.Store.get('b'); tr.title = 'Bordeaux 酒莊'; window.Store.save(tr); });
    await syncNow(B.page);
    await syncNow(A.page);
    await A.page.waitForTimeout(200);
    const shown = await A.page.textContent('#lib-list');
    if (!/Bordeaux 酒莊/.test(shown)) throw new Error('library still shows the old title');
  });

  await t.step('a revoked token shows as an error instead of failing silently', async () => {
    failAuth = true;
    const r = await syncNow(A.page);
    failAuth = false;
    if (!/token/.test(r)) throw new Error('reads ' + r);
    const dotErr = await A.page.evaluate(() => document.getElementById('sync-dot').classList.contains('err'));
    if (!dotErr) throw new Error('the status dot did not turn red');
  });

  await t.step('stopping sync on a device keeps its trips and forgets the token', async () => {
    await A.page.click('.libbar [data-lib="sync"]');
    await A.page.waitForSelector('#sync-sheet');
    await A.page.click('#sync-sheet [data-sy="off"]');
    await A.page.waitForSelector('#sync-sheet', { state: 'detached' });
    const left = await A.page.evaluate(() => ({ on: window.Sync.enabled(), n: window.Store.all().length,
      token: localStorage.getItem('tripbook.sync.token') }));
    if (left.on || left.token) throw new Error('still connected');
    if (left.n < 2) throw new Error('trips were removed');
  });

  await t.step('the demo a new device seeds never undoes a delete made elsewhere', async () => {
    const out = await A.page.evaluate(() => {
      const seeded = { id: 'demo-lisboa', touchedAt: '1970-01-01T00:00:00.000Z', updatedAt: new Date().toISOString() };
      const m = window.Sync.merge([seeded], {}, { trips: {}, deleted: { 'demo-lisboa': '2027-01-01T00:00:00.000Z' } });
      return !!m.trips['demo-lisboa'];
    });
    if (out) throw new Error('the deleted demo came back');
    const stamp = await A.page.evaluate(() => {
      localStorage.clear();
      window.Store.seedIfFirstRun();
      const t = window.Store.rawAll()[0];
      return t && t.touchedAt;
    });
    if (stamp !== '1970-01-01T00:00:00.000Z') throw new Error('seeded with stamp ' + stamp);
  });

  await t.step('merging is decided per trip by the newest change', async () => {
    const out = await A.page.evaluate(() => {
      const m = window.Sync.merge(
        [{ id: 'x', touchedAt: '2027-01-02' }, { id: 'y', touchedAt: '2027-01-05' }],
        { z: '2027-01-03' },
        { trips: { x: { id: 'x', touchedAt: '2027-01-04' }, y: { id: 'y', touchedAt: '2027-01-01' },
                   z: { id: 'z', touchedAt: '2027-01-02' }, w: { id: 'w', touchedAt: '2027-01-09' } },
          deleted: { w: '2027-01-08' } });
      return { x: m.trips.x.touchedAt, y: m.trips.y.touchedAt, z: !!m.trips.z, w: !!m.trips.w, del: Object.keys(m.deleted) };
    });
    if (out.x !== '2027-01-04') throw new Error('x kept the older copy');
    if (out.y !== '2027-01-05') throw new Error('y kept the older copy');
    if (out.z) throw new Error('z came back after it was deleted');
    if (!out.w) throw new Error('w was changed after its delete and should have come back');
    if (out.del.join() !== 'z') throw new Error('tombstones: ' + out.del.join());
  });

  const failed = t.done([].concat(A.errors, B.errors));
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
