import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { PLAN_LABEL } from '../../lib/status.js';
import { DEFAULT_SIZES } from '../../services/shops.js';
import { CYCLES, daysLeft, getPlan, isSampleShop } from '../../services/billing.js';
import { orderFormUrl, shopPath } from '../../services/notify.js';
import { formatDate, isHexColor, prettyPhone } from '../../lib/util.js';
import { alert, csrfField, field, icon, withCsrf } from '../components.js';
import { shopIcon } from '../chrome/shop.js';

// /shop/settings – "Account": my shop (name, logo, colour, contact), order options,
// my plan (one compact line), password and log out.

// Quick colour picks (CSS classes .set-sw-<n> paint them, CSP forbids inline styles).
const SWATCHES = [
  ['#1a5d40', 'Brighton green'],
  ['#0f766e', 'Teal'],
  ['#1d4ed8', 'Blue'],
  ['#e11d48', 'Red'],
  ['#f97316', 'Orange'],
  ['#16a34a', 'Green'],
  ['#7c3aed', 'Purple'],
  ['#0b1220', 'Ink black'],
];

/** aria-describedby for hint + error ids (only those rendered). */
const describedBy = (id, hint, error) => {
  const ids = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return ids ? raw(` aria-describedby="${ids}"`) : '';
};
const invalid = (error) => (error ? raw(' aria-invalid="true"') : '');

/** One titled part of the settings form. */
const section = (num, title, text, body) => html`<fieldset class="set-section">
  <legend class="set-section-title"><span class="set-section-num" aria-hidden="true">${num}</span>${title}</legend>
  ${text ? html`<p class="set-section-text">${text}</p>` : ''}
  ${body}
</fieldset>`;

function preview(shop, values) {
  const color = isHexColor(values.brand_color) ? values.brand_color : '#1a5d40';
  const firstLine = String(values.address || '').split('\n')[0];
  const initial = (values.name || shop.name || '?').trim().charAt(0).toUpperCase() || '?';
  return html`<figure class="set-preview-wrap">
    <div class="set-preview" data-brand-preview data-color="${color}" aria-hidden="true">
      <div class="set-preview-head">
        ${shop.logo_file
          ? html`<img class="set-preview-logo" data-preview-logo src="/logo/${shop.slug}?v=${shop.logo_file.slice(0, 8)}" alt="" width="40" height="40">`
          : html`<img class="set-preview-logo" data-preview-logo alt="" width="40" height="40" hidden>`}
        <span class="set-preview-initial" data-preview-initial${shop.logo_file ? raw(' hidden') : ''}>${initial}</span>
        <span class="set-preview-text">
          <b data-preview-name>${values.name || shop.name}</b>
          <small data-preview-address${firstLine ? '' : raw(' hidden')}>${firstLine}</small>
        </span>
      </div>
      <div class="set-preview-body">
        <span class="set-preview-line"></span>
        <span class="set-preview-line is-short"></span>
        <span class="set-preview-drop">${icon('upload')}<span>Upload your files</span></span>
        <span class="set-preview-btn">Send order</span>
      </div>
    </div>
    <figcaption class="hint">What customers see on your order page</figcaption>
  </figure>`;
}

function logoField(res, shop, error) {
  return html`<div class="field${error ? ' has-error' : ''}">
    <span class="label">Logo <span class="optional">optional</span></span>
    <div class="set-logo-row">
      <div class="set-logo-thumb">
        ${shop.logo_file
          ? html`<img src="/logo/${shop.slug}?v=${shop.logo_file.slice(0, 8)}" alt="Current logo" width="64" height="64" data-logo-thumb>`
          : html`<span class="set-logo-empty" data-logo-thumb-empty>${shopIcon('image')}</span><img alt="" width="64" height="64" data-logo-thumb hidden>`}
      </div>
      <div class="set-logo-actions">
        <div class="btn-row">
          <input type="file" id="logo" name="logo" class="set-file-input" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" data-max-bytes="${config.limits.logoBytes}" aria-describedby="logo-hint${error ? ' logo-error' : ''}">
          <label for="logo" class="btn btn-secondary btn-sm set-file-btn">${icon('upload')}<span>${shop.logo_file ? 'Change logo' : 'Upload logo'}</span></label>
          ${shop.logo_file
            ? html`<button type="submit" form="set-logo-remove" class="btn btn-ghost btn-sm" data-confirm="Remove your logo? Your order page will show your shop initial instead.">${icon('x')}<span>Remove</span></button>`
            : ''}
        </div>
        <p class="set-file-name" data-logo-name hidden></p>
        <p class="hint" id="logo-hint">PNG, JPG or WebP, up to 2 MB. Square works best.</p>
        ${error ? html`<p class="field-error" id="logo-error" data-logo-error>${error}</p>` : html`<p class="field-error" data-logo-error hidden></p>`}
      </div>
    </div>
  </div>`;
}

function colorField(values, error) {
  const color = isHexColor(values.brand_color) ? values.brand_color : '#1a5d40';
  return html`<div class="field${error ? ' has-error' : ''}">
    <label for="brand_color">Colour</label>
    <div class="set-swatches" role="group" aria-label="Suggested colours">
      ${SWATCHES.map(([hex, name], i) => html`<button type="button" class="set-swatch set-sw-${i}" data-swatch="${hex}" aria-label="${name} ${hex}" title="${name}"></button>`)}
    </div>
    <div class="set-color-row">
      <input type="color" id="brand_color_picker" value="${color}" aria-label="Pick any colour" data-color-picker>
      <input type="text" id="brand_color" name="brand_color" class="set-hex" value="${values.brand_color}" maxlength="7" autocomplete="off" autocapitalize="off" spellcheck="false" required data-color-text${describedBy('brand_color', true, error)}${invalid(error)}>
    </div>
    <p class="hint" id="brand_color-hint">Top bar and buttons on your order page.</p>
    ${error ? html`<p class="field-error" id="brand_color-error">${error}</p>` : ''}
  </div>`;
}

function shopForm(res, shop, values, errors, demo) {
  const sizeCount = String(values.size_options || '').split('\n').filter((l) => l.trim()).length;
  return html`<section class="card set-profile" aria-labelledby="set-profile-title">
    <div class="set-card-head">
      <div>
        <h2 id="set-profile-title">My shop</h2>
        <p>Customers see this when they open your order link.</p>
      </div>
      <a class="btn btn-secondary btn-sm" href="${orderFormUrl(shop)}" target="_blank" rel="noopener" aria-label="See my order page (opens in a new tab)">${icon('eye')}<span class="hide-xs">See my page</span></a>
    </div>
    <form class="set-form" method="post" action="${withCsrf('/shop/settings', res)}" enctype="multipart/form-data" novalidate data-settings-form>
      ${Object.keys(errors).length ? alert('danger', 'Please fix the fields marked in red. Nothing was saved yet.') : ''}

      ${section(1, 'Name, logo & colour', '', html`<div class="set-brand-grid">
        <div class="set-brand-fields">
          ${field({
            label: 'Shop name',
            id: 'name',
            error: errors.name,
            hint: 'Shown on your order page and in WhatsApp messages.',
            control: html`<input type="text" id="name" name="name" value="${values.name}" maxlength="80" required autocomplete="organization" data-preview-source="name"${describedBy('name', true, errors.name)}${invalid(errors.name)}>`,
          })}
          ${logoField(res, shop, errors.logo)}
          ${colorField(values, errors.brand_color)}
        </div>
        ${preview(shop, values)}
      </div>`)}

      ${section(2, 'Phone & address', 'Customers can call you, and see where to pick up.', html`
        ${field({
          label: 'Shop phone',
          id: 'phone',
          optional: true,
          error: errors.phone,
          hint: 'Adds a “Call shop” button for customers.',
          control: html`<input type="tel" id="phone" name="phone" value="${values.phone}" maxlength="24" inputmode="tel" autocomplete="tel" placeholder="98765 43210"${describedBy('phone', true, errors.phone)}${invalid(errors.phone)}>`,
        })}
        ${field({
          label: 'Address',
          id: 'address',
          optional: true,
          error: errors.address,
          hint: 'Two or three short lines. The first line shows under your shop name.',
          control: html`<textarea id="address" name="address" rows="3" maxlength="300" autocomplete="street-address" data-preview-source="address"${describedBy('address', true, errors.address)}${invalid(errors.address)}>${values.address}</textarea>`,
        })}`)}

      ${section(3, 'Order options', 'What customers can pick, and how long files are kept.', html`
        ${field({
          label: 'Paper sizes customers can pick',
          id: 'size_options',
          error: errors.size_options,
          hint: html`One per line (<span data-size-count>${sizeCount}</span> of 30). Empty = ${DEFAULT_SIZES.join(', ')}.`,
          control: html`<textarea id="size_options" name="size_options" rows="7" class="set-sizes" spellcheck="false" data-size-input${describedBy('size_options', true, errors.size_options)}${invalid(errors.size_options)}>${values.size_options}</textarea>`,
        })}
        ${field({
          label: 'Delete files after',
          id: 'retention_days',
          error: errors.retention_days,
          hint: 'Files are removed automatically to save space. Order details stay.',
          control: html`<div class="input-group set-days">
            <input type="number" id="retention_days" name="retention_days" value="${values.retention_days}" min="1" max="90" step="1" inputmode="numeric" required${describedBy('retention_days', true, errors.retention_days)}${invalid(errors.retention_days)}>
            <span class="input-addon">days</span>
          </div>`,
        })}`)}

      <div class="set-save">
        <button type="submit" class="btn btn-primary btn-lg" data-loading="Saving…">${icon('check')}<span>Save changes</span></button>
        <span class="hint">${demo ? 'The sample demo shop cannot be changed.' : 'Shows on your order page right away.'}</span>
      </div>
    </form>
  </section>`;
}

/** "My plan" – one calm line; louder only when something needs doing. */
function planCard(shop, state) {
  const sample = isSampleShop(shop);
  const left = daysLeft(shop);
  const plan = shop.plan ? getPlan(shop.plan)?.name || PLAN_LABEL[shop.plan] : '';
  const cycle = shop.billing_cycle && CYCLES[shop.billing_cycle] ? ` · ${CYCLES[shop.billing_cycle]}` : '';
  const showDays = !sample && left != null && state !== 'pending' && state !== 'paused';
  // A demo counts today as a day (same as the Plan & payments page).
  const n = shop.is_demo && left != null && left >= 0 ? left + 1 : left;
  const days = !showDays || n < 0 ? '' : n === 0 || (shop.is_demo && n === 1) ? 'Last day today' : `${n} day${n === 1 ? '' : 's'} left`;

  let tone = 'ok';
  let ic = 'check';
  let title = html`${plan || 'Your'} plan<span class="muted">${cycle}</span>`;
  let line = shop.billing_cycle === 'lifetime' ? html`<b>Lifetime</b> – never expires` : shop.paid_until ? html`Active till <b>${formatDate(shop.paid_until)}</b>` : '';
  let cta = html`<a class="btn btn-secondary btn-sm" href="/shop/billing">${shopIcon('card')}<span>Plan &amp; payments</span></a>`;

  if (sample) {
    tone = 'info';
    ic = 'sparkle';
    title = html`Sample demo shop`;
    line = html`Everyone trying the demo shares this shop.`;
    cta = html`<a class="btn btn-primary btn-sm" href="/register">${icon('store')}<span>Register your shop</span></a>`;
  } else if (shop.is_demo) {
    tone = state === 'expired' ? 'danger' : 'info';
    ic = 'sparkle';
    title = html`Demo shop`;
    line = shop.paid_until ? html`Free demo till <b>${formatDate(shop.paid_until)}</b>` : '';
    cta = html`<a class="btn btn-primary btn-sm" href="/shop/billing">${icon('arrowRight')}<span>Go live</span></a>`;
  } else if (state === 'pending') {
    tone = 'warn';
    ic = 'clock';
    title = html`No plan yet`;
    line = html`Your order link opens after the first payment.`;
    cta = html`<a class="btn btn-primary btn-sm" href="/shop/billing">${shopIcon('card')}<span>Choose a plan</span></a>`;
  } else if (state === 'expired') {
    tone = 'danger';
    ic = 'alert';
    line = html`Ended on <b>${formatDate(shop.paid_until)}</b> – your order link is closed.`;
    cta = html`<a class="btn btn-primary btn-sm" href="/shop/billing">${icon('refresh')}<span>Renew now</span></a>`;
  } else if (state === 'paused') {
    tone = 'danger';
    ic = 'alert';
    line = html`Your account is paused. Please contact us.`;
    cta = html`<a class="btn btn-primary btn-sm" href="/shop/support?new=billing">${shopIcon('support')}<span>Contact us</span></a>`;
  } else if (left != null && left <= 7) {
    tone = 'warn';
    ic = 'clock';
    cta = html`<a class="btn btn-primary btn-sm" href="/shop/billing">${icon('refresh')}<span>Renew</span></a>`;
  }

  return html`<section class="card set-plan set-tone-${tone}" aria-labelledby="set-plan-title">
    <span class="set-plan-ic" aria-hidden="true">${icon(ic)}</span>
    <div class="set-plan-copy">
      <p class="set-plan-kicker">My plan</p>
      <h2 class="set-plan-title" id="set-plan-title">${title}</h2>
      ${line || days ? html`<p class="set-plan-line">${line}${line && days ? html`<span class="set-plan-sep" aria-hidden="true">·</span>` : ''}${days ? html`<span class="set-due${left <= 7 ? ' is-soon' : ''}">${days}</span>` : ''}</p>` : ''}
    </div>
    <div class="set-plan-cta">${cta}</div>
  </section>`;
}

function passwordCard(res, shop, pwErrors, demo) {
  const pw = (id, label, autocomplete, hint) =>
    field({
      label,
      id,
      hint,
      error: pwErrors[id],
      control: html`<input type="password" id="${id}" name="${id}" autocomplete="${autocomplete}" maxlength="${id === 'current_password' ? 200 : 72}" required${id === 'current_password' ? '' : raw(' minlength="8"')}${describedBy(id, hint, pwErrors[id])}${invalid(pwErrors[id])}>`,
    });
  const open = Object.keys(pwErrors).length > 0;
  return html`<details class="card fold set-password" id="password"${open ? raw(' open') : ''}>
    <summary>
      <span class="fold-ic">${icon('shield')}</span>
      <span class="fold-title"><b>Change password</b><small>Other phones get logged out.</small></span>
    </summary>
    <form class="fold-body" method="post" action="/shop/settings/password" novalidate>
      ${csrfField(res)}
      <input type="email" name="username" value="${shop.email}" autocomplete="username" hidden readonly>
      <fieldset class="set-fieldset"${demo ? raw(' disabled') : ''}>
        <legend class="sr-only">Change password</legend>
        ${pw('current_password', 'Current password', 'current-password', '')}
        ${pw('new_password', 'New password', 'new-password', 'At least 8 characters.')}
        ${pw('confirm_password', 'New password again', 'new-password', '')}
        <button type="submit" class="btn btn-dark btn-block" data-loading="Updating…">${icon('shield')}<span>Update password</span></button>
      </fieldset>
    </form>
  </details>`;
}

function loginCard(res, shop) {
  return html`<section class="card set-login" aria-labelledby="set-login-title">
    <h2 class="sr-only" id="set-login-title">Login</h2>
    <dl class="set-kv">
      <div><dt>Email</dt><dd>${shop.email}</dd></div>
      <div><dt>Mobile</dt><dd>${shop.mobile ? prettyPhone(shop.mobile) : '—'}</dd></div>
      <div><dt>Link</dt><dd><span class="mono">${shopPath(shop)}</span><small class="set-kv-note">Fixed. Need a new one? <a href="/shop/support">Ask us</a>.</small></dd></div>
    </dl>
    <form method="post" action="/logout" class="set-logout">${csrfField(res)}<button type="submit" class="btn btn-outline btn-block">${icon('logout')}<span>Log out</span></button></form>
  </section>`;
}

export function settingsView(res, { shop, state, values, errors = {}, pwErrors = {} }) {
  // Only the shared sample shop is read-only; a personal demo shop can be set up like a real one.
  const demo = isSampleShop(shop);
  return {
    title: 'Account',
    variant: 'shop',
    active: 'settings',
    brandShop: shop,
    scripts: ['/js/shop.js', '/js/settings.js'],
    body: html`<div class="container set-page">
      <div class="page-head">
        <div>
          <h1>Account</h1>
          <p>Your shop details, plan and password.</p>
        </div>
      </div>
      ${demo
        ? html`<div class="alert alert-info set-demo-note">
            ${icon('info')}
            <span><b>This sample shop can't be changed.</b> Play with the colour and name preview – to save your own, <a href="/register">register your shop</a>.</span>
          </div>`
        : ''}
      <div class="set-split">
        <div class="set-main">${shopForm(res, shop, values, errors, demo)}</div>
        <div class="set-side">
          ${planCard(shop, state)}
          ${passwordCard(res, shop, pwErrors, demo)}
          ${loginCard(res, shop)}
        </div>
      </div>
      ${shop.logo_file ? html`<form id="set-logo-remove" method="post" action="/shop/settings/logo/remove" hidden>${csrfField(res)}</form>` : ''}
    </div>`,
  };
}
