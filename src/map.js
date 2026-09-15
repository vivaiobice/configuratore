import { buildGeocodeUrl, buildSuggestionUrl, normalizeGeocodeResults, normalizeSuggestionResults, coordinatesFromDrawEvent, GEOLOCATION_OPTIONS, configureDrawForMapLibre, closeManualPolygon, isManualCloseClick } from './map-adapters.js';
import { rowsToFeatureCollection, sideMeasurements, pointInPolygon } from './geometry.js';
import { buildCadastralWmsUrl, buildCadastralWfsUrl, combineCadastralParcels, parseCadastralGml, selectCadastralParcel } from './cadastre.js';
import { installTrackpadRotation } from './map-gestures.js';

const SATELLITE_ID = 'base-satellite';
const STREET_ID = 'base-street';
const ROWS_SOURCE_ID = 'vineyard-rows';
const ROWS_LAYER_ID = 'vineyard-rows-line';
const CADASTRE_SOURCE_ID = 'cadastre-image';
const CADASTRE_LAYER_ID = 'cadastre-image-layer';
const MANUAL_DRAW_SOURCE_ID = 'manual-draw';
const MANUAL_DRAW_FILL_ID = 'manual-draw-fill';
const MANUAL_DRAW_LINE_ID = 'manual-draw-line';
const MANUAL_DRAW_POINTS_ID = 'manual-draw-points';
const PROJECT_GEOMETRY_SOURCE_ID = 'project-geometry';
const PROJECT_GEOMETRY_FILL_ID = 'project-geometry-fill';
const PROJECT_GEOMETRY_LINE_ID = 'project-geometry-line';
const EXCLUSIONS_SOURCE_ID = 'excluded-zones';
const EXCLUSIONS_FILL_ID = 'excluded-zones-fill';
const EXCLUSIONS_LINE_ID = 'excluded-zones-line';

function baseStyle() {
  return {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'Imagery © Esri'
      },
      street: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© OpenStreetMap contributors'
      }
    },
    layers: [
      { id: SATELLITE_ID, type: 'raster', source: 'satellite' },
      { id: STREET_ID, type: 'raster', source: 'street', layout: { visibility: 'none' } }
    ]
  };
}

export function initMap({ container, onGeometryChange = () => {}, onExclusionAdd = () => {}, onCadastralParcel = () => {}, onStatus = () => {}, onReady = () => {}, onDrawingState = () => {} }) {
  if (!globalThis.maplibregl) throw new Error('MapLibre GL non disponibile');

  const map = new globalThis.maplibregl.Map({
    container,
    style: baseStyle(),
    center: [8.225, 44.709],
    zoom: 12.8,
    pitchWithRotate: false,
    dragRotate: false,
    attributionControl: true
  });

  map.addControl(new globalThis.maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
  map.addControl(new globalThis.maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
  map.dragRotate.disable?.();
  map.touchZoomRotate.enable();
  map.touchZoomRotate.disableRotation?.();
  map.touchPitch?.disable?.();
  installTrackpadRotation(map);

  let draw = null;
  let searchMarker = null;
  let gpsMarker = null;
  let sideMeasurementMarkers = [];
  let cadastralVisible = false;
  let selectedCadastralParcels = [];
  let polygonUnionPromise = null;
  let manualDrawing = false;
  let manualMode = 'perimeter';
  let committedGeometry = null;
  let currentExclusions = [];
  let manualVertices = [];
  let manualHover = null;
  let manualCloseMarker = null;

  const emitDrawingState = () => onDrawingState({ active:manualDrawing, mode:manualMode, canClose:manualDrawing && manualVertices.length >= 3, vertexCount:manualVertices.length });

  const setDrawingActive = (active) => {
    manualDrawing = Boolean(active);
    const canvas = map.getCanvas();
    canvas.classList?.toggle('drawing-active', manualDrawing);
    canvas.style.cursor = manualDrawing ? 'url("./assets/pencil-cursor.svg") 2 24, crosshair' : '';
    if (manualDrawing) {
      map.dragPan.disable();
      map.doubleClickZoom?.disable?.();
    } else {
      map.dragPan.enable();
      map.doubleClickZoom?.enable?.();
    }
    emitDrawingState();
  };

  function emptyCollection() { return { type:'FeatureCollection', features:[] }; }

  function projectFeature(coords) {
    return Array.isArray(coords) && coords.length >= 4
      ? { type:'Feature', properties:{}, geometry:{ type:'Polygon', coordinates:[coords] } }
      : null;
  }

  function updateProjectGeometrySource(coords) {
    const source = map.getSource(PROJECT_GEOMETRY_SOURCE_ID);
    if (!source) return;
    const feature = projectFeature(coords);
    source.setData(feature ? { type:'FeatureCollection', features:[feature] } : emptyCollection());
  }

  function manualDraftCollection() {
    const features = [];
    const lineCoords = [...manualVertices];
    if (manualHover && manualVertices.length) lineCoords.push(manualHover);
    if (lineCoords.length >= 2) features.push({ type:'Feature', properties:{ kind:'line' }, geometry:{ type:'LineString', coordinates:lineCoords } });
    if (manualVertices.length >= 3) {
      const ring = closeManualPolygon(manualVertices);
      if (ring) features.push({ type:'Feature', properties:{ kind:'fill' }, geometry:{ type:'Polygon', coordinates:[ring] } });
    }
    manualVertices.forEach((coordinate, index) => features.push({
      type:'Feature',
      properties:{ kind:'point', first:index === 0 ? 1 : 0, index },
      geometry:{ type:'Point', coordinates:coordinate }
    }));
    return { type:'FeatureCollection', features };
  }

  function removeManualCloseMarker() {
    manualCloseMarker?.remove?.();
    manualCloseMarker = null;
  }

  function syncManualCloseMarker() {
    removeManualCloseMarker();
    emitDrawingState();
    if (!manualDrawing || manualVertices.length < 3 || typeof document === 'undefined' || typeof globalThis.maplibregl?.Marker !== 'function') return;
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'manual-close-vertex';
    element.setAttribute('aria-label', 'Chiudi perimetro');
    element.title = 'Chiudi perimetro';
    element.textContent = '✓';
    const close = (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      finishManualPolygon();
    };
    element.addEventListener('pointerdown', (event) => { event.preventDefault?.(); event.stopPropagation?.(); });
    element.addEventListener('click', close);
    manualCloseMarker = new globalThis.maplibregl.Marker({ element, anchor:'center' })
      .setLngLat(manualVertices[0])
      .addTo(map);
  }

  function renderManualDraft() {
    map.getSource(MANUAL_DRAW_SOURCE_ID)?.setData(manualDraftCollection());
    syncManualCloseMarker();
  }

  function cancelManualDrawing() {
    removeManualCloseMarker();
    manualVertices = [];
    manualHover = null;
    setDrawingActive(false);
    map.getSource(MANUAL_DRAW_SOURCE_ID)?.setData(emptyCollection());
  }

  function finishManualPolygon() {
    const ring = closeManualPolygon(manualVertices);
    if (!ring) return false;
    const mode = manualMode;
    if (mode === 'exclusion' && (!committedGeometry || ring.slice(0, -1).some((point) => !pointInPolygon(point, committedGeometry)))) {
      onStatus('La zona da escludere deve rimanere interamente dentro il campo.');
      return false;
    }
    manualVertices = [];
    manualHover = null;
    renderManualDraft();
    setDrawingActive(false);
    if (mode === 'exclusion') {
      onExclusionAdd(ring);
      if (committedGeometry) setGeometry(committedGeometry);
      onStatus('Area esclusa aggiunta. I filari e le quantità vengono ricalcolati.');
      return true;
    }
    setGeometry(ring);
    onGeometryChange(ring);
    onStatus('Perimetro creato. Tocca/clicca il terreno per modificare i vertici.');
    return true;
  }

  if (globalThis.MapboxDraw) {
    configureDrawForMapLibre(globalThis.MapboxDraw);
    draw = new globalThis.MapboxDraw({
      displayControlsDefault: false,
      defaultMode: 'simple_select',
      clickBuffer: 8,
      touchBuffer: 32,
      keybindings: true,
      styles: [
        { id: 'gl-draw-polygon-fill-inactive', type: 'fill', filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon']], paint: { 'fill-color': '#b9d39d', 'fill-opacity': 0.16 } },
        { id: 'gl-draw-polygon-fill-active', type: 'fill', filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']], paint: { 'fill-color': '#d5e5c5', 'fill-opacity': 0.22 } },
        { id: 'gl-draw-polygon-stroke-inactive', type: 'line', filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#eff6ed', 'line-width': 3 } },
        { id: 'gl-draw-polygon-stroke-active', type: 'line', filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-dasharray': [0.2, 2], 'line-width': 3 } },
        { id: 'gl-draw-polygon-and-line-vertex-inactive', type: 'circle', filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']], paint: { 'circle-radius': 7, 'circle-color': '#183f28', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } },
        { id: 'gl-draw-polygon-midpoint', type: 'circle', filter: ['all', ['==', 'meta', 'midpoint'], ['==', '$type', 'Point']], paint: { 'circle-radius': 4, 'circle-color': '#ffffff', 'circle-stroke-color': '#183f28', 'circle-stroke-width': 1.5 } }
      ]
    });
    map.addControl(draw, 'top-left');

    const emitGeometry = (event = null) => {
      const coordinates = coordinatesFromDrawEvent(event, draw.getAll().features);
      if (coordinates) committedGeometry = coordinates;
      updateProjectGeometrySource(committedGeometry);
      updateSideMeasurements(committedGeometry);
      if (coordinates) onGeometryChange(coordinates);
      return coordinates;
    };
    map.on('draw.update', (event) => emitGeometry(event));
    map.on('draw.delete', () => {
      if (committedGeometry) { setGeometry(committedGeometry); onStatus('Il perimetro resta attivo. Usa “Cancella campo” per rimuoverlo completamente.'); }
    });
  }

  map.on('click', (event) => {
    if (!manualDrawing) return;
    const point = event?.point;
    if (isManualCloseClick(manualVertices, point, (coordinate) => map.project(coordinate), 22)) {
      event.originalEvent?.preventDefault?.();
      finishManualPolygon();
      return;
    }
    const lon = Number(event?.lngLat?.lng);
    const lat = Number(event?.lngLat?.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    manualVertices.push([lon, lat]);
    manualHover = null;
    renderManualDraft();
    onStatus(manualVertices.length < 3
      ? `Punto ${manualVertices.length} inserito. Aggiungi almeno ${3 - manualVertices.length} punto/i.`
      : 'Ora chiudi il perimetro cliccando/toccando il primo punto verde.');
  });

  map.on('mousemove', (event) => {
    if (!manualDrawing || !manualVertices.length) return;
    const lon = Number(event?.lngLat?.lng);
    const lat = Number(event?.lngLat?.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    manualHover = [lon, lat];
    renderManualDraft();
  });

  map.getContainer().addEventListener('keydown', (event) => {
    if (!manualDrawing) return;
    if (event.key === 'Escape') { cancelManualDrawing(); onStatus('Disegno annullato.'); }
    if (event.key === 'Enter' && manualVertices.length >= 3) finishManualPolygon();
  });

  map.on('load', () => {
    map.addSource(ROWS_SOURCE_ID, { type: 'geojson', data: rowsToFeatureCollection([]) });
    map.addLayer({
      id: ROWS_LAYER_ID,
      type: 'line',
      source: ROWS_SOURCE_ID,
      paint: { 'line-color': '#f4f0c2', 'line-width': 1.45, 'line-opacity': 0.92 }
    });
    map.addSource(PROJECT_GEOMETRY_SOURCE_ID, { type:'geojson', data:emptyCollection() });
    map.addLayer({ id:PROJECT_GEOMETRY_FILL_ID, type:'fill', source:PROJECT_GEOMETRY_SOURCE_ID, paint:{ 'fill-color':'#b9d39d', 'fill-opacity':0.12 } });
    map.addLayer({ id:PROJECT_GEOMETRY_LINE_ID, type:'line', source:PROJECT_GEOMETRY_SOURCE_ID, layout:{'line-cap':'round','line-join':'round'}, paint:{ 'line-color':'#1d6b45', 'line-width':4 } });
    map.addSource(EXCLUSIONS_SOURCE_ID, { type:'geojson', data:emptyCollection() });
    map.addLayer({ id:EXCLUSIONS_FILL_ID, type:'fill', source:EXCLUSIONS_SOURCE_ID, paint:{ 'fill-color':'#8a3f32', 'fill-opacity':0.22 } });
    map.addLayer({ id:EXCLUSIONS_LINE_ID, type:'line', source:EXCLUSIONS_SOURCE_ID, paint:{ 'line-color':'#fff1e7', 'line-width':2.5, 'line-dasharray':[1.5,1] } });
    map.addSource(MANUAL_DRAW_SOURCE_ID, { type:'geojson', data:emptyCollection() });
    map.addLayer({ id:MANUAL_DRAW_FILL_ID, type:'fill', source:MANUAL_DRAW_SOURCE_ID, filter:['==', ['get','kind'], 'fill'], paint:{ 'fill-color':'#d5e5c5', 'fill-opacity':0.22 } });
    map.addLayer({ id:MANUAL_DRAW_LINE_ID, type:'line', source:MANUAL_DRAW_SOURCE_ID, filter:['==', ['get','kind'], 'line'], layout:{ 'line-cap':'round', 'line-join':'round' }, paint:{ 'line-color':'#ffffff', 'line-width':3, 'line-dasharray':[1,1] } });
    map.addLayer({ id:MANUAL_DRAW_POINTS_ID, type:'circle', source:MANUAL_DRAW_SOURCE_ID, filter:['==', ['get','kind'], 'point'], paint:{ 'circle-radius':['case',['==',['get','first'],1],9,6], 'circle-color':['case',['==',['get','first'],1],'#4fa76c','#183f28'], 'circle-stroke-color':'#ffffff', 'circle-stroke-width':2 } });
    if (cadastralVisible) refreshCadastre();
    onReady();
  });


  function updateSideMeasurements(coords) {
    const measurements = sideMeasurements(coords);
    for (const marker of sideMeasurementMarkers) marker.remove();
    sideMeasurementMarkers = [];
    if (typeof document === 'undefined') return;

    for (const side of measurements) {
      const element = document.createElement('div');
      element.className = 'side-measurement-label';
      element.textContent = `${Math.round(side.lengthM).toLocaleString('it-IT')} m`;
      const marker = new globalThis.maplibregl.Marker({ element, anchor:'center' })
        .setLngLat(side.midpoint)
        .addTo(map);
      sideMeasurementMarkers.push(marker);
    }
  }

  function exclusionFeatureCollection(exclusions = currentExclusions) {
    return { type:'FeatureCollection', features:(exclusions ?? []).map((item, index) => {
      const geometry = Array.isArray(item) ? item : item?.geometry;
      if (!Array.isArray(geometry) || geometry.length < 4) return null;
      return { type:'Feature', id:item?.id ?? index, properties:{ label:item?.label ?? `Area esclusa ${index + 1}` }, geometry:{ type:'Polygon', coordinates:[geometry] } };
    }).filter(Boolean) };
  }

  function setExclusions(exclusions = []) {
    currentExclusions = Array.isArray(exclusions) ? exclusions : [];
    map.getSource(EXCLUSIONS_SOURCE_ID)?.setData(exclusionFeatureCollection());
  }

  function ensureCommittedVisuals() {
    if (!committedGeometry) return;
    updateProjectGeometrySource(committedGeometry);
    updateSideMeasurements(committedGeometry);
    if (map.getLayer(PROJECT_GEOMETRY_LINE_ID)) {
      try { map.setLayoutProperty(PROJECT_GEOMETRY_LINE_ID, 'visibility', 'visible'); } catch {}
      try { map.moveLayer?.(PROJECT_GEOMETRY_LINE_ID); } catch {}
    }
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
    if (!Array.isArray(coords) || coords.length < 4) return false;
    committedGeometry = coords;
    const apply = () => {
      updateProjectGeometrySource(coords);
      if (draw) {
        try { draw.deleteAll({ silent:true }); } catch { draw.deleteAll(); }
        const ids = draw.add({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [coords] }
        });
        const id = ids?.[0];
        if (id) draw.changeMode('simple_select', { featureIds: [id] });
      }
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
    manualMode = 'perimeter';
    selectedCadastralParcels = [];
    if (draw) { try { draw.deleteAll({ silent:true }); } catch { draw.deleteAll(); } }
    committedGeometry = null;
    updateProjectGeometrySource(null);
    updateSideMeasurements(null);
    manualVertices = [];
    manualHover = null;
    renderManualDraft();
    setDrawingActive(true);
    map.getCanvas()?.focus?.();
    onStatus('Disegna il confine: inserisci almeno 3 punti, poi clicca/tocca il primo punto verde per chiudere.');
  }

  function beginExclusionDraw() {
    if (!committedGeometry) { onStatus('Disegna prima il perimetro del campo.'); return false; }
    manualMode = 'exclusion';
    if (draw) { try { draw.deleteAll({ silent:true }); } catch { draw.deleteAll(); } }
    manualVertices = []; manualHover = null; renderManualDraft(); setDrawingActive(true);
    onStatus('Disegna la zona da escludere: inserisci almeno 3 punti e poi chiudila sul primo punto verde o con “Chiudi esclusione”.');
    return true;
  }

  function clearGeometry() {
    committedGeometry = null;
    selectedCadastralParcels = [];
    cancelManualDrawing();
    if (draw) { try { draw.deleteAll({ silent:true }); } catch { draw.deleteAll(); } }
    updateProjectGeometrySource(null);
    updateSideMeasurements(null);
    setRows([]);
    setExclusions([]);
    onStatus('Campo cancellato. Puoi disegnare un nuovo perimetro.');
  }

  function beginVertexRemoval() {
    if (!committedGeometry || committedGeometry.length <= 4) {
      onStatus(committedGeometry ? 'Il perimetro deve mantenere almeno 3 vertici.' : 'Disegna prima il perimetro del campo.');
      return false;
    }
    onStatus('Clicca/tocca il vertice del perimetro che vuoi eliminare.');
    map.getCanvas().style.cursor = 'crosshair';
    map.once('click', (event) => {
      map.getCanvas().style.cursor = '';
      const point = event?.point;
      if (!point) return;
      const vertices = committedGeometry.slice(0, -1);
      let bestIndex = -1;
      let bestDistance = Infinity;
      vertices.forEach((coordinate, index) => {
        const projected = map.project(coordinate);
        const distance = Math.hypot(Number(projected.x) - Number(point.x), Number(projected.y) - Number(point.y));
        if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
      });
      if (bestIndex < 0 || bestDistance > 32) {
        onStatus('Nessun vertice abbastanza vicino. Premi di nuovo “− Punto” e tocca direttamente il punto da eliminare.');
        return;
      }
      const remaining = vertices.filter((_, index) => index !== bestIndex);
      if (remaining.length < 3) { onStatus('Il perimetro deve mantenere almeno 3 vertici.'); return; }
      const next = [...remaining, remaining[0]];
      setGeometry(next);
      onGeometryChange(next);
      onStatus('Vertice eliminato. Perimetro e quote aggiornati.');
    });
    return true;
  }

  function removeSelectedVertex() {
    if (!draw || !committedGeometry) return false;
    const selected = draw.getSelectedPoints?.()?.features ?? [];
    if (!selected.length) { onStatus('Seleziona prima un vertice del perimetro, poi premi “− Punto”.'); return false; }
    const uniqueVertices = Math.max(0, committedGeometry.length - 1);
    if (uniqueVertices <= 3) { onStatus('Il perimetro deve mantenere almeno 3 vertici.'); return false; }
    draw.trash();
    const coordinates = coordinatesFromDrawEvent(null, draw.getAll().features);
    if (coordinates?.length >= 4) { committedGeometry = coordinates; updateProjectGeometrySource(coordinates); updateSideMeasurements(coordinates); onGeometryChange(coordinates); return true; }
    setGeometry(committedGeometry);
    return false;
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

  async function suggest(query) {
    const normalized = String(query ?? '').trim();
    if (normalized.length < 3) return [];
    const response = await fetch(buildSuggestionUrl(normalized), { headers:{ Accept:'application/json' } });
    if (!response.ok) return [];
    return normalizeSuggestionResults(await response.json());
  }

  function rotateBy(deltaDeg) {
    const next = map.getBearing() + Number(deltaDeg || 0);
    map.easeTo({ bearing: next, duration: 180, essential: true });
  }

  function resetNorth() {
    map.easeTo({ bearing: 0, duration: 180, essential: true });
  }

  map.on('moveend', () => { refreshCadastre(); ensureCommittedVisuals(); });
  map.on('resize', () => { refreshCadastre(); ensureCommittedVisuals(); });
  map.on('styledata', ensureCommittedVisuals);
  map.on('idle', ensureCommittedVisuals);

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

  return { map, draw, beginDraw, beginExclusionDraw, finishDraw:finishManualPolygon, clearGeometry, beginVertexRemoval, removeSelectedVertex, beginCadastralSelect, setGeometry, setExclusions, setBaseMap, setRows, search, suggest, locate, rotateBy, resetNorth, setCadastralVisible };
}
