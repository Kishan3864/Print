/* Help & support: growing text boxes, character counter, Ctrl/Cmd+Enter to send (CSP-safe, no inline code). */
(function () {
  'use strict';

  function grow(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight + 2, Math.round(window.innerHeight * 0.5)) + 'px';
  }

  Array.prototype.forEach.call(document.querySelectorAll('textarea[data-autogrow]'), function (ta) {
    ta.addEventListener('input', function () {
      grow(ta);
    });
    if (ta.value) grow(ta);
  });

  // Counter appears near the limit only, so the form stays calm.
  Array.prototype.forEach.call(document.querySelectorAll('textarea[data-counter]'), function (ta) {
    var max = parseInt(ta.getAttribute('data-counter'), 10);
    if (!max) return;
    var out = document.createElement('p');
    out.className = 'sup-counter';
    out.setAttribute('aria-live', 'polite');
    out.hidden = true;
    ta.insertAdjacentElement('afterend', out);
    function update() {
      var n = ta.value.length;
      out.hidden = n < max * 0.8;
      out.textContent = n + ' / ' + max;
      out.classList.toggle('is-over', n >= max);
    }
    ta.addEventListener('input', update);
    update();
  });

  // Panels collapsed on phones start open on wide screens.
  if (window.matchMedia && window.matchMedia('(min-width: 961px)').matches) {
    Array.prototype.forEach.call(document.querySelectorAll('details[data-open-wide]'), function (d) {
      d.open = true;
    });
  }

  // Ctrl+Enter / Cmd+Enter sends a reply.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
    var ta = e.target;
    if (!ta || ta.tagName !== 'TEXTAREA' || !ta.form || !ta.value.trim()) return;
    e.preventDefault();
    // The primary button (plain "Send reply"), never "Send & close".
    var btn = ta.form.querySelector('button.btn-primary[type=submit]');
    if (ta.form.requestSubmit) ta.form.requestSubmit(btn || undefined);
    else ta.form.submit();
  });
})();
