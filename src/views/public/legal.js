import { html } from '../../lib/html.js';
import { formatDate } from '../../lib/util.js';
import { DOC_PATHS, legal } from '../../services/legal.js';

// /terms, /privacy, /refund-policy – plain text from services/legal.js (admin-editable) as a page.
// Format: blank line = paragraph, "## " = heading, "- " = bullet. Everything is escaped.

function render(body) {
  const out = [];
  let bullets = [];
  const flush = () => {
    if (bullets.length) out.push(html`<ul>${bullets.map((b) => html`<li>${b}</li>`)}</ul>`);
    bullets = [];
  };
  for (const block of String(body).replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    for (const line of block.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith('## ')) {
        flush();
        out.push(html`<h2>${t.slice(3)}</h2>`);
      } else if (t.startsWith('- ')) bullets.push(t.slice(2));
      else {
        flush();
        out.push(html`<p>${t}</p>`);
      }
    }
    flush();
  }
  return out;
}

export function legalPage(key) {
  const l = legal();
  const doc = l.docs[key];
  return {
    title: doc.title,
    variant: 'public',
    description: `${doc.title} for Brighton Print by Brighton Solution.`,
    body: html`<section class="container legal">
      <article class="card legal-card">
        <h1>${doc.title}</h1>
        <p class="legal-meta">Brighton Print by Brighton Solution · version ${l.version}${l.updatedAt ? ` · updated ${formatDate(l.updatedAt)}` : ''}</p>
        <div class="legal-body">${render(doc.body)}</div>
        <nav class="legal-nav" aria-label="Policies">${Object.entries(DOC_PATHS)
          .filter(([k]) => k !== key)
          .map(([k, p]) => html`<a class="btn btn-secondary btn-sm" href="${p}">${l.docs[k].title}</a>`)}</nav>
      </article>
    </section>`,
  };
}
