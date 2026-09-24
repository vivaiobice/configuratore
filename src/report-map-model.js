import { sideMeasurements as measureSides } from './geometry.js?v=42';

const MAX_MERCATOR_LAT = 85.05112878;

function validPoint(point) {
  return Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
}

function normalizeRing(ring) {
  if (!Array.isArray(ring)) return [];
  const points = ring.filter(validPoint).map(([lon, lat]) => [Number(lon), Number(lat)]);
  if (points.length < 3) return [];
  const first = points[0];
  const last = points.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) points.push([...first]);
  return points.length >= 4 ? points : [];
}

function mercator([lon, lat]) {
  const clampedLat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
  const x = (lon + 180) / 360;
  const radians = clampedLat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(radians) + (1 / Math.cos(radians))) / Math.PI) / 2;
  return [x, y];
}

function inverseMercator([x, y]) {
  return [(x * 360) - 180, Math.atan(Math.sinh(Math.PI * (1 - (2 * y)))) * 180 / Math.PI];
}

function invalidModel(width, height) {
  return { valid: false, width, height, captureBounds: [], polygon: [], rows: [], exclusions: [], sideMeasurements: [] };
}

function rowCoordinates(row) {
  const curved=Array.isArray(row?.coordinates)?row.coordinates.filter(validPoint).map(([lon,lat])=>[Number(lon),Number(lat)]):[];
  if(curved.length>=2)return curved;
  return validPoint(row?.start)&&validPoint(row?.end)
    ? [row.start.map(Number),row.end.map(Number)]
    : [];
}

export function buildReportMapModel({ polygon, rows = [], exclusions = [], width = 760, height = 360, padding = 34 } = {}) {
  const viewportWidth = Math.max(1, Number(width) || 760);
  const viewportHeight = Math.max(1, Number(height) || 360);
  const safePadding = Math.max(0, Math.min(Number(padding) || 0, Math.min(viewportWidth, viewportHeight) / 2 - 1));
  const ring = normalizeRing(polygon);
  if (!ring.length) return invalidModel(viewportWidth, viewportHeight);

  const mercatorRing = ring.map(mercator);
  const xs = mercatorRing.map(([x]) => x);
  const ys = mercatorRing.map(([, y]) => y);
  const rawMinX = Math.min(...xs); const rawMaxX = Math.max(...xs);
  const rawMinY = Math.min(...ys); const rawMaxY = Math.max(...ys);
  const spanX = Math.max(rawMaxX - rawMinX, 1e-12);
  const spanY = Math.max(rawMaxY - rawMinY, 1e-12);
  const innerWidth = Math.max(1, viewportWidth - (2 * safePadding));
  const innerHeight = Math.max(1, viewportHeight - (2 * safePadding));
  const scale = Math.min(innerWidth / spanX, innerHeight / spanY);
  const centerX = (rawMinX + rawMaxX) / 2;
  const centerY = (rawMinY + rawMaxY) / 2;
  const minX = centerX - ((viewportWidth / scale) / 2);
  const maxX = centerX + ((viewportWidth / scale) / 2);
  const minY = centerY - ((viewportHeight / scale) / 2);
  const maxY = centerY + ((viewportHeight / scale) / 2);

  const project = (point) => {
    const [x, y] = mercator(point);
    return [((x - minX) / (maxX - minX)) * viewportWidth, ((y - minY) / (maxY - minY)) * viewportHeight];
  };
  const projectedRows = (Array.isArray(rows) ? rows : [])
    .map((row) => ({row,coordinates:rowCoordinates(row)}))
    .filter((item) => item.coordinates.length>=2)
    .map(({row,coordinates}) => {
      const projected=coordinates.map(project);
      return {...row,coordinates:projected,start:projected[0],end:projected.at(-1)};
    });
  const projectedExclusions = (Array.isArray(exclusions) ? exclusions : []).map((item, index) => {
    const geometry = normalizeRing(Array.isArray(item) ? item : item?.geometry);
    if (!geometry.length) return null;
    return {
      id: Array.isArray(item) ? `area-${index + 1}` : (item.id ?? `exclusion-${index + 1}`),
      type: Array.isArray(item) ? 'area' : (item.type === 'linear' ? 'linear' : 'area'),
      label: Array.isArray(item) ? '' : (item.label ?? ''),
      widthM: Array.isArray(item) ? null : (item.widthM ?? null),
      points: geometry.map(project)
    };
  }).filter(Boolean);
  const projectedSides = measureSides(ring).map((side) => ({
    ...side,
    point: project(side.midpoint),
    label: `${Math.round(side.lengthM).toLocaleString('it-IT')} m`
  }));
  const [west, north] = inverseMercator([minX, minY]);
  const [east, south] = inverseMercator([maxX, maxY]);
  return {
    valid: true,
    width: viewportWidth,
    height: viewportHeight,
    captureBounds: [[west, south], [east, north]],
    polygon: ring.map(project),
    rows: projectedRows,
    exclusions: projectedExclusions,
    sideMeasurements: projectedSides
  };
}
