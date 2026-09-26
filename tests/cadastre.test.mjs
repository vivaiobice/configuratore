import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCadastralWmsUrl } from '../src/cadastre.js';

test('buildCadastralWmsUrl requests official parcel layer in a CRS supported by the service', () => {
  const url = new URL(buildCadastralWmsUrl({
    west: 8.20,
    south: 44.69,
    east: 8.25,
    north: 44.73,
    width: 1200,
    height: 800
  }));
  assert.equal(url.hostname, 'wms.cartografia.agenziaentrate.gov.it');
  assert.equal(url.searchParams.get('SERVICE'), 'WMS');
  assert.equal(url.searchParams.get('VERSION'), '1.1.1');
  assert.equal(url.searchParams.get('LAYERS'), 'CP.CadastralParcel');
  assert.equal(url.searchParams.get('SRS'), 'EPSG:4258');
  assert.equal(url.searchParams.get('BBOX'), '8.2,44.69,8.25,44.73');
  assert.equal(url.searchParams.get('TRANSPARENT'), 'TRUE');
  assert.equal(url.searchParams.get('FORMAT'), 'image/png');
});

test('buildCadastralWmsUrl clamps image dimensions to service limit', () => {
  const url = new URL(buildCadastralWmsUrl({ west: 8, south: 44, east: 9, north: 45, width: 9000, height: 5000 }));
  assert.equal(url.searchParams.get('WIDTH'), '2048');
  assert.equal(url.searchParams.get('HEIGHT'), '2048');
});

test('cadastralOverlayPolicy renders only an active overlay at the supported zoom', async () => {
  const module = await import('../src/cadastre.js');
  assert.equal(typeof module.CADASTRAL_MIN_ZOOM, 'number');
  assert.equal(typeof module.cadastralOverlayPolicy, 'function');
  const { CADASTRAL_MIN_ZOOM, cadastralOverlayPolicy } = module;
  assert.deepEqual(cadastralOverlayPolicy({ visible:false, zoom:CADASTRAL_MIN_ZOOM }), {
    visible:false, renderable:false, reason:'off'
  });
  assert.deepEqual(cadastralOverlayPolicy({ visible:true, zoom:CADASTRAL_MIN_ZOOM - 0.1 }), {
    visible:true, renderable:false, reason:'zoom'
  });
  assert.deepEqual(cadastralOverlayPolicy({ visible:true, zoom:Number.NaN }), {
    visible:true, renderable:false, reason:'zoom'
  });
  assert.deepEqual(cadastralOverlayPolicy({ visible:true, zoom:CADASTRAL_MIN_ZOOM }), {
    visible:true, renderable:true, reason:'ready'
  });
});

test('buildCadastralWfsUrl requests parcel features around a small bbox', async () => {
  const { buildCadastralWfsUrl } = await import('../src/cadastre.js');
  const url = new URL(buildCadastralWfsUrl({ west: 8.223, south: 44.707, east: 8.224, north: 44.708, count: 8 }));
  assert.equal(url.hostname, 'wfs.cartografia.agenziaentrate.gov.it');
  assert.equal(url.searchParams.get('SERVICE'), 'WFS');
  assert.equal(url.searchParams.get('VERSION'), '2.0.0');
  assert.equal(url.searchParams.get('REQUEST'), 'GetFeature');
  assert.equal(url.searchParams.get('TYPENAMES'), 'CP:CadastralParcel');
  assert.equal(url.searchParams.get('SRSNAME'), 'urn:ogc:def:crs:EPSG::6706');
  assert.equal(url.searchParams.get('COUNT'), '8');
  assert.equal(url.searchParams.get('BBOX'), '44.707,8.223,44.708,8.224');
  assert.equal(url.searchParams.get('OUTPUTFORMAT'), null);
});

test('normalizeCadastralFeature returns a closed editable polygon and cadastral metadata', async () => {
  const { normalizeCadastralFeature } = await import('../src/cadastre.js');
  const feature = normalizeCadastralFeature({
    id: 'CP.123',
    type: 'Feature',
    properties: { nationalCadastralReference: 'CN_SSB_F12_345', label: '345' },
    geometry: { type: 'Polygon', coordinates: [[[8,44],[8.01,44],[8.01,44.01],[8,44.01]]] }
  });
  assert.equal(feature.id, 'CP.123');
  assert.equal(feature.reference, 'CN_SSB_F12_345');
  assert.deepEqual(feature.coordinates[0], feature.coordinates.at(-1));
  assert.equal(feature.coordinates.length, 5);
});


test('parseCadastralGml converts EPSG:6706 axis order to MapLibre lon-lat coordinates', async () => {
  const { parseCadastralGml } = await import('../src/cadastre.js');
  const xml = `<?xml version="1.0"?><wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:CP="http://mapserver.gis.umn.edu/mapserver" xmlns:gml="http://www.opengis.net/gml/3.2"><wfs:member><CP:CadastralParcel gml:id="CP.123"><CP:nationalCadastralReference>CN_F12_345</CP:nationalCadastralReference><CP:geometry><gml:Polygon srsName="urn:ogc:def:crs:EPSG::6706"><gml:exterior><gml:LinearRing><gml:posList>44.700000 8.200000 44.700000 8.210000 44.710000 8.210000 44.710000 8.200000 44.700000 8.200000</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></CP:geometry></CP:CadastralParcel></wfs:member></wfs:FeatureCollection>`;
  const [parcel] = parseCadastralGml(xml);
  assert.equal(parcel.id, 'CP.123');
  assert.equal(parcel.reference, 'CN_F12_345');
  assert.deepEqual(parcel.coordinates[0], [8.2, 44.7]);
  assert.deepEqual(parcel.coordinates.at(-1), [8.2, 44.7]);
});

test('selectCadastralParcel prefers the parcel containing the clicked point', async () => {
  const { selectCadastralParcel } = await import('../src/cadastre.js');
  const parcels = [
    { id:'a', coordinates:[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]] },
    { id:'b', coordinates:[[8.02,44],[8.03,44],[8.03,44.01],[8.02,44.01],[8.02,44]] }
  ];
  assert.equal(selectCadastralParcel(parcels, [8.025,44.005]).id, 'b');
  assert.equal(selectCadastralParcel(parcels, [9,45]), null);
});

test('combineCadastralParcels merges contiguous parcel polygons into one editable perimeter', async () => {
  const { combineCadastralParcels } = await import('../src/cadastre.js');
  const parcels = [
    { id:'A', coordinates:[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]] },
    { id:'B', coordinates:[[8.01,44],[8.02,44],[8.02,44.01],[8.01,44.01],[8.01,44]] }
  ];
  const unionFn = (...geometries) => {
    assert.equal(geometries.length, 2);
    return [[[[8,44],[8.02,44],[8.02,44.01],[8,44.01],[8,44]]]];
  };
  const result = await combineCadastralParcels(parcels, unionFn);
  assert.deepEqual(result.coordinates, [[8,44],[8.02,44],[8.02,44.01],[8,44.01],[8,44]]);
  assert.deepEqual(result.refs, [{id:'A',reference:null},{id:'B',reference:null}]);
});

test('combineCadastralParcels rejects disjoint or holed results unsupported by the V1 row engine', async () => {
  const { combineCadastralParcels } = await import('../src/cadastre.js');
  const parcels = [{ id:'A', coordinates:[[8,44],[8.01,44],[8,44.01],[8,44]] }, { id:'B', coordinates:[[9,45],[9.01,45],[9,45.01],[9,45]] }];
  await assert.rejects(() => combineCadastralParcels(parcels, () => [
    [[[8,44],[8.01,44],[8,44.01],[8,44]]],
    [[[9,45],[9.01,45],[9,45.01],[9,45]]]
  ]), /contiguous/i);
});
