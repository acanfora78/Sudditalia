/* ==========================================================================
   Sudditalia Clothing — product-gallery.js
   Galleria prodotto con transizioni 3D, thumbnail, zoom lightbox e
   aggiornamento variante (prezzo, disponibilità, immagine).
   ========================================================================== */
(function () {
  'use strict';

  function initGallery(scope) {
    var gallery = scope.querySelector('[data-product-gallery]');
    if (!gallery || gallery.dataset.ready === 'true') return;
    gallery.dataset.ready = 'true';

    var slides = gallery.querySelectorAll('[data-slide]');
    var thumbs = gallery.querySelectorAll('[data-thumb]');
    var stage = gallery.querySelector('[data-gallery-stage]');

    function show(index) {
      slides.forEach(function (s) {
        s.classList.toggle('is-active', s.getAttribute('data-slide') == index);
      });
      thumbs.forEach(function (t) {
        var on = t.getAttribute('data-thumb') == index;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }

    thumbs.forEach(function (thumb) {
      thumb.addEventListener('click', function () { show(thumb.getAttribute('data-thumb')); });
    });

    // Navigazione da tastiera tra le thumbnail
    gallery.addEventListener('keydown', function (e) {
      if (!thumbs.length) return;
      var active = gallery.querySelector('.product-gallery__thumb.is-active');
      var i = active ? parseInt(active.getAttribute('data-thumb'), 10) : 0;
      if (e.key === 'ArrowRight') { show(Math.min(i + 1, thumbs.length - 1)); }
      else if (e.key === 'ArrowLeft') { show(Math.max(i - 1, 0)); }
    });

    // --- Zoom lightbox ---
    var lightbox = scope.querySelector('[data-zoom-lightbox]');
    if (stage && stage.hasAttribute('data-zoomable') && lightbox) {
      var img = lightbox.querySelector('[data-zoom-img]');
      stage.addEventListener('click', function () {
        var active = gallery.querySelector('.product-gallery__slide.is-active');
        if (!active) return;
        img.src = active.getAttribute('data-full') || '';
        lightbox.classList.add('is-open');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      });
      function close() {
        lightbox.classList.remove('is-open');
        lightbox.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }
      lightbox.addEventListener('click', close);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    }

    return show;
  }

  function initVariants(scope) {
    var form = scope.querySelector('[data-product-form]');
    if (!form || form.dataset.ready === 'true') return;
    form.dataset.ready = 'true';

    var dataEl = form.querySelector('[data-variants]');
    if (!dataEl) return;
    var variants;
    try { variants = JSON.parse(dataEl.textContent); } catch (e) { return; }

    var select = form.querySelector('[data-variant-select]');
    var addBtn = form.querySelector('[data-add-btn]');
    var addText = form.querySelector('[data-add-text]');
    var priceCurrent = scope.querySelector('[data-price-current]');
    var priceCompare = scope.querySelector('[data-price-compare]');
    var gallery = scope.querySelector('[data-product-gallery]');
    var strings = (window.SudditaliaTheme && window.SudditaliaTheme.strings) || {};

    function money(cents) {
      // Formattazione semplice; Shopify money filter già applicato all'iniziale.
      return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'EUR' });
    }

    function selectedOptions() {
      var opts = [];
      form.querySelectorAll('input[type="radio"]:checked[data-option-index]').forEach(function (input) {
        opts[parseInt(input.getAttribute('data-option-index'), 10) - 1] = input.value;
      });
      return opts;
    }

    function findVariant(opts) {
      return variants.find(function (v) {
        return v.options.every(function (o, i) { return o === opts[i]; });
      });
    }

    function update() {
      var opts = selectedOptions();
      if (!opts.length) return;
      var variant = findVariant(opts);

      if (!variant) {
        addBtn.disabled = true;
        if (addText) addText.textContent = strings.unavailable || 'Non disponibile';
        return;
      }

      if (select) select.value = variant.id;

      // Disponibilità
      addBtn.disabled = !variant.available;
      if (addText) addText.textContent = variant.available ? (strings.add || 'Aggiungi al carrello') : (strings.soldout || 'Esaurito');

      // Prezzo
      if (priceCurrent) priceCurrent.textContent = money(variant.price);
      if (priceCompare) {
        if (variant.compare_at_price && variant.compare_at_price > variant.price) {
          priceCompare.textContent = money(variant.compare_at_price);
          priceCompare.style.display = '';
        } else {
          priceCompare.style.display = 'none';
        }
      }

      // Immagine variante → mostra la slide corrispondente con transizione 3D
      if (variant.featured_media && gallery) {
        var slide = gallery.querySelector('[data-slide="' + variant.featured_media.position + '"]')
                 || gallery.querySelector('[data-slide]');
        if (variant.featured_media.position != null) {
          var target = variant.featured_media.position - 1;
          var thumb = gallery.querySelector('[data-thumb="' + target + '"]');
          if (thumb) thumb.click();
        }
      }

      // Aggiorna l'URL con la variante (senza reload)
      if (history.replaceState) {
        var url = new URL(window.location.href);
        url.searchParams.set('variant', variant.id);
        history.replaceState({}, '', url.toString());
      }
    }

    form.addEventListener('change', function (e) {
      if (e.target.matches('input[type="radio"][data-option-index]')) update();
    });
  }

  function init() {
    document.querySelectorAll('.product-gallery, [data-product-form]').forEach(function () {});
    var sections = document.querySelectorAll('[data-hero-unfold]');
    // Inizializza a livello di documento (una pagina prodotto = un blocco)
    initGallery(document);
    initVariants(document);
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('shopify:section:load', function (e) {
    initGallery(e.target);
    initVariants(e.target);
  });
})();
