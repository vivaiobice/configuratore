# Vivai Obice 1.3.0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add automatic terrain, ground-distance vineyard design and a simple 3D preview, plus precise vertex coordinates, preserving all unapplied 1.2.6 behavior.

**Architecture:** New pure terrain/provider/coordinate modules sit beside the existing engine. Frozen applied terrain results are explicit, input-hashed field data; the existing calculator takes its original branch when terrain is absent. Candidate acquisition and computation are transient until an atomic successful local checkpoint.

**Tech Stack:** Existing browser ES modules, MapLibre 4.7.1, polygon-clipping, node:test, Chromium Playwright. Vendor numeric GeoTIFF decoding locally with license; no paid API, new Supabase tables or deployment.

**Spec:** `docs/superpowers/specs/2026-10-04-terrain-vineyards-design.md`, including approved coordinate appendix.

## Global Constraints

- Stable baseline `7b1e0165e559cbd66864af1751dfc6fa7b2617a5`; baseline 1004 tests pass. No changes to Conteggi behavior, PDF font, map gestures, portions or original 2D calculations when terrain is unapplied.
- Piemonte 5 m first where covered, national TINITALY 10 m fallback, one provider per field. Grid frozen, numeric float32 and nodata validated, full support coverage. No hidden interpolation across missing data.
- Automatic elevation only; Segui il terreno; minimum ground interfila takes priority. Preserve independent portions and 1.50 m physical cuts/two heads per fragment.
- Surface lengths and area are separate from horizontal quantities. Capture applied geometry, metrics, validation, algorithm and input hash in the field. Calculator never fetches or silently falls back to planar quantities for invalid applied terrain.
- Native cell limit 262144; serialized field 1 MiB and snapshot 4 MiB; solver 500000 nodes/10 seconds worker. Reject without changing the saved project if coverage, validation, quota or budget fails.
- First application converts the whole field with per-portion before/after review; subsequent local guide changes preserve other applied portions.
- 3D is approximate display of the same frozen grid, default exaggeration 1; camera is never input to quantities. Return 2D before editing and restore camera/visibility.
- Coordinates explicit WGS84 or WGS84 UTM EPSG:32632/32633/32634; no arbitrary CRS guesses. New linear corridors preserve axis/group metadata. Legacy rings remain editable without invented endpoints.

## Review Focus

- Late DEM/worker responses after account, field or geometry changes must be discarded; acquisition must not save candidate grids.
- A quota error or unsupported surface must retain both the saved project and the recoverable proposal.
- Tiny/oblique exclusions between raster samples must still produce physical fragments and head posts, never raster-induced fragments.
- Flat-field phase/counts and all existing local editing/printing paths must remain identical until terrain is explicitly applied.
- Clipped multipart passages and stale coordinate dialogs must not alter the wrong field or lose fixed-width/group identity.

## File structure and shared contracts

`src/coordinate-system.js`: WGS84/UTM transform shared by input and DEM acquisition. `toUTM([lon,lat], epsg=32632) -> [easting,northing]`; `fromUTM([easting,northing], epsg=32632) -> [lon,lat]`.

`src/terrain-model.js`: serialization, content validation/hash, native grid mesh, sampler and metrics. Frozen model format:
`{version:1, algorithmVersion:'terrain-1', source:{id,label,resolutionM,surveyEpoch,release,citation,license,url}, acquiredAt, crs:'EPSG:32632', grid:{width,height,origin:[x,y],step:[dx,dy],valuesBase64}, contentHash, coverage:{polygon,bounds}, validation:{complete:true}}`.
Origin is center of upper-left cell, step `[resolution,-resolution]`; float32 little-endian bytes encoded base64; samples outside triangulated cell-center support are unavailable. Export `encodeTerrainGrid`, `decodeTerrainGrid`, `validateTerrainModel`, `sampleTerrain`, `terrainPolylineLength`, `terrainSurfaceArea`, `terrainSummary`, `terrainInputHash`. For sampling use geographic `[lon,lat]`, and return height or null; length/area reject uncovered geometry.

`src/terrain-provider.js`: `loadTerrainForField({polygon,signal,fetchImpl=fetch}) -> Promise<FrozenModel>`; snapped native bounds include support margin, numerical CRS verified, bounded response sizes. Bounded cache in memory, no project mutation.

`src/terrain-design.js`: `buildTerrainProposal({project,model,portionId=null,followTerrain=true,deadlineMs=10000}) -> {ok,status,message,terrain?,rowPortions?,result?,changes?}`. Accept project with `geometry` (calculator has `polygon`). Authoritative applied terrain property is `{model, applied:{algorithmVersion,inputHash,result,portionResults,validation}}`; `result` contains existing calculator keys plus `terrainStatus`, `horizontalRowLinearM`, `surfaceAreaM2`, `surfaceNetAreaM2`, `terrainSource`. Result does not recursively contain terrain. Export `readAppliedTerrainResult(input)` returning verified result or an explicit invalid-terrain result; unknown algorithm still replays verified applied geometry. Export worker execution adapter in `terrain-worker-client.js`, browser worker in `terrain-worker.js`.

`src/terrain-controller.js` and `terrain.css`: DOM card/async context/proposal/apply/3D flow. `createTerrainController({document,getProject,getContext,getPortionId,getMapApi,applyProposal,onStatus}) -> {refresh,destroy,close3D}`. `applyProposal(proposal,context)` is supplied by app and succeeds only after checkpoint.

`src/terrain-map.js`: `createTerrainMapView({map,model,onStatus}) -> {open,close,destroy}`. No map source of authoritative elevation. Own local raster-dem adapter and resource lifetime.

`src/coordinate-editor.js`, `coordinates.css`: compact dialog independent of app, called by map vertex edit lifecycle. Corridor helper lives in `src/passage-coordinates.js`. New map callback `onExclusionsReplace(exclusions)` applies a whole replacement once; existing callbacks preserve legacy signatures.

### Task 1: Automatic data, CRS and frozen model

**Files:** Create coordinate-system, terrain-model, terrain-provider, vendor decoder/license, `tests/coordinate-system.test.mjs`, `tests/terrain-model.test.mjs`, `tests/terrain-provider.test.mjs`, numeric provider fixtures.

**Interfaces:** Shared contracts above. Model must be usable synchronously by the pure calculator after loading; any model decode cache uses content hash. Provider does not save project state.

- [x] Write behavior tests for known WGS84/UTM control points, float32 lossless round-trip, nodata and support bounds, per-triangle lengths over waves, horizontal versus surface area, deterministic input/content hashes and missing/oversized/corrupted grids.
- [x] Run focused tests RED before implementation, record expected missing behavior.
- [x] Implement transform/model/provider and bounded local decoder. Verify provider numeric requests in Piemonte and outside region with correct source/step, fallback whole model when regional coverage is incomplete, abort propagation and cache isolation.
- [x] Run focused tests GREEN and full `npm test`, record output and any transient concurrent failures; self-review and commit only owned files.

### Task 2: Ground-spacing design and authoritative replay

**Files:** Create terrain-design, terrain-worker, terrain-worker-client, `tests/terrain-design.test.mjs`, `tests/terrain-replay.test.mjs`; Modify project-calculator only for explicit terrain branch.

**Interfaces:** Consume Task 1 model/CRS APIs, produce proposal/replay contracts above. Existing calculator result shape remains identical with absent terrain; resolve portions using original topology and identity engine.

- [x] Write RED analytic tests for transversal/longitudinal/oblique planes, flat valid legacy parity/phase, wave lengths, actual thin/oblique exclusion clips, two heads per physical fragment, ground headlands only on original boundary, conservative minimum spacing validation and unsupported branching/budget states.
- [x] Implement guide/continuous face-distance offsets and conservative interval validation. Reject unverifiable cases explicitly. Keep original legacy rows/calculator branch unchanged; no silent planar blending fallback. Frozen result is validated against model and all design inputs.
- [x] Test L-field first atomic all-portion conversion and local change after apply preserving nonselected portion results/IDs exactly; test unknown algorithm replay, changed input invalidation, nodata and solver budget.
- [x] Run focused GREEN/full suite; document verified numerical bounds versus dataset precision; commit owned files.

### Task 3: Precise points and fixed-width passage coordinates

**Files:** Create coordinate-editor, passage-coordinates, coordinates.css, `tests/coordinate-editor.test.mjs`, `tests/passage-coordinates.test.mjs`; Modify map.js, only exclusion callbacks in app.js, stylesheet link in index.html.

**Interfaces:** Consume Task 1 CRS or implement the exact shared coordinate-system contract while coordinating ownership. `onExclusionsReplace` atomically replaces a corridor group; no changes to existing drag tools except coordinate action/lifecycle.

- [x] Write RED tests for precise input/no rounding write on unchanged confirm, decimal comma and WGS84/UTM explicit selection, invalid/self-crossing/degenerate ring rejection, first-point closure, cancel/stale context and keyboard/touch behavior.
- [x] Implement discreet vertex action after edit unlock, drag suppression, compact accessible popup and preservation of normal dragging. Close on stopTools, switch or marker rebuild.
- [x] Persist original line endpoints and group identity for new passages; numeric endpoint edit regenerates/clips the whole group once, preserves suitable identities by overlap, maintains 1.50m. Legacy polygon edit does not invent endpoints or claim fixed width after reshaping.
- [x] Verify real map mobile touch/desktop drag behavior, focused/full tests, commit owned files.

### Task 4: Terrain card, proposal checkpoint and 3D

**Files:** Create terrain-controller, terrain-map, terrain.css, `tests/terrain-controller.test.mjs`, `tests/terrain-map.test.mjs`; Modify index.html and app.js after Task 3 completes, fields.js field key.

**Interfaces:** Consume Tasks 1/2 and controller/map contracts above. Candidate model stays out of persisted field. App atomically creates candidate state via mergeProjectState and saves checkpoint before assigning it to live state; thrown/local false quota errors keep current state/proposal. No Supabase schema edits.

- [x] Write RED tests for acquire/propose/apply lifecycle, owner/field/input context changes and stale responses, no candidate autosave, before/after all-portion preview, failed local checkpoint, limits, retries and applied source info.
- [x] Add compact Terreno card in Affina progetto, automatic acquisition for confirmed geometry, dislevel/slope/source details, Segui il terreno, Applica/Annulla, per-portion preview and statuses. Use worker timeout/cancellation; UI stays responsive.
- [x] Add local same-grid raster-dem adapter compatible with MapLibre 4.7.1, lazy 2D/3D, approximate preview label, restore camera/gestures/eye state, close before edit. Test quantity/input invariance under camera changes.
- [x] Ensure manual row edits create a fresh proposal rather than silently recalculating applied terrain. Reopening retains authoritative result; changed coverage requests model candidate for new proposal.
- [x] Run focused/full tests and browser desktop/mobile flow; commit owned files.

### Task 5: All callers, reports and persistence

**Files:** Modify project-summary, revision-summary, project-report-schema, report-template, admin callers and every calculateProject call that constructs fields; add `tests/terrain-integration.test.mjs`, `tests/terrain-persistence.test.mjs`. Coordinate with Task 4 for app.js edits.

**Interfaces:** Pass `terrain` into the same calculator; retain original no-terrain output. Field normalization preserves terrain once per field; cloud JSON transport does not strip it.

- [x] Write RED tests for field switching/duplication/local migration/cloud snapshot/Admin/shared report and exact applied output equality, all callers passing terrain, horizontal/surface separation and invalid terrain status.
- [x] Add bounded serialization and preserve input/model hash without re-fetch on replay. Summaries/PDF briefly show ground-length basis and provider/resolution/epoch, keep PDF font and external quotes/tag behavior.
- [x] Run focused/full suite and existing report browser fixtures to verify 1.2.6 layout unchanged without terrain; commit owned files.

### Task 6: Regression, independent review and complete release

**Files:** Add scripts/terrain-coordinates-browser.mjs and release verification notes; update versions/cache references, package files and unified offline manifest.

**Interfaces:** Complete Tasks 1–5. Compare to stable commit using behavior fixtures, not merely source pattern tests. No push/deploy/live account changes.

- [x] Prepare candidate 1.3.0 version/cache references, then run complete unit/syntax suite; desktop/mobile existing map, portion, tool switching and report checks; new coordinate edits and terrain acquire/proposal/apply/reload/3D/invalid states in real Chromium.
- [x] Execute real provider numeric browser fetches from local app origin (CORS) and capture evidence. When published-origin execution is not authorized/available, document this accurately without claiming it.
- [x] Dispatch independent whole-branch review with spec, diff and test evidence; fix actual Critical/Important findings and rerun covering checks.
- [x] Build final Conteggi offline artifacts after checks, validate unified ZIP references/hashes and extracted package tests. Preserve stable release ZIP.

Delivery follows this verification: save the final release artifact durably and link the ZIP with concise validation and model limitations.
