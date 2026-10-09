import { toUTM } from './coordinate-system.js?v=1.3.6';
import { fromArrayBuffer } from './vendor/geotiff.js?v=1.3.6';
import {
  createTerrainModel,
  terrainInputHash,
  MAX_TERRAIN_CELLS,
  TerrainModelError,
} from './terrain-model.js?v=1.3.6';
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024,
  SUPPORT_MARGIN_M = 40;
export const TERRAIN_SOURCES = Object.freeze({
  piemonte: Object.freeze({
    id: 'piemonte-ice-dtm5',
    label: 'Regione Piemonte — ICE DTM 5',
    resolutionM: 5,
    surveyEpoch: '2009–2011',
    release: '2019-02-13',
    citation: 'Regione Piemonte, RIPRESA AEREA ICE 2009-2011 - DTM 5',
    license: 'CC BY 4.0',
    url: 'https://www.geoportale.piemonte.it/geonetwork/srv/api/records/r_piemon:224de2ac-023e-441c-9ae0-ea493b217a8e',
    endpoint:
      'https://geomap.reteunitaria.piemonte.it/ws/taims/rp-01/taimsdtmwcs/wcs_ice_2009_2011_dtm',
    coverage: 'DTM',
    format: 'GEOTIFF_16',
    nodata: -99,
    nativeCorner: [290748, 5165171],
  }),
  tinitaly: Object.freeze({
    id: 'tinitaly-1.1',
    label: 'INGV — TINITALY 1.1',
    resolutionM: 10,
    surveyEpoch: null,
    release: '2023-01',
    citation:
      'Tarquini et al. (2023), TINITALY 1.1, INGV, DOI:10.13127/tinitaly/1.1',
    license: 'CC BY 4.0',
    url: 'https://tinitaly.pi.ingv.it/',
    endpoint: 'https://tinitaly.pi.ingv.it/TINItaly_1_1/wcs',
    coverage: 'TINItaly_1_1:tinitaly_dem',
    format: 'GeoTIFF',
    nodata: -9999,
    nativeCorner: [312500, 5222500],
  }),
});
let caches = new WeakMap();
export function clearTerrainProviderCache() {
  caches = new WeakMap();
}
function abort(signal) {
  if (signal?.aborted)
    throw signal.reason?.name === 'AbortError'
      ? signal.reason
      : new DOMException('Acquisizione annullata.', 'AbortError');
}
function polygonGeometry(polygon) {
  const p = polygon?.type === 'Feature' ? polygon.geometry : polygon;
  if (p?.type === 'Polygon') return p;
  if (Array.isArray(p) && typeof p[0]?.[0] === 'number')
    return { type: 'Polygon', coordinates: [p] };
  throw new TerrainModelError('Perimetro terreno non valido.');
}
function requestFor(source, xy) {
  const r = source.resolutionM,
    [anchorX, anchorY] = source.nativeCorner;
  const bounds = [
    anchorX +
      Math.floor(
        (Math.min(...xy.map((p) => p[0])) - SUPPORT_MARGIN_M - anchorX) / r,
      ) *
        r,
    anchorY +
      Math.floor(
        (Math.min(...xy.map((p) => p[1])) - SUPPORT_MARGIN_M - anchorY) / r,
      ) *
        r,
    anchorX +
      Math.ceil(
        (Math.max(...xy.map((p) => p[0])) + SUPPORT_MARGIN_M - anchorX) / r,
      ) *
        r,
    anchorY +
      Math.ceil(
        (Math.max(...xy.map((p) => p[1])) + SUPPORT_MARGIN_M - anchorY) / r,
      ) *
        r,
  ];
  const width = Math.round((bounds[2] - bounds[0]) / r),
    height = Math.round((bounds[3] - bounds[1]) / r);
  if (width < 2 || height < 2 || width * height > MAX_TERRAIN_CELLS)
    throw new TerrainModelError(
      'Limite celle native del terreno superato.',
      'budget',
    );
  // Native source corner lattices verified from WCS DescribeCoverage (fixture XML).
  // Explicit nearest-neighbour preserves the native values; no lower-resolution request.
  const params = new URLSearchParams({
    SERVICE: 'WCS',
    VERSION: '1.0.0',
    REQUEST: 'GetCoverage',
    COVERAGE: source.coverage,
    CRS: 'EPSG:32632',
    RESPONSE_CRS: 'EPSG:32632',
    BBOX: bounds.join(','),
    RESX: String(r),
    RESY: String(r),
    FORMAT: source.format,
    INTERPOLATION: 'nearest neighbor',
  });
  return { url: source.endpoint + '?' + params, bounds, width, height };
}
async function boundedBody(response, signal) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (declared > MAX_RESPONSE_BYTES)
    throw new TerrainModelError(
      'Risposta terreno oltre il limite di download.',
      'budget',
    );
  if (!response.body?.getReader) {
    const buffer = await response.arrayBuffer();
    abort(signal);
    if (buffer.byteLength > MAX_RESPONSE_BYTES)
      throw new TerrainModelError(
        'Risposta terreno oltre il limite di download.',
        'budget',
      );
    return buffer;
  }
  const reader = response.body.getReader(),
    chunks = [];
  let bytes = 0;
  try {
    while (true) {
      abort(signal);
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES)
        throw new TerrainModelError(
          'Risposta terreno oltre il limite di download.',
          'budget',
        );
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  abort(signal);
  const result = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result.buffer;
}
function validateUncompressedLayout(fd, width, height, responseBytes) {
  // The proven WCS responses are uncompressed. Reject codecs before readRasters
  // can invoke an inflater: compressed byte length never bounds decoded memory.
  if ((fd.Compression ?? 1) !== 1 || (fd.Predictor ?? 1) !== 1)
    throw new TerrainModelError(
      'Compressione GeoTIFF non supportata: è richiesto il formato numerico non compresso.',
      'unsupported-format',
    );
  const tiled = fd.TileOffsets !== undefined;
  const blockWidth = tiled ? fd.TileWidth : width;
  const blockHeight = tiled
    ? fd.TileLength
    : Math.min(fd.RowsPerStrip ?? height, height);
  if (
    !Number.isInteger(blockWidth) ||
    !Number.isInteger(blockHeight) ||
    blockWidth < 1 ||
    blockHeight < 1 ||
    blockWidth * blockHeight > MAX_TERRAIN_CELLS
  )
    throw new TerrainModelError(
      'Dimensioni blocco GeoTIFF non valide.',
      'invalid-layout',
    );
  const across = tiled ? Math.ceil(width / blockWidth) : 1,
    down = Math.ceil(height / blockHeight);
  const offsets = tiled ? fd.TileOffsets : fd.StripOffsets,
    counts = tiled ? fd.TileByteCounts : fd.StripByteCounts;
  if (
    !offsets ||
    !counts ||
    offsets.length !== across * down ||
    counts.length !== offsets.length
  )
    throw new TerrainModelError(
      'Numero di blocchi GeoTIFF non coerente.',
      'invalid-layout',
    );
  for (let i = 0; i < offsets.length; i++) {
    // TIFF tiles include padding to the full declared tile dimensions; the final
    // strip instead contains only the remaining image rows.
    const rows = tiled
      ? blockHeight
      : Math.min(blockHeight, height - i * blockHeight);
    const expectedBytes = blockWidth * rows * 4;
    if (
      !Number.isSafeInteger(offsets[i]) ||
      offsets[i] < 8 ||
      counts[i] !== expectedBytes ||
      offsets[i] + counts[i] > responseBytes
    )
      throw new TerrainModelError(
        'Byte del tile/blocco GeoTIFF non coerenti con le dimensioni float32.',
        'invalid-layout',
      );
  }
}
async function acquire(source, xy, fetchImpl, signal) {
  const request = requestFor(source, xy);
  abort(signal);
  const response = await fetchImpl(request.url, {
    signal,
    mode: 'cors',
    credentials: 'omit',
  });
  abort(signal);
  if (!response.ok)
    throw new TerrainModelError(
      'Servizio altimetrico non disponibile.',
      'unavailable',
    );
  const buffer = await boundedBody(response, signal);
  if (buffer.byteLength < 8)
    throw new TerrainModelError('Risposta GeoTIFF mancante.');
  const signature = new Uint8Array(buffer, 0, 4);
  if (
    !(
      (signature[0] === 73 &&
        signature[1] === 73 &&
        signature[2] === 42 &&
        signature[3] === 0) ||
      (signature[0] === 77 &&
        signature[1] === 77 &&
        signature[2] === 0 &&
        signature[3] === 42)
    )
  )
    throw new TerrainModelError(
      'Il servizio non ha restituito un GeoTIFF numerico.',
    );
  const tiff = await fromArrayBuffer(buffer),
    image = await tiff.getImage(0),
    fd = image.getFileDirectory(),
    keys = image.getGeoKeys(),
    width = image.getWidth(),
    height = image.getHeight();
  if (
    width * height > MAX_TERRAIN_CELLS ||
    width < 2 ||
    height < 2 ||
    (fd.TileWidth ?? width) *
      (fd.TileLength ?? Math.min(fd.RowsPerStrip ?? height, height)) >
      MAX_TERRAIN_CELLS
  )
    throw new TerrainModelError(
      'Limite celle/tile GeoTIFF superato.',
      'budget',
    );
  if (width !== request.width || height !== request.height)
    throw new TerrainModelError(
      'Dimensioni GeoTIFF non native o copertura incompleta.',
      'coverage',
    );
  if (
    image.getSamplesPerPixel() !== 1 ||
    fd.BitsPerSample?.[0] !== 32 ||
    fd.SampleFormat?.[0] !== 3
  )
    throw new TerrainModelError(
      'GeoTIFF richiede quote numeriche float32 a banda singola.',
    );
  if (
    keys.ProjectedCSTypeGeoKey !== 32632 ||
    keys.GTModelTypeGeoKey !== 1 ||
    ![1, 2].includes(keys.GTRasterTypeGeoKey)
  )
    throw new TerrainModelError('CRS o tipo pixel GeoTIFF non verificato.');
  let corner, step;
  if (fd.ModelTransformation) {
    const m = fd.ModelTransformation;
    if (m.length !== 16 || m[1] !== 0 || m[4] !== 0 || m[2] !== 0 || m[6] !== 0)
      throw new TerrainModelError('Rotazione GeoTIFF non supportata.');
    corner = [m[3], m[7]];
    step = [m[0], m[5]];
  } else {
    const scale = fd.ModelPixelScale,
      tie = fd.ModelTiepoint;
    if (!scale || !tie || tie.length !== 6)
      throw new TerrainModelError('Georeferenziazione GeoTIFF mancante.');
    step = [scale[0], -scale[1]];
    corner = [tie[3] - tie[0] * step[0], tie[4] - tie[1] * step[1]];
  }
  if (
    !corner.every(Number.isFinite) ||
    step[0] !== source.resolutionM ||
    step[1] !== -source.resolutionM
  )
    throw new TerrainModelError('Risoluzione nativa GeoTIFF non verificata.');
  const origin =
    keys.GTRasterTypeGeoKey === 1
      ? [corner[0] + step[0] / 2, corner[1] + step[1] / 2]
      : corner;
  const extent = [
    origin[0] - step[0] / 2,
    origin[1] + (height - 0.5) * step[1],
    origin[0] + (width - 0.5) * step[0],
    origin[1] - step[1] / 2,
  ];
  if (extent.some((v, i) => Math.abs(v - request.bounds[i]) > 1e-6))
    throw new TerrainModelError(
      'Bounds/extent GeoTIFF fuori dalla copertura richiesta.',
      'coverage',
    );
  validateUncompressedLayout(fd, width, height, buffer.byteLength);
  abort(signal);
  const values = await image.readRasters({
    samples: [0],
    interleave: true,
    signal,
  });
  abort(signal);
  if (values.length !== width * height)
    throw new TerrainModelError(
      'Numero di celle GeoTIFF decodificate non coerente.',
      'invalid-layout',
    );
  const nodata = image.getGDALNoData();
  if (nodata === null || nodata !== source.nodata)
    throw new TerrainModelError('Maschera nodata GeoTIFF non verificata.');
  for (const value of values)
    if (!Number.isFinite(value) || value === nodata)
      throw new TerrainModelError(
        'Copertura altimetrica incompleta: celle nodata.',
        'coverage',
      );
  const {
    endpoint,
    coverage,
    format,
    nodata: unusedNodata,
    nativeCorner,
    ...metadata
  } = source;
  return createTerrainModel({
    source: metadata,
    grid: { width, height, origin, step, values },
  });
}
export async function loadTerrainForField({
  polygon,
  signal,
  fetchImpl = globalThis.fetch,
}) {
  abort(signal);
  if (typeof fetchImpl !== 'function')
    throw new TerrainModelError('Fetch del terreno non disponibile.');
  const geometry = polygonGeometry(polygon),
    points = geometry.coordinates.flat();
  if (points.length < 4)
    throw new TerrainModelError('Perimetro terreno incompleto.');
  const xy = points.map((p) => toUTM(p, 32632));
  const hash = terrainInputHash(geometry);
  let cache = caches.get(fetchImpl);
  if (!cache) {
    cache = new Map();
    caches.set(fetchImpl, cache);
  }
  const cached = cache.get(hash);
  if (cached) return cached;
  const regional = points.some(
      ([lon, lat]) => lon >= 6.25 && lon <= 9.6 && lat >= 43.8 && lat <= 46.7,
    ),
    sources = regional
      ? [TERRAIN_SOURCES.piemonte, TERRAIN_SOURCES.tinitaly]
      : [TERRAIN_SOURCES.tinitaly];
  let lastError;
  for (const source of sources) {
    try {
      const model = await acquire(source, xy, fetchImpl, signal);
      abort(signal);
      cache.set(hash, model);
      if (cache.size > 4) cache.delete(cache.keys().next().value);
      return model;
    } catch (error) {
      abort(signal);
      if (
        error.name === 'AbortError' ||
        ['budget', 'unsupported-format', 'invalid-layout'].includes(error.code)
      )
        throw error;
      lastError = error;
    }
  }
  throw new TerrainModelError(
    `Altimetria non disponibile: ${lastError?.message ?? 'copertura mancante'}`,
    lastError?.code ?? 'unavailable',
  );
}
