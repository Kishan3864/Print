import { html, raw } from '../../lib/html.js';
import { config } from '../../config.js';
import { alert, csrfField, field, icon } from '../components.js';
import { CYCLES, formatINR, priceRupees } from '../../services/billing.js';

const DM_URL = `https://ig.me/m/${config.instagram}`;
const HOST = config.baseUrl.replace(/^https?:\/\//, '') + '/';

/** aria-describedby / aria-invalid for an input rendered through field(). */
function aria(id, { hint = false, error = '', extra = '' } = {}) {
  const ids = [extra, hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ');
  return html`${ids ? html` aria-describedby="${ids}"` : ''}${error ? raw(' aria-invalid="true"') : ''}`;
}

const cmykBar = () => html`<div class="cmyk-bar au-bar" aria-hidden="true"><span></span><span></span><span></span><span></span></div>`;

/** "You picked Pro · Yearly" summary above the real sign-up form. */
function chosenPlan(choice) {
  if (!choice) return '';
  const { plan, cycle } = choice;
  return html`<div class="au-plan">
    <span class="au-plan-ic">${icon('check')}</span>
    <p><b>${plan.name}</b> · ${CYCLES[cycle]} · ${formatINR(priceRupees(plan, cycle))}${cycle === 'yearly' ? ' / year' : cycle === 'lifetime' ? ' once, for life' : ' / month'}<small>You can change the plan on the next step.</small></p>
    <a class="au-plan-change" href="/#pricing">Change</a>
  </div>`;
}

// ---------- register (real shop, or a free demo shop with demo: true) ----------
export function registerPage(res, { values = {}, errors = {}, demo = false, choice = null, demoShop = null } = {}) {
  const v = (k) => values[k] || '';
  const e = (k) => errors[k] || '';
  const hasErrors = Object.keys(errors).length > 0;
  const days = config.demo.trialDays;
  const action = demo ? '/demo/register' : '/register';

  const text = (id, name, { type = 'text', hint = '', extra = '', attrs = '' } = {}) =>
    html`<input type="${type}" id="${id}" name="${name}" value="${type === 'password' ? '' : v(name)}" ${raw(attrs)}${aria(id, { hint: Boolean(hint), error: e(name), extra })}>`;

  const slugControl = html`<div class="input-group au-slug-group">
      <span class="input-addon" id="reg-slug-host">${demo ? `${HOST}demo/` : HOST}</span>
      <input type="text" id="reg-slug" name="slug" value="${v('slug')}" required maxlength="40" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="your-shop-name" data-slug-input${aria('reg-slug', { hint: true, error: e('slug'), extra: 'reg-slug-host reg-slug-status' })}>
    </div>
    <p class="au-slug-status" id="reg-slug-status" aria-live="polite" data-slug-status></p>`;

  return html`<section class="auth-wrap">
    <div class="card auth-card auth-card-wide au-card${demo ? ' au-card-demo' : ''}">
      ${cmykBar()}
      ${demo
        ? html`<span class="au-demo-tag">${icon('sparkle')}<span>Free demo · ${days} days</span></span>
            <h1>Create your demo shop</h1>
            <p class="lead">Your own Brighton Print with your shop's name and link – ready right away. No payment, no approval.</p>`
        : html`<h1>Register your shop</h1>
            <p class="lead">Get your own order link where customers send files to print. Choose a plan and pay to activate – takes 1 minute.</p>`}
      ${demoShop && !demo
        ? html`<div class="au-alert">${alert('info', html`You have a demo shop (${demoShop.name}). To go live with it, <a href="/shop/billing">choose a plan in your dashboard</a> – no new account needed.`)}</div>`
        : ''}
      ${chosenPlan(choice)}
      ${hasErrors ? html`<div class="au-alert">${alert('danger', errors._form || 'Please fix the highlighted fields below.')}</div>` : ''}

      <form method="post" action="${action}" class="au-form" data-register>
        ${csrfField(res)}
        ${choice ? html`<input type="hidden" name="plan" value="${choice.plan.key}"><input type="hidden" name="cycle" value="${choice.cycle}">` : ''}
        <fieldset class="au-group">
          <legend>Your shop</legend>
          <div class="form-row">
            ${field({ label: 'Shop name', id: 'reg-name', error: e('name'), control: text('reg-name', 'name', { attrs: 'required maxlength="80" autocomplete="organization" placeholder="e.g. Navrang Prints" data-shop-name' }) })}
            ${field({ label: 'City', id: 'reg-city', error: e('city'), control: text('reg-city', 'city', { attrs: 'required maxlength="60" autocomplete="address-level2" placeholder="e.g. Surat"' }) })}
          </div>
          <div class="au-slug">
            ${field({
              label: 'Your order link',
              id: 'reg-slug',
              error: e('slug'),
              hint: demo
                ? 'During the demo your link has /demo/ in it. When you go live it becomes your short link. Lowercase letters, numbers and hyphens.'
                : 'Customers open this link to send you files. Lowercase letters, numbers and hyphens.',
              control: slugControl,
            })}
          </div>
        </fieldset>

        <fieldset class="au-group">
          <legend>Contact</legend>
          <div class="form-row">
            ${field({ label: 'Your name', id: 'reg-owner', error: e('owner_name'), control: text('reg-owner', 'owner_name', { attrs: 'required maxlength="80" autocomplete="name"' }) })}
            ${field({
              label: 'Mobile number',
              id: 'reg-mobile',
              error: e('mobile'),
              control: text('reg-mobile', 'mobile', { type: 'tel', attrs: 'required maxlength="20" inputmode="tel" autocomplete="tel" placeholder="98765 43210"' }),
            })}
          </div>
          ${field({
            label: 'Email',
            id: 'reg-email',
            error: e('email'),
            hint: 'You will log in with this email.',
            control: text('reg-email', 'email', { type: 'email', hint: 'yes', attrs: 'required maxlength="160" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false"' }),
          })}
        </fieldset>

        <fieldset class="au-group">
          <legend>Password</legend>
          <div class="form-row">
            ${field({
              label: 'Password',
              id: 'reg-password',
              error: e('password'),
              hint: 'At least 8 characters.',
              control: text('reg-password', 'password', { type: 'password', hint: 'yes', attrs: 'required minlength="8" maxlength="72" autocomplete="new-password"' }),
            })}
            ${field({
              label: 'Confirm password',
              id: 'reg-password2',
              error: e('password2'),
              control: text('reg-password2', 'password2', { type: 'password', attrs: 'required minlength="8" maxlength="72" autocomplete="new-password"' }),
            })}
          </div>
        </fieldset>

        <div class="au-consent${e('agree') ? ' has-error' : ''}">
          <label class="au-check"><input type="checkbox" name="agree" value="1" required${v('agree') ? html` checked` : ''}><span>I have read and agree to the <a href="/terms" target="_blank" rel="noopener">Terms of Service</a>, <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a> and <a href="/refund-policy" target="_blank" rel="noopener">Refund Policy</a>.</span></label>
          ${e('agree') ? html`<p class="field-error">${e('agree')}</p>` : ''}
        </div>

        ${demo
          ? html`<div class="au-approval">${alert('info', `Your demo shop runs for ${days} days. Orders placed on a demo link are for testing. Go live anytime by choosing a plan.`, 'clock')}</div>
              <button class="btn btn-primary btn-lg btn-block" type="submit" data-loading="Creating your demo shop…">Create my demo shop</button>`
          : html`<div class="au-approval">${alert('info', 'Next: choose a plan and pay online (UPI, card or net banking). Your order link opens as soon as the payment is done.', 'shield')}</div>
              <button class="btn btn-primary btn-lg btn-block" type="submit" data-loading="Creating your account…">Continue to payment</button>`}
      </form>
    </div>
    <p class="auth-foot">
      <span class="au-foot-item">Already registered? <a href="/login">Log in</a></span><span class="au-sep" aria-hidden="true"></span><span class="au-foot-item">${demo
        ? html`Ready to go live? <a href="/register">Register your shop</a>`
        : html`Not ready to pay? <a href="/demo">Try the live demo</a>`}</span>
    </p>
  </section>`;
}

// ---------- login ----------
export function loginPage(res, { email = '', next = '', error = '', demoSession = false } = {}) {
  return html`<section class="auth-wrap">
    <div class="card auth-card au-card">
      ${cmykBar()}
      <h1>Welcome back</h1>
      <p class="lead">Log in to see your orders.</p>
      ${demoSession ? html`<div class="au-alert">${alert('info', 'You are in the demo. Logging in here takes you to your own shop.')}</div>` : ''}
      ${error ? html`<div class="au-alert" role="alert">${alert('danger', error)}</div>` : ''}

      <form method="post" action="/login" class="au-form">
        ${csrfField(res)}
        ${next ? html`<input type="hidden" name="next" value="${next}">` : ''}
        ${field({
          label: 'Email',
          id: 'login-email',
          control: html`<input type="email" id="login-email" name="email" value="${email}" required maxlength="160" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false"${email ? '' : raw(' autofocus')}>`,
        })}
        ${field({
          label: 'Password',
          id: 'login-password',
          control: html`<input type="password" id="login-password" name="password" required maxlength="200" autocomplete="current-password"${email ? raw(' autofocus') : ''}>`,
        })}
        <button class="btn btn-primary btn-lg btn-block" type="submit" data-loading="Logging in…">Log in</button>
      </form>
      <p class="au-help">${icon('info')}<span>Forgot your password? DM <a href="${DM_URL}" target="_blank" rel="noopener">@${config.instagram}</a> on Instagram and we will reset it for you.</span></p>
    </div>
    <p class="auth-foot">New to Brighton Print? <a href="/register">Register your shop</a><span class="au-sep" aria-hidden="true"></span><a href="/demo">Try the live demo</a></p>
  </section>`;
}
