# V52 Cadastral Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-persistent, informational cadastral WMS overlay to the project editor without allowing parcel selection or changing project geometry.

**Architecture:** Keep the official WMS request builder and zoom policy in `src/cadastre.js`, while `src/map.js` owns the transient MapLibre image source and its lifecycle. A simple UI toggle in `src/desktop-ux.js` activates the overlay; `src/app.js` keeps this state in memory only, so project snapshots, shared views and PDFs remain unchanged.

**Tech Stack:** Vanilla JavaScript ES modules, MapLibre GL 4.7.1, Node test runner, LinkeDOM, CSS.

**Spec:** `docs/superpowers/specs/2026-09-26-cadastral-overlay-v52-design.md`

## Global Constraints

- The feature is available only in the main project editor.
- It is a visual overlay and must never mutate field geometry or persisted project state.
- It uses the official `CP.CadastralParcel` WMS layer as a transparent PNG.
- It is OFF whenever the editor is opened or reloaded.
- It is absent from administration, shared views, print preview and PDF output.
- Failures must leave all other map and editor functions operational.
- Display `Cartografia catastale — Agenzia delle Entrate · CC BY 4.0` while active.
- Display `Riferimento cartografico informativo. Non sostituisce visura catastale o rilievo dei confini.` while active.

## Review Focus

- Rapid pan/zoom sequences: only the current viewport may remain visible; covered by Task 2 map lifecycle tests.
- Toggle OFF during an in-flight image load: the layer must remain hidden; covered by Task 2 state transition tests.
- Zoom crossing the minimum threshold in both directions: requests start and stop predictably; covered by Tasks 1 and 2.
- Official service error or missing image: project geometry and editing stay intact; covered by Task 2 error-path tests.
- Legacy snapshots containing `map.cadastralVisible: true`: the editor must still open with Catasto OFF; covered by Task 3 persistence tests.

---

## File Structure

- Modify `src/cadastre.js`: WMS URL construction plus the pure minimum-zoom policy.
- Modify `src/map.js`: transient overlay lifecycle, layer ordering and non-blocking status callbacks.
- Modify `src/desktop-ux.js`: stateless accessible Catasto toggle controller.
- Modify `src/app.js`: in-memory toggle wiring with no persistence.
- Modify `src/state.js`: remove Catasto from new persisted state.
- Modify `src/backend.js`: ignore legacy Catasto visibility when restoring a project.
- Modify `src/mobile-ui.js`: stop routing the removed parcel-selection action into mobile tools.
- Modify `index.html`: replace the submenu with one toggle and add disclosure/attribution UI.
- Create `v52-cadastre.css`: overlay disclosure and toggle states for light and dark themes.
- Modify `tests/cadastre.test.mjs`: zoom policy and WMS regression coverage.
- Create `tests/release52-cadastre-ui.test.mjs`: DOM, toggle and persistence contract coverage.
- Create `tests/release52-cadastre-map-contract.test.mjs`: source/layer/error behavior contract coverage.
- Modify `package.json`: bump application version to `0.52.0`.

### Task 1: Define the cadastral rendering policy

**Files:**
- Modify: `src/cadastre.js`
- Modify: `tests/cadastre.test.mjs`

**Interfaces:**
- Produces: `CADASTRAL_MIN_ZOOM: number`.
- Produces: `cadastralOverlayPolicy({ visible, zoom }): { visible: boolean, renderable: boolean, reason: 'off'|'zoom'|'ready' }`.
- Preserves: `buildCadastralWmsUrl({ west, south, east, north, width, height }): string`.

- [x] **Step 1: Write failing policy tests**

Add tests asserting that OFF returns `reason: 'off'`, an active overlay below `CADASTRAL_MIN_ZOOM` returns `reason: 'zoom'`, and a finite zoom at or above the threshold returns `reason: 'ready'` with `renderable: true`. Add a non-finite zoom case that safely returns `reason: 'zoom'`.

- [x] **Step 2: Run the focused tests and verify failure**

Run: `node --test tests/cadastre.test.mjs`

Expected: FAIL because `CADASTRAL_MIN_ZOOM` and `cadastralOverlayPolicy` are not exported.

- [x] **Step 3: Implement the pure policy**

Implement the two exports in `src/cadastre.js`. Use a single named constant for the threshold and do not access MapLibre, DOM state or project state from this module.

- [x] **Step 4: Run focused tests**

Run: `node --test tests/cadastre.test.mjs`

Expected: all cadastral tests PASS.

- [x] **Step 5: Create a checkpoint**

Record Task 1 as complete in this plan. The supplied workspace has no Git metadata, so the distributable checkpoint will be the final V52 archive rather than an intermediate commit.

### Task 2: Make the MapLibre overlay transient and resilient

**Files:**
- Modify: `src/map.js`
- Create: `tests/release52-cadastre-map-contract.test.mjs`

**Interfaces:**
- Consumes: `buildCadastralWmsUrl(...)`, `CADASTRAL_MIN_ZOOM`, and `cadastralOverlayPolicy(...)` from Task 1.
- Produces: `setCadastralVisible(visible: boolean): void` on the map API.
- Produces callback payloads through `onCadastralState({ visible, renderable, loading, error, reason })`.
- Removes from the editor map API: `beginCadastralSelect()`.

- [x] **Step 1: Write failing map contract tests**

Add tests that inspect the module contract and a minimal MapLibre harness to assert:

- no WFS selection helpers are imported by `src/map.js`;
- `beginCadastralSelect` is not returned by `initMap`;
- refresh is gated by `cadastralOverlayPolicy`;
- crossing below the zoom threshold hides the existing cadastral layer;
- an error for `cadastre-image` reports `error: true` without calling geometry callbacks;
- the cadastral raster layer is inserted below field and row layers.

- [x] **Step 2: Run the focused test and verify failure**

Run: `node --test tests/release52-cadastre-map-contract.test.mjs`

Expected: FAIL because parcel selection remains connected and zoom/error state is not implemented.

- [x] **Step 3: Implement the overlay lifecycle**

In `src/map.js`, remove the interactive WFS selection path from the editor, gate WMS refresh through the policy, hide the raster when it is not renderable, and call `onCadastralState` on activation, loading completion, zoom gating, errors and deactivation. Preserve committed field visuals after refresh and keep the raster below project geometry and rows.

- [x] **Step 4: Protect against stale view updates**

Track the current overlay request/version inside `initMap`; ignore loading or error state emitted for an obsolete viewport or after the toggle has been switched OFF.

- [x] **Step 5: Run focused map and cadastral tests**

Run: `node --test tests/cadastre.test.mjs tests/release52-cadastre-map-contract.test.mjs`

Expected: all tests PASS.

- [x] **Step 6: Create a checkpoint**

Record Task 2 as complete in this plan.

### Task 3: Replace parcel selection with an accessible visual toggle

**Files:**
- Modify: `index.html`
- Modify: `src/desktop-ux.js`
- Modify: `src/app.js`
- Modify: `src/state.js`
- Modify: `src/backend.js`
- Modify: `src/mobile-ui.js`
- Create: `v52-cadastre.css`
- Create: `tests/release52-cadastre-ui.test.mjs`
- Modify: `tests/release37-project-map-ui.test.mjs`

**Interfaces:**
- Consumes: `setCadastralVisible(visible)` and `onCadastralState(...)` from Task 2.
- Produces: `createCadastreToggle({ document, isActive, setActive }): { mount(), sync(active) }`.
- Produces DOM nodes: `#cadastre-button`, `#cadastre-notice`, `#cadastre-attribution`.

- [x] **Step 1: Write failing DOM and controller tests**

Assert that the editor contains one `#cadastre-button`, contains no `#cadastre-menu` or `#select-cadastre-button`, and includes the exact attribution and disclaimer copy. Assert that clicking the toggle updates `aria-pressed`, the `.active` class and disclosure visibility without opening a menu.

- [x] **Step 2: Write failing persistence regression tests**

Assert that initial and backend-restored state do not contain a persisted `cadastralVisible` value, and that a legacy state with `map.cadastralVisible: true` cannot initialize the UI as active.

- [x] **Step 3: Run the focused tests and verify failure**

Run: `node --test tests/release37-project-map-ui.test.mjs tests/release52-cadastre-ui.test.mjs`

Expected: FAIL because the submenu and persisted visibility still exist.

- [x] **Step 4: Implement the toggle markup and controller**

Replace the `.cadastre-control` submenu in `index.html` with the single toggle. Add the two disclosure nodes, hidden by default. Replace `createCadastreMenu` with `createCadastreToggle` in `src/desktop-ux.js` and update imports and wiring in `src/app.js`.

- [x] **Step 5: Make visibility session-only**

Use an in-memory boolean in `src/app.js`; do not call `persist()` when toggling Catasto. Remove `cadastralVisible` from `createInitialState()` and restored backend state. Ignore any same-named value found in legacy local snapshots.

- [x] **Step 6: Connect disclosure and loading states**

Use `onCadastralState` to show the attribution/disclaimer while active, expose `aria-busy` during loading, show the exact zoom and error messages from the spec through the existing status surface, and clear temporary state on OFF.

- [x] **Step 7: Remove obsolete mobile selection routing**

Remove `#select-cadastre-button` from mobile tool movement and editing-state logic while leaving the Catasto visibility toggle available in the editor's layers sheet.

- [x] **Step 8: Add light/dark styling**

Create `v52-cadastre.css` with readable active, loading, attribution and disclaimer states in both themes. Link it after existing release CSS using `?v=52`.

- [x] **Step 9: Run focused UI tests**

Run: `node --test tests/release37-project-map-ui.test.mjs tests/release52-cadastre-ui.test.mjs`

Expected: all tests PASS.

- [x] **Step 10: Create a checkpoint**

Record Task 3 as complete in this plan.

### Task 4: Release verification and V52 package

**Files:**
- Modify: `package.json`
- Modify: `index.html`
- Create: `Configuratore_Vivai_Obice_V52.zip` outside the project directory.

**Interfaces:**
- Consumes: the completed V52 editor.
- Produces: a clean V52 distributable archive for the user's GitHub Desktop workflow.

- [x] **Step 1: Bump release identifiers**

Set `package.json` to `0.52.0`, update the visible test badge to `V52`, and update cache-busting query strings for changed JavaScript/CSS entry points to `v=52`.

- [x] **Step 2: Run syntax verification**

Run: `npm run check`

Expected: exit code 0.

- [x] **Step 3: Run the complete test suite**

Run: `npm test`

Expected: all tests PASS with zero failures.

- [x] **Step 4: Inspect release scope**

Run targeted searches confirming that `Trova particella`, `select-cadastre-button`, UI calls to `beginCadastralSelect`, and persisted `cadastralVisible` are absent, while the WMS endpoint, attribution and disclaimer remain present.

- [x] **Step 5: Build and inspect the archive**

Create `../Configuratore_Vivai_Obice_V52.zip`, excluding transient dependencies and prior ZIP files. Extract it into a temporary directory, run `npm install` if dependencies are absent, then run `npm run check` and `npm test` from the extracted copy.

- [ ] **Step 6: Perform manual browser checks**

Verify Satellite and Stradale with Catasto ON/OFF, low-zoom guidance, high-zoom alignment, pan/zoom/rotation refresh, dark-mode readability, mobile layers sheet, network-error fallback, and absence from print/shared/admin surfaces.

- [ ] **Step 7: Mark the plan complete**

Check every completed step only after its command or manual observation has supplied evidence.
