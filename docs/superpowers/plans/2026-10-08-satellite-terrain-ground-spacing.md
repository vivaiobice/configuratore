# Satellite terrain and ground spacing revision

Approved scope: user's 8 October instructions and approval in this conversation. Complete the implementation and deliver one full ZIP; no deployment or unrelated schema changes.

## Global constraints

- Preserve stable 1.2.6 planar/manual behavior when terrain is not applied, independent portions, exclusions, headland semantics, drafts and Counts.
- Preserve native terrain elevations and mesh support. Satellite must be georeferenced onto the native terrain, not a flat replacement or green cover. No provider requests using private test field coordinates during development.
- Desktop and touch: pan, rotate around field, zoom, pitch/elevate viewpoint, recenter and 2D return. Explicit small controls complement gestures.
- Terrain distances are ground distances. Density is theoretical; actual vines and head posts derive from physically clipped row fragments. Never force the theoretical density into an incompatible layout.
- Automatic constant-elevation rows retain ±0.20 m spacing tolerance and per-portion scope. No silent fallback from automatic to manual. Diagnose time/work budget separately; do not merely raise caps.
- Tests must reproduce the old missing behavior before implementation. Final actual-browser acceptance must use spatially patterned imagery (not uniform placeholders), native mesh, perspective changes and real pointer/touch interactions. Numerical tests must include a sufficiently large non-flat terrain and portions.

## Task 1: Native satellite rendering

Own `terrain-scene-view.js`, new satellite imagery helper and corresponding focused tests. Obtain imagery through the existing satellite style/provider. Generate correct Mercator UVs, texture only imagery coverage, preserve attribution, bounded resources/cache, cancellation and clean teardown. Verify imagery is draped on elevation and loader failures visible without a misleading green fallback.

## Task 2: Camera controls

Own a new terrain camera control module, `map-gestures.js`, related styles and focused tests; coordinate integration into scene view with Task 1. Provide rotation, zoom, pitch and field-centric recenter; desktop/touch gesture interoperability; restore original 2D camera and handlers. All buttons get visible hover/focus feedback.

## Task 3: Numerical diagnosis and correction

Own budget/solver performance modules and focused numerical regressions. Profile current adapt on captured/synthetic terrain (including large nonflat models). Identify actual phase and budget cause, optimize without weakening numerical acceptance or mutating the previous project on failure. Distinguish deadline/work exhaustion, preserve diagnostics and useful UI messaging.

## Task 4: Ground-spaced manual baseline

Own new ground-spacing module plus its tests. Retain orientation/manual curve intent while placing consecutive rows using native surface distance. Keep per-portion scope and stable planar bypass. Root integrates into measured terrain design/replay after API review. Reject unsupported cases explicitly rather than mislabel planar spacing as ground spacing.

## Task 5: Integration, review and release

Root integrates tasks, runs numerical/browser checks, independent review and regression suite, updates all runtime/cache/version identities to 1.3.3, builds exact ZIP and verifies extraction. Save the deliverable and representative actual browser preview. State any real-case/provider verification limit clearly.

## Interfaces and review focus

- Tasks 1/2 share scene-view lifecycle: Task 2 exports a standalone camera-control creator; Task 1 integrates after direct coordination. No concurrent writes to scene-view.
- Tasks 3/4 share design entrypoint: Task 4 exports pure ground-spacing API; root alone integrates it into terrain-contour-design after review.
- Review terrain-plane/sloped/saddle cases, curved axes, L portions/passages, fragment head posts, headland removal, budget cancellation, imagery alignment, coverage edge, camera restoration, resource cleanup and no changes to Counts offline identity except release cache version.
