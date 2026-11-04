import { html } from '../../lib/html.js';
import { formatDate, formatTime, timeAgo } from '../../lib/util.js';
import { csrfField, emptyState, icon } from '../components.js';
import { dayLabel, groupBy, kindOf, safeLocalLink, sicon } from '../shop-support/common.js';
import { announcementForm } from './forms.js';

// Super admin: notifications (payments, new tickets, sign-ups, expiries) + announcement to all shops.

function item(n) {
  const k = kindOf(n.kind);
  const unread = !n.read_at;
  const href = safeLocalLink(n.link);
  return html`<li class="adm-ntf${unread ? ' is-unread' : ''}">
    <span class="adm-ntf-ic adm-tone-${k.tone}" title="${k.label}">${sicon(k.ic)}</span>
    <div class="adm-ntf-main">
      <p class="adm-ntf-title">${href ? html`<a class="adm-stretch" href="${href}">${n.title}</a>` : n.title}${unread ? html`<span class="adm-new">New</span>` : ''}</p>
      ${n.body ? html`<p class="adm-ntf-body">${n.body}</p>` : ''}
      <p class="adm-ntf-time"><time datetime="${n.created_at}" title="${formatDate(n.created_at)} ${formatTime(n.created_at)}">${timeAgo(n.created_at)}</time></p>
    </div>
    ${href ? html`<span class="adm-ntf-go" aria-hidden="true">${sicon('chevron')}</span>` : ''}
  </li>`;
}

export function adminNotificationsView(res, { items, unread, recipients }) {
  const groups = groupBy(items, (n) => dayLabel(n.created_at));
  return {
    title: 'Notifications',
    variant: 'admin',
    active: 'notifications',
    scripts: ['/js/support.js'],
    body: html`<div class="container adm">
      <div class="adm-pagehead">
        <div>
          <p class="adm-kicker">${unread ? `${unread} new since you last looked` : 'You are all caught up'}</p>
          <h1>Notifications</h1>
        </div>
        ${unread
          ? html`<form method="post" action="/admin/notifications/read" class="adm-pagehead-actions">${csrfField(res)}<button type="submit" class="btn btn-secondary">${icon('check')}<span>Mark all as read</span></button></form>`
          : ''}
      </div>
      <div class="adm-split adm-split-notes">
        <div class="adm-col">
          ${items.length
            ? groups.map(
                (g) => html`<section class="adm-ntf-group" aria-label="${g.label}">
                  <h2 class="section-title">${g.label}</h2>
                  <ul class="card adm-ntfs">${g.items.map(item)}</ul>
                </section>`
              )
            : html`<div class="card">${emptyState({ title: 'No notifications yet', text: 'Payments, new tickets, new sign-ups and expired plans show up here.' })}</div>`}
        </div>
        <aside class="adm-col" aria-label="Announcement">
          <details class="card fold adm-fold" id="announce" data-open-wide>
            <summary><span class="fold-ic">${sicon('megaphone')}</span><span class="fold-title"><b>Announcement to all shops</b><small>${recipients ? `${recipients} live shop${recipients === 1 ? '' : 's'} will get it` : 'No live shops yet'}</small></span></summary>
            <div class="fold-body">
              <p class="hint adm-announce-lead">Shows in the bell and on the dashboard of every live shop. Use it for new features, planned downtime or offers.</p>
              ${announcementForm(res, recipients)}
            </div>
          </details>
        </aside>
      </div>
    </div>`,
  };
}
