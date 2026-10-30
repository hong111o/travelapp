/* Comparing hotels.
 *
 * The AI step happens outside the app, so the test plays the AI: it
 * reads the prompt the app copied, and pastes back a reply in the format
 * the prompt asks for. */
'use strict';

const { makeSuite, launch, BASE } = require('./helpers.js');

const TRIP = {
  id: 'h', title: 'Málaga', place: { name: '馬拉加', lat: 36.72, lng: -4.42 },
  startDate: '2027-09-18', endDate: '2027-09-21',
  days: [{ id: 'd1', date: '2027-09-18', title: '舊城', stops: [
    { title: 'Catedral', time: '10:00', mapQuery: 'c', lat: 36.7201, lng: -4.4197 },
    { title: 'Alcazaba', time: '12:00', mapQuery: 'a', lat: 36.7215, lng: -4.4159 },
    { title: 'Picasso', time: '15:00', mapQuery: 'p', lat: 36.7215, lng: -4.4176 }
  ] }]
};

const LINKS = [
  'https://www.booking.com/hotel/es/soho-bahia-malaga.html?checkin=2027-09-18',
  'https://www.expedia.com/Malaga-Hotels-Room-Mate-Valeria.h1234567.Hotel-Information',
  'https://www.airbnb.com/rooms/987654'
];

/* What a browsing AI would send back: fenced, with a preface, as people get. */
const REPLY = '好，以下係比較：\n```json\n' + JSON.stringify([
  { url: LINKS[0], name: 'Hotel Soho Bahía', platform: 'Booking.com', pricePerNight: 140, total: 420,
    currency: 'EUR', rating: 8.6, ratingScale: 10, reviews: 2210, address: 'Calle Córdoba 5',
    lat: 36.7190, lng: -4.4230, freeCancel: true, breakfast: false,
    pros: ['近火車站', '房間新淨'], cons: ['隔音一般'], notes: 'check-in 15:00' },
  { url: LINKS[1], name: 'Room Mate Valeria', platform: 'Expedia', pricePerNight: 120, total: 360,
    currency: 'EUR', rating: 9.1, ratingScale: 10, reviews: 1830, address: 'Plaza de la Marina',
    lat: 36.7190, lng: -4.4190, freeCancel: false, breakfast: true, pros: ['天台泳池'], cons: [] },
  { url: LINKS[2], name: '海景公寓', platform: 'Airbnb', pricePerNight: 160, total: 480,
    currency: 'EUR', rating: 4.7, ratingScale: 5, reviews: 88, address: 'Paseo Marítimo',
    lat: 36.7190, lng: -4.4000, freeCancel: null, breakfast: null, pros: ['海景'], cons: ['行去舊城要 25 分鐘'] }
], null, 1) + '\n```\n希望幫到你！';

const view = '.subview[data-sub="hotels"]';

(async () => {
  const t = makeSuite('hotels');
  const { browser, ctx, page, errors } = await launch({ viewport: { width: 1280, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ctx.route(/tile\.openstreetmap/, r => r.abort());

  await page.goto(BASE + '/index.html');
  await page.evaluate(trips => { localStorage.clear(); trips.forEach(x => window.Store.save(x)); },
    [TRIP, Object.assign({}, TRIP, { id: 'h2', title: 'Sevilla' })]);
  await page.goto(BASE + '/index.html#/trip/h/home');
  await page.waitForSelector('.subview[data-sub="home"] .daycards');

  await t.step('the trip home offers a hotel comparison card', async () => {
    await page.click('.subview[data-sub="home"] .dcard.hccard');
    await page.waitForSelector(view);
  });

  await t.step('the prompt carries the links, the dates and the places you are going', async () => {
    await page.fill('#hc-links', LINKS.join('\n') + '\n' + LINKS[0]);
    await page.click(`${view} [data-act="hc-prompt"]`);
    await page.waitForTimeout(250);
    const p = await page.evaluate(() => navigator.clipboard.readText());
    for (const want of [LINKS[0], LINKS[1], LINKS[2], '2027-09-18', '3 晚', 'Alcazaba', '"pricePerNight"']) {
      if (!p.includes(want)) throw new Error('prompt lacks ' + want);
    }
    if (p.split(LINKS[0]).length !== 2) throw new Error('a repeated link was listed twice');
  });

  await t.step('the AI reply pastes in, preface and fence and all', async () => {
    await page.fill('#hc-reply', REPLY);
    await page.click(`${view} [data-act="hc-import"]`);
    await page.waitForSelector(`${view} .hc-card`);
    const n = await page.locator(`${view} .hc-card`).count();
    if (n !== 3) throw new Error(n + ' cards');
  });

  await t.step('cheapest, best-rated and nearest are each marked', async () => {
    const badge = async (cls) => page.locator(`${view} .hc-card:has(.hc-badge.${cls}) h3`).allTextContents();
    const cheap = await badge('cheap'), rated = await badge('rated'), near = await badge('near');
    if (cheap.join() !== 'Room Mate Valeria') throw new Error('cheapest: ' + cheap);
    /* 4.7 / 5 is 9.4 / 10, which beats 9.1. */
    if (rated.join() !== '海景公寓') throw new Error('best rated: ' + rated);
    if (near.join() !== 'Room Mate Valeria') throw new Error('nearest: ' + near);
  });

  await t.step('location is measured against your own stops', async () => {
    const txt = await page.textContent(`${view} .hc-card:has(h3:text("海景公寓")) .hc-facts`);
    if (!/平均離景點 1\.\d km/.test(txt) || !/1 \/ 3 個行得到/.test(txt)) throw new Error('reads ' + txt);
  });

  await t.step('all of them are on one map with your stops', async () => {
    await page.waitForSelector('#hc-map .leaflet-marker-icon');
    const hotels = await page.locator('#hc-map .hmk').count();
    const stops = await page.locator('#hc-map .smk').count();
    if (hotels !== 3 || stops !== 3) throw new Error(`${hotels} hotels, ${stops} stops`);
  });

  await t.step('pasting a second reply updates a hotel instead of duplicating it', async () => {
    /* Once there are hotels the reply box is folded away; open it as a
       person would. */
    await page.click(`${view} .hc-paste summary`);
    await page.fill('#hc-reply', JSON.stringify([{ url: LINKS[1] + '&x=1', name: 'Room Mate Valeria', total: 330 }]));
    await page.click(`${view} [data-act="hc-import"]`);
    await page.waitForTimeout(400);
    const n = await page.locator(`${view} .hc-card`).count();
    const facts = await page.textContent(`${view} .hc-card:has(h3:text("Room Mate Valeria")) .hc-facts`);
    if (n !== 3) throw new Error(n + ' cards');
    if (!/330/.test(facts)) throw new Error('total not updated: ' + facts);
    if (!/9\.1/.test(facts)) throw new Error('the rating was lost in the update');
  });

  await t.step('a hotel can be edited by hand', async () => {
    await page.click(`${view} .hc-card:has(h3:text("Hotel Soho Bahía")) [data-act="hc-edit"]`);
    await page.waitForSelector('#hc-sheet');
    await page.fill('#hc-total', '399');
    await page.fill('#hc-cons', '隔音一般\n冇泳池');
    await page.click('#hc-sheet [data-hc="save"]');
    await page.waitForSelector('#hc-sheet', { state: 'detached' });
    const card = await page.textContent(`${view} .hc-card:has(h3:text("Hotel Soho Bahía"))`);
    if (!/399/.test(card) || !/冇泳池/.test(card)) throw new Error('reads ' + card);
  });

  await t.step('one link added by hand gets its name from the link', async () => {
    await page.fill('#hc-links', 'https://www.booking.com/hotel/es/molina-lario.en-gb.html');
    await page.click(`${view} [data-act="hc-manual"]`);
    await page.waitForSelector('#hc-sheet');
    const name = await page.inputValue('#hc-name');
    if (!/Molina Lario/i.test(name)) throw new Error('name guessed as ' + name);
    await page.fill('#hc-loc', '36.7196, -4.4196');
    await page.click('#hc-sheet [data-hc="save"]');
    await page.waitForSelector('#hc-sheet', { state: 'detached' });
    if (await page.locator(`${view} .hc-card`).count() !== 4) throw new Error('not added');
  });

  await t.step('a bad map link in the form is reported, not saved', async () => {
    await page.click(`${view} [data-act="hc-manual"]`);
    await page.waitForSelector('#hc-sheet');
    await page.fill('#hc-name', '某酒店');
    await page.fill('#hc-loc', 'not a place');
    await page.click('#hc-sheet [data-hc="save"]');
    await page.waitForTimeout(200);
    if (!await page.locator('#hc-sheet-err').isVisible()) throw new Error('no error shown');
    await page.click('#hc-sheet [data-hc="close"]');
  });

  await t.step('choosing one makes it the trip\'s hotel', async () => {
    await page.click(`${view} .hc-card:has(h3:text("Room Mate Valeria")) [data-act="hc-pick"]`);
    await page.waitForSelector(`${view} .hc-card.chosen`);
    const hotels = await page.evaluate(() => window.Store.get('h').hotels);
    if (hotels.length !== 1 || hotels[0].name !== 'Room Mate Valeria') throw new Error(JSON.stringify(hotels));
    if (!/330/.test(hotels[0].note) || !/18\/9 in → 21\/9 out/.test(hotels[0].dates)) throw new Error(JSON.stringify(hotels[0]));
  });

  await t.step('choosing another asks before replacing it', async () => {
    let asked = '';
    page.once('dialog', d => { asked = d.message(); d.dismiss(); });
    await page.click(`${view} .hc-card:has(h3:text("海景公寓")) [data-act="hc-pick"]`);
    await page.waitForTimeout(300);
    if (!/取代/.test(asked)) throw new Error('did not ask');
    const hotels = await page.evaluate(() => window.Store.get('h').hotels);
    if (hotels[0].name !== 'Room Mate Valeria') throw new Error('replaced after cancel');
  });

  await t.step('a hotel can be deleted from the comparison', async () => {
    page.once('dialog', d => d.accept());
    await page.click(`${view} .hc-card:has(h3:text("Molina")) [data-act="hc-del"]`);
    await page.waitForTimeout(300);
    if (await page.locator(`${view} .hc-card`).count() !== 3) throw new Error('not deleted');
  });

  await t.step('from the trips page it asks which trip, then opens its comparison', async () => {
    await page.goto(BASE + '/index.html');
    await page.waitForSelector('#lib-list .tripitem');
    await page.click('.libbar [data-lib="hotels"]');
    await page.waitForSelector('#pick-sheet');
    await page.click('#pick-sheet [data-pick="h2"]');
    await page.waitForSelector(view);
    if (!await page.evaluate(() => location.hash.includes('/h2/hotels'))) throw new Error('wrong place');
  });

  const failed = t.done(errors);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
