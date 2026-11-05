/* Brighton Print – shop bills: bill form (lines, one-tap items, live totals), share PDF, print, rate list helpers. CSP-safe, no inline code. */
(function () {
  'use strict';

  var PD = window.PD || {};
  var fmt = window.Intl ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;

  function money(paise) {
    var r = (paise || 0) / 100;
    return '₹' + (fmt ? fmt.format(r) : r.toFixed(2));
  }
  function plain(paise) {
    var r = (paise || 0) / 100;
    return fmt ? fmt.format(r) : r.toFixed(2);
  }
  function tidy(v) {
    return String(v || '').replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  }
  /** paise, null for blank, NaN when invalid (same rules as the server). */
  function parseMoney(v) {
    var s = tidy(v);
    if (!s) return null;
    var m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
    if (!m) return NaN;
    return Number(m[1]) * 100 + Number((m[2] || '0').concat('0').slice(0, 2));
  }
  function parseQty(v) {
    var s = tidy(v);
    if (!s) return null;
    var m = /^(\d{1,7})(?:\.(\d{1,3}))?$/.exec(s);
    if (!m) return NaN;
    return Number(m[1]) + Number('0.' + (m[2] || '0'));
  }
  function inputOf(line, key) {
    return line.querySelector('[data-l="' + key + '"]');
  }

  // ---------- bill form ----------
  function items(form) {
    if (!form._items) {
      try {
        form._items = JSON.parse(form.getAttribute('data-items') || '{}');
      } catch (e) {
        form._items = {};
      }
    }
    return form._items;
  }

  function setRow(form, key, label, value, show) {
    var row = form.querySelector('[data-row="' + key + '"]');
    if (!row) return;
    row.hidden = !show;
    var dd = row.querySelector('[data-t="' + key + '"]');
    if (dd) dd.textContent = value;
    var dt = row.querySelector('[data-t="' + key + '-label"]');
    if (dt && label) dt.textContent = label;
  }

  function recalc(form) {
    var subtotal = 0;
    Array.prototype.forEach.call(form.querySelectorAll('[data-line]'), function (line) {
      var name = inputOf(line, 'name').value.trim();
      var q = parseQty(inputOf(line, 'qty').value);
      var qty = q === null ? 1 : q;
      var r = parseMoney(inputOf(line, 'rate').value);
      var amount = name && isFinite(qty) && r !== null && isFinite(r) ? Math.round(qty * r) : 0;
      subtotal += amount;
      var out = inputOf(line, 'amount');
      if (out) out.textContent = plain(amount);
    });
    var dEl = form.querySelector('[data-discount]');
    var dv = dEl ? dEl.value.trim() : '';
    var pct = /^(\d{1,3}(?:\.\d{1,2})?)\s*%$/.exec(dv);
    var discount = 0;
    if (pct) discount = Math.round((subtotal * Math.min(100, Number(pct[1]))) / 100);
    else {
      var d = parseMoney(dv);
      if (d !== null && isFinite(d)) discount = d;
    }
    discount = Math.min(Math.max(0, discount), subtotal);
    var taxEl = form.querySelector('[data-tax]');
    var taxPct = taxEl ? Number(taxEl.value) || 0 : 0;
    var taxable = subtotal - discount;
    var tax = Math.round((taxable * taxPct * 100) / 10000);
    var exact = taxable + tax;
    var total = Math.round(exact / 100) * 100;
    var round = total - exact;

    setRow(form, 'subtotal', '', money(subtotal), true);
    setRow(form, 'discount', '', '− ' + money(discount), discount > 0);
    setRow(form, 'tax', 'GST ' + taxPct + '%', money(tax), tax > 0);
    setRow(form, 'round', '', (round < 0 ? '− ' : '+ ') + money(Math.abs(round)), round !== 0);
    var tEl = form.querySelector('[data-t="total"]');
    if (tEl) tEl.textContent = money(total);

    var paidEl = form.querySelector('[data-paid]');
    var dueText = form.querySelector('[data-due-text]');
    if (paidEl && dueText) {
      var p = parseMoney(paidEl.value);
      dueText.textContent = p !== null && isFinite(p) && p > 0 ? (p >= total ? 'That is the full amount – it will be saved as paid.' : money(total - p) + ' will show as due.') : '';
    }
  }

  function lines(form) {
    return form.querySelector('[data-lines]');
  }

  function addLine(form, focus) {
    var tpl = form.querySelector('template[data-line-template]');
    var box = lines(form);
    if (!tpl || !box) return null;
    if (box.querySelectorAll('[data-line]').length >= 40) {
      if (PD.toast) PD.toast('A bill can have up to 40 lines. Make a second bill for the rest.');
      return null;
    }
    var node = document.importNode(tpl.content, true).querySelector('[data-line]');
    box.appendChild(node);
    if (focus) inputOf(node, 'name').focus();
    return node;
  }

  function flashLine(line) {
    line.classList.remove('is-flash');
    void line.offsetWidth;
    line.classList.add('is-flash');
  }

  /** Fills unit + rate from the rate list when the typed name matches an item. */
  function autofill(form, line, force) {
    var name = inputOf(line, 'name').value.trim().toLowerCase();
    var it = items(form)[name];
    if (!it) return false;
    var unit = inputOf(line, 'unit');
    var rate = inputOf(line, 'rate');
    if (force || !unit.value.trim()) unit.value = it.u || '';
    if (force || !rate.value.trim() || rate.hasAttribute('data-auto')) {
      rate.value = it.r;
      rate.setAttribute('data-auto', '');
    }
    return true;
  }

  function pick(form, name) {
    var it = items(form)[name.toLowerCase()];
    if (!it) return;
    var all = form.querySelectorAll('[data-line]');
    var target = null;
    for (var i = 0; i < all.length; i++) {
      if (inputOf(all[i], 'name').value.trim().toLowerCase() === name.toLowerCase()) {
        var q = parseQty(inputOf(all[i], 'qty').value);
        var qty = q === null || !isFinite(q) ? 1 : q;
        inputOf(all[i], 'qty').value = String(Math.round((qty + 1) * 1000) / 1000);
        recalc(form);
        flashLine(all[i]);
        if (PD.toast) PD.toast(it.n + ' × ' + inputOf(all[i], 'qty').value);
        return;
      }
    }
    for (var j = 0; j < all.length; j++) {
      var l = all[j];
      if (!inputOf(l, 'name').value.trim() && !inputOf(l, 'rate').value.trim()) {
        target = l;
        break;
      }
    }
    if (!target) target = addLine(form, false);
    if (!target) return;
    inputOf(target, 'name').value = it.n;
    inputOf(target, 'qty').value = '1';
    autofill(form, target, true);
    recalc(form);
    flashLine(target);
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t.closest) return;
    var form = t.closest('[data-bill-form]');

    var pickBtn = t.closest('[data-pick]');
    if (pickBtn && form) {
      e.preventDefault();
      pick(form, pickBtn.getAttribute('data-pick'));
      pickBtn.classList.add('is-added');
      return;
    }
    if (t.closest('[data-line-add]') && form) {
      e.preventDefault();
      addLine(form, true);
      return;
    }
    var del = t.closest('[data-line-remove]');
    if (del && form) {
      e.preventDefault();
      var line = del.closest('[data-line]');
      if (form.querySelectorAll('[data-line]').length > 1) line.remove();
      else
        Array.prototype.forEach.call(line.querySelectorAll('input'), function (x) {
          x.value = '';
          x.removeAttribute('data-auto');
        });
      recalc(form);
      return;
    }
    if (t.closest('[data-print]')) {
      e.preventDefault();
      window.print();
    }
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t.closest) return;
    var form = t.closest('[data-bill-form]');
    if (form) {
      if (t.getAttribute('data-l') === 'rate') t.removeAttribute('data-auto');
      if (t.getAttribute('data-l') === 'name') autofill(form, t.closest('[data-line]'), false);
      recalc(form);
    }
    if (t.hasAttribute('data-pick-filter')) filterPicks(t);
    if (t.hasAttribute('data-item-filter')) filterItems(t);
    var itemForm = t.closest('[data-item-form]');
    if (itemForm) markDirty(itemForm);
  });

  document.addEventListener('change', function (e) {
    var form = e.target.closest ? e.target.closest('[data-bill-form]') : null;
    if (form) recalc(form);
  });

  // Enter inside a line: next field, or a new line after the rate (no accidental half-done bill).
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !e.target.closest) return;
    var line = e.target.closest('[data-line]');
    var form = e.target.closest('[data-bill-form]');
    if (!line || !form) return;
    e.preventDefault();
    var key = e.target.getAttribute('data-l');
    if (key === 'rate') {
      var next = line.nextElementSibling;
      if (next && next.hasAttribute('data-line')) inputOf(next, 'name').focus();
      else addLine(form, true);
      return;
    }
    var order = ['name', 'qty', 'unit', 'rate'];
    var nextEl = inputOf(line, order[order.indexOf(key) + 1] || 'rate');
    if (nextEl) nextEl.focus();
  });

  function filterPicks(input) {
    var q = input.value.trim().toLowerCase();
    var wrap = input.closest('.bi-picks-wrap');
    if (!wrap) return;
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-pick]'), function (b) {
      var match = b.getAttribute('data-pick').toLowerCase().indexOf(q) !== -1;
      b.hidden = q ? !match : b.hasAttribute('data-pick-extra');
    });
  }

  // ---------- rate list ----------
  function filterItems(input) {
    var q = input.value.trim().toLowerCase();
    var shown = 0;
    Array.prototype.forEach.call(document.querySelectorAll('[data-item-row]'), function (row) {
      var match = !q || row.getAttribute('data-name').indexOf(q) !== -1;
      row.hidden = !match;
      if (match) shown++;
    });
    var none = document.querySelector('[data-item-none]');
    if (none) none.hidden = shown > 0;
  }

  function markDirty(form) {
    var dirty = Array.prototype.some.call(form.querySelectorAll('input[type=text]'), function (x) {
      return x.value !== x.defaultValue;
    });
    var row = form.closest('[data-item-row]');
    if (row) row.classList.toggle('is-dirty', dirty);
  }

  // ---------- share the PDF file (Android / iOS share sheet → WhatsApp etc.) ----------
  function initShare() {
    var btns = document.querySelectorAll('[data-share-pdf]');
    if (!btns.length || !navigator.canShare || !window.File) return;
    var ok = false;
    try {
      ok = navigator.canShare({ files: [new File(['x'], 'bill.pdf', { type: 'application/pdf' })] });
    } catch (e) {
      ok = false;
    }
    if (!ok) return;
    Array.prototype.forEach.call(btns, function (b) {
      b.hidden = false;
      if (b._bound) return;
      b._bound = true;
      b.addEventListener('click', function () {
        b.disabled = true;
        fetch(b.getAttribute('data-share-pdf'), { credentials: 'same-origin' })
          .then(function (r) {
            if (!r.ok) throw new Error('PDF ' + r.status);
            return r.blob();
          })
          .then(function (blob) {
            var file = new File([blob], b.getAttribute('data-share-name') || 'bill.pdf', { type: 'application/pdf' });
            return navigator.share({ files: [file], title: b.getAttribute('data-share-title') || 'Bill' });
          })
          .catch(function (err) {
            if (err && err.name === 'AbortError') return;
            if (PD.toast) PD.toast('Could not share the PDF. Use Download PDF instead.');
          })
          .then(function () {
            b.disabled = false;
          });
      });
    });
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-bill-form]'), recalc);
    initShare();
  }
  init();
  document.addEventListener('pd:live-updated', init);
})();
