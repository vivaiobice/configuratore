import {buildCadastralWmsUrl} from './cadastre.js';
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
  if (!model.geo || model.geo.fields || typeof map.project !== 'function') return null;
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
  if(geo?.fields){geo.fields.forEach((field,index)=>addOverviewField(map,field,index));return;}
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

function addOverviewField(map,field,index){
 const prefix=`overview-${index}`;
 const feature=(geometry)=>({type:'Feature',properties:{},geometry});
 map.addSource(prefix,{type:'geojson',data:feature({type:'Polygon',coordinates:[field.polygon]})});
 map.addLayer({id:`${prefix}-fill`,type:'fill',source:prefix,paint:{'fill-color':field.color,'fill-opacity':.12}});
 map.addLayer({id:`${prefix}-line`,type:'line',source:prefix,paint:{'line-color':field.color,'line-width':3}});
 map.addSource(`${prefix}-rows`,{type:'geojson',data:{type:'FeatureCollection',features:field.rows.map(row=>feature({type:'LineString',coordinates:row.coordinates}))}});
 map.addLayer({id:`${prefix}-rows`,type:'line',source:`${prefix}-rows`,paint:{'line-color':field.color,'line-width':1.5}});
 if(field.exclusions.length){map.addSource(`${prefix}-exclusions`,{type:'geojson',data:{type:'FeatureCollection',features:field.exclusions.map(area=>feature({type:'Polygon',coordinates:[area.points]}))}});map.addLayer({id:`${prefix}-exclusions`,type:'fill',source:`${prefix}-exclusions`,paint:{'fill-color':'#bc6c56','fill-opacity':.4}});}
}

async function addCadastralImage(map,model,width,height,timeoutMs){
 const bounds=map.getBounds?.();
 const [[west,south],[east,north]]=bounds?[[bounds.getWest(),bounds.getSouth()],[bounds.getEast(),bounds.getNorth()]]:model.captureBounds;
 const url=buildCadastralWmsUrl({west,south,east,north,width,height});
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
 let objectUrl;
 try{
  const response=await fetch(url,{signal:controller.signal});if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw new Error('Catasto non disponibile');
  const blob=await response.blob();objectUrl=URL.createObjectURL(blob);
  map.addSource('overview-cadastre',{type:'image',url:objectUrl,coordinates:[[west,north],[east,north],[east,south],[west,south]]});
  map.addLayer({id:'overview-cadastre',type:'raster',source:'overview-cadastre',paint:{'raster-opacity':.6,'raster-fade-duration':0}});
  await waitForIdle(map,timeoutMs);
  if(typeof map.isSourceLoaded==='function'&&!map.isSourceLoaded('overview-cadastre'))throw new Error('Livello catastale non caricato');
  return objectUrl;
 }catch(error){if(objectUrl)URL.revokeObjectURL(objectUrl);throw new SatelliteCaptureError('cadastre','Il livello Catasto non è disponibile. Riprova oppure disattivalo per generare il documento.',error);}
 finally{clearTimeout(timer);}
}

function labelledImage(map, model, width, height, documentRef) {
  const source=map.getCanvas();
  const canvas=documentRef?.createElement?.('canvas');
  const context=canvas?.getContext?.('2d');
  if(!context || (!model.geo?.sideMeasurements?.length&&!model.geo?.fields?.length))return source.toDataURL('image/png');
  canvas.width=source.width||width;
  canvas.height=source.height||height;
  context.drawImage(source,0,0,canvas.width,canvas.height);
  context.scale(canvas.width/width,canvas.height/height);
  context.font='bold 16px Arial, sans-serif';
  context.textAlign='center';context.textBaseline='middle';
  const placed=[];
  const labels=model.geo.fields?.map(field=>({point:field.labelPoint,label:field.label,color:field.color}))??model.geo.sideMeasurements;
  for(const side of labels){
    const projected=map.project(side.point),label=String(side.label);
    const boxWidth=context.measureText(label).width+26;
    const x=Math.max(boxWidth/2+4,Math.min(width-boxWidth/2-4,projected.x));let y=projected.y;
    while(placed.some(box=>Math.abs(box.x-x)<(box.width+boxWidth)/2+4&&Math.abs(box.y-y)<34))y+=35;
    y=Math.max(18,Math.min(height-18,y));placed.push({x,y,width:boxWidth});
    if(side.color){context.strokeStyle=side.color;context.lineWidth=2;context.beginPath();context.moveTo(projected.x,projected.y);context.lineTo(x,y);context.stroke();}
    context.fillStyle='#fff';context.strokeStyle='#cbd5cc';context.lineWidth=1;
    context.beginPath();
    if(typeof context.roundRect==='function')context.roundRect(x-boxWidth/2,y-15,boxWidth,30,15);
    else context.rect(x-boxWidth/2,y-15,boxWidth,30);
    context.fill();context.stroke();
    context.fillStyle='#183f28';context.fillText(label,x,y+1);
  }
  return canvas.toDataURL('image/png');
}

export async function captureSatelliteImage({ container, maplibregl, mapModel, cadastre=false, timeoutMs = 15000, documentRef = globalThis.document } = {}) {
  if (!maplibregl || typeof maplibregl.Map !== 'function' || !container || !mapModel?.valid || !Array.isArray(mapModel.captureBounds) || mapModel.captureBounds.length !== 2) {
    throw new SatelliteCaptureError('unavailable', 'La cattura satellitare non è disponibile.');
  }
  const { width, height } = sizeOf(container);
  if (!(width > 0) || !(height > 0)) throw new SatelliteCaptureError('empty', 'Lo spazio destinato alla mappa satellitare è vuoto.');

  let map,cadastralObjectUrl;
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
    if(cadastre)cadastralObjectUrl=await addCadastralImage(map,mapModel,width,height,timeoutMs);
    if(mapModel.geo?.polygon?.length||mapModel.geo?.fields?.length){
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
    return { dataUrl, attribution: ATTRIBUTION+(cadastre?' · Catasto © Agenzia delle Entrate, CC BY 4.0':''), overlayModel:overlayForCapture(map,mapModel,width,height) };
  } catch (error) {
    if (error instanceof SatelliteCaptureError) throw error;
    throw new SatelliteCaptureError('unavailable', 'Impossibile inizializzare la mappa satellitare.', error);
  } finally {
    if(cadastralObjectUrl)URL.revokeObjectURL(cadastralObjectUrl);
    try { map?.remove?.(); } catch { /* cleanup is best effort */ }
  }
}
