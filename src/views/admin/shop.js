import { html } from '../../lib/html.js';
import { config } from '../../config.js';
import { addDays, formatBytes, formatDate, formatDateTime, formatTime, isHexColor, prettyPhone, timeAgo, waLink } from '../../lib/util.js';
import { STATUSES } from '../../lib/status.js';
import { CYCLES, formatINR, isSampleShop } from '../../services/billing.js';
import { TICKET_STATUS_LABEL, categoryLabel } from '../../services/support.js';
import { manualPaymentForm } from '../admin-billing/forms.js';
import { notifyShopForm } from '../admin-support/forms.js';
import { alert, csrfField, field, icon, shopStatePill, statusPill } from '../components.js';
import {
  DEMO_EXTEND,
  EXTEND,
  MAX_DEMO_DAYS,
  MAX_PAID_MONTHS,
  addMonths,
  adminIcon,
  customerLink,
  cycleName,
  defaultPaidUntil,
  demoTag,
  extendBase,
  loginUrl,
  num,
  paidInfo,
  planName,
  planOptions,
  plural,
  shopAvatar,
  telHref,
  toneClass,
} from './common.js';

// /admin/shops/:id – everything about one shop plus the admin actions.

const ownerName = (shop) => shop.owner_name || shop.name;
const filled = (v) => Boolean(v && String(v).trim());

/** Pre-written WhatsApp text for the owner, matching the account state. */
function ownerMessage(shop, state) {
  const hi = `Hi ${ownerName(shop)},`;
  const sign = '\n\n– Brighton Solution (PrintDesk)';
  const billing = `${config.baseUrl}/shop/billing`;
  const link = customerLink(shop).href;
  let text;
  if (shop.is_demo) {
    text = state === 'expired'
      ? `${hi} your PrintDesk demo for ${shop.name} has ended. Go live here to keep your link and start taking real orders: ${billing}`
      : `${hi} your PrintDesk demo for ${shop.name} is running. Try your customer link: ${link}\nWhen you are ready, go live here: ${billing}`;
  } else {
    text = {
      pending: `${hi} thanks for registering ${shop.name} on PrintDesk. Choose a plan here to open your order link: ${billing}`,
      active: `${hi} your PrintDesk account for ${shop.name} is active.\nLog in: ${loginUrl()}\nYour customer order link: ${link}`,
      expired: `${hi} your PrintDesk plan for ${shop.name} ended on ${formatDate(shop.paid_until)}, so your order link is closed. Renew here: ${billing}`,
      paused: `${hi} your PrintDesk account for ${shop.name} is paused, so your order link is not taking new orders. Reply here and we will help.`,
      rejected: `${hi} this is Brighton Solution about your PrintDesk registration for ${shop.name}.`,
    }[state];
  }
  return (text || `${hi} this is Brighton Solution from PrintDesk.`) + sign;
}

function revealCard(shop, password) {
  const msg = `Hi ${ownerName(shop)}, your PrintDesk password has been reset.\n\nLog in: ${loginUrl()}\nEmail: ${shop.email}\nTemporary password: ${password}\n\nPlease change it in Settings after you log in.\n\n– Brighton Solution (PrintDesk)`;
  return html`<section class="card adm-reveal" role="alert" aria-labelledby="reveal-h">
    <div class="adm-reveal-head">
      <span class="adm-reveal-ic" aria-hidden="true">${adminIcon('key')}</span>
      <div>
        <h2 id="reveal-h">New temporary password</h2>
        <p>Shown only once. Send it to the owner now – they have been logged out on all devices.</p>
      </div>
    </div>
    <div class="copy-field adm-copy adm-reveal-pw">
      <input type="text" id="adm-temp-pw" value="${password}" readonly aria-label="Temporary password" autocomplete="off" spellcheck="false">
      <button type="button" class="btn btn-secondary" data-copy-target="#adm-temp-pw" data-copy-msg="Password copied">${icon('copy')}<span>Copy</span></button>
    </div>
    <div class="btn-row">
      <a class="btn btn-wa btn-sm" href="${waLink(shop.mobile, msg)}" target="_blank" rel="noopener">${icon('whatsapp')}<span>Send on WhatsApp</span></a>
      <button type="button" class="btn btn-ghost btn-sm" data-copy="${msg}" data-copy-msg="Message copied">${icon('copy')}<span>Copy full message</span></button>
    </div>
  </section>`;
}

function planFact(shop) {
  if (isSampleShop(shop)) return 'Sample shop';
  if (shop.is_demo) return 'Demo';
  if (!shop.plan) return 'No plan yet';
  return `${planName(shop.plan)}${shop.billing_cycle ? ` · ${cycleName(shop.billing_cycle)}` : ''}`;
}

function hero(shop, state, { counts, today }) {
  const link = customerLink(shop);
  const tel = telHref(shop.mobile);
  const info = paidInfo(shop, today);
  return html`<section class="card adm-hero" aria-labelledby="shop-h">
    <div class="adm-hero-id">
      ${shopAvatar(shop, 56, 'adm-avatar-lg')}
      <div class="adm-hero-text">
        <div class="adm-hero-title"><h1 id="shop-h">${shop.name}</h1>${shop.is_demo ? demoTag(shop) : ''}${shopStatePill(state)}</div>
        <p class="adm-hero-meta">
          <span>${icon('user')}${shop.owner_name || 'No owner name'}</span>
          ${shop.city ? html`<span>${icon('home')}${shop.city}</span>` : ''}
          <span>${adminIcon('calendar')}Joined ${formatDate(shop.created_at)}</span>
        </p>
      </div>
    </div>
    <dl class="adm-facts">
      <div><dt>Plan</dt><dd>${planFact(shop)}</dd></div>
      <div><dt>${shop.is_demo ? 'Demo ends' : 'Paid until'}</dt><dd>${isSampleShop(shop) ? 'Never' : shop.paid_until ? formatDate(shop.paid_until) : info.text}${shop.paid_until && !isSampleShop(shop) ? html`<span class="${toneClass(info.tone)}">${info.text}</span>` : ''}</dd></div>
      <div><dt>Orders</dt><dd>${num(counts.total)}<span class="adm-sub">${num(counts.newToday)} today</span></dd></div>
      <div><dt>Last login</dt><dd>${shop.last_login_at ? timeAgo(shop.last_login_at) : 'Never'}</dd></div>
    </dl>
    <div class="adm-hero-actions">
      <a class="btn btn-secondary btn-sm" href="${link.href}" target="_blank" rel="noopener">${adminIcon('external')}<span>Customer page</span></a>
      ${isSampleShop(shop)
        ? ''
        : html`<a class="btn btn-wa btn-sm" href="${waLink(shop.mobile, ownerMessage(shop, state))}" target="_blank" rel="noopener">${icon('whatsapp')}<span>WhatsApp</span></a>
          ${tel ? html`<a class="btn btn-secondary btn-sm" href="${tel}">${icon('phone')}<span>Call</span></a>` : ''}
          <a class="btn btn-secondary btn-sm" href="mailto:${shop.email}">${icon('mail')}<span>Email</span></a>`}
    </div>
  </section>`;
}

/** In-page shortcuts – phones only (the page is one long column there). */
function jumpNav(shop, hasNotify) {
  const sample = isSampleShop(shop);
  const links = [
    ['#actions', 'Actions', !sample],
    ['#subscription', 'Payments', !sample],
    ['#support', 'Support', true],
    ['#notify', 'Notify', hasNotify],
    ['#usage', 'Usage', true],
    ['#details', 'Details', true],
    ['#note', 'Note', true],
  ].filter((l) => l[2]);
  return html`<nav class="adm-jumps" aria-label="On this page">${links.map(([href, label]) => html`<a href="${href}">${label}</a>`)}</nav>`;
}

// ---------- subscription & payments ----------
const PAY_LABEL = { paid: 'Paid', created: 'Not completed', failed: 'Failed', cancelled: 'Cancelled' };

function paymentsTable(payments) {
  return html`<div class="table-wrap adm-table-wrap">
    <table class="table table-cards adm-table adm-paytable">
      <thead><tr><th scope="col">Date</th><th scope="col">Plan</th><th scope="col">Period</th><th scope="col">Method</th><th scope="col">Status</th><th scope="col" class="num">Amount</th></tr></thead>
      <tbody>
        ${payments.map(
          (p) => html`<tr>
            <td data-label="Date"><span class="nowrap">${formatDate(p.paid_at || p.created_at)}</span></td>
            <td data-label="Plan"><span class="nowrap">${planName(p.plan) || p.plan}</span> <span class="adm-sub nowrap">${CYCLES[p.cycle] || p.cycle}</span></td>
            <td data-label="Period">${p.period_start ? html`<span class="nowrap">${formatDate(p.period_start)} – ${formatDate(p.period_end)}</span>` : html`<span class="adm-sub">—</span>`}</td>
            <td data-label="Method">${p.method === 'manual' ? 'Manual' : 'PayU'}${p.note ? html`<span class="adm-paynote">${p.note}</span>` : ''}</td>
            <td data-label="Status"><span class="pill adm-pay-${p.status}">${PAY_LABEL[p.status] || p.status}</span></td>
            <td data-label="Amount" class="num"><b class="adm-amount">${formatINR(p.amount_paise / 100)}</b></td>
          </tr>`
        )}
      </tbody>
    </table>
  </div>`;
}

function subscriptionCard(res, shop, payments) {
  if (isSampleShop(shop)) return '';
  const paid = payments.filter((p) => p.status === 'paid');
  const total = paid.reduce((a, p) => a + p.amount_paise, 0) / 100;
  const form = manualPaymentForm(res, shop);
  return html`<section class="card adm-sub-card" id="subscription" aria-labelledby="sub-h">
    <div class="card-head"><h2 id="sub-h">Payments</h2>${paid.length ? html`<span class="adm-sub">${plural(paid.length, 'payment')} · ${formatINR(total)} in total</span>` : ''}</div>
    ${payments.length
      ? paymentsTable(payments)
      : html`<p class="adm-panel-empty adm-nopay">${adminIcon('rupee')}<span>${shop.is_demo ? 'No payments yet – this shop is still a demo.' : 'No payments yet.'}</span></p>`}
    ${filled(form)
      ? html`<div class="adm-embed adm-embed-pay">
          <h3 class="adm-form-title">${shop.is_demo ? 'Record a payment to go live' : 'Record a payment'}</h3>
          <p class="hint adm-embed-lead">Money received on UPI, cash or bank transfer. The plan is extended right away${shop.is_demo ? ' and the demo goes live' : ''}.</p>
          ${form}
        </div>`
      : ''}
  </section>`;
}

// ---------- support ----------
function supportCard(tickets) {
  const open = tickets.filter((t) => t.status === 'open').length;
  return html`<section class="card adm-panel" id="support" aria-labelledby="support-h">
    <div class="adm-panel-head"><h2 id="support-h">Support tickets <span class="count">${num(tickets.length)}</span></h2>${open ? html`<span class="adm-warn">${num(open)} open</span>` : ''}</div>
    ${tickets.length
      ? html`<ul class="adm-list">
          ${tickets.slice(0, 8).map(
            (t) => html`<li><a class="adm-item" href="/admin/tickets/${t.id}">
              <span class="adm-item-ic${t.admin_unread ? ' is-new' : ''}">${adminIcon('chat')}</span>
              <span class="adm-item-main"><span class="adm-item-title">${t.subject}</span><span class="adm-item-sub">${categoryLabel(t.category)} · updated ${timeAgo(t.updated_at)}</span></span>
              <span class="adm-item-side"><span class="pill adm-tk-${t.status}">${TICKET_STATUS_LABEL[t.status] || t.status}</span></span>
            </a></li>`
          )}
        </ul>
        ${tickets.length > 8 ? html`<p class="adm-panel-more"><a href="/admin/tickets">All tickets${adminIcon('chevron')}</a></p>` : ''}`
      : html`<p class="adm-panel-empty">${icon('check')}<span>This shop has not raised any tickets.</span></p>`}
  </section>`;
}

// ---------- usage ----------
function usageCard({ counts, storage, cap, liveFiles, recent }) {
  return html`<section class="card" id="usage" aria-labelledby="usage-h">
    <div class="card-head"><h2 id="usage-h">Usage</h2></div>
    <div class="card-body">
      <dl class="adm-mini">
        <div><dt>Orders total</dt><dd>${num(counts.total)}</dd></div>
        <div><dt>Orders today</dt><dd>${num(counts.newToday)}</dd></div>
        <div><dt>Files stored</dt><dd>${num(liveFiles)}</dd></div>
        <div><dt>Storage</dt><dd>${formatBytes(storage)}</dd></div>
      </dl>
      ${cap
        ? html`<div class="adm-meter">
            <div class="adm-meter-row"><span>Storage</span><span>${formatBytes(storage)} of ${formatBytes(cap)}</span></div>
            <meter min="0" max="${cap}" low="${Math.round(cap * 0.75)}" high="${Math.round(cap * 0.9)}" optimum="0" value="${Math.min(storage, cap)}">${Math.round((storage / cap) * 100)}%</meter>
          </div>`
        : ''}
      <h3 class="section-title adm-usage-sub">Orders by status</h3>
      <ul class="adm-status-list">
        ${STATUSES.map((st) => html`<li${counts[st] ? '' : html` class="is-zero"`}>${statusPill(st)}<b>${num(counts[st] || 0)}</b></li>`)}
      </ul>
    </div>
    <div class="adm-subhead"><h3>Recent orders</h3><span class="adm-sub">Last 10 · customer details hidden</span></div>
    ${recent.length
      ? html`<ul class="order-list adm-orders">
          ${recent.map(
            (o) => html`<li class="order-row">
              <span class="order-no">#${o.order_no}</span>
              <div class="order-main">
                <div class="order-title adm-order-title">${statusPill(o.status)}${o.is_sample ? html`<span class="pill pill-sample">Sample</span>` : ''}</div>
                <div class="order-meta">${plural(o.file_count, 'file')} · ${formatDateTime(o.created_at)}</div>
              </div>
              <div class="order-side"><time class="order-time" datetime="${o.created_at}">${timeAgo(o.created_at)}</time></div>
            </li>`
          )}
        </ul>`
      : html`<p class="adm-panel-empty adm-noorders">${icon('orders')}<span>No orders yet. They show up here once customers use this shop’s link.</span></p>`}
  </section>`;
}

function detailsCard(shop) {
  const tel = telHref(shop.mobile);
  const link = customerLink(shop);
  const color = isHexColor(shop.brand_color) ? shop.brand_color : '';
  const row = (label, value) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`;
  return html`<section class="card" id="details" aria-labelledby="details-h">
    <div class="card-head"><h2 id="details-h">Shop details</h2></div>
    <div class="card-body">
      <label class="adm-label" for="adm-link">Customer link</label>
      <div class="copy-field adm-copy adm-linkfield">
        <input type="text" id="adm-link" value="${link.href}" readonly>
        <button type="button" class="btn btn-secondary" data-copy="${link.href}" data-copy-msg="Link copied">${icon('copy')}<span>Copy</span></button>
      </div>
      <dl class="kv adm-details">
        ${row('Owner', shop.owner_name || '—')}
        ${row(
          'Mobile',
          shop.mobile
            ? html`${tel ? html`<a href="${tel}">${prettyPhone(shop.mobile)}</a>` : shop.mobile} · <a href="${waLink(shop.mobile, `Hi ${ownerName(shop)},`)}" target="_blank" rel="noopener">WhatsApp</a>`
            : '—'
        )}
        ${row('Email', html`<a href="mailto:${shop.email}">${shop.email}</a>`)}
        ${row('City', shop.city || '—')}
        ${row('Shop phone', shop.phone || '—')}
        ${row('Address', shop.address ? html`<span class="adm-pre">${shop.address}</span>` : '—')}
        ${row(
          'Brand colour',
          color
            ? html`<span class="adm-color"><svg class="adm-swatch" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><rect width="16" height="16" rx="4" fill="${color}"/></svg><span class="mono">${color}</span></span>`
            : '—'
        )}
        ${row('Logo', shop.logo_file ? 'Uploaded' : 'Not uploaded')}
        ${row('Keeps files for', `${shop.retention_days} days`)}
        ${row('Registered', `${formatDate(shop.created_at)}, ${formatTime(shop.created_at)}`)}
        ${row('Went live', shop.went_live_at ? formatDate(shop.went_live_at) : shop.approved_at && !shop.is_demo ? formatDate(shop.approved_at) : 'Not yet')}
        ${row('Last login', shop.last_login_at ? html`${timeAgo(shop.last_login_at)} <span class="adm-sub">(${formatDateTime(shop.last_login_at)})</span>` : 'Never')}
      </dl>
    </div>
  </section>`;
}

// ---------- account actions ----------
const dateInput = (id, value, min, max) => html`<input type="date" id="${id}" name="paid_until" value="${value}" min="${min}" max="${max}" required>`;

function quickButtons(map) {
  return html`<div class="adm-extend-btns" role="group" aria-label="Quick extend">
    ${Object.entries(map).map(([key, x]) => html`<button class="btn btn-secondary btn-sm" type="submit" name="extend" value="${key}" formnovalidate>${x.label}</button>`)}
  </div>`;
}

/** Live shop: set plan + paid-until (complimentary / correction – no payment recorded). */
function extendForm(res, shop, state, today) {
  return html`<form method="post" action="/admin/shops/${shop.id}/extend" class="adm-form">
    ${csrfField(res)}
    <h3 class="adm-form-title">${state === 'expired' ? 'Renew without payment' : 'Extend or change plan'}</h3>
    <div class="adm-form-grid">
      ${field({ label: 'Plan', id: 'ex-plan', control: html`<select id="ex-plan" name="plan" required>${planOptions(shop.plan || 'starter')}</select>` })}
      ${field({ label: 'Paid until', id: 'ex-paid', control: dateInput('ex-paid', defaultPaidUntil(shop, today), today, addMonths(today, MAX_PAID_MONTHS)) })}
    </div>
    <button class="btn btn-primary btn-block" type="submit">${icon('check')}<span>Save paid-until date</span></button>
    <p class="adm-or">or add time from ${formatDate(extendBase(shop, today))}</p>
    ${quickButtons(EXTEND)}
    <p class="hint">No payment is recorded. To log money received, use “Record payment”.</p>
  </form>`;
}

/** Personal demo shop: move the demo end date. */
function demoExtendForm(res, shop, today) {
  return html`<form method="post" action="/admin/shops/${shop.id}/extend" class="adm-form">
    ${csrfField(res)}
    <h3 class="adm-form-title">Extend the demo</h3>
    ${field({ label: 'Demo ends on', id: 'ex-paid', control: dateInput('ex-paid', defaultPaidUntil(shop, today), today, addDays(today, MAX_DEMO_DAYS)) })}
    <button class="btn btn-primary btn-block" type="submit">${icon('check')}<span>Save demo end date</span></button>
    <p class="adm-or">or add days from ${formatDate(extendBase(shop, today))}</p>
    ${quickButtons(DEMO_EXTEND)}
    <p class="hint">The shop goes live only when it pays for a plan.</p>
  </form>`;
}

function activateForm(res, shop, state, today) {
  const demo = Boolean(shop.is_demo);
  const max = demo ? addDays(today, MAX_DEMO_DAYS) : addMonths(today, MAX_PAID_MONTHS);
  return html`<form method="post" action="/admin/shops/${shop.id}/activate" class="adm-form">
    ${csrfField(res)}
    <h3 class="adm-form-title">${state === 'pending' ? 'Activate without payment' : 'Activate again'}</h3>
    <div class="adm-form-grid">
      ${demo ? '' : field({ label: 'Plan', id: 'ac-plan', control: html`<select id="ac-plan" name="plan" required>${planOptions(shop.plan || 'starter')}</select>` })}
      ${field({ label: demo ? 'Demo ends on' : 'Paid until', id: 'ac-paid', control: dateInput('ac-paid', defaultPaidUntil(shop, today), today, max) })}
    </div>
    <button class="btn btn-success btn-block" type="submit">${adminIcon('play')}<span>Activate shop</span></button>
    <p class="hint">${state === 'pending' ? 'For a free or complimentary start. When the shop pays online it switches on by itself.' : 'Their order link starts taking orders again straight away.'}</p>
  </form>`;
}

const pauseForm = (res, shop) =>
  html`<form method="post" action="/admin/shops/${shop.id}/pause" data-confirm="Pause ${shop.name}? Their order link stops taking new orders until you activate it again.">
    ${csrfField(res)}
    <button class="btn btn-secondary btn-block" type="submit">${adminIcon('pause')}<span>Pause shop</span></button>
  </form>`;

const rejectForm = (res, shop) =>
  html`<form method="post" action="/admin/shops/${shop.id}/reject" data-confirm="Block ${shop.name}? They will see a “not active” screen and cannot use PrintDesk.">
    ${csrfField(res)}
    <button class="btn btn-danger btn-block" type="submit">${icon('x')}<span>Reject account</span></button>
  </form>`;

function stateNote(shop, state) {
  if (shop.is_demo) {
    if (state === 'expired') return alert('warn', 'This demo has ended. Their demo link is closed. Extend it, or ask them to go live.');
    if (state === 'paused') return alert('warn', 'Paused. Their demo link is closed.');
    return '';
  }
  switch (state) {
    case 'pending':
      return alert('info', 'Registered but not paid yet. The shop activates by itself when it pays. Got paid on UPI or cash? Use “Record payment”.', 'clock');
    case 'expired':
      return alert('warn', `Plan ended on ${formatDate(shop.paid_until)}. Their order link is closed until they renew.`);
    case 'paused':
      return alert('warn', 'Paused. The order link is closed, but the owner can still log in.');
    case 'rejected':
      return alert('danger', 'Rejected. The owner sees a “not active” screen when they log in.');
    default:
      return '';
  }
}

function actionsCard(res, shop, state, today) {
  if (isSampleShop(shop)) {
    return html`<section class="card" id="actions" aria-labelledby="actions-h">
      <div class="card-head"><h2 id="actions-h">Account</h2></div>
      <div class="card-body">${alert('info', `This is the shared sample shop on /demo. It is view only – its sample orders reset every ${config.demo.resetHours} hours.`)}</div>
    </section>`;
  }
  const demo = Boolean(shop.is_demo);
  let main = '';
  const foot = [];
  if (state === 'active' || state === 'expired') {
    main = demo ? demoExtendForm(res, shop, today) : extendForm(res, shop, state, today);
    foot.push(pauseForm(res, shop));
  } else if (state === 'pending') {
    main = activateForm(res, shop, state, today);
    foot.push(rejectForm(res, shop));
  } else if (state === 'paused') {
    main = activateForm(res, shop, state, today);
    if (!demo) foot.push(rejectForm(res, shop));
  } else if (state === 'rejected') {
    main = activateForm(res, shop, state, today);
  }
  return html`<section class="card adm-actions" id="actions" aria-labelledby="actions-h">
    <div class="card-head"><h2 id="actions-h">Account</h2>${shopStatePill(state)}</div>
    <div class="card-body">
      ${stateNote(shop, state)}
      ${main}
    </div>
    ${foot.length ? html`<div class="card-foot adm-foot">${foot}</div>` : ''}
  </section>`;
}

function notifyCard(form) {
  return html`<section class="card" id="notify" aria-labelledby="notify-h">
    <div class="card-head"><h2 id="notify-h">Send a message</h2><span class="adm-sub">Shows in their notifications</span></div>
    <div class="card-body adm-embed">${form}</div>
  </section>`;
}

function accessCard(res, shop) {
  return html`<section class="card" id="access" aria-labelledby="access-h">
    <div class="card-head"><h2 id="access-h">Login & password</h2></div>
    <div class="card-body">
      <dl class="kv adm-kv">
        <div><dt>Login email</dt><dd>${shop.email}</dd></div>
        <div><dt>Last login</dt><dd>${shop.last_login_at ? timeAgo(shop.last_login_at) : 'Never'}</dd></div>
      </dl>
      ${isSampleShop(shop)
        ? html`<p class="hint">The sample shop opens with one click from /demo – no password.</p>`
        : html`<form method="post" action="/admin/shops/${shop.id}/reset-password" data-confirm="Create a new temporary password for ${shop.name}? The owner will be logged out on all devices.">
            ${csrfField(res)}
            <button class="btn btn-secondary btn-block" type="submit">${adminIcon('key')}<span>Reset password</span></button>
            <p class="hint mt-1">You will see the new password once, to send to the owner.</p>
          </form>`}
    </div>
  </section>`;
}

function noteCard(res, shop) {
  return html`<section class="card" id="note" aria-labelledby="note-h">
    <div class="card-head"><h2 id="note-h">Admin note</h2><span class="adm-sub">Only you see this</span></div>
    <form class="card-body adm-note" method="post" action="/admin/shops/${shop.id}/note">
      ${csrfField(res)}
      <label class="sr-only" for="adm-note">Admin note</label>
      <textarea id="adm-note" name="note" rows="4" maxlength="2000" placeholder="Payment details, follow-ups, anything to remember…">${shop.admin_note}</textarea>
      <div class="form-actions"><button class="btn btn-secondary btn-sm" type="submit">${icon('check')}<span>Save note</span></button></div>
    </form>
  </section>`;
}

export function shopView(res, { shop, state, counts, storage, cap, liveFiles, recent, payments, tickets, today, reveal }) {
  // The shared sample shop is view only: no messages to it.
  const notifyForm = isSampleShop(shop) ? '' : notifyShopForm(res, shop);
  const hasNotify = filled(notifyForm);
  return html`<div class="container adm adm-detail">
    <a class="adm-back" href="/admin/shops">${icon('arrowLeft')}<span>All shops</span></a>
    ${reveal ? revealCard(shop, reveal) : ''}
    ${hero(shop, state, { counts, today })}
    ${jumpNav(shop, hasNotify)}
    <div class="adm-split">
      <div class="adm-col adm-main">
        ${subscriptionCard(res, shop, payments)}
        ${supportCard(tickets)}
        ${usageCard({ counts, storage, cap, liveFiles, recent })}
        ${detailsCard(shop)}
      </div>
      <aside class="adm-col adm-side" aria-label="Admin actions">
        ${actionsCard(res, shop, state, today)}
        ${hasNotify ? notifyCard(notifyForm) : ''}
        ${accessCard(res, shop)}
        ${noteCard(res, shop)}
      </aside>
    </div>
  </div>`;
}
