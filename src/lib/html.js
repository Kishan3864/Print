// Tiny auto-escaping template helper. Every ${value} is HTML-escaped unless it
// is the result of html`` or raw(). Arrays are rendered item by item.

class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;', '=': '&#61;' };

export function esc(value) {
  return String(value).replace(/[&<>"'`=]/g, (c) => ESC[c]);
}

export function raw(value) {
  return new SafeHtml(String(value ?? ''));
}

function renderValue(v) {
  if (v == null || v === false) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += renderValue(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

export const isSafe = (v) => v instanceof SafeHtml;

// JSON for embedding in a data-* attribute (escaped by html``).
export const jsonAttr = (obj) => JSON.stringify(obj);
