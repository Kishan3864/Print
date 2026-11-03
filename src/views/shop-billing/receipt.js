import { html } from '../../lib/html.js';
import { config } from '../../config.js';
import { formatDate, formatDateTime, prettyPhone } from '../../lib/util.js';
import { getPlan } from '../../services/billing.js';
import { icon, logoMark } from '../components.js';
import { METHOD_LABEL, cycleLabel, paise, periodText } from './common.js';

// /shop/billing/receipt/:id – printable payment receipt (the app chrome is hidden in print).

const companyHost = config.companyUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');

export function receiptView({ shop, payment }) {
  const plan = getPlan(payment.plan);
  const planName = plan ? plan.name : payment.plan;
  const amount = paise(payment.amount_paise);
  return {
    title: `Receipt ${payment.reference}`,
    variant: 'shop',
    active: 'billing',
    bodyClass: 'bl-receipt-page',
    scripts: ['/js/shop.js', '/js/billing.js'],
    body: html`<div class="container-mid bl-receipt-wrap">
      <div class="bl-receipt-bar">
        <a class="btn btn-ghost btn-sm" href="/shop/billing">${icon('arrowLeft')}<span>Plan &amp; billing</span></a>
        <button class="btn btn-primary btn-sm" type="button" data-print>${icon('printer')}<span>Print / save PDF</span></button>
      </div>
      <article class="card bl-receipt" aria-labelledby="bl-receipt-title">
        <header class="bl-receipt-head">
          <div class="bl-receipt-brand">
            ${logoMark(40)}
            <div><b>PrintDesk</b><span>by Brighton Solution</span></div>
          </div>
          <div class="bl-receipt-title">
            <h1 id="bl-receipt-title">Receipt</h1>
            <span class="pill bl-pill-paid">Paid</span>
          </div>
        </header>

        <dl class="bl-receipt-meta">
          <div><dt>Receipt no.</dt><dd class="mono">${payment.reference}</dd></div>
          <div><dt>Date paid</dt><dd>${formatDate(payment.paid_at)}</dd></div>
          <div><dt>Payment method</dt><dd>${METHOD_LABEL[payment.method] || payment.method}</dd></div>
          ${payment.provider_payment_id ? html`<div><dt>Razorpay payment ID</dt><dd class="mono">${payment.provider_payment_id}</dd></div>` : ''}
        </dl>

        <div class="bl-receipt-parties">
          <section>
            <h2>Billed to</h2>
            <p><b>${shop.name}</b>${shop.owner_name ? html`<br>${shop.owner_name}` : ''}${shop.city ? html`<br>${shop.city}` : ''}</p>
            <p class="bl-receipt-contact">${shop.email}${shop.mobile ? html`<br>${prettyPhone(shop.mobile)}` : ''}</p>
          </section>
          <section>
            <h2>From</h2>
            <p><b>Brighton Solution</b><br>PrintDesk – order intake for print shops</p>
            <p class="bl-receipt-contact">${companyHost}<br>Instagram @${config.instagram}</p>
          </section>
        </div>

        <table class="bl-receipt-lines">
          <thead><tr><th scope="col">Description</th><th scope="col">Period</th><th scope="col" class="num">Amount</th></tr></thead>
          <tbody>
            <tr>
              <td><b>PrintDesk ${planName} plan</b><span>${cycleLabel(payment.cycle)} subscription</span></td>
              <td>${periodText(payment)}</td>
              <td class="num">${amount}</td>
            </tr>
          </tbody>
          <tfoot><tr><th scope="row" colspan="2">Total paid</th><td class="num"><b>${amount}</b></td></tr></tfoot>
        </table>

        ${payment.note && payment.method === 'manual' ? html`<p class="bl-receipt-note"><b>Note:</b> ${payment.note}</p>` : ''}

        <footer class="bl-receipt-foot">
          <p>Thank you for using PrintDesk. This payment covers your plan till <b>${formatDate(payment.period_end)}</b>.</p>
          <p class="muted">Computer-generated receipt, no signature needed. Issued ${formatDateTime(payment.paid_at)}.</p>
        </footer>
      </article>
    </div>`,
  };
}
