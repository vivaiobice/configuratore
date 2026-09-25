# V41 Curved Rows and Report Release Design

## Goal

Release one TEST build that adds precise row orientation, generic example copy, editable multi-point curved vineyard rows, and the already implemented printable project report with QR sharing.

## Product behavior

### Precise orientation

Row orientation accepts values from `0` through `179.9` degrees in `0.1` degree increments. The range control, manual numeric input, presets, active field, map, calculations, cloud snapshot, shared view, and printable document always show and use the same value. Invalid manual values are clamped to the permitted interval.

### Generic examples

Placeholders and examples must describe generic data categories. They must not reproduce names, varieties, rootstocks, clones, addresses, customers, or combinations originating in e-mail or other private business correspondence. The material request placeholder is: `es. varietà, clone, portainnesto o altre caratteristiche richieste`.

### Multi-point row curvature

Each field may store `rowCurvePoints`, an ordered array of `{ id, position, offsetM }`:

- `position` is the normalized location from 0 to 1 along the oriented field;
- `offsetM` is the signed lateral displacement in metres;
- points are sorted by position and limited to eight;
- implicit zero-offset anchors at positions 0 and 1 keep the guide stable at its ends;
- one point creates an arc; two or more points can create an S or a more articulated guide.

The orientation still defines the primary direction. A smooth guide is interpolated through the points. Every vineyard row uses the same lateral offset function at its own base position, preserving the configured separation across the row family. Generated rows are polylines, clipped first to the field, trimmed by the headland at the outer ends, and then split by exclusions and passages.

The editor provides:

- `Aggiungi punto`;
- a card for every point with position and signed-offset controls;
- map handles that can be dragged when curve editing is active;
- removal of individual points;
- `Raddrizza filari`, which removes all curve points.

Curvature is a manual planimetric aid. It does not claim to follow elevation, slope, contours, drainage, or machinery constraints. Tight or malformed inputs are normalized, and only valid row fragments of useful length contribute to quantities.

### Calculations and rendering

`rows` retain `start`, `end`, and `lengthM` for compatibility and add `coordinates`, the full polyline. Plants, row metres, intermediate posts, head posts, and commercial quantities use the actual curved fragment lengths. Each fragment produced by an exclusion or passage has two head posts, as in the straight-row model.

Main map, other-field preview, field cards, shared project, satellite overlay, technical diagram, and printable report render `coordinates` when present and fall back to `start/end` for historical projects.

### Persistence and compatibility

`rowCurvePoints` lives in every field design object and therefore travels through local drafts, project archives, cloud snapshots, immutable revisions, report issues, and restore operations. Existing fields without the property remain straight and keep their previous numerical results. No database schema migration is required because field design data and revision snapshots are JSON.

## Release boundary

The release is labelled `AMBIENTE TEST · V41`. The GitHub upload package contains the deployable application, excludes tests and development documentation, and must contain fewer than 100 files. Supabase LIVE remains unchanged.

## Verification

Automated verification covers straight-row compatibility, one-bend and S-shaped rows, curve clipping, exclusions, actual lengths and post counts, orientation decimals, field persistence, map/report polyline output, generic copy, public report security, and the complete regression suite. Manual TEST checks remain necessary for drag interaction, iPhone controls, print layout, QR scanning, and real Guest/owner/Admin behavior.
