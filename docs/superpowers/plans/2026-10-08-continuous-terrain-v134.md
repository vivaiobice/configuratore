# Continuous terrain and usable gestures implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independently owned corrections and reviewed integration. Steps use checkbox syntax.

**Goal:** Deliver a complete v1.3.4 ZIP for hardware trials with gesture navigation, terrain continuity, visible vineyard overlays, bounded native adaptation, counter footer logo and coordinate search. Software-renderer interaction performance remains an explicit unresolved limit; functional completion is not a fluidity certification.

**Architecture:** Retain the frozen numerical native DTM and independent vineyard portions. Diagnose the local mesh / planar map integration and the numerical hot path before choosing their replacements. Camera interaction remains MapLibre gesture based; the counter uses the approved logo asset with CSS presentation.

**Tech Stack:** Browser ES modules, MapLibre GL 4.7.1, native WebGL, Web Workers, Node tests, Playwright / Chromium.

**Spec:** User message of 2026-10-08: remove manual 3D navigation buttons; trackpad two fingers pan, Shift+vertical changes pitch, Shift+horizontal changes bearing; continuous terrain instead of a local raised patch; field and rows visible while pitching; adaptation must complete for realistic fields; centered transparent counter logo with light outline.

## Global Constraints

- Preserve manual configuration, saved projects, counts and the established 1.2.6 behavior.
- Keep native numerical elevations unchanged; target constant row quota within 0.001 m and ground interrow distance within the approved ±0.20 m wherever feasible.
- Independent portions stay independent; two head posts per physical row fragment; actual vine counts follow actual ground lengths.
- No blanket computational-cap increase or partial uncertified project accepted as success.
- No external transmission of private field coordinates, signed-in account probing, remote publication or backend changes.
- Desktop and mobile gestures, cancellation, disposal and exact 2D camera restoration must work.
- The deliverable is a root-flat complete Configurator + Counts ZIP, exact artifact tested and saved.

## Review Focus

- A horizontal Shift wheel must never change pitch or snap a panned view back to the original field center.
- Large pitch / azimuth changes must not cause below-datum field triangles or row fragments to be hidden by a flat map depth plane.
- Panning / zooming outside the field must retain terrain and satellite continuity; provider failure must be explicit.
- Varied Float32 native elevations in irregular fields with passages must finish or explain genuine geometric incompatibility, without a synthetic-plane-only success claim.
- Counter footer logo must have transparent pixels, a centered position and readable outline in dark mode, including cold offline boot.

### Task 1: Gesture camera control

**Files:** Modify `src/map-gestures.js`, `src/terrain-camera-controls.js`, `terrain.css`; tests `tests/terrain-camera-controls.test.mjs`, relevant gesture tests.

**Interfaces:** Retain `createTerrainCameraControls(...)` and `.destroy({restoreCamera})` lifecycle. No `.terrain-camera-controls` panel or `[data-terrain-camera]` buttons. Shift wheel independently maps deltaY to pitch and deltaX to bearing; Ctrl/Meta pinch remains native; unmodified trackpad remains pan.

- [x] Add behavioral RED tests for Shift axes, diagonal gesture, no snap after pan and no manual buttons.
- [x] Run the tests against the old implementation and record the failures.
- [x] Implement the gesture changes and remove the button overlay while preserving pitch bounds, native touch gestures and exact teardown.
- [x] Run focused gesture / lifecycle tests and review the diff.

### Task 2: Counter footer logo

**Files:** Modify `conteggi/style.css`, and `conteggi/index.html` only if the approved asset requires replacement. Inspect `assets/logo-vivai-obice-lineare.png`; add a focused browser assertion to Counts QA.

**Interfaces:** Preserve `.counts-footer-brand` link and approved logo; transparent background, centered across footer width, light outline readable on the dark counter.

- [x] Inspect the existing PNG alpha and current browser placement.
- [x] Correct layout / presentation through CSS or an existing approved transparent asset.
- [x] Verify desktop/mobile computed centering, transparent background and clear outline; preserve cold offline behavior.
- [x] Review the diff.

### Task 3: Continuous 3D terrain and overlays

**Files:** Diagnose `src/terrain-scene-view.js`, `src/terrain-scene-mesh.js`, `src/terrain-map.js`; implementation owns `src/terrain-context-dem.js`, `src/terrain-context-worker.js`, `src/terrain-native-view.js` and native scene adapter / map overlay lifecycle. Update `scripts/terrain-scene-browser.mjs` and scene tests.

**Interfaces:** Preserve `createTerrainSceneView(...).destroy`, visibility controls, lifecycle and camera handoff. Numerical DTM remains independent of display terrain context.

- [x] Reproduce the local island and depth occlusion, record root cause and select continuous display architecture using verified public APIs.
- [x] Add RED acceptance covering outside-field terrain continuity and visible field/rows across pitch and rotation.
- [x] Implement the chosen architecture; satellite drapes across contextual terrain, overlays match the visible surface and no flat plane occludes rows.
- [x] Verify failures/cancellation/disposal, 2D restoration, desktop/mobile gesture behavior and performance; review the diff. The complete36-state functional/visual matrix passes, while ten strict performance phases fail, so the package is a trial build.

### Task 4: Scalable native adaptation

**Files:** Diagnose `terrain-budget.js`, contour/family/exact/native-clipping hot paths. Pin realistic reproduction in a focused test; implementation owns native domain/source proof caches, `src/terrain-directional-certificate.js` and contour/replay/area integration. The approved new method proves shortest native-surface spacing with exact fiber topology and labels a conservative service subset, preserving the existing exact plane/extrusion route.

**Interfaces:** Existing proposal / envelope contract, previous project preserved on failure, independent portions and numerical source binding.

- [x] Reproduce the 500k work failure with varied Float32 terrain, irregular L geometry and a 1.50 m passage.
- [x] Record hotspot cost and select a bounded algorithmic correction, preserving physical tolerance and source identity.
- [x] Implement RED-to-GREEN correction and verify full build + transport + independent replay within the operation budget.
- [x] Verify ground spacing, quota, vine counts, head posts, cancellation and unchanged manual geometry; review the diff.

### Task 5: Integrated release

**Files:** Active release configs/cache graph, root and Counts package metadata, offline SW, release docs and manifest.

- [x] Run relevant numerical and nonterrain regression suites, distinguish any unchanged baseline failures explicitly.
- [x] Run actual desktop/mobile 3D and cold offline Counts browser QA against release source, keeping the performance failure explicit. Final extracted artifact also checks the late coordinate-search addition.
- [x] Update active version to 1.3.4 and exact incoming cache queries; regenerate Counts precache.
- [ ] Freeze source commit, build/hash complete ZIP, extract and repeat artifact QA, perform independent final review.
- [ ] Save the ZIP and return its link with concise factual validation and any material limits.

### Task 6: Late user addition — coordinate map search

**Spec:** 8 October18:00Europe/Rome: existing map search must also accept `44°58'20.5"N 7°57'49.3"E`.

**Files:** `src/coordinate-search.js`, narrow search callbacks in `src/map.js`, project-metadata guard in `src/app.js`, existing input labels in `index.html`, coordinate/search integration tests and release cache graph.

- [x] Add RED tests for exact DMS axes/signs, decimal lat/lon, invalid local rejection and unchanged address geocoding.
- [x] Parse before suggestions or submit, navigate with the existing marker/camera and preserve project locality/pending field-location requests.
- [x] Verify actual map callbacks and actual project-metadata callback with RED/GREEN regressions.
- [ ] Verify real desktop/mobile input in the extracted artifact, freeze and save with the integrated package.


## Integration evidence

- Full serial regression run: 1,830 tests, 1,824 pass, six failures. Five are the previously documented native contact/normal-band cases; the sixth was a stale independent-work-sum assumption after operation-local cache reuse. Its corrected shared-work regression rejects an actual omitted-budget mutation, and passes after restoring exact production bytes. No cap or numerical tolerance is relaxed.
- Root independently reproduced the native noisy L+road cold worker: 473,284 total charged nodes, 15.44 seconds, 13 verified automatic rows, other manual portion unchanged.
- Source cold Counts desktop/mobile passed real scoped SW, owner rejection/restoration, pending and foreign draft preservation, count7→8 and saved8 cold restart. Footer center error0, 1,104,763 transparent pixels, light alpha outline.
- Independent numerical and branch source reviews approve; minor presentation/docs issues closed. Native annotation61focused tests and release cache4tests passed. Runtime graph113targets, Counts41assets.
- Native MapLibre4.7.1 retained. Measured initial cursor-entry picking is recorded separately from navigation: the actual wheel phase starts with the pointer already in the map. No actual gesture frame SLA is loosened. Warm desktop pan still measured166–183ms and mobile pinch350ms, so interaction performance is unresolved. An actual6.13SDK comparison worsened several gestures; public pixel-ratio and512pxDEM probes also failed to resolve pinch stalls and are not shipped. Final strict desktop/mobile and extracted artifact matrix are still pending.
