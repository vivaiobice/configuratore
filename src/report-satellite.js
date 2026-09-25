import {satelliteStyle,SATELLITE_ATTRIBUTION} from './satellite-style.js?v=51';

const ATTRIBUTION = SATELLITE_ATTRIBUTION;

export class SatelliteCaptureError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'SatelliteCaptureError';
    this.code = code;
  }
}

function sizeOf(container) {
  const rectangle = container?.getBoundingClientRect?.();
  return {
    width: Number(container?.clientWidth ?? rectangle?.width ?? 0),
    height: Number(container?.clientHeight ?? rectangle?.height ?? 0)
  };
}

function waitForIdle(map, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new SatelliteCaptureError('timeout', 'La mappa satellitare non ha terminato il caricamento in tempo.')), Math.max(1, Number(timeoutMs) || 15000));
    try {
      map.once('idle', () => {
        clearTimeout(timer);
        resolve();
      });
    } catch (error) {
      clearTimeout(timer);
      reject(new SatelliteCaptureError('unavailable', 'Il motore cartografico non è disponibile.', error));
    }
  });
}

function overlayForCapture(map, model, width, height) {
  if (!model.geo || typeof map.project !== 'function') return null;
  const pixel = (coordinates) => {
    const point = map.project(coordinates);
    return [point.x, point.y];
  };
  return {
    valid:true,width,height,
    polygon:model.geo.polygon.map(pixel),
    rows:model.geo.rows.map((row)=>({...row,coordinates:row.coordinates.map(pixel)})),
    exclusions:model.geo.exclusions.map((area)=>({...area,points:area.points.map(pixel)})),
    sideMeasurements:model.geo.sideMeasurements.map((side)=>({...side,point:pixel(side.point)}))
  };
}

function addGeoreferencedDesign(map, model) {
  const geo = model.geo;
  if (!geo?.polygon?.length) return;
  const feature = (geometry) => ({ type:'Feature', properties:{}, geometry });
  const collection = (features) => ({ type:'FeatureCollection', features });
  map.addSource('project-parcel', {type:'geojson', data:feature({type:'Polygon',coordinates:[geo.polygon]})});
  map.addLayer({id:'project-parcel-fill',type:'fill',source:'project-parcel',paint:{'fill-color':'#f7f4cd','fill-opacity':.06}});
  map.addLayer({id:'project-parcel-line',type:'line',source:'project-parcel',paint:{'line-color':'#f7f4cd','line-width':2.3}});
  const rows=geo.rows.filter(row=>row.coordinates.length>=2).map(row=>feature({type:'LineString',coordinates:row.coordinates}));
  map.addSource('project-rows', {type:'geojson',data:collection(rows)});
  map.addLayer({id:'project-rows-line',type:'line',source:'project-rows',paint:{'line-color':'#fffbd4','line-width':1.65,'line-opacity':.96}});
  const exclusions=geo.exclusions.filter(area=>area.points.length>=4).map(area=>feature({type:'Polygon',coordinates:[area.points]}));
  if(exclusions.length){
    map.addSource('project-exclusions',{type:'geojson',data:collection(exclusions)});
    map.addLayer({id:'project-exclusions-fill',type:'fill',source:'project-exclusions',paint:{'fill-color':'#bc6c56','fill-opacity':.22}});
    map.addLayer({id:'project-exclusions-line',type:'line',source:'project-exclusions',paint:{'line-color':'#ffd6cb','line-width':1.8}});
  }
}

function labelledImage(map, model, width, height, documentRef) {
  const source=map.getCanvas();
  const canvas=documentRef?.createElement?.('canvas');
  const context=canvas?.getContext?.('2d');
  if(!context || !model.geo?.sideMeasurements?.length)return source.toDataURL('image/png');
  canvas.width=source.width||width;
  canvas.height=source.height||height;
  context.drawImage(source,0,0,canvas.width,canvas.height);
  context.scale(canvas.width/width,canvas.height/height);
  context.font='bold 16px Arial, sans-serif';
  context.textAlign='center';context.textBaseline='middle';
  for(const side of model.geo.sideMeasurements){
    const {x,y}=map.project(side.point),label=String(side.label);
    const boxWidth=context.measureText(label).width+26;
    context.fillStyle='#fff';context.strokeStyle='#cbd5cc';context.lineWidth=1;
    context.beginPath();
    if(typeof context.roundRect==='function')context.roundRect(x-boxWidth/2,y-15,boxWidth,30,15);
    else context.rect(x-boxWidth/2,y-15,boxWidth,30);
    context.fill();context.stroke();
    context.fillStyle='#183f28';context.fillText(label,x,y+1);
  }
  return canvas.toDataURL('image/png');
}

export async function captureSatelliteImage({ container, maplibregl, mapModel, timeoutMs = 15000, documentRef = globalThis.document } = {}) {
  if (!maplibregl || typeof maplibregl.Map !== 'function' || !container || !mapModel?.valid || !Array.isArray(mapModel.captureBounds) || mapModel.captureBounds.length !== 2) {
    throw new SatelliteCaptureError('unavailable', 'La cattura satellitare non è disponibile.');
  }
  const { width, height } = sizeOf(container);
  if (!(width > 0) || !(height > 0)) throw new SatelliteCaptureError('empty', 'Lo spazio destinato alla mappa satellitare è vuoto.');

  let map;
  try {
    map = new maplibregl.Map({
      container,
      style: satelliteStyle(),
      center: [0, 0],
      zoom: 1,
      interactive: false,
      attributionControl: false,
      preserveDrawingBuffer: true,
      fadeDuration: 0
    });
    map.resize?.();
    map.fitBounds(mapModel.captureBounds, { padding: 0, duration: 0 });
    await waitForIdle(map, timeoutMs);
    if(mapModel.geo?.polygon?.length){
      addGeoreferencedDesign(map,mapModel);
      await waitForIdle(map,timeoutMs);
    }
    let dataUrl;
    try {
      dataUrl = labelledImage(map,mapModel,width,height,documentRef);
    } catch (error) {
      const isSecurityError = error?.name === 'SecurityError' || /insecure|tainted|cross-origin/i.test(String(error?.message ?? ''));
      throw new SatelliteCaptureError(isSecurityError ? 'cors' : 'unavailable', isSecurityError ? 'Le immagini satellitari non consentono la stampa da questo browser.' : 'Impossibile acquisire la mappa satellitare.', error);
    }
    if (!/^data:image\/png;base64,.+/i.test(String(dataUrl))) {
      throw new SatelliteCaptureError('empty', 'La mappa satellitare acquisita è vuota.');
    }
    return { dataUrl, attribution: ATTRIBUTION, overlayModel:overlayForCapture(map,mapModel,width,height) };
  } catch (error) {
    if (error instanceof SatelliteCaptureError) throw error;
    throw new SatelliteCaptureError('unavailable', 'Impossibile inizializzare la mappa satellitare.', error);
  } finally {
    try { map?.remove?.(); } catch { /* cleanup is best effort */ }
  }
}
