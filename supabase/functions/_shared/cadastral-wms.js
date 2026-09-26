const OFFICIAL_WMS_ENDPOINT = 'https://wms.cartografia.agenziaentrate.gov.it/inspire/wms/ows01.php';
const CORS_HEADERS = Object.freeze({
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET, OPTIONS',
  'access-control-allow-headers':'content-type, apikey, authorization, x-client-info',
  'cross-origin-resource-policy':'cross-origin'
});

function json(status, message) {
  return new Response(JSON.stringify({ error:message }), {
    status,
    headers:{ ...CORS_HEADERS, 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' }
  });
}

function numeric(url, name) {
  const raw = url.searchParams.get(name);
  if (raw === null || raw.trim() === '') throw new TypeError('invalid_request');
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new TypeError('invalid_request');
  return value;
}

export function parseCadastralProxyRequest(url) {
  const west = numeric(url, 'west');
  const south = numeric(url, 'south');
  const east = numeric(url, 'east');
  const north = numeric(url, 'north');
  const width = Math.round(numeric(url, 'width'));
  const height = Math.round(numeric(url, 'height'));
  const mode = url.searchParams.get('mode') || 'parcels';
  const insideItaly = west >= 5.5 && east <= 19.5 && south >= 34 && north <= 48.5;
  const boundedView = west < east && south < north && east - west <= 0.5 && north - south <= 0.5;
  const validImage = width >= 1 && width <= 2048 && height >= 1 && height <= 2048;
  if (!insideItaly || !boundedView || !validImage || !['sheets','parcels'].includes(mode)) throw new TypeError('invalid_request');
  return { west, south, east, north, width, height, mode };
}

export function buildOfficialCadastralUrl({ west, south, east, north, width, height, mode = 'parcels' }) {
  const url = new URL(OFFICIAL_WMS_ENDPOINT);
  const params = {
    SERVICE:'WMS',
    VERSION:'1.1.1',
    REQUEST:'GetMap',
    LAYERS:'CP.CadastralParcel,codice_plla',
    STYLES:'',
    SRS:'EPSG:4258',
    BBOX:[west, south, east, north].join(','),
    WIDTH:String(width),
    HEIGHT:String(height),
    FORMAT:'image/png',
    TRANSPARENT:'TRUE',
    EXCEPTIONS:'application/vnd.ogc.se_xml'
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function parseIdentifyRequest(url) {
  const parameters = parseCadastralProxyRequest(url);
  const x = Math.round(numeric(url, 'x'));
  const y = Math.round(numeric(url, 'y'));
  if (x < 0 || x >= parameters.width || y < 0 || y >= parameters.height) throw new TypeError('invalid_request');
  return { ...parameters, x, y };
}

export function buildOfficialCadastralInfoUrl({ west, south, east, north, width, height, x, y }) {
  const url = new URL(OFFICIAL_WMS_ENDPOINT);
  const params = {
    SERVICE:'WMS', VERSION:'1.1.1', REQUEST:'GetFeatureInfo',
    LAYERS:'CP.CadastralParcel,codice_plla', QUERY_LAYERS:'CP.CadastralParcel', STYLES:'',
    SRS:'EPSG:4258', BBOX:[west, south, east, north].join(','),
    WIDTH:String(width), HEIGHT:String(height), X:String(x), Y:String(y),
    FORMAT:'image/png', INFO_FORMAT:'text/html', FEATURE_COUNT:'1', EXCEPTIONS:'application/vnd.ogc.se_xml'
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function decodeHtml(value) {
  return String(value ?? '')
    .replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"').replaceAll('&#39;', "'").trim();
}

export function parseNationalCadastralReference(reference) {
  const normalized = decodeHtml(reference).toUpperCase();
  const match = normalized.match(/^([A-Z0-9]{4})(.)(\d{4})(.)(.)\.([A-Z0-9/_-]+)$/);
  if (!match) return null;
  const [, municipalityCode, sectionCode, sheetCode, attachmentCode, developmentCode, parcel] = match;
  const optional = value => value === '_' || value === '0' ? null : value;
  return {
    municipalityCode,
    section:optional(sectionCode),
    sheet:String(Number(sheetCode)),
    attachment:optional(attachmentCode),
    development:optional(developmentCode),
    parcel
  };
}

export function parseOfficialCadastralInfo(html) {
  const source = String(html ?? '');
  const field = name => decodeHtml(source.match(new RegExp(`<th[^>]*>\\s*${name}\\s*<\\/th>\\s*<td[^>]*>([^<]*)<\\/td>`, 'i'))?.[1]);
  const reference = field('NationalCadastralReference');
  const parsed = parseNationalCadastralReference(reference);
  if (!parsed) return null;
  return { ...parsed, parcel:field('Label') || parsed.parcel, reference };
}

export async function handleCadastralWmsRequest(request, { fetchImpl = globalThis.fetch } = {}) {
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:CORS_HEADERS });
  if (request.method !== 'GET') return json(405, 'method_not_allowed');
  let parameters;
  const identify = new URL(request.url).searchParams.get('operation') === 'identify';
  try {
    parameters = identify ? parseIdentifyRequest(new URL(request.url)) : parseCadastralProxyRequest(new URL(request.url));
  } catch {
    return json(400, 'invalid_request');
  }
  try {
    const upstream = await fetchImpl(identify ? buildOfficialCadastralInfoUrl(parameters) : buildOfficialCadastralUrl(parameters), {
      headers:{ accept:identify ? 'text/html' : 'image/png' },
      signal:AbortSignal.timeout(15000)
    });
    const contentType = upstream.headers.get('content-type')?.toLowerCase() ?? '';
    if (!upstream.ok || (identify ? !contentType.startsWith('text/html') : !contentType.startsWith('image/png'))) return json(502, 'cadastral_service_unavailable');
    if (identify) {
      const result = parseOfficialCadastralInfo(await upstream.text());
      if (!result) return json(404, 'cadastral_parcel_not_found');
      return new Response(JSON.stringify(result), {
        status:200,
        headers:{ ...CORS_HEADERS, 'content-type':'application/json; charset=utf-8', 'cache-control':'public, max-age=60, s-maxage=300' }
      });
    }
    return new Response(upstream.body, {
      status:200,
      headers:{
        ...CORS_HEADERS,
        'content-type':'image/png',
        'cache-control':'public, max-age=300, s-maxage=900, stale-if-error=3600'
      }
    });
  } catch {
    return json(502, 'cadastral_service_unavailable');
  }
}
