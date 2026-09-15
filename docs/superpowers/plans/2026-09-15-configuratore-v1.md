# Configuratore V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire una V1 pubblicabile del Configuratore Vivai Obice con mappa, perimetro modificabile, misure, sesto, simulazione filari, Catasto overlay, autosalvataggio e fondamenta per Supabase/admin/PDF.

**Architecture:** Front-end statico modulare, pubblicabile su GitHub Pages. MapLibre GL JS gestisce la mappa; Mapbox GL Draw gestisce disegno/modifica del perimetro; moduli JS puri calcolano geometria, filari e quantità. Le integrazioni esterne (geocoding, Catasto, Supabase) sono isolate dietro adapter sostituibili.

**Tech Stack:** HTML5, CSS, JavaScript ES modules, MapLibre GL JS, Mapbox GL Draw, Node built-in test runner, Supabase/PostgreSQL/PostGIS nelle milestone backend.

**Spec:** `docs/superpowers/specs/2026-09-14-configuratore-design.md`

## Global Constraints

- Nessuna dipendenza da Wix.
- Pubblicazione statica compatibile GitHub Pages.
- Mobile-first, mappa prioritaria.
- Ambiente predefinito TEST.
- Nessuna service-role key nel frontend.
- GPS soltanto su azione esplicita.
- Catasto deve degradare senza bloccare il disegno manuale.
- Valore piante teoriche separato dalla quantità commerciale arrotondata a multipli di 25.

---

### Task 1: Shell applicazione e test harness

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `src/app.js`
- Create: `src/state.js`
- Create: `tests/state.test.mjs`
- Create: `package.json`

**Interfaces:**
- Produces: `createInitialState()`, `mergeProjectState(current, patch)`.

- [ ] Scrivere test fallenti per stato iniziale e merge immutabile.
- [ ] Eseguire `npm test` e verificare RED.
- [ ] Implementare il minimo necessario.
- [ ] Eseguire `npm test` e verificare GREEN.
- [ ] Creare shell HTML/CSS responsive e commit.

### Task 2: Motore geometrico e calcoli commerciali

**Files:**
- Create: `src/geometry.js`
- Create: `tests/geometry.test.mjs`

**Interfaces:**
- Produces: `roundUpTo25(value)`, `polygonMetrics(coords)`, `generateRows(coords, rowSpacingM, orientationDeg)`, `estimatePlantsFromRows(rows, plantSpacingM)`.

- [ ] Testare arrotondamento, area/perimetro, filari e conteggio piante.
- [ ] Verificare RED.
- [ ] Implementare funzioni pure.
- [ ] Verificare GREEN e casi concavi di base.
- [ ] Commit.

### Task 3: Mappa, ricerca, GPS, disegno e modifica perimetro

**Files:**
- Create: `src/map.js`
- Modify: `src/app.js`
- Modify: `index.html`
- Modify: `styles.css`
- Create: `tests/map-adapters.test.mjs`

**Interfaces:**
- Produces: `initMap({container,onGeometryChange,onSearchResult,onGps})`, `setBaseMap(kind)`, `setRowsGeoJSON(fc)`, `setCadastralVisible(visible)`.

- [ ] Testare gli adapter puri di geocoding/GPS fallback.
- [ ] Verificare RED.
- [ ] Implementare MapLibre + Draw con edit vertici.
- [ ] Collegare ricerca testuale e GPS.
- [ ] Smoke test statico e commit.

### Task 4: Sesto, orientamento e simulazione live

**Files:**
- Modify: `src/app.js`
- Modify: `index.html`
- Modify: `styles.css`
- Create: `tests/project-calculator.test.mjs`
- Create: `src/project-calculator.js`

**Interfaces:**
- Produces: `calculateProject({polygon,rowSpacingM,plantSpacingM,orientationDeg})`.

- [ ] Scrivere test per ricalcolo e fallback formula superficie.
- [ ] Verificare RED.
- [ ] Implementare calcolo progetto.
- [ ] Collegare UI con aggiornamento live.
- [ ] Verificare GREEN e commit.

### Task 5: Catasto overlay e adapter

**Files:**
- Create: `src/cadastre.js`
- Modify: `src/map.js`
- Create: `tests/cadastre.test.mjs`

**Interfaces:**
- Produces: `buildCadastralWmsUrl(template)`, `normalizeCadastralFeature(feature)`.

- [ ] Testare costruzione URL WMS e normalizzazione feature.
- [ ] Verificare RED.
- [ ] Implementare overlay ON/OFF con fallback non bloccante.
- [ ] Verificare GREEN e commit.

### Task 6: Autosalvataggio, consenso e contatti

**Files:**
- Create: `src/storage.js`
- Create: `src/privacy.js`
- Modify: `src/app.js`
- Create: `tests/storage.test.mjs`

**Interfaces:**
- Produces: `loadDraft()`, `saveDraft(project)`, `newSessionId()`, `getConsentState()`, `setConsentState(state)`.

- [ ] Testare serializzazione/versionamento e session ID.
- [ ] Verificare RED.
- [ ] Implementare storage locale e banner consenso.
- [ ] Aggiungere form contatto con Azienda/Nome/Cognome/Telefono/E-mail obbligatori per azioni finali.
- [ ] Verificare GREEN e commit.

### Task 7: Fondamenta Supabase, PDF e admin

**Files:**
- Create: `supabase/schema.sql`
- Create: `src/backend.js`
- Create: `admin/index.html`
- Create: `admin/admin.js`
- Create: `src/pdf-model.js`
- Create: `tests/pdf-model.test.mjs`

**Interfaces:**
- Produces: schema RLS TEST/LIVE, `projectToPdfModel(project)`, adapter backend senza chiavi privilegiate.

- [ ] Testare modello PDF.
- [ ] Verificare RED/GREEN.
- [ ] Scrivere schema PostgreSQL/PostGIS e policy.
- [ ] Creare shell admin protetta lato Auth adapter.
- [ ] Commit.

### Task 8: Hardening e release candidate

**Files:**
- Modify: `README.md`
- Create: `docs/DEPLOY.md`

**Interfaces:** nessuna nuova API.

- [ ] Eseguire tutti i test.
- [ ] Eseguire `node --check` su tutti i moduli.
- [ ] Eseguire `git diff --check`.
- [ ] Smoke test via server HTTP locale.
- [ ] Documentare GitHub Pages, DNS custom domain e variabili Supabase.
- [ ] Commit release candidate.
