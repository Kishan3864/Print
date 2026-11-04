import { html, raw } from '../../lib/html.js';
import { formatDate, formatTime, inkFor, isHexColor, timeAgo, ymd } from '../../lib/util.js';
import { TICKET_STATUS_LABEL } from '../../services/support.js';
import { icon, logoMark } from '../components.js';

// Shared pieces for Help & Support and notifications (shop and admin views).

// Extra icons used only here (same 24px stroke style as components.icon).
const EXTRA = {
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>',
  rupee: '<path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3M9 13c6.7 0 6.7-10 0-10"/>',
  megaphone: '<path d="M3 11l18-5v12L3 14z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  instagram: '<rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><path d="M17.5 6.5h.01"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  lifebuoy: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="4"/><path d="M5.3 5.3l3.9 3.9M14.8 14.8l3.9 3.9M14.8 9.2l3.9-3.9M5.3 18.7l3.9-3.9"/>',
  chevron: '<path d="M9 18l6-6-6-6"/>',
  solved: '<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="M22 4L12 14l-3-3"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
  proof: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M9 15l2 2 4-4"/>',
};

export function sicon(name, cls = '') {
  if (!EXTRA[name]) return icon(name, cls);
  return raw(
    `<svg class="icon${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${EXTRA[name]}</svg>`
  );
}

// ---------- tickets ----------
export const ticketPill = (status) => html`<span class="pill sup-st sup-st-${status}">${TICKET_STATUS_LABEL[status] || status}</span>`;

export const ticketRef = (id) => `#T${id}`;

/** Day label for a timestamp: Today / Yesterday / 3 Nov 2026. */
export function dayLabel(iso) {
  const d = ymd(new Date(iso));
  const today = ymd();
  if (d === today) return 'Today';
  if (d === ymd(new Date(Date.now() - 864e5))) return 'Yesterday';
  return formatDate(iso);
}

export const isToday = (iso) => ymd(new Date(iso)) === ymd();

/** Letter avatar on the shop's brand colour (SVG attributes, no inline styles). */
export function letterAvatar(name, color, size = 36) {
  const bg = isHexColor(color) ? color : '#1a5d40';
  const letter = (Array.from(String(name || '').trim())[0] || '?').toUpperCase();
  return html`<span class="sup-avatar" aria-hidden="true"><svg viewBox="0 0 40 40" width="${size}" height="${size}" focusable="false"><rect width="40" height="40" rx="20" fill="${bg}"/><text x="20" y="21" text-anchor="middle" dominant-baseline="middle" font-size="17" font-weight="800" fill="${inkFor(bg)}">${letter}</text></svg></span>`;
}

const brightonAvatar = () => html`<span class="sup-avatar sup-avatar-brand" aria-hidden="true">${logoMark(36)}</span>`;

/**
 * Chat-like thread. viewer 'shop' or 'admin': the viewer's own messages sit on the right.
 * The last message gets id="latest" so redirects can jump to it.
 */
export function thread(messages, { viewer, shop }) {
  let lastDay = '';
  let prev = null;
  return html`<ol class="sup-thread" aria-label="Conversation">
    ${messages.map((m, i) => {
      const mine = m.author === viewer;
      const day = dayLabel(m.created_at);
      const sep = day !== lastDay ? html`<li class="sup-day" aria-hidden="true"><span>${day}</span></li>` : '';
      // Messages from the same person within 10 minutes are grouped (no repeated name/avatar).
      const cont = !sep && prev && prev.author === m.author && Date.parse(m.created_at) - Date.parse(prev.created_at) < 10 * 60 * 1000;
      lastDay = day;
      prev = m;
      const who = mine ? 'You' : m.author === 'admin' ? 'Brighton Solution' : shop?.name || 'Shop';
      let avatar = '';
      if (!mine) avatar = cont ? html`<span class="sup-avatar-gap" aria-hidden="true"></span>` : m.author === 'admin' ? brightonAvatar() : letterAvatar(shop?.name, shop?.brand_color);
      const stamp = html`<time datetime="${m.created_at}" title="${formatDate(m.created_at)} ${formatTime(m.created_at)}">${formatTime(m.created_at)}</time>`;
      return html`${sep}<li class="sup-msg ${mine ? 'is-mine' : 'is-theirs'}${cont ? ' is-cont' : ''}"${i === messages.length - 1 ? raw(' id="latest"') : ''}>
        ${avatar}
        <div class="sup-msg-col">
          ${cont ? html`<span class="sr-only">${who}, ${stamp}</span>` : html`<div class="sup-msg-who"><b>${who}</b>${stamp}</div>`}
          <div class="sup-bubble">${m.body}</div>
        </div>
      </li>`;
    })}
  </ol>`;
}

// ---------- notifications ----------
const KIND = {
  order: { ic: 'orders', tone: 'orange', label: 'Order' },
  payment: { ic: 'rupee', tone: 'ok', label: 'Payment' },
  success: { ic: 'check', tone: 'ok', label: 'Done' },
  support: { ic: 'chat', tone: 'blue', label: 'Support' },
  warn: { ic: 'alert', tone: 'warn', label: 'Important' },
  announcement: { ic: 'megaphone', tone: 'blue', label: 'Announcement' },
  shop: { ic: 'store', tone: 'blue', label: 'Shop' },
  info: { ic: 'info', tone: 'muted', label: 'Update' },
};
export const kindOf = (kind) => KIND[kind] || KIND.info;

/** Only local, same-site paths are rendered as links. */
export const safeLocalLink = (link) => (typeof link === 'string' && /^\/(?!\/)[\w\-./?=&%#]*$/.test(link) && !link.includes('\\') ? link : '');

/** One notification row. `unread` highlights it (the page marks rows read after rendering). */
export function notificationItem(n) {
  const k = kindOf(n.kind);
  const unread = !n.read_at;
  const href = safeLocalLink(n.link);
  return html`<li class="sup-note sup-note-${k.tone}${unread ? ' is-unread' : ''}">
    <span class="sup-note-ic sup-tone-${k.tone}" title="${k.label}">${sicon(k.ic)}</span>
    <div class="sup-note-main">
      <p class="sup-note-title">${unread ? html`<span class="sup-new-dot"><span class="sr-only">New: </span></span>` : ''}${href ? html`<a class="sup-stretch" href="${href}">${n.title}</a>` : n.title}</p>
      ${n.body ? html`<p class="sup-note-body">${n.body}</p>` : ''}
      <p class="sup-note-time"><span class="sup-note-kind">${k.label}</span><span aria-hidden="true">·</span><time datetime="${n.created_at}" title="${formatDate(n.created_at)} ${formatTime(n.created_at)}">${timeAgo(n.created_at)}</time>${href ? html`<span class="sup-note-open">Open ${sicon('chevron')}</span>` : ''}</p>
    </div>
  </li>`;
}

/** Groups rows into [{ label, items }] by a key function, keeping order. */
export function groupBy(rows, keyFn) {
  const groups = [];
  for (const r of rows) {
    const label = keyFn(r);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(r);
    else groups.push({ label, items: [r] });
  }
  return groups;
}

export function notificationGroups(groups) {
  return groups.map(
    (g) => html`<section class="sup-note-group" aria-label="${g.label}">
      <h2 class="section-title">${g.label}</h2>
      <ul class="sup-notes card">${g.items.map(notificationItem)}</ul>
    </section>`
  );
}
