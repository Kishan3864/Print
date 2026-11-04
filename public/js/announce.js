/* Announcement composer: live "Will reach N shops", the shop picker shows for "One shop" (CSP-safe). */
(function () {
  'use strict';
  var form = document.querySelector('[data-ann-form]');
  if (!form) return;
  var out = form.querySelector('[data-ann-reach]');
  var unit = form.querySelector('[data-ann-unit]');
  var pick = form.querySelector('[data-ann-shop]');
  form.classList.add('has-js');

  function update() {
    var r = form.querySelector('input[name=audience]:checked');
    var one = Boolean(r && r.value === 'shop');
    var n = r ? parseInt(r.getAttribute('data-count'), 10) || 0 : 0;
    if (one && pick && !pick.value) n = 0;
    form.classList.toggle('is-shop', one);
    if (out) out.textContent = String(n);
    if (unit) unit.textContent = n === 1 ? 'shop' : 'shops';
  }

  form.addEventListener('change', function (e) {
    if (e.target && e.target.name === 'audience' && e.target.value === 'shop' && pick && !pick.value) {
      setTimeout(function () { pick.focus(); }, 0);
    }
    update();
  });
  update();
})();
