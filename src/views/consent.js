import { html } from '../lib/html.js';
import { formatDate } from '../lib/util.js';
import { DOC_PATHS, legal } from '../services/legal.js';
import { csrfField, icon, logoMark } from './components.js';

// Blocking "please accept" screen for shop owners (first login, and whenever we publish new terms).

export function consentView(res, { shop, next, error = '' }) {
  const l = legal();
  const updated = Boolean(shop.terms_version);
  const doc = (k, label) => html`<a href="${DOC_PATHS[k]}" target="_blank" rel="noopener">${label || l.docs[k].title}</a>`;
  return {
    title: 'Please accept our terms',
    variant: 'bare',
    body: html`<section class="consent">
      <div class="card consent-card">
        <div class="consent-mark">${logoMark(44)}</div>
        <p class="consent-kicker">${updated ? 'We updated our terms' : 'Welcome to Brighton Print'}</p>
        <h1>${updated ? 'Please review the new terms' : 'Before you start'}</h1>
        <p class="lead">To use Brighton Print for <b>${shop.name}</b>, please read and accept our ${doc('terms')}, ${doc('privacy')} and ${doc('refund')}.</p>
        <ul class="consent-points">
          <li>${icon('check')}<span><b>Plans:</b> paid features work while your plan (or add-on) is active. When it ends they pause until you renew – your data stays safe for at least 90 days.</span></li>
          <li>${icon('check')}<span><b>Lifetime:</b> a one-time payment for that plan’s features, with one year of Updates &amp; Support (renewable).</span></li>
          <li>${icon('check')}<span><b>Your customers’ data:</b> used only to complete their orders; files are deleted automatically after your retention period.</span></li>
          <li>${icon('check')}<span><b>Refunds:</b> lifetime within 7 days if unused; double or failed payments always refunded.</span></li>
        </ul>
        <form method="post" action="/shop/consent" class="consent-form">
          ${csrfField(res)}
          <input type="hidden" name="next" value="${next}">
          <label class="au-check consent-check${error ? ' has-error' : ''}"><input type="checkbox" name="agree" value="1" required><span>I have read and agree to the Terms of Service, Privacy Policy and Refund &amp; Cancellation Policy (version ${l.version}).</span></label>
          ${error ? html`<p class="field-error">${error}</p>` : ''}
          <button class="btn btn-primary btn-lg btn-block" type="submit">${icon('check')}<span>Accept and continue</span></button>
        </form>
        <form method="post" action="/logout" class="consent-out">${csrfField(res)}<button class="btn btn-ghost btn-sm" type="submit">${icon('logout')}<span>Not now – log out</span></button></form>
        <p class="hint consent-foot">Your acceptance is saved with the date and time${l.updatedAt ? html` · terms last updated ${formatDate(l.updatedAt)}` : ''}.</p>
      </div>
    </section>`,
  };
}
