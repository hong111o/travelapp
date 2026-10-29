/* Getting around a trip.
 *
 * The app was a hub and spoke: every move went back through the home
 * screen, and every navigation ended at scroll position zero. These
 * cover the things that replaced that. */
'use strict';

const { makeSuite, launch, BASE, openTrip } = require('./helpers.js');

/* Long enough that the home screen scrolls and the day list is a list. */
function longTrip() {
  const days = [];
  for (let i = 0; i < 9; i++) {
    days.push({
      id: 'd' + (i + 1),
      date: '',
      title: '第 ' + (i + 1) + ' 日',
      stops: [
        { title: '景點 ' + (i + 1) + 'A', time: '10:00', mapQuery: 'a' + i, lat: 38.70 + i * 0.01, lng: -9.14 },
        { title: '景點 ' + (i + 1) + 'B', time: '15:00', mapQuery: 'b' + i, lat: 38.71 + i * 0.01, lng: -9.13 }
      ]
    });
  }
  return {
    id: 'nav', title: '導覽測試', startDate: '2027-07-01', endDate: '2027-07-09',
    currency: { base: 'EUR', quote: 'GBP' },
    food: { quick: [{ when: 'D1 午餐', name: '某餐廳' }], picks: [], legend: '' },
    days
  };
}

(async () => {
  const t = makeSuite('nav');
  const { browser, page, errors } = await launch();

  await page.goto(BASE + '/index.html');
  await page.evaluate(trip => { localStorage.clear(); window.Store.save(trip); }, longTrip());
  await openTrip(page, '導覽測試');

  await t.step('the tab bar is there and reachable from the home screen', async () => {
    const tabs = await page.locator('.tabbar .tab').count();
    if (tabs < 4) throw new Error('only ' + tabs + ' tabs');
  });

  await t.step('it stays put when you open a day', async () => {
    await page.click('.subview[data-sub="home"] .daycards .dcard >> nth=0');
    await page.waitForSelector('.subview[data-sub="d1"] .stops');
    if (!await page.locator('.tabbar').isVisible()) throw new Error('tab bar vanished');
  });

  await t.step('a day screen still counts as the 行程 tab', async () => {
    const on = await page.locator('.tabbar .tab.on').getAttribute('data-tab');
    if (on !== 'home') throw new Error('lit tab is ' + on);
  });

  await t.step('one day leads to the next without going home', async () => {
    await page.click('.subview[data-sub="d1"] .daystep-b');
    await page.waitForSelector('.subview[data-sub="d2"] .stops');
    const visible = await page.locator('.subview[data-sub="d2"]').isVisible();
    if (!visible) throw new Error('did not land on day 2');
  });

  await t.step('the first day offers next only, the last offers previous only', async () => {
    await page.goto(BASE + '/index.html#/trip/nav/d1');
    await page.waitForSelector('.subview[data-sub="d1"] .stops');
    const first = await page.locator('.subview[data-sub="d1"] .daystep-b').count();
    await page.goto(BASE + '/index.html#/trip/nav/d9');
    await page.waitForSelector('.subview[data-sub="d9"] .stops');
    const last = await page.locator('.subview[data-sub="d9"] .daystep-b').count();
    if (first !== 1) throw new Error('day 1 has ' + first + ' steps');
    if (last !== 1) throw new Error('day 9 has ' + last + ' steps');
  });

  await t.step('a middle day offers both', async () => {
    await page.goto(BASE + '/index.html#/trip/nav/d5');
    await page.waitForSelector('.subview[data-sub="d5"] .stops');
    const n = await page.locator('.subview[data-sub="d5"] .daystep-b').count();
    if (n !== 2) throw new Error('day 5 has ' + n + ' steps');
  });

  await t.step('coming back to the home screen keeps your place in it', async () => {
    await page.goto(BASE + '/index.html#/trip/nav');
    await page.waitForSelector('.subview[data-sub="home"] .daycards');
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForTimeout(150);
    const before = await page.evaluate(() => window.pageYOffset);
    if (before < 300) throw new Error('home does not scroll; the test would prove nothing');

    /* Leave and return through the tab bar. It is fixed, so the driver
       never scrolls the page to reach it — clicking a day card makes
       Playwright scroll the card into view first, which moves the very
       position this is measuring. */
    await page.click('.tabbar .tab[data-tab="check"]');
    await page.waitForSelector('.subview[data-sub="check"]');
    await page.waitForTimeout(150);
    await page.click('.tabbar .tab[data-tab="home"]');
    await page.waitForSelector('.subview[data-sub="home"] .daycards');
    await page.waitForTimeout(250);

    const after = await page.evaluate(() => window.pageYOffset);
    if (Math.abs(after - before) > 60) throw new Error(`left at ${before}, came back to ${after}`);
  });

  await t.step('a screen you have not seen still opens at the top', async () => {
    await page.click('.tabbar .tab[data-tab="check"]');
    await page.waitForSelector('.subview[data-sub="check"]');
    await page.waitForTimeout(200);
    const y = await page.evaluate(() => window.pageYOffset);
    if (y > 40) throw new Error('opened at ' + y);
  });

  await t.step('swiping left moves to the next day', async () => {
    await page.goto(BASE + '/index.html#/trip/nav/d3');
    await page.waitForSelector('.subview[data-sub="d3"] .stops');
    await page.evaluate(() => {
      const view = document.getElementById('view-trip');
      const touch = (type, x, y) => {
        const t = new Touch({ identifier: 1, target: view, clientX: x, clientY: y });
        view.dispatchEvent(new TouchEvent(type, {
          bubbles: true, cancelable: true,
          touches: type === 'touchend' ? [] : [t],
          changedTouches: [t]
        }));
      };
      touch('touchstart', 320, 400);
      touch('touchend', 120, 410);
    });
    await page.waitForSelector('.subview[data-sub="d4"] .stops');
    if (!await page.locator('.subview[data-sub="d4"]').isVisible()) throw new Error('did not advance');
  });

  await t.step('a mostly vertical drag does not change day', async () => {
    await page.goto(BASE + '/index.html#/trip/nav/d3');
    await page.waitForSelector('.subview[data-sub="d3"] .stops');
    await page.evaluate(() => {
      const view = document.getElementById('view-trip');
      const touch = (type, x, y) => {
        const t = new Touch({ identifier: 1, target: view, clientX: x, clientY: y });
        view.dispatchEvent(new TouchEvent(type, {
          bubbles: true, cancelable: true,
          touches: type === 'touchend' ? [] : [t],
          changedTouches: [t]
        }));
      };
      touch('touchstart', 300, 200);
      touch('touchend', 220, 600);    /* 80 across, 400 down: a scroll */
    });
    await page.waitForTimeout(250);
    if (!await page.locator('.subview[data-sub="d3"]').isVisible()) throw new Error('a scroll changed the day');
  });

  await t.step('the days are their own section, not mixed with the tools', async () => {
    await page.goto(BASE + '/index.html#/trip/nav');
    await page.waitForSelector('.subview[data-sub="home"] .daycards');
    const inSequence = await page.locator('.subview[data-sub="home"] .daycards:not(.statuscards) .dcard').count();
    if (inSequence !== 9) throw new Error(inSequence + ' cards in the day sequence, expected 9');
    const heading = await page.locator('.subview[data-sub="home"] .secttl').count();
    if (!heading) throw new Error('the day sequence has no heading');
  });

  const failed = t.done(errors);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
