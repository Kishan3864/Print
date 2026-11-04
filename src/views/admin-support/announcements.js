import { html, raw } from '../../lib/html.js';
import { formatDate, formatTime, timeAgo } from '../../lib/util.js';
import { csrfField, emptyState, icon } from '../components.js';
import { notificationItem, sicon } from '../shop-support/common.js';
import { announcementBannerMarkup } from '../announce.js';
import { AUDIENCES, audienceOf } from '../../services/announcements.js';
import { isSampleShop } from '../../services/billing.js';
import { shopState } from '../../services/shops.js';
import { NOTIFY_LIMITS, NOTIFY_LINKS } from './forms.js';

// /admin/announcements: write → check the preview → send; plus the list of sent announcements with
// how many shops have read each one. Prefix .ann- (public/css/announce.css).

const STATE_WORD = { active: 'active', pending: 'not paid yet', expired: 'plan ended', paused: 'paused' };
/** Message start for the sent list (full text in the title tooltip). */
const short = (text) => {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > 150 ? `${t.slice(0, 147).replace(/\s+\S*$/, '')}…` : t;
};
const shopsWord = (n) => `${n.toLocaleString('en-IN')} shop${n === 1 ? '' : 's'}`;

/** Alerts | Announcements switch shown on both admin pages. */
export function annTabs(active) {
  const tab = (key, href, label, ic) =>
    html`<a href="${href}" class="ann-tab${active === key ? ' is-on' : ''}"${active === key ? raw(' aria-current="page"') : ''}>${ic}<span>${label}</span></a>`;
  return html`<nav class="ann-tabs" aria-label="Notifications and announcements">
    ${tab('alerts', '/admin/notifications', 'Alerts', icon('bell'))}${tab('announce', '/admin/announcements', 'Announcements', sicon('megaphone'))}
  </nav>`;
}

const audienceText = (a) => (a.audience === 'shop' ? a.shop_name || 'One shop' : audienceOf(a.audience)?.label || a.audience);

function shopOptionLabel(s) {
  const bits = [s.name];
  if (s.city) bits.push(s.city);
  if (isSampleShop(s)) bits.push('shared sample demo');
  else if (s.is_demo) bits.push('demo');
  else bits.push(STATE_WORD[shopState(s)] || shopState(s));
  return bits.join(' · ');
}

const fieldError = (errors, key) => (errors[key] ? html`<p class="field-error" id="ann-${key}-err">${errors[key]}</p>` : '');
const describedBy = (errors, key) => (errors[key] ? raw(` aria-invalid="true" aria-describedby="ann-${key}-err"`) : '');

function composeForm(res, { values, errors, counts, shops }) {
  const reach = values.audience === 'shop' ? 1 : counts[values.audience] || 0;
  return html`<form class="card ann-compose" method="post" action="/admin/announcements/preview" novalidate data-ann-form>
    ${csrfField(res)}
    <input type="hidden" name="nonce" value="${values.nonce}">
    <fieldset class="ann-step${errors.audience ? ' has-error' : ''}">
      <legend class="ann-legend"><span class="ann-step-n">1</span>Who gets it?</legend>
      <div class="ann-auds">
        ${AUDIENCES.map((a) => {
          const n = a.key === 'shop' ? 1 : counts[a.key] || 0;
          const off = a.key !== 'shop' && n === 0;
          return html`<label class="ann-aud${off ? ' is-empty' : ''}">
            <input type="radio" name="audience" value="${a.key}" data-count="${a.key === 'shop' ? 1 : n}"${values.audience === a.key ? raw(' checked') : ''}${off ? raw(' disabled') : ''}>
            <span class="ann-aud-text"><b>${a.label}</b><small>${a.sub}</small></span>
            <span class="ann-aud-n" aria-label="${a.key === 'shop' ? 'one shop' : shopsWord(n)}">${a.key === 'shop' ? '1' : n}</span>
          </label>`;
        })}
      </div>
      <div class="field ann-pick${errors.shop_id ? ' has-error' : ''}">
        <label for="ann-shop">Shop <span class="optional">for “One shop”</span></label>
        <select id="ann-shop" name="shop_id" data-ann-shop${describedBy(errors, 'shop_id')}>
          <option value="">Choose a shop…</option>
          ${shops.map((s) => html`<option value="${String(s.id)}"${String(values.shop_id) === String(s.id) ? raw(' selected') : ''}>${shopOptionLabel(s)}</option>`)}
        </select>
        ${fieldError(errors, 'shop_id')}
      </div>
      ${fieldError(errors, 'audience')}
      <p class="hint">The shared sample demo shop only gets a message when you pick it as the one shop.</p>
    </fieldset>

    <fieldset class="ann-step">
      <legend class="ann-legend"><span class="ann-step-n">2</span>What do you want to say?</legend>
      <div class="field${errors.title ? ' has-error' : ''}">
        <label for="ann-title">Title</label>
        <input type="text" id="ann-title" name="title" value="${values.title}" minlength="${NOTIFY_LIMITS.titleMin}" maxlength="${NOTIFY_LIMITS.titleMax}" required autocomplete="off" placeholder="e.g. New: WhatsApp alerts for every order"${describedBy(errors, 'title')}>
        ${fieldError(errors, 'title')}
      </div>
      <div class="field${errors.body ? ' has-error' : ''}">
        <label for="ann-body">Message <span class="optional">optional</span></label>
        <textarea id="ann-body" name="body" rows="4" maxlength="${NOTIFY_LIMITS.bodyMax}" data-autogrow data-counter="${NOTIFY_LIMITS.bodyMax}" placeholder="A short, clear message. Shops read it on their phone."${describedBy(errors, 'body')}>${values.body}</textarea>
        ${fieldError(errors, 'body')}
      </div>
      <div class="field${errors.link ? ' has-error' : ''}">
        <label for="ann-link">Button opens <span class="optional">optional</span></label>
        <select id="ann-link" name="link"${describedBy(errors, 'link')}>${NOTIFY_LINKS.map(([v, l]) => html`<option value="${v}"${values.link === v ? raw(' selected') : ''}>${l}</option>`)}</select>
        ${fieldError(errors, 'link')}
      </div>
      <label class="ann-imp" for="ann-important">
        <input type="checkbox" id="ann-important" name="important" value="1"${values.important ? raw(' checked') : ''}>
        <span><b>Important</b><small>Also shows as a banner on every page of their app until they tap “Got it”.</small></span>
      </label>
    </fieldset>

    <div class="ann-foot">
      <p class="ann-reach" aria-live="polite">Will reach <b data-ann-reach>${reach}</b> <span data-ann-unit>${reach === 1 ? 'shop' : 'shops'}</span></p>
      <button type="submit" class="btn btn-primary btn-lg">${icon('eye')}<span>Preview before sending</span></button>
    </div>
  </form>`;
}

function historyItem(a) {
  const reached = Number(a.reached) || 0;
  const read = Math.min(Number(a.read_count) || 0, reached);
  const pct = reached ? Math.round((read / reached) * 100) : 0;
  return html`<li class="ann-item${a.important ? ' is-important' : ''}">
    <span class="ann-item-ic" aria-hidden="true">${sicon('megaphone')}</span>
    <div class="ann-item-main">
      <p class="ann-item-title">${a.title}${a.important ? html`<span class="ann-tag">Important</span>` : ''}</p>
      <p class="ann-item-meta"><span>To <b>${audienceText(a)}</b></span><span aria-hidden="true">·</span><time datetime="${a.created_at}" title="${formatDate(a.created_at)} ${formatTime(a.created_at)}">${timeAgo(a.created_at)}</time></p>
      ${a.body ? html`<p class="ann-item-body" title="${a.body}">${short(a.body)}</p>` : ''}
    </div>
    <div class="ann-item-stats">
      <p class="ann-item-read"><b>${read}</b> of ${reached} read</p>
      <progress class="ann-bar" max="${reached || 1}" value="${read}" aria-hidden="true">${pct}%</progress>
      <p class="ann-item-pct">${reached ? `${pct}%` : 'not delivered'}</p>
    </div>
  </li>`;
}

export function historyList(items) {
  return items.length
    ? html`<ul class="card ann-list">${items.map(historyItem)}</ul>`
    : html`<div class="card">${emptyState({ title: 'Nothing sent yet', text: 'Announcements you send show up here with how many shops have read them.' })}</div>`;
}

export function announcementsView(res, { values, errors = {}, counts, shops, history }) {
  const errorList = Object.values(errors);
  return {
    title: 'Announcements',
    variant: 'admin',
    active: 'notifications',
    scripts: ['/js/support.js', '/js/announce.js'],
    body: html`<div class="container adm ann-page">
      <div class="ann-head">
        <div>
          <p class="adm-kicker">One message to every shop, a group, or one shop</p>
          <h1>Announcements</h1>
        </div>
        ${annTabs('announce')}
      </div>
      ${errorList.length ? html`<div class="alert alert-danger ann-errors" role="alert">${icon('alert')}<span>Please fix: ${errorList.join(' ')}</span></div>` : ''}
      <div class="ann-layout">
        ${composeForm(res, { values, errors, counts, shops })}
        <section class="ann-sent" id="sent" aria-labelledby="ann-sent-h">
          <div class="ann-sent-head"><h2 id="ann-sent-h">Sent</h2><span class="hint">Newest first · read = opened in Alerts or tapped “Got it”</span></div>
          ${historyList(history)}
        </section>
      </div>
    </div>`,
  };
}

/** Step 2: exactly what the shops will see, who gets it, then Send (or go back and change). */
export function announcementPreviewView(res, { values, recipients, label }) {
  const n = recipients.length;
  const note = { id: 0, kind: values.important ? 'warn' : 'announcement', title: values.title, body: values.body, link: values.link, created_at: new Date().toISOString(), read_at: null };
  const shown = recipients.slice(0, 14);
  const hidden = (k, v) => html`<input type="hidden" name="${k}" value="${v}">`;
  return {
    title: 'Check announcement',
    variant: 'admin',
    active: 'notifications',
    body: html`<div class="container adm ann-page">
      <div class="ann-head">
        <div>
          <p class="adm-kicker">Step 2 of 2 · nothing is sent yet</p>
          <h1>Check before sending</h1>
        </div>
      </div>
      <div class="ann-layout ann-layout-check">
        <section class="card ann-check" aria-label="Preview">
          <h2 class="ann-check-h">How shops will see it</h2>
          <p class="ann-check-label">${icon('bell')}<span>In <b>Alerts</b>, with a red badge on the bell and a sound</span></p>
          <ul class="sup-notes card ann-mock">${notificationItem(note)}</ul>
          ${values.important
            ? html`<p class="ann-check-label">${sicon('megaphone')}<span>As a <b>banner on every page</b> until they tap “Got it”</span></p>
                <div class="ann-mock ann-mock-banner">${announcementBannerMarkup(note, { preview: true })}</div>`
            : html`<p class="hint ann-check-tip">Want it at the top of every page too? Go back and tick <b>Important</b>.</p>`}
        </section>
        <aside class="card ann-confirm" aria-label="Send">
          <dl class="ann-facts">
            <div><dt>To</dt><dd>${label}</dd></div>
            <div><dt>Shops</dt><dd><b class="ann-big">${n}</b></dd></div>
            <div><dt>Type</dt><dd>${values.important ? 'Important · alert + banner' : 'Alert'}</dd></div>
          </dl>
          ${n
            ? html`<ul class="ann-who" aria-label="Shops that get it">${shown.map((s) => html`<li>${s.name}</li>`)}${n > shown.length ? html`<li class="ann-who-more">+${n - shown.length} more</li>` : ''}</ul>`
            : html`<p class="alert alert-warn">${icon('alert')}<span>No shop is in this group right now.</span></p>`}
          <form method="post" action="/admin/announcements/send" class="ann-confirm-form">
            ${csrfField(res)}
            ${hidden('nonce', values.nonce)}${hidden('audience', values.audience)}${hidden('shop_id', values.shop_id)}
            ${hidden('title', values.title)}${hidden('body', values.body)}${hidden('link', values.link)}${values.important ? hidden('important', '1') : ''}
            <button type="submit" class="btn btn-primary btn-lg btn-block" data-loading="Sending…"${n ? '' : raw(' disabled')}>${sicon('send')}<span>Send to ${shopsWord(n)}</span></button>
            <button type="submit" class="btn btn-secondary btn-block" formaction="/admin/announcements/edit" formnovalidate>${icon('arrowLeft')}<span>Change something</span></button>
          </form>
        </aside>
      </div>
    </div>`,
  };
}
