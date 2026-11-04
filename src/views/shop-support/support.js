import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { formatDate, timeAgo, waLink } from '../../lib/util.js';
import { TICKET_CATEGORIES, categoryLabel } from '../../services/support.js';
import { isSampleShop } from '../../services/billing.js';
import { alert, csrfField, emptyState, field, icon } from '../components.js';
import { groupBy, isToday, notificationGroups, sicon, thread, ticketPill, ticketRef } from './common.js';

// Shop owner: Help (quick answers + "Ask us" form + your questions), one question's
// conversation, and the Alerts (notifications) page.

export const LIMITS = { subjectMin: 3, subjectMax: 120, messageMin: 10, messageMax: 3000, replyMax: 3000 };

const DM_URL = `https://ig.me/m/${config.instagram}`;

const invalid = (error) => (error ? raw(' aria-invalid="true"') : '');
const describedBy = (id, error, hint = false) => {
  const ids = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return ids ? raw(` aria-describedby="${ids}"`) : '';
};

// ---------- quick answers ----------
function quickHelp(shop) {
  const items = [
    {
      ic: 'share',
      title: 'How do customers send me orders?',
      text: html`<ol class="sup-steps">
          <li>Open <b>Share link</b> and send your link on WhatsApp, or put it in your Instagram bio.</li>
          <li>Print the QR poster for your counter – customers scan it with their phone camera.</li>
          <li>They upload files and pick size and copies. The order shows up in <b>Orders</b> with its own number, and you hear an alert.</li>
        </ol>`,
      action: html`<a class="btn btn-secondary btn-sm" href="/shop/link">${icon('share')}<span>Open Share link</span></a>`,
    },
    {
      ic: 'bell',
      title: 'How will I know about new orders?',
      text: html`<ul class="sup-steps">
          <li>A red number on <b>Orders</b> shows how many orders wait for you.</li>
          <li><b>Alerts</b> lists every new order, every customer OK and every change request.</li>
          <li>Keep the Orders page open (or install the app from Share link) to hear a sound for each new order.</li>
        </ul>`,
      action: html`<a class="btn btn-secondary btn-sm" href="/shop/notifications">${icon('bell')}<span>Open Alerts</span></a>`,
    },
    {
      ic: 'proof',
      title: 'What is “Send preview for customer OK”?',
      text: html`<p class="sup-faq-lead">For design jobs (visiting cards, flex, invitations) – so you never print a mistake.</p>
        <ol class="sup-steps">
          <li>Open the order and upload the final design as a preview (JPG, PNG or PDF).</li>
          <li>Tap the WhatsApp button – the customer gets a link to see it.</li>
          <li>They tap <b>OK</b> or ask for changes. You see it in Orders right away, then print.</li>
        </ol>
        <p class="sup-faq-lead">Simple printouts? Skip it and tap <b>Start printing</b>.</p>`,
      action: html`<a class="btn btn-secondary btn-sm" href="/shop">${icon('orders')}<span>Go to Orders</span></a>`,
    },
    {
      ic: 'rupee',
      title: 'My plan, payments & renewal',
      text: html`<p>Open <b>Account → Plan &amp; payments</b> to see when your plan ends, renew monthly or yearly, and download receipts. We remind you 7, 3 and 1 days before it ends.</p>`,
      action: html`<a class="btn btn-secondary btn-sm" href="/shop/billing">${sicon('rupee')}<span>Plan &amp; payments</span></a>`,
    },
    {
      ic: 'settings',
      title: 'Logo, colour & paper sizes',
      text: html`<p>Add your logo, colour, shop phone and the paper sizes customers can pick in <b>Account</b>. Changes show on your order page right away.</p>`,
      action: isSampleShop(shop) ? '' : html`<a class="btn btn-secondary btn-sm" href="/shop/settings">${icon('user')}<span>Open Account</span></a>`,
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

/** Big tap targets at the top: write to us, WhatsApp, Instagram. */
function contactTiles(sample) {
  return html`<nav class="sup-tiles" aria-label="Ways to reach us">
    ${sample
      ? ''
      : html`<a class="sup-tile sup-tile-ask" href="#new-ticket"><span class="sup-tile-ic">${sicon('send')}</span><span class="sup-tile-text"><b>Ask a question</b><small>Reply here + in Alerts</small></span></a>`}
    ${config.supportWhatsapp
      ? html`<a class="sup-tile sup-tile-wa" href="${waLink(config.supportWhatsapp, 'Hi Brighton Solution, I need help with Brighton Print.')}" target="_blank" rel="noopener"><span class="sup-tile-ic">${icon('whatsapp')}</span><span class="sup-tile-text"><b>WhatsApp us</b><small>Quick chat</small></span></a>`
      : ''}
    <a class="sup-tile sup-tile-ig" href="${DM_URL}" target="_blank" rel="noopener"><span class="sup-tile-ic">${sicon('instagram')}</span><span class="sup-tile-text"><b>Instagram</b><small>@${config.instagram}</small></span></a>
  </nav>`;
}

// ---------- your questions + form ----------
function ticketList(tickets) {
  return html`<section class="card sup-list-card" aria-labelledby="sup-list-title">
    <div class="card-head"><h2 id="sup-list-title">Your questions</h2><span class="count">${tickets.length}</span></div>
    <ul class="sup-tickets">
      ${tickets.map(
        (t) => html`<li class="sup-tk${t.shop_unread ? ' is-unread' : ''}">
          <span class="sup-tk-ic">${sicon(t.status === 'closed' ? 'solved' : 'chat')}</span>
          <div class="sup-tk-main">
            <a class="sup-tk-subject sup-stretch" href="/shop/support/${t.id}">${t.subject}</a>
            <span class="sup-tk-meta">${ticketRef(t.id)} · ${categoryLabel(t.category)} · ${timeAgo(t.updated_at)}</span>
          </div>
          <div class="sup-tk-side">
            ${t.shop_unread ? html`<span class="sup-new">New reply</span>` : ticketPill(t.status)}
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
    <div class="card-head"><h2 id="sup-form-title">Ask us anything</h2></div>
    <form class="card-body" method="post" action="/shop/support" novalidate>
      ${csrfField(res)}
      ${hasErrors ? html`<div class="sup-form-alert">${alert('danger', 'Please fill the fields marked in red.')}</div>` : ''}
      ${field({
        label: 'About',
        id: 'category',
        control: html`<select id="category" name="category">
          ${TICKET_CATEGORIES.map((c) => html`<option value="${c.key}"${c.key === cat ? raw(' selected') : ''}>${c.label}</option>`)}
        </select>`,
      })}
      ${field({
        label: 'Short title',
        id: 'subject',
        error: errors.subject,
        control: html`<input type="text" id="subject" name="subject" value="${values.subject}" minlength="${LIMITS.subjectMin}" maxlength="${LIMITS.subjectMax}" required autocomplete="off" placeholder="e.g. PDF upload not working"${describedBy('subject', errors.subject)}${invalid(errors.subject)}>`,
      })}
      ${field({
        label: 'Your message',
        id: 'message',
        error: errors.message,
        hint: 'What happened? Add the order number (like P-1024) if there is one.',
        control: html`<textarea id="message" name="message" rows="5" minlength="${LIMITS.messageMin}" maxlength="${LIMITS.messageMax}" required data-autogrow data-counter="${LIMITS.messageMax}"${describedBy('message', errors.message, true)}${invalid(errors.message)}>${values.message}</textarea>`,
      })}
      <div class="sup-form-foot">
        <button type="submit" class="btn btn-primary btn-lg" data-loading="Sending…">${sicon('send')}<span>Send</span></button>
        <span class="hint">Our reply shows here and in Alerts.</span>
      </div>
    </form>
  </section>`;
}

function sampleNotice() {
  return html`<section class="card sup-sample" id="new-ticket" aria-labelledby="sup-sample-title">
    <span class="sup-sample-ic">${sicon('chat')}</span>
    <div>
      <h2 id="sup-sample-title">Questions work in your own shop</h2>
      <p>This is the shared sample shop, so writing to us is off here. Create your free shop in a minute to try it.</p>
      <a class="btn btn-primary" href="/register">${icon('sparkle')}<span>Register your shop</span></a>
    </div>
  </section>`;
}

export function supportView(res, { shop, tickets, values, errors = {}, sample }) {
  const form = sample ? sampleNotice() : ticketForm(res, { values, errors });
  const list = tickets.length ? ticketList(tickets) : '';
  // The form comes first when the owner arrived to write (e.g. "Message us" from billing) or must fix it.
  const formTop = Boolean(values.category) || Object.keys(errors).length > 0;
  return {
    title: 'Help',
    variant: 'shop',
    active: 'support',
    scripts: ['/js/shop.js', '/js/support.js'],
    body: html`<div class="container-mid sup-page">
      <header class="sup-hero">
        <div class="sup-hero-text">
          <h1>How can we help?</h1>
          <p class="sup-online"><span class="sup-online-dot" aria-hidden="true"></span>We usually reply within a few hours.</p>
        </div>
      </header>
      ${formTop ? '' : contactTiles(sample)}
      <div class="sup-stack">
        ${formTop ? form : ''}
        ${list}
        ${quickHelp(shop)}
        ${formTop ? '' : form}
      </div>
    </div>`,
  };
}

// ---------- one question ----------
function statusNote(ticket) {
  if (ticket.status === 'closed') return html`<p class="sup-state sup-state-closed">${sicon('solved')}<span><b>Solved.</b> Need more help? Write below and it opens again.</span></p>`;
  if (ticket.status === 'answered' || ticket.last_author === 'admin') return html`<p class="sup-state sup-state-answered">${sicon('chat')}<span><b>We replied.</b> Write back if you need more help, or mark it as solved.</span></p>`;
  return html`<p class="sup-state sup-state-open">${icon('clock')}<span><b>We have your message.</b> We usually reply within a few hours – you will get an alert.</span></p>`;
}

export function ticketView(res, { shop, ticket, messages, reply = '', error = '', sample }) {
  const closed = ticket.status === 'closed';
  return {
    title: ticket.subject,
    variant: 'shop',
    active: 'support',
    scripts: ['/js/shop.js', '/js/support.js'],
    body: html`<div class="container-mid sup-page">
      <a class="sup-back" href="/shop/support">${icon('arrowLeft')}<span>Help</span></a>
      <header class="sup-ticket-head">
        <h1>${ticket.subject}</h1>
        <p class="sup-ticket-meta">${ticketPill(ticket.status)}<span>${ticketRef(ticket.id)}</span><span>${categoryLabel(ticket.category)}</span><span>Sent ${formatDate(ticket.created_at)}</span></p>
      </header>
      <section class="card sup-convo" aria-label="Conversation">
        ${thread(messages, { viewer: 'shop', shop })}
        ${statusNote(ticket)}
        ${sample
          ? ''
          : html`<form class="sup-composer${error ? ' has-error' : ''}" method="post" action="/shop/support/${ticket.id}/reply" novalidate>
              ${csrfField(res)}
              <label for="reply" class="sr-only">${closed ? 'Write a message to open this again' : 'Your reply'}</label>
              <textarea id="reply" name="body" rows="3" maxlength="${LIMITS.replyMax}" required placeholder="${closed ? 'Write a message to open this again…' : 'Write a reply…'}" data-autogrow data-counter="${LIMITS.replyMax}"${error ? raw(' aria-invalid="true" aria-describedby="reply-error"') : ''}>${reply}</textarea>
              ${error ? html`<p class="field-error" id="reply-error">${error}</p>` : ''}
              <div class="sup-composer-foot">
                <span class="hint">${closed ? 'Sending opens it again.' : 'We get your reply right away.'}</span>
                <button type="submit" class="btn btn-primary" data-loading="Sending…">${sicon('send')}<span>${closed ? 'Open again & send' : 'Send reply'}</span></button>
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

// ---------- alerts (notifications) ----------
export function notificationsView(res, { items, unread }) {
  const groups = groupBy(items, (n) => (isToday(n.created_at) ? 'Today' : 'Earlier'));
  return {
    title: 'Alerts',
    variant: 'shop',
    active: 'notifications',
    scripts: ['/js/shop.js'],
    body: html`<div class="container-mid sup-page">
      <header class="sup-hero sup-hero-sm">
        <div class="sup-hero-text">
          <h1>Alerts</h1>
          <p class="sup-hero-sub">${unread ? html`<span class="badge">${unread}</span><span>new since you last looked</span>` : 'You are all caught up.'}</p>
        </div>
        ${unread
          ? html`<form method="post" action="/shop/notifications/read">${csrfField(res)}<button type="submit" class="btn btn-secondary btn-sm">${icon('check')}<span>Mark all as read</span></button></form>`
          : ''}
      </header>
      ${items.length
        ? html`<div class="sup-note-groups">${notificationGroups(groups)}</div>`
        : html`<div class="card">${emptyState({
            title: 'No alerts yet',
            text: 'New orders, customer OKs, change requests, payments and our replies show up here.',
            action: html`<a class="btn btn-secondary" href="/shop/link">${icon('share')}<span>Share your order link</span></a>`,
          })}</div>`}
    </div>`,
  };
}
