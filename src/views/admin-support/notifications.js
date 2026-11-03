import { html } from '../../lib/html.js';
import { csrfField, emptyState, icon } from '../components.js';
import { dayLabel, groupBy, notificationGroups, sicon } from '../shop-support/common.js';
import { announcementForm } from './forms.js';

// Super admin: notifications (payments, new tickets, sign-ups, expiries) + announcement to all shops.

export function adminNotificationsView(res, { items, unread, recipients }) {
  const groups = groupBy(items, (n) => dayLabel(n.created_at));
  return {
    title: 'Notifications',
    variant: 'admin',
    active: 'notifications',
    scripts: ['/js/support.js'],
    body: html`<div class="container sup-page">
      <header class="sup-hero sup-hero-sm">
        <div class="sup-hero-text">
          <h1>Notifications</h1>
          <p class="muted">${unread ? `${unread} new` : 'You are all caught up.'}</p>
        </div>
        ${unread
          ? html`<form method="post" action="/admin/notifications/read">${csrfField(res)}<button type="submit" class="btn btn-secondary btn-sm">${icon('check')}<span>Mark all as read</span></button></form>`
          : ''}
      </header>
      <div class="sup-admin-layout sup-notes-layout">
        <div class="sup-note-groups">
          ${items.length
            ? notificationGroups(groups)
            : html`<div class="card">${emptyState({ title: 'No notifications yet', text: 'Payments, new tickets, new sign-ups and expired plans show up here.' })}</div>`}
        </div>
        <aside class="sup-admin-side">
          <details class="card sup-announce" data-open-wide>
            <summary class="card-head"><h2 id="sup-announce-title">${sicon('megaphone')}<span>Send announcement to all shops</span></h2><span class="sup-faq-chev">${sicon('chevron')}</span></summary>
            <div class="card-body">
              <p class="hint sup-announce-lead">Goes to the bell and dashboard of every live shop. Use it for new features, planned downtime or offers.</p>
              ${announcementForm(res, recipients)}
            </div>
          </details>
        </aside>
      </div>
    </div>`,
  };
}
