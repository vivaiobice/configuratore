import {createContourDomain} from './terrain-contour-domain.js?v=1.3.1';
import { toUTM, fromUTM } from './coordinate-system.js?v=1.3.1';
import polygonClipping from './vendor/polygon-clipping.js?v=1.3.1';
export const MAX_TERRAIN_CELLS = 262144;
export const MAX_TERRAIN_FIELD_BYTES = 1024 * 1024;
export class TerrainModelError extends Error {
  constructor(message, code = 'invalid-terrain') {
    super(message);
    this.name = 'TerrainModelError';
    this.code = code;
  }
}
const utf8 = new TextEncoder(),
  decodedCache = new Map(),
  preparedCache = new WeakMap();
const HASH_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
function sha256(bytes) {
  const data = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  data.set(bytes);
  data[bytes.length] = 128;
  const view = new DataView(data.buffer);
  view.setUint32(data.length - 8, Math.floor(bytes.length / 0x20000000));
  view.setUint32(data.length - 4, bytes.length * 8);
  const h = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
      0x1f83d9ab, 0x5be0cd19,
    ],
    w = new Uint32Array(64),
    rotr = (v, n) => (v >>> n) | (v << (32 - n));
  for (let offset = 0; offset < data.length; offset += 64) {
    for (let j = 0; j < 16; j++) w[j] = view.getUint32(offset + j * 4);
    for (let j = 16; j < 64; j++) {
      const a = w[j - 15],
        b = w[j - 2];
      w[j] =
        (w[j - 16] +
          (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) +
          w[j - 7] +
          (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) >>>
        0;
    }
    let [a, b, c, d, e, f, g, i] = h;
    for (let j = 0; j < 64; j++) {
      const t1 =
          (i +
            (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) +
            ((e & f) ^ (~e & g)) +
            HASH_K[j] +
            w[j]) >>>
          0,
        t2 =
          ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) +
            ((a & b) ^ (a & c) ^ (b & c))) >>>
          0;
      i = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    for (const [j, n] of [a, b, c, d, e, f, g, i].entries())
      h[j] = (h[j] + n) >>> 0;
  }
  return h.map((n) => n.toString(16).padStart(8, '0')).join('');
}
function canonical(value) {
  if (value === null) return 'null';
  if (Array.isArray(value) || ArrayBuffer.isView(value))
    return '[' + Array.from(value, (v) => canonical(v ?? null)).join(',') + ']';
  if (typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .filter((k) => value[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new TerrainModelError('Input non numerico per hash.');
  return JSON.stringify(value);
}
export function terrainInputHash(value) {
  return sha256(utf8.encode(canonical(value)));
}
export function terrainContentHash(model) {
  return terrainInputHash({
    version: model.version,
    algorithmVersion: model.algorithmVersion,
    source: model.source,
    crs: model.crs,
    grid: model.grid,
    coverage: model.coverage,
  });
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export function encodeTerrainGrid(input) {
  const values =
    Array.isArray(input) || ArrayBuffer.isView(input) ? input : input?.values;
  if (
    !values ||
    !Number.isInteger(values.length) ||
    values.length > MAX_TERRAIN_CELLS
  )
    throw new TerrainModelError('Limite celle del terreno superato.', 'budget');
  const bytes = new Uint8Array(values.length * 4),
    view = new DataView(bytes.buffer);
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i]))
      throw new TerrainModelError(
        'Cella nodata o quota non finita.',
        'coverage',
      );
    view.setFloat32(i * 4, values[i], true);
    if (!Number.isFinite(view.getFloat32(i * 4, true)))
      throw new TerrainModelError('Quota float32 non valida.');
  }
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
function readGrid(grid) {
  const count = grid?.width * grid?.height;
  if (
    !Number.isInteger(grid?.width) ||
    !Number.isInteger(grid?.height) ||
    grid.width < 2 ||
    grid.height < 2 ||
    count > MAX_TERRAIN_CELLS
  )
    throw new TerrainModelError(
      'Dimensioni griglia o limite celle non validi.',
      'budget',
    );
  const base64 = grid.valuesBase64;
  if (
    typeof base64 !== 'string' ||
    base64.length !== 4 * Math.ceil((count * 4) / 3) ||
    !/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)
  )
    throw new TerrainModelError('Griglia mancante o base64 corrotto.');
  const raw = atob(base64);
  if (raw.length !== count * 4)
    throw new TerrainModelError('Dimensioni byte griglia non coerenti.');
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0)),
    view = new DataView(bytes.buffer),
    values = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    values[i] = view.getFloat32(i * 4, true);
    if (!Number.isFinite(values[i]) || values[i] < -12000 || values[i] > 10000)
      throw new TerrainModelError(
        'Cella nodata o quota non valida.',
        'coverage',
      );
  }
  return values;
}
export function decodeTerrainGrid(input) {
  return readGrid(input?.grid ?? input);
}
function supportBounds(grid) {
  return [
    grid.origin[0],
    grid.origin[1] + (grid.height - 1) * grid.step[1],
    grid.origin[0] + (grid.width - 1) * grid.step[0],
    grid.origin[1],
  ];
}
export function createTerrainModel({
  source,
  grid,
  coverage,
  acquiredAt = new Date().toISOString(),
  crs = 'EPSG:32632',
  algorithmVersion = 'terrain-1',
}) {
  const frozenGrid = {
    width: grid.width,
    height: grid.height,
    origin: [...grid.origin],
    step: [...grid.step],
    valuesBase64: grid.valuesBase64 ?? encodeTerrainGrid(grid.values),
  };
  const bounds = supportBounds(frozenGrid),
    epsg = Number(crs.split(':')[1]);
  const model = {
    version: 1,
    algorithmVersion,
    source: source ?? {
      id: 'synthetic',
      label: 'Modello di prova',
      resolutionM: grid.step[0],
      surveyEpoch: null,
      release: 'fixture',
      citation: 'Synthetic numerical fixture',
      license: 'CC0',
      url: 'about:blank',
    },
    acquiredAt,
    crs,
    grid: frozenGrid,
    coverage: coverage ?? {
      bounds,
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [bounds[0], bounds[1]],
            [bounds[2], bounds[1]],
            [bounds[2], bounds[3]],
            [bounds[0], bounds[3]],
            [bounds[0], bounds[1]],
          ].map((p) => fromUTM(p, epsg)),
        ],
      },
    },
    validation: { complete: true },
  };
  model.contentHash = terrainContentHash(model);
  const result = validateTerrainModel(model);
  if (!result.valid)
    throw new TerrainModelError(result.errors.join('; '), result.code);
  freeze(model);
  const prepared = preparedCache.get(model);
  if (prepared) prepared.immutableModel = true;
  return model;
}
function recursivelyFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return (
    Object.isFrozen(value) && Object.values(value).every(recursivelyFrozen)
  );
}
function signature(model) {
  return JSON.stringify({
    ...model,
    grid: { ...model.grid, valuesBase64: undefined },
  });
}
function prepare(model, checkIntegrity = true) {
  if (!model || typeof model !== 'object')
    throw new TerrainModelError('Modello terreno mancante.');
  const previous = preparedCache.get(model);
  if (previous && !checkIntegrity && previous.immutableModel) return previous;
  const sig = signature(model);
  if (
    previous?.signature === sig &&
    previous.base64 === model.grid?.valuesBase64
  ) {
    if (Object.isFrozen(model))
      previous.immutableModel = recursivelyFrozen(model);
    return previous;
  }
  if (model.version !== 1 || typeof model.algorithmVersion !== 'string')
    throw new TerrainModelError('Versione modello terreno non supportata.');
  if (!['EPSG:32632', 'EPSG:32633', 'EPSG:32634'].includes(model.crs))
    throw new TerrainModelError('CRS del modello non supportato.');
  const grid = model.grid;
  if (
    !grid?.origin?.every(Number.isFinite) ||
    grid.origin.length !== 2 ||
    !grid.step?.every(Number.isFinite) ||
    grid.step.length !== 2 ||
    grid.step[0] <= 0 ||
    grid.step[1] !== -grid.step[0]
  )
    throw new TerrainModelError('Origine o passo nativo non valido.');
  if (
    !model.source?.id ||
    !model.source.label ||
    !model.source.citation ||
    !model.source.license ||
    !model.source.url ||
    model.source.resolutionM !== grid.step[0]
  )
    throw new TerrainModelError('Fonte o risoluzione terreno non valida.');
  if (!model.validation?.complete)
    throw new TerrainModelError('Copertura terreno incompleta.', 'coverage');
  if (!model.acquiredAt || !Number.isFinite(Date.parse(model.acquiredAt)))
    throw new TerrainModelError('Data di acquisizione non valida.');
  if (
    !model.coverage?.bounds ||
    model.coverage.bounds.length !== 4 ||
    !model.coverage.polygon
  )
    throw new TerrainModelError('Copertura mancante.', 'coverage');
  if (utf8.encode(JSON.stringify(model)).length > MAX_TERRAIN_FIELD_BYTES)
    throw new TerrainModelError(
      'Limite serializzato terreno 1 MiB superato.',
      'budget',
    );
  const values = readGrid(grid);
  const nodata =
    model.source.id === 'tinitaly-1.1'
      ? -9999
      : model.source.id === 'piemonte-ice-dtm5'
        ? -99
        : null;
  if (nodata !== null && values.includes(nodata))
    throw new TerrainModelError(
      'Cella nodata nella griglia congelata.',
      'coverage',
    );
  if (model.contentHash !== terrainContentHash(model))
    throw new TerrainModelError('Hash contenuto terreno non valido.');
  const bounds = supportBounds(grid);
  if (
    model.coverage.bounds.some(
      (v, i) => !Number.isFinite(v) || Math.abs(v - bounds[i]) > 1e-6,
    )
  )
    throw new TerrainModelError(
      'Copertura fuori dal supporto nativo.',
      'coverage',
    );
  const supportPolygons = polygons(model.coverage.polygon),
    epsg = Number(model.crs.split(':')[1]);
  if (
    supportPolygons.length !== 1 ||
    supportPolygons[0].length !== 1 ||
    supportPolygons[0][0].length < 4
  )
    throw new TerrainModelError('Poligono copertura non valido.', 'coverage');
  const ring = supportPolygons[0][0],
    projected = ring.map((q) => toUTM(q, epsg));
  if (
    ring[0][0] !== ring.at(-1)[0] ||
    ring[0][1] !== ring.at(-1)[1] ||
    ringArea(projected) <= 1e-8 ||
    projected.some(
      (q) =>
        q[0] < bounds[0] - 1e-5 ||
        q[0] > bounds[2] + 1e-5 ||
        q[1] < bounds[1] - 1e-5 ||
        q[1] > bounds[3] + 1e-5,
    )
  )
    throw new TerrainModelError('Poligono fuori copertura nativa.', 'coverage');
  const cached = decodedCache.get(model.contentHash);
  let data = values;
  if (cached?.base64 === grid.valuesBase64) data = cached.values;
  else {
    decodedCache.set(model.contentHash, { base64: grid.valuesBase64, values });
    if (decodedCache.size > 6)
      decodedCache.delete(decodedCache.keys().next().value);
  }
  const result = {
    signature: sig,
    base64: grid.valuesBase64,
    values: data,
    grid: freeze({
      width: grid.width,
      height: grid.height,
      origin: [...grid.origin],
      step: [...grid.step],
      valuesBase64: grid.valuesBase64,
    }),
    immutableModel: recursivelyFrozen(model),
    bounds,
    epsg: Number(model.crs.split(':')[1]),
  };
  preparedCache.set(model, result);
  return result;
}
export function validateTerrainModel(model) {
  try {
    const p = prepare(model);
    return { valid: true, errors: [], cellCount: p.values.length };
  } catch (error) {
    preparedCache.delete(model);
    return {
      valid: false,
      errors: [error.message],
      code: error.code ?? 'invalid-terrain',
    };
  }
}
function sampleXY(p, [x, y]) {
  let u = (x - p.grid.origin[0]) / p.grid.step[0],
    v = (y - p.grid.origin[1]) / p.grid.step[1];
  const eps = 2e-7;
  if (
    u < -eps ||
    v < -eps ||
    u > p.grid.width - 1 + eps ||
    v > p.grid.height - 1 + eps
  )
    return null;
  u = Math.max(0, Math.min(p.grid.width - 1, u));
  v = Math.max(0, Math.min(p.grid.height - 1, v));
  const i = Math.min(Math.floor(u), p.grid.width - 2),
    j = Math.min(Math.floor(v), p.grid.height - 2),
    a = u - i,
    b = v - j,
    k = j * p.grid.width + i;
  const z00 = p.values[k],
    z10 = p.values[k + 1],
    z01 = p.values[k + p.grid.width],
    z11 = p.values[k + p.grid.width + 1];
  return a + b <= 1
    ? z00 + a * (z10 - z00) + b * (z01 - z00)
    : z11 + (1 - b) * (z10 - z11) + (1 - a) * (z01 - z11);
}
export function sampleTerrain(model, point) {
  const p = prepare(model, false);
  return sampleXY(p, toUTM(point, p.epsg));
}
export function terrainPolylineLength(model, points) {
  const p = prepare(model);
  if (!Array.isArray(points) || points.length < 2)
    throw new TerrainModelError('Polilinea terreno non valida.');
  let length = 0;
  const xy = points.map((point) => toUTM(point, p.epsg));
  for (let i = 1; i < xy.length; i++) {
    const a = xy[i - 1],
      b = xy[i];
    if (sampleXY(p, a) === null || sampleXY(p, b) === null)
      throw new TerrainModelError(
        'Lunghezza fuori copertura terreno.',
        'coverage',
      );
    const u0 = (a[0] - p.grid.origin[0]) / p.grid.step[0],
      v0 = (a[1] - p.grid.origin[1]) / p.grid.step[1],
      u1 = (b[0] - p.grid.origin[0]) / p.grid.step[0],
      v1 = (b[1] - p.grid.origin[1]) / p.grid.step[1],
      cuts = [0, 1];
    for (const [start, end] of [
      [u0, u1],
      [v0, v1],
      [u0 + v0, u1 + v1],
    ]) {
      if (Math.abs(end - start) < 1e-12) continue;
      for (
        let k = Math.floor(Math.min(start, end)) + 1;
        k < Math.max(start, end);
        k++
      ) {
        const t = (k - start) / (end - start);
        if (t > 1e-10 && t < 1 - 1e-10) cuts.push(t);
      }
    }
    cuts.sort((x, y) => x - y);
    let previous = a,
      previousZ = sampleXY(p, a),
      lastT = 0;
    for (const t of cuts.slice(1)) {
      if (t - lastT < 1e-12) continue;
      const q = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
        z = sampleXY(p, q);
      if (z === null)
        throw new TerrainModelError('Polilinea fuori copertura.', 'coverage');
      length += Math.hypot(
        q[0] - previous[0],
        q[1] - previous[1],
        z - previousZ,
      );
      previous = q;
      previousZ = z;
      lastT = t;
    }
  }
  return length;
}
function polygons(input) {
  const geometry = input?.type === 'Feature' ? input.geometry : input;
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
  if (geometry?.type === 'Polygon') return [geometry.coordinates];
  if (
    Array.isArray(geometry) &&
    Array.isArray(geometry[0]) &&
    typeof geometry[0][0] === 'number'
  )
    return [[geometry]];
  throw new TerrainModelError('Poligono terreno non valido.');
}
function ringArea(ring) {
  if (!ring.length) return 0;
  let sum = 0;
  const [x, y] = ring[0];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    sum += (a[0] - x) * (b[1] - y) - (b[0] - x) * (a[1] - y);
  }
  return Math.abs(sum) / 2;
}
function multiArea(multi) {
  return multi.reduce(
    (sum, polygon) =>
      sum +
      ringArea(polygon[0]) -
      polygon.slice(1).reduce((s, r) => s + ringArea(r), 0),
    0,
  );
}
export function terrainSurfaceArea(model, polygon) {
  const p = prepare(model),
    multi = polygons(polygon).map((rings) =>
      rings.map((ring) => ring.map((q) => toUTM(q, p.epsg))),
    );
  for (const rings of multi)
    for (const ring of rings) {
      if (ring.length < 4)
        throw new TerrainModelError('Anello terreno non valido.');
      for (const point of ring)
        if (sampleXY(p, point) === null)
          throw new TerrainModelError(
            'Area fuori copertura terreno.',
            'coverage',
          );
    }
  let area = 0;
  const minX = Math.min(...multi.flat(2).map((q) => q[0])),
    maxX = Math.max(...multi.flat(2).map((q) => q[0])),
    minY = Math.min(...multi.flat(2).map((q) => q[1])),
    maxY = Math.max(...multi.flat(2).map((q) => q[1]));
  const imin = Math.max(
      0,
      Math.floor((minX - p.grid.origin[0]) / p.grid.step[0]),
    ),
    imax = Math.min(
      p.grid.width - 2,
      Math.floor((maxX - p.grid.origin[0]) / p.grid.step[0]),
    ),
    jmin = Math.max(0, Math.floor((p.grid.origin[1] - maxY) / -p.grid.step[1])),
    jmax = Math.min(
      p.grid.height - 2,
      Math.floor((p.grid.origin[1] - minY) / -p.grid.step[1]),
    );
  for (let j = jmin; j <= jmax; j++)
    for (let i = imin; i <= imax; i++) {
      const k = j * p.grid.width + i,
        x = p.grid.origin[0] + i * p.grid.step[0],
        y = p.grid.origin[1] + j * p.grid.step[1],
        dx = p.grid.step[0],
        dy = p.grid.step[1],
        vertices = [
          [x, y, p.values[k]],
          [x + dx, y, p.values[k + 1]],
          [x, y + dy, p.values[k + p.grid.width]],
          [x + dx, y + dy, p.values[k + p.grid.width + 1]],
        ];
      for (const indexes of [
        [0, 1, 2],
        [1, 3, 2],
      ]) {
        const [a, b, c] = indexes.map((n) => vertices[n]),
          boundary = [
            a.slice(0, 2),
            b.slice(0, 2),
            c.slice(0, 2),
            a.slice(0, 2),
          ],
          intersection = polygonClipping.intersection(multi, [boundary]);
        const horizontal = multiArea(intersection);
        if (!horizontal) continue;
        const ux = b[0] - a[0],
          uy = b[1] - a[1],
          uz = b[2] - a[2],
          vx = c[0] - a[0],
          vy = c[1] - a[1],
          vz = c[2] - a[2];
        area +=
          (horizontal *
            Math.hypot(
              uy * vz - uz * vy,
              uz * vx - ux * vz,
              ux * vy - uy * vx,
            )) /
          Math.abs(ux * vy - uy * vx);
      }
    }
  return area;
}
export function createTerrainSampler(model) {
  const p = prepare(model);
  return (point) => sampleXY(p, toUTM(point, p.epsg));
}
export function terrainSummary(model) {
  const validation = validateTerrainModel(model);
  if (!validation.valid) return validation;
  const p = prepare(model);
  let min = Infinity,
    max = -Infinity;
  for (const z of p.values) {
    min = Math.min(min, z);
    max = Math.max(max, z);
  }
  let maxSlopePercent = 0;
  for (let j = 0; j < p.grid.height - 1; j++)
    for (let i = 0; i < p.grid.width - 1; i++) {
      const k = j * p.grid.width + i,
        r = p.grid.step[0],
        a = p.values[k],
        b = p.values[k + 1],
        c = p.values[k + p.grid.width],
        d = p.values[k + p.grid.width + 1];
      maxSlopePercent = Math.max(
        maxSlopePercent,
        100 * Math.hypot((b - a) / r, (c - a) / r),
        100 * Math.hypot((d - c) / r, (d - b) / r),
      );
    }
  return {
    valid: true,
    maxSlopePercent,
    source: model.source,
    sourceLabel: model.source.label,
    resolutionM: model.source.resolutionM,
    surveyEpoch: model.source.surveyEpoch,
    minElevationM: min,
    maxElevationM: max,
    rangeM: max - min,
    cellCount: p.values.length,
    coverage: model.coverage,
    contentHash: model.contentHash,
  };
}
export function getTerrainMesh(model) {
  const p = prepare(model),
    vertices = [],
    triangles = [];
  for (let j = 0; j < p.grid.height; j++)
    for (let i = 0; i < p.grid.width; i++)
      vertices.push([
        p.grid.origin[0] + i * p.grid.step[0],
        p.grid.origin[1] + j * p.grid.step[1],
        p.values[j * p.grid.width + i],
      ]);
  for (let j = 0; j < p.grid.height - 1; j++)
    for (let i = 0; i < p.grid.width - 1; i++) {
      const k = j * p.grid.width + i;
      triangles.push(
        [k, k + 1, k + p.grid.width],
        [k + 1, k + p.grid.width + 1, k + p.grid.width],
      );
    }
  return {
    vertices,
    triangles,
    width: p.grid.width,
    height: p.grid.height,
    origin: [...p.grid.origin],
    step: [...p.grid.step],
    crs: model.crs,
  };
}

/** Field-only native-face extrema and slope; terrainSummary remains support-wide. */
export function terrainScopedSummary(model, geometry) {
  const validation = validateTerrainModel(model);
  if (!validation.valid) return validation;
  try {
    const {minM, maxM, maxSlopePercent} = createContourDomain({model, geometry});
    return {valid: true, minM, maxM, rangeM: maxM - minM, maxSlopePercent};
  } catch (error) {
    return {valid: false, errors: [error.message], status: error.status};
  }
}
