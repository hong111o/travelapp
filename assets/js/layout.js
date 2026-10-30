/* Travel Marvel · your order for the cards on a trip's home screen
 *
 * One order, for every trip, kept on this device — arrange it once and
 * new trips arrive the way you like them. Each card also has a column,
 * which only matters on a desktop: there the home screen is the plan on
 * the left and the reference cards on the right, and a card can be moved
 * across. On a phone there is one column, in the same order.
 *
 * Cards a trip does not have (no flights, no notes) are simply absent;
 * moving the others never disturbs where those would go.
 */
(function (global) {
  'use strict';

  var KEY = 'tripbook.layout.home';

  /* The default is the order the home screen had before it could be
     rearranged, so "reset" means "as it was". */
  var DEFAULT = [
    { k: 'today', col: 'main' },
    { k: 'weather', col: 'side' },
    { k: 'fx', col: 'side' },
    { k: 'countdown', col: 'side' },
    { k: 'flights', col: 'side' },
    { k: 'hotels', col: 'side' },
    { k: 'info', col: 'side' },
    { k: 'days', col: 'main' },
    { k: 'status', col: 'main' },
    { k: 'links', col: 'side' },
    { k: 'todos', col: 'main' },
    { k: 'share', col: 'side' },
    { k: 'offline', col: 'side' },
    { k: 'notes', col: 'side' }
  ];

  var LABEL = {
    today: '今日', weather: '天氣 · 日落', fx: '匯率換算', countdown: '出發倒數',
    flights: '航班', hotels: '酒店', info: '資料卡（關鍵時間、交通小抄）', days: '逐日行程',
    status: '訂咗嘅嘢 · 打卡 · 體檢 · 酒店比較', links: '實用連結', todos: '要訂嘅嘢',
    share: '分享行程', offline: '離線地圖', notes: '備註'
  };

  function clone(list) { return list.map(function (x) { return { k: x.k, col: x.col }; }); }

  /* The saved order, reconciled with the cards this version knows:
     unknown keys (from an older or newer build) are dropped, and cards
     added since are slotted in after the card that precedes them in the
     default, so a new card turns up somewhere sensible. */
  function get() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
    if (!Array.isArray(saved)) return clone(DEFAULT);

    var known = {};
    DEFAULT.forEach(function (d) { known[d.k] = d; });
    var out = [], seen = {};
    saved.forEach(function (x) {
      if (!x || !known[x.k] || seen[x.k]) return;
      seen[x.k] = true;
      out.push({ k: x.k, col: x.col === 'side' ? 'side' : 'main' });
    });
    DEFAULT.forEach(function (d, i) {
      if (seen[d.k]) return;
      var after = i > 0 ? DEFAULT[i - 1].k : null, at = 0;
      for (var j = 0; j < out.length; j++) if (out[j].k === after) at = j + 1;
      out.splice(at, 0, { k: d.k, col: d.col });
      seen[d.k] = true;
    });
    return out;
  }

  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* the order just will not stick */ }
    if (typeof global.Layout.onChange === 'function') global.Layout.onChange();
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    if (typeof global.Layout.onChange === 'function') global.Layout.onChange();
  }

  function isDefault() {
    return JSON.stringify(get()) === JSON.stringify(DEFAULT);
  }

  /* Move `key` so it sits where `target` was, among the cards that were
     on screen. Expressed as keys rather than positions because the list
     on screen skips the cards this trip lacks. */
  function moveKey(key, target) {
    if (key === target) return;
    var list = get();
    var from = -1, to = -1;
    list.forEach(function (x, i) { if (x.k === key) from = i; if (x.k === target) to = i; });
    if (from < 0 || to < 0) return;
    var item = list.splice(from, 1)[0];
    /* Moving down lands after the target, moving up lands before it —
       which is what "drop it where that one was" means either way. */
    var at = list.findIndex ? list.findIndex(function (x) { return x.k === target; }) : -1;
    if (at < 0) for (var i = 0; i < list.length; i++) if (list[i].k === target) at = i;
    list.splice(from < to ? at + 1 : at, 0, item);
    save(list);
  }

  function setCol(key, col) {
    var list = get();
    list.forEach(function (x) { if (x.k === key) x.col = col === 'side' ? 'side' : 'main'; });
    save(list);
  }

  global.Layout = {
    get: get, reset: reset, isDefault: isDefault,
    moveKey: moveKey, setCol: setCol,
    label: function (k) { return LABEL[k] || k; },
    onChange: null
  };
})(window);
