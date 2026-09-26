import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseHTML } from 'linkedom';

test('the cadastral client requests identification for one viewport pixel', async () => {
  const { buildCadastralIdentifyUrl } = await import('../src/cadastre.js');
  assert.equal(typeof buildCadastralIdentifyUrl, 'function');
  const url = new URL(buildCadastralIdentifyUrl({
    west:8.2, south:44.69, east:8.25, north:44.73,
    width:1200, height:800, x:617, y:294
  }));
  assert.equal(url.pathname, '/functions/v1/cadastral-wms');
  assert.equal(url.searchParams.get('operation'), 'identify');
  assert.equal(url.searchParams.get('x'), '617');
  assert.equal(url.searchParams.get('y'), '294');
});

test('the official cadastral reference is split into sheet and parcel', async () => {
  const { parseNationalCadastralReference, parseOfficialCadastralInfo } = await import('../supabase/functions/_shared/cadastral-wms.js');
  assert.deepEqual(parseNationalCadastralReference('I367_002600.278'), {
    municipalityCode:'I367', section:null, sheet:'26', attachment:null, development:null, parcel:'278'
  });
  const html = `
    <tr><th>Label</th><td>278</td></tr>
    <tr><th>NationalCadastralReference</th><td>I367_002600.278</td></tr>`;
  assert.deepEqual(parseOfficialCadastralInfo(html), {
    municipalityCode:'I367', section:null, sheet:'26', attachment:null, development:null,
    parcel:'278', reference:'I367_002600.278'
  });
});

test('the proxy builds a fixed GetFeatureInfo request and returns sanitized JSON', async () => {
  const { buildOfficialCadastralInfoUrl, handleCadastralWmsRequest } = await import('../supabase/functions/_shared/cadastral-wms.js');
  const parameters = { west:8.2, south:44.69, east:8.25, north:44.73, width:1200, height:800, x:617, y:294 };
  const official = new URL(buildOfficialCadastralInfoUrl(parameters));
  assert.equal(official.hostname, 'wms.cartografia.agenziaentrate.gov.it');
  assert.equal(official.searchParams.get('REQUEST'), 'GetFeatureInfo');
  assert.equal(official.searchParams.get('LAYERS'), 'CP.CadastralParcel,codice_plla');
  assert.equal(official.searchParams.get('QUERY_LAYERS'), 'CP.CadastralParcel');
  assert.equal(official.searchParams.get('INFO_FORMAT'), 'text/html');
  assert.equal(official.searchParams.get('X'), '617');
  assert.equal(official.searchParams.get('Y'), '294');

  const html = '<tr><th>Label</th><td>278</td></tr><tr><th>NationalCadastralReference</th><td>I367_002600.278</td></tr>';
  const response = await handleCadastralWmsRequest(
    new Request(`https://example.test/cadastral-wms?operation=identify&west=8.2&south=44.69&east=8.25&north=44.73&width=1200&height=800&x=617&y=294`),
    { fetchImpl:async () => new Response(html, { status:200, headers:{ 'content-type':'text/html' } }) }
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await response.json(), {
    municipalityCode:'I367', section:null, sheet:'26', attachment:null, development:null,
    parcel:'278', reference:'I367_002600.278'
  });
});

test('parcel identification waits three seconds and cancels stale pointer positions', async () => {
  const { createCadastralDwellIdentifier } = await import('../src/cadastral-identify.js');
  let scheduled = null;
  const cleared = [];
  const states = [];
  const calls = [];
  const controller = createCadastralDwellIdentifier({
    delayMs:3000,
    setTimeoutImpl:(handler, delay) => (scheduled = { handler, delay }),
    clearTimeoutImpl:timer => { cleared.push(timer); if (scheduled === timer) scheduled = null; },
    identify:async point => { calls.push(point); return { sheet:'26', parcel:'278' }; },
    onState:state => states.push(state)
  });

  controller.setEnabled(true);
  controller.pointerMoved({ x:10, y:20 });
  const stale = scheduled;
  controller.pointerMoved({ x:14, y:25 });
  assert.ok(cleared.includes(stale));
  assert.equal(scheduled.delay, 3000);
  await scheduled.handler();
  assert.deepEqual(calls, [{ x:14, y:25 }]);
  assert.deepEqual(states.at(-1), { status:'found', sheet:'26', parcel:'278' });

  controller.pointerMoved({ x:30, y:40 });
  controller.setEnabled(false);
  assert.equal(scheduled, null);
  assert.deepEqual(states.at(-1), { status:'hidden' });
});

test('parcel status renders the waiting, result and zoom states for the user', async () => {
  const { document } = parseHTML('<p id="status" hidden></p>');
  const element = document.querySelector('#status');
  const { renderCadastralParcelStatus } = await import('../src/desktop-ux.js');
  renderCadastralParcelStatus(element, { status:'idle' });
  assert.equal(element.hidden, false);
  assert.equal(element.textContent, 'Fermati su una particella per identificarla.');
  renderCadastralParcelStatus(element, { status:'found', sheet:'26', parcel:'278' });
  assert.equal(element.textContent, 'Foglio 26 · Particella 278');
  renderCadastralParcelStatus(element, { status:'zoom' });
  assert.equal(element.textContent, 'Avvicinati per consultare le particelle.');
  renderCadastralParcelStatus(element, { status:'hidden' });
  assert.equal(element.hidden, true);
});

test('the editor map wires pointer dwell to the cadastral identification endpoint', () => {
  const source = fs.readFileSync(new URL('../src/map.js', import.meta.url), 'utf8');
  assert.match(source, /createCadastralDwellIdentifier/);
  assert.match(source, /buildCadastralIdentifyUrl/);
  assert.match(source, /map\.on\(['"]mousemove['"]/);
  assert.match(source, /onCadastralIdentifyState/);
});

test('the map ships a polite parcel status bar and dark mode highlights only the active base map', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../v52-cadastre.css', import.meta.url), 'utf8');
  const { document } = parseHTML(html);
  const status = document.querySelector('#cadastre-parcel-status');
  assert.ok(status);
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.equal(status.hidden, true);
  assert.match(css, /html\[data-theme=["']dark["']\] \.desktop-map-tools \.map-tools-visual \.segmented\{[^}]*background:\s*#203c2d[^}]*border:\s*1px solid #587360/i);
  assert.match(css, /html\[data-theme=["']dark["']\][^{]*\.segmented button:not\(\.active\)[^{]*\{[^}]*border:\s*1px solid transparent[^}]*background:\s*transparent[^}]*color:\s*#c7d5ca/i);
  assert.match(css, /html\[data-theme=["']dark["']\][^{]*\.segmented button\.active[^{]*\{[^}]*border:\s*1px solid #93d0a1[^}]*background:\s*#78b489[^}]*color:\s*#102419/i);
});
