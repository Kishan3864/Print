import { html, raw } from '../lib/html.js';
import { STATUS_LABEL, SHOP_STATE_LABEL } from '../lib/status.js';

// ---------- icons (inline SVG, stroke = currentColor) ----------
const P = {
  orders: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4h-4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M5 13v8h14v-8"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  sparkle: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  install: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M12 7v7M9 11l3 3 3-3"/>',
};
const WHATSAPP =
  '<path fill="currentColor" stroke="none" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3z"/>';

export function icon(name, cls = '') {
  const body = name === 'whatsapp' ? WHATSAPP : P[name] || P.info;
  return raw(
    `<svg class="icon${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`
  );
}

/** Brighton Print mark: printer with a fresh sheet on an indigo tile. */
export function logoMark(size = 32) {
  return raw(
    `<svg class="logo-mark" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true" focusable="false"><rect width="64" height="64" rx="6" fill="#0a7a50"/><rect x="20" y="10" width="24" height="14" rx="2" fill="#ffffff"/><rect x="11" y="21" width="42" height="21" rx="6" fill="#ffffff"/><rect x="18" y="33" width="28" height="4" rx="2" fill="#0f2a1e"/><rect x="43" y="26" width="4" height="4" rx="2" fill="#f5a524"/><rect x="20" y="35" width="24" height="19" rx="2" fill="#ffffff"/><rect x="24" y="41" width="16" height="2.5" rx="1.2" fill="#cfe3d6"/><rect x="24" y="46" width="10" height="2.5" rx="1.2" fill="#cfe3d6"/></svg>`
  );
}

export const brandLockup = (href = '/') =>
  html`<a class="brand" href="${href}" aria-label="Brighton Print home">${logoMark(30)}<span class="brand-name">Brighton <b>Print</b></span></a>`;

// ---------- small building blocks ----------
export const statusPill = (status) => html`<span class="pill pill-${status}">${STATUS_LABEL[status] || status}</span>`;
export const shopStatePill = (state) => html`<span class="pill pill-shop-${state}">${SHOP_STATE_LABEL[state] || state}</span>`;
export const orderNo = (n) => html`<span class="order-no">P-${n}</span>`;

/** Hidden CSRF field – put in every POST form. */
export const csrfField = (res) => html`<input type="hidden" name="_csrf" value="${res.locals.csrf}">`;

/** For multipart forms: action URL with the CSRF token in the query (checked before upload). */
export const withCsrf = (url, res) => `${url}${url.includes('?') ? '&' : '?'}_csrf=${encodeURIComponent(res.locals.csrf)}`;

export function flashList(list = []) {
  if (!list.length) return '';
  return html`<div class="flash-stack" role="status">
    ${list.map(
      (f) => html`<div class="alert alert-${f.type === 'error' ? 'danger' : f.type === 'success' ? 'success' : f.type === 'warn' ? 'warn' : 'info'}">
        ${icon(f.type === 'error' ? 'alert' : f.type === 'success' ? 'check' : 'info')}<span>${f.text}</span>
      </div>`
    )}
  </div>`;
}

export const alert = (type, text, iconName) =>
  html`<div class="alert alert-${type}">${icon(iconName || (type === 'danger' || type === 'warn' ? 'alert' : type === 'success' ? 'check' : 'info'))}<span>${text}</span></div>`;

export const emptyState = ({ title, text = '', action = '' }) =>
  html`<div class="empty"><div class="empty-art" aria-hidden="true"><span></span><span></span><span></span></div><h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}${action}</div>`;

/** Form field with label, hint and error. `control` is an html`` input. */
export const field = ({ label, id, control, hint = '', error = '', optional = false }) =>
  html`<div class="field${error ? ' has-error' : ''}">
    <label for="${id}">${label}${optional ? html` <span class="optional">optional</span>` : ''}</label>
    ${control}
    ${hint ? html`<p class="hint" id="${id}-hint">${hint}</p>` : ''}
    ${error ? html`<p class="field-error" id="${id}-error">${error}</p>` : ''}
  </div>`;
