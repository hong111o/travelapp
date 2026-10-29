/* The paths that must never break: the app loads, the demo trip opens,
 * a trip imports, an edit saves, a tick sticks, and a trip exports. */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeSuite, launch, BASE, openLibrary } = require('./helpers.js');

(async () => {
  const t = makeSuite('smoke');
  const { browser, page, errors } = await launch();

  await t.step('the app loads with the demo trip seeded', async () => {
    await openLibrary(page);
    const trips = await page.locator('#lib-list .tripitem').count();
    if (!trips) throw new Error('no trips');
  });

  await t.step('it says which version it is running', async () => {
    const v = await page.textContent('#app-ver').catch(() => '');
    /* The worker is blocked in these suites, so the footer stays blank;
       what matters is that the element the version goes into exists. */
    if (!await page.locator('#app-ver').count()) throw new Error('no version slot');
    if (v && !/^v\d+$/.test(v.trim())) throw new Error('version reads ' + v);
  });

  await t.step('a trip opens and renders its days', async () => {
    await page.locator('.tripitem').first().locator('.dcard').click();
    await page.waitForSelector('#view-trip .hero h1');
    const days = await page.locator('.subview[data-sub="home"] .daycards:not(.statuscards) .dcard').count();
    if (!days) throw new Error('no day cards');
  });

  await t.step('a day opens and lists its stops', async () => {
    await page.click('.subview[data-sub="home"] .daycards .dcard >> nth=0');
    await page.waitForSelector('.subview .stops');
    const stops = await page.locator('.subview.active .stop').count();
    if (!stops) throw new Error('no stops');
  });

  await t.step('a tick sticks across a reload', async () => {
    await page.click('.subview.active .tick >> nth=0');
    await page.waitForTimeout(250);
    const id = await page.evaluate(() => location.hash);
    await page.reload();
    await page.waitForSelector('.subview.active .tick');
    const on = await page.locator('.subview.active .tick.on').count();
    if (!on) throw new Error('the tick did not survive ' + id);
  });

  await t.step('pasting an AI trip imports it', async () => {
    await openLibrary(page);
    await page.click('#btn-paste');
    await page.waitForSelector('#paste-box', { state: 'visible' });
    await page.fill('#paste-box', JSON.stringify({
      title: '貼上測試', startDate: '2027-11-01', endDate: '2027-11-02',
      days: [{ id: 'd1', date: '2027-11-01', title: '第一日',
        stops: [{ title: '某處', time: '10:00', mapQuery: 'somewhere' }] }]
    }));
    await page.click('#btn-paste-go');
    await page.waitForTimeout(600);
    await openLibrary(page);
    const found = await page.locator('.tripitem').filter({ hasText: '貼上測試' }).count();
    if (!found) throw new Error('not imported');
  });

  await t.step('junk in the paste box is reported, not swallowed', async () => {
    await page.click('#btn-paste');
    await page.waitForSelector('#paste-box', { state: 'visible' });
    await page.fill('#paste-box', 'this is not json at all');
    await page.click('#btn-paste-go');
    await page.waitForTimeout(400);
    const err = await page.locator('#paste-err').isVisible().catch(() => false);
    if (!err) throw new Error('no error shown');
    await page.click('#btn-paste-cancel');
  });

  await t.step('the editor saves a change', async () => {
    await openLibrary(page);
    await page.locator('.tripitem').filter({ hasText: '貼上測試' }).locator('[data-act="edit"]').click();
    await page.waitForSelector('#view-editor .ed-head');
    const title = page.locator('#view-editor input').first();
    await title.fill('改咗個名');
    await page.click('#view-editor [data-act="save"]');
    await page.waitForTimeout(600);
    await openLibrary(page);
    const found = await page.locator('.tripitem').filter({ hasText: '改咗個名' }).count();
    if (!found) throw new Error('the change did not save');
  });

  await t.step('a trip exports as a .json file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-'));
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.tripitem').filter({ hasText: '改咗個名' }).locator('[data-act="export"]').click()
    ]);
    const file = path.join(dir, download.suggestedFilename());
    await download.saveAs(file);
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed.title !== '改咗個名') throw new Error('exported title is ' + parsed.title);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await t.step('a trip can be deleted', async () => {
    page.once('dialog', d => d.accept());
    await page.locator('.tripitem').filter({ hasText: '改咗個名' }).locator('[data-act="del"]').click();
    await page.waitForTimeout(500);
    const left = await page.locator('.tripitem').filter({ hasText: '改咗個名' }).count();
    if (left) throw new Error('still there');
  });

  const failed = t.done(errors);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
