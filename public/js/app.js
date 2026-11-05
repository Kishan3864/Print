/* Brighton Print core client script – loaded on every page (no inline scripts, CSP-safe). */
(function () {
  'use strict';

  var PD = (window.PD = window.PD || {});
  PD.csrf = document.body ? document.body.getAttribute('data-csrf') || '' : '';

  // ---------- toast ----------
  PD.toast = function (text, opts) {
    opts = opts || {};
    var box = document.querySelector('.toasts');
    if (!box) return;
    var t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.innerHTML =
      '<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
    var span = document.createElement('span');
    span.textContent = text;
    t.appendChild(span);
    if (opts.href) {
      var a = document.createElement('a');
      a.href = opts.href;
      a.textContent = opts.linkText || 'Open';
      t.appendChild(a);
    }
    box.appendChild(t);
    setTimeout(function () {
      t.classList.add('is-leaving');
      setTimeout(function () {
        t.remove();
      }, 300);
    }, opts.duration || 4500);
  };

  // ---------- clipboard ----------
  PD.copy = function (text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.className = 'sr-only';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch (e) {}
      ta.remove();
      return Promise.resolve();
    }
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(fallback);
    return fallback();
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-copy], [data-copy-target], [data-share], [data-back]') : null;
    if (!el) return;

    if (el.hasAttribute('data-back')) {
      if (history.length > 1) {
        e.preventDefault();
        history.back();
      }
      return;
    }

    if (el.hasAttribute('data-share')) {
      e.preventDefault();
      var url = el.getAttribute('data-share-url') || location.href;
      var data = { title: el.getAttribute('data-share-title') || document.title, text: el.getAttribute('data-share-text') || '', url: url };
      if (navigator.share) {
        navigator.share(data).catch(function () {});
      } else {
        PD.copy(url).then(function () {
          PD.toast('Link copied');
        });
      }
      return;
    }

    e.preventDefault();
    var text = el.getAttribute('data-copy');
    if (!text) {
      var target = document.querySelector(el.getAttribute('data-copy-target'));
      text = target ? target.value || target.textContent : '';
    }
    PD.copy(text.trim()).then(function () {
      PD.toast(el.getAttribute('data-copy-msg') || 'Copied');
      el.classList.add('is-copied');
      setTimeout(function () {
        el.classList.remove('is-copied');
      }, 1500);
    });
  });

  // ---------- forms: confirm, autosubmit, double-submit guard ----------
  // Browsers without e.submitter (Safari < 15.4): remember the submit button that was just clicked.
  var clicked = null;
  document.addEventListener(
    'click',
    function (e) {
      var b = e.target.closest ? e.target.closest('button, input[type=submit]') : null;
      if (!b || b.type !== 'submit') return;
      clicked = b;
      setTimeout(function () {
        clicked = null;
      }, 0);
    },
    true
  );

  document.addEventListener(
    'submit',
    function (e) {
      var form = e.target;
      var submitter = e.submitter || (clicked && clicked.form === form ? clicked : null);
      var msg = (submitter && submitter.getAttribute('data-confirm')) || form.getAttribute('data-confirm');
      if (msg && !window.confirm(msg)) {
        e.preventDefault();
        return;
      }
      if (form.hasAttribute('data-no-lock')) return;
      // Lock after the browser has captured the submitter's name/value. form.elements also has
      // buttons outside the form that belong to it via form="…".
      setTimeout(function () {
        Array.prototype.forEach.call(form.elements, function (x) {
          if (x.type !== 'submit' || x.disabled) return;
          x.disabled = true;
          x.setAttribute('data-locked', '');
        });
        if (submitter && submitter.getAttribute('data-loading')) {
          if (!submitter.hasAttribute('data-idle-label')) submitter.setAttribute('data-idle-label', submitter.innerHTML);
          submitter.textContent = submitter.getAttribute('data-loading');
        }
        form.classList.add('is-loading');
      }, 0);
    },
    false
  );

  // Page restored from the back/forward cache: undo the lock and the "Saving…" labels.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-locked]'), function (b) {
      b.disabled = false;
      b.removeAttribute('data-locked');
    });
    Array.prototype.forEach.call(document.querySelectorAll('button[data-idle-label]'), function (b) {
      b.innerHTML = b.getAttribute('data-idle-label');
      b.removeAttribute('data-idle-label');
    });
    Array.prototype.forEach.call(document.querySelectorAll('form.is-loading'), function (f) {
      f.classList.remove('is-loading');
    });
  });

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el && el.hasAttribute && el.hasAttribute('data-autosubmit') && el.form) {
      if (el.form.requestSubmit) el.form.requestSubmit();
      else el.form.submit();
    }
  });

  // ---------- drop zones (visual state only; the file input does the work) ----------
  var zones = document.querySelectorAll('.dropzone');
  Array.prototype.forEach.call(zones, function (z) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      z.addEventListener(ev, function () {
        z.classList.add('is-over');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      z.addEventListener(ev, function () {
        z.classList.remove('is-over');
      });
    });
  });

  // ---------- sidebar drawer (phones / tablets) ----------
  function setSide(open) {
    document.body.classList.toggle('side-open', open);
    var scrim = document.querySelector('.side-scrim');
    if (scrim) scrim.hidden = !open;
    Array.prototype.forEach.call(document.querySelectorAll('[data-side-open]'), function (b) {
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    var side = document.querySelector('[data-side]');
    if (open && side) {
      var first = side.querySelector('.side-link.is-active') || side.querySelector('a, button');
      if (first) setTimeout(function () { first.focus(); }, 60);
    }
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target : null;
    if (!t) return;
    if (t.closest('[data-side-open]')) {
      e.preventDefault();
      setSide(!document.body.classList.contains('side-open'));
    } else if (t.closest('[data-side-close]')) {
      e.preventDefault();
      setSide(false);
      var opener = document.querySelector('.top-menu');
      if (opener) opener.focus();
    } else if (document.body.classList.contains('side-open') && t.closest('[data-side] a')) {
      setSide(false);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('side-open')) setSide(false);
  });
  window.addEventListener('pageshow', function () {
    setSide(false);
  });

  // ---------- PWA: service worker + install prompt ----------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
    });
  }

  var deferredPrompt = null;
  var installButtons = document.querySelectorAll('[data-install]');
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    Array.prototype.forEach.call(installButtons, function (b) {
      b.hidden = false;
    });
  });
  Array.prototype.forEach.call(installButtons, function (b) {
    b.addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function () {
        deferredPrompt = null;
        Array.prototype.forEach.call(installButtons, function (x) {
          x.hidden = true;
        });
      });
    });
  });
  window.addEventListener('appinstalled', function () {
    Array.prototype.forEach.call(installButtons, function (x) {
      x.hidden = true;
    });
  });

  // iPhone/iPad Safari has no install prompt: reveal "Share → Add to Home Screen" hints.
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  if (isIOS && !standalone) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-ios-hint]'), function (el) {
      el.hidden = false;
    });
  }
  if (standalone) document.documentElement.classList.add('is-standalone');
})();
