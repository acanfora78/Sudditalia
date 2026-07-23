/* ==========================================================================
   Sudditalia Clothing — product-card.js
   Tilt 3D al passaggio del mouse (solo desktop / hover).
   Su touch: nessun tilt (il reveal on-scroll è gestito da theme.js).
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  if (root.classList.contains('no-animations') || root.classList.contains('no-3d')) return;
  if (window.matchMedia('(hover: none)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var MAX = 8; // gradi massimi di rotazione (scalati dall'intensità)

  function bind(card) {
    if (card.dataset.tiltBound === 'true') return;
    card.dataset.tiltBound = 'true';
    var inner = card.querySelector('.tilt__inner') || card;
    var intensity = parseFloat(getComputedStyle(root).getPropertyValue('--anim-intensity')) || 1;
    var raf = null;

    function onMove(e) {
      var rect = card.getBoundingClientRect();
      var px = (e.clientX - rect.left) / rect.width - 0.5;
      var py = (e.clientY - rect.top) / rect.height - 0.5;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        var rx = (-py * MAX * intensity).toFixed(2);
        var ry = (px * MAX * intensity).toFixed(2);
        inner.style.transform = 'perspective(800px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateZ(0)';
      });
    }
    function reset() {
      if (raf) cancelAnimationFrame(raf);
      inner.style.transform = 'perspective(800px) rotateX(0) rotateY(0)';
    }

    card.addEventListener('mousemove', onMove);
    card.addEventListener('mouseleave', reset);
  }

  function init() {
    document.querySelectorAll('[data-tilt]').forEach(bind);
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('shopify:section:load', init);
})();
