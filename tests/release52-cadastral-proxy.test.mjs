import test from 'node:test';
import assert from 'node:assert/strict';

const proxyModule = await import('../supabase/functions/_shared/cadastral-wms.js').catch(() => ({}));

test('cadastral proxy accepts only bounded Italian map requests', () => {
  assert.equal(typeof proxyModule.parseCadastralProxyRequest, 'function');
  const parsed = proxyModule.parseCadastralProxyRequest(new URL('https://example.test/cadastral-wms?west=8.20&south=44.69&east=8.25&north=44.73&width=1200&height=800'));
  assert.deepEqual(parsed, { west:8.2, south:44.69, east:8.25, north:44.73, width:1200, height:800 });
  assert.throws(() => proxyModule.parseCadastralProxyRequest(new URL('https://example.test/cadastral-wms?west=-180&south=-90&east=180&north=90&width=9000&height=9000')), /invalid/i);
});

test('cadastral proxy builds a fixed official WMS request rather than an open proxy', () => {
  assert.equal(typeof proxyModule.buildOfficialCadastralUrl, 'function');
  const url = new URL(proxyModule.buildOfficialCadastralUrl({ west:8.2, south:44.69, east:8.25, north:44.73, width:1200, height:800 }));
  assert.equal(url.hostname, 'wms.cartografia.agenziaentrate.gov.it');
  assert.equal(url.searchParams.get('SERVICE'), 'WMS');
  assert.equal(url.searchParams.get('VERSION'), '1.1.1');
  assert.equal(url.searchParams.get('LAYERS'), 'CP.CadastralParcel');
  assert.equal(url.searchParams.get('SRS'), 'EPSG:4258');
  assert.equal(url.searchParams.get('BBOX'), '8.2,44.69,8.25,44.73');
  assert.equal(url.searchParams.get('FORMAT'), 'image/png');
});

test('cadastral proxy returns a browser-safe cached PNG response', async () => {
  assert.equal(typeof proxyModule.handleCadastralWmsRequest, 'function');
  let requestedUrl = '';
  const png = new Uint8Array([137,80,78,71,13,10,26,10]);
  const response = await proxyModule.handleCadastralWmsRequest(
    new Request('https://example.test/cadastral-wms?west=8.20&south=44.69&east=8.25&north=44.73&width=1200&height=800'),
    { fetchImpl:async url => { requestedUrl = String(url); return new Response(png, { status:200, headers:{ 'content-type':'image/png' } }); } }
  );
  assert.match(requestedUrl, /^https:\/\/wms\.cartografia\.agenziaentrate\.gov\.it\//);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.match(response.headers.get('cache-control') ?? '', /max-age/);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png);
});

test('cadastral proxy rejects invalid requests and upstream non-images', async () => {
  assert.equal(typeof proxyModule.handleCadastralWmsRequest, 'function');
  if (typeof proxyModule.handleCadastralWmsRequest !== 'function') return;
  const invalid = await proxyModule.handleCadastralWmsRequest(new Request('https://example.test/cadastral-wms?west=x'));
  assert.equal(invalid.status, 400);
  const upstreamError = await proxyModule.handleCadastralWmsRequest(
    new Request('https://example.test/cadastral-wms?west=8.20&south=44.69&east=8.25&north=44.73&width=1200&height=800'),
    { fetchImpl:async () => new Response('<xml>error</xml>', { status:200, headers:{ 'content-type':'text/xml' } }) }
  );
  assert.equal(upstreamError.status, 502);
  assert.equal(upstreamError.headers.get('access-control-allow-origin'), '*');
});
