import { buildGeocodeUrl, normalizeGeocodeResults, GEOLOCATION_OPTIONS, configureDrawForMapLibre } from './map-adapters.js';
import { rowsToFeatureCollection, sideMeasurements, sideMeasurementsToFeatureCollection } from './geometry.js';
import { buildCadastralWmsUrl, buildCadastralWfsUrl, combineCadastralParcels, parseCadastralGml, selectCadastralParcel } from './cadastre.js';

const SATELLITE_ID = 'base-satellite';
const STREET_ID = 'base-street';
const ROWS_SOURCE_ID = 'vineyard-rows';
const ROWS_LAYER_ID = 'vineyard-rows-line';
const SIDE_MEASUREMENTS_SOURCE_ID = 'side-measurements';
const SIDE_MEASUREMENTS_LAYER_ID = 'side-measurements-labels';
const CADASTRE_SOURCE_ID = 'cadastre-image';
const CADASTRE_LAYER_ID = 'cadastre-image-layer';

function baseStyle() {
  return {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: 'Imagery © Esri'
      },
      street: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors'
      }
    },
    layers: [
      { id: SATELLITE_ID, type: 'raster', source: 'satellite' },
      { id: STREET_ID, type: 'raster', source: 'street', layout: { visibility: 'none' } }
    ]
  };
}

export function initMap({ container, onGeometryChange = () => {}, onCadastralParcel = () => {}, onStatus = () => {}, onReady = () => {} }) {
  if (!globalThis.maplibregl) throw new Error('MapLibre GL non disponibile');

  const map = new globalThis.maplibregl.Map({
    container,
    style: baseStyle(),
    center: [8.225, 44.709],
    zoom: 12.8,
    pitchWithRotate: false,
    attributionControl: true
  });

  map.addControl(new globalThis.maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
  map.addControl(new globalThis.maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');

  let draw = null;
  let searchMarker = null;
  let gpsMarker = null;
  let cadastralVisible = false;
  let selectedCadastralParcels = [];
  let polygonUnionPromise = null;

  if (globalThis.MapboxDraw) {
    configureDrawForMapLibre(globalThis.MapboxDraw);
    draw = new globalThis.MapboxDraw({
      displayControlsDefault: false,
      defaultMode: 'simple_select',
      styles: [
        { id: 'gl-draw-polygon-fill-inactive', type: 'fill', filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon']], paint: { 'fill-color': '#b9d39d', 'fill-opacity': 0.24 } },
        { id: 'gl-draw-polygon-fill-active', type: 'fill', filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']], paint: { 'fill-color': '#d5e5c5', 'fill-opacity': 0.3 } },
        { id: 'gl-draw-polygon-stroke-inactive', type: 'line', filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#eff6ed', 'line-width': 3 } },
        { id: 'gl-draw-polygon-stroke-active', type: 'line', filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-dasharray': [0.2, 2], 'line-width': 3 } },
        { id: 'gl-draw-polygon-and-line-vertex-inactive', type: 'circle', filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']], paint: { 'circle-radius': 5, 'circle-color': '#183f28', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } },
        { id: 'gl-draw-polygon-midpoint', type: 'circle', filter: ['all', ['==', 'meta', 'midpoint'], ['==', '$type', 'Point']], paint: { 'circle-radius': 4, 'circle-color': '#ffffff', 'circle-stroke-color': '#183f28', 'circle-stroke-width': 1.5 } }
      ]
    });
    map.addControl(draw, 'top-left');

    const emitGeometry = () => {
      const feature = draw.getAll().features.find((item) => item.geometry?.type === 'Polygon');
      const coordinates = feature?.geometry?.coordinates?.[0] ?? null;
      updateSideMeasurements(coordinates);
      onGeometryChange(coordinates);
    };
    map.on('draw.create', (event) => {
      const created = event.features?.[0];
      for (const feature of draw.getAll().features) {
        if (created?.id && feature.id !== created.id) draw.delete(feature.id);
      }
      if (created?.id) draw.changeMode('simple_select', { featureIds: [created.id] });
      emitGeometry();
      onStatus('Perimetro creato. Tocca/clicca il terreno per modificare i vertici.');
    });
    map.on('draw.update', emitGeometry);
    map.on('draw.delete', emitGeometry);
  }

  map.on('load', () => {
    map.addSource(ROWS_SOURCE_ID, { type: 'geojson', data: rowsToFeatureCollection([]) });
    map.addLayer({
      id: ROWS_LAYER_ID,
      type: 'line',
      source: ROWS_SOURCE_ID,
      paint: { 'line-color': '#f4f0c2', 'line-width': 1.45, 'line-opacity': 0.92 }
    });
    map.addSource(SIDE_MEASUREMENTS_SOURCE_ID, { type:'geojson', data:sideMeasurementsToFeatureCollection([]) });
    map.addLayer({
      id: SIDE_MEASUREMENTS_LAYER_ID,
      type: 'symbol',
      source: SIDE_MEASUREMENTS_SOURCE_ID,
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-allow-overlap': false,
        'text-ignore-placement': false
      },
      paint: {
        'text-color': '#183f28',
        'text-halo-color': 'rgba(255,255,255,0.94)',
        'text-halo-width': 2
      }
    });
    if (cadastralVisible) refreshCadastre();
    onReady();
  });


  function updateSideMeasurements(coords) {
    const source = map.getSource(SIDE_MEASUREMENTS_SOURCE_ID);
    source?.setData(sideMeasurementsToFeatureCollection(sideMeasurements(coords)));
  }

  function cadastralRequest() {
    const bounds = map.getBounds();
    const canvas = map.getCanvas();
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const west = bounds.getWest();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const north = bounds.getNorth();
    return {
      url: buildCadastralWmsUrl({
        west, south, east, north,
        width: canvas.clientWidth * dpr,
        height: canvas.clientHeight * dpr
      }),
      coordinates: [[west, north], [east, north], [east, south], [west, south]]
    };
  }

  function refreshCadastre() {
    if (!cadastralVisible || !map.loaded()) return;
    const request = cadastralRequest();
    const source = map.getSource(CADASTRE_SOURCE_ID);
    if (source?.updateImage) {
      source.updateImage(request);
      return;
    }
    if (!source) {
      map.addSource(CADASTRE_SOURCE_ID, { type: 'image', ...request });
      map.addLayer({
        id: CADASTRE_LAYER_ID,
        type: 'raster',
        source: CADASTRE_SOURCE_ID,
        paint: { 'raster-opacity': 0.82, 'raster-fade-duration': 0 }
      }, map.getLayer(ROWS_LAYER_ID) ? ROWS_LAYER_ID : undefined);
    }
  }

  async function polygonUnion() {
    if (!polygonUnionPromise) {
      polygonUnionPromise = import('https://cdn.jsdelivr.net/npm/polygon-clipping@0.15.7/+esm').then((module) => {
        const fn = module.union ?? module.default?.union ?? module.default;
        if (typeof fn !== 'function') throw new Error('Modulo unione particelle non disponibile');
        return fn;
      });
    }
    return polygonUnionPromise;
  }

  function beginCadastralSelect() {
    if (!cadastralVisible) {
      onStatus('Attiva prima il layer Catasto.');
      return;
    }
    onStatus('Tocca/clicca una particella catastale sulla mappa.');
    map.getCanvas().style.cursor = 'crosshair';
    map.once('click', async (event) => {
      map.getCanvas().style.cursor = '';
      const lon = event.lngLat.lng;
      const lat = event.lngLat.lat;
      const delta = 0.00002;
      const url = buildCadastralWfsUrl({ west:lon-delta, south:lat-delta, east:lon+delta, north:lat+delta, count:12 });
      try {
        onStatus('Ricerca della particella catastale…');
        const response = await fetch(url, { headers:{ Accept:'application/gml+xml, application/xml, text/xml' } });
        if (!response.ok) throw new Error(`WFS ${response.status}`);
        const parcels = parseCadastralGml(await response.text());
        const parcel = selectCadastralParcel(parcels, [lon, lat]);
        if (!parcel) {
          onStatus('Nessuna particella selezionabile in quel punto. Puoi riprovare o disegnare manualmente.');
          return;
        }
        const alreadySelected = selectedCadastralParcels.some((item) => item.id && parcel.id && item.id === parcel.id);
        const candidates = alreadySelected ? selectedCadastralParcels : [...selectedCadastralParcels, parcel];
        let selection;
        try {
          const unionFn = candidates.length > 1 ? await polygonUnion() : null;
          selection = await combineCadastralParcels(candidates, unionFn);
        } catch (mergeError) {
          console.error(mergeError);
          onStatus('Le particelle selezionate non formano un unico perimetro semplice. Mantengo la selezione precedente.');
          return;
        }
        selectedCadastralParcels = candidates;
        setGeometry(selection.coordinates);
        onGeometryChange(selection.coordinates);
        onCadastralParcel(parcel, selection);
        const countLabel = selectedCadastralParcels.length > 1 ? `${selectedCadastralParcels.length} particelle unite` : 'Particella catastale selezionata';
        onStatus(`${countLabel}${parcel.reference ? ` · ${parcel.reference}` : ''}. Puoi aggiungere una particella confinante o modificare i vertici.`);
      } catch (error) {
        console.error(error);
        onStatus('Selezione catastale momentaneamente non disponibile. Il disegno manuale resta utilizzabile.');
      }
    });
  }

  function setCadastralVisible(visible) {
    cadastralVisible = Boolean(visible);
    if (!cadastralVisible) {
      if (map.getLayer(CADASTRE_LAYER_ID)) map.setLayoutProperty(CADASTRE_LAYER_ID, 'visibility', 'none');
      onStatus('Catasto disattivato.');
      return;
    }
    if (map.getLayer(CADASTRE_LAYER_ID)) map.setLayoutProperty(CADASTRE_LAYER_ID, 'visibility', 'visible');
    refreshCadastre();
    onStatus('Catasto attivo. Le linee catastali sono informative e non sostituiscono una visura.');
  }

  function setGeometry(coords) {
    if (!draw || !Array.isArray(coords) || coords.length < 4) return false;
    const apply = () => {
      draw.deleteAll();
      const ids = draw.add({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [coords] }
      });
      const id = ids?.[0];
      if (id) draw.changeMode('simple_select', { featureIds: [id] });
      updateSideMeasurements(coords);
      const bounds = coords.reduce((box, [lon, lat]) => box.extend([lon, lat]), new globalThis.maplibregl.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(bounds, { padding: 55, maxZoom: 18, duration: 0 });
      return true;
    };
    if (map.loaded()) return apply();
    map.once('load', apply);
    return true;
  }

  function beginDraw() {
    selectedCadastralParcels = [];
    if (!draw) {
      onStatus('Strumento di disegno non disponibile. Ricarica la pagina con una connessione attiva.');
      return;
    }
    draw.deleteAll();
    updateSideMeasurements(null);
    draw.changeMode('draw_polygon');
    onStatus('Disegna il confine del terreno. Chiudi il poligono cliccando il primo punto.');
  }

  function setBaseMap(kind) {
    if (!map.getLayer(SATELLITE_ID) || !map.getLayer(STREET_ID)) return;
    const satellite = kind !== 'street';
    map.setLayoutProperty(SATELLITE_ID, 'visibility', satellite ? 'visible' : 'none');
    map.setLayoutProperty(STREET_ID, 'visibility', satellite ? 'none' : 'visible');
  }

  function setRows(rows) {
    const source = map.getSource(ROWS_SOURCE_ID);
    source?.setData(rowsToFeatureCollection(rows));
  }

  async function search(query) {
    const normalized = String(query ?? '').trim();
    if (!normalized) return null;
    onStatus('Ricerca della zona…');
    const response = await fetch(buildGeocodeUrl(normalized), { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Ricerca non disponibile (${response.status})`);
    const [result] = normalizeGeocodeResults(await response.json());
    if (!result) {
      onStatus('Località non trovata. Prova con Comune + provincia o un indirizzo più completo.');
      return null;
    }
    map.flyTo({ center: [result.lon, result.lat], zoom: 16.5, essential: true });
    searchMarker?.remove();
    searchMarker = new globalThis.maplibregl.Marker({ color: '#183f28' })
      .setLngLat([result.lon, result.lat])
      .setPopup(new globalThis.maplibregl.Popup({ offset: 22 }).setText(result.label))
      .addTo(map);
    onStatus('Zona trovata. Ora puoi disegnare il terreno.');
    return result;
  }

  map.on('moveend', refreshCadastre);
  map.on('resize', refreshCadastre);

  function locate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const error = new Error('Geolocalizzazione non supportata dal dispositivo');
        onStatus(error.message);
        reject(error);
        return;
      }
      onStatus('Richiesta della posizione attuale…');
      navigator.geolocation.getCurrentPosition((position) => {
        const { longitude, latitude, accuracy } = position.coords;
        map.flyTo({ center: [longitude, latitude], zoom: 17, essential: true });
        gpsMarker?.remove();
        gpsMarker = new globalThis.maplibregl.Marker({ color: '#1d6b45' }).setLngLat([longitude, latitude]).addTo(map);
        onStatus(`Posizione trovata${Number.isFinite(accuracy) ? ` (precisione ~${Math.round(accuracy)} m)` : ''}.`);
        resolve({ longitude, latitude, accuracy });
      }, (error) => {
        const message = error.code === 1
          ? 'Permesso posizione negato. Puoi continuare usando la ricerca o la mappa.'
          : 'Posizione non disponibile. Puoi continuare usando la ricerca o la mappa.';
        onStatus(message);
        reject(error);
      }, GEOLOCATION_OPTIONS);
    });
  }

  return { map, draw, beginDraw, beginCadastralSelect, setGeometry, setBaseMap, setRows, search, locate, setCadastralVisible };
}
