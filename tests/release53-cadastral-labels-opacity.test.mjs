import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseHTML } from 'linkedom';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../v52-cadastre.css', import.meta.url), 'utf8');

class FakeMap {
  constructor(zoom = 16) {
    this.zoom = zoom;
    this.sources = new Map();
    this.layers = new Map();
    this.events = new Map();
  }
  loaded() { return true; }
  getZoom() { return this.zoom; }
  getSource(id) { return this.sources.get(id); }
  getLayer(id) { return this.layers.get(id); }
  addSource(id, definition) {
    const source = { ...definition, updateImage:update => { source.lastUpdate = update; } };
    this.sources.set(id, source);
  }
  addLayer(layer) { this.layers.set(layer.id, structuredClone(layer)); }
  setLayoutProperty(id, name, value) { this.layers.get(id).layout[name] = value; }
  setPaintProperty(id, name, value) { this.layers.get(id).paint[name] = value; }
  on(name, handler) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name).add(handler); }
  off(name, handler) { this.events.get(name)?.delete(handler); }
}

test('official cadastral image keeps sheet fill out of the parcel-number view', async () => {
  const { buildOfficialCadastralUrl } = await import('../supabase/functions/_shared/cadastral-wms.js');
  const common = { west:8.1, south:44.5, east:8.2, north:44.6, width:900, height:700 };
  const sheets = new URL(buildOfficialCadastralUrl({ ...common, mode:'sheets' }));
  const parcels = new URL(buildOfficialCadastralUrl({ ...common, mode:'parcels' }));
  assert.equal(sheets.searchParams.get('LAYERS'), 'CP.CadastralZoning');
  assert.equal(parcels.searchParams.get('LAYERS'), 'CP.CadastralParcel,codice_plla');
});

test('catasto is available at sheet-overview zoom and still waits when too far away', async () => {
  const { cadastralOverlayPolicy, cadastralLayerMode } = await import('../src/cadastre.js');
  assert.deepEqual(cadastralOverlayPolicy({ visible:true, zoom:12.9 }), { visible:true, renderable:false, reason:'zoom' });
  assert.deepEqual(cadastralOverlayPolicy({ visible:true, zoom:13 }), { visible:true, renderable:true, reason:'ready' });
  assert.equal(cadastralLayerMode(14), 'sheets');
  assert.equal(cadastralLayerMode(17, 45), 'sheets', 'a scale wider than 30 m the map must show sheets');
  assert.equal(cadastralLayerMode(18, 45), 'parcels', 'at 30 m or closer the map must show parcels');
});

test('cadastral overlay starts at sixty percent and updates opacity without reloading imagery', async () => {
  const { createCadastralOverlay } = await import('../src/cadastral-overlay.js');
  const map = new FakeMap();
  const controller = createCadastralOverlay({
    map,
    requestForViewport:() => ({ url:'https://example.test/cadastre.png', coordinates:[[8,45],[9,45],[9,44],[8,44]] })
  });
  controller.setVisible(true);
  assert.equal(map.getLayer('cadastre-image-layer').paint['raster-opacity'], 0.6);
  const source = map.getSource('cadastre-image');
  controller.setOpacity(0.4);
  assert.equal(map.getLayer('cadastre-image-layer').paint['raster-opacity'], 0.4);
  assert.equal(map.getSource('cadastre-image'), source, 'opacity must not reload the WMS image');
  controller.setOpacity(0);
  assert.equal(map.getLayer('cadastre-image-layer').paint['raster-opacity'], 0.1);
});

test('Catasto toggle reveals a session-only opacity slider and forwards live values', async () => {
  const { document } = parseHTML(`
    <button id="cadastre-button" aria-pressed="false">Catasto</button>
    <label id="cadastre-opacity-control" hidden>Visibilità catasto
      <input id="cadastre-opacity" type="range" min="10" max="100" step="10" value="60">
      <output id="cadastre-opacity-output">60%</output>
    </label>
    <p id="cadastre-attribution" hidden></p><p id="cadastre-notice" hidden></p>
  `);
  const { createCadastreToggle } = await import('../src/desktop-ux.js');
  let active = false;
  const opacities = [];
  const controller = createCadastreToggle({
    document,
    isActive:() => active,
    setActive:value => { active = value; },
    setOpacity:value => opacities.push(value)
  });
  controller.mount();
  document.querySelector('#cadastre-button').click();
  assert.equal(document.querySelector('#cadastre-opacity-control').hidden, false);
  const slider = document.querySelector('#cadastre-opacity');
  slider.value = '40';
  slider.dispatchEvent(new document.defaultView.Event('input', { bubbles:true }));
  assert.equal(opacities.at(-1), 0.4);
  assert.equal(document.querySelector('#cadastre-opacity-output').textContent, '40%');
  document.querySelector('#cadastre-button').click();
  assert.equal(document.querySelector('#cadastre-opacity-control').hidden, true);
});

test('release UI ships the accessible opacity control and unmistakable active button colors', () => {
  const { document } = parseHTML(html);
  const slider = document.querySelector('#cadastre-opacity');
  assert.ok(slider);
  assert.equal(slider.getAttribute('min'), '10');
  assert.equal(slider.getAttribute('max'), '100');
  assert.equal(slider.getAttribute('value'), '60');
  assert.match(css, /#cadastre-button\[aria-pressed=["']true["']\][^{]*\{[^}]*background:[^;}]+!important[^}]*color:[^;}]+!important/s);
  assert.match(css, /html\[data-theme=["']dark["']\][^{]*#cadastre-button\[aria-pressed=["']true["']\]/s);
});

test('desktop cadastral controls start at the map corner and put opacity on their second row', () => {
  assert.match(css, /\.desktop-map-tools \.map-tools-visual\s*\{[^}]*left:\s*18px[^}]*display:\s*grid/s);
  assert.match(css, /\.desktop-map-tools \.map-tools-visual \.cadastre-opacity-control\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
});
