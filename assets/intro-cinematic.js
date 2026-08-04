/* ==========================================================================
   Sudditalia Clothing — intro-cinematic.js
   Orchestratore dell'intro "APNEA".

   Responsabilità:
   1. Decidere se l'esperienza WebGL è ammissibile (capacità, preferenze,
      impostazione del Theme Editor).
   2. Caricarla DOPO l'evento load, così three.js e la compilazione degli
      shader non entrano nel Total Blocking Time misurato da Lighthouse.
      L'attesa non è tempo morto: la prima battuta del concept è comunque
      schermo nero, quindi il caricamento avviene "dentro" la regia.
   3. Sintetizzare l'audio d'impatto con Web Audio invece di scaricare un
      file: zero peso, zero licenze, e il click è un gesto utente quindi
      l'autoplay non viene bloccato.
   4. Garantire che l'utente possa SEMPRE entrare — anche se il 3D non
      arriva mai — e smontare tutto a fine sequenza.
   ========================================================================== */
(function () {
  'use strict';

  var overlay = document.querySelector('[data-intro]');
  if (!overlay || overlay.hidden) return;

  var canvas = overlay.querySelector('[data-intro-canvas]');
  var skipBtn = overlay.querySelector('[data-intro-skip]');
  var cta = overlay.querySelector('[data-intro-cta]');
  var root = document.documentElement;

  var cfg = {
    webgl: overlay.getAttribute('data-webgl') !== 'false',
    audio: overlay.getAttribute('data-audio') === 'true',
    enterDuration: parseInt(overlay.getAttribute('data-enter-duration'), 10) || 2200,
    revealAt: parseInt(overlay.getAttribute('data-reveal-at'), 10) || 4500,
    moduleUrl: overlay.getAttribute('data-module-url'),
    glbUrl: overlay.getAttribute('data-glb-url') || '',
    gltfLoaderUrl: overlay.getAttribute('data-gltf-loader-url') || '',
    waterColor: overlay.getAttribute('data-water-color'),
    lightColor: overlay.getAttribute('data-light-color'),
    accentColor: overlay.getAttribute('data-accent-color'),
    sharkColor: overlay.getAttribute('data-shark-color')
  };

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var noAnim = root.classList.contains('no-animations');
  var simple = reduceMotion || noAnim;

  var scene = null;
  var entered = false;
  var cleaned = false;
  var ctaShown = false;

  /* ------------------------------------------------------------- audio -- */
  var audioCtx = null;
  function playImpact() {
    if (!cfg.audio || simple) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var ctx = audioCtx, now = ctx.currentTime;
      var master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);

      // Fiotto d'acqua: rumore bianco filtrato con sweep del passa-basso.
      var len = Math.floor(ctx.sampleRate * 2.4);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      var src = ctx.createBufferSource();
      src.buffer = buf;
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 1.1;
      lp.frequency.setValueAtTime(260, now);
      lp.frequency.exponentialRampToValueAtTime(3800, now + 0.42);
      lp.frequency.exponentialRampToValueAtTime(190, now + 2.1);
      var ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.exponentialRampToValueAtTime(0.45, now + 0.40);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 2.3);
      src.connect(lp); lp.connect(ng); ng.connect(master);
      src.start(now); src.stop(now + 2.4);

      // Sub: la botta bassa dell'impatto.
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(68, now + 0.30);
      osc.frequency.exponentialRampToValueAtTime(27, now + 1.5);
      var og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, now + 0.30);
      og.gain.exponentialRampToValueAtTime(0.55, now + 0.52);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);
      osc.connect(og); og.connect(master);
      osc.start(now + 0.28); osc.stop(now + 2.1);
    } catch (e) { /* audio non disponibile: l'intro resta muta */ }
  }

  function closeAudio() {
    if (audioCtx) {
      try { audioCtx.close(); } catch (e) {}
      audioCtx = null;
    }
  }

  /* ----------------------------------------------------------- cleanup -- */
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    if (scene) { try { scene.dispose(); } catch (e) {} scene = null; }
    window.setTimeout(closeAudio, 2600);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.body.classList.remove('intro-active');
    root.classList.add('intro-just-finished');
    window.setTimeout(function () { root.classList.remove('intro-just-finished'); }, 2400);
    var main = document.getElementById('MainContent');
    if (main) { try { main.focus({ preventScroll: true }); } catch (e) { main.focus(); } }
  }

  function finish(delay) {
    overlay.classList.add('is-out');
    window.setTimeout(cleanup, delay == null ? 900 : delay);
  }

  function showCta() {
    if (ctaShown) return;
    ctaShown = true;
    overlay.classList.add('is-open');
  }

  /* ------------------------------------------------------- capability --- */
  function supportsWebGL() {
    try {
      var t = document.createElement('canvas');
      var gl = t.getContext('webgl2') || t.getContext('webgl') || t.getContext('experimental-webgl');
      if (!gl) return false;
      // Un contesto software puro renderizzerebbe la scena a pochi fps:
      // meglio il fermo immagine graduato che un'esperienza a scatti.
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        var r = (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
        if (r.indexOf('swiftshader') >= 0 || r.indexOf('llvmpipe') >= 0) return false;
      }
      return true;
    } catch (e) { return false; }
  }

  function pickTier() {
    var mem = navigator.deviceMemory || 4;
    var cores = navigator.hardwareConcurrency || 4;
    var w = Math.min(window.innerWidth, window.innerHeight);
    if (w < 480 || mem <= 2 || cores <= 2) return 'low';
    if (w < 900 || mem <= 4 || cores <= 4) return 'mid';
    return 'high';
  }

  var use3D = !simple && cfg.webgl && canvas && cfg.moduleUrl && supportsWebGL();

  /* ------------------------------------------------------------- boot --- */
  function boot() {
    if (entered || cleaned) return;
    import(/* webpackIgnore: true */ cfg.moduleUrl).then(function (mod) {
      if (entered || cleaned) return;
      scene = mod.createCinematicIntro({
        canvas: canvas,
        tier: pickTier(),
        waterColor: cfg.waterColor,
        lightColor: cfg.lightColor,
        accentColor: cfg.accentColor,
        sharkColor: cfg.sharkColor,
        enterDuration: cfg.enterDuration,
        revealAt: cfg.revealAt,
        onReady: function () { overlay.classList.add('is-live'); },
        onReveal: showCta,
        onBlackout: function () { overlay.classList.add('is-black'); },
        onComplete: function () { finish(700); }
      });
      // Il GLB è un upgrade opzionale: se fallisce resta la mesh procedurale.
      if (cfg.glbUrl && cfg.gltfLoaderUrl && scene.loadModel) {
        scene.loadModel(cfg.glbUrl, cfg.gltfLoaderUrl, null).catch(function () {});
      }
    }).catch(function () {
      // three.js non caricato: resta il fermo immagine, l'utente entra lo stesso.
      scene = null;
      showCta();
    });
  }

  if (use3D) {
    var booted = false;
    var kick = function () {
      if (booted) return;
      booted = true;
      if (window.requestIdleCallback) window.requestIdleCallback(boot, { timeout: 600 });
      else window.setTimeout(boot, 1);
    };
    if (document.readyState === 'complete') kick();
    else window.addEventListener('load', kick, { once: true });
    window.setTimeout(kick, 2500); // rete lenta: non aspettare 'load' all'infinito
    // Se il 3D non è mai partito, l'invito compare comunque.
    window.setTimeout(showCta, Math.max(cfg.revealAt, 1600) + 1200);
  } else {
    window.setTimeout(showCta, simple ? 300 : 1400);
  }

  /* -------------------------------------------------------- interazione - */
  function onMove(e) {
    if (!scene) return;
    var p = (e.touches && e.touches[0]) ? e.touches[0] : e;
    scene.updatePointer(
      (p.clientX / window.innerWidth) * 2 - 1,
      (p.clientY / window.innerHeight) * 2 - 1
    );
  }
  overlay.addEventListener('pointermove', onMove, { passive: true });
  overlay.addEventListener('touchmove', onMove, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (scene) scene.setActive(!document.hidden);
  });

  function markSeen() {
    try { sessionStorage.setItem('sudditalia_intro_seen', '1'); } catch (e) {}
  }

  function enter() {
    if (entered) return;
    entered = true;
    markSeen();
    overlay.classList.add('is-entering');
    playImpact();

    if (scene && overlay.classList.contains('is-live')) {
      scene.trigger();
      // Rete di sicurezza: se un callback non arriva, l'overlay non resta in scena.
      window.setTimeout(function () { finish(600); }, cfg.enterDuration + 1400);
      return;
    }
    // Senza 3D: dissolvenza al nero e via, sempre fluida.
    overlay.classList.add('is-black');
    window.setTimeout(function () { finish(700); }, simple ? 200 : 750);
  }

  function skip() {
    if (entered) return;
    entered = true;
    markSeen();
    overlay.classList.add('is-black');
    finish(450);
  }

  overlay.addEventListener('click', function (e) {
    if (skipBtn && (e.target === skipBtn || skipBtn.contains(e.target))) return;
    enter();
  });
  overlay.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); enter(); }
    else if (e.key === 'Escape') { skip(); }
  });
  if (skipBtn) {
    skipBtn.addEventListener('click', function (e) { e.stopPropagation(); skip(); });
  }
  if (cta) {
    cta.addEventListener('click', function (e) { e.stopPropagation(); enter(); });
  }

  window.setTimeout(function () {
    try { overlay.focus({ preventScroll: true }); } catch (e) { overlay.focus(); }
  }, 60);
})();
