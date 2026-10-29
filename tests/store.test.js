/* The data layer: what happens when storage misbehaves.
 *
 * These are the cases the app meets on a real device and that no amount
 * of clicking around will reproduce: storage already holding junk, a
 * quota that runs out mid-save, a trip written by an older build, and a
 * trip far larger than the ones used to design the screens. */
'use strict';

const { makeSuite, launch, BASE } = require('./helpers.js');

/* A trip big enough to be unreasonable: a month away, eight stops a day. */
function bigTrip() {
  const days = [];
  for (let d = 0; d < 30; d++) {
    const stops = [];
    for (let s = 0; s < 8; s++) {
      stops.push({
        time: String(8 + s).padStart(2, '0') + ':00',
        title: `Day ${d + 1} stop ${s + 1}`,
        desc: 'A description long enough to be realistic rather than a token. '.repeat(3),
        mapQuery: `place ${d}-${s}`,
        lat: 36.72 + d * 0.004 + s * 0.0005,
        lng: -4.42 + s * 0.0008
      });
    }
    days.push({ id: 'd' + (d + 1), date: '', title: 'Day ' + (d + 1), stops });
  }
  return { id: 'big', title: '好長嘅行程', startDate: '2027-06-01', endDate: '2027-06-30', days };
}

(async () => {
  const t = makeSuite('store');
  const { browser, page, errors } = await launch();

  await t.step('junk in storage is ignored, not fatal', async () => {
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => localStorage.setItem('tripbook.trips.v1', '{not json at all'));
    await page.goto(BASE + '/index.html');
    /* An empty library renders an empty list, which has no height, so
       wait for it to be attached rather than visible. */
    await page.waitForSelector('#lib-list', { state: 'attached' });
    const trips = await page.evaluate(() => window.Store.all().length);
    if (typeof trips !== 'number') throw new Error('Store.all did not answer');
  });

  await t.step('a trip that is not an array is ignored', async () => {
    await page.evaluate(() => localStorage.setItem('tripbook.trips.v1', '{"id":"x"}'));
    const trips = await page.evaluate(() => window.Store.all().length);
    if (trips !== 0) throw new Error('expected 0, got ' + trips);
  });

  await t.step('a trip missing every field still normalises', async () => {
    const shape = await page.evaluate(() => {
      const t = window.Schema.normalize({});
      return { days: Array.isArray(t.days), food: !!t.food, id: !!t.id, schema: t.schema };
    });
    if (!shape.days || !shape.food || !shape.id) throw new Error(JSON.stringify(shape));
  });

  await t.step('an unversioned trip is read as version 1', async () => {
    const v = await page.evaluate(() => window.Schema.normalize({ title: 'Old' }).schema);
    const current = await page.evaluate(() => window.Schema.SCHEMA);
    if (v !== current) throw new Error('read as ' + v + ', current is ' + current);
  });

  await t.step('a trip from a newer build is left alone, not mangled', async () => {
    const kept = await page.evaluate(() => {
      const raw = { schema: 999, title: 'From the future', days: [] };
      const out = window.Schema.migrate(raw);
      return out.schema === 999 && out.title === 'From the future';
    });
    if (!kept) throw new Error('a newer trip was altered');
  });

  await t.step('the previous save is kept as a backup', async () => {
    await page.evaluate(() => {
      localStorage.clear();
      window.Store.save({ id: 'a', title: 'First' });
      window.Store.save({ id: 'b', title: 'Second' });
    });
    const info = await page.evaluate(() => window.Store.backupInfo());
    if (!info) throw new Error('no backup taken');
    if (info.count !== 1) throw new Error('backup holds ' + info.count);
  });

  await t.step('restore brings back what was there before the last write', async () => {
    const after = await page.evaluate(() => {
      window.Store.remove('a');
      window.Store.remove('b');
      window.Store.restoreBackup();
      return window.Store.all().map(t => t.title);
    });
    if (!after.length) throw new Error('nothing came back');
  });

  await t.step('restore is its own undo', async () => {
    const before = await page.evaluate(() => window.Store.all().length);
    const after = await page.evaluate(() => {
      window.Store.restoreBackup();
      return window.Store.all().length;
    });
    if (before === after) throw new Error('pressing it twice changed nothing');
  });

  await t.step('a failing write reports instead of losing silently', async () => {
    const reported = await page.evaluate(() => {
      const real = localStorage.setItem.bind(localStorage);
      let toasted = false;
      const realToast = window.U.toast;
      window.U.toast = function (msg, bad) { if (bad) toasted = true; };
      /* Fail only the trips key, so the backup write is not what we measure. */
      localStorage.setItem = function (k, v) {
        if (k === 'tripbook.trips.v1') { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
        return real(k, v);
      };
      let ok;
      try { ok = window.Store.save({ id: 'q', title: 'Too big' }); }
      finally { localStorage.setItem = real; window.U.toast = realToast; }
      return { ok: ok, toasted: toasted };
    });
    if (reported.ok) throw new Error('save claimed success while throwing');
    if (!reported.toasted) throw new Error('the failure was silent');
  });

  await t.step('a 30-day, 240-stop trip saves and reopens', async () => {
    const counts = await page.evaluate(trip => {
      localStorage.clear();
      if (!window.Store.save(trip)) return null;
      const back = window.Store.get('big');
      return back ? { days: back.days.length, stops: back.days.reduce((n, d) => n + d.stops.length, 0) } : null;
    }, bigTrip());
    if (!counts) throw new Error('the big trip would not save');
    if (counts.days !== 30 || counts.stops !== 240) throw new Error(JSON.stringify(counts));
  });

  await t.step('and it renders without timing out', async () => {
    const started = Date.now();
    await page.goto(BASE + '/index.html');
    await page.waitForSelector('#lib-list .tripitem');
    await page.locator('.tripitem').filter({ hasText: '好長嘅行程' }).first().locator('.dcard').click();
    await page.waitForSelector('#view-trip .hero h1');
    await page.waitForSelector('.subview[data-sub="home"] .daycards .dcard');
    const ms = Date.now() - started;
    const cards = await page.locator('.subview[data-sub="home"] .daycards .dcard').count();
    if (cards < 30) throw new Error('only ' + cards + ' day cards');
    if (ms > 12000) throw new Error('took ' + ms + 'ms to render');
  });

  await t.step('every stop in a long day gets a uid, so ticks survive a reorder', async () => {
    const dupes = await page.evaluate(() => {
      const t = window.Store.get('big');
      const ids = [];
      t.days.forEach(d => d.stops.forEach(s => ids.push(s.uid)));
      return { total: ids.length, unique: new Set(ids).size, blank: ids.filter(x => !x).length };
    });
    if (dupes.blank) throw new Error(dupes.blank + ' stops without a uid');
    if (dupes.total !== dupes.unique) throw new Error('uids repeat');
  });

  const failed = t.done(errors);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
