/* 行程本 · drag to reorder
 *
 * Pointer-events based, because HTML5 drag-and-drop does not fire on
 * touch — and this list is mostly reordered on a phone.
 *
 * The dragged row is lifted with a transform while its neighbours shift
 * out of the way; nothing in the DOM actually moves until the drop, at
 * which point the owner is told "index A became index B" and re-renders
 * from its own data. That keeps this file free of any knowledge of what
 * it is sorting.
 *
 * The ↑ / ↓ buttons stay: they are precise, they work with a keyboard,
 * and dragging a long list on a small screen is fiddly.
 */
(function (global) {
  'use strict';

  var active = null;

  function rowsOf(container, rowSelector) {
    return Array.prototype.filter.call(
      container.querySelectorAll(rowSelector),
      function (r) { return r.parentNode === container; }
    );
  }

  function start(e) {
    var handle = e.target.closest ? e.target.closest('[data-drag]') : null;
    if (!handle || active) return;
    /* Left button or touch only. */
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    var row = handle.closest('[data-dragrow]');
    var container = row && row.parentNode;
    if (!row || !container) return;

    var rows = rowsOf(container, '[data-dragrow]');
    var from = rows.indexOf(row);
    if (from < 0 || rows.length < 2) return;

    e.preventDefault();

    var rects = rows.map(function (r) { return r.getBoundingClientRect(); });
    active = {
      row: row, container: container, rows: rows, rects: rects,
      from: from, to: from,
      startY: e.clientY,
      height: rects[from].height,
      moved: false
    };

    row.classList.add('dragging');
    document.body.classList.add('dragging-now');
    handle.setPointerCapture && handle.setPointerCapture(e.pointerId);
    active.handle = handle;
    active.pointerId = e.pointerId;
  }

  function move(e) {
    if (!active) return;
    var dy = e.clientY - active.startY;
    if (!active.moved && Math.abs(dy) < 4) return;   /* ignore a shaky tap */
    active.moved = true;
    e.preventDefault();

    active.row.style.transform = 'translateY(' + dy + 'px)';

    /* Where would it land? Compare the dragged row's centre against the
       original centres of the others. */
    var centre = active.rects[active.from].top + active.rects[active.from].height / 2 + dy;
    var to = active.from;
    for (var i = 0; i < active.rects.length; i++) {
      if (i === active.from) continue;
      var r = active.rects[i];
      var mid = r.top + r.height / 2;
      if (i < active.from && centre < mid) { to = Math.min(to, i); }
      else if (i > active.from && centre > mid) { to = Math.max(to, i); }
    }
    if (to !== active.to) {
      active.to = to;
      shift();
    }
  }

  /* Slide the untouched rows to preview the new order. */
  function shift() {
    var a = active;
    a.rows.forEach(function (r, i) {
      if (i === a.from) return;
      var move = 0;
      if (a.to > a.from && i > a.from && i <= a.to) move = -a.height;
      else if (a.to < a.from && i >= a.to && i < a.from) move = a.height;
      r.style.transform = move ? 'translateY(' + move + 'px)' : '';
      r.style.transition = 'transform .14s ease';
    });
  }

  function end() {
    if (!active) return;
    var a = active;
    active = null;

    a.rows.forEach(function (r) { r.style.transform = ''; r.style.transition = ''; });
    a.row.classList.remove('dragging');
    document.body.classList.remove('dragging-now');
    if (a.handle && a.handle.releasePointerCapture && a.pointerId != null) {
      try { a.handle.releasePointerCapture(a.pointerId); } catch (err) { /* already released */ }
    }

    if (!a.moved || a.to === a.from) return;

    var listPath = a.container.getAttribute('data-draglist');
    if (listPath && typeof global.DragSort.onDrop === 'function') {
      global.DragSort.onDrop(listPath, a.from, a.to);
    }
  }

  function init() {
    document.addEventListener('pointerdown', start);
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  }

  global.DragSort = { init: init, onDrop: null };
})(window);
