/* ==========================================================================
   Sudditalia Clothing — text-reveal.js
   Rivela il testo parola-per-parola o riga-per-riga allo scroll.
   Elementi: [data-text-reveal] con attributo data-reveal="word|line".
   Accessibile: il testo originale resta leggibile; i wrapper hanno aria-hidden
   solo a livello visivo (il contenuto testuale è preservato).
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  if (root.classList.contains('no-animations')) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  function splitWords(el) {
    var text = el.textContent;
    var words = text.split(/(\s+)/);
    el.textContent = '';
    var wi = 0;
    words.forEach(function (w) {
      if (/^\s+$/.test(w)) {
        el.appendChild(document.createTextNode(' '));
      } else if (w.length) {
        var span = document.createElement('span');
        span.className = 'text-reveal__word';
        span.style.setProperty('--wi', wi++);
        span.textContent = w;
        el.appendChild(span);
      }
    });
  }

  function init() {
    var els = document.querySelectorAll('[data-text-reveal]');
    if (!els.length) return;

    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.25, rootMargin: '0px 0px -10% 0px' });

    els.forEach(function (el) {
      if (el.dataset.revealReady === 'true') { io.observe(el); return; }
      var mode = el.getAttribute('data-reveal') || 'word';
      el.classList.add('text-reveal');
      if (mode === 'word') {
        // Applica lo split a ogni nodo testo di primo livello
        Array.prototype.slice.call(el.childNodes).forEach(function (node) {
          if (node.nodeType === 3 && node.textContent.trim()) {
            var wrap = document.createElement('span');
            wrap.textContent = node.textContent;
            node.parentNode.replaceChild(wrap, node);
            splitWords(wrap);
          } else if (node.nodeType === 1) {
            splitWords(node);
          }
        });
      }
      el.dataset.revealReady = 'true';
      io.observe(el);
    });
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('shopify:section:load', init);
})();
