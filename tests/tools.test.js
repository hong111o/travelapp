/* 要訂嘅嘢 as ticks, a converter for any pair, the trips-page bar, and
 * dragging the home cards into your own order. */
'use strict';

const { makeSuite, launch, BASE } = require('./helpers.js');

const TRIP = (id, title) => ({
  id, title, startDate: '2027-06-01', endDate: '2027-06-02',
  place: { name: '里斯本', lat: 38.72, lng: -9.14 },
  currency: { base: 'EUR', quote: 'GBP' },
  flights: [{ when: '去程', route: 'LGW → LIS', ref: 'X1' }],
  todos: [{ level: 'now', text: '**城堡** 訂飛' }, { level: 'soon', text: '租車' }],
  days: [{ id: 'd1', date: '2027-06-01', title: '第一日', stops: [{ title: 'A', time: '10:00', mapQuery: 'a' }] }]
});

/* Stand-in rate tables; the real hosts are unreachable from here. */
const TABLES = {
  eur: { date: '2027-06-01', eur: { eur: 1, gbp: 0.85, hkd: 8.5, jpy: 170, usd: 1.1 } },
  jpy: { date: '2027-06-01', jpy: { jpy: 1, hkd: 0.05, gbp: 0.005, eur: 0.0059 } }
};

const home = '.subview[data-sub="home"]';

(async () => {
  const t = makeSuite('tools');
  const errors = [];

  const setup = async (opts) => {
    const env = await launch(opts);
    let fxDown = false;
    await env.ctx.route(/currency-api/, route => {
      if (fxDown) return route.abort();
      const m = route.request().url().match(/currencies\/(\w+)\.json/);
      const tb = m && TABLES[m[1]];
      return tb ? route.fulfill({ json: tb }) : route.fulfill({ status: 404, body: '' });
    });
    await env.ctx.route(/open\.er-api\.com/, route => route.abort());
    await env.page.goto(BASE + '/index.html');
    await env.page.evaluate(trips => { localStorage.clear(); trips.forEach(x => window.Store.save(x)); },
      [TRIP('t1', '甲行程'), TRIP('t2', '乙行程')]);
    env.netDown = (v) => { fxDown = v; };
    return env;
  };

  /* ---------------- phone ---------------- */
  {
    const env = await setup();
    const { page } = env;
    const open = async (id) => {
      await page.goto('about:blank');
      await page.goto(BASE + '/index.html#/trip/' + id + '/home');
      await page.waitForSelector(home + ' .hero h1');
    };

    await open('t1');

    await t.step('要訂嘅嘢 has a tick box per item and a count', async () => {
      const ticks = await page.locator(`${home} .book [data-act="todo"]`).count();
      if (ticks !== 2) throw new Error(ticks + ' tick boxes');
      const n = await page.textContent(`${home} .book .tdn`);
      if (!/0 \/ 2/.test(n)) throw new Error('count reads ' + n);
    });

    await t.step('ticking one strikes it through and survives a reload', async () => {
      await page.click(`${home} .book [data-act="todo"] >> nth=0`);
      await page.waitForTimeout(200);
      if (!await page.locator(`${home} .book li.done`).count()) throw new Error('not marked');
      await open('t1');
      const n = await page.textContent(`${home} .book .tdn`);
      if (!/1 \/ 2/.test(n)) throw new Error('after reload reads ' + n);
    });

    await t.step('ticking is a record, not an edit to the plan', async () => {
      const moved = await page.evaluate(() => {
        const tr = window.Store.get('t1'), was = tr.updatedAt;
        window.Store.setTodoDone('t1', tr.todos[1].uid, true);
        return window.Store.get('t1').updatedAt !== was;
      });
      if (moved) throw new Error('updatedAt moved');
    });

    await t.step('the converter opens on the trip currency and your own', async () => {
      await page.waitForFunction(() => /1 EUR/.test(document.getElementById('fx-rate').textContent));
      const a = await page.inputValue('#fx-ca'), b = await page.inputValue('#fx-cb');
      if (a !== 'EUR' || b !== 'GBP') throw new Error(`${a} → ${b}`);
    });

    await t.step('either side can be any currency', async () => {
      const n = await page.locator('#fx-cb option').count();
      if (n < 30) throw new Error('only ' + n + ' currencies');
      await page.selectOption('#fx-cb', 'HKD');
      await page.waitForTimeout(150);
      const v = await page.inputValue('#fx-b');
      if (Number(v) !== 850) throw new Error('100 EUR came out as ' + v + ' HKD');
    });

    await t.step('your own currency follows you to the next trip', async () => {
      await open('t2');
      await page.waitForFunction(() => /1 EUR/.test(document.getElementById('fx-rate').textContent));
      const b = await page.inputValue('#fx-cb');
      if (b !== 'HKD') throw new Error('second trip opened on ' + b);
    });

    await t.step('changing the local side is remembered for that trip only', async () => {
      await page.selectOption('#fx-ca', 'JPY');
      await page.waitForFunction(() => /1 JPY/.test(document.getElementById('fx-rate').textContent));
      await open('t1');
      const a1 = await page.inputValue('#fx-ca');
      await open('t2');
      const a2 = await page.inputValue('#fx-ca');
      if (a1 !== 'EUR' || a2 !== 'JPY') throw new Error(`t1 ${a1}, t2 ${a2}`);
    });

    await t.step('offline, it converts with the last rate it saw and says so', async () => {
      env.netDown(true);
      await open('t2');
      await page.waitForTimeout(400);
      const upd = await page.textContent('#fx-upd');
      const v = await page.inputValue('#fx-b');
      if (!/上次/.test(upd)) throw new Error('reads ' + upd);
      if (!v) throw new Error('nothing converted');
      env.netDown(false);
    });

    await t.step('the trips page has its own bar on a phone, hidden inside a trip', async () => {
      if (await page.locator('.libbar').isVisible()) throw new Error('library bar shows inside a trip');
      await page.goto(BASE + '/index.html');
      await page.waitForSelector('#lib-list .tripitem');
      const box = await page.locator('.libbar').boundingBox();
      if (!box || box.y < 800) throw new Error('not at the bottom: ' + JSON.stringify(box));
      if (await page.locator('.libbar [data-lib="new"]').isVisible()) throw new Error('sidebar-only entry shows on a phone');
    });

    await t.step('settings gathers theme, restore, layout reset and update', async () => {
      await page.click('.libbar [data-lib="settings"]');
      await page.waitForSelector('#set-sheet');
      for (const k of ['theme', 'restore', 'layout', 'update']) {
        if (!await page.locator(`#set-sheet [data-set="${k}"]`).count()) throw new Error('no ' + k);
      }
      await page.keyboard.press('Escape');
    });

    /* ---- arranging ---- */
    const cardOrder = () => page.evaluate(() =>
      [...document.querySelectorAll('.subview[data-sub="home"] .hs')]
        .map(e => ({ k: e.dataset.card, top: e.getBoundingClientRect().top }))
        .sort((a, b) => a.top - b.top).map(e => e.k));

    await open('t1');
    const before = await cardOrder();

    await t.step('arrange mode collapses every card to a bar with a grip', async () => {
      await page.click(`${home} [data-act="lay-start"]`);
      await page.waitForSelector(`${home} .hs-bar`);
      const bars = await page.locator(`${home} .hs-bar`).count();
      if (bars !== before.length) throw new Error(`${bars} bars for ${before.length} cards`);
      if (await page.locator(`${home} .daycards`).first().isVisible()) throw new Error('card contents still showing');
    });

    await t.step('a card can be dragged to another place', async () => {
      const grip = page.locator(`${home} .hs[data-card="todos"] .hs-grip`);
      const target = page.locator(`${home} .hs[data-card="${before[0]}"] .hs-bar`);
      const g = await grip.boundingBox(), tb = await target.boundingBox();
      await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(g.x + g.width / 2, g.y + (tb.y - g.y - 10) * i / 12);
        await page.waitForTimeout(16);
      }
      await page.mouse.up();
      await page.waitForTimeout(250);
      const now = await cardOrder();
      if (now[0] !== 'todos') throw new Error('order now ' + now.join(','));
    });

    await t.step('the arrows move a card one place, for keyboards', async () => {
      const was = await cardOrder();
      const second = was[1];
      await page.click(`${home} [data-act="lay-up"][data-key="${second}"]`);
      await page.waitForTimeout(150);
      const now = await cardOrder();
      if (now[0] !== second) throw new Error('order now ' + now.join(','));
    });

    await t.step('done shows the cards again, in the new order', async () => {
      const arranged = await cardOrder();
      await page.click(`${home} [data-act="lay-done"]`);
      await page.waitForSelector(`${home} .daycards`);
      if (await page.locator(`${home} .hs-bar`).count()) throw new Error('still collapsed');
      const now = await cardOrder();
      if (now.join() !== arranged.join()) throw new Error(`${arranged.join()} became ${now.join()}`);
    });

    await t.step('the order is the same for every trip', async () => {
      const mine = await cardOrder();
      await open('t2');
      const other = await cardOrder();
      if (mine.join() !== other.join()) throw new Error('t2: ' + other.join());
    });

    await t.step('還原預設 puts the default order back', async () => {
      await page.click(`${home} [data-act="lay-start"]`);
      await page.click(`${home} [data-act="lay-reset"]`);
      await page.click(`${home} [data-act="lay-done"]`);
      await page.waitForSelector(`${home} .daycards`);
      const now = await cardOrder();
      if (now.join() !== before.join()) throw new Error('reads ' + now.join());
    });

    errors.push(...env.errors);
    await env.browser.close();
  }

  /* ---------------- desktop ---------------- */
  {
    const env = await setup({ viewport: { width: 1440, height: 900 } });
    const { page } = env;

    await t.step('the trips page has a sidebar on a desktop, with the tools', async () => {
      await page.goto(BASE + '/index.html');
      await page.waitForSelector('#lib-list .tripitem');
      const box = await page.locator('.libbar').boundingBox();
      if (box.x !== 0 || box.width > 300 || box.height < 800) throw new Error(JSON.stringify(box));
      for (const k of ['new', 'paste', 'import', 'hotels', 'sync', 'settings']) {
        if (!await page.locator(`.libbar [data-lib="${k}"]`).isVisible()) throw new Error('no ' + k);
      }
      const card = await page.locator('#lib-list .tripitem').first().boundingBox();
      if (card.x < box.width) throw new Error('trips sit under the sidebar');
    });

    await t.step('on a desktop a card can be sent to the other column', async () => {
      await page.goto(BASE + '/index.html#/trip/t1/home');
      await page.waitForSelector(home + ' .daycards');
      await page.click(`${home} [data-act="lay-start"]`);
      await page.waitForSelector(`${home} .hs-bar`);
      if (!await page.locator(`${home} .hside [data-card="fx"]`).count()) throw new Error('fx did not start on the right');
      await page.click(`${home} [data-act="lay-col"][data-key="fx"]`);
      await page.waitForTimeout(150);
      if (!await page.locator(`${home} .hmain [data-card="fx"]`).count()) throw new Error('fx did not move left');
      await page.click(`${home} [data-act="lay-done"]`);
      await page.waitForSelector(`${home} .hmain .fxcard`);
    });

    errors.push(...env.errors);
    await env.browser.close();
  }

  const failed = t.done(errors);
  process.exit(failed ? 1 : 0);
})();
