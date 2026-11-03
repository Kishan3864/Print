/* PrintDesk billing: print receipt, forward to Razorpay, admin manual-payment amount hint. */
(function () {
  'use strict';

  // Receipt: Print / save as PDF.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-print]') : null;
    if (!btn) return;
    e.preventDefault();
    window.print();
  });

  // Checkout hand-off: go straight to the Razorpay page (the button stays as a fallback).
  var go = document.querySelector('[data-bl-autogo]');
  if (go && /^https:\/\//.test(go.getAttribute('href') || '')) {
    setTimeout(function () {
      window.location.replace(go.href);
    }, 350);
  }

  // Admin "Record a payment": the amount placeholder follows the chosen plan + cycle.
  var forms = document.querySelectorAll('[data-bl-manual]');
  Array.prototype.forEach.call(forms, function (form) {
    var prices;
    try {
      prices = JSON.parse(form.getAttribute('data-prices') || '{}');
    } catch (err) {
      return;
    }
    var plan = form.querySelector('[data-bl-plan]');
    var amount = form.querySelector('[data-bl-amount]');
    if (!plan || !amount) return;
    function update() {
      var cycle = form.querySelector('[data-bl-cycle]:checked');
      var p = prices[plan.value];
      if (p && cycle && p[cycle.value] != null) amount.placeholder = String(p[cycle.value]);
    }
    form.addEventListener('change', update);
    update();
  });
})();
