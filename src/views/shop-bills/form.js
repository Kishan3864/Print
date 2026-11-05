import { html, raw, jsonAttr } from '../../lib/html.js';
import { GST_RATES, UNITS, amountText, computeTotals, moneyInput, parseMoney, parseQty, rs } from '../../services/bills.js';
import { alert, csrfField, icon } from '../components.js';
import { shopIcon } from '../chrome/shop.js';

// /shop/bills/new and /shop/bills/:no/edit – manual bill entry.
// Customer → items (tap from the rate list or type) → discount / GST → payment → save.
// public/js/bills.js adds lines, fills rates from the rate list and keeps the totals live;
// without JS the form still posts and the server does all the maths.

const PICKS_SHOWN = 24;
const MODE_SHORT = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank', other: 'Other' };

/** One editable line. `v` holds the raw strings as typed. */
function lineRow(v = {}, err = '') {
  const amount = (() => {
    const q = parseQty(v.qty);
    const r = parseMoney(v.rate);
    const qty = q === null ? 1 : q;
    return Number.isFinite(qty) && Number.isFinite(r) && r !== null && v.name ? Math.round(qty * r) : 0;
  })();
  return html`<div class="bi-line${err ? ' has-error' : ''}" data-line>
    <label class="bi-l-name"><span class="bi-l-lab">Item</span><input type="text" name="line_name" value="${v.name || ''}" list="bi-itemlist" placeholder="Item name" maxlength="120" autocomplete="off" data-l="name"${err ? raw(' aria-invalid="true"') : ''}></label>
    <label class="bi-l-qty"><span class="bi-l-lab">Qty</span><input type="text" name="line_qty" value="${v.qty || ''}" inputmode="decimal" placeholder="1" maxlength="12" autocomplete="off" data-l="qty"></label>
    <label class="bi-l-unit"><span class="bi-l-lab">Unit</span><input type="text" name="line_unit" value="${v.unit || ''}" list="bi-unitlist" placeholder="pcs" maxlength="20" autocomplete="off" data-l="unit"></label>
    <label class="bi-l-rate"><span class="bi-l-lab">Rate ₹</span><input type="text" name="line_rate" value="${v.rate || ''}" inputmode="decimal" placeholder="0" maxlength="14" autocomplete="off" data-l="rate"></label>
    <span class="bi-l-amt"><span class="bi-l-lab">Amount</span><output data-l="amount">${amountText(amount)}</output></span>
    <button type="button" class="btn btn-ghost btn-sm btn-icon bi-l-del" data-line-remove aria-label="Remove this line" title="Remove line">${icon('x')}</button>
    ${err ? html`<p class="field-error bi-l-err">${err}</p>` : ''}
  </div>`;
}

/** Totals as the server sees the typed values (JS keeps them live). */
function previewTotals(values, taxOn) {
  const lines = [];
  for (const v of values.lines) {
    const q = parseQty(v.qty);
    const r = parseMoney(v.rate);
    const qty = q === null ? 1 : q;
    if (v.name && Number.isFinite(qty) && Number.isFinite(r) && r !== null) lines.push({ qty, rate_paise: r });
  }
  const sub = computeTotals(lines).subtotal;
  const dt = String(values.discount || '').trim();
  const pct = /^(\d{1,3}(?:\.\d{1,2})?)\s*%$/.exec(dt);
  const disc = pct ? Math.round((sub * Math.min(100, Number(pct[1]))) / 100) : Number.isFinite(parseMoney(dt)) ? parseMoney(dt) || 0 : 0;
  return computeTotals(lines, { discount: disc, taxBp: taxOn ? Math.round(Number(values.tax || 0) * 100) : 0 });
}

const field = (id, label, control, { hint = '', error = '', optional = false, cls = '' } = {}) => html`<div class="field${error ? ' has-error' : ''}${cls ? ' ' + cls : ''}">
  <label for="${id}">${label}${optional ? html` <span class="optional">optional</span>` : ''}</label>
  ${control}
  ${hint ? html`<p class="hint" id="${id}-hint">${hint}</p>` : ''}
  ${error ? html`<p class="field-error">${error}</p>` : ''}
</div>`;

/**
 * @param d.res, d.shop, d.settings (billSettings), d.items (rate list, most used first),
 *        d.values (strings as typed), d.errors {list:[], lines:{i:msg}, fields:{name:msg}}, d.bill (when editing), d.order (linked order)
 */
export function billFormView(d) {
  const { res, settings, items, values, errors = { list: [], lines: {}, fields: {} }, bill } = d;
  const fe = errors.fields || {};
  const edit = Boolean(bill);
  const action = edit ? `/shop/bills/${bill.bill_no}` : '/shop/bills';
  const taxOn = Boolean(settings.gstin);
  const t = previewTotals(values, taxOn);
  const itemMap = Object.fromEntries(items.map((i) => [i.name.toLowerCase(), { n: i.name, u: i.unit, r: moneyInput(i.rate_paise) }]));
  const lines = values.lines.length ? values.lines : [{}];
  const errCount = (errors.list || []).length + Object.keys(errors.lines || {}).length + Object.keys(fe).length;

  const picks = items.length
    ? html`<div class="bi-picks-wrap">
        ${items.length > PICKS_SHOWN
          ? html`<div class="search-input bi-pick-find">${icon('search')}<label class="sr-only" for="bi-pick-q">Find an item</label><input type="search" id="bi-pick-q" placeholder="Find an item in your rate list" autocomplete="off" data-pick-filter></div>`
          : ''}
        <div class="bi-picks" role="group" aria-label="Tap an item to add it">
          ${items.map(
            (i, n) => html`<button type="button" class="bi-pick" data-pick="${i.name}"${n >= PICKS_SHOWN ? raw(' hidden data-pick-extra') : ''}><span class="bi-pick-name">${i.name}</span><span class="bi-pick-rate">${rs(i.rate_paise)}${i.unit ? `/${i.unit}` : ''}</span></button>`
          )}
        </div>
        <p class="hint">Tap an item to add it (tap again for one more). Or type any item in a line below.</p>
      </div>`
    : html`<p class="bi-noitems">${shopIcon('tag')}<span>Tip: add your items to the <a href="/shop/bills/items">rate list</a> once, then just tap them here. Or type any item below.</span></p>`;

  const payChoice = (value, label) => html`<label><input type="radio" name="pay" value="${value}"${values.pay === value ? raw(' checked') : ''}><span>${label}</span></label>`;
  const modeChoice = ([value, label]) => html`<label><input type="radio" name="pay_mode" value="${value}"${values.pay_mode === value ? raw(' checked') : ''}><span>${label}</span></label>`;
  const row = (key, label, value, hidden) => html`<div data-row="${key}"${hidden ? raw(' hidden') : ''}><dt data-t="${key}-label">${label}</dt><dd data-t="${key}">${value}</dd></div>`;

  return html`<section class="container bi-page bi-form-page">
    <a class="sh-back" href="${edit ? `/shop/bills/${bill.bill_no}` : '/shop/bills'}">${icon('arrowLeft')}<span>${edit ? `Bill B-${bill.bill_no}` : 'Bills'}</span></a>
    <header class="bi-form-head">
      <h1>${edit ? html`Edit bill <span class="order-no">B-${bill.bill_no}</span>` : 'New bill'}</h1>
      <p>${edit ? 'Change anything – the bill number stays the same.' : html`This will be bill <b>B-${d.shop.next_bill_no}</b> from <b>${d.shop.name}</b>.`}</p>
    </header>

    <form class="bi-form" method="post" action="${action}" novalidate data-bill-form data-live-hold data-items="${jsonAttr(itemMap)}">
      ${csrfField(res)}
      ${values.order_no ? html`<input type="hidden" name="order_no" value="${values.order_no}">` : ''}
      ${errCount
        ? html`<div class="bi-errors">${alert('danger', html`<b>Please fix ${errCount === 1 ? 'this' : 'these'} first – nothing was saved yet.</b>${(errors.list || []).length ? html`<br>${errors.list.join(' ')}` : ''}`)}</div>`
        : ''}
      <div class="bi-form-grid">
        <div class="bi-form-main">
          <section class="card bi-sec" aria-labelledby="bi-cust-h">
            <h2 class="bi-sec-title" id="bi-cust-h"><span class="bi-step">1</span>Customer</h2>
            ${values.order_no ? html`<p class="bi-linked">${icon('link')}<span>For online order <a href="/shop/orders/${values.order_no}">P-${values.order_no}</a></span></p>` : ''}
            <div class="bi-cust-grid">
              ${field('customer_name', 'Name', html`<input type="text" id="customer_name" name="customer_name" value="${values.customer_name}" maxlength="80" autocomplete="off" placeholder="Cash customer">`, { optional: true, error: fe.customer_name })}
              ${field('customer_mobile', 'Mobile', html`<input type="tel" id="customer_mobile" name="customer_mobile" value="${values.customer_mobile}" maxlength="20" inputmode="tel" autocomplete="off" placeholder="For WhatsApp">`, { optional: true, error: fe.customer_mobile })}
              ${field('bill_date', 'Bill date', html`<input type="date" id="bill_date" name="bill_date" value="${values.bill_date}" required>`, { error: fe.bill_date })}
            </div>
            <details class="bi-more"${values.customer_address || values.customer_gstin || fe.customer_gstin ? raw(' open') : ''}>
              <summary>${icon('plus')}<span>Address${taxOn ? ' & GSTIN' : ''}</span></summary>
              <div class="bi-more-body">
                ${field('customer_address', 'Customer address', html`<textarea id="customer_address" name="customer_address" maxlength="300" rows="2">${values.customer_address}</textarea>`, { optional: true })}
                ${taxOn ? field('customer_gstin', 'Customer GSTIN', html`<input type="text" id="customer_gstin" name="customer_gstin" value="${values.customer_gstin}" maxlength="15" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="For business customers">`, { optional: true, error: fe.customer_gstin }) : ''}
              </div>
            </details>
          </section>

          <section class="card bi-sec" aria-labelledby="bi-items-h">
            <div class="bi-sec-row">
              <h2 class="bi-sec-title" id="bi-items-h"><span class="bi-step">2</span>Items</h2>
              <a class="bi-sec-link" href="/shop/bills/items">${shopIcon('tag')}<span>Rate list</span></a>
            </div>
            ${picks}
            <div class="bi-lines" data-lines>
              <div class="bi-lines-head" aria-hidden="true"><span>Item</span><span>Qty</span><span>Unit</span><span>Rate ₹</span><span>Amount ₹</span><span></span></div>
              ${lines.map((v, i) => lineRow(v, (errors.lines || {})[i]))}
            </div>
            <div class="bi-lines-foot">
              <button type="button" class="btn btn-secondary btn-sm" data-line-add>${icon('plus')}<span>Add line</span></button>
              <label class="bi-check"><input type="checkbox" name="save_items" value="1"${values.save_items ? raw(' checked') : ''}><span>Save new items to my rate list</span></label>
            </div>
            <template data-line-template>${lineRow({})}</template>
            <datalist id="bi-itemlist">${items.map((i) => html`<option value="${i.name}"></option>`)}</datalist>
            <datalist id="bi-unitlist">${UNITS.map((u) => html`<option value="${u}"></option>`)}</datalist>
          </section>
        </div>

        <aside class="bi-form-side">
          <section class="card bi-sec bi-sum" aria-labelledby="bi-sum-h">
            <h2 class="bi-sec-title" id="bi-sum-h"><span class="bi-step">3</span>Total & payment</h2>
            <div class="bi-sum-inputs${taxOn ? ' has-tax' : ''}">
              ${field('discount', 'Discount', html`<input type="text" id="discount" name="discount" value="${values.discount}" inputmode="decimal" maxlength="12" autocomplete="off" placeholder="0" data-discount aria-describedby="discount-hint">`, { optional: true, hint: '₹ amount, or % like 10%', error: fe.discount })}
              ${taxOn
                ? field('tax', 'GST', html`<select id="tax" name="tax" data-tax>${GST_RATES.map((r) => html`<option value="${r}"${String(r) === String(values.tax) ? raw(' selected') : ''}>${r ? `${r}%` : 'No GST'}</option>`)}</select>`)
                : ''}
            </div>
            <dl class="bi-totals" data-totals>
              ${row('subtotal', 'Subtotal', rs(t.subtotal, { fixed: true }))}
              ${row('discount', 'Discount', `− ${rs(t.discount, { fixed: true })}`, !t.discount)}
              ${row('tax', `GST ${values.tax || 0}%`, rs(t.tax, { fixed: true }), !t.tax)}
              ${row('round', 'Round off', `${t.round < 0 ? '−' : '+'} ${rs(Math.abs(t.round), { fixed: true })}`, !t.round)}
              <div class="is-total"><dt>Total</dt><dd data-t="total">${rs(t.total, { fixed: true })}</dd></div>
            </dl>

            <fieldset class="bi-fs">
              <legend class="label">Payment</legend>
              <div class="seg bi-seg bi-pay">${payChoice('full', 'Paid')}${payChoice('part', 'Part paid')}${payChoice('none', 'Not paid')}</div>
            </fieldset>
            <div class="bi-part">
              ${field('paid', 'Amount received', html`<input type="text" id="paid" name="paid" value="${values.paid}" inputmode="decimal" maxlength="14" autocomplete="off" placeholder="0" data-paid>`, { error: fe.paid, hint: html`<span data-due-text></span>` })}
            </div>
            <fieldset class="bi-fs bi-mode">
              <legend class="label">Paid by</legend>
              <div class="seg bi-seg bi-seg-sm">${Object.entries(MODE_SHORT).map(modeChoice)}</div>
            </fieldset>
            ${field('notes', 'Note on the bill', html`<textarea id="notes" name="notes" maxlength="500" rows="2" placeholder="e.g. Delivery by Saturday">${values.notes}</textarea>`, { optional: true })}
            <div class="bi-save">
              <button class="btn btn-primary btn-lg btn-block" type="submit" data-loading="Saving…">${icon('check')}<span>${edit ? 'Save changes' : 'Save bill'}</span></button>
              <a class="btn btn-ghost btn-block" href="${edit ? `/shop/bills/${bill.bill_no}` : '/shop/bills'}">Cancel</a>
            </div>
          </section>
        </aside>
      </div>
    </form>
  </section>`;
}
