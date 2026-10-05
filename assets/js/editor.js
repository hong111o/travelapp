/* 行程本 · trip editor
 *
 * A form over the same object the renderer reads, so anything you can
 * type here is exactly what an imported .json can contain — one format,
 * two ways in.
 *
 * Binding is by object path: every input carries data-path="days.0.stops.2.title"
 * and writes straight into the working copy on input. Structural edits
 * (add / delete / reorder) go through data-op buttons and re-render the
 * pane they live in.
 */
(function (global) {
  'use strict';

  var esc = U.esc;

  var state = {
    work: null,       // working copy — the saved trip is untouched until 儲存
    original: '',     // JSON snapshot used for the dirty check
    tab: 'basics',
    openDays: {},     // day index -> expanded, preserved across re-renders
    isNew: false
  };

  /* --- small field builders ------------------------------------ */

  function val(path) {
    var v = U.getPath(state.work, path);
    return v == null ? '' : String(v);
  }

  function input(label, path, opts) {
    opts = opts || {};
    return '<div class="f"><label>' + esc(label) +
      (opts.optional ? ' <span class="opt">（可留空）</span>' : '') + '</label>' +
      '<input type="' + (opts.type || 'text') + '" data-path="' + esc(path) + '"' +
      (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : '') +
      (opts.step ? ' step="' + opts.step + '"' : '') +
      (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') +
      ' value="' + esc(val(path)) + '">' +
      (opts.hint ? '<div class="sub">' + esc(opts.hint) + '</div>' : '') + '</div>';
  }

  function textarea(label, path, opts) {
    opts = opts || {};
    return '<div class="f"><label>' + esc(label) +
      (opts.optional ? ' <span class="opt">（可留空）</span>' : '') + '</label>' +
      '<textarea data-path="' + esc(path) + '"' +
      (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') +
      '>' + esc(val(path)) + '</textarea>' +
      (opts.hint ? '<div class="sub">' + esc(opts.hint) + '</div>' : '') + '</div>';
  }

  function select(label, path, choices) {
    var current = val(path);
    return '<div class="f"><label>' + esc(label) + '</label><select data-path="' + esc(path) + '">' +
      choices.map(function (c) {
        return '<option value="' + esc(c[0]) + '"' + (c[0] === current ? ' selected' : '') + '>' +
          esc(c[1]) + '</option>';
      }).join('') + '</select></div>';
  }

  function checkbox(label, path) {
    var on = !!U.getPath(state.work, path);
    return '<label class="fcheck"><input type="checkbox" data-path="' + esc(path) + '"' +
      (on ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
  }

  function repHead(listPath, i, name) {
    return '<div class="rep-head">' +
      '<span class="draghandle" data-drag title="拖住換位">⠿</span>' +
      '<span class="ix">' + (i + 1) + '</span>' +
      '<span class="nm">' + esc(U.plain(name) || '（未填）') + '</span>' +
      '<button class="iconbtn" data-op="up" data-list="' + esc(listPath) + '" data-i="' + i + '" title="上移">↑</button>' +
      '<button class="iconbtn" data-op="down" data-list="' + esc(listPath) + '" data-i="' + i + '" title="下移">↓</button>' +
      '<button class="iconbtn del" data-op="del" data-list="' + esc(listPath) + '" data-i="' + i + '" title="刪除">✕</button>' +
      '</div>';
  }

  function addBtn(listPath, kind, label) {
    return '<button class="btn addrow" data-op="add" data-list="' + esc(listPath) +
      '" data-kind="' + esc(kind) + '">＋ ' + esc(label) + '</button>';
  }

  /* --- panes ---------------------------------------------------- */

  function paneBasics() {
    return '<div class="ed-pane" data-pane="basics">' +
      '<div class="fieldset"><h3>行程基本</h3>' +
        input('標題', 'title', { placeholder: 'Lisboa' }) +
        input('小標（hero 上面細字）', 'kicker', { optional: true, placeholder: '大西洋 · 葡萄牙' }) +
        input('副題（斜體）', 'subtitle', { optional: true }) +
        '<div class="frow">' +
          input('開始日期', 'startDate', { type: 'date' }) +
          input('結束日期', 'endDate', { type: 'date' }) +
        '</div>' +
      '</div>' +

      '<div class="fieldset"><h3>🌤️ 天氣同日落</h3>' +
        '<p class="hint">填咗座標，首頁就會自動拎當地天氣同日落時間。留空就唔會顯示呢張卡。</p>' +
        input('城市名', 'place.name', { optional: true, placeholder: '里斯本' }) +
        '<div class="frow">' +
          input('緯度 lat', 'place.lat', { type: 'number', step: 'any', inputmode: 'decimal', placeholder: '38.7223' }) +
          input('經度 lng', 'place.lng', { type: 'number', step: 'any', inputmode: 'decimal', placeholder: '-9.1393' }) +
        '</div>' +
        '<div class="sub">搵座標：Google Maps 長按個位 → 會出經緯度，copy 過嚟。</div>' +
      '</div>' +

      '<div class="fieldset"><h3>💱 匯率換算</h3>' +
        '<p class="hint">兩個都填先會顯示換算器。用 3 個字母代碼（EUR、GBP、HKD、JPY…）。</p>' +
        '<div class="frow">' +
          input('當地貨幣', 'currency.base', { placeholder: 'EUR' }) +
          input('你嘅貨幣', 'currency.quote', { placeholder: 'GBP' }) +
        '</div>' +
      '</div>' +

      '<div class="fieldset"><h3>⏱️ 出發倒數</h3>' +
        '<p class="hint">留空就唔會顯示倒數卡。</p>' +
        input('出發時間', 'departure.datetime', { type: 'datetime-local' }) +
        input('時區偏移', 'departure.utcOffset', { optional: true, placeholder: '+01:00',
          hint: '出發地嘅 UTC 偏移，例如英國夏令 +01:00、香港 +08:00。留空 = 用你部機嘅時區。' }) +
        input('說明', 'departure.note', { optional: true, placeholder: '4 月 10 日 · 07:30 起飛' }) +
      '</div>' +

      '<div class="fieldset"><h3>📝 備註</h3>' +
        textarea('自由備註', 'notes', { optional: true, hint: '想 bold 就用 **兩個星**包住。' }) +
      '</div>' +
    '</div>';
  }

  function stopBlock(dayIx, stopIx, s) {
    var p = 'days.' + dayIx + '.stops.' + stopIx;
    return '<div class="rep" data-dragrow>' +
      repHead('days.' + dayIx + '.stops', stopIx, s.title) +
      '<div class="frow">' +
        input('時間', p + '.time', { placeholder: '~13:00' }) +
        input('名稱', p + '.title', { placeholder: 'Time Out Market' }) +
      '</div>' +
      checkbox('標做重點 ★', p + '.star') +
      textarea('描述', p + '.desc', { optional: true, placeholder: '食咩、注意咩…' }) +
      input('備選 Backup', p + '.backup', { optional: true, placeholder: 'Mercado de Campo de Ourique' }) +
      input('小提示 📍', p + '.pin', { optional: true, placeholder: '週末好逼，早少少去' }) +
      input('導航搜尋字', p + '.mapQuery', { optional: true, placeholder: 'Time Out Market Lisboa',
        hint: '填咗會出「🧭 導航」掣，直接開 Google Maps 搜呢個字。' }) +
      '<button class="btn btn-sm maplinkb" data-maplink="' + esc(p) + '">' +
        '📋 貼 Google Maps 連結自動填</button>' +
      '<div class="frow">' +
        input('lat', p + '.lat', { type: 'number', step: 'any', inputmode: 'decimal' }) +
        input('lng', p + '.lng', { type: 'number', step: 'any', inputmode: 'decimal' }) +
      '</div>' +
      input('地圖短標籤', p + '.mapLabel', { optional: true, placeholder: 'Time Out',
        hint: '地圖圖例用嘅短名。留空就用上面個名稱。' }) +
      '<div class="sub">填咗經緯度，呢個點先會出喺當日地圖同圖例上。</div>' +
    '</div>';
  }

  function dayBlock(d, i) {
    var open = state.openDays[i] ? ' open' : '';
    var wd = U.weekdayZH(d.date), short = U.shortDate(d.date);
    var label = U.plain(d.title || 'Day ' + (i + 1)) + (short ? '　' + (wd ? '星期' + wd + ' ' : '') + short : '');
    return '<details class="daybox"' + open + ' data-dayix="' + i + '">' +
      '<summary><span class="ix">' + (i + 1) + '</span>' +
        '<span class="nm">' + esc(label) + '</span>' +
        '<span class="ct">' + d.stops.length + ' 個點</span></summary>' +
      '<div class="inner">' +
        '<div class="rep-head" style="margin-top:10px">' +
          '<span class="nm" style="color:var(--ink-soft);font-weight:400">調整呢日</span>' +
          '<button class="iconbtn" data-op="up" data-list="days" data-i="' + i + '" title="上移">↑</button>' +
          '<button class="iconbtn" data-op="down" data-list="days" data-i="' + i + '" title="下移">↓</button>' +
          '<button class="iconbtn del" data-op="del" data-list="days" data-i="' + i + '" title="刪除呢日">✕</button>' +
        '</div>' +
        '<div class="frow">' +
          input('日期', 'days.' + i + '.date', { type: 'date' }) +
          input('標題', 'days.' + i + '.title', { placeholder: '舊城 · 觀景台' }) +
        '</div>' +
        input('一句副題', 'days.' + i + '.theme', { optional: true, placeholder: '舊城 → 上山 → 日落觀景台' }) +
        checkbox('喺地圖上畫路線（順住點連線）', 'days.' + i + '.drawRoute') +
        input('地圖說明', 'days.' + i + '.mapNote', { optional: true }) +
        '<h3 style="margin-top:16px;font-size:.98rem">行程點</h3>' +
        (d.stops.length
          ? '<div data-draglist="days.' + i + '.stops">' +
              d.stops.map(function (s, j) { return stopBlock(i, j, s); }).join('') +
            '</div>'
          : '<div class="emptyrep">仲未有行程點</div>') +
        addBtn('days.' + i + '.stops', 'stop', '加一個點') +
      '</div></details>';
  }

  function paneDays() {
    return '<div class="ed-pane" data-pane="days">' +
      '<div class="fieldset"><h3>每日行程</h3>' +
        '<p class="hint">一日一格，撳開就可以改。每個「點」= 行程上一行。</p>' +
        (state.work.days.length
          ? state.work.days.map(dayBlock).join('')
          : '<div class="emptyrep">仲未有日子</div>') +
        addBtn('days', 'day', '加一日') +
      '</div></div>';
  }

  function paneCards() {
    var cards = state.work.infoCards.map(function (c, i) {
      return '<div class="rep">' +
        repHead('infoCards', i, c.title) +
        '<div class="frow">' +
          input('圖示', 'infoCards.' + i + '.icon', { placeholder: '🚇' }) +
          input('標題', 'infoCards.' + i + '.title', { placeholder: '交通小抄' }) +
        '</div>' +
        input('導航搜尋字', 'infoCards.' + i + '.mapQuery', { optional: true }) +
        '<h3 style="margin-top:12px;font-size:.92rem;color:var(--teal)">內容行</h3>' +
        (c.rows.length ? '<div data-draglist="infoCards.' + i + '.rows">' + c.rows.map(function (r, j) {
          var p = 'infoCards.' + i + '.rows.' + j;
          return '<div class="rep" data-dragrow style="background:var(--white)">' +
            repHead('infoCards.' + i + '.rows', j, r.k) +
            input('左邊（標籤）', p + '.k', { placeholder: '機場入城' }) +
            input('右邊（內容）', p + '.v', { placeholder: '地鐵紅線 ~20 分鐘' }) +
            input('右邊細字', p + '.sub', { optional: true }) +
          '</div>';
        }).join('') + '</div>' : '<div class="emptyrep">仲未有內容行</div>') +
        addBtn('infoCards.' + i + '.rows', 'row', '加一行') +
      '</div>';
    }).join('');

    return '<div class="ed-pane" data-pane="cards">' +
      '<div class="fieldset"><h3>資料卡</h3>' +
        '<p class="hint">首頁上面嗰啲卡：航班、酒店、關鍵時間…　自己開幾多張都得。</p>' +
        (cards || '<div class="emptyrep">仲未有資料卡</div>') +
        addBtn('infoCards', 'card', '加一張卡') +
      '</div></div>';
  }

  function paneExtras() {
    var todos = state.work.todos.map(function (d, i) {
      return '<div class="rep" data-dragrow>' +
        repHead('todos', i, d.text) +
        select('幾時要做', 'todos.' + i + '.level',
          [['now', '而家（紅）'], ['soon', '出發前（橙）'], ['day', '當日（綠）']]) +
        textarea('內容', 'todos.' + i + '.text', { placeholder: '**城堡**（D1）— 網上訂飛唔使排隊' }) +
      '</div>';
    }).join('');

    var links = state.work.links.map(function (l, i) {
      return '<div class="rep" data-dragrow>' +
        repHead('links', i, l.label) +
        '<div class="frow">' +
          input('圖示', 'links.' + i + '.icon', { placeholder: '🌤️' }) +
          input('文字', 'links.' + i + '.label', { placeholder: '緊急電話 112' }) +
        '</div>' +
        input('連結', 'links.' + i + '.url', { placeholder: 'tel:112 或 https://…' }) +
      '</div>';
    }).join('');

    return '<div class="ed-pane" data-pane="extras">' +
      '<div class="fieldset"><h3>要訂嘅嘢</h3>' +
        '<p class="hint">首頁底部嗰張黃色 checklist。</p>' +
        (todos ? '<div data-draglist="todos">' + todos + '</div>' : '<div class="emptyrep">仲未有項目</div>') +
        addBtn('todos', 'todo', '加一項') +
      '</div>' +
      '<div class="fieldset"><h3>實用連結</h3>' +
        (links ? '<div data-draglist="links">' + links + '</div>' : '<div class="emptyrep">仲未有連結</div>') +
        addBtn('links', 'link', '加一個連結') +
      '</div></div>';
  }

  function paneFood() {
    var quick = state.work.food.quick.map(function (q, i) {
      var p = 'food.quick.' + i;
      return '<div class="rep" data-dragrow>' +
        repHead('food.quick', i, q.name) +
        '<div class="frow">' +
          input('幾時', p + '.when', { placeholder: 'D1 午餐' }) +
          input('食邊間', p + '.name', { placeholder: 'Time Out Market' }) +
        '</div>' +
        checkbox('Plan A ★', p + '.star') +
        input('備註', p + '.note', { optional: true, placeholder: '幾十間攤檔一次過試齊' }) +
      '</div>';
    }).join('');

    var picks = state.work.food.picks.map(function (pk, i) {
      var p = 'food.picks.' + i;
      return '<div class="rep" data-dragrow>' +
        repHead('food.picks', i, pk.title) +
        '<div class="frow">' +
          input('圖示', p + '.icon', { placeholder: '🥧' }) +
          input('名稱', p + '.title', { placeholder: '蛋撻 · Manteigaria' }) +
        '</div>' +
        textarea('介紹', p + '.desc', { optional: true }) +
        input('導航搜尋字', p + '.mapQuery', { optional: true }) +
      '</div>';
    }).join('');

    return '<div class="ed-pane" data-pane="food">' +
      '<div class="fieldset"><h3>每餐速查</h3>' +
        '<p class="hint">一行一餐，對應「美食速查」上半頁。</p>' +
        (quick ? '<div data-draglist="food.quick">' + quick + '</div>' : '<div class="emptyrep">仲未有</div>') +
        addBtn('food.quick', 'foodQuick', '加一餐') +
      '</div>' +
      '<div class="fieldset"><h3>餐廳清單</h3>' +
        '<p class="hint">唔一定排入行程，當日想食邊款就撳導航。</p>' +
        (picks ? '<div data-draglist="food.picks">' + picks + '</div>' : '<div class="emptyrep">仲未有</div>') +
        addBtn('food.picks', 'foodPick', '加一間') +
      '</div>' +
      '<div class="fieldset"><h3>底部一句</h3>' +
        textarea('說明', 'food.legend', { optional: true }) +
      '</div></div>';
  }

  function paneJSON() {
    return '<div class="ed-pane" data-pane="json">' +
      '<div class="fieldset"><h3>JSON</h3>' +
        '<p class="hint">同你 export 出去嘅檔案一模一樣嘅格式。改完撳「套用」先會入到上面啲表格。</p>' +
        '<textarea class="jsonarea" id="ed-json" spellcheck="false">' +
          esc(JSON.stringify(stripped(state.work), null, 2)) + '</textarea>' +
        '<div class="jsonerr" id="ed-json-err" hidden></div>' +
        '<button class="btn addrow" id="ed-json-apply" style="border-style:solid">套用 JSON</button>' +
      '</div></div>';
  }

  function stripped(t) {
    var c = U.clone(t);
    delete c.updatedAt;
    return c;
  }

  /* --- shell ---------------------------------------------------- */

  var TABS = [
    ['basics', '基本'],
    ['days', '每日行程'],
    ['cards', '資料卡'],
    ['extras', '要訂 / 連結'],
    ['food', '美食'],
    ['json', 'JSON']
  ];

  function render() {
    var host = U.el('view-editor');
    host.innerHTML =
      '<div class="ed-head"><div class="ed-head-in">' +
        '<button class="backbtn" data-act="close"><span class="ar">‹</span> 返回</button>' +
        '<span class="ttl">' + esc(state.work.title || '新行程') + '</span>' +
        '<button class="btn btn-sm" data-act="export">⬇️</button>' +
      '</div>' +
      '<div class="ed-tabs">' + TABS.map(function (t) {
        return '<button class="ed-tab' + (t[0] === state.tab ? ' on' : '') +
          '" data-tab="' + t[0] + '">' + esc(t[1]) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="wrap" id="ed-body">' +
        paneBasics() + paneDays() + paneCards() + paneExtras() + paneFood() + paneJSON() +
      '</div>' +
      '<div class="savebar"><div class="savebar-in">' +
        '<span class="st" id="ed-state"></span>' +
        '<button class="btn btn-primary" data-act="save">儲存</button>' +
      '</div></div>';

    showTab(state.tab);
    updateDirtyLabel();
  }

  /* Re-render just the body; used after structural edits so the header,
     tab strip and scroll position survive. */
  function renderBody() {
    var body = U.el('ed-body');
    if (!body) return render();
    var scroll = window.scrollY;
    body.innerHTML = paneBasics() + paneDays() + paneCards() + paneExtras() + paneFood() + paneJSON();
    showTab(state.tab);
    window.scrollTo(0, scroll);
    var ttl = document.querySelector('#view-editor .ttl');
    if (ttl) ttl.textContent = state.work.title || '新行程';
    updateDirtyLabel();
  }

  function showTab(name) {
    state.tab = name;
    var panes = document.querySelectorAll('#view-editor .ed-pane');
    for (var i = 0; i < panes.length; i++) {
      panes[i].classList.toggle('on', panes[i].getAttribute('data-pane') === name);
    }
    var tabs = document.querySelectorAll('#view-editor .ed-tab');
    for (var j = 0; j < tabs.length; j++) {
      tabs[j].classList.toggle('on', tabs[j].getAttribute('data-tab') === name);
    }
  }

  function isDirty() {
    return JSON.stringify(stripped(Schema.normalize(state.work))) !== state.original;
  }

  function updateDirtyLabel() {
    var s = U.el('ed-state');
    if (s) s.textContent = isDirty() ? '未儲存' : '已儲存';
  }

  /* --- structural operations ------------------------------------ */

  function blankOf(kind) {
    switch (kind) {
      case 'day': return Schema.blankDay(state.work.days.length, state.work.startDate);
      case 'stop': return Schema.blankStop();
      case 'card': return { icon: '', title: '', mapQuery: '', rows: [{ k: '', v: '', sub: '' }] };
      case 'row': return { k: '', v: '', sub: '' };
      case 'todo': return { level: 'soon', text: '' };
      case 'link': return { icon: '', label: '', url: '' };
      case 'foodQuick': return { when: '', name: '', star: false, note: '' };
      case 'foodPick': return { icon: '', title: '', desc: '', mapQuery: '' };
      default: return {};
    }
  }

  function rememberOpenDays() {
    state.openDays = {};
    var boxes = document.querySelectorAll('#view-editor .daybox');
    for (var i = 0; i < boxes.length; i++) {
      if (boxes[i].open) state.openDays[boxes[i].getAttribute('data-dayix')] = true;
    }
  }

  function applyOp(op, listPath, i, kind) {
    var list = U.getPath(state.work, listPath);
    if (!Array.isArray(list)) {
      if (op !== 'add') return;
      U.setPath(state.work, listPath, []);
      list = U.getPath(state.work, listPath);
    }
    rememberOpenDays();

    if (op === 'add') {
      list.push(blankOf(kind));
      if (kind === 'day') state.openDays[list.length - 1] = true;
      /* Keep the newly added stop's day open so it doesn't collapse
         out from under the button that was just pressed. */
      if (kind === 'stop') {
        var m = /^days\.(\d+)\.stops$/.exec(listPath);
        if (m) state.openDays[m[1]] = true;
      }
    } else if (op === 'del') {
      if (list.length === 1 && listPath === 'days') {
        U.toast('至少要有一日', true);
        return;
      }
      list.splice(i, 1);
    } else if (op === 'up') {
      if (!U.move(list, i, i - 1)) return;
    } else if (op === 'down') {
      if (!U.move(list, i, i + 1)) return;
    }

    renderBody();
  }

  /* --- events ---------------------------------------------------- */

  /* DragSort reports "index A became index B" for a named list; the
     working copy is the source of truth, so move it there and re-render. */
  function onDrop(listPath, from, to) {
    var list = U.getPath(state.work, listPath);
    if (!Array.isArray(list)) return;
    if (!U.move(list, from, to)) return;
    rememberOpenDays();
    renderBody();
    updateDirtyLabel();
    U.toast('換咗位，記得撳儲存');
  }

  function onInput(e) {
    var t = e.target;
    var path = t.getAttribute && t.getAttribute('data-path');
    if (!path) return;
    var v;
    if (t.type === 'checkbox') v = t.checked;
    else if (t.type === 'number') v = t.value === '' ? null : Number(t.value);
    else v = t.value;
    U.setPath(state.work, path, v);

    if (path === 'title') {
      var ttl = document.querySelector('#view-editor .ttl');
      if (ttl) ttl.textContent = state.work.title || '新行程';
    }
    updateDirtyLabel();
  }

  function onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-op],[data-tab],[data-act],[data-maplink],#ed-json-apply') : null;
    if (!t || !U.el('view-editor').contains(t)) return;

    if (t.id === 'ed-json-apply') { e.preventDefault(); applyJSON(); return; }

    var mapPath = t.getAttribute('data-maplink');
    if (mapPath) { e.preventDefault(); fillFromMapLink(mapPath); return; }

    var tab = t.getAttribute('data-tab');
    if (tab) { e.preventDefault(); showTab(tab); window.scrollTo(0, 0); return; }

    var op = t.getAttribute('data-op');
    if (op) {
      e.preventDefault();
      applyOp(op, t.getAttribute('data-list'), parseInt(t.getAttribute('data-i'), 10), t.getAttribute('data-kind'));
      return;
    }

    var act = t.getAttribute('data-act');
    if (act === 'save') { e.preventDefault(); save(); }
    else if (act === 'close') { e.preventDefault(); close(); }
    else if (act === 'export') { e.preventDefault(); Store.exportTrip(state.work); }
  }

  /* Paste a map link onto a stop. Fills what the link actually carries
     and leaves everything else alone — a link with no name should not
     blank out a title you already wrote. */
  function fillFromMapLink(path) {
    var text = prompt('貼 Google Maps 連結（或者一對經緯度）：', '');
    if (text === null) return;

    var got;
    try { got = MapLink.parse(text); }
    catch (ex) { U.toast(ex.message, true); return; }

    U.setPath(state.work, path + '.lat', got.lat);
    U.setPath(state.work, path + '.lng', got.lng);

    var filled = ['座標'];
    if (got.name) {
      if (!U.getPath(state.work, path + '.title')) {
        U.setPath(state.work, path + '.title', got.name);
        filled.push('名稱');
      }
      if (!U.getPath(state.work, path + '.mapQuery')) {
        U.setPath(state.work, path + '.mapQuery', got.name);
        filled.push('導航');
      }
    }

    rememberOpenDays();
    renderBody();
    U.toast('填咗' + filled.join('、') + ' ✓');
  }

  function applyJSON() {
    var ta = U.el('ed-json'), err = U.el('ed-json-err');
    if (!ta) return;
    try {
      var parsed = JSON.parse(ta.value);
      if (!Schema.looksLikeTrip(parsed)) throw new Error('唔似係行程資料（要有 title 或者 days）');
      var id = state.work.id;
      state.work = Schema.normalize(parsed);
      state.work.id = id; /* editing this trip, not creating another */
      err.hidden = true;
      state.openDays = {};
      renderBody();
      U.toast('JSON 套用咗，記得撳儲存');
    } catch (ex) {
      err.hidden = false;
      err.textContent = 'JSON 有問題：' + ex.message;
    }
  }

  function save() {
    if (!String(state.work.title || '').trim()) {
      U.toast('填個標題先', true);
      showTab('basics');
      window.scrollTo(0, 0);
      return;
    }
    var saved = Store.save(state.work);
    if (!saved) return;
    state.work = saved;
    state.original = JSON.stringify(stripped(saved));
    state.isNew = false;
    updateDirtyLabel();
    U.toast('儲存咗 ✓');
    App.openTrip(saved.id);
  }

  function close() {
    if (isDirty() && !confirm('有改動未儲存，真係走？')) return;
    if (state.isNew) App.showLibrary();
    else App.openTrip(state.work.id);
  }

  function open(trip, opts) {
    opts = opts || {};
    state.work = Schema.normalize(U.clone(trip));
    state.original = JSON.stringify(stripped(state.work));
    state.tab = 'basics';
    state.openDays = { 0: true };
    state.isNew = !!opts.isNew;
    render();
    window.scrollTo(0, 0);
  }

  document.addEventListener('input', onInput);
  document.addEventListener('change', onInput);
  document.addEventListener('click', onClick);

  DragSort.onDrop = onDrop;

  global.Editor = { open: open, isDirty: function () { return state.work && isDirty(); } };
})(window);
