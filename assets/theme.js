/* ==========================================================================
   Sudditalia Clothing — theme.js (core)
   Reveal on scroll, sticky header, marquee, feedback UI.
   Vanilla JS, nessuna dipendenza. Degrada con grazia senza JS.
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.SudditaliaTheme || {};
  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isTouch = window.matchMedia('(hover: none)').matches;

  // Applica i flag globali del Theme Editor come classi sul <html>
  if (cfg.animations === false || reduceMotion) root.classList.add('no-animations');
  if (cfg.enable3d === false || isTouch) root.classList.add('no-3d');
  root.classList.toggle('is-touch', isTouch);

  var animationsOn = cfg.animations !== false && !reduceMotion;

  /* --------------------------------------------------------------------
     Reveal on scroll — tutte le device
     -------------------------------------------------------------------- */
  function initReveal() {
    var els = document.querySelectorAll('[data-animate]');
    if (!els.length) return;

    if (!animationsOn || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.15 });

    els.forEach(function (el, i) {
      if (!el.style.getPropertyValue('--i')) {
        el.style.setProperty('--i', (i % 8).toString());
      }
      io.observe(el);
    });
  }

  /* --------------------------------------------------------------------
     Sticky header: da trasparente a pieno su scroll
     -------------------------------------------------------------------- */
  function initHeader() {
    var header = document.querySelector('[data-sticky-header]');
    if (!header) return;
    var threshold = 40;
    var ticking = false;

    function update() {
      header.classList.toggle('is-scrolled', window.scrollY > threshold);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
    update();
  }

  /* --------------------------------------------------------------------
     Marquee: duplica il contenuto per uno scorrimento infinito continuo
     -------------------------------------------------------------------- */
  function initMarquee() {
    document.querySelectorAll('[data-marquee]').forEach(function (marquee) {
      var track = marquee.querySelector('.marquee__track');
      if (!track || track.dataset.cloned === 'true') return;
      var clone = track.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild.apply(track, Array.prototype.map.call(clone.children, function (c) {
        return c.cloneNode(true);
      }));
      track.dataset.cloned = 'true';
    });
  }

  /* --------------------------------------------------------------------
     Newsletter: feedback animato all'invio (progressive enhancement)
     -------------------------------------------------------------------- */
  function initNewsletter() {
    document.querySelectorAll('[data-newsletter]').forEach(function (form) {
      form.addEventListener('submit', function () {
        // Shopify gestisce l'invio; mostriamo solo feedback visivo.
        form.classList.add('is-submitting');
      });
    });
  }

  /* --------------------------------------------------------------------
     Mobile menu toggle
     -------------------------------------------------------------------- */
  function initMenu() {
    var toggle = document.querySelector('[data-menu-toggle]');
    var drawer = document.querySelector('[data-menu-drawer]');
    if (!toggle || !drawer) return;

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      drawer.classList.toggle('is-open', open);
      document.body.classList.toggle('menu-open', open);
    }
    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    drawer.addEventListener('click', function (e) {
      if (e.target.matches('[data-menu-close], .menu-drawer__overlay')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
  }

  /* --------------------------------------------------------------------
     Init
     -------------------------------------------------------------------- */
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    initReveal();
    initHeader();
    initMarquee();
    initNewsletter();
    initMenu();
  });

  // Riattiva il reveal quando il Theme Editor ricarica una sezione
  document.addEventListener('shopify:section:load', function () {
    initReveal();
    initHeader();
    initMarquee();
  });

  // Esponi utility per altri script
  window.SudditaliaTheme = window.SudditaliaTheme || {};
  window.SudditaliaTheme.animationsOn = animationsOn;
  window.SudditaliaTheme.isTouch = isTouch;
  window.SudditaliaTheme.reduceMotion = reduceMotion;
})();
