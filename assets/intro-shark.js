/* ==========================================================================
   Sudditalia Clothing — intro-shark.js
   Orchestratore dell'intro: sceglie tra esperienza WebGL 3D (squalo che
   nuota, insegue il cursore, "inghiottisce" la camera) e la sequenza 2D
   CSS di base — sempre presente e mostrata da subito, mai un flash vuoto.

   Il 3D è un progressive enhancement caricato in background via dynamic
   import: se WebGL non è disponibile, l'utente ha richiesto animazioni
   ridotte, o il CDN di three.js non risponde, l'esperienza 2D resta quella
   già visibile e funzionante — nessun fallback "a scatto", nessuna attesa.

   Accessibile: mouse, tastiera (Enter/Spazio) e touch. Rispetta
   prefers-reduced-motion.
   ========================================================================== */
(function () {
  'use strict';

  var overlay = document.querySelector('[data-intro]');
  if (!overlay || overlay.hidden) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var noAnim = document.documentElement.classList.contains('no-animations');
  var simple = reduceMotion || noAnim;

  var total = parseInt(overlay.getAttribute('data-intro-duration'), 10) || 2200;
  var skipBtn = overlay.querySelector('[data-intro-skip]');
  var canvas = overlay.querySelector('[data-intro-canvas]');
  var finished = false;
  var cleanedUp = false;
  var sharkAPI = null;

  // Fasi proporzionali alla durata totale (percorso 2D classico)
  var tSwallow = simple ? 0 : Math.round(total * 0.62);
  var tBlackout = simple ? 0 : Math.round(total * 0.22);
  var tFade = 500;

  function markSeen() {
    try { sessionStorage.setItem('sudditalia_intro_seen', '1'); } catch (e) {}
  }

  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    if (sharkAPI) {
      try { sharkAPI.dispose(); } catch (e) {}
      sharkAPI = null;
    }
    overlay.parentNode && overlay.parentNode.removeChild(overlay);
    document.body.classList.remove('intro-active');
    document.documentElement.classList.add('intro-just-finished');
    window.setTimeout(function () {
      document.documentElement.classList.remove('intro-just-finished');
    }, 1400);
    var main = document.getElementById('MainContent');
    if (main) { try { main.focus({ preventScroll: true }); } catch (e) { main.focus(); } }
  }

  function finishWithFade(delay) {
    overlay.classList.add('is-fading-out');
    window.setTimeout(cleanup, delay || tFade);
  }

  /* --------------------------------------------------------------------
     Rilevamento capacità: WebGL disponibile? Che livello qualitativo?
     -------------------------------------------------------------------- */
  function supportsWebGL() {
    try {
      var test = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (test.getContext('webgl2') || test.getContext('webgl') || test.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  function computeQuality() {
    var mem = navigator.deviceMemory || 4;
    var cores = navigator.hardwareConcurrency || 4;
    var w = window.innerWidth;
    if (w < 480 || mem <= 2 || cores <= 2) return 'low';
    if (w < 1024 || mem <= 4 || cores <= 4) return 'mid';
    return 'high';
  }

  var webglSetting = overlay.getAttribute('data-webgl') !== 'false';
  var use3D = !simple && webglSetting && canvas && supportsWebGL();

  /* --------------------------------------------------------------------
     Percorso 3D: import dinamico, solo se ammissibile. Il fallimento del
     fetch (rete, CDN) rifiuta la Promise e non tocca l'esperienza 2D.
     -------------------------------------------------------------------- */
  if (use3D) {
    var moduleUrl = overlay.getAttribute('data-module-url');
    if (moduleUrl) {
      import(/* webpackIgnore: true */ moduleUrl).then(function (mod) {
        if (finished) return; // l'utente è già entrato dal percorso 2D
        sharkAPI = mod.createSharkIntro({
          canvas: canvas,
          sharkColor: overlay.getAttribute('data-shark-color'),
          accentColor: overlay.getAttribute('data-accent-color'),
          quality: computeQuality(),
          duration: total,
          onReady: function () {
            if (finished) return;
            overlay.classList.add('is-3d');
          },
          onSwallowStart: function () { overlay.classList.add('is-swallowing'); },
          onBlackout: function () { overlay.classList.add('is-blackout'); },
          onComplete: function () { finishWithFade(); }
        });
      }).catch(function () {
        sharkAPI = null; // resta l'esperienza 2D, già visibile e funzionante
      });
    }
  }

  /* --------------------------------------------------------------------
     Inseguimento del cursore (solo quando il 3D è attivo)
     -------------------------------------------------------------------- */
  function onPointerMove(e) {
    if (!sharkAPI) return;
    var p = e.touches && e.touches[0] ? e.touches[0] : e;
    var nx = (p.clientX / window.innerWidth) * 2 - 1;
    var ny = (p.clientY / window.innerHeight) * 2 - 1;
    sharkAPI.updatePointer(nx, ny);
  }
  overlay.addEventListener('pointermove', onPointerMove, { passive: true });
  overlay.addEventListener('touchmove', onPointerMove, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (sharkAPI) sharkAPI.setActive(!document.hidden);
  });

  /* --------------------------------------------------------------------
     Ingresso: 3D (accelerazione + bocca + dolly camera) o sequenza 2D
     -------------------------------------------------------------------- */
  function enter() {
    if (finished) return;
    finished = true;
    markSeen();

    if (sharkAPI && overlay.classList.contains('is-3d')) {
      sharkAPI.trigger();
      // Rete di sicurezza: se per qualche motivo i callback non arrivano,
      // l'overlay non deve restare bloccato in scena.
      window.setTimeout(function () { finishWithFade(); }, total + 900);
      return;
    }

    if (simple) {
      finishWithFade();
      return;
    }

    overlay.classList.add('is-swallowing');
    window.setTimeout(function () {
      overlay.classList.add('is-blackout');
    }, tSwallow);
    window.setTimeout(function () {
      finishWithFade();
    }, tSwallow + tBlackout);
  }

  function skip() {
    if (finished) return;
    finished = true;
    markSeen();
    finishWithFade(300);
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

  window.setTimeout(function () {
    try { overlay.focus({ preventScroll: true }); } catch (e) { overlay.focus(); }
  }, 50);
})();
