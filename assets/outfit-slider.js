/* ==========================================================================
   Sudditalia Clothing — outfit-slider.js
   Hero "modello fisso, capo che cambia".
   Il modello resta fermo; i capi scorrono in orizzontale e quello centrale
   gli si sovrappone. Input: trascinamento, swipe orizzontale del trackpad,
   frecce, tastiera. Vanilla JS, nessuna dipendenza.
   ========================================================================== */
(function () {
  'use strict';

  if (window.customElements && customElements.get('outfit-slider')) return;

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function mod(n, m) { return ((n % m) + m) % m; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  class OutfitSlider extends HTMLElement {
    connectedCallback() {
      if (this._ready) return;
      this._ready = true;

      this.stage = this.querySelector('[data-os-stage]');
      this.figure = this.querySelector('[data-os-figure]');
      this.looks = Array.prototype.slice.call(this.querySelectorAll('[data-os-look]'));
      this.captions = Array.prototype.slice.call(this.querySelectorAll('[data-os-caption]'));
      this.hit = this.querySelector('[data-os-hit]');
      this.currentEl = this.querySelector('[data-os-current]');
      this.prevBtn = this.querySelector('[data-os-prev]');
      this.nextBtn = this.querySelector('[data-os-next]');

      this.count = this.looks.length;
      if (!this.stage || !this.figure || !this.count) return;

      var theme = window.SudditaliaTheme || {};
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.animated = theme.animations !== false && !reduce;
      this.speed = theme.speed > 0 ? theme.speed : 1;

      this.gap = (parseFloat(this.dataset.gap) || 70) / 100;        // distanza tra capi, in larghezze del modello
      this.ghost = (parseFloat(this.dataset.ghost) || 22) / 100;    // opacità dei capi laterali
      this.sideScale = (parseFloat(this.dataset.sideScale) || 92) / 100;
      this.loop = this.dataset.loop === 'true' && this.count >= 3;
      this.autoplay = this.animated ? (parseFloat(this.dataset.autoplay) || 0) * 1000 : 0;

      this.pos = 0;       // posizione continua (può essere frazionaria durante il gesto)
      this.target = 0;    // posizione di arrivo (intera)
      this.index = -1;
      this.raf = null;
      this.lastT = 0;

      this.bind();
      this.classList.add('is-ready');

      // Ingresso: il primo capo scivola addosso al modello
      if (this.animated && this.count > 1) {
        this.pos = -1;
        this.render();
        this.setIndex(0);
        var self = this;
        this.whenVisible(function () { self.animateTo(0); });
      } else {
        this.render();
        this.setIndex(0);
      }
      this.startAutoplay();
    }

    disconnectedCallback() {
      this.stopAutoplay();
      if (this.raf) cancelAnimationFrame(this.raf);
      if (this.io) this.io.disconnect();
      document.removeEventListener('visibilitychange', this.onVisibility);
    }

    /* ---------------------------------------------------------------- */
    whenVisible(fn) {
      if (!('IntersectionObserver' in window)) { fn(); return; }
      var self = this;
      this.io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          self.io.disconnect();
          self.io = null;
          fn();
        }
      }, { threshold: 0.25 });
      this.io.observe(this);
    }

    /* Distanza (in "passi") del capo i dal centro, con eventuale loop */
    distance(i) {
      var d = i - this.pos;
      if (this.loop) {
        var n = this.count;
        d = mod(d + n / 2, n) - n / 2;
      }
      return d;
    }

    render() {
      for (var i = 0; i < this.count; i++) {
        var el = this.looks[i];
        var d = this.distance(i);
        var ad = Math.abs(d);

        if (ad > 1.55) {
          if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
          continue;
        }
        var active = clamp(1 - ad, 0, 1);                 // 1 = al centro, 0 = di lato
        var edge = clamp((1.5 - ad) / 0.5, 0, 1);         // dissolvenza oltre il primo capo laterale
        var opacity = (this.ghost + (1 - this.ghost) * active) * edge;
        var scale = this.sideScale + (1 - this.sideScale) * active;

        el.style.visibility = 'visible';
        el.style.opacity = opacity.toFixed(3);
        el.style.zIndex = active > 0.5 ? 3 : 2;
        el.style.transform =
          'translate3d(' + (d * this.gap * 100).toFixed(2) + '%,0,0) scale(' + scale.toFixed(4) + ')';
      }
    }

    setIndex(raw) {
      var idx = this.loop ? mod(raw, this.count) : clamp(raw, 0, this.count - 1);
      if (idx === this.index) return;
      this.index = idx;

      for (var i = 0; i < this.count; i++) {
        var on = i === idx;
        this.looks[i].classList.toggle('is-active', on);
        if (this.captions[i]) {
          this.captions[i].classList.toggle('is-active', on);
          this.captions[i].setAttribute('aria-hidden', on ? 'false' : 'true');
          var link = this.captions[i].querySelector('a');
          if (link) link.tabIndex = on ? 0 : -1;
        }
      }
      if (this.currentEl) this.currentEl.textContent = pad(idx + 1);

      if (this.hit) {
        var url = this.looks[idx].dataset.url || '';
        if (url) {
          this.hit.setAttribute('href', url);
          this.hit.setAttribute('aria-label', this.looks[idx].dataset.title || '');
          this.hit.hidden = false;
        } else {
          this.hit.removeAttribute('href');
          this.hit.hidden = true;
        }
      }
      if (!this.loop) {
        if (this.prevBtn) this.prevBtn.disabled = idx === 0;
        if (this.nextBtn) this.nextBtn.disabled = idx === this.count - 1;
      }
    }

    /* Animazione verso una posizione intera (decadimento esponenziale) */
    animateTo(target) {
      if (!this.loop) target = clamp(target, 0, this.count - 1);
      this.target = target;
      this.setIndex(target);

      if (!this.animated) {
        this.pos = target;
        this.render();
        return;
      }
      if (this.raf) return;
      this.lastT = 0;
      var self = this;
      var tau = 150 / this.speed; // ms: più basso = più scattante

      function tick(t) {
        var dt = self.lastT ? Math.min(t - self.lastT, 50) : 16;
        self.lastT = t;
        var diff = self.target - self.pos;
        if (Math.abs(diff) < 0.0015) {
          self.pos = self.target;
          self.render();
          self.raf = null;
          return;
        }
        self.pos += diff * (1 - Math.exp(-dt / tau));
        self.render();
        self.raf = requestAnimationFrame(tick);
      }
      this.raf = requestAnimationFrame(tick);
    }

    stopAnimation() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
    }

    go(delta) {
      var base = Math.round(this.target);
      var next = base + delta;
      if (!this.loop) next = clamp(next, 0, this.count - 1);
      this.animateTo(next);
    }

    goTo(index) {
      if (!this.loop) { this.animateTo(index); return; }
      // con il loop sceglie il verso più breve
      var n = this.count;
      var base = Math.round(this.target);
      var diff = mod(index - mod(base, n) + n / 2, n) - n / 2;
      this.animateTo(base + diff);
    }

    /* ---------------------------------------------------------------- */
    bind() {
      var self = this;

      if (this.prevBtn) this.prevBtn.addEventListener('click', function () { self.go(-1); self.restartAutoplay(); });
      if (this.nextBtn) this.nextBtn.addEventListener('click', function () { self.go(1); self.restartAutoplay(); });

      this.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); self.go(-1); self.restartAutoplay(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); self.go(1); self.restartAutoplay(); }
      });

      /* --- Trascinamento (mouse, touch, penna) --- */
      var drag = null;
      var suppressClick = false;

      this.stage.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        drag = {
          id: e.pointerId, x: e.clientX, y: e.clientY,
          startPos: self.pos, active: false,
          lastX: e.clientX, lastT: e.timeStamp, v: 0
        };
      });

      this.stage.addEventListener('pointermove', function (e) {
        if (!drag || e.pointerId !== drag.id) return;
        var dx = e.clientX - drag.x;
        var dy = e.clientY - drag.y;

        if (!drag.active) {
          if (Math.abs(dx) < 8) return;
          if (Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // scroll verticale: lascia fare al browser
          drag.active = true;
          drag.x = e.clientX;
          drag.startPos = self.pos;
          dx = 0;
          self.stopAnimation();
          self.stopAutoplay();
          self.classList.add('is-dragging');
          try { self.stage.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
        }

        var step = self.figure.offsetWidth * self.gap || 1;
        var pos = drag.startPos - dx / step;
        if (!self.loop) {
          // elastico ai bordi
          if (pos < 0) pos = pos * 0.3;
          else if (pos > self.count - 1) pos = self.count - 1 + (pos - (self.count - 1)) * 0.3;
        }
        var dt = e.timeStamp - drag.lastT;
        if (dt > 0) drag.v = (e.clientX - drag.lastX) / dt; // px/ms
        drag.lastX = e.clientX;
        drag.lastT = e.timeStamp;

        self.pos = pos;
        self.render();
        self.setIndex(Math.round(pos));
      });

      function endDrag(e) {
        if (!drag || (e && e.pointerId !== drag.id)) return;
        var d = drag;
        drag = null;
        if (!d.active) return;

        self.classList.remove('is-dragging');
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 0);

        var start = Math.round(d.startPos);
        var moved = self.pos - d.startPos;
        var target = start;
        // un colpo deciso o metà strada bastano per cambiare capo (uno alla volta)
        if (Math.abs(d.v) > 0.35) target = start + (d.v < 0 ? 1 : -1);
        else if (Math.abs(moved) > 0.3) target = start + (moved > 0 ? 1 : -1);
        self.animateTo(target);
        self.startAutoplay();
      }
      this.stage.addEventListener('pointerup', endDrag);
      this.stage.addEventListener('pointercancel', endDrag);

      /* Click: sui lati cambia capo; al centro c'è il link al prodotto */
      this.stage.addEventListener('click', function (e) {
        if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
        if (e.target.closest('[data-os-hit]')) return;
        var rect = self.figure.getBoundingClientRect();
        if (e.clientX < rect.left) self.go(-1);
        else if (e.clientX > rect.right) self.go(1);
        else return;
        self.restartAutoplay();
      }, true);

      /* --- Trackpad: swipe orizzontale a due dita = un capo --- */
      var wheelSum = 0;
      var wheelLocked = false;
      var wheelTimer = null;

      this.addEventListener('wheel', function (e) {
        var ax = Math.abs(e.deltaX);
        var ay = Math.abs(e.deltaY);
        if (ax < 2 || ax <= ay * 1.2) return; // gesto verticale: scroll normale della pagina
        e.preventDefault();

        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(function () { wheelSum = 0; wheelLocked = false; }, 160);

        if (wheelLocked) return; // ignora la coda d'inerzia dello stesso gesto
        wheelSum += e.deltaX;
        if (Math.abs(wheelSum) > 40) {
          wheelLocked = true;
          self.go(wheelSum > 0 ? 1 : -1);
          self.restartAutoplay();
          wheelSum = 0;
        }
      }, { passive: false });

      /* --- Autoplay: pausa al passaggio del mouse, al focus e a scheda nascosta --- */
      this.addEventListener('mouseenter', function () { self.stopAutoplay(); });
      this.addEventListener('mouseleave', function () { self.startAutoplay(); });
      this.addEventListener('focusin', function () { self.stopAutoplay(); });
      this.addEventListener('focusout', function () { self.startAutoplay(); });
      this.onVisibility = function () {
        if (document.hidden) self.stopAutoplay(); else self.startAutoplay();
      };
      document.addEventListener('visibilitychange', this.onVisibility);

      /* --- Theme Editor: selezionando un blocco si va a quel capo --- */
      this.addEventListener('shopify:block:select', function (e) {
        var i = self.looks.indexOf(e.target.closest('[data-os-look]'));
        if (i > -1) { self.stopAutoplay(); self.goTo(i); }
      });
      this.addEventListener('shopify:block:deselect', function () { self.startAutoplay(); });
    }

    startAutoplay() {
      if (!this.autoplay || this.count < 2 || this.timer) return;
      var self = this;
      this.timer = setInterval(function () {
        if (!self.loop && self.index === self.count - 1) self.animateTo(0);
        else self.go(1);
      }, this.autoplay);
    }
    stopAutoplay() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    }
    restartAutoplay() {
      this.stopAutoplay();
      this.startAutoplay();
    }
  }

  if (window.customElements) customElements.define('outfit-slider', OutfitSlider);
})();
