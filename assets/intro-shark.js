/* ==========================================================================
   Sudditalia Clothing — intro-shark.js
   Sequenza "inghiottito dallo squalo": click → zoom-in → buio → emersione hero.
   Accessibile: mouse, tastiera (Enter/Spazio) e touch.
   Rispetta prefers-reduced-motion (versione dissolvenza semplice).
   ========================================================================== */
(function () {
  'use strict';

  var overlay = document.querySelector('[data-intro]');
  if (!overlay || overlay.hidden) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var noAnim = document.documentElement.classList.contains('no-animations');
  var simple = reduceMotion || noAnim;

  var total = parseInt(overlay.getAttribute('data-intro-duration'), 10) || 1600;
  var skipBtn = overlay.querySelector('[data-intro-skip]');
  var finished = false;

  // Fasi proporzionali alla durata totale
  var tSwallow = simple ? 0 : Math.round(total * 0.62);   // zoom-in + scurimento
  var tBlackout = simple ? 0 : Math.round(total * 0.22);  // buio totale
  var tFade = 500;                                          // dissolvenza finale

  function markSeen() {
    try { sessionStorage.setItem('sudditalia_intro_seen', '1'); } catch (e) {}
  }

  function cleanup() {
    overlay.parentNode && overlay.parentNode.removeChild(overlay);
    document.body.classList.remove('intro-active');
    document.documentElement.classList.add('intro-just-finished');
    // Rimuove la classe dopo l'animazione di emersione dell'hero
    window.setTimeout(function () {
      document.documentElement.classList.remove('intro-just-finished');
    }, 1400);
    // Sposta il focus sul contenuto principale per l'accessibilità
    var main = document.getElementById('MainContent');
    if (main) { try { main.focus({ preventScroll: true }); } catch (e) { main.focus(); } }
  }

  function enter() {
    if (finished) return;
    finished = true;
    markSeen();

    if (simple) {
      overlay.classList.add('is-fading-out');
      window.setTimeout(cleanup, tFade);
      return;
    }

    // 1-2. Ingrandimento + scurimento verso la "bocca"
    overlay.classList.add('is-swallowing');

    // 3. Buio totale
    window.setTimeout(function () {
      overlay.classList.add('is-blackout');
    }, tSwallow);

    // 4-5. Emersione: rimuove overlay e attiva l'unfold dell'hero
    window.setTimeout(function () {
      overlay.classList.add('is-fading-out');
      window.setTimeout(cleanup, tFade);
    }, tSwallow + tBlackout);
  }

  function skip() {
    if (finished) return;
    finished = true;
    markSeen();
    overlay.classList.add('is-fading-out');
    window.setTimeout(cleanup, 300);
  }

  // --- Eventi ---
  overlay.addEventListener('click', function (e) {
    if (e.target === skipBtn || (skipBtn && skipBtn.contains(e.target))) return;
    enter();
  });

  overlay.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      enter();
    } else if (e.key === 'Escape') {
      skip();
    }
  });

  if (skipBtn) {
    skipBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      skip();
    });
  }

  // Focus iniziale sull'overlay per la navigazione da tastiera
  window.setTimeout(function () {
    try { overlay.focus({ preventScroll: true }); } catch (e) { overlay.focus(); }
  }, 50);
})();
