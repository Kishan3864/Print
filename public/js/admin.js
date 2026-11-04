/* Brighton Print admin tables (CSP-safe, no inline code). Everything here is an enhancement:
   without JS the same links sort on the server and the search box searches on Enter.
   - <input data-row-filter="#table">     type-to-filter rows (tr[data-row][data-search])
   - <table data-sortable> + [data-sort]   click a header to sort by tr[data-s-<key>] (empty values last)
   - <select data-sort-select="#table">    the same sorts from a menu (phones, where headers are hidden)
   - [data-row-count] / [data-row-empty]  live result count / "no match" line
   - [data-sync-query]                    links that keep ?sort=&dir= in step (CSV export)
   - "/" focuses the search box; details.adm-acct closes on outside click / Escape. */
(function () {
  'use strict';

  var ICONS = {
    none: '<path d="M8 9l4-4 4 4M8 15l4 4 4-4"/>',
    asc: '<path d="M8 14l4-4 4 4"/>',
    desc: '<path d="M8 10l4 4 4-4"/>',
  };
  function svg(path) {
    return '<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + path + '</svg>';
  }
  function setParams(href, params) {
    var u = new URL(href, location.href);
    Object.keys(params).forEach(function (k) {
      if (params[k]) u.searchParams.set(k, params[k]);
      else u.searchParams.delete(k);
    });
    return u.pathname + u.search + u.hash;
  }

  // ---------- sorting ----------
  function compare(x, y) {
    var nx = Number(x);
    var ny = Number(y);
    if (!isNaN(nx) && !isNaN(ny)) return nx - ny;
    return String(x).localeCompare(String(y));
  }

  function makeSortable(table) {
    var tbody = table.tBodies[0];
    if (!tbody) return null;
    Array.prototype.forEach.call(tbody.rows, function (r, i) {
      r.setAttribute('data-i', String(i));
    });
    var heads = Array.prototype.slice.call(table.querySelectorAll('[data-sort]'));
    heads.forEach(function (h) {
      var th = h.closest('th');
      var s = th && th.getAttribute('aria-sort');
      h.setAttribute('data-current', s === 'ascending' ? 'asc' : s === 'descending' ? 'desc' : '');
    });

    function sortBy(key, dir) {
      var rows = Array.prototype.slice.call(tbody.rows);
      var sign = dir === 'desc' ? -1 : 1;
      rows.sort(function (a, b) {
        if (!key) return compare(a.getAttribute('data-i'), b.getAttribute('data-i'));
        var x = a.getAttribute('data-s-' + key);
        var y = b.getAttribute('data-s-' + key);
        var ex = x === null || x === '';
        var ey = y === null || y === '';
        if (ex || ey) return ex === ey ? 0 : ex ? 1 : -1;
        return compare(x, y) * sign || compare(a.getAttribute('data-i'), b.getAttribute('data-i'));
      });
      rows.forEach(function (r) {
        tbody.appendChild(r);
      });
      heads.forEach(function (h) {
        var on = h.getAttribute('data-sort') === key;
        var th = h.closest('th');
        if (th) th.setAttribute('aria-sort', on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none');
        h.setAttribute('data-current', on ? dir : '');
        var ic = h.querySelector('.adm-sort-ic');
        if (ic) ic.innerHTML = svg(ICONS[on ? dir : 'none']);
        if (h.tagName === 'A') {
          var next = on ? (dir === 'asc' ? 'desc' : 'asc') : h.getAttribute('data-sort-dir') || 'asc';
          h.setAttribute('href', setParams(h.getAttribute('href'), { sort: h.getAttribute('data-sort'), dir: next }));
        }
      });
      var params = { sort: key, dir: key ? dir : '' };
      if (table.hasAttribute('data-sort-url') && history.replaceState) history.replaceState(null, '', setParams(location.href, params));
      document.querySelectorAll('[data-sync-query]').forEach(function (a) {
        a.setAttribute('href', setParams(a.getAttribute('href'), params));
      });
      document.querySelectorAll('[data-sort-select="#' + table.id + '"]').forEach(function (sel) {
        sel.value = key || '';
      });
    }

    table.addEventListener('click', function (e) {
      var h = e.target.closest ? e.target.closest('[data-sort]') : null;
      if (!h || !table.contains(h)) return;
      e.preventDefault();
      var cur = h.getAttribute('data-current');
      sortBy(h.getAttribute('data-sort'), cur ? (cur === 'asc' ? 'desc' : 'asc') : h.getAttribute('data-sort-dir') || 'asc');
    });
    return sortBy;
  }

  document.querySelectorAll('table[data-sortable]').forEach(function (table) {
    var sortBy = makeSortable(table);
    if (!sortBy || !table.id) return;
    document.querySelectorAll('[data-sort-select="#' + table.id + '"]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var h = table.querySelector('[data-sort="' + sel.value + '"]');
        sortBy(sel.value, h ? h.getAttribute('data-sort-dir') || 'asc' : 'asc');
      });
    });
  });

  // ---------- type-to-filter ----------
  document.querySelectorAll('[data-row-filter]').forEach(function (input) {
    var table = document.querySelector(input.getAttribute('data-row-filter'));
    if (!table || !table.tBodies[0]) return;
    var rows = Array.prototype.slice.call(table.tBodies[0].querySelectorAll('tr[data-row]'));
    var box = table.closest('.table-wrap') || table.parentElement;
    var empty = box ? box.querySelector('[data-row-empty]') : null;
    var count = document.querySelector('[data-row-count]');
    var original = count ? count.innerHTML : '';
    var noun = (count && count.getAttribute('data-noun')) || 'row';
    var start = input.value.trim().toLowerCase();

    function apply() {
      var q = input.value.trim().toLowerCase();
      if (q === start) {
        rows.forEach(function (tr) {
          tr.hidden = false;
        });
        if (empty) empty.hidden = true;
        if (count) count.innerHTML = original;
        return;
      }
      var words = q.split(/\s+/).filter(Boolean);
      var digits = q.replace(/\D/g, '');
      var shown = 0;
      rows.forEach(function (tr) {
        var key = tr.getAttribute('data-search') || '';
        var ok =
          !words.length ||
          words.every(function (w) {
            return key.indexOf(w) !== -1;
          }) ||
          (digits.length >= 3 && digits.length === q.replace(/[\s()+-]/g, '').length && key.replace(/\D/g, '').indexOf(digits) !== -1);
        tr.hidden = !ok;
        if (ok) shown++;
      });
      if (empty) empty.hidden = shown > 0;
      if (count) {
        count.textContent = '';
        var b = document.createElement('b');
        b.textContent = String(shown);
        count.appendChild(b);
        count.appendChild(document.createTextNode(' of ' + rows.length + ' ' + noun + (rows.length === 1 ? '' : 's') + ' match'));
      }
    }
    input.addEventListener('input', apply);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && input.value) {
        input.value = '';
        apply();
      }
    });
  });

  // "/" jumps to the search box (unless typing somewhere already).
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    var box = document.querySelector('[data-row-filter]');
    if (!box) return;
    e.preventDefault();
    box.focus();
    box.select();
  });

  // ---------- tables: scroll inside the card by default; when the table fits, let the header stick to the page ----------
  function fitTables() {
    document.querySelectorAll('.adm-table-wrap').forEach(function (wrap) {
      var table = wrap.querySelector('table');
      if (!table) return;
      wrap.classList.remove('fits');
      if (table.offsetWidth <= wrap.clientWidth + 1) wrap.classList.add('fits');
    });
  }
  fitTables();
  var fitTimer;
  window.addEventListener('resize', function () {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fitTables, 120);
  });
  document.addEventListener('pd:live-updated', fitTables);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTables);

  // ---------- account menu in the header ----------
  document.addEventListener('click', function (e) {
    document.querySelectorAll('details.adm-acct[open]').forEach(function (d) {
      if (!d.contains(e.target)) d.removeAttribute('open');
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('details.adm-acct[open]').forEach(function (d) {
      d.removeAttribute('open');
      var s = d.querySelector('summary');
      if (s) s.focus();
    });
  });
})();
