import { html, raw } from '../../lib/html.js';
import { formatDate, formatDateTime, prettyPhone } from '../../lib/util.js';
import { PAY_MODES, amountInWords, amountText, billDue, moneyInput, payState, qtyText, rs } from '../../services/bills.js';
import { csrfField, icon } from '../components.js';
import { shopAvatar, shopIcon } from '../chrome/shop.js';
import { billNo, billPath, payPill } from './common.js';

// /shop/bills/:no – the bill as the customer gets it (same layout as the PDF), and next to it:
// collect payment, send (PDF / WhatsApp / link), edit, duplicate, cancel.

const STATE_TEXT = { paid: 'Paid', part: 'Part paid', due: 'Not paid yet', cancelled: 'Cancelled' };

/** The bill "paper" – mirrors services/bill-pdf.js. */
export function billDocument({ shop, bill, lines, settings, qrSvg }) {
  const state = payState(bill);
  const due = billDue(bill);
  const isTax = Boolean(settings.gstin) && bill.tax_bp > 0;
  const address = String(shop.address || '').trim() || String(shop.city || '').trim();
  const phone = shop.phone || shop.mobile;
  const pct = bill.tax_bp / 100;
  const half = Math.floor(bill.tax_paise / 2);
  const sumRow = (label, value, cls = '') => html`<div${cls ? raw(` class="${cls}"`) : ''}><dt>${label}</dt><dd>${value}</dd></div>`;

  return html`<article class="bi-doc${bill.status === 'cancelled' ? ' is-cancelled' : ''}" aria-label="Bill ${billNo(bill)}">
    ${bill.status === 'cancelled' ? html`<span class="bi-doc-mark" aria-hidden="true">Cancelled</span>` : shop.is_demo || bill.is_sample ? html`<span class="bi-doc-mark is-demo" aria-hidden="true">Demo</span>` : ''}
    <header class="bi-doc-head">
      <div class="bi-doc-shop">
        ${shopAvatar(shop, 'sh-avatar bi-doc-logo')}
        <div class="bi-doc-shop-text">
          <b class="bi-doc-shop-name">${shop.name}</b>
          ${address ? html`<span class="bi-doc-addr">${address}</span>` : ''}
          ${phone || settings.gstin
            ? html`<span>${[phone ? `Phone ${prettyPhone(phone)}` : '', settings.gstin ? `GSTIN ${settings.gstin}` : ''].filter(Boolean).map((t) => t.replace(/ /g, ' ')).join('  ·  ')}</span>`
            : ''}
        </div>
      </div>
      <div class="bi-doc-title">
        <h2>${isTax ? 'Tax invoice' : 'Bill'}</h2>
        <dl>
          <div><dt>Bill no.</dt><dd>${billNo(bill)}</dd></div>
          <div><dt>Date</dt><dd>${formatDate(bill.bill_date)}</dd></div>
          ${bill.order_no ? html`<div><dt>Online order</dt><dd>P-${bill.order_no}</dd></div>` : ''}
        </dl>
      </div>
    </header>

    <div class="bi-doc-strip">
      <section>
        <h3>Billed to</h3>
        <p class="bi-doc-cust">${bill.customer_name || 'Cash customer'}</p>
        ${bill.customer_mobile ? html`<p>Mobile ${prettyPhone(bill.customer_mobile)}</p>` : ''}
        ${bill.customer_address ? html`<p class="bi-doc-addr">${bill.customer_address}</p>` : ''}
        ${bill.customer_gstin ? html`<p>GSTIN ${bill.customer_gstin}</p>` : ''}
      </section>
      <section>
        <h3>Payment</h3>
        <p class="bi-doc-state is-${state}"><span class="bi-dot" aria-hidden="true"></span>${STATE_TEXT[state]}</p>
        <p>${state === 'due' || state === 'cancelled' ? 'Mode' : 'By'} ${PAY_MODES[bill.pay_mode] || bill.pay_mode}</p>
      </section>
      <section class="bi-doc-amt">
        <h3>${state === 'cancelled' ? 'Bill amount' : due > 0 ? 'Amount due' : 'Total paid'}</h3>
        <p class="bi-doc-big">${rs(due > 0 ? due : bill.total_paise, { fixed: true })}</p>
        ${due > 0 && bill.paid_paise > 0 ? html`<p>of ${rs(bill.total_paise, { fixed: true })}</p>` : ''}
      </section>
    </div>

    <table class="bi-doc-lines">
      <thead><tr><th scope="col" class="bi-dl-n">#</th><th scope="col">Item</th><th scope="col" class="num">Qty</th><th scope="col" class="num">Rate</th><th scope="col" class="num">Amount</th></tr></thead>
      <tbody>
        ${lines.map(
          (l, i) => html`<tr>
            <td class="bi-dl-n">${String(i + 1).padStart(2, '0')}</td>
            <td class="bi-dl-name">${l.name}</td>
            <td class="num bi-dl-qty">${qtyText(l.qty)}<span class="bi-dl-x"> × </span></td>
            <td class="num bi-dl-rate">${amountText(l.rate_paise)}${l.unit ? html`<span class="bi-dl-unit">per ${l.unit}</span>` : ''}</td>
            <td class="num bi-dl-amt">${amountText(l.amount_paise)}</td>
          </tr>`
        )}
      </tbody>
    </table>

    <div class="bi-doc-foot">
      <div class="bi-doc-words">
        <h3>Amount in words</h3>
        <p class="bi-doc-inwords">${amountInWords(bill.total_paise)}</p>
        ${bill.notes ? html`<h3>Note</h3><p class="bi-doc-note">${bill.notes}</p>` : ''}
      </div>
      <dl class="bi-doc-sum">
        ${sumRow('Subtotal', amountText(bill.subtotal_paise))}
        ${bill.discount_paise ? sumRow('Discount', `− ${amountText(bill.discount_paise)}`) : ''}
        ${bill.tax_paise
          ? settings.gstin
            ? html`${sumRow(`CGST ${pct / 2}%`, amountText(half))}${sumRow(`SGST ${pct / 2}%`, amountText(bill.tax_paise - half))}`
            : sumRow(`GST ${pct}%`, amountText(bill.tax_paise))
          : ''}
        ${bill.round_paise ? sumRow('Round off', `${bill.round_paise < 0 ? '− ' : '+ '}${amountText(Math.abs(bill.round_paise))}`) : ''}
        ${sumRow('Total', rs(bill.total_paise, { fixed: true }), 'is-total')}
        ${state === 'paid' ? sumRow('Paid', amountText(bill.total_paise)) : bill.paid_paise ? sumRow('Paid', amountText(bill.paid_paise)) : ''}
        ${due > 0 ? sumRow('Balance due', amountText(due), 'is-due') : ''}
      </dl>
    </div>

    <div class="bi-doc-sign">
      ${qrSvg
        ? html`<div class="bi-doc-qr">
            <span class="bi-doc-qr-img" aria-hidden="true">${raw(qrSvg)}</span>
            <span><h3>Scan to pay</h3><b>${rs(due, { fixed: true })}</b><small>UPI · ${settings.upi}</small></span>
          </div>`
        : html`<span></span>`}
      <div class="bi-doc-signature">
        <b>For ${shop.name}</b>
        <span class="bi-doc-signline"></span>
        <small>Authorised signatory</small>
      </div>
    </div>
    ${settings.terms ? html`<p class="bi-doc-terms">${settings.terms}</p>` : ''}
  </article>`;
}

/**
 * @param d.res, d.shop, d.bill, d.lines, d.settings, d.qrSvg, d.publicUrl, d.waLink, d.canShare (customer has a mobile)
 */
export function billView(d) {
  const { res, bill } = d;
  const state = payState(bill);
  const due = billDue(bill);
  const path = billPath(bill);
  const cancelled = state === 'cancelled';
  const fileName = `Bill-${billNo(bill)}.pdf`;

  const collect =
    due > 0
      ? html`<section class="card bi-side-card bi-collect" aria-labelledby="bi-collect-h">
          <h2 id="bi-collect-h">${shopIcon('rupee')}<span>Collect ${rs(due)}</span></h2>
          <p class="hint">${state === 'part' ? `${rs(bill.paid_paise)} received so far.` : 'Nothing received yet.'} Record money when the customer pays.</p>
          <form method="post" action="${path}/payment" class="bi-collect-form">
            ${csrfField(res)}
            <div class="field">
              <label for="pay-amount">Amount received</label>
              <div class="input-group"><span class="input-addon">₹</span><input type="text" id="pay-amount" name="amount" value="${moneyInput(due)}" inputmode="decimal" maxlength="14" autocomplete="off" required></div>
            </div>
            <div class="seg bi-seg bi-seg-sm" role="group" aria-label="Paid by">
              ${Object.entries({ cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank', other: 'Other' }).map(([k, v]) => html`<label><input type="radio" name="mode" value="${k}"${k === (bill.pay_mode || 'cash') ? raw(' checked') : ''}><span>${v}</span></label>`)}
            </div>
            <button class="btn btn-success btn-block" type="submit" data-loading="Saving…">${icon('check')}<span>Record payment</span></button>
          </form>
          ${d.qrSvg ? html`<p class="bi-collect-qr">${shopIcon('bolt')}<span>Customer can scan the UPI code on the bill to pay ${rs(due)}.</span></p>` : ''}
        </section>`
      : '';

  const send = html`<section class="card bi-side-card bi-send-card" aria-labelledby="bi-send-h">
    <h2 id="bi-send-h">${icon('share')}<span>Send to customer</span></h2>
    <div class="bi-send">
      <a class="btn btn-wa btn-block" href="${d.waLink}" target="_blank" rel="noopener">${icon('whatsapp')}<span>${d.canShare ? 'WhatsApp bill link' : 'Send on WhatsApp'}</span></a>
      <button class="btn btn-secondary btn-block" type="button" data-share-pdf="${path}/pdf" data-share-name="${fileName}" data-share-title="Bill ${billNo(bill)} – ${d.shop.name}" hidden>${icon('share')}<span>Share PDF file</span></button>
      <a class="btn btn-secondary btn-block" href="${path}/pdf?dl=1">${icon('download')}<span>Download PDF</span></a>
    </div>
    <label class="label bi-link-label" for="bill-link">Customer's bill link (PDF)</label>
    <div class="copy-field">
      <input id="bill-link" type="text" readonly value="${d.publicUrl}">
      <button class="btn btn-secondary btn-icon" type="button" data-copy-target="#bill-link" data-copy-msg="Bill link copied" aria-label="Copy bill link" title="Copy link">${icon('copy')}</button>
    </div>
    <p class="hint">Anyone with this link can open the PDF. Only share it with the customer.</p>
  </section>`;

  const more = html`<section class="card bi-side-card bi-facts-card" aria-labelledby="bi-more-h">
    <h2 id="bi-more-h">${shopIcon('receipt')}<span>This bill</span></h2>
    <dl class="bi-facts">
      <div><dt>Made</dt><dd>${formatDateTime(bill.created_at)}</dd></div>
      ${bill.updated_at !== bill.created_at ? html`<div><dt>Last change</dt><dd>${formatDateTime(bill.updated_at)}</dd></div>` : ''}
      ${bill.order_no ? html`<div><dt>Online order</dt><dd><a href="/shop/orders/${bill.order_no}">P-${bill.order_no}</a></dd></div>` : ''}
    </dl>
    <div class="bi-more-actions">
      ${cancelled ? '' : html`<a class="btn btn-secondary btn-sm" href="${path}/edit">${shopIcon('edit')}<span>Edit</span></a>`}
      <a class="btn btn-secondary btn-sm" href="/shop/bills/new?copy=${bill.bill_no}" title="New bill with the same customer and items">${icon('copy')}<span>Duplicate</span></a>
      ${cancelled
        ? html`<form method="post" action="${path}/restore" class="inline-form">${csrfField(res)}<button class="btn btn-secondary btn-sm" type="submit">${icon('refresh')}<span>Restore bill</span></button></form>`
        : html`<form method="post" action="${path}/cancel" class="inline-form">${csrfField(res)}<button class="btn btn-secondary btn-sm" type="submit" data-confirm="Cancel bill ${billNo(bill)}? It stays in your list marked Cancelled and is not counted in totals. You can restore it later.">${icon('x')}<span>Cancel bill</span></button></form>`}
    </div>
    <form method="post" action="${path}/delete" class="bi-delete">
      ${csrfField(res)}
      <button class="btn btn-danger btn-sm btn-block" type="submit" data-confirm="Delete bill ${billNo(bill)} for ever? It is removed from your records and the customer's bill link stops working. This cannot be undone.">${shopIcon('trash')}<span>Delete bill</span></button>
      <p class="hint">Removes it completely. To keep a record, use Cancel instead.</p>
    </form>
  </section>`;

  return html`<div class="container bi-page bi-view">
    <a class="sh-back" href="/shop/bills">${icon('arrowLeft')}<span>Bills</span></a>
    <header class="bi-vhead">
      <div class="bi-vhead-main">
        <div class="bi-vhead-title"><h1><span class="sr-only">Bill </span><span class="order-no">${billNo(bill)}</span></h1>${payPill(bill, { long: true })}${bill.is_sample ? html`<span class="sh-row-sample">Sample</span>` : ''}</div>
        <p class="bi-vhead-sub"><b>${bill.customer_name || 'Cash customer'}</b><span class="sh-dot" aria-hidden="true">·</span><span>${rs(bill.total_paise)}</span><span class="sh-dot" aria-hidden="true">·</span><span>${formatDate(bill.bill_date)}</span></p>
      </div>
      <div class="bi-vhead-actions">
        <a class="btn btn-primary" href="${path}/pdf?dl=1">${icon('download')}<span>Download PDF</span></a>
        <button class="btn btn-secondary" type="button" data-print>${icon('printer')}<span>Print</span></button>
        ${cancelled ? '' : html`<a class="btn btn-secondary" href="${path}/edit">${shopIcon('edit')}<span>Edit</span></a>`}
      </div>
    </header>
    ${cancelled ? html`<div class="bi-cancel-note">${icon('alert')}<span>This bill is cancelled. It is not counted in your totals.</span></div>` : ''}
    <div class="bi-vlayout">
      <div class="bi-vmain">${billDocument(d)}</div>
      <aside class="bi-vside">
        ${collect}
        ${cancelled ? '' : send}
        ${more}
      </aside>
    </div>
  </div>`;
}
