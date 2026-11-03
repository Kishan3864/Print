import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { brandLockup, icon, logoMark } from '../components.js';

// Header/footer of the public site (landing, demo, register, login).

export function publicHeader(res, active) {
  const link = (href, label, key) => html`<a href="${href}"${active === key ? raw(' aria-current="page"') : ''}>${label}</a>`;
  return html`<header class="site-header">
    <div class="container header-row">
      ${brandLockup('/')}
      <nav class="site-nav" aria-label="Main">
        ${link('/#features', 'Features', 'features')}
        ${link('/#how', 'How it works', 'how')}
        ${link('/#pricing', 'Pricing', 'pricing')}
        ${link('/#faq', 'FAQ', 'faq')}
        ${link('/demo', 'Live demo', 'demo')}
      </nav>
      <div class="header-actions">
        <a class="btn btn-ghost btn-sm" href="/login">Log in</a>
        <a class="btn btn-primary btn-sm hide-xs" href="/register">Get started</a>
      </div>
    </div>
  </header>`;
}

export const authHeader = () =>
  html`<header class="site-header site-header-min"><div class="container header-row">${brandLockup('/')}<a class="btn btn-ghost btn-sm" href="/">${icon('arrowLeft')}<span>Home</span></a></div></header>`;

export function siteFooter() {
  return html`<footer class="site-footer">
    <div class="container footer-row">
      <div class="footer-brand">${logoMark(22)}<span>© Brighton Solution · <a href="${config.companyUrl}" target="_blank" rel="noopener">brightonsolution.com</a></span></div>
      <nav class="footer-nav" aria-label="Footer">
        <a href="/demo">Live demo</a>
        <a href="/#pricing">Pricing</a>
        <a href="/register">Get started</a>
        <a href="/login">Shop login</a>
      </nav>
    </div>
  </footer>`;
}
