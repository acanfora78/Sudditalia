# Sudditalia Clothing — Tema Shopify

Tema **Shopify Online Store 2.0** per il brand streetwear italiano **Sudditalia Clothing**.
Costruito in **Liquid + HTML + CSS + vanilla JS** — nessun framework, nessun build step obbligatorio.

Identità visiva "stramovimentata": intro 3D signature, parallax multi-livello, tilt 3D sulle card,
reveal on-scroll e micro-interazioni curate — il tutto senza sacrificare performance e accessibilità.

---

## ✨ Caratteristiche

- **Intro signature "inghiottito dallo squalo"** — overlay 3D a schermo intero (una volta per sessione).
- **Parallax multi-livello** su hero e sezioni editoriali.
- **Card prodotto con tilt 3D** (desktop) e crossfade fronte/retro all'hover.
- **Galleria prodotto 3D** con zoom e selezione varianti fluida.
- **Reveal del testo** parola-per-parola sui manifesti.
- **Marquee/ticker** a scorrimento infinito.
- **Cursore personalizzato** opzionale (desktop).
- **100% configurabile dal Theme Editor** — ogni sezione ha il suo `{% schema %}`.
- **Accessibile e performante** — rispetta `prefers-reduced-motion`, lazy-load, dimensioni esplicite (no CLS), degradazione senza JS.

---

## 🚀 Come caricare il tema su Shopify

### Opzione A — Shopify CLI (consigliata per lo sviluppo)

1. Installa la [Shopify CLI](https://shopify.dev/docs/themes/tools/cli/install).
2. Autenticati e avvia il tema in locale collegato al tuo store:
   ```bash
   shopify theme dev --store il-tuo-store.myshopify.com
   ```
   Si aprirà un'anteprima live con hot-reload.
3. Per caricare il tema nel negozio (come tema non pubblicato):
   ```bash
   shopify theme push --unpublished
   ```

### Opzione B — Upload via ZIP

1. Comprimi il contenuto della cartella del tema in un file `.zip`
   (la radice dello zip deve contenere `config/`, `layout/`, `sections/`, ecc., **non** una cartella che li contiene).
   ```bash
   zip -r sudditalia-theme.zip . -x ".git/*" ".github/*" "node_modules/*"
   ```
2. Nell'admin Shopify: **Negozio online → Temi → Aggiungi tema → Carica file ZIP**.
3. Seleziona lo zip e conferma.

---

## 🎨 Sostituire gli asset placeholder

| Asset | Dove si cambia |
|-------|----------------|
| **Logo squalo dell'intro** | Theme Editor → sezione *Intro Squalo* → *Immagine squalo*. Se lasciato vuoto usa `assets/shark-logo-placeholder.svg`. Puoi anche sostituire direttamente quel file. |
| **Logo header** | Theme Editor → *Header* → *Logo*. Se vuoto mostra il nome del negozio in stile display. |
| **Font** | Theme Editor → *Impostazioni tema → Tipografia*. Usa il selettore font nativo di Shopify (titoli + testo). Suggeriti font condensed/bold per i titoli. |
| **Colori** | Theme Editor → *Impostazioni tema → Colori*. Default brand: sfondo scuro `#0e0e10`, accento giallo/oro `#f2a900`. |
| **Immagini hero / editoriali / prodotti** | Impostabili per-sezione nel Theme Editor. |

Per usare un logo diverso senza passare dal Theme Editor, sostituisci il file
`assets/shark-logo-placeholder.svg` mantenendo lo stesso nome (o carica un PNG/SVG e collegalo dalla sezione Intro).

---

## ⚙️ Impostazioni disponibili nel Theme Editor

### Impostazioni globali (Impostazioni tema)
- **Colori** — sfondo, testo, accento, testo su accento, secondario, bordi, gradiente accento.
- **Tipografia** — font titoli e testo (selettore Shopify), scala titoli, dimensione base, maiuscolo on/off.
- **Layout** — larghezza contenuto, spazio tra sezioni, raggio angoli.
- **Animazioni & 3D**
  - `Abilita animazioni` — interruttore globale (modalità leggera).
  - `Abilita effetti 3D` — tilt, parallax, galleria.
  - `Velocità animazioni` e `Intensità effetti 3D` (slider).
  - `Cursore personalizzato` (desktop, off di default).
- **Social** — URL Instagram, TikTok, Facebook, YouTube.

### Sezione Intro Squalo (signature)
- Attiva/disattiva l'intro.
- Immagine squalo, testo invito.
- Colore sfondo centro/bordi (default azzurro mare `#4FB6E8` → `#1C5C82`).
- Colore "bocca" durante l'inghiottimento (buio caldo `#5a140c`).
- Colore testo, durata sequenza (1200–2400 ms).

### Altre sezioni
Header, Hero parallax, Griglia prodotti, Collection showcase, Manifesto/Quote, Marquee ticker,
Prodotto, Collezione, Footer, Testo libero — ognuna con le proprie impostazioni (colori, testi,
immagini, toggle animazioni).

---

## ♿ Accessibilità e performance

- **`prefers-reduced-motion`**: chi lo richiede vede versioni statiche / dissolvenze semplici al posto delle animazioni 3D.
- **Modalità leggera**: disattiva tutte le animazioni da *Impostazioni tema → Animazioni & 3D*.
- **Mobile-first**: gli effetti hover (tilt) sono rimpiazzati da reveal on-scroll su touch; parallax degradato.
- **Senza JavaScript**: il contenuto resta accessibile e navigabile. L'intro **non** blocca l'accesso
  (l'overlay parte nascosto e viene mostrato solo dallo script; senza JS resta nascosto).
- **Immagini**: `srcset`, `sizes`, `width`/`height` espliciti (no layout shift), `loading="lazy"`.
- **Font**: `preconnect` a Shopify CDN + `font-display: swap`.

---

## 🧩 Struttura del progetto

```
config/          settings_schema.json, settings_data.json
layout/          theme.liquid, password.liquid
locales/         it.default.json
sections/        intro-shark, header, footer, hero-parallax, featured-collection,
                 collection-showcase, manifesto-quote, marquee-ticker, main-product,
                 main-collection, main-cart, main-*, rich-text
snippets/        product-card, responsive-image, icon, meta-tags
templates/       *.json (OS 2.0) + customers/*.liquid + gift_card.liquid
assets/          base.css, animations.css, theme.js, intro-shark.js, parallax.js,
                 text-reveal.js, product-card.js, product-gallery.js, custom-cursor.js,
                 shark-logo-placeholder.svg
```

---

## ✅ Validazione

Il tema è pensato per passare `shopify theme check` senza errori bloccanti:

```bash
shopify theme check
```

La configurazione è in `.theme-check.yml`.

---

## 🛠️ Note per sviluppatori

- Nessun build step richiesto: il JS è vanilla e compatibile con i browser moderni.
- Gli script sono caricati con `defer` e non bloccano il rendering.
- Le animazioni leggono `--anim-speed` e `--anim-intensity` (variabili CSS) impostate dal Theme Editor.
- I flag globali sono esposti in `window.SudditaliaTheme` e come classi su `<html>` (`no-animations`, `no-3d`, `is-touch`).
