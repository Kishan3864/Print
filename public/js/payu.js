/* PayU checkout hand-off + waiting screen. */
(function () {
  'use strict';
  // Checkout: post the signed form to PayU straight away (the button stays as a fallback).
  var form = document.querySelector('[data-payu-autosubmit]');
  if (form) setTimeout(function () { form.submit(); }, 400);

  // Waiting: re-check every 4 s as well (live updates usually arrive first).
  if (document.querySelector('[data-wait-refresh]')) {
    setInterval(function () {
      fetch(location.href, { credentials: 'same-origin' }).then(function (r) {
        if (r.redirected) location.href = r.url;
      }).catch(function () {});
    }, 4000);
  }
})();
