import { html } from '../../lib/html.js';
import { ALLOWED_EXT, ACCEPT_ATTR, fileLimits } from '../../lib/uploads.js';
import { sizeOptions } from '../../services/shops.js';
import { formatBytes } from '../../lib/util.js';
import { render } from '../layout.js';
import { alert, csrfField, field, icon, withCsrf } from '../components.js';
import { GLYPH, cmykDots, contactActions, ownerNote, shopAddress } from './common.js';

// Public, shop-branded order form (works without JS; /js/order-form.js adds
// the file list, client-side checks and the upload progress bar).

const TYPE_LIST = [...new Set(ALLOWED_EXT.map((e) => ({ jpeg: 'jpg', tiff: 'tif' })[e] || e))].map((e) => e.toUpperCase()).join(', ');

const sizeText = (bytes) => (bytes % (1024 * 1024) === 0 ? `${bytes / (1024 * 1024)} MB` : formatBytes(bytes));

/** aria-describedby / aria-invalid for a control rendered with field(). */
function describe(id, { hint = false, error = '' } = {}) {
  const ids = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return html`${ids ? html` aria-describedby="${ids}"` : ''}${error ? html` aria-invalid="true"` : ''}`;
}

const choice = (name, value, current, label) =>
  html`<label><input type="radio" name="${name}" value="${value}"${current === value ? html` checked` : ''}><span>${GLYPH[value]}${label}</span></label>`;

const MINUS = html`<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M5 12h14"/></svg>`;

/**
 * Order form page.
 * values: { name, mobile, email, size, quantity, color_mode, sides, notes } (kept after errors)
 * errors: { name, mobile, email, files, size, color_mode, sides, notes }
 */
export function orderFormPage(res, { shop, values = {}, errors = {}, owner = false }, status = 200) {
  const lim = fileLimits({ uploadShop: shop });
  const sizes = sizeOptions(shop);
  const v = { name: '', mobile: '', email: '', quantity: 1, color_mode: 'color', sides: 'single', notes: '', ...values };
  if (!sizes.includes(v.size)) v.size = sizes[0];
  const multi = lim.files > 1;
  const hasErrors = Object.keys(errors).length > 0;
  const limitText = multi
    ? `Up to ${lim.files} files, ${sizeText(lim.bytes)} each`
    : `1 file, up to ${sizeText(lim.bytes)}${shop.is_demo ? ' (demo limit)' : ''}`;

  const body = html`<div class="container-narrow cust-page">
    ${owner ? ownerNote('This is your customer order page – share this link with customers.', '/shop', 'Back to dashboard') : ''}

    <header class="cust-hero">
      <div class="cust-hero-top">
        <span class="cust-chip">${icon('upload')}Online order</span>
        ${cmykDots()}
      </div>
      <h1>Send your files to ${shop.name}</h1>
      <p class="lead">You'll get an order number instantly.</p>
      <ol class="cust-how" aria-label="How it works">
        <li><b>1</b><span>Upload your files</span></li>
        <li><b>2</b><span>Get your order number</span></li>
        <li><b>3</b><span>Approve the proof &amp; pick up</span></li>
      </ol>
    </header>

    ${hasErrors ? alert('danger', 'Please fix the highlighted fields below. For your safety, files are not kept when something needs fixing – please choose them again.') : ''}

    <form class="cust-form" method="post" action="${withCsrf(`/${shop.slug}/order`, res)}" enctype="multipart/form-data"
      data-order-form data-max-files="${lim.files}" data-max-bytes="${lim.bytes}" data-accept="${ACCEPT_ATTR}">
      ${csrfField(res)}

      <section class="card card-pad cust-sec" aria-labelledby="cust-sec-you">
        <h2 class="cust-sec-title" id="cust-sec-you"><span class="cust-sec-num">1</span>Your details</h2>
        ${field({
          label: 'Your name',
          id: 'cust-name',
          error: errors.name,
          control: html`<input type="text" id="cust-name" name="name" value="${v.name}" required maxlength="80" autocomplete="name" autocapitalize="words" enterkeyhint="next"${describe('cust-name', { error: errors.name })}>`,
        })}
        <div class="form-row">
          ${field({
            label: 'Mobile number',
            id: 'cust-mobile',
            hint: 'The shop may call or WhatsApp you about this order.',
            error: errors.mobile,
            control: html`<input type="tel" id="cust-mobile" name="mobile" value="${v.mobile}" required maxlength="20" inputmode="tel" autocomplete="tel" enterkeyhint="next" placeholder="98765 43210" pattern="\\D*(\\d\\D*){10,15}" title="Enter a 10-digit mobile number"${describe('cust-mobile', { hint: true, error: errors.mobile })}>`,
          })}
          ${field({
            label: 'Email',
            id: 'cust-email',
            optional: true,
            hint: 'For proof & ready emails.',
            error: errors.email,
            control: html`<input type="email" id="cust-email" name="email" value="${v.email}" maxlength="160" inputmode="email" autocomplete="email" enterkeyhint="next" placeholder="you@example.com"${describe('cust-email', { hint: true, error: errors.email })}>`,
          })}
        </div>
      </section>

      <section class="card card-pad cust-sec" aria-labelledby="cust-sec-files">
        <h2 class="cust-sec-title" id="cust-sec-files"><span class="cust-sec-num">2</span>${multi ? 'Your files' : 'Your file'}</h2>
        <div class="field cust-files-field${errors.files ? ' has-error' : ''}" data-files-field>
          <label class="sr-only" for="cust-files">${multi ? 'Files to print' : 'File to print'}</label>
          <div class="dropzone cust-dropzone" data-dropzone>
            <input type="file" id="cust-files" name="files"${multi ? html` multiple` : ''} accept="${ACCEPT_ATTR}" required aria-describedby="cust-files-hint cust-files-error"${errors.files ? html` aria-invalid="true"` : ''}>
            <span class="cust-dz-icon">${icon('upload')}</span>
            <strong class="cust-dz-title" data-dz-title>${multi ? 'Choose files to print' : 'Choose a file to print'}</strong>
            <span class="cust-dz-sub"><span class="cust-dz-tap">Tap here to browse your phone</span><span class="cust-dz-drag">Click to browse, or drag and drop here</span></span>
            <span class="cust-dz-picked">${icon('check')}${multi ? 'Files selected – tap to change' : 'File selected – tap to change'}</span>
          </div>
          <ul class="file-list cust-file-list" data-file-list aria-label="Selected files" hidden></ul>
          <div class="cust-files-bar" data-files-bar hidden>
            <span data-files-summary aria-live="polite"></span>
            <button type="button" class="link-btn" data-files-clear>Remove all</button>
          </div>
          <p class="field-error" id="cust-files-error" data-files-error role="alert"${errors.files ? '' : html` hidden`}>${errors.files || ''}</p>
          <p class="hint" id="cust-files-hint">${limitText}. Print-ready PDF works best – JPG, PNG, CDR, AI, PSD, ZIP and more are fine too.</p>
          <details class="cust-types">
            <summary>All allowed file types</summary>
            <p>${TYPE_LIST}</p>
          </details>
        </div>
      </section>

      <section class="card card-pad cust-sec" aria-labelledby="cust-sec-print">
        <h2 class="cust-sec-title" id="cust-sec-print"><span class="cust-sec-num">3</span>Print details</h2>
        <div class="form-row">
          ${field({
            label: 'Size',
            id: 'cust-size',
            error: errors.size,
            control: html`<select id="cust-size" name="size" required${describe('cust-size', { error: errors.size })}>
              ${sizes.map((s) => html`<option value="${s}"${s === v.size ? html` selected` : ''}>${s}</option>`)}
            </select>`,
          })}
          ${field({
            label: 'Quantity',
            id: 'cust-qty',
            control: html`<div class="cust-qty" data-qty>
              <button type="button" class="cust-qty-btn" data-qty-step="-1" aria-label="Decrease quantity" hidden>${MINUS}</button>
              <input type="number" id="cust-qty" name="quantity" value="${v.quantity}" min="1" max="100000" step="1" inputmode="numeric" required>
              <button type="button" class="cust-qty-btn" data-qty-step="1" aria-label="Increase quantity" hidden>${icon('plus')}</button>
            </div>`,
          })}
        </div>
        <fieldset class="cust-fieldset${errors.color_mode ? ' has-error' : ''}">
          <legend>Print in</legend>
          <div class="seg cust-seg">
            ${choice('color_mode', 'color', v.color_mode, 'Colour')}
            ${choice('color_mode', 'bw', v.color_mode, 'Black & white')}
          </div>
          ${errors.color_mode ? html`<p class="field-error">${errors.color_mode}</p>` : ''}
        </fieldset>
        <fieldset class="cust-fieldset${errors.sides ? ' has-error' : ''}">
          <legend>Sides</legend>
          <div class="seg cust-seg">
            ${choice('sides', 'single', v.sides, 'Single side')}
            ${choice('sides', 'both', v.sides, 'Both sides')}
          </div>
          ${errors.sides ? html`<p class="field-error">${errors.sides}</p>` : ''}
        </fieldset>
        ${field({
          label: 'Notes for the shop',
          id: 'cust-notes',
          optional: true,
          hint: 'Paper type, finish, deadline – anything the shop should know.',
          error: errors.notes,
          control: html`<textarea id="cust-notes" name="notes" rows="3" maxlength="1000" placeholder="e.g. 300 GSM matte card, lamination, need by Friday 5 pm"${describe('cust-notes', { hint: true, error: errors.notes })}>${v.notes}</textarea>`,
        })}
      </section>

      <div class="cust-submit">
        <div class="alert alert-danger" data-form-error role="alert" hidden>${icon('alert')}<span data-form-error-text></span></div>
        <div class="cust-progress" data-progress hidden>
          <div class="cust-progress-head">
            <span class="spinner" aria-hidden="true"></span>
            <strong data-progress-title aria-live="polite">Uploading…</strong>
            <span class="cust-progress-pct" data-progress-pct>0%</span>
          </div>
          <progress class="cust-progress-bar" data-progress-bar max="100" value="0" aria-label="Upload progress">0%</progress>
          <div class="cust-progress-meta">
            <span data-progress-bytes></span>
            <span data-progress-eta></span>
          </div>
          <div class="cust-progress-foot">
            <p class="hint">Keep this page open until it finishes. Big files can take a few minutes on mobile data.</p>
            <button type="button" class="btn btn-ghost btn-sm" data-progress-cancel>Cancel upload</button>
          </div>
        </div>
        <button type="submit" class="btn btn-brand btn-lg btn-block cust-send" data-submit data-loading="Uploading…">${icon('upload')}<span data-submit-label>Send order</span></button>
        ${shop.is_demo
          ? html`<p class="cust-privacy">${icon('alert')}<span><b>Demo:</b> everyone trying the demo can see this order and its file for a few hours. Use sample details and a sample file – not private documents.</span></p>`
          : html`<p class="cust-privacy">${icon('shield')}<span>Files are only shared with ${shop.name} and auto-deleted after ${shop.retention_days} days.</span></p>`}
      </div>
    </form>
  </div>`;

  render(
    res,
    {
      title: `Order online – ${shop.name}`,
      description: `Send your print files to ${shop.name} online, get an order number instantly and approve your proof from your phone.`,
      variant: 'customer',
      brandShop: shop,
      bodyClass: 'cust-order-page',
      scripts: ['/js/order-form.js'],
      body,
    },
    status
  );
}

/** Friendly page when the shop is paused / expired and not taking orders. */
export function closedPage(res, shop, { owner = false } = {}, status = 200) {
  const body = html`<div class="container-narrow cust-page">
    ${owner ? ownerNote('Your plan is not active, so customers see this page instead of the order form.', '/shop', 'Back to dashboard') : ''}
    <section class="card cust-closed" aria-labelledby="cust-closed-title">
      <div class="cust-closed-icon">${icon('clock')}</div>
      <h1 id="cust-closed-title">${shop.name} is not taking online orders right now</h1>
      <p class="lead">Please contact the shop directly to place your order. If you already placed an order, your tracking link still works.</p>
      ${contactActions(shop, `Hi ${shop.name}, I would like to place a print order.`)}
      ${shopAddress(shop)}
    </section>
  </div>`;
  render(res, { title: `${shop.name} – online orders paused`, variant: 'customer', brandShop: shop, body }, status);
}
