/* A landscape for each trip.
 *
 * Wikipedia cannot be reached from the test environment, so every host
 * the cover touches is stubbed with responses in the documented shape
 * of the REST media-list and the action API's imageinfo. What is under
 * test is the app's handling: which image it picks, what it caches,
 * when it asks again, and that a failure never shows. */
'use strict';

const { makeSuite, launch, BASE } = require('./helpers.js');

const TRIP = {
  id: 'cv', title: 'Málaga', place: { name: '馬拉加', lat: 36.72, lng: -4.42 },
  startDate: '2027-05-01', endDate: '2027-05-02',
  days: [{ id: 'd1', date: '2027-05-01', title: '第一日', stops: [{ title: 'A', time: '10:00', mapQuery: 'a' }] }]
};

const MEDIA = { items: [
  { title: 'File:Flag of Málaga.jpg', type: 'image', leadImage: true },
  { title: 'File:Malaga Tall Street.jpg', type: 'image' },
  { title: 'File:Malaga Small Wide.jpg', type: 'image' },
  { title: 'File:Malaga harbour panorama.jpg', type: 'image' },
  { title: 'File:Second wide one.jpg', type: 'image' }
] };

function info(title, w, h, extra) {
  return Object.assign({
    title, imageinfo: [Object.assign({
      width: w, height: h, mime: 'image/jpeg',
      url: 'https://upload.wikimedia.org/full/' + encodeURIComponent(title),
      thumburl: 'https://upload.wikimedia.org/thumb/' + encodeURIComponent(title),
      descriptionurl: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(title),
      extmetadata: {
        Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Someone">Some <b>One</b></a>' },
        LicenseShortName: { value: 'CC BY-SA 4.0' }
      }
    }, extra || {})]
  });
}

const INFO = { query: { pages: {
  '-1': info('File:Flag of Málaga.jpg', 3000, 2000),
  '-2': info('File:Malaga Tall Street.jpg', 1200, 1800),
  '-3': info('File:Malaga Small Wide.jpg', 800, 400),
  '-4': info('File:Malaga harbour panorama.jpg', 4000, 2000),
  '-5': info('File:Second wide one.jpg', 3000, 1500)
} } };

(async () => {
  const t = makeSuite('cover');
  const { browser, ctx, page, errors } = await launch({ viewport: { width: 1280, height: 860 } });

  /* A real JPEG, made by the browser itself, to serve as "the photo". */
  await page.goto(BASE + '/index.html');
  const jpeg = Buffer.from(await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 32;
    const g = c.getContext('2d'); g.fillStyle = '#3F7F8E'; g.fillRect(0, 0, 64, 32);
    return c.toDataURL('image/jpeg').split(',')[1];
  }), 'base64');

  let mode = 'ok';
  const hits = { media: 0, info: 0, image: [] };
  await ctx.route(/wikipedia\.org\/api\/rest_v1\/page\/media-list\//, route => {
    hits.media++;
    if (mode === 'down') return route.abort();
    if (mode === 'empty') return route.fulfill({ json: { items: [{ title: 'File:Map.svg', type: 'image' }] }, headers: { 'access-control-allow-origin': '*' } });
    return route.fulfill({ json: MEDIA, headers: { 'access-control-allow-origin': '*' } });
  });
  await ctx.route(/wikipedia\.org\/w\/api\.php/, route => {
    hits.info++;
    return route.fulfill({ json: INFO, headers: { 'access-control-allow-origin': '*' } });
  });
  await ctx.route(/upload\.wikimedia\.org\//, route => {
    hits.image.push(decodeURIComponent(route.request().url()));
    return route.fulfill({ body: jpeg, contentType: 'image/jpeg', headers: { 'access-control-allow-origin': '*' } });
  });

  /* A goto to the URL the page is already on does not reload it, so go
     via a blank page: every open below is a fresh start of the app. */
  const openHome = async () => {
    await page.goto('about:blank');
    await page.goto(BASE + '/index.html#/trip/cv/home');
    await page.waitForSelector('#view-trip .hero-trip h1');
  };
  /* The app holds the covers database open, so deleting it would be
     blocked; clear the record through the app instead. */
  const clearCover = () => page.evaluate(() => window.Cover.remove('cv'));
  const hasCover = () => page.evaluate(() => {
    const h = document.querySelector('#view-trip .hero-trip');
    return !!(h && h.classList.contains('hascover') &&
      /blob:/.test(h.querySelector('.hero-cover').style.backgroundImage));
  });
  const waitCover = async (want) => {
    for (let i = 0; i < 40; i++) {
      if ((await hasCover()) === want) return;
      await page.waitForTimeout(100);
    }
    throw new Error('cover is ' + (await hasCover() ? 'shown' : 'not shown'));
  };

  await page.evaluate(trip => { localStorage.clear(); window.Store.save(trip); }, TRIP);
  await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('tripbook-covers'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));

  await t.step('opening a trip puts its city behind the header', async () => {
    await openHome();
    await waitCover(true);
  });

  await t.step('it takes the first wide photograph, not the flag, a portrait or a small one', async () => {
    if (hits.image.length !== 1) throw new Error(hits.image.length + ' images downloaded');
    if (!/harbour panorama/.test(hits.image[0])) throw new Error('downloaded ' + hits.image[0]);
  });

  await t.step('it asks for a header-sized copy, not the original', async () => {
    if (!/\/thumb\//.test(hits.image[0])) throw new Error('fetched ' + hits.image[0]);
  });

  await t.step('the photographer and licence are credited, linking to the file', async () => {
    const credit = page.locator('#view-trip .hero-credit');
    if (!await credit.isVisible()) throw new Error('no credit');
    const text = await credit.textContent();
    if (!/Some One/.test(text) || !/CC BY-SA 4\.0/.test(text)) throw new Error('reads ' + text);
    if (/<|>/.test(text)) throw new Error('markup leaked into the credit: ' + text);
    const href = await credit.getAttribute('href');
    if (!/commons\.wikimedia\.org/.test(href)) throw new Error('links to ' + href);
  });

  await t.step('it is kept, so the next open does not go to the network', async () => {
    const before = hits.media + hits.image.length;
    await page.reload();
    await page.waitForSelector('#view-trip .hero-trip h1');
    await waitCover(true);
    if (hits.media + hits.image.length !== before) throw new Error('fetched again');
  });

  await t.step('renaming the trip to another city fetches that city instead', async () => {
    const before = hits.media;
    await page.evaluate(() => { const t = window.Store.get('cv'); t.title = 'Sevilla'; window.Store.save(t); });
    await openHome();
    await waitCover(true);
    if (hits.media === before) throw new Error('kept the old city');
    await page.evaluate(() => { const t = window.Store.get('cv'); t.title = 'Málaga'; window.Store.save(t); });
  });

  await t.step('your own photo replaces it, without a credit line', async () => {
    await openHome();
    await waitCover(true);
    await page.click('#view-trip [data-act="cover"]');
    await page.waitForSelector('#cover-sheet');
    await page.setInputFiles('#cover-file', { name: 'mine.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    await page.waitForSelector('#cover-sheet', { state: 'detached' });
    await waitCover(true);
    if (await page.locator('#view-trip .hero-credit').isVisible()) throw new Error('credit still shown');
  });

  await t.step('and it is never swapped back automatically', async () => {
    const before = hits.media;
    await page.evaluate(() => { const t = window.Store.get('cv'); t.title = 'Granada'; window.Store.save(t); });
    await openHome();
    await waitCover(true);
    await page.waitForTimeout(300);
    if (hits.media !== before) throw new Error('went looking for Granada over your photo');
    if (await page.locator('#view-trip .hero-credit').isVisible()) throw new Error('a credit appeared');
    await page.evaluate(() => { const t = window.Store.get('cv'); t.title = 'Málaga'; window.Store.save(t); });
  });

  await t.step('choosing no cover leaves the plain header, and stays that way', async () => {
    await openHome();
    await page.click('#view-trip [data-act="cover"]');
    await page.waitForSelector('#cover-sheet');
    await page.click('#cover-sheet [data-cv="none"]');
    await waitCover(false);
    await page.reload();
    await page.waitForSelector('#view-trip .hero-trip h1');
    await page.waitForTimeout(400);
    if (await hasCover()) throw new Error('came back after a reload');
  });

  await t.step('and the Wikipedia photo can be had back', async () => {
    await page.click('#view-trip [data-act="cover"]');
    await page.waitForSelector('#cover-sheet');
    await page.click('#cover-sheet [data-cv="auto"]');
    await waitCover(true);
    if (!await page.locator('#view-trip .hero-credit').isVisible()) throw new Error('no credit on the fetched photo');
  });

  await t.step('with no network, a trip with no cover yet just shows the plain header', async () => {
    mode = 'down';
    await clearCover();
    await openHome();
    await page.waitForTimeout(600);
    if (await hasCover()) throw new Error('a cover appeared from nowhere');
    if (await page.locator('#view-trip .hero-credit').isVisible()) throw new Error('an empty credit is showing');
  });

  await t.step('a city with no usable photo is not searched again on every open', async () => {
    mode = 'empty';
    await openHome();
    await page.waitForTimeout(500);
    const after1 = hits.media;
    await page.reload();
    await page.waitForSelector('#view-trip .hero-trip h1');
    await page.waitForTimeout(500);
    if (hits.media !== after1) throw new Error('searched again straight away');
    if (await hasCover()) throw new Error('showed a cover for a city with none');
  });

  await t.step('deleting the trip deletes its cover', async () => {
    mode = 'ok';
    await clearCover();
    await openHome();
    await waitCover(true);
    await page.goto(BASE + '/index.html');
    await page.waitForSelector('#lib-list .tripitem');
    page.once('dialog', d => d.accept());
    await page.locator('.tripitem').filter({ hasText: 'Málaga' }).locator('[data-act="del"]').click();
    await page.waitForTimeout(500);
    const left = await page.evaluate(() => window.Cover.get('cv'));
    if (left) throw new Error('the cover outlived its trip');
  });

  const failed = t.done(errors);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
