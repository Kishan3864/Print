import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { formatDate, timeAgo, waLink } from '../../lib/util.js';
import { TICKET_CATEGORIES, categoryLabel } from '../../services/support.js';
import { isSampleShop } from '../../services/billing.js';
import { alert, csrfField, emptyState, field, icon } from '../components.js';
import { groupBy, isToday, notificationGroups, sicon, thread, ticketPill, ticketRef } from './common.js';

// Shop owner: Help & support (ticket list + new ticket form + quick help),
// one ticket's conversation, and the notifications page.

export const LIMITS = { subjectMin: 3, subjectMax: 120, messageMin: 10, messageMax: 3000, replyMax: 3000 };

const DM_URL = `https://ig.me/m/${config.instagram}`;

const invalid = (error) => (error ? raw(' aria-invalid="true"') : '');
const describedBy = (id, error, hint = false) => {
  const ids = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return ids ? raw(` aria-describedby="${ids}"`) : '';
};

// ---------- quick help ----------
function quickHelp(shop) {
  const items = [
    {
      ic: 'qr',
      title: 'Share your order link & QR',
      text: html`<ol class="sup-steps">
          <li>Open <b>Link &amp; QR</b> and copy your link.</li>
          <li>Send it to customers on WhatsApp or add it to your Instagram bio.</li>
          <li>Print the counter poster – customers scan the QR and upload files from their phone.</li>
        </ol>`,
      action: html`<a class="btn btn-secondary btn-sm" href="/shop/link">${icon('qr')}<span>Open Link &amp; QR</span></a>`,
    },
    {
      ic: 'proof',
      title: 'How proofs work',
      text: html`<ol class="sup-steps">
          <li>Open the order and upload a proof (PDF or image of the final design).</li>
          <li>Tap the WhatsApp button – the customer gets a link to see the proof.</li>
          <li>They approve or ask for changes. You see it on the order at once, then start printing.</li>
        </ol>`,
      action: html`<a class="btn btn-secondary btn-sm" href="/shop">${icon('orders')}<span>Go to orders</span></a>`,
    },
    {
      ic: 'shield',
      title: 'Plan, payment & renewal',
      text: html`<p>See your plan and its end date, renew monthly or yearly, and download payment receipts in <b>Plan &amp; billing</b>. We remind you 7, 3 and 1 days before it ends.</p>`,
      action: html`<a class="btn btn-secondary btn-sm" href="/shop/billing">${icon('shield')}<span>Plan &amp; billing</span></a>`,
    },
    {
      ic: 'settings',
      title: 'Logo, colours & paper sizes',
      text: html`<p>Add your logo, brand colour, shop phone and the paper sizes customers can pick in <b>Settings</b>. Changes show on your order page right away.</p>`,
      action: isSampleShop(shop) ? '' : html`<a class="btn btn-secondary btn-sm" href="/shop/settings">${icon('settings')}<span>Open settings</span></a>`,
    },
  ];
  return html`<section class="card sup-help" aria-labelledby="sup-help-title">
    <div class="card-head"><h2 id="sup-help-title">Quick answers</h2></div>
    <div class="sup-faq">
      ${items.map(
        (it) => html`<details class="sup-faq-item">
          <summary><span class="sup-faq-ic">${sicon(it.ic)}</span><span class="sup-faq-title">${it.title}</span><span class="sup-faq-chev">${sicon('chevron')}</span></summary>
          <div class="sup-faq-body">${it.text}${it.action ? html`<div class="sup-faq-action">${it.action}</div>` : ''}</div>
        </details>`
      )}
    </div>
  </section>`;
}

function contactCard() {
  return html`<section class="card sup-contact" aria-labelledby="sup-contact-title">
    <div class="sup-contact-head">
      <span class="sup-contact-ic">${sicon('lifebuoy')}</span>
      <div>
        <h2 id="sup-contact-title">Prefer to chat?</h2>
        <p>Message Brighton Solution directly. For anything about an order or your account, a ticket keeps everything in one place.</p>
      </div>
    </div>
    <div class="sup-contact-actions">
      <a class="btn btn-secondary btn-block" href="${DM_URL}" target="_blank" rel="noopener">${sicon('instagram')}<span>Instagram @${config.instagram}</span></a>
      ${config.supportWhatsapp
        ? html`<a class="btn btn-wa btn-block" href="${waLink(config.supportWhatsapp, 'Hi Brighton Solution, I need help with PrintDesk.')}" target="_blank" rel="noopener">${icon('whatsapp')}<span>WhatsApp us</span></a>`
        : ''}
    </div>
  </section>`;
}

// ---------- ticket list + form ----------
function ticketList(tickets) {
  return html`<section class="card sup-list-card" aria-labelledby="sup-list-title">
    <div class="card-head"><h2 id="sup-list-title">Your tickets</h2><span class="count">${tickets.length}</span></div>
    <ul class="sup-tickets">
      ${tickets.map(
        (t) => html`<li class="sup-tk${t.shop_unread ? ' is-unread' : ''}">
          <span class="sup-tk-ic">${sicon(t.status === 'closed' ? 'solved' : 'chat')}</span>
          <div class="sup-tk-main">
            <a class="sup-tk-subject sup-stretch" href="/shop/support/${t.id}">${t.subject}</a>
            <span class="sup-tk-meta">${ticketRef(t.id)} · ${categoryLabel(t.category)} · ${timeAgo(t.updated_at)}</span>
          </div>
          <div class="sup-tk-side">
            ${ticketPill(t.status)}
            ${t.shop_unread ? html`<span class="sup-new">New reply</span>` : ''}
          </div>
        </li>`
      )}
    </ul>
  </section>`;
}

function ticketForm(res, { values, errors }) {
  const cat = TICKET_CATEGORIES.some((c) => c.key === values.category) ? values.category : 'general';
  const hasErrors = Object.keys(errors).length > 0;
  return html`<section class="card sup-form-card" id="new-ticket" aria-labelledby="sup-form-title">
    <div class="card-head"><h2 id="sup-form-title">Raise a ticket</h2></div>
    <form class="card-body" method="post" action="/shop/support" novalidate>
      ${csrfField(res)}
      ${hasErrors ? html`<div class="sup-form-alert">${alert('danger', 'Please fix the highlighted fields.')}</div>` : ''}
      ${field({
        label: 'What is it about?',
        id: 'category',
        control: html`<select id="category" name="category">
          ${TICKET_CATEGORIES.map((c) => html`<option value="${c.key}"${c.key === cat ? raw(' selected') : ''}>${c.label}</option>`)}
        </select>`,
      })}
      ${field({
        label: 'Subject',
        id: 'subject',
        error: errors.subject,
        control: html`<input type="text" id="subject" name="subject" value="${values.subject}" minlength="${LIMITS.subjectMin}" maxlength="${LIMITS.subjectMax}" required autocomplete="off" placeholder="e.g. PDF upload not working"${describedBy('subject', errors.subject)}${invalid(errors.subject)}>`,
      })}
      ${field({
        label: 'Message',
        id: 'message',
        error: errors.message,
        hint: 'Tell us what happened and the order number if there is one. Screenshots can be sent on Instagram.',
        control: html`<textarea id="message" name="message" rows="5" minlength="${LIMITS.messageMin}" maxlength="${LIMITS.messageMax}" required data-autogrow data-counter="${LIMITS.messageMax}"${describedBy('message', errors.message, true)}${invalid(errors.message)}>${values.message}</textarea>`,
      })}
      <div class="sup-form-foot">
        <button type="submit" class="btn btn-primary" data-loading="Sending…">${sicon('send')}<span>Send ticket</span></button>
        <span class="hint">You get our reply here and in your notifications.</span>
      </div>
    </form>
  </section>`;
}

function sampleNotice() {
  return html`<section class="card sup-sample" id="new-ticket" aria-labelledby="sup-sample-title">
    <span class="sup-sample-ic">${sicon('chat')}</span>
    <div>
      <h2 id="sup-sample-title">Tickets are available in your own shop</h2>
      <p>This is the shared sample shop, so tickets are switched off here. Create your free demo shop in a minute and try support, notifications and your own order link.</p>
      <a class="btn btn-primary" href="/demo/register">${icon('sparkle')}<span>Create my free demo shop</span></a>
    </div>
  </section>`;
}

export function supportView(res, { shop, tickets, values, errors = {}, sample, formFirst }) {
  const form = sample ? sampleNotice() : ticketForm(res, { values, errors });
  const list = tickets.length ? ticketList(tickets) : '';
  return {
    title: 'Help & support',
    variant: 'shop',
    active: 'support',
    scripts: ['/js/shop.js', '/js/support.js'],
    body: html`<div class="container sup-page">
      <header class="sup-hero">
        <div class="sup-hero-text">
          <span class="eyebrow">Help &amp; support</span>
          <h1>How can we help?</h1>
          <p class="sup-online"><span class="sup-online-dot" aria-hidden="true"></span>We usually reply within a few hours.</p>
        </div>
        ${sample || formFirst ? '' : html`<a class="btn btn-primary sup-hero-btn" href="#new-ticket">${icon('plus')}<span>New ticket</span></a>`}
      </header>
      <div class="sup-layout">
        <div class="sup-main">
          ${formFirst ? html`<div class="sup-o-form">${form}</div><div class="sup-o-list">${list}</div>` : html`<div class="sup-o-list">${list}</div><div class="sup-o-form">${form}</div>`}
        </div>
        <aside class="sup-side">
          <div class="sup-o-help">${quickHelp(shop)}</div>
          <div class="sup-o-contact">${contactCard()}</div>
        </aside>
      </div>
    </div>`,
  };
}

// ---------- one ticket ----------
function statusNote(ticket) {
  if (ticket.status === 'closed') return html`<p class="sup-state sup-state-closed">${sicon('solved')}<span><b>This ticket is solved.</b> Need more help? Write below and it opens again.</span></p>`;
  if (ticket.status === 'answered' || ticket.last_author === 'admin') return html`<p class="sup-state sup-state-answered">${sicon('chat')}<span><b>Brighton Solution replied.</b> Reply if you need more help, or mark it as solved.</span></p>`;
  return html`<p class="sup-state sup-state-open">${icon('clock')}<span><b>We have your message.</b> We usually reply within a few hours – you will get a notification.</span></p>`;
}

export function ticketView(res, { shop, ticket, messages, reply = '', error = '', sample }) {
  const closed = ticket.status === 'closed';
  return {
    title: ticket.subject,
    variant: 'shop',
    active: 'support',
    scripts: ['/js/shop.js', '/js/support.js'],
    body: html`<div class="container-mid sup-page">
      <a class="sup-back" href="/shop/support">${icon('arrowLeft')}<span>All tickets</span></a>
      <header class="sup-ticket-head">
        <h1>${ticket.subject}</h1>
        <p class="sup-ticket-meta">${ticketPill(ticket.status)}<span>${ticketRef(ticket.id)}</span><span>${categoryLabel(ticket.category)}</span><span>Opened ${formatDate(ticket.created_at)}</span></p>
      </header>
      <section class="card sup-convo" aria-label="Conversation">
        ${thread(messages, { viewer: 'shop', shop })}
        ${statusNote(ticket)}
        ${sample
          ? ''
          : html`<form class="sup-composer${error ? ' has-error' : ''}" method="post" action="/shop/support/${ticket.id}/reply" novalidate>
              ${csrfField(res)}
              <label for="reply" class="sr-only">${closed ? 'Write a message to reopen this ticket' : 'Your reply'}</label>
              <textarea id="reply" name="body" rows="3" maxlength="${LIMITS.replyMax}" required placeholder="${closed ? 'Write a message to reopen this ticket…' : 'Write a reply…'}" data-autogrow data-counter="${LIMITS.replyMax}"${error ? raw(' aria-invalid="true" aria-describedby="reply-error"') : ''}>${reply}</textarea>
              ${error ? html`<p class="field-error" id="reply-error">${error}</p>` : ''}
              <div class="sup-composer-foot">
                <span class="hint">${closed ? 'Sending a message reopens the ticket.' : 'Brighton Solution gets your reply right away.'}</span>
                <button type="submit" class="btn btn-primary" data-loading="Sending…">${sicon('send')}<span>${closed ? 'Reopen & send' : 'Send reply'}</span></button>
              </div>
            </form>`}
      </section>
      ${!closed && !sample
        ? html`<form class="sup-solve" method="post" action="/shop/support/${ticket.id}/close">
            ${csrfField(res)}
            <span>Problem fixed?</span>
            <button type="submit" class="btn btn-ghost btn-sm">${sicon('solved')}<span>Mark as solved</span></button>
          </form>`
        : ''}
    </div>`,
  };
}

// ---------- notifications ----------
export function notificationsView(res, { items, unread }) {
  const groups = groupBy(items, (n) => (isToday(n.created_at) ? 'Today' : 'Earlier'));
  return {
    title: 'Notifications',
    variant: 'shop',
    active: 'notifications',
    scripts: ['/js/shop.js'],
    body: html`<div class="container-mid sup-page">
      <header class="sup-hero sup-hero-sm">
        <div class="sup-hero-text">
          <h1>Notifications</h1>
          <p class="muted">${unread ? `${unread} new` : 'You are all caught up.'}</p>
        </div>
        ${unread
          ? html`<form method="post" action="/shop/notifications/read">${csrfField(res)}<button type="submit" class="btn btn-secondary btn-sm">${icon('check')}<span>Mark all as read</span></button></form>`
          : ''}
      </header>
      ${items.length
        ? html`<div class="sup-note-groups">${notificationGroups(groups)}</div>`
        : html`<div class="card">${emptyState({
            title: 'No notifications yet',
            text: 'Payment receipts, replies from support, plan reminders and news from Brighton Solution will show up here.',
            action: html`<a class="btn btn-secondary" href="/shop/support">${sicon('chat')}<span>Help &amp; support</span></a>`,
          })}</div>`}
    </div>`,
  };
}

