import { html, raw } from '../../lib/html.js';
import { formatDate, formatDateTime } from '../../lib/util.js';
import { formatINR, paymentTitle } from '../../services/billing.js';
import { REQUEST_STATUS } from '../../services/services.js';
import { alert, csrfField, icon } from '../components.js';
import { shopIcon } from '../chrome/shop.js';

// /shop/services and /shop/services/:id – paid help: setup, change-request review, custom work.

const rupees = (paise) => formatINR(Math.round((paise || 0) / 100));
const STATUS_TONE = { awaiting_payment: 'warn', open: 'info', quoted: 'warn', in_progress: 'info', done: 'ok', declined: 'muted', cancelled: 'muted' };
const statusPill = (s) => html`<span class="pill sv-pill sv-${STATUS_TONE[s] || 'muted'}">${REQUEST_STATUS[s] || s}</span>`;

export function servicesView(res, { shop, services, requests, custom, values = {}, errors = {} }) {
  const pick = values.service || (services.find((s) => s.key === 'review') ? 'review' : services[0]?.key || '');
  return {
    title: 'Services',
    variant: 'shop',
    active: 'services',
    scripts: ['/js/shop.js'],
    body: html`<section class="container sv-page">
      <header class="page-head">
        <div>
          <h1>Services</h1>
          <p>Help from the Brighton Solution team – fixed prices, no surprises. Bugs and normal questions are always free in <a href="/shop/support">Help</a>.</p>
        </div>
      </header>

      <div class="sv-cards">
        ${services.map(
          (s) => html`<article class="card sv-card">
            <span class="sv-ic">${shopIcon(s.key === 'setup' ? 'sliders' : 'tool')}</span>
            <h2>${s.name}</h2>
            <p class="sv-price"><b>${s.price ? formatINR(s.price) : 'Free'}</b>${s.key === 'review' ? html` <small>review fee, taken off the final price</small>` : html` <small>one time</small>`}</p>
            <p class="sv-blurb">${s.blurb}</p>
          </article>`
        )}
        <article class="card sv-card sv-card-custom">
          <span class="sv-ic">${shopIcon('bolt')}</span>
          <h2>Custom work</h2>
          <p class="sv-price"><b>From ${formatINR(custom.min)}</b> <small>about ${formatINR(custom.hourly)}/hour, quoted first</small></p>
          <p class="sv-blurb">Start with a change request. We reply with what is possible, the time and an exact price – you pay only if you agree.</p>
        </article>
      </div>

      <div class="sv-grid">
        <section class="card card-pad sv-form" aria-labelledby="sv-form-h">
          <h2 id="sv-form-h">Ask for a service</h2>
          ${Object.keys(errors).length ? alert('danger', 'Please fix the marked fields.') : ''}
          <form method="post" action="/shop/services" novalidate>
            ${csrfField(res)}
            <fieldset class="field sv-pick${errors.service ? ' has-error' : ''}">
              <legend class="label">Service</legend>
              <div class="seg">
                ${services.map((s) => html`<label><input type="radio" name="service" value="${s.key}"${s.key === pick ? raw(' checked') : ''}><span>${s.name} · ${s.price ? formatINR(s.price) : 'Free'}</span></label>`)}
              </div>
              ${errors.service ? html`<p class="field-error">${errors.service}</p>` : ''}
            </fieldset>
            <div class="field${errors.title ? ' has-error' : ''}">
              <label for="sv-title">Title</label>
              <input type="text" id="sv-title" name="title" value="${values.title || ''}" maxlength="120" placeholder="e.g. Add my UPI QR on the order page" required>
              ${errors.title ? html`<p class="field-error">${errors.title}</p>` : ''}
            </div>
            <div class="field${errors.details ? ' has-error' : ''}">
              <label for="sv-details">Details</label>
              <textarea id="sv-details" name="details" rows="5" maxlength="3000" placeholder="What should happen, where, and why it helps your shop.">${values.details || ''}</textarea>
              ${errors.details ? html`<p class="field-error">${errors.details}</p>` : ''}
            </div>
            <button class="btn btn-primary" type="submit" data-loading="Sending…">${icon('arrowRight')}<span>Continue</span></button>
            <p class="hint sv-hint">Paid services start once the payment is confirmed. You can follow everything here and in Help.</p>
          </form>
        </section>

        <section class="card sv-mine" aria-labelledby="sv-mine-h">
          <div class="card-head"><h2 id="sv-mine-h">My requests</h2><span class="count">${requests.length}</span></div>
          ${requests.length
            ? html`<ul class="sv-list">${requests.map(
                (r) => html`<li><a class="sv-row" href="/shop/services/${r.id}">
                  <span class="sv-row-main"><b>${r.title}</b><small>#${r.id} · ${formatDate(r.created_at)}</small></span>
                  ${statusPill(r.status)}
                </a></li>`
              )}</ul>`
            : html`<p class="muted sv-empty">No requests yet.</p>`}
        </section>
      </div>
    </section>`,
  };
}

export function serviceRequestView(res, { request: r, payments, payOpen }) {
  const quoteDue = r.quote_paise ? Math.max(100, r.quote_paise - (r.service === 'review' ? r.fee_paise : 0)) : 0;
  let action = '';
  if (r.status === 'awaiting_payment') {
    action = html`<div class="sv-action">
      <p><b>Pay ${rupees(r.fee_paise)}</b> to send this to our team.</p>
      ${payOpen
        ? html`<form method="post" action="/shop/services/${r.id}/pay">${csrfField(res)}<button class="btn btn-primary" type="submit">${icon('shield')}<span>Pay ${rupees(r.fee_paise)} securely</span></button></form>`
        : html`<p class="hint">Online payment opens soon. Pay by UPI and send the screenshot in <a href="/shop/support?new=billing">Help</a> – we mark it paid for you.</p>`}
    </div>`;
  } else if (r.status === 'quoted') {
    action = html`<div class="sv-action is-quote">
      <p class="sv-quote"><span>Our quote</span><b>${rupees(r.quote_paise)}</b></p>
      ${r.service === 'review' && r.fee_paise ? html`<p class="hint">Your review fee of ${rupees(r.fee_paise)} is taken off – you pay <b>${rupees(quoteDue)}</b>.</p>` : ''}
      ${r.quote_note ? html`<p class="sv-quote-note">${r.quote_note}</p>` : ''}
      ${payOpen
        ? html`<form method="post" action="/shop/services/${r.id}/pay">${csrfField(res)}<button class="btn btn-primary" type="submit">${icon('check')}<span>Accept &amp; pay ${rupees(quoteDue)}</span></button></form>`
        : html`<p class="hint">To accept, pay by UPI and send the screenshot in <a href="/shop/support?new=billing">Help</a>.</p>`}
    </div>`;
  }
  const canCancel = ['awaiting_payment', 'quoted'].includes(r.status);
  return {
    title: `Request #${r.id}`,
    variant: 'shop',
    active: 'services',
    scripts: ['/js/shop.js'],
    body: html`<section class="container-mid sv-page">
      <a class="sh-back" href="/shop/services">${icon('arrowLeft')}<span>Services</span></a>
      <header class="sv-head">
        <div><h1>${r.title}</h1><p class="muted">Request #${r.id} · sent ${formatDateTime(r.created_at)}</p></div>
        ${statusPill(r.status)}
      </header>
      <div class="card card-pad sv-detail">
        ${action}
        ${r.details ? html`<h2 class="section-title">What you asked</h2><p class="sv-text">${r.details}</p>` : ''}
        ${r.admin_note ? html`<h2 class="section-title">Note from us</h2><p class="sv-text">${r.admin_note}</p>` : ''}
        ${payments.length
          ? html`<h2 class="section-title">Payments</h2><ul class="sv-pays">${payments.map(
              (p) => html`<li><span>${paymentTitle(p)}</span><b>${rupees(p.amount_paise)}</b><a href="/shop/billing/receipt/${p.id}">Receipt</a></li>`
            )}</ul>`
          : ''}
        <div class="btn-row sv-detail-actions">
          ${r.ticket_id ? html`<a class="btn btn-secondary" href="/shop/support/${r.ticket_id}">${shopIcon('support')}<span>Open the conversation</span></a>` : ''}
          ${canCancel ? html`<form method="post" action="/shop/services/${r.id}/cancel" class="inline-form">${csrfField(res)}<button class="btn btn-ghost" type="submit" data-confirm="Cancel this request?">${icon('x')}<span>Cancel request</span></button></form>` : ''}
        </div>
      </div>
    </section>`,
  };
}
