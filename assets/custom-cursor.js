/* ==========================================================================
   Sudditalia Clothing — custom-cursor.js
   Cursore personalizzato (opzionale, solo desktop non-touch).
   Reagisce agli elementi interattivi. Attivato dal Theme Editor.
   ========================================================================== */
(function () {
  'use strict';

  if (window.matchMedia('(hover: none)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var cursor = document.querySelector('[data-custom-cursor]');
  if (!cursor) return;

  cursor.hidden = false;
  document.documentElement.classList.add('has-custom-cursor');

  var x = window.innerWidth / 2, y = window.innerHeight / 2;
  var cx = x, cy = y;
  var raf;

  function loop() {
    // Interpolazione morbida per un movimento fluido
    cx += (x - cx) * 0.2;
    cy += (y - cy) * 0.2;
    cursor.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)';
    raf = requestAnimationFrame(loop);
  }

  document.addEventListener('mousemove', function (e) {
    x = e.clientX;
    y = e.clientY;
  }, { passive: true });

  // Stato "attivo" sopra elementi interattivi
  var interactive = 'a, button, [role="button"], input, textarea, select, label, [data-tilt]';
  document.addEventListener('mouseover', function (e) {
    if (e.target.closest(interactive)) cursor.classList.add('is-active');
  });
  document.addEventListener('mouseout', function (e) {
    if (e.target.closest(interactive)) cursor.classList.remove('is-active');
  });

  document.addEventListener('mouseleave', function () { cursor.style.opacity = '0'; });
  document.addEventListener('mouseenter', function () { cursor.style.opacity = '1'; });

  loop();
})();
