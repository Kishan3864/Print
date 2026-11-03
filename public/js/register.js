/* Register page: suggest the link name from the shop name, keep it tidy while typing, and check availability. */
(function () {
  'use strict';

  var form = document.querySelector('form[data-register]');
  if (!form) return;
  var nameInput = form.querySelector('[data-shop-name]');
  var slugInput = form.querySelector('[data-slug-input]');
  var status = form.querySelector('[data-slug-status]');
  if (!slugInput || !status) return;

  // Mirrors slugify() in src/lib/util.js.
  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '');
  }

  // Gentle clean-up while typing: a trailing hyphen is allowed so the next word can follow.
  function tidy(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[\s_.]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-+/, '')
      .slice(0, 40);
  }

  // The field counts as "edited by hand" once it has a value we did not suggest.
  var touched = slugInput.value !== '';
  var timer = null;
  var seq = 0;

  function show(state, text) {
    status.textContent = text || '';
    status.classList.toggle('is-ok', state === 'ok');
    status.classList.toggle('is-bad', state === 'bad');
    status.classList.toggle('is-busy', state === 'busy');
  }

  function check() {
    clearTimeout(timer);
    var slug = slugInput.value.replace(/-+$/, '');
    if (!slug) return show('', '');
    if (slug.length < 3) return show('bad', 'Use at least 3 characters.');
    show('busy', 'Checking…');
    timer = setTimeout(function () {
      var mine = ++seq;
      fetch('/api/slug-check?slug=' + encodeURIComponent(slug), { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (mine !== seq) return;
          if (data && typeof data.ok === 'boolean') show(data.ok ? 'ok' : 'bad', data.message || '');
          else show('', '');
        })
        .catch(function () {
          if (mine === seq) show('', '');
        });
    }, 350);
  }

  slugInput.addEventListener('input', function () {
    var before = slugInput.value;
    var after = tidy(before);
    if (after !== before) {
      var pos = slugInput.selectionStart == null ? after.length : Math.max(0, slugInput.selectionStart - (before.length - after.length));
      slugInput.value = after;
      try {
        slugInput.setSelectionRange(pos, pos);
      } catch (e) {}
    }
    touched = slugInput.value !== '';
    check();
  });

  // Drop a trailing hyphen when the user leaves the field.
  slugInput.addEventListener('blur', function () {
    var v = slugInput.value.replace(/-+$/, '');
    if (v !== slugInput.value) {
      slugInput.value = v;
      check();
    }
  });

  if (nameInput) {
    nameInput.addEventListener('input', function () {
      if (touched) return;
      slugInput.value = slugify(nameInput.value);
      check();
    });
  }

  // Re-check a value the server sent back (e.g. after a form error).
  if (slugInput.value && !slugInput.hasAttribute('aria-invalid')) check();
})();
