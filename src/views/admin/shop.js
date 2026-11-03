import { html } from '../../lib/html.js';
import { config } from '../../config.js';
import { formatBytes, formatDate, formatDateTime, formatTime, isHexColor, prettyPhone, timeAgo, waLink } from '../../lib/util.js';
import { PLAN_LABEL, STATUSES } from '../../lib/status.js';
import { orderFormUrl } from '../../services/notify.js';
import { alert, csrfField, emptyState, field, icon, shopStatePill, statusPill } from '../components.js';
import {
  EXTEND,
  MAX_PAID_MONTHS,
  addMonths,
  dateOrDash,
  defaultPaidUntil,
  demoTag,
  extendBase,
  loginUrl,
  num,
  paidInfo,
  planOptions,
  shopAvatar,
  telHref,
  toneClass,
} from './common.js';

// /admin/shops/:id – everything about one shop plus the admin actions.

const ownerName = (shop) => shop.owner_name || shop.name;

/** Pre-written WhatsApp text for the owner, matching the account state. */
function ownerMessage(shop, state) {
  const hi = `Hi ${ownerName(shop)},`;
  const sign = '\n\n– Brighton Solution (PrintDesk)';
  const text = {
    pending: `${hi} thanks for registering ${shop.name} on PrintDesk. We are checking your details and will switch your account on shortly.`,
    active: `${hi} your PrintDesk account for ${shop.name} is active.\nLog in: ${loginUrl()}\nYour customer order link: ${orderFormUrl(shop)}`,
    expired: `${hi} your PrintDesk plan for ${shop.name} ended on ${formatDate(shop.paid_until)}, so your order link is not taking new orders. Reply here to renew.`,
    paused: `${hi} your PrintDesk account for ${shop.name} is paused, so your order link is not taking new orders. Reply here to switch it back on.`,
    rejected: `${hi} this is Brighton Solution about your PrintDesk registration for ${shop.name}.`,
  }[state];
  return (text || `${hi} this is Brighton Solution from PrintDesk.`) + sign;
}

function revealCard(shop, password) {
  const msg = `Hi ${ownerName(shop)}, your PrintDesk password has been reset.\n\nLog in: ${loginUrl()}\nEmail: ${shop.email}\nTemporary password: ${password}\n\n– Brighton Solution (PrintDesk)`;
  return html`<section class="card adm-reveal" role="alert" aria-labelledby="reveal-h">
    <div class="adm-reveal-head">
      <span class="adm-reveal-ic" aria-hidden="true">${icon('shield')}</span>
      <div>
        <h2 id="reveal-h">New temporary password for ${shop.name}</h2>
        <p>Shown only once – copy it or send it to the owner now. They have been logged out on all devices.</p>
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

function hero(shop, state) {
  const url = orderFormUrl(shop);
  const tel = telHref(shop.mobile);
  return html`<section class="card adm-hero" aria-labelledby="shop-h">
    <div class="cmyk-bar adm-bar" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
    <div class="adm-hero-id">
      ${shopAvatar(shop, 56, 'adm-avatar-lg')}
      <div class="adm-hero-text">
        <div class="adm-hero-title"><h1 id="shop-h">${shop.name}</h1>${shop.is_demo ? demoTag() : ''}${shopStatePill(state)}</div>
        <p class="adm-hero-meta">
          <span>${icon('user')}${shop.owner_name || 'No owner name'}</span>
          ${shop.city ? html`<span>${icon('home')}${shop.city}</span>` : ''}
          <span>${icon('clock')}Joined ${formatDate(shop.created_at)}</span>
        </p>
      </div>
    </div>
    <div class="adm-hero-link">
      <label class="label" for="adm-link">Customer order link</label>
      <div class="copy-field adm-copy">
        <input type="text" id="adm-link" value="${url}" readonly>
        <button type="button" class="btn btn-secondary" data-copy="${url}" data-copy-msg="Order link copied">${icon('copy')}<span>Copy</span></button>
      </div>
      <div class="btn-row adm-hero-actions">
        <a class="btn btn-secondary btn-sm" href="/${shop.slug}" target="_blank" rel="noopener">${icon('eye')}<span>Open form</span></a>
        <a class="btn btn-wa btn-sm" href="${waLink(shop.mobile, ownerMessage(shop, state))}" target="_blank" rel="noopener">${icon('whatsapp')}<span>WhatsApp</span></a>
        ${tel ? html`<a class="btn btn-ghost btn-sm" href="${tel}">${icon('phone')}<span>Call</span></a>` : ''}
        <a class="btn btn-ghost btn-sm" href="mailto:${shop.email}">${icon('mail')}<span>Email</span></a>
        ${state === 'pending' ? html`<a class="btn btn-success btn-sm adm-jump" href="#plan">${icon('check')}<span>Approve or reject</span></a>` : ''}
      </div>
    </div>
  </section>`;
}

function usageCard({ counts, storage, liveFiles }) {
  return html`<section class="card" aria-labelledby="usage-h">
    <div class="card-head"><h2 id="usage-h">Usage</h2></div>
    <div class="card-body">
      <dl class="adm-mini">
        <div><dt>Orders total</dt><dd>${num(counts.total)}</dd></div>
        <div><dt>Orders today</dt><dd>${num(counts.newToday)}</dd></div>
        <div><dt>Storage used</dt><dd>${formatBytes(storage)}</dd></div>
        <div><dt>Files stored</dt><dd>${num(liveFiles)}</dd></div>
      </dl>
      <h3 class="section-title adm-usage-sub">Orders by status</h3>
      <ul class="adm-status-list">
        ${STATUSES.map((st) => html`<li${counts[st] ? '' : html` class="is-zero"`}>${statusPill(st)}<b>${num(counts[st] || 0)}</b></li>`)}
      </ul>
    </div>
  </section>`;
}

function recentCard(recent) {
  return html`<section class="card" aria-labelledby="recent-h">
    <div class="card-head"><h2 id="recent-h">Recent orders</h2><span class="adm-sub">Last 10 · customer details hidden</span></div>
    ${recent.length
      ? html`<ul class="order-list adm-orders">
          ${recent.map(
            (o) => html`<li class="order-row">
              <span class="order-no">#${o.order_no}</span>
              <div class="order-main">
                <div class="order-title adm-order-title">${statusPill(o.status)}${o.is_sample ? html`<span class="pill pill-sample">Sample</span>` : ''}</div>
                <div class="order-meta">${o.file_count} file${o.file_count === 1 ? '' : 's'} · ${formatDateTime(o.created_at)}</div>
              </div>
              <div class="order-side"><time class="order-time" datetime="${o.created_at}">${timeAgo(o.created_at)}</time></div>
            </li>`
          )}
        </ul>`
      : emptyState({ title: 'No orders yet', text: 'Orders show up here once customers start using this shop’s link.' })}
  </section>`;
}

function detailsCard(shop) {
  const tel = telHref(shop.mobile);
  const color = isHexColor(shop.brand_color) ? shop.brand_color : '';
  const row = (label, value) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`;
  return html`<section class="card" aria-labelledby="details-h">
    <div class="card-head"><h2 id="details-h">Registration details</h2></div>
    <div class="card-body">
      <dl class="kv adm-details">
        ${row('Shop name', shop.name)}
        ${row('Link name', html`<span class="mono">/${shop.slug}</span>`)}
        ${row('Owner', shop.owner_name || '—')}
        ${row('Mobile', shop.mobile ? (tel ? html`<a href="${tel}">${prettyPhone(shop.mobile)}</a>` : shop.mobile) : '—')}
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
        ${row('Next order no.', html`<span class="order-no">#${shop.next_order_no}</span>`)}
        ${row('Registered', `${formatDate(shop.created_at)}, ${formatTime(shop.created_at)}`)}
        ${row('Approved', shop.approved_at ? `${formatDate(shop.approved_at)}, ${formatTime(shop.approved_at)}` : 'Not yet')}
        ${row('Last login', shop.last_login_at ? html`${timeAgo(shop.last_login_at)} <span class="adm-sub">(${formatDateTime(shop.last_login_at)})</span>` : 'Never')}
      </dl>
    </div>
  </section>`;
}

// ---------- plan & status actions ----------
const dateInput = (id, value, today) =>
  html`<input type="date" id="${id}" name="paid_until" value="${value}" min="${today}" max="${addMonths(today, MAX_PAID_MONTHS)}" required>`;

function planFields(shop, today) {
  return html`${field({ label: 'Plan', id: 'pl-plan', control: html`<select id="pl-plan" name="plan" required>${planOptions(shop.plan || 'starter')}</select>` })}
    ${field({ label: 'Paid until', id: 'pl-paid', control: dateInput('pl-paid', defaultPaidUntil(shop, today), today), hint: 'The order link closes automatically after this date.' })}`;
}

function approveForm(res, shop, today) {
  return html`<form method="post" action="/admin/shops/${shop.id}/approve" class="adm-plan-form">
    ${csrfField(res)}
    ${planFields(shop, today)}
    <button class="btn btn-success btn-block" type="submit">${icon('check')}<span>Approve shop</span></button>
  </form>`;
}

function activateForm(res, shop, today) {
  return html`<form method="post" action="/admin/shops/${shop.id}/activate" class="adm-plan-form">
    ${csrfField(res)}
    ${planFields(shop, today)}
    <button class="btn btn-success btn-block" type="submit">${icon('check')}<span>Activate shop</span></button>
  </form>`;
}

function planForm(res, shop, state, today) {
  return html`<form method="post" action="/admin/shops/${shop.id}/plan" class="adm-plan-form">
    ${csrfField(res)}
    ${planFields(shop, today)}
    <button class="btn btn-primary btn-block" type="submit">${icon('check')}<span>${state === 'expired' ? 'Save and renew' : 'Save plan'}</span></button>
    <div class="adm-extend">
      <span class="label" id="ext-label">Quick extend</span>
      <div class="adm-extend-btns" role="group" aria-labelledby="ext-label">
        ${Object.entries(EXTEND).map(
          ([key, x]) => html`<button class="btn btn-secondary btn-sm" type="submit" name="extend" value="${key}" formnovalidate>${x.label}</button>`
        )}
      </div>
      <p class="hint">Adds time from ${formatDate(extendBase(shop, today))} and saves the plan selected above.</p>
    </div>
  </form>`;
}

const pauseForm = (res, shop) =>
  html`<form method="post" action="/admin/shops/${shop.id}/pause" data-confirm="Pause ${shop.name}? Their order link stops taking new orders until you activate it again.">
    ${csrfField(res)}
    <button class="btn btn-secondary" type="submit">${icon('clock')}<span>Pause shop</span></button>
  </form>`;

const rejectForm = (res, shop, label = 'Reject shop') =>
  html`<form method="post" action="/admin/shops/${shop.id}/reject" data-confirm="Reject ${shop.name}? They will see a “not approved” screen and cannot take orders.">
    ${csrfField(res)}
    <button class="btn btn-danger" type="submit">${icon('x')}<span>${label}</span></button>
  </form>`;

function stateNote(shop, state) {
  if (shop.is_demo) return alert('info', `Demo shop – sample data resets every ${config.demo.resetHours} hours. Plan changes, pause, reject and password reset are switched off.`);
  switch (state) {
    case 'pending':
      return alert('warn', 'New sign-up. Check the details, then approve with a plan. Their order link goes live straight away.', 'clock');
    case 'expired':
      return alert('warn', `Plan ended on ${formatDate(shop.paid_until)}. The order link is closed until you renew.`);
    case 'paused':
      return alert('warn', 'Paused. The order link is closed, but the owner can still log in and see past orders.');
    case 'rejected':
      return alert('danger', 'Rejected. The owner sees a “not approved” screen when they log in. You can still approve them below.');
    default:
      return '';
  }
}

/** [main form, footer form] for each account state. The demo shop is view only (the demo service owns it). */
function planActions(res, shop, state, today) {
  if (shop.is_demo) return ['', ''];
  if (state === 'pending') return [approveForm(res, shop, today), rejectForm(res, shop)];
  if (state === 'rejected') return [approveForm(res, shop, today), ''];
  if (state === 'paused') return [activateForm(res, shop, today), rejectForm(res, shop, 'Reject account')];
  return [planForm(res, shop, state, today), pauseForm(res, shop)];
}

function planCard(res, shop, state, today) {
  const info = paidInfo(shop, today);
  const [forms, foot] = planActions(res, shop, state, today);
  return html`<section class="card adm-plan" id="plan" aria-labelledby="plan-h">
    <div class="card-head"><h2 id="plan-h">Plan & status</h2>${shopStatePill(state)}</div>
    <div class="card-body">
      ${state === 'pending'
        ? ''
        : html`<dl class="kv adm-kv">
            <div><dt>Plan</dt><dd>${PLAN_LABEL[shop.plan] || 'Not set'}</dd></div>
            <div><dt>Paid until</dt><dd>${dateOrDash(shop.paid_until)}${shop.paid_until || shop.is_demo ? html` <span class="${toneClass(info.tone)}">· ${info.text}</span>` : ''}</dd></div>
            <div><dt>Approved</dt><dd>${shop.approved_at ? formatDate(shop.approved_at) : 'Not yet'}</dd></div>
          </dl>`}
      ${stateNote(shop, state)}
      ${forms}
    </div>
    ${foot ? html`<div class="card-foot adm-foot">${foot}</div>` : ''}
  </section>`;
}

function accessCard(res, shop) {
  return html`<section class="card" aria-labelledby="access-h">
    <div class="card-head"><h2 id="access-h">Login & password</h2></div>
    <div class="card-body">
      <dl class="kv adm-kv">
        <div><dt>Login email</dt><dd>${shop.email}</dd></div>
        <div><dt>Last login</dt><dd>${shop.last_login_at ? timeAgo(shop.last_login_at) : 'Never'}</dd></div>
      </dl>
      ${shop.is_demo
        ? html`<p class="hint">Password reset is switched off for the demo shop.</p>`
        : html`<form method="post" action="/admin/shops/${shop.id}/reset-password" data-confirm="Create a new temporary password for ${shop.name}? The owner will be logged out on all devices.">
            ${csrfField(res)}
            <button class="btn btn-secondary btn-block" type="submit">${icon('refresh')}<span>Reset password</span></button>
            <p class="hint mt-1">You will see the new password once, to send to the owner.</p>
          </form>`}
    </div>
  </section>`;
}

function noteCard(res, shop) {
  return html`<section class="card" id="note" aria-labelledby="note-h">
    <div class="card-head"><h2 id="note-h">Admin note</h2><span class="adm-sub">Only admins see this</span></div>
    <form class="card-body adm-note" method="post" action="/admin/shops/${shop.id}/note">
      ${csrfField(res)}
      <label class="sr-only" for="adm-note">Admin note</label>
      <textarea id="adm-note" name="note" rows="4" maxlength="2000" placeholder="Payment details, follow-ups, anything to remember…">${shop.admin_note}</textarea>
      <div class="form-actions"><button class="btn btn-secondary btn-sm" type="submit">${icon('check')}<span>Save note</span></button></div>
    </form>
  </section>`;
}

export function shopView(res, { shop, state, counts, storage, liveFiles, recent, today, reveal }) {
  const usage = usageCard({ counts, storage, liveFiles });
  const orders = recentCard(recent);
  const details = detailsCard(shop);
  return html`<div class="container adm adm-detail">
    <a class="adm-back" href="/admin">${icon('arrowLeft')}<span>All shops</span></a>
    ${reveal ? revealCard(shop, reveal) : ''}
    ${hero(shop, state)}
    <div class="split adm-split">
      <div class="stack adm-main">
        ${state === 'pending' ? [details, usage, orders] : [usage, orders, details]}
      </div>
      <aside class="stack adm-side" aria-label="Admin actions">
        ${planCard(res, shop, state, today)}
        ${accessCard(res, shop)}
        ${noteCard(res, shop)}
      </aside>
    </div>
  </div>`;
}
