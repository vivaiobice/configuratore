# V10 Field Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship a V10 with stable mobile map gestures/layout, persistent perimeter labels, exclusions, multi-field planning, point/project deletion controls, editable 4.50 m post spacing, watermarking, and a compact docked summary.

**Architecture:** Extend the project state with a `fields` collection and active field while mirroring the active field into legacy top-level properties. Extend row generation to subtract exclusion polygons, keep committed geometry in a dedicated map source, and expose explicit map editing commands. Keep all new behavior in focused helpers so current backend/report code can continue using legacy fields until later migrations.

**Tech Stack:** Static HTML/CSS, ES modules, MapLibre GL JS 4.7.1, Mapbox GL Draw 1.5.0, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-15-v10-field-planning-design.md`

## Global Constraints
- Default plant spacing: 0.90 m.
- Default row spacing: 2.50 m.
- Default post spacing: 4.50 m, editable per field.
- iOS/mobile order: step 01 → map → step 02 → remaining sections.
- Touch rotation disabled; pinch zoom and pan preserved.
- Desktop Shift/Alt trackpad rotation remains available.
- Watermark must be very light and non-interactive.

---

### Task 1: Field state model
**Files:** `src/fields.js`, `src/state.js`, `tests/fields.test.mjs`, `tests/state.test.mjs`
**Produces:** create/sync/switch/add/remove field helpers and backwards-compatible active-field mirroring.

- [x] Write failing tests for default field/post spacing, add/switch/remove, and legacy mirror.
- [x] Run targeted tests and confirm RED.
- [x] Implement minimal field model.
- [x] Run targeted tests and confirm GREEN.

### Task 2: Exclusions and post calculation
**Files:** `src/geometry.js`, `src/project-calculator.js`, `tests/geometry.test.mjs`, `tests/project-calculator.test.mjs`
**Produces:** row subtraction by excluded polygons and post counts from usable row segments.

- [x] Write failing tests for area subtraction, row splitting and 4.50 m post default.
- [x] Run targeted tests and confirm RED.
- [x] Implement exclusion clipping and metrics.
- [x] Run targeted tests and confirm GREEN.

### Task 3: Persistent map geometry and editing controls
**Files:** `src/map.js`, `index.html`, `styles.css`, `tests/map-structure.test.mjs`, `tests/public-shell.test.mjs`
**Produces:** persistent perimeter layer/labels, clear-field, remove-selected-vertex, exclusion drawing, watermark.

- [x] Write failing structural/behavior tests.
- [x] Run targeted tests and confirm RED.
- [x] Implement map commands and layers.
- [x] Run targeted tests and confirm GREEN.

### Task 4: Multi-field app wiring
**Files:** `src/app.js`, `index.html`, `styles.css`, `tests/public-shell.test.mjs`, `tests/app-structure.test.mjs`
**Produces:** field switcher/add/remove and per-field controls/metrics.

- [x] Write failing tests for UI and active-field synchronization hooks.
- [x] Run targeted tests and confirm RED.
- [x] Wire field helpers and UI.
- [x] Run targeted tests and confirm GREEN.

### Task 5: iOS/mobile and compact docked summary
**Files:** `src/map-gestures.js`, `styles.css`, `index.html`, `tests/map-gestures.test.mjs`, `tests/public-shell.test.mjs`
**Produces:** touch zoom without rotation, correct mobile ordering/fullscreen, smaller integrated summary, cache-busted logo.

- [x] Write failing tests for no touch rotation, DOM/CSS order, summary dimensions, logo asset and fullscreen button.
- [x] Run targeted tests and confirm RED.
- [x] Implement minimal fixes.
- [x] Run targeted tests and confirm GREEN.

### Task 6: Full verification and release archive
**Files:** all changed files

- [x] Run `npm test`.
- [x] Run `npm run check`.
- [x] Run `git diff --check` if a local git snapshot is available; otherwise whitespace scan with `grep`/`find`.
- [x] Serve locally and confirm index returns HTTP 200.
- [x] Create a clean GitHub ZIP excluding transient files and verify archive contents.
