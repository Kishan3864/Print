import { html, raw } from '../../lib/html.js';
import { MAX_ITEMS, STARTER_ITEMS, UNITS, moneyInput } from '../../services/bills.js';
import { alert, csrfField, icon } from '../components.js';
import { shopIcon } from '../chrome/shop.js';
import { billsSubnav, newBillButton, pageHead } from './common.js';

// /shop/bills/items – the rate list: everything the shop sells with unit and rate.
// Add one at a time at the top; every row is editable in place (Save per row).

/**
 * @param d.res, d.items, d.use ({itemId: bills}), d.values (add form as typed), d.errors (add form), d.editErrors {id, text}
 */
export function itemsView(d) {
  const { res, items, use = {}, values = {}, errors = {} } = d;
  const full = items.length >= MAX_ITEMS;
  const names = new Set(items.map((i) => i.name.toLowerCase()));
  const missingStarters = STARTER_ITEMS.filter((s) => !names.has(s.name.toLowerCase())).length;
  const errText = Object.values(errors).filter(Boolean);

  const addForm = html`<section class="card bi-add" aria-labelledby="bi-add-h">
    <h2 id="bi-add-h">${icon('plus')}<span>Add an item</span></h2>
    ${errText.length ? alert('danger', errText.join(' ')) : ''}
    <form class="bi-add-form" method="post" action="/shop/bills/items" novalidate>
      ${csrfField(res)}
      <label class="bi-add-name${errors.name ? ' has-error' : ''}"><span class="label">Item name</span><input type="text" name="name" value="${values.name || ''}" maxlength="120" required autocomplete="off" placeholder="e.g. Colour print (A4)"${errors.name ? raw(' aria-invalid="true"') : ''}${full ? raw(' disabled') : ''}></label>
      <label class="bi-add-unit"><span class="label">Unit <span class="optional">optional</span></span><input type="text" name="unit" value="${values.unit || ''}" maxlength="20" list="bi-unitlist" autocomplete="off" placeholder="page"${full ? raw(' disabled') : ''}></label>
      <label class="bi-add-rate${errors.rate ? ' has-error' : ''}"><span class="label">Rate</span><span class="input-group"><span class="input-addon">₹</span><input type="text" name="rate" value="${values.rate || ''}" inputmode="decimal" maxlength="14" required autocomplete="off" placeholder="10"${errors.rate ? raw(' aria-invalid="true"') : ''}${full ? raw(' disabled') : ''}></span></label>
      <button class="btn btn-primary bi-add-btn" type="submit"${full ? raw(' disabled') : ''}>${icon('plus')}<span>Add</span></button>
    </form>
    <datalist id="bi-unitlist">${UNITS.map((u) => html`<option value="${u}"></option>`)}</datalist>
    <p class="hint">${full ? `Your rate list is full (${MAX_ITEMS} items). Remove items you no longer sell.` : 'Rate is per unit – a bill multiplies it by the quantity. Changing a rate later never changes old bills.'}</p>
  </section>`;

  const starter =
    missingStarters && !full
      ? html`<section class="card bi-starter">
          <span class="bi-start-ic">${shopIcon('bolt')}</span>
          <div class="bi-start-copy">
            <h2>${items.length ? 'Add the common print-shop items' : 'Start with common print-shop items'}</h2>
            <p>${STARTER_ITEMS.slice(0, 5).map((s) => s.name).join(', ')} and more (${missingStarters} items) with typical rates. Change the rates to yours after adding.</p>
          </div>
          <form method="post" action="/shop/bills/items/starter" class="inline-form">${csrfField(res)}<button class="btn btn-secondary btn-sm" type="submit">${icon('plus')}<span>Add ${missingStarters} items</span></button></form>
        </section>`
      : '';

  const row = (it) => {
    const bad = d.editErrors && d.editErrors.id === it.id ? d.editErrors.text : '';
    const n = use[it.id] || 0;
    return html`<li class="bi-item${bad ? ' has-error' : ''}" data-item-row data-name="${it.name.toLowerCase()}">
      <form class="bi-item-form" method="post" action="/shop/bills/items/${it.id}" data-item-form>
        ${csrfField(res)}
        <label class="bi-i-name"><span class="sr-only">Item name</span><input type="text" name="name" value="${it.name}" maxlength="120" required autocomplete="off"></label>
        <label class="bi-i-unit"><span class="sr-only">Unit</span><input type="text" name="unit" value="${it.unit}" maxlength="20" list="bi-unitlist" autocomplete="off" placeholder="unit"></label>
        <label class="bi-i-rate"><span class="sr-only">Rate in rupees</span><span class="input-group"><span class="input-addon">₹</span><input type="text" name="rate" value="${moneyInput(it.rate_paise)}" inputmode="decimal" maxlength="14" required autocomplete="off"></span></label>
        <span class="bi-i-use">${n ? `${n} bill${n === 1 ? '' : 's'}` : 'Not used yet'}</span>
        <span class="bi-i-actions">
          <button class="btn btn-secondary btn-sm bi-i-save" type="submit" aria-label="Save ${it.name}" title="Save changes">${icon('check')}<span>Save</span></button>
          <button class="btn btn-ghost btn-sm btn-icon bi-i-del" type="submit" form="del-item-${it.id}" aria-label="Remove ${it.name}" title="Remove from rate list">${shopIcon('trash')}</button>
        </span>
        ${bad ? html`<p class="field-error bi-i-err">${bad}</p>` : ''}
      </form>
    </li>`;
  };

  const list = items.length
    ? html`<section class="card bi-items" aria-labelledby="bi-items-h">
        <div class="bi-items-head">
          <h2 id="bi-items-h">Your rate list <span class="count">${items.length}</span></h2>
          ${items.length > 8 ? html`<div class="search-input bi-items-find">${icon('search')}<label class="sr-only" for="bi-item-q">Find an item</label><input type="search" id="bi-item-q" placeholder="Find an item" autocomplete="off" data-item-filter></div>` : ''}
        </div>
        <div class="bi-items-cols" aria-hidden="true"><span>Item</span><span>Unit</span><span>Rate</span><span>Used in</span><span></span></div>
        <ul class="bi-item-list">${items.map(row)}</ul>
        <p class="bi-items-none" data-item-none hidden>No item matches.</p>
        ${items.map((it) => html`<form id="del-item-${it.id}" method="post" action="/shop/bills/items/${it.id}/delete" class="sr-only" data-confirm="Remove “${it.name}” from your rate list? Old bills keep it.">${csrfField(res)}</form>`)}
      </section>`
    : html`<section class="card"><div class="sh-empty">
        <span class="sh-empty-icon">${shopIcon('tag')}</span>
        <h3>Your rate list is empty</h3>
        <p>Add the items you sell above – like “Colour print (A4)” at ₹10 per page. They show up as one-tap buttons when you make a bill.</p>
      </div></section>`;

  return html`<section class="container bi-page">
    ${pageHead({ title: 'Rate list', text: 'Everything you sell, with its unit and rate. Add items one by one – they appear as one-tap options when you make a bill.', action: newBillButton() })}
    ${billsSubnav('items', { items: items.length })}
    ${addForm}
    ${starter}
    ${list}
  </section>`;
}
