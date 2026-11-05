import { html, raw } from '../../lib/html.js';
import { prettyPhone } from '../../lib/util.js';
import { GST_RATES } from '../../services/bills.js';
import { alert, csrfField, icon } from '../components.js';
import { shopAvatar, shopIcon } from '../chrome/shop.js';
import { billsSubnav, newBillButton, pageHead } from './common.js';

// /shop/bills/setup – what goes on every bill: GSTIN (+ default GST), UPI ID (pay QR), footer note.
// Name, logo, colour, address and phone come from Account.

const describe = (id, error) => raw(` aria-describedby="${id}-hint"${error ? ' aria-invalid="true"' : ''}`);

/** @param d.res, d.shop, d.values (strings), d.errors, d.locked (shared sample shop) */
export function setupView(d) {
  const { res, shop, values, errors = {}, locked } = d;
  const address = String(shop.address || '').trim() || shop.city;
  const phone = shop.phone || shop.mobile;
  const field = (id, label, control, hint, { optional = true } = {}) => html`<div class="field${errors[id] ? ' has-error' : ''}">
    <label for="${id}">${label}${optional ? html` <span class="optional">optional</span>` : ''}</label>
    ${control}
    <p class="hint" id="${id}-hint">${hint}</p>
    ${errors[id] ? html`<p class="field-error">${errors[id]}</p>` : ''}
  </div>`;

  return html`<section class="container bi-page">
    ${pageHead({ title: 'Bill setup', text: 'What appears on every bill. Fill only what you need – everything here is optional.', action: newBillButton() })}
    ${billsSubnav('setup')}
    <div class="bi-setup-grid">
      <section class="card card-pad bi-setup" aria-labelledby="bi-setup-h">
        <h2 id="bi-setup-h">Bill details</h2>
        ${locked ? alert('info', 'Bill setup is locked in the sample shop. Create your own demo or register your shop to change it.') : ''}
        ${Object.keys(errors).length ? alert('danger', 'Please fix the fields marked in red. Nothing was saved yet.') : ''}
        <form method="post" action="/shop/bills/setup" novalidate>
          ${csrfField(res)}
          <div class="bi-setup-gst">
            ${field(
              'gstin',
              'Your GSTIN',
              html`<input type="text" id="gstin" name="gstin" value="${values.gstin}" maxlength="15" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="e.g. 23ABCDE1234F1Z5"${describe('gstin', errors.gstin)}>`,
              'Only if your shop is GST registered. Bills then become “Tax invoice” with CGST + SGST.'
            )}
            ${field(
              'gstRate',
              'Usual GST',
              html`<select id="gstRate" name="gstRate"${describe('gstRate')}>${GST_RATES.map((r) => html`<option value="${r}"${String(r) === String(values.gstRate) ? raw(' selected') : ''}>${r ? `${r}%` : 'No GST'}</option>`)}</select>`,
              'Picked for new bills – you can change it on each bill.',
              { optional: false }
            )}
          </div>
          ${field(
            'upi',
            'UPI ID',
            html`<input type="text" id="upi" name="upi" value="${values.upi}" maxlength="96" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="e.g. yourshop@okicici"${describe('upi', errors.upi)}>`,
            'Bills with money still due get a “Scan to pay” QR code for exactly that amount.'
          )}
          ${field(
            'terms',
            'Note at the bottom of every bill',
            html`<textarea id="terms" name="terms" maxlength="400" rows="3"${describe('terms', errors.terms)}>${values.terms}</textarea>`,
            'For example: “Goods once sold will not be taken back. Thank you!”'
          )}
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" data-loading="Saving…"${locked ? raw(' disabled') : ''}>${icon('check')}<span>Save</span></button>
            <a class="btn btn-secondary" href="/shop/bills/sample.pdf" target="_blank" rel="noopener">${icon('eye')}<span>See a sample bill (PDF)</span></a>
          </div>
        </form>
      </section>

      <aside class="card card-pad bi-setup-from" aria-labelledby="bi-from-h">
        <h2 id="bi-from-h">From your Account</h2>
        <p class="hint">Top of every bill. Change these in Account.</p>
        <div class="bi-from">
          ${shopAvatar(shop, 'sh-avatar bi-from-logo')}
          <div class="bi-from-text">
            <b>${shop.name}</b>
            ${address ? html`<span class="bi-doc-addr">${address}</span>` : html`<span class="bi-from-missing">No address yet</span>`}
            ${phone ? html`<span>Phone: ${prettyPhone(phone)}</span>` : html`<span class="bi-from-missing">No phone yet</span>`}
          </div>
        </div>
        <ul class="bi-from-list">
          <li>${shop.logo_file ? icon('check') : icon('info')}<span>${shop.logo_file ? 'Logo added' : 'No logo – your initial is shown'}${shop.logo_file && /\.webp$/i.test(shop.logo_file) ? ' (WebP logos show as your initial in PDFs; PNG/JPG work everywhere)' : ''}</span></li>
          <li>${icon('check')}<span>Your shop colour is used for the bill’s top bar and totals</span></li>
        </ul>
        <a class="btn btn-secondary btn-sm" href="/shop/settings">${shopIcon('edit')}<span>Change in Account</span></a>
      </aside>
    </div>
  </section>`;
}
