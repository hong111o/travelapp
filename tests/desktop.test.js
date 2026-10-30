/* The desktop layout.
 *
 * From 1024px the tab bar is a sidebar, the home screen splits into the
 * plan and the reference cards, and a day sets its stops beside its map.
 * The phone layout must come through untouched: the home markup is
 * grouped by column, and only flex `order` keeps the phone sequence. */
'use strict';

const { makeSuite, launch, BASE } = require('./helpers.js');

const TRIP = {
  id: 'desk', title: '桌面測試', startDate: '2027-12-01', endDate: '2027-12-02',
  place: { name: '里斯本', lat: 38.72, lng: -9.14 },
  currency: { base: 'EUR', quote: 'GBP' },
  flights: [{ when: '去程', route: 'LGW → LIS', ref: 'X1' }],
  infoCards: [{ icon: '⏱️', title: '關鍵時間', rows: [{ k: 'D1', v: '10:00', sub: '' }] }],
  todos: [{ level: 'now', text: '訂飛' }],
  days: [
    { id: 'd1', date: '2027-12-01', title: '第一日', drawRoute: true, stops: [
      { title: 'A', time: '10:00', mapQuery: 'a', lat: 38.70, lng: -9.14 },
      { title: 'B', time: '12:00', mapQuery: 'b', lat: 38.71, lng: -9.13 } ] },
    { id: 'd2', date: '2027-12-02', title: '第二日', stops: [{ title: 'C', time: '10:00', mapQuery: 'c' }] }
  ]
};

/* What a phone sees, top to bottom, as the cards' own headings. */
async function phoneSequence(page) {
  return page.evaluate(() => [...document.querySelectorAll('.subview[data-sub="home"] .hs')]
    .map(e => ({ top: e.getBoundingClientRect().top, order: Number(e.style.order) }))
    .sort((a, b) => a.top - b.top)
    .map(e => e.order));
}

(async () => {
  const t = makeSuite('desktop');
  const errors = [];

  {
    const { browser, page, errors: e } = await launch({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE + '/index.html');
    await page.evaluate(trip => { localStorage.clear(); window.Store.save(trip); }, TRIP);
    await page.goto(BASE + '/index.html#/trip/desk/home');
    await page.waitForSelector('.subview[data-sub="home"] .daycards');
    await page.waitForTimeout(300);

    await t.step('the tab bar becomes a sidebar on the left', async () => {
      const box = await page.locator('#view-trip .tabbar').boundingBox();
      if (box.x !== 0 || box.width > 300 || box.height < 800) throw new Error(JSON.stringify(box));
    });

    await t.step('the sidebar says which trip you are in and leads back to the shelf', async () => {
      const brand = await page.textContent('#view-trip .sb-brand');
      if (!/桌面測試/.test(brand)) throw new Error('reads ' + brand);
      if (!await page.locator('#view-trip .tab-lib').isVisible()) throw new Error('no way back');
    });

    await t.step('the content does not slide under the sidebar', async () => {
      const side = await page.locator('#view-trip .tabbar').boundingBox();
      const card = await page.locator('.subview[data-sub="home"] .daycards .dcard').first().boundingBox();
      if (card.x < side.x + side.width) throw new Error(`card at ${card.x}, sidebar ends ${side.x + side.width}`);
    });

    await t.step('home splits into the plan and the reference cards', async () => {
      const main = await page.locator('.hmain').boundingBox();
      const side = await page.locator('.hside').boundingBox();
      if (!(side.x > main.x + main.width - 1)) throw new Error('columns overlap or stack');
      if (Math.abs(side.y - main.y) > 4) throw new Error('columns start at different heights');
      if (!await page.locator('.hmain .daycards').count()) throw new Error('the days are not in the plan column');
      if (!await page.locator('.hside .wxcard').count()) throw new Error('weather is not in the side column');
    });

    await t.step('a day sets its stops beside its map', async () => {
      await page.click('#view-trip .tabbar .tab[data-tab="home"]');
      await page.click('.subview[data-sub="home"] .daycards .dcard >> nth=0');
      await page.waitForSelector('.subview[data-sub="d1"] .daymap');
      await page.waitForTimeout(300);
      const stops = await page.locator('.subview[data-sub="d1"] .stops').boundingBox();
      const map = await page.locator('.subview[data-sub="d1"] .daymap').boundingBox();
      if (!(map.x > stops.x + stops.width - 1)) throw new Error('map is not beside the list');
      if (map.height < 340) throw new Error('map is only ' + map.height + 'px tall');
    });

    await t.step('the map stays in view while the list scrolls', async () => {
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.waitForTimeout(200);
      const map = await page.locator('.subview[data-sub="d1"] .daymap').boundingBox();
      if (map.y < 0 || map.y > 200) throw new Error('map top is at ' + map.y);
    });

    await t.step('a day with no coordinates keeps a single column', async () => {
      await page.goto(BASE + '/index.html#/trip/desk/d2');
      await page.waitForSelector('.subview[data-sub="d2"] .stops');
      const cls = await page.getAttribute('.subview[data-sub="d2"] .daybody', 'class');
      if (/hasmap/.test(cls)) throw new Error('a map-less day reserved space for a map');
    });

    errors.push(...e);
    await browser.close();
  }

  {
    const { browser, page, errors: e } = await launch({ viewport: { width: 420, height: 900 } });
    await page.goto(BASE + '/index.html');
    await page.evaluate(trip => { localStorage.clear(); window.Store.save(trip); }, TRIP);
    await page.goto(BASE + '/index.html#/trip/desk/home');
    await page.waitForSelector('.subview[data-sub="home"] .daycards');
    await page.waitForTimeout(300);

    await t.step('on a phone the home screen keeps its original order', async () => {
      const seq = await phoneSequence(page);
      const sorted = seq.slice().sort((a, b) => a - b);
      if (seq.join() !== sorted.join()) throw new Error('reads ' + seq.join(', '));
    });

    await t.step('on a phone the bar is at the bottom and the sidebar extras are hidden', async () => {
      const box = await page.locator('#view-trip .tabbar').boundingBox();
      if (box.y < 800) throw new Error('bar is at y=' + box.y);
      if (await page.locator('#view-trip .sb-brand').isVisible()) throw new Error('brand shows on a phone');
      if (await page.locator('#view-trip .tab-lib').isVisible()) throw new Error('shelf link shows on a phone');
    });

    await t.step('on a phone a day still puts the map under the list', async () => {
      await page.goto(BASE + '/index.html#/trip/desk/d1');
      await page.waitForSelector('.subview[data-sub="d1"] .daymap');
      const stops = await page.locator('.subview[data-sub="d1"] .stops').boundingBox();
      const map = await page.locator('.subview[data-sub="d1"] .daymap').boundingBox();
      if (!(map.y > stops.y + stops.height - 1)) throw new Error('map is not below the list');
    });

    errors.push(...e);
    await browser.close();
  }

  const failed = t.done(errors);
  process.exit(failed ? 1 : 0);
})();
