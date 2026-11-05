import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { formatDateTime, timeAgo } from '../../lib/util.js';
import { formatINR, paymentTitle } from '../../services/billing.js';
import { DOC_PATHS } from '../../services/legal.js';
import { REQUEST_STATUS, getService } from '../../services/services.js';
import { csrfField, icon } from '../components.js';
import { adminIcon } from './common.js';

// Admin views: service requests (list + one request), audit log, Terms & privacy editor.

const rupees = (paise) => formatINR(Math.round((paise || 0) / 100));
const TONE = { awaiting_payment: 'warn', open: 'info', quoted: 'warn', in_progress: 'info', done: 'ok', declined: 'muted', cancelled: 'muted' };
const pill = (s) => html`<span class="pill sv-pill sv-${TONE[s] || 'muted'}">${REQUEST_STATUS[s] || s}</span>`;
const head = (kicker, title, actions = '') => html`<div class="adm-pagehead"><div><p class="adm-kicker">${kicker}</p><h1>${title}</h1></div>${actions}</div>`;

// ---------- service requests ----------
export function requestsView({ rows, all, status }) {
  const count = (s) => all.filter((r) => r.status === s).length;
  const chips = [['', 'All', all.length], ...Object.entries(REQUEST_STATUS).map(([k, v]) => [k, v, count(k)])].filter(([k, , n]) => !k || n || k === status);
  return html`<div class="container adm">
    ${head('Setup, change reviews and custom work', 'Service requests', html`<div class="adm-pagehead-actions"><a class="btn btn-secondary" href="/admin/plans#services">${adminIcon('tag')}<span>Service prices</span></a></div>`)}
    <nav class="tabs" aria-label="Filter">${chips.map(([k, label, n]) => html`<a href="/admin/services${k ? `?status=${k}` : ''}"${status === k ? raw(' aria-current="page"') : ''}>${label}<span class="count">${n}</span></a>`)}</nav>
    <section class="card">
      ${rows.length
        ? html`<div class="table-wrap"><table class="table table-cards adm-req-table">
            <thead><tr><th scope="col">Request</th><th scope="col">Shop</th><th scope="col">Service</th><th scope="col">Status</th><th scope="col" class="num">Amount</th><th scope="col">Updated</th></tr></thead>
            <tbody>${rows.map(
              (r) => html`<tr>
                <td data-label="Request"><a class="adm-req-link" href="/admin/services/${r.id}"><b>#${r.id} · ${r.title}</b></a></td>
                <td data-label="Shop"><a href="/admin/shops/${r.shop_id}">${r.shop_name}</a></td>
                <td data-label="Service">${getService(r.service)?.name || r.service}</td>
                <td data-label="Status">${pill(r.status)}</td>
                <td data-label="Amount" class="num">${r.quote_paise ? rupees(r.quote_paise) : rupees(r.fee_paise)}</td>
                <td data-label="Updated">${timeAgo(r.updated_at)}</td>
              </tr>`
            )}</tbody>
          </table></div>`
        : html`<div class="empty"><h3>No requests here</h3><p>Shops ask for setup help and changes from Services in their menu.</p></div>`}
    </section>
  </div>`;
}

export function requestAdminView(res, { request: r, shop, payments }) {
  const quoteDue = r.quote_paise ? Math.max(100, r.quote_paise - (r.service === 'review' ? r.fee_paise : 0)) : 0;
  const canQuote = ['open', 'quoted', 'in_progress'].includes(r.status);
  const owes = r.status === 'awaiting_payment' ? r.fee_paise : r.status === 'quoted' ? quoteDue : 0;
  return html`<div class="container adm adm-req">
    <a class="adm-back" href="/admin/services">${icon('arrowLeft')}<span>All requests</span></a>
    ${head(`${getService(r.service)?.name || r.service} · request #${r.id}`, r.title, pill(r.status))}
    <div class="adm-split">
      <div class="adm-col adm-main">
        <section class="card card-pad">
          <h2 class="section-title">From ${shop ? html`<a href="/admin/shops/${shop.id}">${shop.name}</a>` : 'a deleted shop'} · ${formatDateTime(r.created_at)}</h2>
          <p class="sv-text">${r.details || '—'}</p>
          ${r.ticket_id ? html`<a class="btn btn-secondary btn-sm" href="/admin/tickets/${r.ticket_id}">${adminIcon('chat')}<span>Open the conversation</span></a>` : ''}
        </section>
        ${canQuote
          ? html`<form method="post" action="/admin/services/${r.id}/quote" class="card card-pad adm-req-quote">
              ${csrfField(res)}
              <h2>${r.quote_paise ? 'Change the quote' : 'Send a quote'}</h2>
              <div class="form-row">
                <div class="field"><label for="q-amount">Price (₹)</label><input id="q-amount" name="amount" type="text" inputmode="decimal" required value="${r.quote_paise ? r.quote_paise / 100 : ''}" placeholder="e.g. 3000"></div>
                <div class="field"><label for="q-note">What is included</label><input id="q-note" name="note" type="text" maxlength="1000" value="${r.quote_note}" placeholder="Scope, time to deliver…"></div>
              </div>
              ${r.service === 'review' && r.fee_paise ? html`<p class="hint">The ${rupees(r.fee_paise)} review fee is taken off automatically when they pay.</p>` : ''}
              <button class="btn btn-primary" type="submit">${icon('send')}<span>Send quote</span></button>
            </form>`
          : ''}
      </div>
      <aside class="adm-col adm-side">
        <section class="card card-pad">
          <h2 class="section-title">Move it along</h2>
          <form method="post" action="/admin/services/${r.id}/status" class="adm-req-status">
            ${csrfField(res)}
            <div class="field"><label for="st-note">Note to the shop <span class="optional">optional</span></label><textarea id="st-note" name="note" rows="2" maxlength="1000">${r.admin_note}</textarea></div>
            <div class="btn-row">
              <button class="btn btn-secondary btn-sm" name="status" value="in_progress">In progress</button>
              <button class="btn btn-success btn-sm" name="status" value="done">Done</button>
              <button class="btn btn-danger btn-sm" name="status" value="declined" data-confirm="Mark as not possible?">Not possible</button>
            </div>
          </form>
        </section>
        ${owes
          ? html`<form method="post" action="/admin/services/${r.id}/paid" class="card card-pad" data-confirm="Record ${rupees(owes)} received from ${shop?.name || 'the shop'}?">
              ${csrfField(res)}
              <h2 class="section-title">Paid by UPI / cash?</h2>
              <input type="text" name="note" maxlength="200" placeholder="UPI reference" aria-label="Reference">
              <button class="btn btn-primary btn-block mt-1" type="submit">${icon('check')}<span>Record ${rupees(owes)} received</span></button>
            </form>`
          : ''}
        <section class="card card-pad">
          <h2 class="section-title">Payments</h2>
          ${payments.length
            ? html`<ul class="sv-pays">${payments.map((p) => html`<li><span>${paymentTitle(p)} · ${p.status}</span><b>${rupees(p.amount_paise)}</b></li>`)}</ul>`
            : html`<p class="hint">None yet.</p>`}
        </section>
      </aside>
    </div>
  </div>`;
}

// ---------- audit log ----------
export function auditView({ list, q, actor, shop, page, size }) {
  const url = (o) => {
    const p = new URLSearchParams();
    if (o.q) p.set('q', o.q);
    if (o.actor) p.set('actor', o.actor);
    if (o.shop) p.set('shop', o.shop);
    if (o.page > 1) p.set('page', o.page);
    const s = p.toString();
    return `/admin/audit${s ? `?${s}` : ''}`;
  };
  const to = (page - 1) * size + list.rows.length;
  return html`<div class="container adm">
    ${head(shop ? `Only ${shop.name}` : 'Every plan, add-on, feature, payment and consent change', 'Audit log')}
    <form class="adm-audit-filter" method="get" action="/admin/audit" role="search">
      ${shop ? html`<input type="hidden" name="shop" value="${shop.id}">` : ''}
      <div class="search-input">${icon('search')}<label class="sr-only" for="au-q">Search</label><input type="search" id="au-q" name="q" value="${q}" placeholder="Shop, action or detail" maxlength="80"></div>
      <label class="sr-only" for="au-actor">Who</label>
      <select id="au-actor" name="actor" data-autosubmit>${['', 'admin', 'shop', 'system', 'payu', 'customer'].map((a) => html`<option value="${a}"${a === actor ? raw(' selected') : ''}>${a ? a : 'Everyone'}</option>`)}</select>
      <button class="btn btn-secondary" type="submit">Show</button>
      ${shop || q || actor ? html`<a class="btn btn-ghost" href="/admin/audit">Clear</a>` : ''}
    </form>
    <section class="card">
      ${list.rows.length
        ? html`<div class="table-wrap"><table class="table table-cards adm-audit-table">
            <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Shop</th><th scope="col">What</th></tr></thead>
            <tbody>${list.rows.map(
              (r) => html`<tr>
                <td data-label="When" class="nowrap">${formatDateTime(r.at)}</td>
                <td data-label="Who">${r.actor}${r.ip ? html`<span class="adm-sub"> · ${r.ip}</span>` : ''}</td>
                <td data-label="Shop">${r.shop_id ? html`<a href="/admin/shops/${r.shop_id}">${r.shop_name || `#${r.shop_id}`}</a>` : '—'}</td>
                <td data-label="What"><b>${r.action}</b><span class="adm-audit-detail">${r.detail}</span></td>
              </tr>`
            )}</tbody>
          </table></div>
          <nav class="sh-pager adm-audit-pager" aria-label="Pages"><span>${(page - 1) * size + 1}–${to} of ${list.total}</span><div class="btn-row">
            ${page > 1 ? html`<a class="btn btn-secondary btn-sm" href="${url({ q, actor, shop: shop?.id, page: page - 1 })}">Newer</a>` : ''}
            ${to < list.total ? html`<a class="btn btn-secondary btn-sm" href="${url({ q, actor, shop: shop?.id, page: page + 1 })}">Older</a>` : ''}
          </div></nav>`
        : html`<div class="empty"><h3>Nothing logged yet</h3><p>Changes to plans, add-ons, features, payments and consent appear here.</p></div>`}
    </section>
  </div>`;
}

// ---------- Terms & privacy ----------
export function legalAdminView(res, { legal, stats }) {
  const pct = stats.total ? Math.round((stats.accepted / stats.total) * 100) : 0;
  return html`<div class="container adm">
    ${head('Shown at /terms, /privacy and /refund-policy · accepted by every shop owner', 'Terms & privacy')}
    <section class="card card-pad adm-legal-stats">
      <div><span class="adm-kicker">Current version</span><b>${legal.version}</b></div>
      <div><span class="adm-kicker">Shop owners who accepted it</span><b>${stats.accepted} of ${stats.total}</b><progress max="100" value="${pct}" class="bl-meter" aria-label="${pct}% accepted"></progress></div>
      <div class="btn-row">${Object.entries(DOC_PATHS).map(([k, p]) => html`<a class="btn btn-secondary btn-sm" href="${config.baseUrl}${p}" target="_blank" rel="noopener">${adminIcon('external')}<span>${legal.docs[k].title}</span></a>`)}</div>
    </section>
    <form method="post" action="/admin/legal" class="adm-legal">
      ${csrfField(res)}
      ${Object.entries(legal.docs).map(
        ([k, d]) => html`<details class="card fold adm-fold"${k === 'terms' ? raw(' open') : ''}>
          <summary><span class="fold-ic">${icon('file')}</span><span class="fold-title"><b>${d.title}</b><small>${DOC_PATHS[k]}</small></span></summary>
          <div class="fold-body">
            <div class="field"><label for="lg-${k}-t">Title</label><input id="lg-${k}-t" name="title_${k}" type="text" maxlength="80" value="${d.title}" required></div>
            <div class="field"><label for="lg-${k}-b">Text</label><textarea id="lg-${k}-b" name="body_${k}" rows="18" class="adm-legal-text">${d.body}</textarea>
              <p class="hint">Blank line = new paragraph · “## ” = heading · “- ” = bullet.</p></div>
          </div>
        </details>`
      )}
      <div class="card card-pad adm-legal-save">
        <label class="au-check"><input type="checkbox" name="publish" value="1"><span><b>Publish as a new version</b> – every shop owner must accept again before using the app. Leave unticked for typo fixes.</span></label>
        <button class="btn btn-primary" type="submit">${icon('check')}<span>Save</span></button>
      </div>
      <p class="hint">These texts are a solid starting point, not legal advice – have them checked by a lawyer for your business.</p>
    </form>
  </div>`;
}
