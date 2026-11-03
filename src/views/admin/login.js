import { html } from '../../lib/html.js';
import { alert, csrfField, field, icon } from '../components.js';
import { loginUrl } from './common.js';

/** Super-admin sign-in card. */
export function loginView(res, { email = '', error = '', disabled = false } = {}) {
  return html`<section class="adm-login">
    <div class="card adm-login-card">
      <span class="adm-login-ic" aria-hidden="true">${icon('shield')}</span>
      <h1>Admin sign in</h1>
      <p class="adm-login-lead">Manage shops, payments and support for Brighton Solution.</p>
      ${disabled
        ? alert('warn', 'Admin login is switched off. Set ADMIN_EMAIL and ADMIN_PASSWORD in the server’s .env file, then restart PrintDesk.')
        : html`${error ? alert('danger', error) : ''}
          <form method="post" action="/admin/login" class="adm-login-form">
            ${csrfField(res)}
            ${field({
              label: 'Email',
              id: 'adm-email',
              control: html`<input type="email" id="adm-email" name="email" value="${email}" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="160" required${email ? '' : html` autofocus`}>`,
            })}
            ${field({
              label: 'Password',
              id: 'adm-password',
              control: html`<input type="password" id="adm-password" name="password" autocomplete="current-password" maxlength="200" required${email ? html` autofocus` : ''}>`,
            })}
            <button class="btn btn-primary btn-lg btn-block" type="submit" data-loading="Signing in…">${icon('shield')}<span>Sign in</span></button>
          </form>`}
    </div>
    <p class="adm-login-foot">Shop owner? <a href="${loginUrl()}">Log in to your shop</a></p>
  </section>`;
}
