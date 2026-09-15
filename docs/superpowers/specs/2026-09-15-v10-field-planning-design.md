# V10 field planning and mobile map design

## Goal
Deliver a testable V10 that fixes iOS map gestures/layout, keeps perimeter/side measurements persistent, adds destructive editing controls, introduces excluded zones and multi-field planning, and makes post estimation explicit and editable.

## Geometry model
A project can contain multiple fields. Each field has its own outer polygon, exclusions, row/plant spacing, orientation, headland, post spacing, mechanization, project context, variety, rootstock, clone, and label. One field is active in the editor. The legacy top-level project fields mirror the active field for backwards compatibility with existing cloud/report code.

Excluded zones are simple polygons wholly inside the active field. They subtract from usable area and split simulated rows where they intersect. The outer perimeter remains the field perimeter; exclusions have their own area/perimeter metadata.

## Map interaction
The committed outer perimeter is rendered by a dedicated MapLibre GeoJSON layer that is independent from Mapbox Draw. Mapbox Draw is only an editor overlay. Side-length labels are HTML markers derived from the committed geometry and are re-synchronised after geometry changes. A clear-field button resets active geometry, exclusions and rows. A remove-point button invokes Draw vertex deletion only when a vertex is selected.

Excluded-zone drawing uses the same deterministic manual drawing flow as outer polygon creation, with an explicit close action. Exclusions render as translucent cut-outs/hatched overlays.

## Multi-field UX
A compact field switcher sits near the map controls/sidebar: add field, select active field, rename, remove. Switching fields persists the outgoing field state and loads the incoming field into all existing controls and map layers. V10 keeps one active field visible at a time to avoid clutter.

## Posts
Default post spacing is 4.50 m and remains editable per field. Post count uses simulated physical rows: two head posts per row plus intermediate posts based on each row's usable length and the configured spacing.

## iOS/mobile
Order is fixed to: step 01, map, step 02, advanced sections, summary. Fullscreen map is visible on mobile. Touch rotation is disabled while native pinch zoom/pan remains enabled. Desktop keeps Shift/Alt + trackpad rotation and manual arrow controls.

## Branding and summary
Use a new cache-busted transparent logo asset. Add a very light, pointer-events-none Vivai Obice watermark over the map as screenshot deterrence, without claiming copy protection. The sidebar summary is compact, dense, and docked naturally as the final panel section rather than visually floating over content.
