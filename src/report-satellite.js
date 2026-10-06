import {buildCadastralWmsUrl} from './cadastre.js?v=1.3.1-prova.1';
import {satelliteStyle,SATELLITE_ATTRIBUTION} from './satellite-style.js?v=51';

const ATTRIBUTION = SATELLITE_ATTRIBUTION;

function closedPolygon(points = []) {
  const ring=points.filter(point=>Array.isArray(point)&&point.every(Number.isFinite));
  return ring.length>1&&ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1]?ring.slice(0,-1):ring;
}

function insidePolygon([x,y],polygon){
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [ax,ay]=polygon[i],[bx,by]=polygon[j];
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
  }
  return inside;
}

function intersectsSegments(a,b,c,d){
  const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  const on=(p,q,r)=>Math.abs(cross(p,q,r))<1e-7&&r[0]>=Math.min(p[0],q[0])-1e-7&&r[0]<=Math.max(p[0],q[0])+1e-7&&r[1]>=Math.min(p[1],q[1])-1e-7&&r[1]<=Math.max(p[1],q[1])+1e-7;
  return (cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
}

function boxCorners(box,gap=0){
  const {x,y,width,height}=box;
  return [[x-gap,y-gap],[x+width+gap,y-gap],[x+width+gap,y+height+gap],[x-gap,y+height+gap]];
}

function lineHitsBox(start,end,box,gap=0){
  const corners=boxCorners(box,gap);
  return insidePolygon(start,corners)||insidePolygon(end,corners)||corners.some((corner,index)=>intersectsSegments(start,end,corner,corners[(index+1)%4]));
}

function boxHitsPolygon(box,polygon){
  const corners=boxCorners(box,3);
  return corners.some(point=>insidePolygon(point,polygon))||polygon.some(point=>insidePolygon(point,corners))||polygon.some((point,index)=>lineHitsBox(point,polygon[(index+1)%polygon.length],box,3));
}

function boxesOverlap(a,b){
  return a.x<b.x+b.width+3&&b.x<a.x+a.width+3&&a.y<b.y+b.height+3&&b.y<a.y+a.height+3;
}

function boundaryPoint(anchor,center,box){
  const dx=anchor[0]-center[0],dy=anchor[1]-center[1];
  const ratio=Math.min(dx?box.width/2/Math.abs(dx):Infinity,dy?box.height/2/Math.abs(dy):Infinity);
  return [center[0]+dx*ratio,center[1]+dy*ratio];
}

function polygonEdges(polygon){
  const area=polygon.reduce((sum,start,index)=>{const end=polygon[(index+1)%polygon.length];return sum+start[0]*end[1]-end[0]*start[1];},0);
  return polygon.map((start,index)=>{
    const end=polygon[(index+1)%polygon.length],dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy)||1;
    return {anchor:[(start[0]+end[0])/2,(start[1]+end[1])/2],normal:area>=0?[dy/length,-dx/length]:[-dy/length,dx/length],tangent:[dx/length,dy/length]};
  });
}

function labelLines(label,measure,maxWidth){
  const lines=[];
  for(const word of String(label??'').split(/\s+/)){
    const last=lines.at(-1),candidate=last?`${last} ${word}`:word;
    if(last&&measure(candidate)>maxWidth)lines.push(word);else if(last)lines[lines.length-1]=candidate;else lines.push(word);
  }
  return lines.length?lines:[''];
}

// Layout uses the capture map's CSS-pixel projection. The same annotated PNG is
// embedded in the generator preview and downloaded PDF, including Catasto.
export function layoutSatelliteAnnotations({polygon=[],sideMeasurements=[],fields,width=1000,height=650,measureText,fontSize:requestedFontSize,leaderGap=24,reservedBoxes=[],compact=false}={}){
  const overview=Array.isArray(fields),fontSize=requestedFontSize??(overview?16:13);
  const measure=(label)=>measureText?measureText(label,fontSize):String(label).length*fontSize*.62;
  const polygons=(overview?fields.map(field=>field.polygon):[polygon]).map(closedPolygon);
  const requests=overview?fields:sideMeasurements;
  const placed=[];
  for(let index=0;index<requests.length;index++){
    const request=requests[index],own=polygons[overview?index:0],edges=polygonEdges(own);
    if(!edges.length)continue;
    const lines=labelLines(request.label,measure,overview?Math.min(240,width*.3):width-24);
    const boxWidth=Math.max(32,...lines.map(measure))+12,boxHeight=lines.length*(fontSize+2)+6;
    const relevant=overview?edges:[edges[index%edges.length]];
    const preferred=request.labelPoint??request.point??relevant[0].anchor;
    const candidates=[];
    for(const edge of relevant){
      const anchor=edge.anchor;
      for(const distance of (compact?[0,8,16,24,36,52,76,112,160,224,320,-8]:[0,12,28,48,76,112,160,224,320,-16])){
        for(const tangentOffset of (compact?[0,-12,12,-24,24,-36,36,-48,48,-72,72,-96,96,-132,132,-180,180,-240,240]:[0,-18,18,-36,36,-64,64,-100,100,-160,160])){
          const offset=leaderGap+Math.abs(edge.normal[0])*boxWidth/2+Math.abs(edge.normal[1])*boxHeight/2+distance;
          const center=[anchor[0]+edge.normal[0]*offset+edge.tangent[0]*tangentOffset,anchor[1]+edge.normal[1]*offset+edge.tangent[1]*tangentOffset];
          candidates.push({center,anchor,score:Math.hypot(center[0]-preferred[0],center[1]-preferred[1])+Math.abs(tangentOffset)*.2+(distance<0?120:0)});
        }
      }
    }
    const acceptable=({center,anchor},{clearLeaders=true,clearFields=true}={})=>{
      const box={x:center[0]-boxWidth/2,y:center[1]-boxHeight/2,width:boxWidth,height:boxHeight};
      if(box.x<4||box.y<4||box.x+boxWidth>width-4||box.y+boxHeight>height-4||polygons.some(ring=>boxHitsPolygon(box,ring))||placed.some(item=>boxesOverlap(box,item.box))||reservedBoxes.some(item=>boxesOverlap(box,item)))return null;
      const end=boundaryPoint(anchor,center,box),leader=[anchor,end];
      // Start just outside the projected edge and prefer routes clear of fields.
      const start=anchor.map((value,i)=>value+(end[i]-value)*.001);
      const leaderPolygons=clearFields?polygons:[own];
      if(Math.hypot(end[0]-anchor[0],end[1]-anchor[1])<4||leaderPolygons.some(ring=>insidePolygon(start,ring)||insidePolygon(end,ring)||ring.some((point,i)=>intersectsSegments(start,end,point,ring[(i+1)%ring.length]))))return null;
      if(clearLeaders&&placed.some(item=>lineHitsBox(anchor,end,item.box,2)||lineHitsBox(...item.leader,box,2)))return null;
      return {id:request.id??index,label:String(request.label??''),color:request.color,lines,fontSize,box,point:center,anchor,leader};
    };
    candidates.sort((a,b)=>a.score-b.score);
    let selected;
    for(const candidate of candidates){selected=acceptable(candidate);if(selected)break;}
    if(!selected&&!overview)for(const candidate of candidates){selected=acceptable(candidate,{clearLeaders:false});if(selected)break;}
    // A surrounded field can require a leader across neighboring fields. The tag
    // still stays outside every polygon and the leader ends on its own perimeter.
    if(!selected&&overview)for(const candidate of candidates){selected=acceptable(candidate,{clearFields:false});if(selected)break;}
    if(!selected)throw new SatelliteCaptureError('annotations','Impossibile disporre tutte le quote e le etichette senza sovrapposizioni nella vista satellitare.');
    placed.push(selected);
  }
  return placed;
}

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
  if(!context || (!model.geo?.sideMeasurements?.length&&!model.geo?.fields?.length))return {dataUrl:source.toDataURL('image/png'),annotations:[]};
  canvas.width=source.width||width;
  canvas.height=source.height||height;
  context.drawImage(source,0,0,canvas.width,canvas.height);
  context.scale(canvas.width/width,canvas.height/height);
  const pixel=point=>{const projected=map.project(point);return [projected.x,projected.y];};
  const annotations=layoutSatelliteAnnotations({
    width,height,
    polygon:model.geo.polygon?.map(pixel),
    sideMeasurements:model.geo.sideMeasurements?.map(side=>({...side,point:pixel(side.point)})),
    fields:model.geo.fields?.map(field=>({...field,polygon:field.polygon.map(pixel),labelPoint:field.labelPoint?pixel(field.labelPoint):undefined})),
    measureText(label,fontSize){context.font=`bold ${fontSize}px Arial, sans-serif`;return context.measureText(label).width;}
  });
  context.textAlign='center';context.textBaseline='middle';
  // All leaders are painted beneath opaque labels so dense dimensions never
  // obscure another quote. Names retain a clear connection to their own field.
  for(const annotation of annotations){
    const [start,end]=annotation.leader;
    context.beginPath();context.moveTo(...start);context.lineTo(...end);
    context.strokeStyle='#fff';context.lineWidth=annotation.color?4:3;context.stroke();
    context.strokeStyle=annotation.color??'#183f28';context.lineWidth=annotation.color?2:1;context.stroke();
  }
  for(const annotation of annotations){
    const {box,point:[x,y],lines,fontSize}=annotation;
    context.fillStyle='#fff';context.strokeStyle=annotation.color??'#cbd5cc';context.lineWidth=1;
    context.beginPath();
    if(typeof context.roundRect==='function')context.roundRect(box.x,box.y,box.width,box.height,5);
    else context.rect(box.x,box.y,box.width,box.height);
    context.fill();context.stroke();
    context.font=`bold ${fontSize}px Arial, sans-serif`;context.fillStyle='#183f28';
    lines.forEach((line,index)=>context.fillText(line,x,y+(index-(lines.length-1)/2)*(fontSize+2)));
  }
  return {dataUrl:canvas.toDataURL('image/png'),annotations};
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
    // Reserve annotation space in this isolated PDF capture only. The editor and
    // standalone technical diagram retain their existing viewport and labels.
    const annotationPadding=mapModel.geo?Math.min(width/4,height/4,mapModel.geo.fields?92:64):0;
    map.fitBounds(mapModel.captureBounds, { padding: annotationPadding, duration: 0 });
    await waitForIdle(map, timeoutMs);
    if(cadastre)cadastralObjectUrl=await addCadastralImage(map,mapModel,width,height,timeoutMs);
    if(mapModel.geo?.polygon?.length||mapModel.geo?.fields?.length){
      addGeoreferencedDesign(map,mapModel);
      await waitForIdle(map,timeoutMs);
    }
    let dataUrl,annotations;
    try {
      ({dataUrl,annotations}=labelledImage(map,mapModel,width,height,documentRef));
    } catch (error) {
      if(error instanceof SatelliteCaptureError)throw error;
      const isSecurityError = error?.name === 'SecurityError' || /insecure|tainted|cross-origin/i.test(String(error?.message ?? ''));
      throw new SatelliteCaptureError(isSecurityError ? 'cors' : 'unavailable', isSecurityError ? 'Le immagini satellitari non consentono la stampa da questo browser.' : 'Impossibile acquisire la mappa satellitare.', error);
    }
    if (!/^data:image\/png;base64,.+/i.test(String(dataUrl))) {
      throw new SatelliteCaptureError('empty', 'La mappa satellitare acquisita è vuota.');
    }
    const overlayModel=overlayForCapture(map,mapModel,width,height);
    if(overlayModel)overlayModel.annotations=annotations;
    return { dataUrl, attribution: ATTRIBUTION+(cadastre?' · Catasto © Agenzia delle Entrate, CC BY 4.0':''), overlayModel };
  } catch (error) {
    if (error instanceof SatelliteCaptureError) throw error;
    throw new SatelliteCaptureError('unavailable', 'Impossibile inizializzare la mappa satellitare.', error);
  } finally {
    if(cadastralObjectUrl)URL.revokeObjectURL(cadastralObjectUrl);
    try { map?.remove?.(); } catch { /* cleanup is best effort */ }
  }
}
