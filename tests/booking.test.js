/* Reservations and packing.
 *
 * Flights and hotels already had fixed cards; everything else that was
 * booked lived wherever it landed — an infoCard, a todo, a stop's pin.
 * These cover the list that gathers all three, and the packing list that
 * shares the 清單 screen with the visited list. */
'use strict';

const { makeSuite, launch, BASE, openTrip } = require('./helpers.js');

const soon = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 16);

const TRIP = {
  id: 'bk', title: '訂嘢測試', startDate: '2027-09-01', endDate: '2027-09-04',
  flights: [{ when: '去程 · 一 1/9', route: 'LGW 07:45 → AGP 11:25', ref: 'FLT123', note: '' }],
  hotels: [{ name: 'Hotel Soho', address: 'Calle X 4', dates: '1/9 in → 4/9 out', ref: 'HTL777', mapQuery: 'Hotel Soho Malaga' }],
  bookings: [{ title: '火車去 Nerja', when: 'D3 09:15', at: soon, ref: 'TRN456', note: '記得買來回' }],
  days: [{ id: 'd1', date: '2027-09-01', title: '第一日', stops: [{ title: '景點', time: '10:00', mapQuery: 'a' }] }]
};

const view = '.subview[data-sub="bookings"]';
const check = '.subview[data-sub="check"]';

(async () => {
  const t = makeSuite('booking');
  const { browser, ctx, page, errors } = await launch();
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto(BASE + '/index.html');
  await page.evaluate(trip => { localStorage.clear(); window.Store.save(trip); }, TRIP);
  await openTrip(page, '訂嘢測試');

  await t.step('the home screen offers a 訂咗嘅嘢 card', async () => {
    const card = page.locator('.subview[data-sub="home"] .dcard.booked');
    if (!await card.count()) throw new Error('no card');
    const text = await card.textContent();
    if (!/火車去 Nerja/.test(text)) throw new Error('card does not name what is next: ' + text);
  });

  await t.step('flights, hotels and other bookings are all in one list', async () => {
    await page.click('.subview[data-sub="home"] .dcard.booked');
    await page.waitForSelector(view);
    const rows = await page.locator(`${view} .bkrow`).count();
    if (rows !== 3) throw new Error(rows + ' rows, expected 3');
    const text = await page.textContent(`${view}`);
    for (const want of ['LGW', 'Hotel Soho', '火車去 Nerja']) {
      if (!text.includes(want)) throw new Error('missing ' + want);
    }
  });

  await t.step('the next one is called out with how long you have', async () => {
    const head = page.locator(`${view} .nextbk`);
    if (!await head.count()) throw new Error('nothing called out');
    const text = await head.textContent();
    if (!/火車去 Nerja/.test(text)) throw new Error('reads ' + text);
    /* untilText counts minutes and `at` is a datetime; passing one for
       the other printed "NaN 個鐘" on a real trip. */
    if (/NaN|undefined|Invalid/.test(text)) throw new Error('reads ' + text);
    if (!/個鐘|分鐘|就快到/.test(text)) throw new Error('no countdown: ' + text);
  });

  await t.step('and the home card counts down too, without NaN', async () => {
    await page.click(`${view} .backbtn`);
    await page.waitForSelector('.subview[data-sub="home"] .dcard.booked');
    const text = await page.textContent('.subview[data-sub="home"] .dcard.booked');
    if (/NaN|undefined|Invalid/.test(text)) throw new Error('reads ' + text);
    if (!/個鐘|分鐘|就快到/.test(text)) throw new Error('no countdown: ' + text);
    await page.click('.subview[data-sub="home"] .dcard.booked');
    await page.waitForSelector(view);
  });

  await t.step('a booking with no exact time shows its written time instead', async () => {
    const shown = await page.evaluate(() => {
      const t = window.Store.get('bk');
      t.bookings = [{ uid: 'x', at: '', when: 'D4 彈性', title: '租車', ref: '', note: '', mapQuery: '' }];
      window.Store.save(t);
      return true;
    });
    if (!shown) throw new Error('could not set up');
    await page.reload();
    await page.waitForSelector(view);
    const text = await page.textContent(view);
    if (/NaN|undefined/.test(text)) throw new Error('reads ' + text);
    if (!text.includes('D4 彈性')) throw new Error('the written time is gone: ' + text);
    /* Put the timed one back for the steps that follow. */
    await page.evaluate(at => {
      const t = window.Store.get('bk');
      t.bookings = [{ uid: 'y', at: at, when: 'D3 09:15', title: '火車去 Nerja', ref: 'TRN456', note: '記得買來回', mapQuery: '' }];
      window.Store.save(t);
    }, soon);
    await page.reload();
    await page.waitForSelector(view);
  });

  await t.step('a booking reference copies itself', async () => {
    await page.click(`${view} .refb >> nth=0`);
    await page.waitForTimeout(250);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    if (!/FLT123|HTL777|TRN456/.test(copied)) throw new Error('clipboard holds ' + JSON.stringify(copied));
  });

  await t.step('one can be added, and it lands in the list', async () => {
    await page.click(`${view} [data-act="bk-add"]`);
    await page.waitForSelector('#bk-sheet');
    await page.fill('#bk-title', 'Alhambra 入場');
    await page.fill('#bk-when', 'D2 14:00');
    await page.fill('#bk-ref', 'ALH999');
    await page.click('#bk-sheet [data-bk="save"]');
    await page.waitForSelector('#bk-sheet', { state: 'detached' });
    await page.waitForSelector(view);
    const text = await page.textContent(view);
    if (!text.includes('Alhambra 入場')) throw new Error('not in the list');
  });

  await t.step('an empty one is refused', async () => {
    await page.click(`${view} [data-act="bk-add"]`);
    await page.waitForSelector('#bk-sheet');
    await page.click('#bk-sheet [data-bk="save"]');
    await page.waitForTimeout(200);
    if (!await page.locator('#bk-sheet').count()) throw new Error('an empty booking was accepted');
    await page.click('#bk-sheet [data-bk="close"]');
  });

  await t.step('one you added can be removed; a flight cannot', async () => {
    await page.waitForSelector(view);
    const deletable = await page.locator(`${view} [data-act="bk-del"]`).count();
    if (deletable !== 2) throw new Error(deletable + ' deletable rows, expected 2 (the two added)');
    await page.click(`${view} [data-act="bk-del"] >> nth=1`);
    await page.waitForTimeout(400);
    const text = await page.textContent(view);
    if (text.includes('Alhambra 入場')) throw new Error('still there');
    if (!text.includes('LGW')) throw new Error('the flight went too');
  });

  /* --- packing --- */

  await t.step('the 清單 screen carries a packing list', async () => {
    await page.click('#view-trip .tabbar .tab[data-tab="check"]');
    await page.waitForSelector(check);
    if (!await page.locator(`${check} .packcard`).count()) throw new Error('no packing card');
  });

  await t.step('an item can be typed in and added', async () => {
    await page.fill('#pk-new', '轉換插頭');
    await page.click(`${check} [data-act="pack-add"]`);
    await page.waitForTimeout(250);
    const rows = await page.locator(`${check} .pkrow`).count();
    if (rows !== 1) throw new Error(rows + ' rows');
  });

  await t.step('Enter adds one too, so a list can be typed straight through', async () => {
    await page.fill('#pk-new', '充電器');
    await page.press('#pk-new', 'Enter');
    await page.waitForTimeout(250);
    await page.fill('#pk-new', '泳褲');
    await page.press('#pk-new', 'Enter');
    await page.waitForTimeout(250);
    const rows = await page.locator(`${check} .pkrow`).count();
    if (rows !== 3) throw new Error(rows + ' rows');
  });

  await t.step('ticking one marks it and moves the count', async () => {
    await page.click(`${check} .pkrow [data-act="pack"] >> nth=0`);
    await page.waitForTimeout(250);
    const on = await page.locator(`${check} .pkrow.on`).count();
    if (on !== 1) throw new Error(on + ' ticked');
    const n = await page.textContent(`${check} .pkn`);
    if (!/1 \/ 3/.test(n)) throw new Error('count reads ' + n);
  });

  await t.step('ticking is a record, not an edit to the plan', async () => {
    const moved = await page.evaluate(() => {
      const t = window.Store.get('bk');
      const was = t.updatedAt;
      window.Store.setPacked('bk', t.packing[1].uid, true);
      return window.Store.get('bk').updatedAt !== was;
    });
    if (moved) throw new Error('updatedAt moved');
  });

  await t.step('an item can be deleted', async () => {
    await page.reload();
    await page.waitForSelector(check);
    await page.click(`${check} .pkrow [data-act="pack-del"] >> nth=0`);
    await page.waitForTimeout(250);
    const rows = await page.locator(`${check} .pkrow`).count();
    if (rows !== 2) throw new Error(rows + ' rows left');
  });

  await t.step('packing survives a reload', async () => {
    await page.goto(BASE + '/index.html#/trip/bk/check');
    await page.waitForSelector(check);
    const rows = await page.locator(`${check} .pkrow`).count();
    if (rows !== 2) throw new Error(rows + ' rows after reload');
  });

  const failed = t.done(errors);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
