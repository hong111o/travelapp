/* Logging what the trip cost.
 *
 * The app had a currency converter, which answers "what is 12 euros in
 * pounds" — not "how much have we spent, and are we fine". These cover
 * the thing that replaced it. */
'use strict';

const { makeSuite, launch, BASE, openTrip } = require('./helpers.js');

const TRIP = {
  id: 'spend', title: '使費測試', startDate: '2027-08-01', endDate: '2027-08-03',
  currency: { base: 'EUR', quote: 'GBP' },
  days: [
    { id: 'd1', date: '2027-08-01', title: '第一日', stops: [{ title: '景點', time: '10:00', mapQuery: 'a' }] },
    { id: 'd2', date: '2027-08-02', title: '第二日', stops: [{ title: '景點', time: '10:00', mapQuery: 'b' }] }
  ]
};

const money = '.subview[data-sub="money"]';

(async () => {
  const t = makeSuite('spend');
  const { browser, page, errors } = await launch();

  await page.goto(BASE + '/index.html');
  await page.evaluate(trip => { localStorage.clear(); window.Store.save(trip); }, TRIP);
  await openTrip(page, '使費測試');

  const addSpend = async (amount, cat, note) => {
    await page.click(`${money} [data-act="spend-add"]`);
    await page.waitForSelector('#spend-sheet');
    await page.fill('#spend-amt', String(amount));
    if (cat) await page.click(`#spend-sheet [data-cat="${cat}"]`);
    if (note) await page.fill('#spend-note', note);
    await page.click('#spend-sheet [data-spend="save"]');
    await page.waitForSelector('#spend-sheet', { state: 'detached' });
    await page.waitForTimeout(120);
  };

  await t.step('the money tab opens an empty ledger', async () => {
    await page.click('.tabbar .tab[data-tab="money"]');
    await page.waitForSelector(money);
    const total = await page.textContent(`${money} .ms-n`);
    if (!/0/.test(total)) throw new Error('opening total reads ' + total);
  });

  await t.step('a spend is two fields and a save', async () => {
    await addSpend(12.5, 'food', '午餐');
    const total = await page.textContent(`${money} .ms-n`);
    if (!/12\.5/.test(total)) throw new Error('total reads ' + total);
  });

  await t.step('amounts add up', async () => {
    await addSpend(48, 'stay');
    await addSpend(3.5, 'trans');
    const total = await page.textContent(`${money} .ms-n`);
    if (!/64/.test(total)) throw new Error('total reads ' + total);
  });

  await t.step('whole amounts lose the trailing zeroes, fractions keep them', async () => {
    const rows = await page.locator(`${money} .sprow .sv`).allTextContents();
    if (!rows.some(r => /\b48\b/.test(r) && !/48\.00/.test(r))) throw new Error('48 shown as ' + rows.join(' | '));
    if (!rows.some(r => /12\.50/.test(r))) throw new Error('12.50 shown as ' + rows.join(' | '));
  });

  await t.step('the currency is the trip\'s own', async () => {
    const total = await page.textContent(`${money} .ms-n`);
    if (!/EUR/.test(total)) throw new Error('total reads ' + total);
  });

  await t.step('it breaks down by category, biggest first', async () => {
    const cats = await page.locator(`${money} .catrow .cv`).allTextContents();
    if (cats.length !== 3) throw new Error(cats.length + ' categories');
    const nums = cats.map(c => Number(String(c).replace(/[^0-9.]/g, '')));
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] > nums[i - 1]) throw new Error('out of order: ' + nums.join(', '));
    }
  });

  await t.step('an entry can be deleted and the total follows', async () => {
    await page.click(`${money} [data-act="spend-del"] >> nth=0`);
    await page.waitForTimeout(200);
    const total = await page.textContent(`${money} .ms-n`);
    const n = Number(String(total).replace(/[^0-9.]/g, ''));
    if (!(n < 64)) throw new Error('total still reads ' + total);
  });

  await t.step('a budget gives a bar and a remaining figure', async () => {
    await page.evaluate(() => { window.prompt = () => '200'; });
    await page.click(`${money} [data-act="budget"]`);
    await page.waitForTimeout(300);
    if (!await page.locator(`${money} .ms-bar`).count()) throw new Error('no bar');
    const line = await page.textContent(`${money} .ms-b`);
    if (!/仲有/.test(line)) throw new Error('reads ' + line);
  });

  await t.step('going over budget says so instead of hiding it', async () => {
    await page.evaluate(() => { window.prompt = () => '10'; });
    await page.click(`${money} [data-act="budget"]`);
    await page.waitForTimeout(300);
    const line = await page.textContent(`${money} .ms-b`);
    if (!/超咗/.test(line)) throw new Error('reads ' + line);
    const over = await page.locator(`${money} .ms-bar i.over`).count();
    if (!over) throw new Error('the bar does not show the overrun');
  });

  await t.step('logging from a day attaches the spend to that day', async () => {
    await page.click('.tabbar .tab[data-tab="home"]');
    await page.waitForSelector('.subview[data-sub="home"]');
    await page.goto(BASE + '/index.html#/trip/spend/d2');
    await page.waitForSelector('.subview[data-sub="d2"] .stops');
    await page.click('.subview[data-sub="d2"] [data-act="spend-add"]');
    await page.waitForSelector('#spend-sheet');
    const selected = await page.inputValue('#spend-day');
    if (selected !== 'd2') throw new Error('the sheet preselected ' + (selected || '(nothing)'));
    await page.fill('#spend-amt', '9');
    await page.click('#spend-sheet [data-spend="save"]');
    await page.waitForSelector('#spend-sheet', { state: 'detached' });
  });

  await t.step('and it shows under that day', async () => {
    await page.click('.tabbar .tab[data-tab="money"]');
    await page.waitForSelector(money);
    const days = await page.locator(`${money} .kvb`).allTextContents();
    if (!days.some(d => /Day 2/.test(d) && /9/.test(d))) throw new Error('day rows: ' + days.join(' | '));
  });

  await t.step('a blank or zero amount is refused', async () => {
    await page.click(`${money} [data-act="spend-add"]`);
    await page.waitForSelector('#spend-sheet');
    await page.click('#spend-sheet [data-spend="save"]');
    await page.waitForTimeout(200);
    if (!await page.locator('#spend-sheet').count()) throw new Error('an empty entry was accepted');
    await page.fill('#spend-amt', '0');
    await page.click('#spend-sheet [data-spend="save"]');
    await page.waitForTimeout(200);
    if (!await page.locator('#spend-sheet').count()) throw new Error('zero was accepted');
    await page.click('#spend-sheet [data-spend="close"]');
  });

  await t.step('spend survives a reload', async () => {
    const before = await page.textContent(`${money} .ms-n`);
    await page.goto(BASE + '/index.html#/trip/spend/money');
    await page.waitForSelector(money);
    const after = await page.textContent(`${money} .ms-n`);
    if (before.trim() !== after.trim()) throw new Error(`${before} became ${after}`);
  });

  await t.step('logging money does not count as editing the plan', async () => {
    /* updatedAt drives the full re-render. If spend moved it, every
       entry would rebuild the trip and throw away its maps. */
    const moved = await page.evaluate(() => {
      const was = window.Store.get('spend').updatedAt;
      window.Store.addSpend('spend', { amount: 5, cat: 'other' });
      return window.Store.get('spend').updatedAt !== was;
    });
    if (moved) throw new Error('updatedAt moved');
  });

  const failed = t.done(errors);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
