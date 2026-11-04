import { html, raw } from '../../lib/html.js';
import { formatDate, prettyPhone, timeAgo, waLink } from '../../lib/util.js';
import { TICKET_STATUS_LABEL, categoryLabel } from '../../services/support.js';
import { csrfField, emptyState, icon, shopStatePill } from '../components.js';
import { shopAvatar, ticketStatusPill } from '../admin/common.js';
import { sicon, thread, ticketRef } from '../shop-support/common.js';

// Super admin: support inbox and one ticket (thread, reply, status, shop info).

export const INBOX_FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'answered', label: 'Answered' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
];
export const REPLY_MAX = 3000;

// Inbox avatars: a stable colour per shop name (the inbox query has no brand colours).
const AVATAR_COLORS = ['#1a5d40', '#0f766e', '#7c3aed', '#c2410c', '#be185d', '#1d4ed8', '#15803d'];
const colorFor = (name) => AVATAR_COLORS[Array.from(String(name || '')).reduce((a, c) => (a + c.codePointAt(0)) % 997, 0) % AVATAR_COLORS.length];

const pill = (status) => ticketStatusPill(status, TICKET_STATUS_LABEL[status]);

const EMPTY = {
  open: { title: 'No open tickets', text: 'All caught up. New tickets from shops show up here and in your notifications.' },
  answered: { title: 'Nothing waiting on shops', text: 'Tickets you answered show here until the shop replies or marks them solved.' },
  closed: { title: 'No closed tickets yet', text: 'Solved tickets are kept here for reference.' },
  all: { title: 'No tickets yet', text: 'When a shop raises a ticket from Help, it lands here.' },
};

function inboxRow(t) {
  const waiting = t.status === 'open' && t.last_author === 'shop';
  return html`<li class="adm-tk${t.admin_unread ? ' is-unread' : ''}">
    ${shopAvatar({ name: t.shop_name, brand_color: colorFor(t.shop_name) }, 44)}
    <div class="adm-tk-main">
      <a class="adm-tk-subject adm-stretch" href="/admin/tickets/${t.id}">${t.admin_unread ? html`<span class="adm-dot" aria-hidden="true"></span><span class="sr-only">New message: </span>` : ''}${t.subject}</a>
      <span class="adm-tk-meta"><b>${t.shop_name}</b> · ${categoryLabel(t.category)} · ${t.message_count} message${t.message_count === 1 ? '' : 's'}</span>
    </div>
    <div class="adm-tk-side">
      ${waiting ? html`<span class="adm-needs">Needs reply</span>` : pill(t.status)}
      <span class="adm-sub">${timeAgo(t.updated_at)}</span>
    </div>
  </li>`;
}

export function inboxView(res, { tickets, filter, counts }) {
  const empty = EMPTY[filter] || EMPTY.all;
  return {
    title: 'Support tickets',
    variant: 'admin',
    active: 'tickets',
    scripts: ['/js/support.js'],
    body: html`<div class="container adm">
      <div class="adm-pagehead">
        <div>
          <p class="adm-kicker">${counts.open ? `${counts.open} open · ${counts.unread} with new messages` : 'No open tickets – all caught up'}</p>
          <h1>Support</h1>
        </div>
      </div>
      <nav class="tabs adm-tabs adm-tabs-bare" aria-label="Filter tickets">
        ${INBOX_FILTERS.map(
          (f) => html`<a href="/admin/tickets?status=${f.key}"${f.key === filter ? raw(' aria-current="page" class="is-active"') : ''}>${f.label}${f.key === 'open' && counts.open ? html`<span class="badge">${counts.open}</span>` : html`<span class="count">${counts[f.key]}</span>`}</a>`
        )}
      </nav>
      ${tickets.length ? html`<ul class="card adm-tks">${tickets.map(inboxRow)}</ul>` : html`<div class="card">${emptyState(empty)}</div>`}
    </div>`,
  };
}

function shopCard(shop, { state, planText, paidText, orderUrl, ticket }) {
  const wa = shop.mobile ? waLink(shop.mobile, `Hi ${shop.owner_name || shop.name}, this is Brighton Solution about your support ticket "${ticket.subject}".`) : '';
  return html`<section class="card adm-tkshop" aria-labelledby="adm-tkshop-h">
    <div class="adm-tkshop-head">
      ${shopAvatar(shop, 48)}
      <div class="adm-tkshop-text">
        <h2 id="adm-tkshop-h"><a href="/admin/shops/${shop.id}">${shop.name}</a></h2>
        <span class="adm-sub">${shop.owner_name || '—'}${shop.city ? ` · ${shop.city}` : ''}</span>
      </div>
    </div>
    <dl class="kv adm-kv">
      <div><dt>Account</dt><dd>${shopStatePill(state)}${shop.is_demo ? html` <span class="pill pill-sample">Demo</span>` : ''}</dd></div>
      <div><dt>Plan</dt><dd>${planText}</dd></div>
      <div><dt>Paid until</dt><dd>${paidText}</dd></div>
      <div><dt>Email</dt><dd><a href="mailto:${shop.email}">${shop.email}</a></dd></div>
      ${shop.mobile ? html`<div><dt>Mobile</dt><dd>${prettyPhone(shop.mobile)}</dd></div>` : ''}
    </dl>
    <div class="adm-tkshop-actions">
      <a class="btn btn-secondary btn-sm" href="/admin/shops/${shop.id}">${icon('store')}<span>Open shop</span></a>
      ${wa ? html`<a class="btn btn-wa btn-sm" href="${wa}" target="_blank" rel="noopener">${icon('whatsapp')}<span>WhatsApp</span></a>` : ''}
      <a class="btn btn-ghost btn-sm" href="${orderUrl}" target="_blank" rel="noopener">${icon('link')}<span>Order page</span></a>
    </div>
  </section>`;
}

function statusCard(res, ticket) {
  return html`<section class="card adm-tkstatus" aria-labelledby="adm-tkstatus-h">
    <div class="card-head"><h2 id="adm-tkstatus-h">Ticket status</h2></div>
    <form class="card-body" method="post" action="/admin/tickets/${ticket.id}/status">
      ${csrfField(res)}
      <div class="adm-seg" role="group" aria-labelledby="adm-tkstatus-h">
        ${['open', 'answered', 'closed'].map(
          (s) => html`<button type="submit" name="status" value="${s}" class="adm-seg-btn adm-seg-${s}${s === ticket.status ? ' is-current' : ''}"${s === ticket.status ? raw(' aria-pressed="true" disabled') : raw(' aria-pressed="false"')}>${s === 'closed' ? sicon('solved') : s === 'answered' ? sicon('chat') : icon('clock')}<span>${TICKET_STATUS_LABEL[s]}</span></button>`
        )}
      </div>
      <p class="hint">Your reply marks it answered. A reply from the shop opens it again.</p>
    </form>
  </section>`;
}

function otherTickets(list) {
  if (!list.length) return '';
  return html`<section class="card adm-panel" aria-labelledby="adm-other-h">
    <div class="adm-panel-head"><h2 id="adm-other-h">Other tickets from this shop</h2></div>
    <ul class="adm-list">
      ${list.slice(0, 5).map(
        (t) => html`<li><a class="adm-item" href="/admin/tickets/${t.id}"><span class="adm-item-main"><span class="adm-item-title">${t.subject}</span><span class="adm-item-sub">${timeAgo(t.updated_at)}</span></span><span class="adm-item-side">${pill(t.status)}</span></a></li>`
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
    body: html`<div class="container adm">
      <a class="adm-back" href="/admin/tickets">${icon('arrowLeft')}<span>All tickets</span></a>
      <header class="adm-tkhead">
        <h1>${ticket.subject}</h1>
        <p class="adm-tkhead-meta">${pill(ticket.status)}<span>${ticketRef(ticket.id)}</span><span>${categoryLabel(ticket.category)}</span><span>Opened ${formatDate(ticket.created_at)}</span></p>
      </header>
      <div class="adm-split adm-split-ticket">
        <section class="card adm-convo" aria-label="Conversation">
          ${thread(messages, { viewer: 'admin', shop })}
          <form class="adm-composer${error ? ' has-error' : ''}" method="post" action="/admin/tickets/${ticket.id}/reply" novalidate>
            ${csrfField(res)}
            <label for="reply" class="adm-composer-label">Reply to ${shop.name}</label>
            <textarea id="reply" name="body" rows="4" maxlength="${REPLY_MAX}" required placeholder="Write your reply…" data-autogrow data-counter="${REPLY_MAX}"${error ? raw(' aria-invalid="true" aria-describedby="reply-error"') : ''}>${reply}</textarea>
            ${error ? html`<p class="field-error" id="reply-error">${error}</p>` : ''}
            <div class="adm-composer-foot">
              <span class="hint">The shop gets a notification. Ctrl + Enter sends.</span>
              <div class="btn-row">
                <button type="submit" name="then" value="close" class="btn btn-ghost">${sicon('solved')}<span>Send &amp; close</span></button>
                <button type="submit" class="btn btn-primary" data-loading="Sending…">${sicon('send')}<span>Send reply</span></button>
              </div>
            </div>
          </form>
        </section>
        <aside class="adm-col" aria-label="About this shop">
          ${shopCard(shop, { state, planText, paidText, orderUrl, ticket })}
          ${statusCard(res, ticket)}
          ${otherTickets(others)}
        </aside>
      </div>
    </div>`,
  };
}
