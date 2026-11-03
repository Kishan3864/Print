import { html } from '../../lib/html.js';
import { config } from '../../config.js';
import { ALLOWED_EXT, ACCEPT_ATTR, fileLimits } from '../../lib/uploads.js';
import { sizeOptions } from '../../services/shops.js';
import { shopPath } from '../../services/notify.js';
import { formatBytes } from '../../lib/util.js';
import { render } from '../layout.js';
import { csrfField, field, icon, withCsrf } from '../components.js';
import { COLOR_LABEL, GLYPH, SIDES_LABEL, contactActions, ownerNote, shopAddress } from './common.js';

// Public, shop-branded order form (works without JS; /js/order-form.js adds the
// file list, step tracking, live summary, client-side checks and upload progress).

const TYPE_LIST = [...new Set(ALLOWED_EXT.map((e) => ({ jpeg: 'jpg', tiff: 'tif' })[e] || e))].map((e) => e.toUpperCase()).join(', ');
// Up to this many sizes show as tap chips; longer lists use a dropdown.
const MAX_SIZE_CHIPS = 12;

const sizeText = (bytes) => (bytes % (1024 * 1024) === 0 ? `${bytes / (1024 * 1024)} MB` : formatBytes(bytes));

/** aria-describedby / aria-invalid for a control rendered with field(). */
function describe(id, { hint = false, error = '' } = {}) {
  const ids = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return html`${ids ? html` aria-describedby="${ids}"` : ''}${error ? html` aria-invalid="true"` : ''}`;
}

const MINUS = html`<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M5 12h14"/></svg>`;

const STEPS = [
  { key: 'details', label: 'Your details', href: '#cust-sec-you' },
  { key: 'files', label: 'Files', href: '#cust-sec-files' },
  { key: 'options', label: 'Print options', href: '#cust-sec-print' },
  { key: 'send', label: 'Send', href: '#cust-send' },
];

const TOGGLE_SUB = { color: 'Full colour print', bw: 'Black ink only', single: 'Print on the front', both: 'Front and back' };

/** Large toggle card (radio). */
const toggle = (name, value, current, label) =>
  html`<label class="cust-tog">
    <input type="radio" name="${name}" value="${value}"${current === value ? html` checked` : ''}>
    <span class="cust-tog-box">
      ${GLYPH[value]}
      <span class="cust-tog-text"><b>${label}</b><small>${TOGGLE_SUB[value]}</small></span>
      <span class="cust-tog-tick" aria-hidden="true">${icon('check')}</span>
    </span>
  </label>`;

/** Section heading: number badge (turns into a tick when done), title, one-line help. */
const secHead = (num, id, title, text) =>
  html`<div class="cust-sec-head">
    <span class="cust-sec-num" aria-hidden="true"><b>${num}</b>${icon('check')}</span>
    <div class="cust-sec-titles"><h2 id="${id}">${title}</h2><p>${text}</p></div>
  </div>`;

// Where each server-side error points to (for the error summary links).
const ERROR_TARGET = { name: 'cust-name', mobile: 'cust-mobile', email: 'cust-email', files: 'cust-files', size: 'cust-sec-print', color_mode: 'cust-sec-print', sides: 'cust-sec-print', notes: 'cust-notes' };

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
  const errorKeys = Object.keys(errors).filter((k) => errors[k]);
  const sample = shop.is_demo && shop.slug === config.demo.slug;
  const limitText = multi
    ? `Up to ${lim.files} files, ${sizeText(lim.bytes)} each`
    : `1 file, up to ${sizeText(lim.bytes)}${shop.is_demo ? ' (demo limit)' : ''}`;

  const errorSummary = errorKeys.length
    ? html`<div class="cust-errors" role="alert" aria-labelledby="cust-errors-title">
        <p class="cust-errors-title" id="cust-errors-title">${icon('alert')}<span>Please fix ${errorKeys.length === 1 ? 'this' : `these ${errorKeys.length} things`} and send again</span></p>
        <ul>${errorKeys.map((k) => html`<li><a href="#${ERROR_TARGET[k] || 'cust-sec-you'}">${errors[k]}</a></li>`)}</ul>
      </div>`
    : '';

  const sizeControl =
    sizes.length <= MAX_SIZE_CHIPS
      ? html`<fieldset class="cust-opt${errors.size ? ' has-error' : ''}">
          <legend class="cust-opt-label">Paper size</legend>
          <div class="cust-sizes">
            ${sizes.map(
              (s, i) => html`<label class="cust-size"><input type="radio" name="size" value="${s}"${s === v.size ? html` checked` : ''}${i === 0 ? html` required` : ''}><span>${s}</span></label>`
            )}
          </div>
          ${errors.size ? html`<p class="field-error">${errors.size}</p>` : ''}
        </fieldset>`
      : html`<div class="cust-opt">
          ${field({
            label: 'Paper size',
            id: 'cust-size',
            error: errors.size,
            control: html`<select id="cust-size" name="size" required${describe('cust-size', { error: errors.size })}>
              ${sizes.map((s) => html`<option value="${s}"${s === v.size ? html` selected` : ''}>${s}</option>`)}
            </select>`,
          })}
        </div>`;

  const body = html`<div class="cust-wrap cust-page cust-order">
    ${owner ? ownerNote('This is your customer order page – share this link with your customers.', '/shop', 'Back to dashboard') : ''}

    <header class="cust-hero">
      <p class="cust-kicker">${icon('printer')}<span>Online print order</span></p>
      <h1>Send your files to <span class="cust-hero-shop">${shop.name}</span></h1>
      <p class="cust-lead">Takes about a minute. You get an order number straight away and approve the proof from your phone.</p>
      <ul class="cust-perks" aria-label="Why order online">
        <li>${icon('check')}<span>Instant order number</span></li>
        <li>${icon('eye')}<span>Approve proof online</span></li>
        <li>${icon('shield')}<span>Private files</span></li>
      </ul>
    </header>

    ${errorSummary}

    <form class="cust-form" method="post" action="${withCsrf(`${shopPath(shop)}/order`, res)}" enctype="multipart/form-data"
      data-order-form data-max-files="${lim.files}" data-max-bytes="${lim.bytes}" data-accept="${ACCEPT_ATTR}">
      ${csrfField(res)}

      <div class="cust-main">
        <ol class="cust-stepper" data-stepper aria-label="Order steps">
          ${STEPS.map(
            (s, i) => html`<li class="cust-step${i === 0 ? ' is-current' : ''}" data-step="${s.key}">
              <a href="${s.href}"${i === 0 ? html` aria-current="step"` : ''}>
                <span class="cust-step-dot" aria-hidden="true"><b>${i + 1}</b>${icon('check')}</span>
                <span class="cust-step-label">${s.label}<span class="sr-only" data-step-sr></span></span>
              </a>
            </li>`
          )}
        </ol>

        <section class="cust-sec" id="cust-sec-you" data-sec="details" aria-labelledby="cust-sec-you-t">
          ${secHead(1, 'cust-sec-you-t', 'Your details', `So ${shop.name} can reach you about this order.`)}
          <div class="cust-sec-body">
            ${field({
              label: 'Your name',
              id: 'cust-name',
              error: errors.name,
              control: html`<input type="text" id="cust-name" name="name" value="${v.name}" required maxlength="80" autocomplete="name" autocapitalize="words" enterkeyhint="next" placeholder="e.g. Rahul Sharma"${describe('cust-name', { error: errors.name })}>`,
            })}
            ${field({
              label: 'Mobile number',
              id: 'cust-mobile',
              hint: 'For calls or WhatsApp about this order only.',
              error: errors.mobile,
              control: html`<div class="cust-tel">
                <span class="cust-tel-cc" aria-hidden="true">+${config.countryCode}</span>
                <input type="tel" id="cust-mobile" name="mobile" value="${v.mobile}" required maxlength="20" inputmode="tel" autocomplete="tel" enterkeyhint="next" placeholder="98765 43210" pattern="\\D*(\\d\\D*){10,15}" title="Enter a 10-digit mobile number"${describe('cust-mobile', { hint: true, error: errors.mobile })}>
              </div>`,
            })}
            <details class="cust-more" data-email-more${v.email || errors.email ? html` open` : ''}>
              <summary>${icon('mail')}<span>Add email for updates</span><span class="optional">optional</span></summary>
              ${field({
                label: 'Email',
                id: 'cust-email',
                hint: 'We send your order link and proof updates here.',
                error: errors.email,
                control: html`<input type="email" id="cust-email" name="email" value="${v.email}" maxlength="160" inputmode="email" autocomplete="email" enterkeyhint="next" placeholder="you@example.com"${describe('cust-email', { hint: true, error: errors.email })}>`,
              })}
            </details>
          </div>
        </section>

        <section class="cust-sec" id="cust-sec-files" data-sec="files" aria-labelledby="cust-sec-files-t">
          ${secHead(2, 'cust-sec-files-t', multi ? 'Your files' : 'Your file', 'A print-ready PDF works best. Photos and design files are fine too.')}
          <div class="cust-sec-body">
            <div class="cust-files${errors.files ? ' has-error' : ''}" data-files-field>
              <label class="sr-only" for="cust-files">${multi ? 'Files to print' : 'File to print'}</label>
              <div class="dropzone cust-drop" data-dropzone>
                <input type="file" id="cust-files" name="files"${multi ? html` multiple` : ''} accept="${ACCEPT_ATTR}" required aria-describedby="cust-files-hint cust-files-error"${errors.files ? html` aria-invalid="true"` : ''}>
                <span class="cust-drop-ic">${icon('upload')}</span>
                <strong class="cust-drop-title" data-dz-title>${multi ? 'Choose files to print' : 'Choose a file to print'}</strong>
                <span class="cust-drop-sub"><span class="cust-dz-tap">Tap to pick from your phone</span><span class="cust-dz-drag">Drag &amp; drop here, or click to browse</span></span>
                <span class="cust-dz-picked">${icon('check')}<span>${multi ? 'Files selected – tap to change' : 'File selected – tap to change'}</span></span>
              </div>
              <ul class="cust-file-list" data-file-list aria-label="Selected files" hidden></ul>
              <div class="cust-files-bar" data-files-bar hidden>
                <span data-files-summary aria-live="polite"></span>
                <button type="button" class="link-btn" data-files-clear>Remove all</button>
              </div>
              <p class="field-error cust-files-error" id="cust-files-error" data-files-error role="alert"${errors.files ? '' : html` hidden`}>${errors.files || ''}</p>
              <p class="hint cust-files-hint" id="cust-files-hint">${limitText}. PDF, JPG, PNG, CDR, AI, PSD, Word, ZIP and more.</p>
              <details class="cust-types">
                <summary>All allowed file types</summary>
                <p>${TYPE_LIST}</p>
              </details>
            </div>
          </div>
        </section>

        <section class="cust-sec" id="cust-sec-print" data-sec="options" aria-labelledby="cust-sec-print-t">
          ${secHead(3, 'cust-sec-print-t', 'Print options', 'Not sure? Keep the defaults and add a note – the shop will confirm.')}
          <div class="cust-sec-body">
            ${sizeControl}
            <div class="cust-opt">
              <label class="cust-opt-label" for="cust-qty">Quantity <span class="optional">copies</span></label>
              <div class="cust-qty" data-qty>
                <button type="button" class="cust-qty-btn" data-qty-step="-1" aria-label="One less" hidden>${MINUS}</button>
                <input type="number" id="cust-qty" name="quantity" value="${v.quantity}" min="1" max="100000" step="1" inputmode="numeric" required>
                <button type="button" class="cust-qty-btn" data-qty-step="1" aria-label="One more" hidden>${icon('plus')}</button>
              </div>
            </div>
            <div class="cust-opt-pair">
              <fieldset class="cust-opt${errors.color_mode ? ' has-error' : ''}">
                <legend class="cust-opt-label">Print in</legend>
                <div class="cust-togs">
                  ${toggle('color_mode', 'color', v.color_mode, COLOR_LABEL.color)}
                  ${toggle('color_mode', 'bw', v.color_mode, COLOR_LABEL.bw)}
                </div>
                ${errors.color_mode ? html`<p class="field-error">${errors.color_mode}</p>` : ''}
              </fieldset>
              <fieldset class="cust-opt${errors.sides ? ' has-error' : ''}">
                <legend class="cust-opt-label">Sides</legend>
                <div class="cust-togs">
                  ${toggle('sides', 'single', v.sides, SIDES_LABEL.single)}
                  ${toggle('sides', 'both', v.sides, SIDES_LABEL.both)}
                </div>
                ${errors.sides ? html`<p class="field-error">${errors.sides}</p>` : ''}
              </fieldset>
            </div>
            ${field({
              label: 'Notes for the shop',
              id: 'cust-notes',
              optional: true,
              hint: 'Paper, finish, binding, deadline – anything the shop should know.',
              error: errors.notes,
              control: html`<textarea id="cust-notes" name="notes" rows="3" maxlength="1000" placeholder="e.g. 300 GSM matte card, lamination, need by Friday 5 pm"${describe('cust-notes', { hint: true, error: errors.notes })}>${v.notes}</textarea>`,
            })}
          </div>
        </section>
      </div>

      <div class="cust-side">
        <div class="cust-sum" data-summary hidden>
          <h2 class="cust-sum-title">Your order</h2>
          <dl class="cust-sum-list">
            <div><dt>Files</dt><dd data-sum="files">Not added yet</dd></div>
            <div><dt>Size</dt><dd data-sum="size">${v.size}</dd></div>
            <div><dt>Quantity</dt><dd data-sum="qty">${v.quantity}</dd></div>
            <div><dt>Print</dt><dd data-sum="print">${COLOR_LABEL[v.color_mode]} · ${SIDES_LABEL[v.sides]}</dd></div>
          </dl>
        </div>
        <div class="cust-submit" id="cust-send" data-submit-bar>
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
              <p class="hint">Keep this page open. Big files can take a few minutes on mobile data.</p>
              <button type="button" class="btn btn-ghost btn-sm" data-progress-cancel>Cancel</button>
            </div>
          </div>
          <p class="cust-sum-line" data-sum-line aria-live="polite" hidden></p>
          <button type="submit" class="btn btn-brand btn-lg btn-block cust-send" data-submit data-loading="Uploading…">${icon('upload')}<span data-submit-label>Send order</span></button>
        </div>
        ${shop.is_demo
          ? html`<p class="cust-trust cust-trust-demo">${icon('alert')}<span>${sample
              ? html`<b>Demo:</b> everyone trying the demo can see this order and its file for a few hours. Use sample details and a sample file – not private documents.`
              : html`<b>Demo shop:</b> orders here are for testing and are not printed. Use a sample file – not private documents.`}</span></p>`
          : html`<p class="cust-trust">${icon('shield')}<span>Your files are private – only ${shop.name} can open them, and they are deleted automatically after ${shop.retention_days} days.</span></p>`}
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
  const body = html`<div class="cust-wrap cust-page cust-narrow">
    ${owner ? ownerNote('Your plan is not active, so customers see this page instead of the order form.', '/shop/billing', 'Open Plan & billing') : ''}
    <section class="cust-card cust-closed" aria-labelledby="cust-closed-title">
      <span class="cust-closed-ic">${icon('clock')}</span>
      <h1 id="cust-closed-title">${shop.name} is not taking online orders right now</h1>
      <p class="cust-lead">${shop.phone ? 'Please call or WhatsApp the shop to place your order – they will be happy to help.' : 'Please visit or contact the shop directly to place your order.'}</p>
      ${contactActions(shop, `Hi ${shop.name}, I would like to place a print order.`)}
      ${shopAddress(shop)}
      <p class="cust-closed-note">${icon('info')}<span>Already placed an order? Your order link still works.</span></p>
    </section>
  </div>`;
  render(res, { title: `${shop.name} – online orders paused`, variant: 'customer', brandShop: shop, bodyClass: 'cust-closed-page', body }, status);
}
