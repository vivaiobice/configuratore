# Numerical terrain fixtures

These binary GeoTIFF responses were downloaded directly from the public WCS services on 2026-10-04. They are anonymous numerical windows, not the user's pilot field. `requests.json` records each exact GetCoverage URL, bounds, physical test field, first decoded float32 height, byte SHA256 and observed CORS `*`.

- `piemonte-wcs-float32.tif`: Regione Piemonte ICE 2009–2011 DTM 5, 21 × 21 cells at native 5 m, EPSG:32632, nodata −99. Source metadata/license: https://www.geoportale.piemonte.it/geonetwork/srv/api/records/r_piemon:224de2ac-023e-441c-9ae0-ea493b217a8e . CC BY 4.0, Regione Piemonte.
- `tuscany-tinitaly-float32.tif`: national TINITALY 1.1 window outside Piemonte, 11 × 11 cells at native 10 m, EPSG:32632, nodata −9999. CC BY 4.0, INGV, Tarquini et al. (2023), DOI:10.13127/tinitaly/1.1. https://tinitaly.pi.ingv.it/ .
- `piemonte-fallback-tinitaly-float32.tif`: same anonymous Piemonte field from the national provider, proving that fallback replaces the whole model at 10 m.

The captured DescribeCoverage XML files record the native CRS, grid step and alignment. Piemonte's MapServer origin describes the raster corner [290748,5165171]; GeoServer TINITALY's origin [312505,5222495] is the center, with corner [312500,5222500]. GetCoverage requests snap to these corner lattices, request exactly the declared native step and nearest-neighbor selection, and assert returned extent, dimensions and georeferencing. Sampling uses pixel centers; it never extrapolates the unsupported half-cell border.

`proj-control-points.json` contains independently generated WGS84 controls from pyproj 3.7.2 / PROJ 9.5.1, including the east-Italy national-provider projection in EPSG:32632 outside the ordinary zone. pyproj was used only in temporary verification tooling; no application dependency was added. Source algorithm: Karney (2011), https://arxiv.org/abs/1002.1417 .
