import { buildGeocodeUrl, buildSuggestionUrl, buildSuggestionPlaceUrl, normalizeGeocodeResults, normalizeSuggestionResults, normalizeSuggestionPlaces, coordinatesFromDrawEvent, GEOLOCATION_OPTIONS, configureDrawForMapLibre, closeManualPolygon, isManualCloseClick, removeClosedRingVertex } from './map-adapters.js?v=46';
import { rowsToFeatureCollection, sideMeasurements, pointInPolygon, interiorLabelPoint, corridorPolygonFromLine, normalizeIntersectionRings } from './geometry.js?v=45';
import { buildCadastralWmsUrl } from './cadastre.js?v=52';
import { createCadastralOverlay } from './cadastral-overlay.js?v=52';
import { installTrackpadRotation } from './map-gestures.js?v=49';
import { curvePointToLonLat,lonLatToCurvePoint,normalizeRowCurvePoints } from './row-curves.js?v=45';
import {satelliteSources,satelliteLayers} from './satellite-style.js?v=51';

const SATELLITE_ID = 'base-satellite';
const SATELLITE_REFERENCE_ID = 'base-satellite-reference';
const STREET_ID = 'base-street';
const ROWS_SOURCE_ID = 'vineyard-rows';
const ROWS_LAYER_ID = 'vineyard-rows-line';
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
const OTHER_FIELDS_SOURCE_ID = 'other-project-fields';
const OTHER_FIELDS_FILL_ID = 'other-project-fields-fill';
const OTHER_FIELDS_LINE_ID = 'other-project-fields-line';
const OTHER_ROWS_SOURCE_ID = 'other-project-rows';
const OTHER_ROWS_LAYER_ID = 'other-project-rows-line';

function baseStyle() {
  return {
    version: 8,
    sources: {
      ...satelliteSources(),
      street: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© OpenStreetMap contributors'
      }
    },
    layers: [
      ...satelliteLayers({imageryLayerId:SATELLITE_ID,referenceLayerId:SATELLITE_REFERENCE_ID}),
      { id: STREET_ID, type: 'raster', source: 'street', layout: { visibility: 'none' } }
    ]
  };
}

export function initMap({ container, onGeometryChange = () => {}, onExclusionAdd = () => {}, onExclusionChange = () => {}, onRowCurvePointsChange = () => {}, onCadastralState = () => {}, onStatus = () => {}, onReady = () => {}, onDrawingState = () => {}, onEditingState = () => {}, requiresLinearConfirmation = () => false, enableTouchRotation = () => false, allowPanWhileEditing = () => false, onFieldSelect = () => {} }) {
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
  map.touchPitch?.disable?.();
  installTrackpadRotation(map, { touchRotation:enableTouchRotation() });

  let draw = null;
  let searchMarker = null;
  let gpsMarker = null;
  let sideMeasurementMarkers = [];
  let polygonOpsPromise = null;
  let manualDrawing = false;
  let manualMode = 'perimeter';
  let committedGeometry = null;
  let currentExclusions = [];
  let currentOtherFields = [];
  let manualVertices = [];
  let manualHover = null;
  let manualCloseMarker = null;
  let vertexRemovalMarkers = [];
  let otherFieldLabelMarkers = [];
  let activeFieldLabelMarker = null;
  let currentActiveFieldLabel = 'Campo';
  let drawEditingSuspended = false;
  let editableFeatureId = null;
  let vertexEditing = false;
  let editingExclusionId = null;
  let editRing = null;
  let editMarkers = [];
  let linearFinishPending = false;
  let touchStartPoint = null;
  let lastTouchEnd = -Infinity;
  let previousPerimeter = null;
  let toolsVersion = 0;
  let curveControlMarkers=[];
  let rowCurveEditor={geometry:null,orientationDeg:0,points:[],active:false};

  function clearCurveControlMarkers(){for(const marker of curveControlMarkers)marker.remove?.();curveControlMarkers=[];}

  function setRowCurveEditor({geometry=null,orientationDeg=0,points=[],active=false}={}){
    clearCurveControlMarkers();
    const normalized=normalizeRowCurvePoints(points);
    rowCurveEditor={geometry,orientationDeg:Number(orientationDeg)||0,points:normalized,active:Boolean(active)};
    if(!rowCurveEditor.active||!Array.isArray(geometry)||geometry.length<4)return false;
    normalized.forEach((point,index)=>{
      const element=document.createElement('button');element.type='button';element.className='curve-control-marker';element.textContent=String(index+1);element.title=`Punto di curvatura ${index+1}`;element.setAttribute?.('aria-label',element.title);
      element.addEventListener?.('pointerdown',event=>event.stopPropagation?.());
      element.addEventListener?.('touchstart',event=>event.stopPropagation?.(),{passive:true});
      const coordinate=curvePointToLonLat({polygon:geometry,orientationDeg:rowCurveEditor.orientationDeg,point});
      const marker=new globalThis.maplibregl.Marker({element,draggable:true,anchor:'center'}).setLngLat(coordinate).addTo(map);
      marker.on?.('dragend',()=>{
        const position=marker.getLngLat();
        const moved=lonLatToCurvePoint({polygon:geometry,orientationDeg:rowCurveEditor.orientationDeg,coordinate:[position.lng,position.lat],id:point.id});
        const updated=normalizeRowCurvePoints(rowCurveEditor.points.map(item=>item.id===point.id?moved:item));
        rowCurveEditor={...rowCurveEditor,points:updated};
        onRowCurvePointsChange(updated);
      });
      curveControlMarkers.push(marker);
    });
    return true;
  }

  function finishRowCurveEditing(){const wasActive=rowCurveEditor.active||curveControlMarkers.length>0;clearCurveControlMarkers();rowCurveEditor={...rowCurveEditor,active:false};return Boolean(wasActive);}

  const emitDrawingState = () => onDrawingState({
    active:manualDrawing,
    mode:manualMode,
    canClose:manualDrawing && (manualMode === 'linear-exclusion' ? manualVertices.length >= 2 : manualVertices.length >= 3),
    vertexCount:manualVertices.length
  });

  const setDrawingActive = (active) => {
    manualDrawing = Boolean(active);
    const canvas = map.getCanvas();
    canvas.classList?.toggle('drawing-active', manualDrawing);
    canvas.style.cursor = manualDrawing ? 'url("./assets/pencil-cursor.svg") 2 24, crosshair' : '';
    if (manualDrawing) {
      if (allowPanWhileEditing()) map.dragPan.enable();
      else map.dragPan.disable();
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

  function clearVertexRemovalMarkers() {
    for (const marker of vertexRemovalMarkers) marker.remove?.();
    vertexRemovalMarkers = [];
  }

  function clearOtherFieldLabelMarkers() {
    for (const marker of otherFieldLabelMarkers) marker.remove?.();
    otherFieldLabelMarkers = [];
  }

  function suspendDrawEditing() {
    stopVertexEditing();
    drawEditingSuspended = true;
    if (!draw) return;
    try { draw.deleteAll({ silent:true }); } catch { try { draw.deleteAll(); } catch {} }
  }

  function resumeDrawEditing() {
    drawEditingSuspended = false;
  }

  function syncManualCloseMarker() {
    removeManualCloseMarker();
    emitDrawingState();
    const requiredVertices = manualMode === 'linear-exclusion' ? 2 : 3;
    if (!manualDrawing || manualVertices.length < requiredVertices || typeof document === 'undefined' || typeof globalThis.maplibregl?.Marker !== 'function') return;
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'manual-close-vertex';
    const closeLabel = manualMode === 'linear-exclusion' ? 'Conferma passaggio' : manualMode === 'exclusion' ? 'Chiudi esclusione' : 'Chiudi perimetro';
    element.setAttribute('aria-label', closeLabel);
    element.title = closeLabel;
    element.textContent = '✓';
    const close = (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      finishManualPolygon();
    };
    element.addEventListener('pointerdown', (event) => event.stopPropagation?.());
    element.addEventListener('touchstart', (event) => event.stopPropagation?.(), { passive:true });
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
    const mode = manualMode;
    removeManualCloseMarker();
    manualVertices = [];
    manualHover = null;
    setDrawingActive(false);
    map.getSource(MANUAL_DRAW_SOURCE_ID)?.setData(emptyCollection());
    resumeDrawEditing();
    if (mode === 'perimeter' && previousPerimeter) {
      committedGeometry = previousPerimeter;
      setGeometry(committedGeometry);
    }
    if (mode !== 'perimeter' && committedGeometry) setGeometry(committedGeometry);
  }

  async function polygonOps() {
    if (!polygonOpsPromise) {
      polygonOpsPromise = import('https://cdn.jsdelivr.net/npm/polygon-clipping@0.15.7/+esm').then((module) => {
        const union = module.union ?? module.default?.union;
        const intersection = module.intersection ?? module.default?.intersection;
        if (typeof union !== 'function' || typeof intersection !== 'function') throw new Error('Modulo geometrico non disponibile');
        return { union, intersection };
      });
    }
    return polygonOpsPromise;
  }

  async function polygonIntersection(fieldRing, exclusionRing) {
    const { intersection } = await polygonOps();
    return normalizeIntersectionRings(intersection([fieldRing], [exclusionRing]));
  }

  function completeManualDrawing() {
    manualVertices = [];
    manualHover = null;
    renderManualDraft();
    setDrawingActive(false);
    resumeDrawEditing();
  }

  function finishExclusionSuccess(clippedRings, meta = {}) {
    completeManualDrawing();
    clippedRings.forEach((clipped, index) => onExclusionAdd(clipped, { ...meta, part:index + 1, parts:clippedRings.length }));
    if (committedGeometry) setGeometry(committedGeometry);
    onStatus(meta.type === 'linear'
      ? 'Passaggio lineare escluso. Filari e pali di testa sono stati ricalcolati.'
      : 'Area esclusa aggiunta. I filari e le quantità vengono ricalcolati.');
    return true;
  }

  async function clipAndFinishExclusion(ring, meta = {}) {
    const version = toolsVersion;
    let clippedRings;
    try {
      clippedRings = await polygonIntersection(committedGeometry, ring);
    } catch (error) {
      console.error(error);
      onStatus('Non riesco a ritagliare la zona esclusa in questo momento. Riprova tra poco.');
      return false;
    }
    if (version !== toolsVersion) return false;
    if (!clippedRings.length) {
      onStatus('La zona disegnata non interseca il campo selezionato.');
      return false;
    }
    return finishExclusionSuccess(clippedRings, meta);
  }

  function finishExclusionRing(ring, meta = {}) {
    if (!committedGeometry) { onStatus('Disegna prima il perimetro del campo.'); return false; }
    const strictlyInside = ring.slice(0, -1).every((point) => pointInPolygon(point, committedGeometry));
    if (strictlyInside) return finishExclusionSuccess([ring], meta);
    return clipAndFinishExclusion(ring, meta);
  }

  async function finishLinearExclusion() {
    if (manualVertices.length < 2) return false;
    if (linearFinishPending) { onStatus('Conferma del passaggio in corso…'); return false; }
    const corridor = corridorPolygonFromLine(manualVertices[0], manualVertices[1], 1.5);
    if (!corridor) { onStatus('Il passaggio lineare è troppo corto. Inserisci due punti distinti.'); return false; }
    linearFinishPending = true;
    try {
      return await finishExclusionRing(corridor, { type:'linear', widthM:1.5, label:'Passaggio lineare 1,50 m' });
    } finally {
      linearFinishPending = false;
    }
  }

  function finishManualPolygon() {
    if (manualMode === 'linear-exclusion') return finishLinearExclusion();
    const ring = closeManualPolygon(manualVertices);
    if (!ring) return false;
    const mode = manualMode;
    if (mode === 'exclusion') return finishExclusionRing(ring, { type:'area' });
    completeManualDrawing();
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
    renderActiveFieldLabel();
      if (coordinates) onGeometryChange(coordinates);
      return coordinates;
    };
    map.on('draw.update', (event) => emitGeometry(event));
    map.on('draw.delete', () => {
      if (drawEditingSuspended || manualDrawing) return;
      if (committedGeometry) { setGeometry(committedGeometry); onStatus('Il perimetro resta attivo. Usa “Cancella campo” per rimuoverlo completamente.'); }
    });
  }

  function handleDrawingPoint(event) {
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
    if (manualMode === 'linear-exclusion' && manualVertices.length >= 2 && requiresLinearConfirmation()) manualVertices[1]=[lon,lat];
    else manualVertices.push([lon, lat]);
    manualHover = null;
    renderManualDraft();
    if (manualMode === 'linear-exclusion') {
      if (manualVertices.length === 1) onStatus('Primo punto del passaggio inserito. Tocca/clicca il punto finale.');
      if (manualVertices.length >= 2) {
        if (requiresLinearConfirmation()) onStatus('Tocca Conferma passaggio per applicare il taglio di 1,50 m.');
        else void finishLinearExclusion();
      }
      return;
    }
    onStatus(manualVertices.length < 3
      ? `Punto ${manualVertices.length} inserito. Aggiungi almeno ${3 - manualVertices.length} punto/i.`
      : 'Ora chiudi il perimetro cliccando/toccando il primo punto verde.');
  }
  map.on('click', event => {
    if (Date.now()-lastTouchEnd < 700) return;
    if (manualDrawing) { handleDrawingPoint(event); return; }
    const selected = map.queryRenderedFeatures?.(event.point, { layers:[PROJECT_GEOMETRY_FILL_ID, OTHER_FIELDS_FILL_ID] })?.[0];
    if (selected) onFieldSelect(selected.properties?.fieldId || null);
  });
  map.on('touchstart', event => {
    touchStartPoint = manualDrawing && event.points?.length === 1 ? event.points[0] : null;
  });
  map.on('touchmove', event => {
    if (!touchStartPoint) return;
    const point=event.points?.[0];
    if (event.points?.length !== 1 || !point || Math.hypot(point.x-touchStartPoint.x,point.y-touchStartPoint.y)>10) touchStartPoint=null;
  });
  map.on('touchend', event => {
    lastTouchEnd=Date.now();
    const point=touchStartPoint;
    touchStartPoint=null;
    if (point && manualDrawing) handleDrawingPoint({...event,point:event.point ?? point});
  });
  map.on('touchcancel',()=>{touchStartPoint=null;});

  map.on('dblclick', (event) => {
    if (!manualDrawing || manualMode === 'linear-exclusion' || manualVertices.length < 3) return;
    event?.originalEvent?.preventDefault?.();
    finishManualPolygon();
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
    map.addSource(OTHER_ROWS_SOURCE_ID, { type:'geojson', data:rowsToFeatureCollection([]) });
    map.addLayer({ id:OTHER_ROWS_LAYER_ID, type:'line', source:OTHER_ROWS_SOURCE_ID, paint:{ 'line-color':'#e9e2aa', 'line-width':1.15, 'line-opacity':0.72 } });
    map.addSource(PROJECT_GEOMETRY_SOURCE_ID, { type:'geojson', data:emptyCollection() });
    map.addSource(OTHER_FIELDS_SOURCE_ID, { type:'geojson', data:otherFieldsFeatureCollection() });
    map.addLayer({ id:OTHER_FIELDS_FILL_ID, type:'fill', source:OTHER_FIELDS_SOURCE_ID, paint:{ 'fill-color':'#8aa893', 'fill-opacity':0.14 } });
    map.addLayer({ id:OTHER_FIELDS_LINE_ID, type:'line', source:OTHER_FIELDS_SOURCE_ID, layout:{'line-cap':'round','line-join':'round'}, paint:{ 'line-color':'#e8f1e9', 'line-width':3.5, 'line-dasharray':[2,1.2] } });
    map.addLayer({ id:PROJECT_GEOMETRY_FILL_ID, type:'fill', source:PROJECT_GEOMETRY_SOURCE_ID, paint:{ 'fill-color':'#b9d39d', 'fill-opacity':0.12 } });
    map.addLayer({ id:PROJECT_GEOMETRY_LINE_ID, type:'line', source:PROJECT_GEOMETRY_SOURCE_ID, layout:{'line-cap':'round','line-join':'round'}, paint:{ 'line-color':'#f5f6ed', 'line-width':1.1, 'line-opacity':0.62 } });
    map.addSource(EXCLUSIONS_SOURCE_ID, { type:'geojson', data:emptyCollection() });
    map.addLayer({ id:EXCLUSIONS_FILL_ID, type:'fill', source:EXCLUSIONS_SOURCE_ID, paint:{ 'fill-color':'#8a3f32', 'fill-opacity':0.22 } });
    map.addLayer({ id:EXCLUSIONS_LINE_ID, type:'line', source:EXCLUSIONS_SOURCE_ID, paint:{ 'line-color':'#fff1e7', 'line-width':2.5, 'line-dasharray':[1.5,1] } });
    map.addSource(MANUAL_DRAW_SOURCE_ID, { type:'geojson', data:emptyCollection() });
    map.addLayer({ id:MANUAL_DRAW_FILL_ID, type:'fill', source:MANUAL_DRAW_SOURCE_ID, filter:['==', ['get','kind'], 'fill'], paint:{ 'fill-color':'#d5e5c5', 'fill-opacity':0.22 } });
    map.addLayer({ id:MANUAL_DRAW_LINE_ID, type:'line', source:MANUAL_DRAW_SOURCE_ID, filter:['==', ['get','kind'], 'line'], layout:{ 'line-cap':'round', 'line-join':'round' }, paint:{ 'line-color':'#ffffff', 'line-width':3, 'line-dasharray':[1,1] } });
    map.addLayer({ id:MANUAL_DRAW_POINTS_ID, type:'circle', source:MANUAL_DRAW_SOURCE_ID, filter:['==', ['get','kind'], 'point'], paint:{ 'circle-radius':['case',['==',['get','first'],1],9,6], 'circle-color':['case',['==',['get','first'],1],'#4fa76c','#183f28'], 'circle-stroke-color':'#ffffff', 'circle-stroke-width':2 } });
    renderOtherFieldLabels();
    cadastralOverlay.refresh();
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

  function otherFieldsFeatureCollection(fields = currentOtherFields) {
    return { type:'FeatureCollection', features:(fields ?? []).map((field, index) => {
      const geometry = field?.geometry;
      if (!Array.isArray(geometry) || geometry.length < 4) return null;
      return {
        type:'Feature',
        id:field?.id ?? index,
        properties:{ label:field?.label ?? `Campo ${index + 1}`, fieldId:field?.id ?? '' },
        geometry:{ type:'Polygon', coordinates:[geometry] }
      };
    }).filter(Boolean) };
  }

  function clearActiveFieldLabel() {
    activeFieldLabelMarker?.remove?.();
    activeFieldLabelMarker = null;
  }

  function renderActiveFieldLabel() {
    clearActiveFieldLabel();
    if (!committedGeometry || typeof document === 'undefined' || typeof globalThis.maplibregl?.Marker !== 'function') return;
    const point = interiorLabelPoint(committedGeometry);
    if (!point) return;
    const element = document.createElement('div');
    element.className = 'field-label-marker active-field-label';
    element.textContent = currentActiveFieldLabel || 'Campo';
    activeFieldLabelMarker = new globalThis.maplibregl.Marker({ element, anchor:'center' }).setLngLat(point).addTo(map);
  }

  function renderOtherFieldLabels() {
    clearOtherFieldLabelMarkers();
    if (typeof document === 'undefined' || typeof globalThis.maplibregl?.Marker !== 'function') return;
    for (const field of currentOtherFields) {
      const point = interiorLabelPoint(field?.geometry);
      if (!point) continue;
      const element = document.createElement('div');
      element.className = 'field-label-marker';
      element.textContent = field?.label || 'Campo';
      otherFieldLabelMarkers.push(new globalThis.maplibregl.Marker({ element, anchor:'center' }).setLngLat(point).addTo(map));
    }
  }

  function otherRowsFeatureCollection(fields = currentOtherFields) {
    const rows = (fields ?? []).flatMap((field) => Array.isArray(field?.rows) ? field.rows : []);
    return rowsToFeatureCollection(rows);
  }

  function setOtherFields(fields = []) {
    currentOtherFields = Array.isArray(fields) ? fields : [];
    map.getSource(OTHER_FIELDS_SOURCE_ID)?.setData(otherFieldsFeatureCollection());
    map.getSource(OTHER_ROWS_SOURCE_ID)?.setData(otherRowsFeatureCollection());
    if (map.loaded()) renderOtherFieldLabels();
    else map.once('load', renderOtherFieldLabels);
  }

  function setActiveFieldLabel(label) {
    currentActiveFieldLabel = String(label ?? '').trim() || 'Campo';
    if (map.loaded()) renderActiveFieldLabel();
    else map.once('load', renderActiveFieldLabel);
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

  const cadastralOverlay = createCadastralOverlay({
    map,
    requestForViewport:cadastralRequest,
    beforeLayerId:() => map.getLayer(ROWS_LAYER_ID) ? ROWS_LAYER_ID : (map.getLayer(OTHER_ROWS_LAYER_ID) ? OTHER_ROWS_LAYER_ID : (map.getLayer(OTHER_FIELDS_FILL_ID) ? OTHER_FIELDS_FILL_ID : (map.getLayer(PROJECT_GEOMETRY_FILL_ID) ? PROJECT_GEOMETRY_FILL_ID : undefined))),
    onState:onCadastralState
  });

  function setCadastralVisible(visible) {
    cadastralOverlay.setVisible(visible);
  }

  function setGeometry(coords) {
    if (!Array.isArray(coords) || coords.length < 4) return false;
    stopVertexEditing();
    clearVertexRemovalMarkers();
    committedGeometry = coords;
    const apply = () => {
      updateProjectGeometrySource(coords);
      if (draw && !drawEditingSuspended) {
        try { draw.deleteAll({ silent:true }); } catch { draw.deleteAll(); }
        const ids = draw.add({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [coords] }
        });
        const id = ids?.[0];
        editableFeatureId = id ?? null;
        // The committed source displays the field; editing uses explicit HTML handles.
        draw.deleteAll({ silent:true });
      }
      updateSideMeasurements(coords);
      renderActiveFieldLabel();
      const bounds = coords.reduce((box, [lon, lat]) => box.extend([lon, lat]), new globalThis.maplibregl.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(bounds, { padding: 55, maxZoom: 18, duration: 0 });
      return true;
    };
    if (map.loaded()) return apply();
    map.once('load', apply);
    return true;
  }

  function beginDraw() {
    clearVertexRemovalMarkers();
    manualMode = 'perimeter';
    suspendDrawEditing();
    previousPerimeter = committedGeometry;
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

  function beginVertexEditing() {
    clearVertexRemovalMarkers();
    if (!committedGeometry) { onStatus('Disegna prima il perimetro del campo.'); return false; }
    if (manualDrawing) cancelManualDrawing();
    stopVertexEditing();
    editRing = committedGeometry.map(p=>[...p]);
    vertexEditing = true;
    draw?.deleteAll({silent:true});
    if (allowPanWhileEditing()) map.dragPan.enable();
    else map.dragPan.disable();
    onEditingState({active:true});
    renderEditHandles();
    onStatus('Trascina i punti; premi + per aggiungerne uno. Poi premi “Fine modifica”.');
    return true;
  }

  function finishVertexEditing() {
    if (!vertexEditing) return false;
    stopVertexEditing();
    onStatus('Modifica conclusa. Perimetro, quote e progetto aggiornati.');
    return true;
  }

  function stopVertexEditing() {
    for (const marker of editMarkers) marker.remove();
    editMarkers = [];
    const wasEditing = vertexEditing;
    vertexEditing = false;
    editingExclusionId = null;
    editRing = null;
    if (wasEditing) { map.dragPan.enable(); onEditingState({active:false}); }
  }

  function beginExclusionEditing(id) {
    const item = currentExclusions.find(x=>x.id===id);
    if (!item?.geometry) return false;
    if (manualDrawing) cancelManualDrawing();
    stopVertexEditing();
    clearVertexRemovalMarkers();
    editingExclusionId = id;
    editRing = item.geometry.map(p=>[...p]);
    vertexEditing = true;
    draw?.deleteAll({silent:true});
    if (allowPanWhileEditing()) map.dragPan.enable();
    else map.dragPan.disable();
    onEditingState({active:true, exclusionId:id});
    renderEditHandles();
    onStatus('Modifica zona esclusa: trascina i vertici o aggiungi punti con +. Poi “Fine modifica”.');
    return true;
  }

  function publishEditRing() {
    const ring = editRing.map(p=>[...p]);
    if (editingExclusionId !== null) {
      currentExclusions = currentExclusions.map(item=>item.id===editingExclusionId ? {...item,geometry:ring} : item);
      map.getSource(EXCLUSIONS_SOURCE_ID)?.setData(exclusionFeatureCollection());
      onExclusionChange(editingExclusionId,ring);
    } else {
      committedGeometry = ring;
      updateProjectGeometrySource(ring);
      updateSideMeasurements(ring);
      renderActiveFieldLabel();
      onGeometryChange(ring);
    }
  }

  function renderEditHandles() {
    for (const marker of editMarkers) marker.remove();
    editMarkers = [];
    if (!vertexEditing || !editRing) return;
    const points = editRing.slice(0,-1);
    points.forEach((point,index)=>{
      const element = document.createElement('button');
      element.type='button'; element.className='vertex-edit-handle';
      element.setAttribute('aria-label', `Sposta punto ${index+1}`);
      element.textContent=String(index+1);
      const marker = new globalThis.maplibregl.Marker({element,draggable:true}).setLngLat(point).addTo(map);
      marker.on('dragend',()=>{
        if (!vertexEditing) return;
        const {lng,lat}=marker.getLngLat();
        editRing[index]=[lng,lat];
        editRing[editRing.length-1]=[...editRing[0]];
        publishEditRing(); renderEditHandles();
        if (allowPanWhileEditing()) map.dragPan.enable();
        else map.dragPan.disable();
      });
      editMarkers.push(marker);
      const next=points[(index+1)%points.length];
      const midpoint=[(point[0]+next[0])/2,(point[1]+next[1])/2];
      const add=document.createElement('button');
      add.type='button'; add.className='vertex-add-handle'; add.textContent='+';
      add.setAttribute('aria-label',`Aggiungi punto dopo ${index+1}`);
      add.addEventListener('click',event=>{
        event.preventDefault?.(); event.stopPropagation?.();
        editRing.splice(index+1,0,midpoint);
        publishEditRing(); renderEditHandles();
      });
      editMarkers.push(new globalThis.maplibregl.Marker({element:add}).setLngLat(midpoint).addTo(map));
    });
  }

  function beginExclusionDraw() {
    if (!committedGeometry) { onStatus('Disegna prima il perimetro del campo.'); return false; }
    clearVertexRemovalMarkers();
    manualMode = 'exclusion';
    suspendDrawEditing();
    manualVertices = []; manualHover = null; renderManualDraft(); setDrawingActive(true);
    onStatus('Disegna la zona da escludere: inserisci almeno 3 punti e poi chiudila sul primo punto verde o con “Chiudi esclusione”.');
    return true;
  }

  function beginLinearExclusionDraw() {
    if (!committedGeometry) { onStatus('Disegna prima il perimetro del campo.'); return false; }
    clearVertexRemovalMarkers();
    manualMode = 'linear-exclusion';
    suspendDrawEditing();
    manualVertices = []; manualHover = null; renderManualDraft(); setDrawingActive(true);
    onStatus('Passaggio lineare 1,50 m: tocca/clicca il punto iniziale e poi quello finale.');
    return true;
  }

  function clearGeometry() {
    stopVertexEditing();
    clearVertexRemovalMarkers();
    resumeDrawEditing();
    previousPerimeter = null;
    committedGeometry = null;
    editableFeatureId = null;
    vertexEditing = false;
    onEditingState({ active:false });
    clearActiveFieldLabel();
    cancelManualDrawing();
    if (draw) { try { draw.deleteAll({ silent:true }); } catch { draw.deleteAll(); } }
    updateProjectGeometrySource(null);
    updateSideMeasurements(null);
    setRows([]);
    setExclusions([]);
    onStatus('Campo cancellato. Puoi disegnare un nuovo perimetro.');
  }

  function beginVertexRemoval() {
    stopVertexEditing();
    clearVertexRemovalMarkers();
    if (!committedGeometry || committedGeometry.length <= 4) {
      onStatus(committedGeometry ? 'Il perimetro deve mantenere almeno 3 vertici.' : 'Disegna prima il perimetro del campo.');
      return false;
    }
    if (typeof document === 'undefined' || typeof globalThis.maplibregl?.Marker !== 'function') return false;
    const vertices = committedGeometry.slice(0, -1);
    vertices.forEach((coordinate, index) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'vertex-removal-marker';
      element.textContent = '−';
      element.setAttribute('aria-label', `Elimina vertice ${index + 1}`);
      element.title = `Elimina vertice ${index + 1}`;
      element.addEventListener('pointerdown', (event) => event.stopPropagation?.());
      element.addEventListener('touchstart', (event) => event.stopPropagation?.(), { passive:true });
      element.addEventListener('click', (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        const next = removeClosedRingVertex(committedGeometry, index);
        if (!next) { onStatus('Il perimetro deve mantenere almeno 3 vertici.'); clearVertexRemovalMarkers(); return; }
        clearVertexRemovalMarkers();
        setGeometry(next);
        onGeometryChange(next);
        onStatus('Vertice eliminato. Perimetro e quote aggiornati.');
      });
      vertexRemovalMarkers.push(new globalThis.maplibregl.Marker({ element, anchor:'center' }).setLngLat(coordinate).addTo(map));
    });
    onStatus('I vertici eliminabili sono evidenziati in rosso: clicca/tocca il simbolo − sul punto da rimuovere.');
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


  function focusActiveField() {
    if (!committedGeometry || committedGeometry.length < 4) { onStatus('Il campo selezionato non ha ancora un perimetro.'); return false; }
    const bounds = committedGeometry.reduce((box, coordinate) => box.extend(coordinate), new globalThis.maplibregl.LngLatBounds(committedGeometry[0], committedGeometry[0]));
    map.fitBounds(bounds, { padding:70, maxZoom:18, duration:450, essential:true });
    return true;
  }

  function focusAllFields() {
    const rings = [committedGeometry, ...(currentOtherFields ?? []).map((field) => field?.geometry)]
      .filter((ring) => Array.isArray(ring) && ring.length >= 4);
    if (!rings.length) return false;
    const first = rings[0][0];
    const bounds = rings.flat().reduce((box, coordinate) => box.extend(coordinate), new globalThis.maplibregl.LngLatBounds(first, first));
    map.fitBounds(bounds, { padding:65, maxZoom:18, duration:350, essential:true });
    return true;
  }

  function setBaseMap(kind) {
    if (!map.getLayer(SATELLITE_ID) || !map.getLayer(SATELLITE_REFERENCE_ID) || !map.getLayer(STREET_ID)) return;
    const satellite = kind !== 'street';
    map.setLayoutProperty(SATELLITE_ID, 'visibility', satellite ? 'visible' : 'none');
    map.setLayoutProperty(SATELLITE_REFERENCE_ID, 'visibility', satellite ? 'visible' : 'none');
    map.setLayoutProperty(STREET_ID, 'visibility', satellite ? 'none' : 'visible');
  }

  function setRows(rows) {
    const source = map.getSource(ROWS_SOURCE_ID);
    source?.setData(rowsToFeatureCollection(rows));
  }

  function showSearchResult(result){
    map.flyTo({center:[result.lon,result.lat],zoom:16.5,essential:true});
    searchMarker?.remove();
    searchMarker=new globalThis.maplibregl.Marker({color:'#183f28'}).setLngLat([result.lon,result.lat])
      .setPopup(new globalThis.maplibregl.Popup({offset:22}).setText(result.label)).addTo(map);
    onStatus('Zona trovata. Ora puoi disegnare il terreno.');
    return result;
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
    return showSearchResult(result);
  }

  async function searchSuggestion(item){
    if(!item?.magicKey)return search(item?.label);
    onStatus('Ricerca della zona…');
    const response=await fetch(buildSuggestionPlaceUrl(item),{headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`Ricerca non disponibile (${response.status})`);
    const [result]=normalizeSuggestionPlaces(await response.json());
    if(!result)return search(item.label);
    return showSearchResult(result);
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

  map.on('moveend', () => { cadastralOverlay.refresh(); ensureCommittedVisuals(); });
  map.on('resize', () => { cadastralOverlay.refresh(); ensureCommittedVisuals(); });
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

  function stopTools() {
    toolsVersion++;
    map.getCanvas().style.cursor = '';
    if (manualDrawing) cancelManualDrawing();
    finishVertexEditing();
    clearVertexRemovalMarkers();
    finishRowCurveEditing();
  }
  function undoDrawPoint() {
    if (!manualDrawing || !manualVertices.length || linearFinishPending) return;
    manualVertices.pop(); manualHover=null; renderManualDraft(); emitDrawingState();
    onStatus('Ultimo punto rimosso. Puoi continuare a disegnare.');
  }
  return { map, draw, stopTools, undoDrawPoint, beginDraw, beginExclusionDraw, beginLinearExclusionDraw, finishDraw:finishManualPolygon, clearGeometry, beginVertexEditing, finishVertexEditing, beginExclusionEditing, beginVertexRemoval, removeSelectedVertex, setGeometry, setExclusions, setOtherFields, setActiveFieldLabel, setRowCurveEditor, finishRowCurveEditing, focusActiveField, focusAllFields, setBaseMap, setRows, search, searchSuggestion, suggest, locate, rotateBy, resetNorth, setCadastralVisible };
}
