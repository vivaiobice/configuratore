import { buildGeocodeUrl, buildSuggestionUrl, buildSuggestionPlaceUrl, normalizeGeocodeResults, normalizeSuggestionResults, normalizeSuggestionPlaces, coordinatesFromDrawEvent, GEOLOCATION_OPTIONS, configureDrawForMapLibre, closeManualPolygon, isManualCloseClick, removeClosedRingVertex } from './map-adapters.js?v=46';
import { rowsToFeatureCollection, sideMeasurements, pointInPolygon, interiorLabelPoint, corridorPolygonFromLine, normalizeIntersectionRings } from './geometry.js?v=45';
import {createMapFieldLabelOverlay} from './map-field-label-overlay.js?v=1.3.2';
import { buildCadastralWmsUrl, buildCadastralIdentifyUrl, cadastralLayerMode } from './cadastre.js?v=1.3.2';
import { createCadastralOverlay } from './cadastral-overlay.js?v=1.3.2';
import { createCadastralDwellIdentifier } from './cadastral-identify.js?v=53.2';
import {installTrackpadRotation,createMapGesturePolicy} from './map-gestures.js?v=1.3.2';
import {createMapTerrainControl} from './map-terrain-control.js?v=1.3.2';
import { curvePointToLonLat,lonLatToCurvePoint,normalizeRowCurvePoints,resolveRowCurvePoints,getRowCurveSegments } from './row-curves.js?v=1.3.2';
import {satelliteSources,satelliteLayers} from './satellite-style.js?v=51';
import polygonClipping from './vendor/polygon-clipping.js?v=1.3.2';
import {portionAtCoordinate} from './row-portions.js?v=1.3.2';
import {createMapOverlayVisibility} from './map-overlay-visibility.js?v=1.3.2';
import {createCoordinateEditor,replaceRingVertex} from './coordinate-editor.js?v=1.3.2';
import {regeneratePassage,reshapeExclusion,nativePassageFamilyPresent} from './passage-coordinates.js?v=1.3.2';
import {mapTerrainExclusionFeatures} from './map-terrain-exclusions.js?v=1.3.2';
import {resolveTerrainExclusionGroups} from './terrain-exclusion-groups.js?v=1.3.2';

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
const PORTIONS_SOURCE_ID='row-portions';
const TERRAIN_PREVIEW_ROWS_SOURCE_ID='terrain-proposal-rows';
const TERRAIN_PREVIEW_ROWS_LAYER_ID='terrain-proposal-rows-line';
const TERRAIN_PREVIEW_CUT_SOURCE_ID='terrain-proposal-cut';
const TERRAIN_PREVIEW_CUT_FILL_ID='terrain-proposal-cut-fill';
const TERRAIN_PREVIEW_CUT_LINE_ID='terrain-proposal-cut-line';

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

export function initMap({ container, onGeometryChange = () => {}, onExclusionAdd = () => {}, onExclusionChange = () => {}, onExclusionsReplace = () => {}, onNativePassageEndpointRequest = null, getNativePassageEditContext = () => null, onRowCurvePointsChange = () => {}, onCadastralState = () => {}, onCadastralIdentifyState = () => {}, onStatus = () => {}, onReady = () => {}, onDrawingState = () => {}, onEditingState = () => {}, onVertexRemovalState = () => {}, onDraftChange = () => {}, requiresLinearConfirmation = () => false, enableTouchRotation = () => false, allowPanWhileEditing = () => false, onFieldSelect = () => {}, onTerrainToggle = () => {} }) {
  if (!globalThis.maplibregl) throw new Error('MapLibre GL non disponibile');

  const map = new globalThis.maplibregl.Map({
    container,
    style: baseStyle(),
    center: [8.225, 44.709],
    zoom: 12.8,
    pitchWithRotate: true,
    dragRotate: false,
    attributionControl: true
  });
  // Editor sources become usable once. MapLibre.loaded() also becomes false
  // during later tile requests and source updates, after `load` has already fired.
  let editorReady=false;
  const editorReadyTasks=new Set();
  function whenEditorReady(callback){
    if(editorReady)callback();else editorReadyTasks.add(callback);
    return ()=>editorReadyTasks.delete(callback);
  }

  map.addControl(new globalThis.maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
  map.addControl(new globalThis.maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
  map.dragRotate.disable?.();
  map.touchZoomRotate.enable();
  map.touchPitch?.disable?.();
  const wheelPolicy=installTrackpadRotation(map,{touchRotation:enableTouchRotation()});
  const gesturePolicy=createMapGesturePolicy({map,touchRotation:wheelPolicy});
  const terrainControl=createMapTerrainControl({map,onToggle:onTerrainToggle});
  map.on('remove',()=>{gesturePolicy.destroy({restoreCamera:false});wheelPolicy();terrainControl.destroy();});

  let draw = null;
  let searchMarker = null;
  let gpsMarker = null;
  let sideMeasurementMarkers = [];
  let publishedProjectGeometrySource = null;
  let publishedProjectGeometry = null;
  let projectGeometryPublished = false;
  let measuredGeometry = null;
  let measurementsPublished = false;
  let manualDrawing = false;
  let manualMode = 'perimeter';
  let committedGeometry = null;
  let currentExclusions = [];
  let savedRows = [];
  let terrainProposalPreview = null;
  let terrainSceneActive=false,terrainProjector=null;
  let currentOtherFields = [];
  let manualVertices = [];
  let manualHover = null;
  let manualCloseMarker = null;
  let vertexRemovalMarkers = [];
  let vertexRemovalActive = false;
  let otherFieldLabelMarkers = [];
  let activeFieldLabelMarker = null;
  let currentActiveFieldLabel = 'Campo';
  const fieldLabelOverlay=createMapFieldLabelOverlay({map});
  const overlayVisibility=createMapOverlayVisibility({map});
  let drawEditingSuspended = false;
  let editableFeatureId = null;
  let vertexEditing = false;
  let editingExclusionId = null;
  let nativePassageEdit = null;
  let editRing = null;
  let editMarkers = [];
  const coordinateEditor=createCoordinateEditor({document:globalThis.document});
  let coordinateAction=null,coordinateVersion=0;
  function closeCoordinates(){coordinateAction?.remove?.();coordinateAction=null;coordinateEditor.close();}
  function offerCoordinates(element,coordinate,title,onApply,contextCurrent=()=>true,nativeDialog=false){
    closeCoordinates();const version=coordinateVersion;
    const isCurrent=()=>vertexEditing&&version===coordinateVersion&&contextCurrent();
    const action=document.createElement('button');action.type='button';action.className='vertex-coordinate-action';action.textContent='Coordinate';
    const rect=element.getBoundingClientRect?.();if(rect){action.style.left=`${Math.max(8,Math.min(rect.left,globalThis.innerWidth-120))}px`;action.style.top=`${Math.max(8,Math.min(rect.bottom+5,globalThis.innerHeight-52))}px`;}
    action.addEventListener('click',event=>{
      event.stopPropagation?.();if(!isCurrent()){closeCoordinates();return;}action.remove();coordinateAction=null;
      const dismissal=nativeDialog?new AbortController():null;
      coordinateEditor.open({coordinate,title,isCurrent,trigger:element,onApply:dismissal?(point,control)=>onApply(point,{...control,dismissSignal:dismissal.signal}):onApply,...(dismissal?{onClose:()=>dismissal.abort()}:{})});
    });
    document.body.append(action);coordinateAction=action;action.focus?.();
  }
  let linearFinishPending = false;
  let touchStartPoint = null;
  let lastTouchEnd = -Infinity;
  let previousPerimeter = null;
  let toolsVersion = 0;
  let curveControlMarkers=[];
  let curveEditorVersion=0;
  let rowCurveEditor={geometry:null,orientationDeg:0,points:[],active:false};
  let cadastralVisible=false;
  let rowPortions={portions:[],activeId:null,onSelect:()=>{},canSelect:()=>true};

  function setRowPortions({portions=[],activeId=null,onSelect=()=>{},canSelect=()=>true}={}){
    rowPortions={portions,activeId,onSelect,canSelect};
    whenEditorReady(()=>map.getSource(PORTIONS_SOURCE_ID)?.setData({type:'FeatureCollection',features:rowPortions.portions.map((portion,index)=>({type:'Feature',id:portion.id,properties:{portionId:portion.id,label:portion.label,active:portion.id===rowPortions.activeId,index},geometry:{type:'Polygon',coordinates:portion.geometry}}))}));
  }

  function selectRowPortion(event){
    if(manualDrawing||vertexEditing||vertexRemovalActive||editingExclusionId||linearFinishPending||!rowPortions.canSelect())return false;
    const position=event.lngLat??(event.point?map.unproject?.(event.point):null);
    const selected=portionAtCoordinate(rowPortions.portions,[Number(position?.lng),Number(position?.lat)]);
    if(!selected)return false;
    rowPortions.onSelect(selected.id);return true;
  }

  function clearCurveControlMarkers(){for(const marker of curveControlMarkers)marker.remove?.();curveControlMarkers=[];}

  function setRowCurveEditor({geometry=null,orientationDeg=0,exclusions=[],points=[],active=false}={}){
    const version=++curveEditorVersion;
    clearCurveControlMarkers();
    const normalized=resolveRowCurvePoints({polygon:geometry,orientationDeg,exclusions,rowCurvePoints:points});
    const segments=getRowCurveSegments({polygon:geometry,orientationDeg,exclusions});
    rowCurveEditor={geometry,orientationDeg:Number(orientationDeg)||0,exclusions,points:normalized,active:Boolean(active)};
    if(!rowCurveEditor.active||!Array.isArray(geometry)||geometry.length<4)return false;
    normalized.forEach((point,index)=>{
      const element=document.createElement('button');element.type='button';element.className='curve-control-marker';element.textContent=String(index+1);element.title=`Punto di curvatura ${index+1}${segments.length>1?' · '+segments.find(segment=>segment.id===point.segmentId)?.label:''}`;element.setAttribute?.('aria-label',element.title);
      element.addEventListener?.('pointerdown',event=>event.stopPropagation?.());
      element.addEventListener?.('touchstart',event=>event.stopPropagation?.(),{passive:true});
      element.addEventListener?.('click',event=>event.stopPropagation?.());
      const coordinate=curvePointToLonLat({polygon:geometry,orientationDeg:rowCurveEditor.orientationDeg,point});
      const marker=new globalThis.maplibregl.Marker({element,draggable:true,anchor:'center'}).setLngLat(coordinate).addTo(map);
      marker.on?.('dragend',()=>{
        if(version!==curveEditorVersion)return;
        const position=marker.getLngLat();
        const moved=lonLatToCurvePoint({polygon:geometry,orientationDeg:rowCurveEditor.orientationDeg,coordinate:[position.lng,position.lat],id:point.id,segmentId:point.segmentId});
        const updated=resolveRowCurvePoints({polygon:geometry,orientationDeg:rowCurveEditor.orientationDeg,exclusions:rowCurveEditor.exclusions,
          rowCurvePoints:rowCurveEditor.points.map(item=>item.id===point.id?{...moved,...(point.segmentId?{segmentId:point.segmentId}:{})}:item)});
        const movedPoint=updated.find(item=>item.id===point.id);
        if(movedPoint)marker.setLngLat(curvePointToLonLat({polygon:geometry,orientationDeg:rowCurveEditor.orientationDeg,point:movedPoint}));
        else marker.remove?.();
        rowCurveEditor={...rowCurveEditor,points:updated};
        onRowCurvePointsChange(updated);
      });
      curveControlMarkers.push(marker);
    });
    return true;
  }

  function finishRowCurveEditing(){const wasActive=rowCurveEditor.active||curveControlMarkers.length>0;++curveEditorVersion;clearCurveControlMarkers();rowCurveEditor={...rowCurveEditor,active:false};return Boolean(wasActive);}

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
    onDraftChange();
  };

  function emptyCollection() { return { type:'FeatureCollection', features:[] }; }

  function projectFeature(coords) {
    return Array.isArray(coords) && coords.length >= 4
      ? { type:'Feature', properties:{}, geometry:{ type:'Polygon', coordinates:[coords] } }
      : null;
  }

  function sameCoordinateRing(first, second) {
    if (first === null || second === null) return first === second;
    return Array.isArray(first) && Array.isArray(second) && first.length === second.length
      && first.every((point, index) => Array.isArray(point) && Array.isArray(second[index])
        && point.length === second[index].length
        && point.every((value, axis) => Object.is(value, second[index][axis])));
  }

  function copyCoordinateRing(coords) {
    return Array.isArray(coords) ? coords.map(point => Array.isArray(point) ? [...point] : point) : null;
  }

  function updateProjectGeometrySource(coords) {
    const source = map.getSource(PROJECT_GEOMETRY_SOURCE_ID);
    if (!source) return;
    const feature = projectFeature(coords);
    const geometry = feature ? coords : null;
    if (projectGeometryPublished && source === publishedProjectGeometrySource && sameCoordinateRing(geometry, publishedProjectGeometry)) return;
    source.setData(feature ? { type:'FeatureCollection', features:[feature] } : emptyCollection());
    publishedProjectGeometrySource = source;
    publishedProjectGeometry = copyCoordinateRing(geometry);
    projectGeometryPublished = true;
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
    if (vertexRemovalActive) {
      vertexRemovalActive = false;
      onVertexRemovalState({active:false});
    }
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
    return polygonClipping;
  }

  async function polygonIntersection(fieldRing, exclusionRing) {
    const { intersection } = await polygonOps();
    return normalizeIntersectionRings(intersection([fieldRing], [exclusionRing]));
  }

  function completeManualDrawing() {
    manualVertices = [];
    manualHover = null;
    renderManualDraft();
    onDraftChange();
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
      return await finishExclusionRing(corridor, { type:'linear', widthM:1.5, label:'Passaggio lineare 1,50 m', sourceAxis:manualVertices.slice(0,2).map(p=>[...p]), passageGroupId:`passage-${Date.now()}-${Math.random().toString(36).slice(2,9)}` });
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
    onDraftChange();
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
    if (selectRowPortion(event)) return;
    const selected = map.queryRenderedFeatures?.(event.point, { layers:[PROJECT_GEOMETRY_FILL_ID, OTHER_FIELDS_FILL_ID] })?.[0];
    if (selected) onFieldSelect(selected.properties?.fieldId || null);
  });
  map.on('touchstart', event => {
    touchStartPoint = event.points?.length === 1 ? event.points[0] : null;
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
    else if (point) {
      if(selectRowPortion({...event,point}))return;
      const selected=map.queryRenderedFeatures?.(point,{layers:[PROJECT_GEOMETRY_FILL_ID,OTHER_FIELDS_FILL_ID]})?.[0];
      if(selected)onFieldSelect(selected.properties?.fieldId||null);
    }
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
    map.addSource(PORTIONS_SOURCE_ID,{type:'geojson',data:emptyCollection()});
    map.addLayer({id:'row-portions-fill',type:'fill',source:PORTIONS_SOURCE_ID,paint:{'fill-color':['case',['==',['get','index'],0],'#b9d39d','#b8cfe2'],'fill-opacity':['case',['get','active'],.19,.08]}});
    map.addLayer({id:'row-portions-outline',type:'line',source:PORTIONS_SOURCE_ID,paint:{'line-color':['case',['get','active'],'#ffe18a','#d5e5c5'],'line-width':['case',['get','active'],3,1],'line-opacity':['case',['get','active'],1,.5]}});
    map.addSource(EXCLUSIONS_SOURCE_ID, { type:'geojson', data:emptyCollection() });
    map.addLayer({ id:EXCLUSIONS_FILL_ID, type:'fill', source:EXCLUSIONS_SOURCE_ID, paint:{ 'fill-color':'#8a3f32', 'fill-opacity':0.22 } });
    map.addLayer({ id:EXCLUSIONS_LINE_ID, type:'line', source:EXCLUSIONS_SOURCE_ID, paint:{ 'line-color':'#fff1e7', 'line-width':2.5, 'line-dasharray':[1.5,1] } });
    map.addSource(TERRAIN_PREVIEW_ROWS_SOURCE_ID,{type:'geojson',data:emptyCollection()});
    map.addLayer({id:TERRAIN_PREVIEW_ROWS_LAYER_ID,type:'line',source:TERRAIN_PREVIEW_ROWS_SOURCE_ID,paint:{'line-color':'#ffe18c','line-width':2,'line-opacity':.95}});
    map.addSource(TERRAIN_PREVIEW_CUT_SOURCE_ID,{type:'geojson',data:emptyCollection()});
    map.addLayer({id:TERRAIN_PREVIEW_CUT_FILL_ID,type:'fill',source:TERRAIN_PREVIEW_CUT_SOURCE_ID,paint:{'fill-color':'#f0bb5b','fill-opacity':.25}});
    map.addLayer({id:TERRAIN_PREVIEW_CUT_LINE_ID,type:'line',source:TERRAIN_PREVIEW_CUT_SOURCE_ID,paint:{'line-color':'#ffe18c','line-width':3}});
    map.addSource(MANUAL_DRAW_SOURCE_ID, { type:'geojson', data:emptyCollection() });
    map.addLayer({ id:MANUAL_DRAW_FILL_ID, type:'fill', source:MANUAL_DRAW_SOURCE_ID, filter:['==', ['get','kind'], 'fill'], paint:{ 'fill-color':'#d5e5c5', 'fill-opacity':0.22 } });
    map.addLayer({ id:MANUAL_DRAW_LINE_ID, type:'line', source:MANUAL_DRAW_SOURCE_ID, filter:['==', ['get','kind'], 'line'], layout:{ 'line-cap':'round', 'line-join':'round' }, paint:{ 'line-color':'#ffffff', 'line-width':3, 'line-dasharray':[1,1] } });
    map.addLayer({ id:MANUAL_DRAW_POINTS_ID, type:'circle', source:MANUAL_DRAW_SOURCE_ID, filter:['==', ['get','kind'], 'point'], paint:{ 'circle-radius':['case',['==',['get','first'],1],9,6], 'circle-color':['case',['==',['get','first'],1],'#4fa76c','#183f28'], 'circle-stroke-color':'#ffffff', 'circle-stroke-width':2 } });
    editorReady=true;
    for(const callback of [...editorReadyTasks]){editorReadyTasks.delete(callback);callback();}
    renderOtherFieldLabels();
    overlayVisibility.refresh();
    refreshTerrainPreviewVisibility();
    cadastralOverlay.refresh();
    onReady();
  });


  function updateSideMeasurements(coords) {
    const geometry = Array.isArray(coords) ? coords : null;
    if (measurementsPublished && sameCoordinateRing(geometry, measuredGeometry)) {
      overlayVisibility.refresh();
      return;
    }
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
    measuredGeometry = copyCoordinateRing(geometry);
    measurementsPublished = true;
    overlayVisibility.refresh();
  }

  function exclusionFeatureCollection(exclusions = currentExclusions) {
    const result=mapTerrainExclusionFeatures({exclusions,field:committedGeometry});
    if(result.status!=='ready')onStatus('Alcuni passaggi non possono essere verificati e non sono mostrati sulla mappa.');
    return result.featureCollection;
  }

  function setExclusions(exclusions = []) {
    const before=currentExclusions.find(item=>item.id===editingExclusionId);
    const after=exclusions?.find?.(item=>item.id===editingExclusionId);
    const changed=vertexEditing&&editingExclusionId!==null&&JSON.stringify(before)!==JSON.stringify(after);
    currentExclusions = Array.isArray(exclusions) ? exclusions : [];
    whenEditorReady(()=>map.getSource(EXCLUSIONS_SOURCE_ID)?.setData(exclusionFeatureCollection()));
    if(nativePassageEdit){if(!nativePassageEditCurrent())stopVertexEditing();return;}
    if(changed){if(after?.geometry){editRing=after.geometry.map(p=>[...p]);renderEditHandles();}else stopVertexEditing();}
  }

  function nativePassageEditFingerprint(){
    return JSON.stringify({exclusions:currentExclusions,field:committedGeometry,context:getNativePassageEditContext()});
  }
  function nativePassageEditCurrent(){
    try{return !!nativePassageEdit&&nativePassageEdit.fingerprint===nativePassageEditFingerprint();}catch{return false;}
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
    if(fieldLabelOverlay)renderAllFieldLabels();
  }

  function renderAllFieldLabels(){
    fieldLabelOverlay?.setFields([
      ...currentOtherFields,
      ...(committedGeometry?[{geometry:committedGeometry,label:currentActiveFieldLabel}]:[])
    ]);
    overlayVisibility.refresh();
  }

  function renderActiveFieldLabel() {
    clearActiveFieldLabel();
    if(fieldLabelOverlay)return;
    if (!committedGeometry || typeof document === 'undefined' || typeof globalThis.maplibregl?.Marker !== 'function') return;
    const point = interiorLabelPoint(committedGeometry);
    if (!point) return;
    const element = document.createElement('div');
    element.className = 'field-label-marker active-field-label';
    element.textContent = currentActiveFieldLabel || 'Campo';
    activeFieldLabelMarker = new globalThis.maplibregl.Marker({ element, anchor:'center' }).setLngLat(point).addTo(map);
    overlayVisibility.refresh();
  }

  function renderOtherFieldLabels() {
    clearOtherFieldLabelMarkers();
    if(fieldLabelOverlay){renderAllFieldLabels();return;}
    if (typeof document === 'undefined' || typeof globalThis.maplibregl?.Marker !== 'function') return;
    for (const field of currentOtherFields) {
      const point = interiorLabelPoint(field?.geometry);
      if (!point) continue;
      const element = document.createElement('div');
      element.className = 'field-label-marker';
      element.textContent = field?.label || 'Campo';
      otherFieldLabelMarkers.push(new globalThis.maplibregl.Marker({ element, anchor:'center' }).setLngLat(point).addTo(map));
    }
    overlayVisibility.refresh();
  }

  function otherRowsFeatureCollection(fields = currentOtherFields) {
    const rows = (fields ?? []).flatMap((field) => Array.isArray(field?.rows) ? field.rows : []);
    return rowsToFeatureCollection(rows);
  }

  function setOtherFields(fields = []) {
    currentOtherFields = Array.isArray(fields) ? fields : [];
    map.getSource(OTHER_FIELDS_SOURCE_ID)?.setData(otherFieldsFeatureCollection());
    map.getSource(OTHER_ROWS_SOURCE_ID)?.setData(otherRowsFeatureCollection());
    whenEditorReady(renderOtherFieldLabels);
  }

  function setActiveFieldLabel(label) {
    currentActiveFieldLabel = String(label ?? '').trim() || 'Campo';
    whenEditorReady(renderActiveFieldLabel);
  }

  function ensureCommittedVisuals() {
    if (!committedGeometry) return;
    updateProjectGeometrySource(committedGeometry);
    updateSideMeasurements(committedGeometry);
    if (map.getLayer(PROJECT_GEOMETRY_LINE_ID)) {
      overlayVisibility.refresh();
      // Moving an already-last layer still emits styledata in MapLibre 4.7.1.
      // Inspect public order so this repair does not invalidate itself forever.
      const order = map.getLayersOrder?.() ?? map.getStyle?.()?.layers?.map(layer => layer.id);
      if (Array.isArray(order) && order.at(-1) !== PROJECT_GEOMETRY_LINE_ID) {
        try { map.moveLayer?.(PROJECT_GEOMETRY_LINE_ID); } catch {}
      }
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
        height: canvas.clientHeight * dpr,
        mode:cadastralLayerMode(map.getZoom?.(), map.getCenter?.()?.lat)
      }),
      coordinates: [[west, north], [east, north], [east, south], [west, south]]
    };
  }

  function cadastralIdentifyRequest(point) {
    const bounds = map.getBounds();
    const canvas = map.getCanvas();
    const clientWidth = Math.max(1, Number(canvas.clientWidth || canvas.width || 1));
    const clientHeight = Math.max(1, Number(canvas.clientHeight || canvas.height || 1));
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const width = Math.min(2048, Math.max(1, Math.round(clientWidth * dpr)));
    const height = Math.min(2048, Math.max(1, Math.round(clientHeight * dpr)));
    return buildCadastralIdentifyUrl({
      west:bounds.getWest(), south:bounds.getSouth(), east:bounds.getEast(), north:bounds.getNorth(),
      width, height,
      x:Number(point?.x) * width / clientWidth,
      y:Number(point?.y) * height / clientHeight
    });
  }

  async function identifyCadastralParcel(point, signal) {
    const response = await fetch(cadastralIdentifyRequest(point), { signal, headers:{ accept:'application/json' } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Cadastral identification unavailable (${response.status})`);
    const result = await response.json();
    return result?.sheet && result?.parcel ? result : null;
  }

  const cadastralOverlay = createCadastralOverlay({
    map,
    requestForViewport:cadastralRequest,
    beforeLayerId:() => map.getLayer(ROWS_LAYER_ID) ? ROWS_LAYER_ID : (map.getLayer(OTHER_ROWS_LAYER_ID) ? OTHER_ROWS_LAYER_ID : (map.getLayer(OTHER_FIELDS_FILL_ID) ? OTHER_FIELDS_FILL_ID : (map.getLayer(PROJECT_GEOMETRY_FILL_ID) ? PROJECT_GEOMETRY_FILL_ID : undefined))),
    onState:onCadastralState
  });

  const cadastralIdentifier = createCadastralDwellIdentifier({
    identify:identifyCadastralParcel,
    onState:onCadastralIdentifyState
  });

  function syncCadastralIdentifier(policy = cadastralOverlay.state()) {
    if (!cadastralVisible) { cadastralIdentifier.setEnabled(false); return; }
    if (!policy?.renderable) {
      cadastralIdentifier.setEnabled(false);
      onCadastralIdentifyState({ status:policy?.error ? 'error' : 'zoom' });
      return;
    }
    cadastralIdentifier.setEnabled(true);
  }

  function setCadastralVisible(visible) {
    cadastralVisible=Boolean(visible);
    const policy=cadastralOverlay.setVisible(cadastralVisible);
    syncCadastralIdentifier(policy);
    return policy;
  }

  function setCadastralOpacity(opacity) {
    cadastralOverlay.setOpacity(opacity);
  }

  function setGeometry(coords) {
    if (!Array.isArray(coords) || coords.length < 4) return false;
    stopVertexEditing();
    clearVertexRemovalMarkers();
    committedGeometry = coords;
    const apply = () => {
      updateProjectGeometrySource(coords);
      map.getSource(EXCLUSIONS_SOURCE_ID)?.setData(exclusionFeatureCollection());
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
    whenEditorReady(apply);
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
    coordinateVersion++;closeCoordinates();
    for (const marker of editMarkers) marker.remove();
    editMarkers = [];
    const wasEditing = vertexEditing;
    vertexEditing = false;
    editingExclusionId = null;
    nativePassageEdit = null;
    editRing = null;
    if (wasEditing) { map.dragPan.enable(); onEditingState({active:false}); }
  }

  function beginExclusionEditing(id) {
    const item = currentExclusions.find(x=>x.id===id);
    if (!item?.geometry) return false;
    let nativeGroup=null,nativeFingerprint=null;
    if(nativePassageFamilyPresent(currentExclusions,id)){
      try{
        if(currentExclusions.filter(member=>member?.id===id).length!==1)throw new Error('Identità del passaggio ambigua.');
        nativeGroup=resolveTerrainExclusionGroups({exclusions:currentExclusions,field:committedGeometry}).groups.find(group=>group.members.some(member=>member.id===id));
        if(!nativeGroup||nativeGroup.owner.surfaceGeometryConvention!=='domain-intersection')throw new Error('Estremi originali del passaggio non disponibili.');
        nativeFingerprint=nativePassageEditFingerprint();
      }catch{onStatus('Il passaggio sul terreno non è verificabile. Ripristina il progetto prima di modificarlo.');return false;}
    }
    if (manualDrawing) cancelManualDrawing();
    stopVertexEditing();
    clearVertexRemovalMarkers();
    editingExclusionId = id;
    editRing = nativeGroup?null:item.geometry.map(p=>[...p]);
    if(nativeGroup)nativePassageEdit={group:nativeGroup,fingerprint:nativeFingerprint};
    vertexEditing = true;
    draw?.deleteAll({silent:true});
    if (allowPanWhileEditing()) map.dragPan.enable();
    else map.dragPan.disable();
    onEditingState({active:true, exclusionId:id});
    renderEditHandles();
    onStatus(nativeGroup?'Modifica gli estremi A e B del passaggio sul terreno.':'Modifica zona esclusa: trascina i vertici o aggiungi punti con +. Poi “Fine modifica”.');
    return true;
  }

  function publishEditRing() {
    if(editingExclusionId!==null&&nativePassageFamilyPresent(currentExclusions,editingExclusionId)){
      const target=currentExclusions.find(item=>item.id===editingExclusionId);
      if(JSON.stringify(editRing)!==JSON.stringify(target?.geometry))onStatus('Modifica il passaggio sul terreno tramite gli estremi A e B.');
      return;
    }
    const ring = editRing.map(p=>[...p]);
    if (editingExclusionId !== null) {
      const target=currentExclusions.find(item=>item.id===editingExclusionId);
      currentExclusions = reshapeExclusion(currentExclusions,editingExclusionId,ring);
      map.getSource(EXCLUSIONS_SOURCE_ID)?.setData(exclusionFeatureCollection());
      if(target?.sourceAxis&&target.passageGroupId)onExclusionsReplace(currentExclusions);
      else onExclusionChange(editingExclusionId,ring,{type:'area',widthM:null,sourceAxis:null});
    } else {
      committedGeometry = ring;
      updateProjectGeometrySource(ring);
      updateSideMeasurements(ring);
      renderActiveFieldLabel();
      onGeometryChange(ring);
    }
  }

  function renderEditHandles() {
    coordinateVersion++;closeCoordinates();
    for (const marker of editMarkers) marker.remove();
    editMarkers = [];
    if(vertexEditing&&nativePassageEdit){
      if(!nativePassageEditCurrent()){stopVertexEditing();return;}
      const editingId=editingExclusionId,baseline=nativePassageEdit;
      baseline.group.owner.sourceAxis.forEach((point,index)=>{
        const element=document.createElement('button');element.type='button';element.className='passage-endpoint-handle';element.textContent=index===0?'A':'B';element.setAttribute('aria-label',`Coordinate estremo ${index===0?'iniziale':'finale'} del passaggio`);
        element.addEventListener('click',event=>{
          event.preventDefault?.();event.stopPropagation?.();
          if(nativePassageEdit!==baseline||!nativePassageEditCurrent()){stopVertexEditing();return;}
          offerCoordinates(element,point,`Coordinate estremo ${index===0?'A':'B'}`,async(coordinate,{signal,dismissSignal})=>{
            if(signal.aborted||nativePassageEdit!==baseline||!nativePassageEditCurrent())throw new Error('Il contesto del passaggio è cambiato.');
            if(typeof onNativePassageEndpointRequest!=='function')throw new Error('Il ricalcolo del passaggio non è disponibile.');
            const result=await onNativePassageEndpointRequest({exclusionId:editingId,endpointIndex:index,coordinate:[...coordinate]},{signal,dismissSignal});
            if(result!==true&&result?.ok!==true)throw new Error('Non è stato possibile aggiornare il passaggio sul terreno.');
            return result;
          },()=>nativePassageEdit===baseline&&nativePassageEditCurrent(),true);
        });
        editMarkers.push(new globalThis.maplibregl.Marker({element}).setLngLat(point).addTo(map));
      });
      return;
    }
    if (!vertexEditing || !editRing) return;
    const points = editRing.slice(0,-1);
    points.forEach((point,index)=>{
      const element = document.createElement('button');
      element.type='button'; element.className='vertex-edit-handle';
      element.setAttribute('aria-label', `Sposta punto ${index+1}`);
      element.textContent=String(index+1);
      const marker = new globalThis.maplibregl.Marker({element,draggable:true}).setLngLat(point).addTo(map);
      let dragUntil=0,pointerStart=null,pointerMoved=false;const version=coordinateVersion;
      element.addEventListener('pointerdown',event=>{pointerStart=[event.clientX,event.clientY];pointerMoved=false;});
      element.addEventListener('pointermove',event=>{if(pointerStart&&Math.hypot(event.clientX-pointerStart[0],event.clientY-pointerStart[1])>5)pointerMoved=true;});
      marker.on('dragstart',()=>{dragUntil=Infinity;closeCoordinates();});
      element.addEventListener('click',event=>{event.preventDefault?.();event.stopPropagation?.();if(!vertexEditing||version!==coordinateVersion||pointerMoved||Date.now()<dragUntil)return;offerCoordinates(element,point,`Coordinate punto ${index+1}`,coordinate=>{editRing=replaceRingVertex(editRing,index,coordinate);publishEditRing();renderEditHandles();});});
      marker.on('dragend',()=>{
        dragUntil=Date.now()+350;
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
    const passage=currentExclusions.find(item=>item.id===editingExclusionId);
    if(passage?.passageGroupId&&Array.isArray(passage.sourceAxis)&&passage.sourceAxis.length===2){
      passage.sourceAxis.forEach((point,index)=>{
        const element=document.createElement('button');element.type='button';element.className='passage-endpoint-handle';element.textContent=index===0?'A':'B';element.setAttribute('aria-label',`Coordinate estremo ${index===0?'iniziale':'finale'} del passaggio`);
        element.addEventListener('click',event=>{event.preventDefault?.();event.stopPropagation?.();offerCoordinates(element,point,`Coordinate estremo ${index===0?'A':'B'}`,coordinate=>{
          const next=regeneratePassage({exclusions:currentExclusions,id:editingExclusionId,endpointIndex:index,coordinate,field:committedGeometry});
          const selected=next.find(item=>item.id===editingExclusionId)??next.find(item=>item.passageGroupId===passage.passageGroupId);
          currentExclusions=next;editingExclusionId=selected.id;editRing=selected.geometry.map(p=>[...p]);
          map.getSource(EXCLUSIONS_SOURCE_ID)?.setData(exclusionFeatureCollection());onExclusionsReplace(next);renderEditHandles();
        });});
        editMarkers.push(new globalThis.maplibregl.Marker({element}).setLngLat(point).addTo(map));
      });
    }
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
    vertexRemovalActive = true;
    onVertexRemovalState({active:true});
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

  function finishVertexRemoval() {
    if (!vertexRemovalActive) return false;
    clearVertexRemovalMarkers();
    onStatus('Modifica dei punti conclusa.');
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
    savedRows=Array.isArray(rows)?rows:[];
    const source = map.getSource(ROWS_SOURCE_ID);
    source?.setData(rowsToFeatureCollection(terrainProposalPreview?[]:savedRows));
  }

  function refreshTerrainPreviewVisibility(){
    const visibility=overlayVisibility.state();
    for(const [id,key] of [[TERRAIN_PREVIEW_ROWS_LAYER_ID,'schema'],[TERRAIN_PREVIEW_CUT_FILL_ID,'field'],[TERRAIN_PREVIEW_CUT_LINE_ID,'field']]){
      const layer=map.getLayer(id);if(!layer)continue;
      const value=!terrainSceneActive&&visibility[key]?'visible':'none',current=map.getLayoutProperty?.(id,'visibility')??layer.layout?.visibility??'visible';
      if(current!==value)map.setLayoutProperty?.(id,'visibility',value);
    }
  }
  function setTerrainProposalPreview(proposal){
    if(proposal==null&&terrainProposalPreview===null)return true;
    let candidate=null;
    if(proposal!=null){
      if(proposal.ok!==true||!Array.isArray(proposal.result?.rows))return false;
      let cut=emptyCollection();
      if(proposal.kind==='cut'){
        const exclusions=proposal.projectPatch?.exclusions,groupId=proposal.cutOperation?.groupId;
        if(!Array.isArray(exclusions)||typeof groupId!=='string')return false;
        const resolved=mapTerrainExclusionFeatures({exclusions,field:committedGeometry});
        if(resolved.status!=='ready')return false;
        cut={type:'FeatureCollection',features:resolved.featureCollection.features.filter(feature=>feature.properties.groupId===groupId)};
        if(!cut.features.length)return false;
      }
      candidate={rows:rowsToFeatureCollection(proposal.result.rows),cut};
    }
    terrainProposalPreview=candidate;
    whenEditorReady(()=>{
      map.getSource(ROWS_SOURCE_ID)?.setData(rowsToFeatureCollection(terrainProposalPreview?[]:savedRows));
      map.getSource(TERRAIN_PREVIEW_ROWS_SOURCE_ID)?.setData(terrainProposalPreview?.rows??emptyCollection());
      map.getSource(TERRAIN_PREVIEW_CUT_SOURCE_ID)?.setData(terrainProposalPreview?.cut??emptyCollection());
      refreshTerrainPreviewVisibility();
    });
    return true;
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

  map.on('mousemove', (event) => {
    if (cadastralVisible && cadastralOverlay.state().renderable) cadastralIdentifier.pointerMoved(event?.point);
  });
  map.on('movestart', () => cadastralIdentifier.cancel());
  map.getCanvas()?.addEventListener?.('pointerleave', () => cadastralIdentifier.cancel());
  map.on('moveend', () => { const policy=cadastralOverlay.refresh();syncCadastralIdentifier(policy);ensureCommittedVisuals();onDraftChange(); });
  map.on('resize', () => { const policy=cadastralOverlay.refresh();syncCadastralIdentifier(policy);ensureCommittedVisuals(); });
  map.on('styledata', ensureCommittedVisuals);
  map.on('styledata',refreshTerrainPreviewVisibility);
  map.on('idle', ensureCommittedVisuals);

  function locate() {
    return new Promise((resolve, reject) => {
      if (globalThis.isSecureContext === false) {
        const error = new Error('Per usare il GPS apri il configuratore tramite HTTPS. Il browser non concede la posizione su un sito non sicuro.');
        onStatus(error.message);
        reject(error);
        return;
      }
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
          ? 'Permesso posizione negato dal dispositivo o dal browser. Abilita la posizione per questo sito nelle impostazioni e riprova.'
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
    manualVertices.pop(); manualHover=null; renderManualDraft(); emitDrawingState();onDraftChange();
    onStatus('Ultimo punto rimosso. Puoi continuare a disegnare.');
  }
  function updateTerrainAnnotations(){
    if(!terrainSceneActive||!terrainProjector)return;
    fieldLabelOverlay?.update();
    for(const marker of sideMeasurementMarkers){
      const coordinate=marker.getLngLat(),point=[coordinate.lng,coordinate.lat],projected=terrainProjector(point),flat=map.project(point);
      if(projected&&Number.isFinite(projected.x)&&Number.isFinite(projected.y))marker.setOffset?.([projected.x-flat.x,projected.y-flat.y]);
      else marker.setOffset?.([0,0]);
    }
  }
  map.on('render',updateTerrainAnnotations);
  function setTerrainSceneActive(active,projector=null){
    terrainSceneActive=Boolean(active);terrainProjector=terrainSceneActive?projector:null;
    fieldLabelOverlay?.setProjector(terrainProjector);overlayVisibility.setSceneActive(terrainSceneActive);refreshTerrainPreviewVisibility();
    if(!terrainSceneActive)for(const marker of sideMeasurementMarkers)marker.setOffset?.([0,0]);
    else updateTerrainAnnotations();
    map.triggerRepaint?.();
  }
  function getTerrainSceneSnapshot({exclusions=currentExclusions,rowPortions:portions=rowPortions.portions}={}){
    // A drawn passage may extend beyond the acquired field. Clip only its
    // presentation to the field; project inputs and verified calculations remain unchanged.
    const collection=exclusionFeatureCollection(exclusions);
    const features=collection.features.flatMap(feature=>{
      if(!committedGeometry)return [];
      const polygon=feature.geometry.type==='MultiPolygon'?feature.geometry.coordinates:[feature.geometry.coordinates];
      const clipped=polygonClipping.intersection(polygon,[committedGeometry]);
      return clipped.length?[{...feature,geometry:{type:'MultiPolygon',coordinates:clipped}}]:[];
    });
    return structuredClone({geometry:committedGeometry,rows:savedRows,exclusions:{type:'FeatureCollection',features},rowPortions:portions.map(({id,geometry})=>({id,geometry}))});
  }
  function capturePendingEdit(){
    const camera=map.getCenter&&map.getZoom?gesturePolicy.cameraForCheckpoint():null;
    return {drawing:manualDrawing,mode:manualMode,vertices:manualVertices.map(point=>[...point]),previousPerimeter:previousPerimeter?.map(point=>[...point])??null,
      vertexEditing,editingExclusionId,editRing:editRing?.map(point=>[...point])??null,...(nativePassageEdit?{nativePassageEditing:true}:{}),vertexRemovalActive,curveEditing:rowCurveEditor.active,
      camera:camera&&Number.isFinite(camera.zoom)?{center:[...camera.center],zoom:camera.zoom,bearing:camera.bearing??0}:null};
  }
  function restorePendingEdit(snapshot){
    if(!snapshot||typeof snapshot!=='object')return false;
    const validPoint=point=>Array.isArray(point)&&point.length===2&&Number.isFinite(point[0])&&Number.isFinite(point[1])&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90;
    const validRing=ring=>ring==null||Array.isArray(ring)&&ring.length<=5000&&ring.every(validPoint);
    if(!validRing(snapshot.vertices)||!validRing(snapshot.previousPerimeter)||!validRing(snapshot.editRing)||!['perimeter','exclusion','linear-exclusion'].includes(snapshot.mode))return false;
    if(snapshot.drawing){
      manualMode=snapshot.mode;previousPerimeter=snapshot.previousPerimeter??null;
      if(manualMode==='perimeter'){committedGeometry=null;updateProjectGeometrySource(null);updateSideMeasurements(null);}
      manualVertices=snapshot.vertices.map(point=>[...point]);manualHover=null;suspendDrawEditing();renderManualDraft();setDrawingActive(true);
    }else if(snapshot.vertexEditing&&snapshot.editingExclusionId&&nativePassageFamilyPresent(currentExclusions,snapshot.editingExclusionId)){
      if(snapshot.nativePassageEditing!==true||snapshot.editRing!==null)return false;
      if(!beginExclusionEditing(snapshot.editingExclusionId))return false;
    }else if(snapshot.vertexEditing&&Array.isArray(snapshot.editRing)&&snapshot.editRing.length>=4){
      const started=snapshot.editingExclusionId?beginExclusionEditing(snapshot.editingExclusionId):beginVertexEditing();
      if(started){editRing=snapshot.editRing.map(point=>[...point]);renderEditHandles();}
    }else if(snapshot.vertexRemovalActive)beginVertexRemoval();
    if(snapshot.curveEditing)setRowCurveEditor({...rowCurveEditor,active:true});
    if(snapshot.camera&&validPoint(snapshot.camera.center)&&Number.isFinite(snapshot.camera.zoom)&&Number.isFinite(snapshot.camera.bearing))
      map.jumpTo?.({center:snapshot.camera.center,zoom:snapshot.camera.zoom,bearing:snapshot.camera.bearing});
    return true;
  }
  return { map, draw, gesturePolicy, terrainControl, getTerrainSceneSnapshot,setTerrainSceneActive, setOverlayVisibility:next=>{const state=overlayVisibility.set(next);refreshTerrainPreviewVisibility();return state;}, getOverlayVisibility:overlayVisibility.state, whenEditorReady, stopTools, undoDrawPoint, beginDraw, beginExclusionDraw, beginLinearExclusionDraw, finishDraw:finishManualPolygon, clearGeometry, beginVertexEditing, finishVertexEditing, beginExclusionEditing, beginVertexRemoval, finishVertexRemoval, removeSelectedVertex, setGeometry, setExclusions, setOtherFields, setActiveFieldLabel, setRowPortions, setRowCurveEditor, finishRowCurveEditing, focusActiveField, focusAllFields, setBaseMap, setRows, setTerrainProposalPreview, search, searchSuggestion, suggest, locate, rotateBy, resetNorth, setCadastralVisible, setCadastralOpacity, capturePendingEdit, restorePendingEdit };
}
