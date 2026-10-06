import {layoutSatelliteAnnotations} from './report-satellite.js?v=1.3.1-prova.1';
import { sideMeasurements as measureSides } from './geometry.js?v=45';

const MAX_MERCATOR_LAT = 85.05112878;

function validPoint(point) {
  return Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
}

function normalizeRing(ring) {
  if (!Array.isArray(ring)) return [];
  const points = ring.filter(validPoint).map(([lon, lat]) => [Number(lon), Number(lat)]);
  if (points.length < 3) return [];
  const first = points[0];
  const last = points.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) points.push([...first]);
  return points.length >= 4 ? points : [];
}

function mercator([lon, lat]) {
  const clampedLat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
  const x = (lon + 180) / 360;
  const radians = clampedLat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(radians) + (1 / Math.cos(radians))) / Math.PI) / 2;
  return [x, y];
}

function inverseMercator([x, y]) {
  return [(x * 360) - 180, Math.atan(Math.sinh(Math.PI * (1 - (2 * y)))) * 180 / Math.PI];
}

function invalidModel(width, height) {
  return { valid: false, width, height, captureBounds: [], polygon: [], rows: [], exclusions: [], sideMeasurements: [] };
}

function rowCoordinates(row) {
  const curved=Array.isArray(row?.coordinates)?row.coordinates.filter(validPoint).map(([lon,lat])=>[Number(lon),Number(lat)]):[];
  if(curved.length>=2)return curved;
  return validPoint(row?.start)&&validPoint(row?.end)
    ? [row.start.map(Number),row.end.map(Number)]
    : [];
}

export function buildReportMapModel({ polygon, rows = [], exclusions = [], width = 760, height = 360, padding = 34 } = {}) {
  const viewportWidth = Math.max(1, Number(width) || 760);
  const viewportHeight = Math.max(1, Number(height) || 360);
  const safePadding = Math.max(0, Math.min(Number(padding) || 0, Math.min(viewportWidth, viewportHeight) / 2 - 1));
  const ring = normalizeRing(polygon);
  if (!ring.length) return invalidModel(viewportWidth, viewportHeight);

  const mercatorRing = ring.map(mercator);
  const xs = mercatorRing.map(([x]) => x);
  const ys = mercatorRing.map(([, y]) => y);
  const rawMinX = Math.min(...xs); const rawMaxX = Math.max(...xs);
  const rawMinY = Math.min(...ys); const rawMaxY = Math.max(...ys);
  const spanX = Math.max(rawMaxX - rawMinX, 1e-12);
  const spanY = Math.max(rawMaxY - rawMinY, 1e-12);
  const innerWidth = Math.max(1, viewportWidth - (2 * safePadding));
  const innerHeight = Math.max(1, viewportHeight - (2 * safePadding));
  const scale = Math.min(innerWidth / spanX, innerHeight / spanY);
  const centerX = (rawMinX + rawMaxX) / 2;
  const centerY = (rawMinY + rawMaxY) / 2;
  const minX = centerX - ((viewportWidth / scale) / 2);
  const maxX = centerX + ((viewportWidth / scale) / 2);
  const minY = centerY - ((viewportHeight / scale) / 2);
  const maxY = centerY + ((viewportHeight / scale) / 2);

  const project = (point) => {
    const [x, y] = mercator(point);
    return [((x - minX) / (maxX - minX)) * viewportWidth, ((y - minY) / (maxY - minY)) * viewportHeight];
  };
  const projectedRows = (Array.isArray(rows) ? rows : [])
    .map((row) => ({row,coordinates:rowCoordinates(row)}))
    .filter((item) => item.coordinates.length>=2)
    .map(({row,coordinates}) => {
      const projected=coordinates.map(project);
      return {...row,coordinates:projected,start:projected[0],end:projected.at(-1)};
    });
  const sourceExclusions = (Array.isArray(exclusions) ? exclusions : []).map((item, index) => {
    const geometry = normalizeRing(Array.isArray(item) ? item : item?.geometry);
    if (!geometry.length) return null;
    return {
      id: Array.isArray(item) ? `area-${index + 1}` : (item.id ?? `exclusion-${index + 1}`),
      type: Array.isArray(item) ? 'area' : (item.type === 'linear' ? 'linear' : 'area'),
      label: Array.isArray(item) ? '' : (item.label ?? ''),
      widthM: Array.isArray(item) ? null : (item.widthM ?? null),
      points: geometry
    };
  }).filter(Boolean);
  const projectedExclusions = sourceExclusions.map((item) => ({...item,points:item.points.map(project)}));
  const projectedSides = measureSides(ring).map((side) => ({
    ...side,
    point: project(side.midpoint),
    label: `${Math.round(side.lengthM).toLocaleString('it-IT')} m`
  }));
  const [west, north] = inverseMercator([minX, minY]);
  const [east, south] = inverseMercator([maxX, maxY]);
  return {
    valid: true,
    width: viewportWidth,
    height: viewportHeight,
    captureBounds: [[west, south], [east, north]],
    polygon: ring.map(project),
    rows: projectedRows,
    exclusions: projectedExclusions,
    sideMeasurements: projectedSides,
    geo:{
      polygon:ring,
      rows:(Array.isArray(rows)?rows:[]).map(row=>({...row,coordinates:rowCoordinates(row)})).filter(row=>row.coordinates.length>=2),
      exclusions:sourceExclusions,
      sideMeasurements:measureSides(ring).map(side=>({...side,point:side.midpoint,label:`${Math.round(side.lengthM).toLocaleString('it-IT')} m`}))
    }
  };
}

function refitTechnicalVectors(model,transform){
  return {...model,polygon:model.polygon.map(transform),
    rows:model.rows.map(row=>{const coordinates=row.coordinates.map(transform);return {...row,coordinates,start:coordinates[0],end:coordinates.at(-1)};}),
    exclusions:model.exclusions.map(area=>({...area,points:area.points.map(transform)})),
    sideMeasurements:model.sideMeasurements.map(side=>({...side,point:transform(side.point)}))};
}

// Dense boundaries use a finite grid of quotes outside the entire field bbox.
// Reserving explicit columns avoids quadratic candidate searches and guarantees
// all labels stay outside, inside the panel, and disjoint. Leaders paint below
// opaque tags, so dense routes cannot obscure another measurement.
function columnTechnicalAnnotations(model,{fontSize,measureText},bounds){
  const {width,height}=model,n=model.sideMeasurements.length;
  const top=Math.min(82,height*.2),edge=4,fieldGap=8;
  const sorted=model.sideMeasurements.map((side,index)=>({...side,index})).sort((a,b)=>a.point[0]-b.point[0]);
  const groups=[sorted.slice(0,Math.ceil(n/2)),sorted.slice(Math.ceil(n/2))];
  let ratio=1,cellWidth,cellHeight,rows,columns,tagWidths;
  for(;;){
    const size=fontSize*ratio;
    const measure=label=>measureText?measureText(label,size):String(label).length*size*.62;
    tagWidths=model.sideMeasurements.map(side=>Math.max(32*ratio,measure(side.label)+12*ratio));
    cellWidth=Math.max(0,...tagWidths)+3*ratio;cellHeight=(fontSize+11)*ratio;
    rows=Math.max(1,Math.floor((height-top-edge)/cellHeight));
    columns=groups.map(group=>Math.ceil(group.length/rows));
    if(width-2*edge-(columns[0]+columns[1])*cellWidth-2*fieldGap>=width*.2)break;
    ratio*=.85;
  }
  const left=edge+columns[0]*cellWidth+fieldGap,right=width-edge-columns[1]*cellWidth-fieldGap;
  const scale=Math.min((right-left)/Math.max(bounds.maxX-bounds.minX,1e-9),(height-44*height/360)/Math.max(bounds.maxY-bounds.minY,1e-9));
  const transform=([x,y])=>[(x-bounds.center[0])*scale+(left+right)/2,(y-bounds.center[1])*scale+height/2];
  const technical=refitTechnicalVectors(model,transform),annotations=[];
  groups.forEach((group,side)=>{
    group.sort((a,b)=>a.point[1]-b.point[1]);
    group.forEach((request,index)=>{
      const column=index%columns[side],row=Math.floor(index/columns[side]);
      const tagWidth=tagWidths[request.index],tagHeight=(fontSize+8)*ratio;
      const x=(side?width-edge-columns[1]*cellWidth:edge)+column*cellWidth+(cellWidth-3*ratio)/2;
      const y=top+row*cellHeight+tagHeight/2,anchor=transform(request.point);
      const box={x:x-tagWidth/2,y:y-tagHeight/2,width:tagWidth,height:tagHeight};
      annotations.push({id:request.id??request.index,label:request.label,lines:[request.label],fontSize:fontSize*ratio,box,point:[x,y],anchor,leader:[anchor,[side?box.x:box.x+box.width,y]]});
    });
  });
  technical.annotations=annotations;
  return technical;
}

// Keep capture bounds and satellite projection unchanged. Only explicit print
// diagrams refit vectors; ordinary thumbnails never call the annotation solver.
export function buildTechnicalReportMapModel(model, {measureText,fontSize=Math.min(22,13*model.height/360)}={}) {
  if(!model.valid)return model;
  const {width,height}=model;
  const xs=model.polygon.map(p=>p[0]),ys=model.polygon.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const bounds={minX,maxX,minY,maxY,center:[(minX+maxX)/2,(minY+maxY)/2]};
  const margin=22*height/360;
  const maximum=Math.min((width-2*margin)/Math.max(maxX-minX,1e-9),(height-2*margin)/Math.max(maxY-minY,1e-9));
  const options={fontSize,measureText};
  // A modest side count can retain short leaders and a larger field. Search at
  // most six fits; dense or difficult boundaries take the deterministic grid.
  if(model.sideMeasurements.length<=40){
    for(const fit of [1,.975,.95,.925,.9,.875]){
      const transform=([x,y])=>[(x-bounds.center[0])*maximum*fit+width/2,(y-bounds.center[1])*maximum*fit+height/2];
      const technical=refitTechnicalVectors(model,transform);
      try{
        technical.annotations=layoutSatelliteAnnotations({...technical,compact:true,fontSize,leaderGap:8*height/360,measureText,
          reservedBoxes:[{x:width-64,y:18,width:32,height:62}]});
        return technical;
      }catch(error){if(error?.code!=='annotations')throw error;}
    }
  }
  return columnTechnicalAnnotations(model,options,bounds);
}
