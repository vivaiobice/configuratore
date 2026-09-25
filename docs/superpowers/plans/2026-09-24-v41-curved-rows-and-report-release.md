# V41 Curved Rows and Report Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the V41 TEST release with decimal/manual orientation, generic copy, multi-point curved rows, and the printable QR report.

**Architecture:** Extend the field design with normalized curve points and generate clipped row polylines in the existing local metric frame. Keep curve interpolation and clipping in a dedicated geometry module, while the map, calculator, reports, shared view, and UI consume the compatible row shape.

**Tech Stack:** Vanilla ES modules, MapLibre GL 4.7.1, Node test runner, Supabase JSON snapshots/RPC, browser print CSS.

**Spec:** `docs/superpowers/specs/2026-09-24-v41-curved-rows-and-report-release-design.md`

## Global Constraints

- Work only in Ambiente TEST and label the build V41.
- Preserve results for every existing field that has no curve points.
- Do not change area, exclusion, headland, plant, post, or commercial rounding formulas except to use actual curved-row length.
- Maximum eight curve points per field.
- Keep historical `start/end` row rendering compatible.
- Use only generic placeholder examples.
- Keep the GitHub upload package below 100 files.

## Review Focus

- Two opposite offsets must produce an S without NaN values, row reversal, or unordered control points.
- Curve fragments crossing field edges or exclusions must stop at the boundary and contribute the correct head posts.
- Old saved projects with no `rowCurvePoints` must return exactly the straight-row baseline.
- Manual orientation values with comma/dot, negatives, and values at 180 must normalize consistently.
- Map/report/shared renderers must use the same polyline and never silently replace a curved row with a chord.

---

### Task 1: Curved row geometry

**Files:**
- Create: `src/row-curves.js`
- Modify: `src/geometry.js`
- Test: `tests/row-curves.test.mjs`
- Modify: `tests/geometry.test.mjs`

**Interfaces:**
- Produces `normalizeRowCurvePoints(points)`, `curvePointToLonLat(...)`, `lonLatToCurvePoint(...)`, and `generateCurvedRows(...)`.
- Extends every curved row with `{ coordinates, start, end, lengthM }`.

- [ ] Write tests for point normalization, one arc, two-point S, boundary clipping, exclusion splitting, and zero-curve straight compatibility.
- [ ] Run focused tests and confirm the new exports are absent.
- [ ] Implement local-frame interpolation, sampled clipping, headland trimming, and compatible row objects.
- [ ] Update GeoJSON conversion to prefer `coordinates`.
- [ ] Run focused tests until they pass.

### Task 2: Calculation and persistence

**Files:**
- Modify: `src/project-calculator.js`
- Modify: `src/fields.js`
- Modify: `src/app.js`
- Modify: `src/revision-summary.js`
- Test: `tests/project-calculator.test.mjs`
- Test: `tests/fields.test.mjs`
- Test: `tests/revision-summary.test.mjs`

**Interfaces:**
- `calculateProject({... rowCurvePoints })` selects the curved generator only when normalized points exist.
- Field design persists `rowCurvePoints` as JSON.

- [ ] Add failing tests for actual curved length, plant/post recalculation, field switching, and revision summaries.
- [ ] Thread curve points through field defaults, active-field mirroring, calculation, and cloud snapshots.
- [ ] Preserve the exact legacy path for fields without curve points.
- [ ] Run focused tests.

### Task 3: Precise orientation and curve controls

**Files:**
- Modify: `index.html`
- Modify: `src/app.js`
- Modify: `src/mobile-ui.js`
- Create: `desktop-v41.css`
- Modify: `mobile.css`
- Test: `tests/release41-curves.test.mjs`

**Interfaces:**
- Orientation range and numeric input share `orientationDeg` with step `0.1`.
- Curve cards modify ordered field `rowCurvePoints` and expose add, remove, edit, and straighten actions.

- [ ] Add shell/behavior tests for the manual angle input, generic placeholder, and curve buttons.
- [ ] Implement one normalization function used by slider, numeric field, and presets.
- [ ] Render a reusable list of curve-point controls with position and offset sliders.
- [ ] Move the full orientation/curve block into the existing mobile sheet.
- [ ] Add responsive styles and run focused tests.

### Task 4: Draggable curve points on MapLibre

**Files:**
- Modify: `src/map.js`
- Modify: `src/app.js`
- Modify: `desktop-v41.css`
- Modify: `mobile.css`
- Test: `tests/map-edit-controls.test.mjs`

**Interfaces:**
- `initMap` accepts `onRowCurvePointsChange`.
- Map API exposes `setRowCurveEditor({ geometry, orientationDeg, points, active })` and `finishRowCurveEditing()`.

- [ ] Add contract tests for curve marker lifecycle and callback wiring.
- [ ] Create draggable numbered markers from geometry helpers.
- [ ] Convert drag positions back to normalized position/offset, preserve point IDs, and rerender calculations.
- [ ] Clear handles on field switch, tool stop, straightening, and map reset.
- [ ] Run focused tests.

### Task 5: Curved rendering in reports and shared view

**Files:**
- Modify: `src/report-map-model.js`
- Modify: `src/report-diagram.js`
- Modify: `src/shared-project.js`
- Modify: `src/report.js`
- Modify: `src/report-template.js`
- Test: `tests/report-map-model.test.mjs`
- Test: `tests/report-diagram.test.mjs`
- Test: `tests/shared-project.test.mjs`
- Test: `tests/report-template.test.mjs`

**Interfaces:**
- All renderers prefer row `coordinates` and retain `start/end` fallback.

- [ ] Add failing tests that distinguish a curved polyline from its straight chord.
- [ ] Project and render full row coordinate arrays in SVG and GeoJSON.
- [ ] Pass curve points into every report/shared calculation.
- [ ] Show orientation to one decimal place in the document.
- [ ] Run focused tests.

### Task 6: V41 release verification and package

**Files:**
- Modify: `index.html`
- Modify: `manifest.webmanifest`
- Create: `V41-VERIFICA.md`
- Modify: `README.md`
- Modify: `PROMPT_JOURNAL.md`
- Create outside source tree: `configuratore-vivai-obice-v41-test-github.zip`

**Interfaces:**
- Produces a TEST deployable archive below 100 files.

- [ ] Update cache keys and visible badge to V41.
- [ ] Run `npm test`, `npm run check`, and `node --check vendor/qrcode-generator-esm.js`.
- [ ] Inspect the archive file list, reject hidden/dev files, and verify file count below 100.
- [ ] Extract the archive into a temporary directory and rerun static syntax checks against the extracted files.
- [ ] Record automated evidence and the manual browser checklist.
- [ ] Create the final V41 TEST archive.
