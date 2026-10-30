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
  /* trips start collapsed: open the one holding a journey before tapping it */
  const tapJourney = async key => {
    const row = `${pp} [data-act="pj-edit"][data-key="${key}"]`;
    await page.locator(`${pp} details.pt:has(${row.slice(pp.length + 1)}) > summary`).click();
    await page.click(row);
  };
  const openAll = () => page.evaluate(() => document.querySelectorAll('#view-passport details.pt').forEach(d => { d.open = true; }));

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
    if (s.n !== 1) throw new Error('a return journey counted as ' + s.n + ' trips');
    if (s.legs !== 2) throw new Error(s.legs + ' legs');
    if (s.days !== 17) throw new Error(s.days + ' travel days for 20 Dec – 5 Jan');
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
    if (!await page.locator(`${pp} .pj-meta:has-text("行程估計")`).count()) throw new Error('the list does not say so');
  });

  await t.step('editing a trip journey makes it your own, replacing the worked-out one', async () => {
    const before = await count();
    const key = await page.evaluate(() => window.Passport.all().find(j => j.tripId === 'bdx').key);
    await tapJourney(key);
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
    await tapJourney(key);
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
    const want = await page.evaluate(() => window.Passport.groupTrips(window.Passport.all())
      .filter(t => t.start.slice(0, 4) === '2025').length);
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

  await t.step('a chain of legs back to where it began is one trip', async () => {
    const r = await page.evaluate(() => {
      const P = window.Passport, pl = q => P.search(q)[0].place;
      const leg = (a, b, d, mode) => ({ from: pl(a), to: pl(b), date: d, mode: mode || 'flight' });
      const trips = P.groupTrips([
        leg('HKG', 'Singapore', '2015-04-06'), leg('Singapore', 'Malacca', '2015-04-09', 'bus'),
        leg('Malacca', 'Singapore', '2015-04-10', 'bus'), leg('Singapore', 'HKG', '2015-04-10'),
        leg('HKG', 'CTS', '2015-12-28'), leg('CTS', 'HKG', '2016-01-01'),
        leg('LGW', 'AGP', '2026-09-18'), leg('AGP', 'LHR', '2026-09-21'),
        leg('HKG', 'LHR', '2019-09-01')
      ]);
      return trips.map(t => t.legs.length + ':' + t.places.map(p => P.cleanCity(p.city)).join('+')).join(' | ');
    });
    /* newest first: Málaga (Gatwick out, Heathrow back is still London),
       the one-way move, Hokkaido over New Year, the Singapore loop */
    if (r !== '2:Málaga | 1:London | 2:Sapporo | 4:Singapore+Malacca') throw new Error(r);
  });

  await t.step('travel days add up each trip, and overlapping trips share theirs', async () => {
    const d = await page.evaluate(() => {
      const P = window.Passport, pl = q => P.search(q)[0].place;
      const leg = (a, b, date) => ({ from: pl(a), to: pl(b), date, mode: 'flight' });
      return [
        P.stats([leg('HKG', 'NRT', '2024-03-01'), leg('NRT', 'HKG', '2024-03-05')]).days,
        P.stats([leg('HKG', 'NRT', '2024-03-01'), leg('NRT', 'HKG', '2024-03-05'),
                 leg('HKG', 'TPE', '2024-06-10'), leg('TPE', 'HKG', '2024-06-10')]).days,
        /* home on the 5th and off again the same day: 1–8 May is 8 days, not 5 + 4 */
        P.stats([leg('HKG', 'NRT', '2024-05-01'), leg('NRT', 'HKG', '2024-05-05'),
                 leg('HKG', 'TPE', '2024-05-05'), leg('TPE', 'HKG', '2024-05-08')]).days
      ].join();
    });
    if (d !== '5,6,8') throw new Error(d);
  });

  await t.step('an airport is named by the city it serves, so airport and city entries match', async () => {
    const r = await page.evaluate(() => {
      const P = window.Passport, city = q => P.cityName(P.search(q)[0].place);
      return ['CTS', 'Sapporo', 'NRT', 'HND', 'Tokyo', 'KIX', 'LGW', 'STN', 'London', 'EWR', 'CDG', 'ICN']
        .map(q => q + '=' + city(q)).join(' ');
    });
    const want = 'CTS=Sapporo Sapporo=Sapporo NRT=Tokyo HND=Tokyo Tokyo=Tokyo KIX=Osaka LGW=London STN=London ' +
      'London=London EWR=New York City CDG=Paris ICN=Seoul';
    if (r !== want) throw new Error(r);
  });

  await t.step('towns without an airport are found, in English or Chinese', async () => {
    const r = await page.evaluate(() => ['Kyoto', '京都', 'Nara', 'Bruges', '布魯日', 'Seville', 'Sintra', 'Malacca', 'Porto']
      .map(q => { const h = window.Passport.search(q)[0]; return h ? h.place.label + '/' + h.place.cc : q + '?'; }).join(' '));
    const want = 'Kyoto/JP Kyoto/JP Nara/JP Bruges/BE Bruges/BE Seville/ES Sintra/PT Malacca/MY Porto/PT';
    if (r !== want) throw new Error(r);
  });

  await t.step('anywhere else can be looked up on the online map', async () => {
    await page.route(/nominatim\.openstreetmap\.org/, r => r.fulfill({ contentType: 'application/json',
      body: JSON.stringify([{ name: 'Hakone', lat: '35.23', lon: '139.1',
        address: { state: 'Kanagawa Prefecture', country: 'Japan', country_code: 'jp' } }]) }));
    await open();
    await page.click(`${pp} [data-act="pj-add"]`);
    await page.waitForSelector('#pj-sheet');
    await page.fill('#pj-to', 'Hakone');
    await page.waitForSelector('#pj-to-list li.pf-more');
    await page.locator('#pj-to-list li.pf-more').dispatchEvent('mousedown');
    await page.waitForSelector('#pj-to-list li:not(.pf-more)');
    await page.locator('#pj-to-list li:not(.pf-more)').first().dispatchEvent('mousedown');
    const pl = JSON.parse(await page.getAttribute('#pj-to', 'data-place'));
    if (pl.city !== 'Hakone' || pl.cc !== 'JP' || Math.abs(pl.lat - 35.23) > 0.01) throw new Error(JSON.stringify(pl));
    await page.click('#pj-sheet [data-pj="close"]');
    await page.unroute(/nominatim\.openstreetmap\.org/);
  });

  await t.step('every place reads the same way: English city, then code and country', async () => {
    await open();
    const rows = await page.evaluate(() => [...document.querySelectorAll('#view-passport .pj-place b')].map(b => b.textContent));
    const chinese = rows.filter(t => /[\u3400-\u9fff]/.test(t));
    if (chinese.length) throw new Error('Chinese city names: ' + chinese.join(', '));
    if (rows.some(t => t.includes('/'))) throw new Error('a two-town name: ' + rows.find(t => t.includes('/')));
  });

  await t.step('the arrows line up down the list', async () => {
    await openAll();
    const xs = await page.evaluate(() => [...document.querySelectorAll('#view-passport .pj-arrow')]
      .map(a => Math.round(a.getBoundingClientRect().left)));
    if (new Set(xs).size !== 1) throw new Error('arrows at ' + [...new Set(xs)].join(', '));
  });

  await t.step('the transport icon stays clear of the place name', async () => {
    await openAll();
    const gaps = await page.evaluate(() => [...document.querySelectorAll('#view-passport .pj')].map(r => {
      const icon = r.querySelector('.pj-mode').getBoundingClientRect();
      const name = r.querySelector('.pj-place b').getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(r.querySelector('.pj-mode'));
      return Math.round(name.left - Math.max(icon.right, range.getBoundingClientRect().right));
    }));
    if (!gaps.length || Math.min(...gaps) < 6) throw new Error('gaps ' + gaps.join(','));
  });

  await t.step('trips start collapsed and open on a tap, staying open after a repaint', async () => {
    await open();
    const shut = await page.evaluate(() => [...document.querySelectorAll('#view-passport details.pt')].every(d => !d.open));
    if (!shut) throw new Error('a trip started open');
    const head = page.locator(`${pp} details.pt > summary`).first();
    if (await page.locator(`${pp} .pj`).first().isVisible()) throw new Error('legs visible while collapsed');
    await head.click();
    if (!await page.locator(`${pp} details.pt[open] .pj`).first().isVisible()) throw new Error('did not open');
    await page.click(`${pp} [data-act="pp-year"][data-year=""]`);
    if (!await page.locator(`${pp} details.pt[open]`).count()) throw new Error('closed again on repaint');
  });

  await t.step('a trip of many places names two and counts the rest, then lists every stop', async () => {
    await page.evaluate(() => {
      const P = window.Passport, pl = q => P.search(q)[0].place;
      [['MAN', 'ZRH'], ['ZRH', 'BCN'], ['Barcelona', 'Madrid'], ['MAD', 'LIS'], ['Lisbon', 'Porto'], ['OPO', 'CDG'], ['CDG', 'MAN']]
        .forEach((l, i) => P.saveJourney({ from: pl(l[0]), to: pl(l[1]), date: '2022-07-0' + (i + 1), mode: 'flight' }));
    });
    await open();
    const trip = page.locator(`${pp} details.pt:has(.pt-more)`).first();
    const title = await trip.locator('.pt-title').textContent();
    if (!/^Zürich · Barcelona \+4$/.test(title.trim())) throw new Error('title ' + title);
    await trip.locator('summary').click();
    const stops = (await trip.locator('.pt-stops span').allTextContents()).join(' ');
    if (stops !== 'Manchester Zürich Barcelona Madrid Lisbon Porto Paris Manchester') throw new Error('stops ' + stops);
    const fits = await page.evaluate(() => { const h = document.querySelector('#view-passport details.pt:has(.pt-more) .pt-title');
      return h.scrollWidth <= h.clientWidth; });
    if (!fits) throw new Error('title still cut off');
  });

  await t.step('no airline or leg count; days away instead', async () => {
    const labels = await page.locator(`${pp} .pp-stats dt`).allTextContents();
    if (labels.includes('航空公司')) throw new Error('airlines still shown');
    if (labels.includes('航段')) throw new Error('legs still shown');
    if (!labels.includes('旅行日數')) throw new Error('no travel days');
  });

  await t.step('your own photo goes where the app icon was', async () => {
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 600; c.height = 400;
      const g = c.getContext('2d'); g.fillStyle = '#c98a4b'; g.fillRect(0, 0, 600, 400);
      return c.toDataURL('image/png').split(',')[1];
    });
    const chooser = page.waitForEvent('filechooser');
    await page.click(`${pp} [data-act="pp-photo"]`);
    await (await chooser).setFiles({ name: 'me.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForSelector(`${pp} .pp-photo img`);
    const size = await page.evaluate(() => {
      const img = document.querySelector('#view-passport .pp-photo img');
      return new Promise(r => { const i = new Image(); i.onload = () => r(i.width + 'x' + i.height); i.src = img.src; });
    });
    if (size !== '360x480') throw new Error('stored at ' + size + ', not cropped to 3:4');
    await open();
    if (!await page.locator(`${pp} .pp-photo img`).count()) throw new Error('lost on reload');
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
