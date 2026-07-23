/* ==========================================================================
   Sudditalia Clothing — parallax.js
   Parallax multi-livello su scroll con IntersectionObserver + requestAnimationFrame.
   Disattivato su reduced-motion, no-animations e degradato su touch.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  if (root.classList.contains('no-animations')) return;

  var isTouch = window.matchMedia('(hover: none)').matches;
  var items = [];
  var active = [];
  var ticking = false;

  function collect() {
    items = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
  }

  function update() {
    ticking = false;
    var vh = window.innerHeight;
    for (var i = 0; i < active.length; i++) {
      var el = active[i];
      var rect = el.getBoundingClientRect();
      var speed = parseFloat(el.getAttribute('data-parallax')) || 0.15;
      // Su touch riduciamo l'intensità per evitare movimenti eccessivi
      if (isTouch) speed *= 0.5;
      var intensity = parseFloat(getComputedStyle(root).getPropertyValue('--anim-intensity')) || 1;
      var progress = (rect.top + rect.height / 2 - vh / 2) / vh;
      var shift = -(progress * speed * 100 * intensity);
      el.style.setProperty('--parallax-y', shift.toFixed(2) + 'px');
    }
  }

  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(update);
      ticking = true;
    }
  }

  function init() {
    collect();
    if (!items.length) return;

    if (!('IntersectionObserver' in window)) {
      active = items;
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var el = entry.target;
        var idx = active.indexOf(el);
        if (entry.isIntersecting && idx === -1) active.push(el);
        else if (!entry.isIntersecting && idx !== -1) active.splice(idx, 1);
      });
      update();
    }, { rootMargin: '100px 0px' });

    items.forEach(function (el) { io.observe(el); });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () { update(); }, { passive: true });
    update();
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('shopify:section:load', init);
})();
