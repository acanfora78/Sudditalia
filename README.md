# Sudditalia Clothing — Tema Shopify

Tema **Shopify Online Store 2.0** per il brand streetwear italiano **Sudditalia Clothing**.
Costruito in **Liquid + HTML + CSS + vanilla JS** — nessun framework, nessun build step obbligatorio.

Identità visiva da campagna: intro cinematografica WebGL, parallax multi-livello, tilt 3D sulle card,
reveal on-scroll e micro-interazioni curate — il tutto senza sacrificare performance e accessibilità.

---

## ✨ Caratteristiche

- **Intro cinematografica "APNEA"** — immersione WebGL a schermo intero: acqua profonda, coni di luce volumetrici, caustiche e particolato, con uno squalo che emerge dall'ombra, respira, segue il cursore e affonda verso l'obiettivo per rivelare l'homepage. Una volta per sessione, con fermo immagine graduato come fallback automatico.
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
| **Squalo dell'intro** | Nessun asset da sostituire: la mesh è generata via codice. Per passare a un modello fotorealistico, carica un `.glb` in *Impostazioni → File* e incolla il link in Theme Editor → *Intro cinematografica → Modello GLB*. |
| **Colori dell'intro** | Theme Editor → *Intro cinematografica → Palette*: acqua, luce, accento (oro), pelle, testo. |
| **Logo header** | Theme Editor → *Header* → *Logo*. Se vuoto mostra il nome del negozio in stile display. |
| **Font** | Theme Editor → *Impostazioni tema → Tipografia*. Usa il selettore font nativo di Shopify (titoli + testo). Suggeriti font condensed/bold per i titoli. |
| **Colori** | Theme Editor → *Impostazioni tema → Colori*. Default brand: sfondo scuro `#0e0e10`, accento giallo/oro `#f2a900`. |
| **Immagini hero / editoriali / prodotti** | Impostabili per-sezione nel Theme Editor. |

L'intro non usa immagini: se ti serve un logo altrove, impostalo da *Header → Logo*.

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

### Sezione Intro cinematografica (signature)
- Attiva/disattiva l'intro; wordmark e testo dell'invito (default `DIVE INTO SUDDITALIA`, alternative `ENTER SUDDITALIA` / `WELCOME TO THE SOUTH`).
- **Scena 3D**: attiva/disattiva WebGL, audio all'ingresso, URL di un modello GLB opzionale.
- **Palette**: acqua profonda, luce, accento oro, pelle, testo.
- **Tempi**: quando compare l'invito (default 4500 ms) e durata dell'affondo (default 2200 ms).

**Concept.** Il principio è la sottrazione: lo schermo resta quasi nero e lo squalo non è mai
illuminato del tutto — si legge perché *occlude* i coni di luce, e la foschia esponenziale lo
dissolve nel nulla a distanza. La sequenza è in otto battute: nero → la luce si risolve dal buio →
qualcosa interrompe il fascio → il fianco taglia un raggio → resta a osservare (respira, muove le
pinne, segue il cursore) → compare l'invito → all'affondo la bocca si apre e il frame si riempie →
nero, e dalla completa oscurità riemerge l'homepage.

**Come funziona.** Tutto è procedurale: corpo (loft anatomico con ondulazione di nuoto nel vertex
shader), pinne, coni volumetrici, caustiche e particolato — nessun modello né texture da scaricare.
La catena di post-processing è scritta a mano (bright-pass → blur → composizione con distorsione
barile, aberrazione cromatica, grana e vignettatura): è ciò che dà il caratteristico "girato con un
obiettivo". Se imposti un URL GLB, il modello sostituisce la mesh procedurale mantenendo identiche
regia e sequenza. L'audio (fiotto d'acqua + sub) è **sintetizzato con Web Audio**: nessun file da
caricare, nessuna licenza, e parte sul click — che è un gesto utente, quindi non viene bloccato.

### Altre sezioni
Header, Hero parallax, Griglia prodotti, Collection showcase, Manifesto/Quote, Marquee ticker,
Prodotto, Collezione, Footer, Testo libero — ognuna con le proprie impostazioni (colori, testi,
immagini, toggle animazioni).

---

## ♿ Accessibilità e performance

- **`prefers-reduced-motion`**: chi lo richiede salta del tutto il percorso WebGL e l'audio, e vede il fermo immagine con dissolvenze semplici.
- **Fallback automatico**: se WebGL manca, il renderer è software (SwiftShader/llvmpipe, che girerebbe a pochi fps) o il modulo non si carica, resta il **fermo immagine graduato in CSS** — nero, coni di luce sfumati, vignettatura. È una composizione finita, non un errore, e l'utente può sempre entrare.
- **LCP e TBT**: la prima immagine è puro CSS e compare istantaneamente; three.js e la compilazione degli shader partono **dopo l'evento `load`** (in `requestIdleCallback`), quindi non entrano nel Total Blocking Time. L'attesa non è tempo morto: la prima battuta del concept è comunque schermo nero.
- **Tier adattivi**: densità della mesh, particelle, numero di coni, risoluzione di rendering e bloom si riducono automaticamente su viewport piccole o dispositivi con poca memoria/CPU.
- **Teardown completo**: a fine intro geometrie, materiali, render target e contesto WebGL vengono liberati (`loseContext`), così l'homepage gira pulita.
- **Nessuna dipendenza esterna a runtime**: `three.module.js` è **vendorizzato in `assets/`** e risolto con un `<script type="importmap">`. Niente origini di terze parti, niente problemi di CSP, e la cache è quella del CDN Shopify. Viene scaricato solo quando l'intro 3D è ammissibile e una sola volta per sessione.
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
sections/        intro-cinematic, header, footer, hero-parallax, featured-collection,
                 collection-showcase, manifesto-quote, marquee-ticker, main-product,
                 main-collection, main-cart, main-*, rich-text
snippets/        product-card, responsive-image, icon, meta-tags
templates/       *.json (OS 2.0) + customers/*.liquid + gift_card.liquid
assets/          base.css, animations.css, theme.js,
                 intro-cinematic.js, intro-cinematic-3d.js,
                 three.module.js, GLTFLoader.js, BufferGeometryUtils.js  (vendorizzati)
                 parallax.js, text-reveal.js, product-card.js, product-gallery.js,
                 custom-cursor.js
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
