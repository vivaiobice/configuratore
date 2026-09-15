export const GEOLOCATION_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 0
});

export function buildGeocodeUrl(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', String(query ?? '').trim());
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('countrycodes', 'it');
  url.searchParams.set('addressdetails', '1');
  return url.toString();
}

export function buildSuggestionUrl(query) {
  const url = new URL('https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest');
  url.searchParams.set('text', String(query ?? '').trim());
  url.searchParams.set('countryCode', 'ITA');
  url.searchParams.set('maxSuggestions', '5');
  url.searchParams.set('returnCollections', 'false');
  url.searchParams.set('f', 'json');
  return url.toString();
}

export function normalizeSuggestionResults(payload) {
  const items = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
  return items.flatMap((item) => {
    const label = String(item?.text ?? '').trim();
    if (!label) return [];
    return [{ label, magicKey:String(item?.magicKey ?? '').trim() }];
  });
}

export function normalizeGeocodeResults(items) {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const lon = Number(item?.lon);
    const lat = Number(item?.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [];
    const locationLabel = String(item?.display_name ?? '').trim() || `${lat}, ${lon}`;
    const address = item?.address ?? {};
    const municipality = String(address.city ?? address.town ?? address.village ?? address.municipality ?? address.hamlet ?? '').trim();
    const province = String(address.province ?? address.county ?? address.state_district ?? '').trim();
    const region = String(address.state ?? address.region ?? '').trim();
    const result = { lon, lat, label:locationLabel };
    if (municipality) result.municipality = municipality;
    if (province) result.province = province;
    if (region) result.region = region;
    if (municipality || province || region) result.locationLabel = locationLabel;
    return [result];
  });
}

export function coordinatesFromDrawEvent(event, fallbackFeatures = []) {
  const candidates = Array.isArray(event?.features) && event.features.length ? event.features : fallbackFeatures;
  const feature = candidates.find((item) => item?.geometry?.type === 'Polygon');
  const coords = feature?.geometry?.coordinates?.[0];
  return Array.isArray(coords) && coords.length >= 4 ? coords : null;
}


export function shouldClosePolygonAtFirstVertex(state, event, map, tolerancePx = 18) {
  if (!state || Number(state.currentVertexPosition) < 3) return false;
  const first = state.polygon?.coordinates?.[0]?.[0];
  if (!Array.isArray(first) || first.length < 2 || typeof map?.project !== 'function') return false;
  const firstPoint = map.project(first);
  const eventPoint = event?.point ?? (event?.lngLat ? map.project([event.lngLat.lng, event.lngLat.lat]) : null);
  if (!eventPoint || !Number.isFinite(eventPoint.x) || !Number.isFinite(eventPoint.y)) return false;
  if (!Number.isFinite(firstPoint?.x) || !Number.isFinite(firstPoint?.y)) return false;
  return Math.hypot(eventPoint.x - firstPoint.x, eventPoint.y - firstPoint.y) <= tolerancePx;
}

export function createReliablePolygonMode(Draw, tolerancePx = 18) {
  const base = Draw?.modes?.draw_polygon;
  if (!base) return null;
  const mode = { ...base };
  const builtInClick = base.onClick;
  const builtInTap = base.onTap ?? base.onClick;

  const handle = function(original, state, event) {
    if (shouldClosePolygonAtFirstVertex(state, event, this.map, tolerancePx)) {
      return this.changeMode('simple_select', { featureIds:[state.polygon.id] });
    }
    return original?.call(this, state, event);
  };

  mode.onClick = function(state, event) {
    return handle.call(this, builtInClick, state, event);
  };
  mode.onTap = function(state, event) {
    return handle.call(this, builtInTap, state, event);
  };
  return mode;
}

export function configureDrawForMapLibre(Draw) {
  const classes = Draw?.constants?.classes;
  if (!classes) return Draw;
  classes.CANVAS = 'maplibregl-canvas';
  classes.CONTROL_BASE = 'maplibregl-ctrl';
  classes.CONTROL_PREFIX = 'maplibregl-ctrl-';
  classes.CONTROL_GROUP = 'maplibregl-ctrl-group';
  classes.ATTRIBUTION = 'maplibregl-ctrl-attrib';
  return Draw;
}
