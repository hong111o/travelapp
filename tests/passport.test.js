/* The passport: journeys entered by hand, journeys worked out from the
 * trips, and the page that adds them up. */
'use strict';

const { makeSuite, launch, BASE } = require('./helpers.js');

const PAST = { id: 'mal', title: 'Málaga', place: { name: '馬拉加', lat: 36.72, lng: -4.42 },
  startDate: '2025-09-18', endDate: '2025-09-21',
  flights: [{ when: '去程 · 五 18/9', route: 'LGW 06:30 → AGP 10:05' },
            { when: '回程 · 一 21/9', route: 'AGP 21:25 → LGW 23:10 BA2673' }], days: [] };
const NOFLIGHTS = { id: 'bdx', title: 'Bordeaux', place: { name: '波爾多', lat: 44.84, lng: -0.58 },
  startDate: '2025-10-18', endDate: '2025-10-20', days: [] };
const FUTURE = { id: 'fut', title: 'Tokyo', place: { name: '東京', lat: 35.68, lng: 139.76 },
  startDate: '2099-01-01', endDate: '2099-01-05', flights: [{ when: '1/1', route: 'LHR → HND' }], days: [] };

const pp = '#view-passport';

(async () => {
  const t = makeSuite('passport');
  const { browser, page, errors } = await launch();
  await page.route(/tile\.openstreetmap/, r => r.abort());

  await page.goto(BASE + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.goto('about:blank');
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('#lib-list', { state: 'attached' });

  const open = async () => {
    await page.goto('about:blank');
    await page.goto(BASE + '/index.html#/passport');
    await page.waitForSelector(`${pp} .pp-book`);
  };
  const count = () => page.evaluate(() => window.Passport.all().length);

  await t.step('the passport opens from the bar, with its map', async () => {
    await page.click('.libbar [data-lib="passport"]');
    await page.waitForSelector(`${pp} .pp-book .pp-map`);
    const lands = await page.locator(`${pp} .pp-land`).count();
    if (lands < 150) throw new Error(lands + ' countries drawn');
    if (!await page.locator(`${pp} .card.empty`).count()) throw new Error('no empty state for a new passport');
  });

  const pickPlace = async (id, typed, want) => {
    await page.fill('#' + id, typed);
    await page.waitForSelector(`#${id}-list li`);
    const opts = await page.locator(`#${id}-list li`).allTextContents();
    const i = opts.findIndex(o => o.includes(want));
    if (i < 0) throw new Error(`"${typed}" offered ${opts.join(' / ')}`);
    await page.locator(`#${id}-list li`).nth(i).dispatchEvent('mousedown');
  };

  await t.step('a past journey is entered by picking places as you type', async () => {
    await page.click(`${pp} [data-act="pj-add"]`);
    await page.waitForSelector('#pj-sheet');
    await pickPlace('pj-from', 'HKG', 'HKG');
    await pickPlace('pj-to', '倫敦', 'London');
    await page.fill('#pj-date', '2024-12-20');
    await page.fill('#pj-back', '2025-01-05');
    await page.fill('#pj-fn', 'cx 251');
    await page.click('#pj-sheet [data-pj="save"]');
    await page.waitForSelector('#pj-sheet', { state: 'detached' });
    if (await count() !== 2) throw new Error('a return date should make two journeys');
  });

  await t.step('the numbers add up', async () => {
    const s = await page.evaluate(() => window.Passport.stats(window.Passport.all()));
    if (s.n !== 2) throw new Error(s.n + ' journeys');
    if (s.km < 19000 || s.km > 19600) throw new Error(Math.round(s.km) + ' km for HKG–London and back');
    if (s.countries.join() !== 'HK,GB') throw new Error('countries ' + s.countries.join());
    if (s.min < 1400) throw new Error('only ' + s.min + ' minutes estimated');
  });

  await t.step('a place typed but not picked is refused, not guessed', async () => {
    await page.click(`${pp} [data-act="pj-add"]`);
    await page.waitForSelector('#pj-sheet');
    await page.fill('#pj-from', 'Somewhere');
    await pickPlace('pj-to', 'LHR', 'LHR');
    await page.fill('#pj-date', '2024-01-01');
    await page.click('#pj-sheet [data-pj="save"]');
    await page.waitForSelector('#pj-err:not([hidden])');
    await page.click('#pj-sheet [data-pj="close"]');
  });

  await t.step('a trip whose dates have passed adds its flights by itself', async () => {
    await page.evaluate(trips => trips.forEach(x => window.Store.save(x)), [PAST, NOFLIGHTS, FUTURE]);
    await open();
    const auto = await page.evaluate(() => window.Passport.all().filter(j => j.auto)
      .map(j => j.from.code + '>' + j.to.code + ' ' + j.date + ' ' + j.flightNo));
    if (!auto.includes('LGW>AGP 2025-09-18 ')) throw new Error(auto.join(' | '));
    if (!auto.includes('AGP>LGW 2025-09-21 BA2673')) throw new Error(auto.join(' | '));
  });

  await t.step('a trip still ahead adds nothing yet', async () => {
    const fut = await page.evaluate(() => window.Passport.all().filter(j => j.tripId === 'fut').length);
    if (fut) throw new Error('a 2099 trip is already in the passport');
  });

  await t.step('without a home city, a trip with no flights adds nothing', async () => {
    const n = await page.evaluate(() => window.Passport.all().filter(j => j.tripId === 'bdx').length);
    if (n) throw new Error(n + ' journeys from nowhere');
  });

  await t.step('with one, it becomes a round trip from home, marked as estimated', async () => {
    await page.click(`${pp} [data-act="pp-holder"]`);
    await page.waitForSelector('#ph-sheet');
    await page.fill('#ph-name', 'Wing Chan');
    await pickPlace('ph-home', 'London', 'London');
    await page.click('#ph-sheet [data-ph="save"]');
    await page.waitForSelector('#ph-sheet', { state: 'detached' });
    const legs = await page.evaluate(() => window.Passport.all().filter(j => j.tripId === 'bdx')
      .map(j => ({ to: j.to.cc, date: j.date, mode: j.mode, guessed: j.guessed })));
    if (legs.length !== 2) throw new Error(JSON.stringify(legs));
    if (!legs.every(l => l.guessed)) throw new Error('not marked as estimated');
    if (!legs.some(l => l.to === 'FR')) throw new Error('Bordeaux was not placed in France');
    if (!await page.locator(`${pp} .pj-meta:has-text("由行程估計")`).count()) throw new Error('the list does not say so');
  });

  await t.step('editing a trip journey makes it your own, replacing the worked-out one', async () => {
    const before = await count();
    const key = await page.evaluate(() => window.Passport.all().find(j => j.tripId === 'bdx').key);
    await page.click(`${pp} [data-act="pj-edit"][data-key="${key}"]`);
    await page.waitForSelector('#pj-sheet');
    await page.click('#pj-sheet [data-mode="train"]');
    await page.click('#pj-sheet [data-pj="save"]');
    await page.waitForSelector('#pj-sheet', { state: 'detached' });
    const after = await page.evaluate(k => {
      const all = window.Passport.all();
      return { n: all.length, auto: all.some(j => j.key === k), mine: all.filter(j => j.autoKey === k).map(j => j.mode) };
    }, key);
    if (after.n !== before) throw new Error(`${before} journeys became ${after.n}`);
    if (after.auto) throw new Error('the worked-out copy is still there');
    if (after.mine.join() !== 'train') throw new Error('the edit did not stick: ' + after.mine.join());
  });

  await t.step('removing a trip journey hides it without touching the trip', async () => {
    const key = await page.evaluate(() => window.Passport.all().find(j => j.auto && j.tripId === 'mal').key);
    page.once('dialog', d => d.accept());
    await page.click(`${pp} [data-act="pj-edit"][data-key="${key}"]`);
    await page.waitForSelector('#pj-sheet');
    await page.click('#pj-sheet [data-pj="delete"]');
    await page.waitForSelector('#pj-sheet', { state: 'detached' });
    const gone = await page.evaluate(k => !window.Passport.all().some(j => j.key === k), key);
    const flights = await page.evaluate(() => window.Store.get('mal').flights.length);
    if (!gone) throw new Error('still listed');
    if (flights !== 2) throw new Error('the trip itself was changed');
  });

  await t.step('the map draws the routes and fills the countries visited', async () => {
    await open();
    const arcs = await page.locator(`${pp} .pp-arc`).count();
    const on = await page.locator(`${pp} .pp-land.on`).count();
    if (arcs < 3) throw new Error(arcs + ' routes drawn');
    if (on < 2) throw new Error(on + ' countries filled');
    const flags = await page.locator(`${pp} .pp-flag`).count();
    if (flags < 3) throw new Error(flags + ' flags');
  });

  await t.step('a route across the Pacific is drawn both sides of the map edge', async () => {
    const n = await page.evaluate(() => {
      const P = window.Passport;
      P.saveJourney({ from: P.search('HKG')[0].place, to: P.search('LAX')[0].place, date: '2023-03-03', mode: 'flight' });
      return true;
    });
    await open();
    const shifted = await page.locator(`${pp} .pp-arc[transform]`).count();
    if (!n || shifted < 1) throw new Error('no wrapped copy of the HKG–LAX route');
  });

  await t.step('the years filter the passport', async () => {
    await page.click(`${pp} [data-act="pp-year"][data-year="2025"]`);
    const big = await page.textContent(`${pp} .pp-big b`);
    const want = await page.evaluate(() => window.Passport.all().filter(j => j.date.slice(0, 4) === '2025').length);
    if (Number(big) !== want) throw new Error(`shows ${big}, 2025 has ${want}`);
    const title = await page.textContent(`${pp} .pp-title h2`);
    if (!/^2025 /.test(title)) throw new Error('title reads ' + title);
  });

  await t.step('the passport lines carry your name and are always complete', async () => {
    const mrz = await page.textContent(`${pp} .pp-mrz`);
    if (!/WING<CHAN/.test(mrz)) throw new Error('reads ' + mrz);
    if (!/@TRAVELMARVEL/.test(mrz)) throw new Error('first line cut short: ' + mrz);
    const lens = await page.evaluate(() => document.querySelector('#view-passport .pp-mrz').innerHTML.split('<br>')
      .map(l => l.replace(/&lt;/g, '<').length));
    if (lens.some(l => l !== 44)) throw new Error('line lengths ' + lens.join(','));
  });

  await t.step('a name not in Latin letters reads TRAVELLER there', async () => {
    await page.evaluate(() => window.Passport.setHolder('陳詠', window.Passport.raw().home));
    await open();
    if (!/TRAVELLER/.test(await page.textContent(`${pp} .pp-mrz`))) throw new Error('no TRAVELLER');
  });

  await t.step('flight dates written day/month are read in the trip\'s year', async () => {
    const out = await page.evaluate(() => [
      window.Passport.flightDate('去程 · 五 18/9', { startDate: '2025-09-18' }),
      window.Passport.flightDate('2/1', { startDate: '2025-12-28' }),
      window.Passport.flightDate('2026-03-04 07:00', { startDate: '2026-03-01' })
    ]);
    if (out.join() !== '2025-09-18,2026-01-02,2026-03-04') throw new Error(out.join());
  });

  await t.step('the passport travels with sync, newest copy wins', async () => {
    const r = await page.evaluate(() => {
      const m = window.Sync.mergePassport({ touchedAt: '2026-01-02', name: 'a' }, { touchedAt: '2026-01-03', name: 'b' });
      const k = window.Sync.mergePassport({ touchedAt: '2026-01-05', name: 'a' }, { touchedAt: '2026-01-03', name: 'b' });
      return [m.value.name, m.localChanged, k.value.name, k.remoteChanged];
    });
    if (r.join() !== 'b,true,a,true') throw new Error(r.join());
  });

  const failed = t.done(errors);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
