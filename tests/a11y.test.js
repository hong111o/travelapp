/* Usable without sight, and without a mouse.
 *
 * The review found five aria- attributes across 4,700 lines: tick
 * buttons that read as a bare "✓", day cards that read as a run of
 * digits, modals that Tab walked straight out of, and photos with
 * alt="". These cover what replaced that. */
'use strict';

const { makeSuite, launch, BASE, openTrip } = require('./helpers.js');

const TRIP = {
  id: 'a11y', title: '無障礙測試', startDate: '2027-10-01', endDate: '2027-10-02',
  currency: { base: 'EUR', quote: 'GBP' },
  days: [
    { id: 'd1', date: '2027-10-01', title: '舊城', stops: [
      { title: 'Catedral', time: '10:00', mapQuery: 'catedral', lat: 36.72, lng: -4.42 },
      { title: 'Museo Picasso', time: '14:00', mapQuery: 'picasso', lat: 36.73, lng: -4.42 }
    ] },
    { id: 'd2', date: '2027-10-02', title: '海邊', stops: [
      { title: 'Playa', time: '11:00', mapQuery: 'playa', lat: 36.71, lng: -4.41 }
    ] }
  ]
};

(async () => {
  const t = makeSuite('a11y');
  const { browser, page, errors } = await launch();

  await page.goto(BASE + '/index.html');
  await page.evaluate(trip => { localStorage.clear(); window.Store.save(trip); }, TRIP);
  await openTrip(page, '無障礙測試');

  await t.step('every control has an accessible name', async () => {
    const nameless = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('#view-trip .subview.active button, .tabbar button').forEach(b => {
        const name = (b.getAttribute('aria-label') || b.textContent || '').trim();
        if (!name) out.push(b.className || b.outerHTML.slice(0, 60));
      });
      return out;
    });
    if (nameless.length) throw new Error(nameless.join(' / '));
  });

  await t.step('a day card is named, not spelled out as digits', async () => {
    const label = await page.getAttribute('.subview[data-sub="home"] .daycards .dcard', 'aria-label');
    if (!label || !/舊城/.test(label)) throw new Error('reads: ' + label);
  });

  await t.step('a tick button says what it ticks', async () => {
    await page.click('.subview[data-sub="home"] .daycards .dcard >> nth=0');
    await page.waitForSelector('.subview[data-sub="d1"] .stops');
    const label = await page.getAttribute('.subview[data-sub="d1"] .tick', 'aria-label');
    if (!label || !/Catedral/.test(label)) throw new Error('reads: ' + label);
  });

  await t.step('and reports whether it is ticked', async () => {
    const before = await page.getAttribute('.subview[data-sub="d1"] .tick', 'aria-pressed');
    await page.click('.subview[data-sub="d1"] .tick');
    await page.waitForTimeout(250);
    const after = await page.getAttribute('.subview[data-sub="d1"] .tick', 'aria-pressed');
    if (before !== 'false' || after !== 'true') throw new Error(`${before} -> ${after}`);
  });

  await t.step('the tab bar marks which tab you are on', async () => {
    const current = await page.locator('.tabbar .tab[aria-current="page"]').count();
    if (current !== 1) throw new Error(current + ' tabs claim to be current');
  });

  await t.step('a sheet is a dialog, labelled by its own heading', async () => {
    await page.click('.subview[data-sub="d1"] [data-act="spend-add"]');
    await page.waitForSelector('#spend-sheet');
    const role = await page.getAttribute('#spend-sheet', 'role');
    const modal = await page.getAttribute('#spend-sheet', 'aria-modal');
    const by = await page.getAttribute('#spend-sheet', 'aria-labelledby');
    if (role !== 'dialog' || modal !== 'true') throw new Error(`role=${role} modal=${modal}`);
    if (!by || !await page.locator('#' + by).count()) throw new Error('aria-labelledby points at ' + by);
  });

  await t.step('the page behind it is hidden from a screen reader', async () => {
    const hidden = await page.getAttribute('#view-trip', 'aria-hidden');
    if (hidden !== 'true') throw new Error('view-trip aria-hidden is ' + hidden);
  });

  await t.step('Tab cycles inside the sheet instead of escaping into the page', async () => {
    /* Real key presses: a synthetic KeyboardEvent does not move focus,
       so dispatching one would prove nothing either way. */
    await page.focus('#spend-amt');
    const escaped = [];
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      escaped.push(await page.evaluate(() => {
        const sheet = document.getElementById('spend-sheet');
        return !sheet.contains(document.activeElement);
      }));
    }
    if (escaped.some(Boolean)) throw new Error('focus left the dialog');
  });

  await t.step('Escape closes it', async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    if (await page.locator('#spend-sheet').count()) throw new Error('still open');
  });

  await t.step('closing restores the page to the screen reader', async () => {
    const hidden = await page.getAttribute('#view-trip', 'aria-hidden');
    if (hidden) throw new Error('view-trip is still aria-hidden=' + hidden);
  });

  await t.step('and puts focus back where it was', async () => {
    const act = await page.evaluate(() => document.activeElement &&
      document.activeElement.getAttribute('data-act'));
    if (act !== 'spend-add') throw new Error('focus landed on ' + act);
  });

  await t.step('the toast is announced rather than appearing silently', async () => {
    const live = await page.getAttribute('#toast', 'aria-live');
    const role = await page.getAttribute('#toast', 'role');
    if (live !== 'polite' || role !== 'status') throw new Error(`role=${role} live=${live}`);
  });

  await t.step('the packing list is a list, and each row names its item', async () => {
    await page.click('.tabbar .tab[data-tab="check"]');
    await page.waitForSelector('.subview[data-sub="check"]');
    await page.fill('#pk-new', '轉換插頭');
    await page.press('#pk-new', 'Enter');
    await page.waitForTimeout(250);
    const tag = await page.evaluate(() => {
      const l = document.querySelector('.subview[data-sub="check"] .pklist');
      return l && { list: l.tagName, row: l.firstElementChild && l.firstElementChild.tagName };
    });
    if (!tag || tag.list !== 'UL' || tag.row !== 'LI') throw new Error(JSON.stringify(tag));
    const label = await page.getAttribute('.subview[data-sub="check"] .pkrow .tick', 'aria-label');
    if (!label || !/轉換插頭/.test(label)) throw new Error('reads: ' + label);
  });

  await t.step('decorative chevrons are hidden from the reader', async () => {
    await page.click('.tabbar .tab[data-tab="home"]');
    await page.waitForSelector('.subview[data-sub="home"]');
    const exposed = await page.evaluate(() =>
      [...document.querySelectorAll('#view-trip .subview.active .arrow')]
        .filter(a => a.getAttribute('aria-hidden') !== 'true').length);
    if (exposed) throw new Error(exposed + ' chevrons are still announced');
  });

  const failed = t.done(errors);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
