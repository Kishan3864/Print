import { html } from '../../lib/html.js';
import { formatDate, formatTime, timeAgo } from '../../lib/util.js';
import { csrfField, emptyState, icon } from '../components.js';
import { dayLabel, groupBy, kindOf, safeLocalLink, sicon } from '../shop-support/common.js';
import { annTabs } from './announcements.js';

// Super admin: notifications (payments, new tickets, sign-ups, expiries) + a shortcut to announcements.

/** Side card: what announcements do, the last one sent and how many shops read it. */
function announceCard(last, reachAll) {
  return html`<section class="card ann-promo" id="announce" aria-labelledby="ann-promo-h">
    <div class="ann-promo-head">
      <span class="ann-promo-ic" aria-hidden="true">${sicon('megaphone')}</span>
      <div>
        <h2 id="ann-promo-h">Announcements</h2>
        <p>One message to every shop (${reachAll} now), a group, or one shop. Important ones also show as a banner in their app.</p>
      </div>
    </div>
    ${last
      ? html`<a class="ann-promo-last" href="/admin/announcements#sent">
          <span class="ann-promo-k">Last sent · ${timeAgo(last.created_at)}</span>
          <b>${last.title}</b>
          <span class="ann-promo-k">${Math.min(last.read_count, last.reached)} of ${last.reached} shop${last.reached === 1 ? '' : 's'} read it</span>
        </a>`
      : ''}
    <a class="btn btn-primary btn-block" href="/admin/announcements">${sicon('megaphone')}<span>New announcement</span></a>
  </section>`;
}

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

export function adminNotificationsView(res, { items, unread, reachAll, last }) {
  const groups = groupBy(items, (n) => dayLabel(n.created_at));
  return {
    title: 'Notifications',
    variant: 'admin',
    active: 'notifications',
    body: html`<div class="container adm">
      <div class="ann-head">
        <div>
          <p class="adm-kicker">${unread ? `${unread} new since you last looked` : 'You are all caught up'}</p>
          <h1>Notifications</h1>
        </div>
        <div class="ann-head-actions">
          ${unread
            ? html`<form method="post" action="/admin/notifications/read">${csrfField(res)}<button type="submit" class="btn btn-secondary btn-sm">${icon('check')}<span>Mark all as read</span></button></form>`
            : ''}
          ${annTabs('alerts')}
        </div>
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
        <aside class="adm-col" aria-label="Announcements">${announceCard(last, reachAll)}</aside>
      </div>
    </div>`,
  };
}
