/* Light and dark.
 *
 * The dark theme is a token remap, so the thing worth testing is not
 * "is it dark" but "does every surface actually flip" — a rule that
 * kept a hardcoded colour is exactly what a screenshot review misses
 * and a contrast check catches. */
'use strict';

const { makeSuite, launch, BASE } = require('./helpers.js');

/* Relative luminance, per WCAG, from an rgb() string. */
function lum(rgb) {
  const m = String(rgb).match(/(\d+(?:\.\d+)?)/g);
  if (!m || m.length < 3) return null;
  const c = m.slice(0, 3).map(v => {
    const s = Number(v) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a, b) {
  const la = lum(a), lb = lum(b);
  if (la == null || lb == null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* Every pairing the eye actually has to resolve. */
const PAIRS = [
  ['body', 'page text'],
  ['.card', 'card text'],
  ['.btn', 'button label'],
  ['.hero', 'hero title'],
  ['footer', 'footer text']
];

/* The hero, the day headers and the primary buttons are painted with a
   gradient, so backgroundColor on them is transparent. Walking past it
   to the page behind reports a contrast that nobody ever sees. Read the
   gradient's own colour stops instead and test the text against every
   one of them, which is the real requirement: it has to stay legible
   across the whole sweep. */
async function readPairs(page) {
  return page.evaluate(sels => sels.map(([sel, label]) => {
    const el = document.querySelector(sel);
    if (!el) return { label, missing: true };
    const cs = getComputedStyle(el);

    let node = el;
    while (node) {
      const ns = getComputedStyle(node);
      const img = ns.backgroundImage;
      if (img && img !== 'none' && /gradient/.test(img)) {
        const stops = img.match(/rgba?\([^)]+\)/g) || [];
        /* Fully transparent stops paint nothing; ignore them. */
        const solid = stops.filter(c => !/,\s*0\s*\)$/.test(c));
        if (solid.length) return { label, fg: cs.color, bgs: solid };
      }
      const bg = ns.backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        return { label, fg: cs.color, bgs: [bg] };
      }
      node = node.parentElement;
    }
    return { label, fg: cs.color, bgs: ['rgb(255, 255, 255)'] };
  }), PAIRS);
}

(async () => {
  const t = makeSuite('theme');
  let allErrors = [];

  for (const scheme of ['light', 'dark']) {
    const { browser, page, errors } = await launch({ colorScheme: scheme });

    await t.step(`${scheme}: the OS preference is honoured before first paint`, async () => {
      await page.goto(BASE + '/index.html');
      /* Read the attribute without waiting for any script beyond the
         inline one, which is the whole point of having it inline. */
      const attr = await page.getAttribute('html', 'data-theme');
      if (attr !== scheme) throw new Error('data-theme is ' + attr);
    });

    await t.step(`${scheme}: text meets 4.5:1 against what is behind it`, async () => {
      await page.waitForSelector('#lib-list .tripitem');
      const pairs = await readPairs(page);
      const bad = pairs
        .filter(p => !p.missing)
        .map(p => {
          /* Against a gradient, the worst stop is the one that counts. */
          const ratios = p.bgs.map(bg => contrast(p.fg, bg)).filter(r => r != null);
          return { label: p.label, ratio: ratios.length ? Math.min.apply(null, ratios) : null };
        })
        .filter(p => p.ratio != null && p.ratio < 4.5);
      if (bad.length) {
        throw new Error(bad.map(b => `${b.label} ${b.ratio.toFixed(2)}:1`).join(', '));
      }
    });

    await t.step(`${scheme}: no surface stayed behind as hardcoded white`, async () => {
      const surfaces = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('.card, .tripitem, .btn, .stops').forEach(el => {
          const bg = getComputedStyle(el).backgroundColor;
          if (bg === 'rgb(255, 255, 255)') out.push(el.className);
        });
        return out;
      });
      const isDark = (await page.getAttribute('html', 'data-theme')) === 'dark';
      if (isDark && surfaces.length) throw new Error('still white: ' + surfaces.slice(0, 3).join(' / '));
    });

    allErrors = allErrors.concat(errors);
    await browser.close();
  }

  /* The toggle overrides the OS, and the choice survives a reload. */
  {
    const { browser, page, errors } = await launch({ colorScheme: 'light' });
    await t.step('the toggle overrides the system preference', async () => {
      await page.goto(BASE + '/index.html');
      await page.waitForSelector('#btn-theme');
      await page.click('#btn-theme');
      const attr = await page.getAttribute('html', 'data-theme');
      if (attr !== 'dark') throw new Error('data-theme is ' + attr);
    });
    await t.step('and the choice survives a reload', async () => {
      await page.goto(BASE + '/index.html');
      const attr = await page.getAttribute('html', 'data-theme');
      if (attr !== 'dark') throw new Error('data-theme is ' + attr + ' after reload');
    });
    await t.step('the label offers the other theme, not the current one', async () => {
      const label = await page.textContent('#btn-theme');
      if (!/淺色/.test(label)) throw new Error('label reads: ' + label);
    });
    allErrors = allErrors.concat(errors);
    await browser.close();
  }

  const failed = t.done(allErrors);
  process.exit(failed ? 1 : 0);
})();
