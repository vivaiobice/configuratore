import { pointInPolygon } from './geometry.js';
import { APP_CONFIG } from './config.js';

const WMS_PROXY_ENDPOINT = `${APP_CONFIG.supabaseUrl}/functions/v1/cadastral-wms`;
const MAX_IMAGE_SIZE = 2048;
export const CADASTRAL_MIN_ZOOM = 15;

const WFS_ENDPOINT = 'https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php';

export function cadastralOverlayPolicy({ visible, zoom }) {
  const active = Boolean(visible);
  if (!active) return { visible:false, renderable:false, reason:'off' };
  if (!Number.isFinite(Number(zoom)) || Number(zoom) < CADASTRAL_MIN_ZOOM) {
    return { visible:true, renderable:false, reason:'zoom' };
  }
  return { visible:true, renderable:true, reason:'ready' };
}

export function buildCadastralWfsUrl({ west, south, east, north, count = 12 }) {
  const url = new URL(WFS_ENDPOINT);
  const params = {
    language: 'ita',
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    TYPENAMES: 'CP:CadastralParcel',
    SRSNAME: 'urn:ogc:def:crs:EPSG::6706',
    BBOX: [south, west, north, east].join(','),
    COUNT: String(Math.max(1, Math.min(50, Math.round(Number(count) || 12))))
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function decodeXml(value) {
  return String(value ?? '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

export function parseCadastralGml(xmlText) {
  const xml = String(xmlText ?? '');
  const members = [...xml.matchAll(/<wfs:member\b[^>]*>([\s\S]*?)<\/wfs:member>/gi)].map((match) => match[1]);
  const parcels = [];
  for (const member of members) {
    const id = member.match(/gml:id=["']([^"']+)["']/i)?.[1] ?? null;
    const reference = decodeXml(member.match(/<(?:CP|cp):nationalCadastralReference\b[^>]*>([\s\S]*?)<\/(?:CP|cp):nationalCadastralReference>/i)?.[1]?.trim() ?? '');
    const posList = member.match(/<gml:posList\b[^>]*>([\s\S]*?)<\/gml:posList>/i)?.[1];
    if (!posList) continue;
    const values = posList.trim().split(/\s+/).map(Number);
    if (values.length < 6 || values.length % 2 !== 0 || values.some((value) => !Number.isFinite(value))) continue;
    const coordinates = [];
    for (let index = 0; index < values.length; index += 2) {
      const lat = values[index];
      const lon = values[index + 1];
      coordinates.push([lon, lat]);
    }
    const first = coordinates[0];
    const last = coordinates.at(-1);
    if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push([...first]);
    parcels.push({ id, reference: reference || null, coordinates, properties: {} });
  }
  return parcels;
}


export function selectCadastralParcel(parcels, point) {
  for (const parcel of parcels ?? []) {
    if (pointInPolygon(point, parcel?.coordinates)) return parcel;
  }
  return null;
}

export function normalizeCadastralFeature(feature) {
  if (!feature || feature.geometry?.type !== 'Polygon' || !Array.isArray(feature.geometry.coordinates?.[0])) return null;
  const ring = feature.geometry.coordinates[0].map(([lon, lat]) => [Number(lon), Number(lat)]);
  if (ring.length < 3 || ring.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat))) return null;
  const [firstLon, firstLat] = ring[0];
  const [lastLon, lastLat] = ring.at(-1);
  if (firstLon !== lastLon || firstLat !== lastLat) ring.push([firstLon, firstLat]);
  const props = feature.properties ?? {};
  return {
    id: feature.id ?? props.id ?? null,
    reference: props.nationalCadastralReference ?? props.national_cadastral_reference ?? props.label ?? null,
    coordinates: ring,
    properties: props
  };
}

function clampSize(value) {
  const n = Math.max(1, Math.round(Number(value) || 1));
  return Math.min(MAX_IMAGE_SIZE, n);
}

export function buildCadastralWmsUrl({ west, south, east, north, width, height }) {
  const url = new URL(WMS_PROXY_ENDPOINT);
  const params = {
    west: String(Number(west)),
    south: String(Number(south)),
    east: String(Number(east)),
    north: String(Number(north)),
    width: String(clampSize(width)),
    height: String(clampSize(height))
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

export async function combineCadastralParcels(parcels, unionFn) {
  const selected = (parcels ?? []).filter((parcel) => Array.isArray(parcel?.coordinates) && parcel.coordinates.length >= 4);
  if (!selected.length) throw new TypeError('At least one cadastral parcel is required');
  const refs = selected.map((parcel) => ({ id:parcel.id ?? null, reference:parcel.reference ?? null }));
  if (selected.length === 1) return { coordinates:selected[0].coordinates, refs };
  if (typeof unionFn !== 'function') throw new TypeError('Parcel union function required');
  const result = await unionFn(...selected.map((parcel) => [parcel.coordinates]));
  if (!Array.isArray(result) || result.length !== 1 || !Array.isArray(result[0]) || result[0].length !== 1) {
    throw new Error('Selected cadastral parcels must form one contiguous perimeter without unsupported holes');
  }
  const coordinates = result[0][0].map(([lon, lat]) => [Number(lon), Number(lat)]);
  if (coordinates.length < 4 || coordinates.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat))) {
    throw new Error('Invalid merged cadastral perimeter');
  }
  const first = coordinates[0];
  const last = coordinates.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push([...first]);
  return { coordinates, refs };
}
