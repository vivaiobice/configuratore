# V54 Admin Maps and Field Cadastral References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add field-level manual cadastral references and make both Admin maps show complete vineyard geometry, rotation and independent cadastral identification.

**Architecture:** Keep `cadastralRefs` inside each existing field object and normalize it through a small pure module. Add a focused editor controller to the configurator, a pure Admin map-data builder for polygons/exclusions/rows, and one reusable Admin cadastral controller mounted independently on every MapLibre instance. Existing snapshot, `field_plans` and `project_fields.design_data` persistence remain the transport and storage layer.

**Tech Stack:** Vanilla ES modules, MapLibre GL 4.7.1, Node test runner, LinkeDOM, existing Supabase project storage and Edge Function.

**Spec:** `docs/superpowers/specs/2026-09-26-v54-admin-cadastre-field-references-design.md`

## Global Constraints

- Release target is TEST `V54` / package `0.54.0`.
- No database migration, new RPC, new RLS policy or new public permission.
- Catasto opacity in Admin is fixed at `0.6`; no Admin opacity slider.
- Parcel identification starts after a three-second dwell and uses the existing constrained `cadastral-wms` Edge Function.
- Cadastral sheet layers stay disabled; only parcel imagery is requested from zoom 16.
- Manual reference fields are `municipality`, `sheet`, `parcel`, with `source:"manual"`.
- Geometry editing must not clear field cadastral references.
- Existing legacy `{id, reference}` cadastral objects must survive load/save unchanged.
- Main Admin row and label layers start at zoom 13.
- No new runtime dependency.
- The current workspace is a source package without `.git`; use passing test checkpoints in place of local commits and produce the final ZIP for the user's GitHub Desktop workflow.

## Review Focus

- Mixed legacy and manual references: normalization must trim manual values without altering opaque legacy objects; covered in Task 1 tests.
- Rapid switching among fields: each field must retain only its own editor rows and no render callback may overwrite another field; covered in Task 2 tests.
- Multiple open Admin detail maps: Catasto state, status text and cleanup must stay map-local; covered in Task 5 tests.
- Invalid geometry/exclusions among many filtered fields: valid fields still render and invalid shapes are skipped without throwing; covered in Task 4 tests.
- Low zoom, network error and moved pointer during cadastral dwell: no stale parcel result may be shown; covered in Task 5 tests.

---

## File Structure

- Create `src/cadastral-references.js`: normalize, deduplicate and format field cadastral references.
- Create `src/cadastral-reference-editor.js`: render and control repeated manual reference rows.
- Create `v54-cadastral-references.css`: configurator styles for the repeated editor.
- Create `admin/admin-map-data.js`: pure preparation of Admin polygon, exclusion and row GeoJSON.
- Create `admin/admin-cadastre.js`: reusable fixed-opacity overlay and dwell-identify controller for one Admin map.
- Create `admin/admin-v54.css`: Admin map controls, status disclosures and read-only reference styles.
- Modify `src/app.js`, `index.html`, `src/fields.js`: mount the editor, preserve per-field values and stop geometry actions clearing references.
- Modify `admin/admin-model.js`, `admin/admin-views.js`, `admin/admin-map.js`, `admin/admin-field-map.js`, `admin/admin.js`, `admin/index.html`: expose field names/references and wire enhanced maps.
- Modify versioned entry points, `package.json`, `package-lock.json`, `README.md`; add `V54-VERIFICA.md`.
- Add `tests/release54-admin-cadastre-references.test.mjs`; extend existing field, backend, Admin model/view/map and integration tests.

### Task 1: Normalize and round-trip cadastral references

**Files:**
- Create: `src/cadastral-references.js`
- Modify: `src/fields.js`
- Test: `tests/release54-admin-cadastre-references.test.mjs`
- Test: `tests/backend.test.mjs`
- Test: `tests/cloud-project-model.test.mjs`

**Interfaces:**
- Produces: `normalizeCadastralReferences(value) -> Array<object>`.
- Produces: `manualCadastralReference({municipality,sheet,parcel}) -> object|null`.
- Produces: `formatCadastralReference(reference) -> string`.
- `createDefaultField` and `ensureProjectFields` consume the normalizer for `cadastralRefs`.

- [ ] **Step 1: Write failing normalization tests**

Add tests named:

- `manual cadastral references trim values, discard empty rows and collapse duplicates`;
- `legacy cadastral references survive normalization unchanged`;
- `two project fields retain independent cadastral reference arrays`.

Assert literal normalized objects and verify case-insensitive duplicate collapse.

- [ ] **Step 2: Run the new tests and confirm RED**

Run: `node --test tests/release54-admin-cadastre-references.test.mjs`  
Expected: FAIL because `src/cadastral-references.js` does not exist.

- [ ] **Step 3: Implement the pure reference helpers**

Implement the three exported functions in `src/cadastral-references.js`. Preserve every non-manual legacy object as a cloned object; normalize only objects containing manual keys or `source:"manual"`.

- [ ] **Step 4: Normalize references at the field boundary**

Update `createDefaultField` so every field receives its own normalized array and never shares an input array by reference.

- [ ] **Step 5: Add persistence round-trip assertions**

Extend backend/cloud tests with two manual references on one field and one legacy reference on another. Assert `buildCloudSnapshot`, `snapshotToFieldRows`, `toProjectRow` and `projectPayloadToState` retain the values.

- [ ] **Step 6: Verify Task 1 GREEN**

Run: `node --test tests/release54-admin-cadastre-references.test.mjs tests/backend.test.mjs tests/cloud-project-model.test.mjs tests/fields.test.mjs`  
Expected: all selected tests PASS.

- [ ] **Step 7: Checkpoint Task 1**

Record passing command/output in the working log; no local commit is possible because the supplied workspace has no Git metadata.

### Task 2: Repeated cadastral-reference editor per field

**Files:**
- Create: `src/cadastral-reference-editor.js`
- Create: `v54-cadastral-references.css`
- Modify: `index.html`
- Modify: `src/app.js`
- Test: `tests/release54-admin-cadastre-references.test.mjs`
- Test: `tests/release36-desktop-ux.test.mjs`

**Interfaces:**
- Consumes: `normalizeCadastralReferences` and `manualCadastralReference` from Task 1.
- Produces: `createCadastralReferenceEditor({document,container,onChange}) -> {render(refs,{municipality}),destroy()}`, where `container` is the resolved editor element rather than a selector string.
- Emits: a complete normalized `cadastralRefs` array to `onChange(refs)` only after a user action.

- [ ] **Step 1: Write failing editor behavior tests**

Using LinkeDOM, assert:

- initial empty state renders one row prefilled with the supplied municipality but emits nothing;
- `+ Aggiungi mappale` adds an independent row;
- editing emits trimmed references;
- removing the last row leaves one empty UI row and emits `[]`;
- rerendering for a second field replaces the visible values without mutating the first field's array.

- [ ] **Step 2: Run the editor tests and confirm RED**

Run: `node --test tests/release54-admin-cadastre-references.test.mjs`  
Expected: FAIL because the editor export and markup are missing.

- [ ] **Step 3: Implement the editor controller**

Use native inputs/buttons, numbered accessible labels and event delegation scoped to the supplied container. Keep one empty presentation row when there are no stored entries.

- [ ] **Step 4: Mount under planting lifecycle controls**

Add `#cadastral-reference-editor` and `#add-cadastral-reference` inside `advanced-information`, immediately after the desktop year/status row. Mount once in `app.js`; call `render` from `syncProjectControls` and active-field loading.

- [ ] **Step 5: Preserve references during geometry actions**

Remove `cadastralRefs:[]` from `startDrawingField` and the clear-geometry action. Field deletion continues to delete its references because the entire field is removed.

- [ ] **Step 6: Style desktop and responsive layouts**

In `v54-cadastral-references.css`, use three columns plus remove action on desktop and a single-column stack on narrow screens. Add light/dark colors consistent with `advanced-information`.

- [ ] **Step 7: Verify Task 2 GREEN**

Run: `node --test tests/release54-admin-cadastre-references.test.mjs tests/release36-desktop-ux.test.mjs tests/mobile-ui.test.mjs`  
Expected: all selected tests PASS.

- [ ] **Step 8: Checkpoint Task 2**

Record passing command/output in the working log.

### Task 3: Admin wording, field-name column and read-only cadastral references

**Files:**
- Modify: `admin/index.html`
- Modify: `admin/admin-model.js`
- Modify: `admin/admin-views.js`
- Create: `admin/admin-v54.css`
- Test: `tests/admin-views.test.mjs`
- Test: `tests/admin-model.test.mjs`
- Test: `tests/release54-admin-cadastre-references.test.mjs`

**Interfaces:**
- Consumes: `formatCadastralReference` from Task 1.
- `expandProjectFields` produces `cadastralRefs:Array<object>` on every Admin field row.
- `fieldGrid(row)` renders the same read-only reference block in top-level and nested field detail.

- [ ] **Step 1: Write failing Admin presentation tests**

Assert that:

- `#admin-logout` reads `Logout`;
- Fields headers start with `Data progetto`, `Nome del campo`, `Nome progetto`;
- a row renders its field label in the second cell;
- complete, incomplete and legacy references render without invented values;
- an empty list displays `Nessun riferimento catastale inserito`.

- [ ] **Step 2: Run the Admin view/model tests and confirm RED**

Run: `node --test tests/admin-views.test.mjs tests/admin-model.test.mjs tests/release54-admin-cadastre-references.test.mjs`  
Expected: FAIL on missing column/reference output and old `Esci` text.

- [ ] **Step 3: Expose normalized references in Admin rows**

Update `expandProjectFields` to normalize `field.cadastralRefs` with a top-level `project.cadastral_refs` fallback only for a true single-field legacy project.

- [ ] **Step 4: Update Admin columns and read-only detail**

Insert the field label formatter second in `COLUMNS.fields`. Add a semantic `Riferimenti catastali` block to `fieldGrid`; reuse it automatically in nested field panels.

- [ ] **Step 5: Apply wording and focused styling**

Change the button copy to `Logout`, link `admin/admin-v54.css`, and style the reference list without changing existing table/detail sizing.

- [ ] **Step 6: Verify Task 3 GREEN**

Run: `node --test tests/admin-views.test.mjs tests/admin-model.test.mjs tests/release54-admin-cadastre-references.test.mjs`  
Expected: all selected tests PASS.

- [ ] **Step 7: Checkpoint Task 3**

Record passing command/output in the working log.

### Task 4: Complete Main Admin geometry and rotation

**Files:**
- Create: `admin/admin-map-data.js`
- Modify: `admin/admin-map.js`
- Modify: `admin/admin.js`
- Modify: `admin/admin-field-map.js`
- Test: `tests/admin-map.test.mjs`
- Test: `tests/admin-field-map.test.mjs`
- Test: `tests/release54-admin-cadastre-references.test.mjs`

**Interfaces:**
- Produces: `buildAdminMapData(fieldRows) -> {fields,exclusions,rows}` where every property is a GeoJSON FeatureCollection.
- Produces: `buildAdminFieldPreviewData(row)` from `admin-map-data.js`; `admin-field-map.js` re-exports it for compatibility.
- `initAdminMap().setFields(fieldRows)` replaces project-only geometry input.

- [ ] **Step 1: Write failing pure map-data tests**

Use one valid field with one exclusion and known spacing. Assert one field polygon, one red-exclusion polygon, non-empty row line strings and label properties. Add invalid field/exclusion fixtures and assert valid siblings still return without throwing.

- [ ] **Step 2: Run the map tests and confirm RED**

Run: `node --test tests/admin-map.test.mjs tests/admin-field-map.test.mjs tests/release54-admin-cadastre-references.test.mjs`  
Expected: FAIL because `buildAdminMapData` and `setFields` do not exist.

- [ ] **Step 3: Implement the pure map-data builder**

Call existing `calculateProject` once per valid field row. Keep field/project IDs on every derived feature so selection remains stable.

- [ ] **Step 4: Add Main Admin sources and ordered layers**

Create sources for fields, exclusions and rows. Use red fill/line for exclusions, white row lines from zoom 13, yellow field boundary and labels from zoom 13. Preserve feature-state selection on the field polygon source.

- [ ] **Step 5: Wire filtered field rows directly**

Replace `projectsToFeatureCollection(mapProjectsForFields(...))` with `adminMap.setFields(data.fieldRows)` and remove the now-unused adapter from `admin.js` only.

- [ ] **Step 6: Enable rotation on both maps**

Use a visible compass in both NavigationControls and explicitly enable drag rotation plus touch rotation. Keep zoom buttons and GPS behavior unchanged.

- [ ] **Step 7: Make detail rows pure white**

Change the detail row layer color to `#ffffff`; preserve red exclusions and yellow boundary.

- [ ] **Step 8: Verify Task 4 GREEN**

Run: `node --test tests/admin-map.test.mjs tests/admin-field-map.test.mjs tests/release54-admin-cadastre-references.test.mjs`  
Expected: all selected tests PASS.

- [ ] **Step 9: Checkpoint Task 4**

Record passing command/output in the working log.

### Task 5: Reusable Catasto controller for every Admin map

**Files:**
- Create: `admin/admin-cadastre.js`
- Modify: `admin/admin-map.js`
- Modify: `admin/admin-field-map.js`
- Modify: `admin/admin-v54.css`
- Test: `tests/admin-cadastre.test.mjs`
- Test: `tests/admin-map.test.mjs`
- Test: `tests/admin-field-map.test.mjs`

**Interfaces:**
- Produces: `mountAdminCadastre({map,container,beforeLayerId,fetchImpl}) -> {setActive(active),isActive(),destroy()}`, where `container` is the resolved map-wrapper element owned by that MapLibre instance.
- Consumes existing cadastral overlay, URL builders, dwell identifier and status renderer.
- Each invocation owns its DOM controls, event handlers, AbortController and overlay instance.

- [ ] **Step 1: Write failing controller tests**

With a controlled MapLibre-compatible fake, assert:

- initial opacity is exactly `0.6` and no slider exists;
- the button toggles only its own map and `aria-pressed`;
- a three-second dwell emits `Foglio 26 · Particella 278`;
- moving before timeout, zooming below 16 and network errors do not show a stale result;
- two mounted controllers remain independent;
- `destroy` removes listeners, cancels requests and removes controller-owned DOM.

- [ ] **Step 2: Run the controller tests and confirm RED**

Run: `node --test tests/admin-cadastre.test.mjs`  
Expected: FAIL because `mountAdminCadastre` does not exist.

- [ ] **Step 3: Implement the map-local controller**

Build viewport image and pixel-identify requests from the current canvas bounds and device-pixel ratio, matching the established editor-map behavior. Insert cadastral raster before the supplied field-fill layer.

- [ ] **Step 4: Mount on Main Admin map**

Mount after map construction, use `project-fill` as the insertion boundary, and destroy with the map API.

- [ ] **Step 5: Mount on every field detail map**

Mount against the local preview container, use `admin-field-fill` as the insertion boundary, and call controller destruction before removing the MapLibre map.

- [ ] **Step 6: Style map-local controls and disclosures**

Place Catasto at top-left and the parcel/source/disclaimer group at bottom-left. Keep controls readable above satellite imagery and independent across nested previews.

- [ ] **Step 7: Verify Task 5 GREEN**

Run: `node --test tests/admin-cadastre.test.mjs tests/admin-map.test.mjs tests/admin-field-map.test.mjs`  
Expected: all selected tests PASS.

- [ ] **Step 8: Checkpoint Task 5**

Record passing command/output in the working log.

### Task 6: Integration, versioning and release verification

**Files:**
- Modify: `index.html`
- Modify: `admin/index.html`
- Modify: versioned ES-module imports touched by Tasks 1–5
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Create: `V54-VERIFICA.md`
- Test: `tests/release54-admin-cadastre-references.test.mjs`
- Test: relevant release integration tests

**Interfaces:**
- Consumes every public interface from Tasks 1–5.
- Produces the `Configuratore_Vivai_Obice_V54.zip` release artifact.

- [ ] **Step 1: Add failing release integration assertions**

Assert package `0.54.0`, badge `AMBIENTE TEST · V54`, cache-busted V54 CSS/entry modules and Admin V54 assets. Assert the editor, Admin map data and Admin Catasto modules are reachable from their entry points.

- [ ] **Step 2: Run release tests and confirm RED**

Run: `node --test tests/release54-admin-cadastre-references.test.mjs tests/release50-integration.test.mjs tests/release51-integration.test.mjs`  
Expected: FAIL on old V53.3 version/badge and missing V54 assets.

- [ ] **Step 3: Update release entry points and documentation**

Bump package and visible badge, update cache query values for every changed asset, add the V54 README section and write manual checks in `V54-VERIFICA.md`.

- [ ] **Step 4: Verify Supabase compatibility without schema changes**

Fetch the current Supabase changelog as required by the Supabase workflow, confirm no relevant breaking change affects existing JSONB snapshot writes, and run the existing persistence/RLS tests. Do not deploy a migration or Edge Function for this release.

- [ ] **Step 5: Run the complete source verification**

Run: `npm test && npm run check`  
Expected: all tests PASS and every JavaScript file parses.

- [ ] **Step 6: Build a clean release archive**

Create `Configuratore_Vivai_Obice_V54.zip` with top-level directory `configuratore-v54`, excluding `node_modules` and transient tooling directories.

- [ ] **Step 7: Verify the exact extracted archive**

Extract into a new temporary directory, attach the existing development dependencies without archiving them, then run `npm test && npm run check`. Verify the ZIP contains no `node_modules`, package version is `0.54.0`, and both entry pages reference V54 assets.

- [ ] **Step 8: Final handoff**

Provide the ZIP and a concise manual test list: per-field mappali, Admin second column, labels/rows/exclusions, rotation, and independent Catasto identification on MainMap and detail maps.
