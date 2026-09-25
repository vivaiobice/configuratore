# Desktop Layout V38 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compattare la UI desktop e aggiungere selettori e calcolo rapido indipendenti senza cambiare mobile o formule.

**Architecture:** Le nuove interazioni desktop sono isolate in `src/desktop-ux.js`; `src/app.js` fornisce stato e callback. Il markup condiviso conserva il percorso mobile, mentre `desktop-v38.css` applica ordine e presentazione soltanto oltre il breakpoint desktop.

**Tech Stack:** HTML, CSS, JavaScript ES modules, MapLibre, Node test runner, LinkeDOM.

**Spec:** `docs/superpowers/specs/2026-09-23-desktop-layout-v38.md`

## Global Constraints

- Non modificare la UI mobile.
- Non modificare formule o conteggi.
- Non modificare il gruppo Tipo di mappa.
- Conservare gli ID funzionali esistenti.

## Review Focus

- I due selettori devono restare sincronizzati dopo selezione e rinomina.
- La selezione deve richiamare una sola volta caricamento e inquadramento.
- Il calcolo rapido non deve scrivere nel sesto del progetto.
- I controlli desktop aggiunti devono restare esclusi dalla UI mobile.
- Rotazioni e controllo MapLibre non devono condividere la stessa area.

---

### Task 1: Controller desktop per campi, ricerca e calcolo rapido

**Files:**
- Modify: `src/desktop-ux.js`
- Test: `tests/release38-desktop-layout.test.mjs`

**Interfaces:**
- Consumes: elementi `#field-select`, `#map-field-select`, `#map-search-button` e input del calcolo rapido.
- Produces: `createDesktopFieldSelectors`, `createDesktopMapSearchAction`, calcolo rapido aggiornato tramite callback.

- [ ] **Step 1: Write the failing tests**

Testare con LinkeDOM che entrambi i menu ricevano gli stessi campi, che il cambio invochi `onSelect(id)` una volta, che la lente focalizzi la ricerca e che i tre input del calcolo rapido producano il risultato senza leggere lo stato del progetto.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/release38-desktop-layout.test.mjs`
Expected: FAIL perché i nuovi controller e i nuovi elementi non esistono.

- [ ] **Step 3: Write minimal implementation**

Implementare controller DOM piccoli, senza dipendenze dalla UI mobile, e collegarli in `src/app.js` con una callback che usa `switchProjectField`, `loadActiveFieldOnMap` e `focusActiveField`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/release38-desktop-layout.test.mjs`
Expected: PASS.

### Task 2: Markup e ordine desktop

**Files:**
- Modify: `index.html`
- Modify: `src/app.js`
- Test: `tests/release38-desktop-layout.test.mjs`

**Interfaces:**
- Consumes: controller del Task 1.
- Produces: rail destra ordinata, selettore superiore, annata desktop, struttura avanzata ordinabile e card Gestione aree escluse.

- [ ] **Step 1: Write the failing structure tests**

Verificare gerarchia Editor → Posizionamento → Esclusioni, presenza della lente, selettore superiore, etichette richieste, sesto indipendente e gruppi avanzati.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/release38-desktop-layout.test.mjs`
Expected: FAIL sul primo requisito strutturale mancante.

- [ ] **Step 3: Write minimal markup and app bindings**

Inserire i nuovi elementi, preservare il controllo annata originale per mobile, sincronizzare il duplicato desktop e instradare l'avviso di meccanizzazione nel relativo spazio desktop.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/release38-desktop-layout.test.mjs`
Expected: PASS.

### Task 3: Layout CSS desktop V38

**Files:**
- Create: `desktop-v38.css`
- Modify: `index.html`
- Test: `tests/release38-desktop-layout.test.mjs`

**Interfaces:**
- Consumes: classi e gruppi del Task 2.
- Produces: rail compatta, label in slide, picker alto, ordine avanzato desktop e controlli inferiori non sovrapposti.

- [ ] **Step 1: Write the failing visual-contract tests**

Caricare il foglio con CSSOM e verificare rail a destra, pulsanti collassati/espandibili, rotazioni in basso a sinistra del controllo MapLibre, e media query che nasconde i soli elementi desktop.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/release38-desktop-layout.test.mjs`
Expected: FAIL perché `desktop-v38.css` non esiste.

- [ ] **Step 3: Write minimal CSS**

Applicare le regole solo desktop; nel breakpoint mobile nascondere picker, annata duplicata e lente desktop, lasciando il DOM mobile corrente invariato.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/release38-desktop-layout.test.mjs`
Expected: PASS.

### Task 4: Release e regressione completa

**Files:**
- Modify: `index.html`
- Modify: `README.md`
- Modify: `PROMPT_JOURNAL.md`
- Create: `V38-VERIFICA.md`

**Interfaces:**
- Consumes: implementazione verificata dei Task 1-3.
- Produces: release V38 tracciabile e pacchetto GitHub sotto 100 file.

- [ ] **Step 1: Run complete tests**

Run: `npm test`
Expected: tutti i test PASS.

- [ ] **Step 2: Run syntax checks**

Run: `npm run check`
Expected: exit 0.

- [ ] **Step 3: Update release metadata and journal**

Aggiornare badge/cache V38, README, journal e documento di verifica con l'elenco dei controlli eseguiti.

- [ ] **Step 4: Package and inspect**

Creare `configuratore-vivai-obice-v38-desktop-layout-github.zip`, verificare che contenga meno di 100 file e che non includa dipendenze o file temporanei.

