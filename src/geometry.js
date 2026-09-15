const EARTH_RADIUS_M = 6371008.8;
const DEG = Math.PI / 180;

export function roundUpTo25(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / 25) * 25;
}

function stripClosingPoint(coords) {
  if (!Array.isArray(coords)) return [];
  if (coords.length > 1) {
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first?.[0] === last?.[0] && first?.[1] === last?.[1]) return coords.slice(0, -1);
  }
  return coords.slice();
}

function referenceFor(coords) {
  const points = stripClosingPoint(coords);
  if (!points.length) return { lon: 0, lat: 0 };
  return {
    lon: points.reduce((sum, point) => sum + point[0], 0) / points.length,
    lat: points.reduce((sum, point) => sum + point[1], 0) / points.length
  };
}

function toXY(point, ref) {
  const x = (point[0] - ref.lon) * DEG * EARTH_RADIUS_M * Math.cos(ref.lat * DEG);
  const y = (point[1] - ref.lat) * DEG * EARTH_RADIUS_M;
  return [x, y];
}

function toLonLat(point, ref) {
  return [
    ref.lon + point[0] / (DEG * EARTH_RADIUS_M * Math.cos(ref.lat * DEG)),
    ref.lat + point[1] / (DEG * EARTH_RADIUS_M)
  ];
}

function rotate([x, y], angleRad) {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return [x * cos - y * sin, x * sin + y * cos];
}

function closeXY(points) {
  if (!points.length) return [];
  return [...points, points[0]];
}

export function polygonMetrics(coords) {
  const raw = stripClosingPoint(coords);
  if (raw.length < 3) return { areaM2: 0, perimeterM: 0, vertexCount: raw.length };
  const ref = referenceFor(raw);
  const points = raw.map((point) => toXY(point, ref));
  const ring = closeXY(points);
  let twiceArea = 0;
  let perimeterM = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    twiceArea += x1 * y2 - x2 * y1;
    perimeterM += Math.hypot(x2 - x1, y2 - y1);
  }
  return {
    areaM2: Math.abs(twiceArea) / 2,
    perimeterM,
    vertexCount: raw.length
  };
}

function intersectionsAtX(ring, x) {
  const ys = [];
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    if (x1 === x2) continue;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    // half-open interval prevents double counting polygon vertices
    if (x < minX || x >= maxX) continue;
    const t = (x - x1) / (x2 - x1);
    ys.push(y1 + t * (y2 - y1));
  }
  return ys.sort((a, b) => a - b);
}


function pairIntervals(values) {
  const intervals = [];
  for (let i = 0; i + 1 < values.length; i += 2) intervals.push([values[i], values[i + 1]]);
  return intervals;
}

function subtractIntervals(baseIntervals, cuts) {
  let current = baseIntervals.slice();
  for (const [cutStart, cutEnd] of cuts) {
    const next = [];
    for (const [start, end] of current) {
      if (cutEnd <= start || cutStart >= end) { next.push([start, end]); continue; }
      if (cutStart > start) next.push([start, Math.min(cutStart, end)]);
      if (cutEnd < end) next.push([Math.max(cutEnd, start), end]);
    }
    current = next;
  }
  return current.filter(([start,end]) => end - start > 0.05);
}

export function generateRows(coords, rowSpacingM, orientationDeg = 0, { exclusions = [] } = {}) {
  const raw = stripClosingPoint(coords);
  if (raw.length < 3 || !Number.isFinite(rowSpacingM) || rowSpacingM <= 0) return [];

  const ref = referenceFor(raw);
  const angle = -(Number(orientationDeg) || 0) * DEG;
  const unrotateAngle = -angle;
  const rotated = raw.map((point) => rotate(toXY(point, ref), angle));
  const ring = closeXY(rotated);
  const exclusionRings = (Array.isArray(exclusions) ? exclusions : []).map((exclusion) => closeXY(stripClosingPoint(exclusion).map((point) => rotate(toXY(point, ref), angle)))).filter((candidate) => candidate.length >= 4);
  const xs = rotated.map(([x]) => x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const rows = [];
  const epsilon = 1e-7;

  for (let x = minX + rowSpacingM / 2; x < maxX - epsilon; x += rowSpacingM) {
    const outerIntervals = pairIntervals(intersectionsAtX(ring, x));
    const cutIntervals = exclusionRings.flatMap((exclusionRing) => pairIntervals(intersectionsAtX(exclusionRing, x)));
    const usableIntervals = subtractIntervals(outerIntervals, cutIntervals);
    for (const [yStart, yEnd] of usableIntervals) {
      const startRotated = [x, yStart];
      const endRotated = [x, yEnd];
      const lengthM = Math.abs(yEnd - yStart);
      if (lengthM < 0.05) continue;
      const start = toLonLat(rotate(startRotated, unrotateAngle), ref);
      const end = toLonLat(rotate(endRotated, unrotateAngle), ref);
      rows.push({ start, end, lengthM });
    }
  }

  return rows;
}

export function estimatePlantsFromRows(rows, plantSpacingM) {
  if (!Array.isArray(rows) || !Number.isFinite(plantSpacingM) || plantSpacingM <= 0) return 0;
  return rows.reduce((sum, row) => {
    if (!Number.isFinite(row?.lengthM) || row.lengthM <= 0) return sum;
    return sum + Math.floor(row.lengthM / plantSpacingM) + 1;
  }, 0);
}

export function rowsToFeatureCollection(rows) {
  return {
    type: 'FeatureCollection',
    features: (rows ?? []).map((row, index) => ({
      type: 'Feature',
      id: index,
      properties: { lengthM: row.lengthM },
      geometry: { type: 'LineString', coordinates: [row.start, row.end] }
    }))
  };
}

export function pointInPolygon(point, coords) {
  const [x, y] = point ?? [];
  const ring = stripClosingPoint(coords);
  if (!Number.isFinite(x) || !Number.isFinite(y) || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}

export function sideMeasurements(coords) {
  const raw = stripClosingPoint(coords);
  if (raw.length < 2) return [];
  const ref = referenceFor(raw);
  return raw.map((start, index) => {
    const end = raw[(index + 1) % raw.length];
    const [x1, y1] = toXY(start, ref);
    const [x2, y2] = toXY(end, ref);
    return {
      start,
      end,
      midpoint: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
      lengthM: Math.hypot(x2 - x1, y2 - y1)
    };
  });
}

export function suggestRowOrientation(coords, rowSpacingM, { stepDeg = 5 } = {}) {
  const spacing = Number(rowSpacingM);
  const step = Math.max(1, Math.min(45, Number(stepDeg) || 5));
  if (!Array.isArray(coords) || coords.length < 4 || !Number.isFinite(spacing) || spacing <= 0) return 0;

  let best = { angle:0, averageLength:-1, totalLength:-1, rowCount:Infinity };
  for (let angle = 0; angle < 180; angle += step) {
    const rows = generateRows(coords, spacing, angle);
    if (!rows.length) continue;
    const totalLength = rows.reduce((sum, row) => sum + row.lengthM, 0);
    const averageLength = totalLength / rows.length;
    const better = averageLength > best.averageLength + 0.01
      || (Math.abs(averageLength - best.averageLength) <= 0.01 && totalLength > best.totalLength + 0.01)
      || (Math.abs(averageLength - best.averageLength) <= 0.01 && Math.abs(totalLength - best.totalLength) <= 0.01 && rows.length < best.rowCount);
    if (better) best = { angle, averageLength, totalLength, rowCount:rows.length };
  }
  return best.angle;
}

export function sideMeasurementsToFeatureCollection(measurements) {
  return {
    type: 'FeatureCollection',
    features: (measurements ?? []).filter((side) => Number.isFinite(side?.lengthM) && Array.isArray(side?.midpoint)).map((side, index) => ({
      type: 'Feature',
      id: index,
      properties: { lengthM: side.lengthM, label: `${Math.round(side.lengthM).toLocaleString('it-IT')} m` },
      geometry: { type: 'Point', coordinates: side.midpoint }
    }))
  };
}
