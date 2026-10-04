# Independent Vineyard Portions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Independently edit row orientation and curvature in actual cultivable portions split by roads, preserving one field and correct physical row endpoint totals.

**Architecture:** A synchronous bundled polygon Boolean kernel derives actual polygons and holes. Saved rowPortions own their local design, while inherited portions preserve the old drawing until explicitly edited. Shared calculator clips each design to its component and preserves outer-boundary headlands.

**Tech Stack:** Browser ES modules, Node test runner, vendored polygon-clipping 0.15.7 UMD/ES wrapper with license.

**Spec:** docs/superpowers/specs/2026-10-03-independent-portions.md

## Global Constraints

- One complete release v1.2.5; no deploy, production writes or external notifications.
- One field/project identity; keep UI Comfortaa and document fonts unchanged.
- Road width 1.50 m; two head posts per final physical row fragment.
- Preserve all legacy tests and old single-field render behavior unless a portion is explicitly edited.
- Preserve original outer-boundary headland behavior, no extra headland at road boundaries.
- Test translated anonymous version of actual L geometry, not private owner/address/coordinates.

## Review Focus

- Road off the global reference guide in an L parcel must still derive two portions.
- Curvature or orientation in A must leave B rows and metrics unchanged, including inherited-to-local transition.
- Saving, switching fields, cloud snapshot restore and reload must retain IDs/local layouts.
- Holes, overlapping exclusions, clipped road fragments and diagonal/X barriers must not create phantom planted areas.
- Moving/removing roads must preserve matching portion designs and report deterministic merges rather than silently assign a different design.

---

### Task 1: Portion topology, saved design state and shared calculator

**Files:** Create src/row-portions.js, src/vendor/polygon-clipping.js (or equivalent bundled wrapper/license), tests/row-portions.test.mjs and tests/fixtures/l-shaped-portions.json. Modify src/row-curves.js, src/project-calculator.js, src/fields.js; storage/state only as needed.

**Interfaces:**
- `resolveRowPortions({polygon,exclusions=[],rowPortions=[],orientationDeg=0,rowCurvePoints=[]})` returns array `{id,label,geometry:[outer,...holes],mode:'inherited'|'local',orientationDeg,rowCurvePoints, ... legacy design as needed}`. Cache topology by complete geometry, not by curve/angle. Invalid inputs fail safely; return [] when no cultivable polygon.
- `updateRowPortion(portions,id,patch)` returns new array; first explicit local direction/curve patch transitions inherited portion to local and removes only its inherited/global control representation. Other portions unchanged. Local curve frame is portion outer ring. IDs matched by overlap to saved portion geometry; merged components choose deterministic surviving layout with explicit conflict status, do not combine incompatible curves silently.
- `portionAtCoordinate(portions,coordinate)` returns portion or null respecting holes.
- `calculateProject({...existing,rowPortions})` includes `portions` metadata and rows tagged `portionId` when split/new layout. No layout + unsplit polygon stays legacy. No layout + split polygon derives inherited portions so old physical rows preserved, until UI saves the derived layout.
- New local row generation may use `generateCurvedRows({polygon:original,guidePolygon:portion.outer,clipRegion:portion.geometry,...})`; support empty curve points in this explicit mode. Original polygon governs headland trim before clipping to portion/exclusions. All coordinates use consistent metric frame. Existing curved APIs remain compatible.

- [ ] Write tests and watch them fail: actual translated L -> 2 portions with86.5deg, inherited render preserved; local direction/curve A leaves B byte-identical; headlands4m leave road ends unchanged; 2 heads/fragment; holes, unioned exclusion areas, X/partial roads; moved-road stable IDs; save/switch field roundtrip.
- [ ] Implement bundled topology, rowPortions normalization/state keys, local/inherited generation, aggregate areas and physical counts. No async import/network dependency in calculation.
- [ ] Run covering tests plus npm test. Preserve base948 tests; explain any intended semantic adjustment.
- [ ] Commit scoped files, write task report with red/green evidence and interfaces.

### Task 2: Editor portion selection, direction and curve interaction

**Files:** Modify src/app.js, src/map.js, index.html, styles.css/mobile CSS as needed. Create focused UI module if useful. Add tests/row-portion-editor.test.mjs and browser script scripts/row-portion-browser.mjs.

**Interfaces:** Consume Task1 APIs and `calculateProject` portions metadata. App maintains activeRowPortionId transiently, resolves rowPortions into active field when first selecting/editing. All direction/curve changes patch selected saved portion; global scalar remains legacy base. Map supports `setRowPortions({portions,activeId,onSelect})` or callback from initMap, draws distinct selectable polygons/active highlight; touch click selection disabled during perimeter/passages drawing to avoid regressions. Curve editor uses active local portion outer ring and no whole-field exclusions to create controls inside selected portion. Inherited portions show short copy: 'Disegno precedente mantenuto. Modifica direzione o aggiungi un punto per progettare questa porzione.'

- [ ] Write and run failing tests for two selection buttons, select B then angle change modifies only B, curve Add/Reset scoped, selecting by touch, first local control inside part, field switching restores layouts, unsplit controls unchanged.
- [ ] Implement editor and map integration. Hide portion picker if one ordinary unsplit legacy field. Keep accessible buttons and finite numbers. Add local portion only controls; legacy row design not modified by selection alone.
- [ ] Run covering tests plus npm test, execute available browser verification against actual translated L on desktop and mobile, save/reload and direction/curve isolation.
- [ ] Commit scoped files and report evidence.

### Task 3: All previews/reports, release validation and version

**Files:** Modify src/report.js, src/project-summary.js, admin/admin-map-data.js and all remaining calculator callers; report/pdf model/template as needed; package.json, cache busting/imports, release README/tests; packaging script if appropriate.

**Interfaces:** Every calculator caller forwards rowPortions and complete exclusion metadata. PDF diagrams use shared rows and totals; split fields report per-portion angles/curve status in parameters without pretending a single global direction. Cloud save/load and Admin remain one field and retain normalized local layout. Actual browser PDF artifact proof does not require customer data.

- [ ] Write/run failing caller/report persistence tests showing mixed portion angles/curves and totals agree with editor; Admin keeps exclusion metadata; field snapshots include layouts.
- [ ] Implement uniform inputs/report display, version1.2.5 and cache bust dependencies so published static imports cannot mix engines. Do not change document fonts or unrelated Conteggi.
- [ ] Run npm test, npm run check, offline build as needed, desktop/mobile browser saved reload and generated PDF review. Produce complete tracked-file ZIP excluding dependencies/worktrees/transient data. ZIP inventory/checksum and syntax verified.
- [ ] Commit scoped files and write report. Root saves ZIP and completes independent whole-branch review before delivery.
