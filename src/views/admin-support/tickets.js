import { html, raw } from '../../lib/html.js';
import { formatDate, prettyPhone, timeAgo, waLink } from '../../lib/util.js';
import { TICKET_STATUS_LABEL, categoryLabel } from '../../services/support.js';
import { csrfField, emptyState, icon, shopStatePill } from '../components.js';
import { letterAvatar, sicon, thread, ticketPill, ticketRef } from '../shop-support/common.js';

// Super admin: support inbox and one ticket (thread, reply, status, shop info).

export const INBOX_FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'answered', label: 'Answered' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
];
export const REPLY_MAX = 3000;

// Inbox avatars: a stable colour per shop name (the inbox query has no brand colours).
const AVATAR_COLORS = ['#4f46e5', '#0f766e', '#7c3aed', '#c2410c', '#be185d', '#1d4ed8', '#15803d'];
const colorFor = (name) => AVATAR_COLORS[Array.from(String(name || '')).reduce((a, c) => (a + c.codePointAt(0)) % 997, 0) % AVATAR_COLORS.length];

const EMPTY = {
  open: { title: 'No open tickets', text: 'All caught up. New tickets from shops show up here and in your notifications.' },
  answered: { title: 'Nothing waiting on shops', text: 'Tickets you answered show here until the shop replies or marks them solved.' },
  closed: { title: 'No closed tickets yet', text: 'Solved tickets are kept here for reference.' },
  all: { title: 'No tickets yet', text: 'When a shop raises a ticket from Help & support, it lands here.' },
};

export function inboxView(res, { tickets, filter, counts }) {
  const empty = EMPTY[filter] || EMPTY.all;
  return {
    title: 'Support tickets',
    variant: 'admin',
    active: 'tickets',
    scripts: ['/js/support.js'],
    body: html`<div class="container sup-page">
      <header class="sup-hero sup-hero-sm">
        <div class="sup-hero-text">
          <span class="eyebrow">Help &amp; support</span>
          <h1>Support tickets</h1>
          <p class="muted">${counts.open ? `${counts.open} open · ${counts.unread} with new messages` : 'No open tickets – all caught up.'}</p>
        </div>
      </header>
      <nav class="tabs sup-filters" aria-label="Filter tickets">
        ${INBOX_FILTERS.map(
          (f) => html`<a href="/admin/tickets?status=${f.key}"${f.key === filter ? raw(' aria-current="page" class="is-active"') : ''}>${f.label}<span class="count">${counts[f.key]}</span></a>`
        )}
      </nav>
      ${tickets.length
        ? html`<ul class="card sup-tickets sup-inbox">
            ${tickets.map(
              (t) => html`<li class="sup-tk${t.admin_unread ? ' is-unread' : ''}">
                ${letterAvatar(t.shop_name, colorFor(t.shop_name), 40)}
                <div class="sup-tk-main">
                  <a class="sup-tk-subject sup-stretch" href="/admin/tickets/${t.id}">${t.subject}</a>
                  <span class="sup-tk-meta"><b>${t.shop_name}</b> · ${categoryLabel(t.category)} · ${sicon('chat', 'sup-ic-xs')} ${t.message_count}</span>
                </div>
                <div class="sup-tk-side">
                  ${t.status === 'open' && t.last_author === 'shop' ? html`<span class="sup-new">Needs reply</span>` : ticketPill(t.status)}
                  <span class="sup-tk-time">${timeAgo(t.updated_at)}</span>
                </div>
              </li>`
            )}
          </ul>`
        : html`<div class="card">${emptyState(empty)}</div>`}
    </div>`,
  };
}

function shopCard(shop, { state, planText, paidText, orderUrl, ticket }) {
  const wa = shop.mobile ? waLink(shop.mobile, `Hi ${shop.owner_name || shop.name}, this is Brighton Solution about your support ticket "${ticket.subject}".`) : '';
  return html`<section class="card sup-shopcard" aria-labelledby="sup-shop-title">
    <div class="sup-shopcard-head">
      ${letterAvatar(shop.name, shop.brand_color, 44)}
      <div class="sup-shopcard-text">
        <h2 id="sup-shop-title"><a href="/admin/shops/${shop.id}">${shop.name}</a></h2>
        <span class="muted">${shop.owner_name || '—'}${shop.city ? ` · ${shop.city}` : ''}</span>
      </div>
    </div>
    <dl class="sup-kv">
      <div><dt>Account</dt><dd>${shopStatePill(state)}${shop.is_demo ? html` <span class="pill pill-sample">Demo</span>` : ''}</dd></div>
      <div><dt>Plan</dt><dd>${planText}</dd></div>
      <div><dt>Paid until</dt><dd>${paidText}</dd></div>
      <div><dt>Email</dt><dd><a href="mailto:${shop.email}">${shop.email}</a></dd></div>
      ${shop.mobile ? html`<div><dt>Mobile</dt><dd>${prettyPhone(shop.mobile)}</dd></div>` : ''}
    </dl>
    <div class="sup-shopcard-actions">
      <a class="btn btn-secondary btn-sm" href="/admin/shops/${shop.id}">${icon('store')}<span>Open shop</span></a>
      <a class="btn btn-ghost btn-sm" href="${orderUrl}" target="_blank" rel="noopener">${icon('link')}<span>Order page</span></a>
      ${wa ? html`<a class="btn btn-ghost btn-sm" href="${wa}" target="_blank" rel="noopener">${icon('whatsapp')}<span>WhatsApp</span></a>` : ''}
    </div>
  </section>`;
}

function statusCard(res, ticket) {
  return html`<section class="card sup-statuscard" aria-labelledby="sup-status-title">
    <div class="card-head"><h2 id="sup-status-title">Status</h2></div>
    <form class="card-body sup-status-form" method="post" action="/admin/tickets/${ticket.id}/status">
      ${csrfField(res)}
      <div class="sup-seg" role="group" aria-labelledby="sup-status-title">
        ${['open', 'answered', 'closed'].map(
          (s) => html`<button type="submit" name="status" value="${s}" class="sup-seg-btn sup-seg-${s}${s === ticket.status ? ' is-current' : ''}"${s === ticket.status ? raw(' aria-pressed="true" disabled') : raw(' aria-pressed="false"')}>${s === 'closed' ? sicon('solved') : s === 'answered' ? sicon('chat') : icon('clock')}<span>${TICKET_STATUS_LABEL[s]}</span></button>`
        )}
      </div>
      <p class="hint">Your reply marks it answered. A reply from the shop opens it again.</p>
    </form>
  </section>`;
}

function otherTickets(list) {
  if (!list.length) return '';
  return html`<section class="card" aria-labelledby="sup-other-title">
    <div class="card-head"><h2 id="sup-other-title">Other tickets from this shop</h2></div>
    <ul class="sup-mini">
      ${list.slice(0, 5).map(
        (t) => html`<li><a href="/admin/tickets/${t.id}">${t.subject}</a><span>${ticketPill(t.status)}<small>${timeAgo(t.updated_at)}</small></span></li>`
      )}
    </ul>
  </section>`;
}

export function adminTicketView(res, { ticket, shop, messages, state, planText, paidText, orderUrl, others, reply = '', error = '' }) {
  return {
    title: `${ticketRef(ticket.id)} ${ticket.subject}`,
    variant: 'admin',
    active: 'tickets',
    scripts: ['/js/support.js'],
    body: html`<div class="container sup-page">
      <a class="sup-back" href="/admin/tickets">${icon('arrowLeft')}<span>All tickets</span></a>
      <header class="sup-ticket-head">
        <h1>${ticket.subject}</h1>
        <p class="sup-ticket-meta">${ticketPill(ticket.status)}<span>${ticketRef(ticket.id)}</span><span>${categoryLabel(ticket.category)}</span><span>Opened ${formatDate(ticket.created_at)}</span></p>
      </header>
      <div class="sup-admin-layout">
        <section class="card sup-convo" aria-label="Conversation">
          ${thread(messages, { viewer: 'admin', shop })}
          <form class="sup-composer${error ? ' has-error' : ''}" method="post" action="/admin/tickets/${ticket.id}/reply" novalidate>
            ${csrfField(res)}
            <label for="reply" class="sr-only">Reply to ${shop.name}</label>
            <textarea id="reply" name="body" rows="4" maxlength="${REPLY_MAX}" required placeholder="Reply to ${shop.name}…" data-autogrow data-counter="${REPLY_MAX}"${error ? raw(' aria-invalid="true" aria-describedby="reply-error"') : ''}>${reply}</textarea>
            ${error ? html`<p class="field-error" id="reply-error">${error}</p>` : ''}
            <div class="sup-composer-foot">
              <span class="hint">The shop gets a notification in its dashboard.</span>
              <div class="btn-row">
                <button type="submit" name="then" value="close" class="btn btn-ghost">${sicon('solved')}<span>Send &amp; close</span></button>
                <button type="submit" class="btn btn-primary" data-loading="Sending…">${sicon('send')}<span>Send reply</span></button>
              </div>
            </div>
          </form>
        </section>
        <aside class="sup-admin-side">
          ${shopCard(shop, { state, planText, paidText, orderUrl, ticket })}
          ${statusCard(res, ticket)}
          ${otherTickets(others)}
        </aside>
      </div>
    </div>`,
  };
}
