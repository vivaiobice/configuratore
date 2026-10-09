import clipping from './vendor/polygon-clipping.js?v=1.3.6';
import {terrainSurfaceGroupsPresent,resolveTerrainUsablePresentation,rankTerrainUsablePortionOverlaps} from './terrain-exclusion-groups.js?v=1.3.6';
import {createTerrainBudget} from './terrain-budget.js?v=1.3.6';
import {normalizeRowCurvePoints} from './row-curves.js?v=1.3.6';

const clone=value=>JSON.parse(JSON.stringify(value));
const topologyCache=new Map();
function ring(value){
  if(!Array.isArray(value)||value.length<3||value.some(p=>!Array.isArray(p)||p.length<2||!Number.isFinite(p[0])||!Number.isFinite(p[1])))return null;
  const result=value.map(p=>p.slice(0,2));
  if(result[0][0]!==result.at(-1)[0]||result[0][1]!==result.at(-1)[1])result.push([...result[0]]);
  return result.length>=4&&ringArea(result)>0?result:null;
}
function ringArea(ring){
  const [ox,oy]=ring[0];let sum=0;
  for(let i=1;i<ring.length;i++)sum+=(ring[i-1][0]-ox)*(ring[i][1]-oy)-(ring[i][0]-ox)*(ring[i-1][1]-oy);
  return Math.abs(sum)/2;
}
const area=geometry=>Math.max(0,ringArea(geometry[0])-geometry.slice(1).reduce((sum,r)=>sum+ringArea(r),0));
function inside(point,ring){
  let yes=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [x,y]=ring[i],[px,py]=ring[j];
    if((y>point[1])!==(py>point[1])&&point[0]<(px-x)*(point[1]-y)/(py-y)+x)yes=!yes;
  }
  return yes;
}
const contains=(geometry,point)=>inside(point,geometry[0])&&!geometry.slice(1).some(r=>inside(point,r));
export function portionAtCoordinate(portions,coordinate){
  if(!Array.isArray(coordinate)||coordinate.length<2||coordinate.some(v=>!Number.isFinite(v)))return null;
  return (Array.isArray(portions)?portions:[]).find(p=>p.geometry?.length&&contains(p.geometry,coordinate))??null;
}
// A midpoint between consecutive vertex heights cannot hit a vertex. Choose the
// widest interior interval, respecting every hole even in deeply concave fields.
function interiorAnchor(geometry){
  const heights=[...new Set(geometry.flat().map(p=>p[1]))].sort((a,b)=>a-b);
  let best=null,width=-1;
  for(let h=1;h<heights.length;h++){
    const y=(heights[h-1]+heights[h])/2,xs=[];
    for(const r of geometry)for(let i=1;i<r.length;i++){
      const a=r[i-1],b=r[i];
      if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
    }
    xs.sort((a,b)=>a-b);
    for(let i=1;i<xs.length;i++){
      const point=[(xs[i-1]+xs[i])/2,y];
      if(xs[i]-xs[i-1]>width&&contains(geometry,point)){best=point;width=xs[i]-xs[i-1];}
    }
  }
  return best;
}
// GeoJSON serialization can leave a clipped passage cap microscopically inside
// the perimeter. Close only contacts within 1 mm, extending the cap 2 mm beyond
// that edge for topology. Extend along adjacent passage sides when possible;
// nearly tangent contacts use the boundary normal to cap displacement at 5 mm.
// Row clipping always uses the original exclusion, never this geometry.
const CONTACT_TOLERANCE_M=.001;
function normalizeBoundaryContacts(exclusion,outer){
  const scaleY=6371008.8*Math.PI/180,scaleX=scaleY*Math.cos(outer.reduce((sum,p)=>sum+p[1],0)/outer.length*Math.PI/180);
  const origin=outer[0],xy=p=>[(p[0]-origin[0])*scaleX,(p[1]-origin[1])*scaleY];
  const boundary=outer.slice(0,-1).map(xy),points=exclusion.slice(0,-1).map(xy);
  const winding=boundary.reduce((sum,p,i)=>{const q=boundary[(i+1)%boundary.length];return sum+p[0]*q[1]-q[0]*p[1];},0)>0?1:-1;
  const caps=new Map();
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    for(let j=0;j<boundary.length;j++){
      const c=boundary[j],d=boundary[(j+1)%boundary.length],dx=d[0]-c[0],dy=d[1]-c[1],length=Math.hypot(dx,dy);
      if(length<1e-9)continue;
      const normal=[winding*dy/length,-winding*dx/length];
      const contact=p=>{
        const along=((p[0]-c[0])*dx+(p[1]-c[1])*dy)/length;
        return along>=-CONTACT_TOLERANCE_M&&along<=length+CONTACT_TOLERANCE_M&&Math.abs((p[0]-c[0])*normal[0]+(p[1]-c[1])*normal[1])<=CONTACT_TOLERANCE_M;
      };
      if(contact(a)&&contact(b)){caps.set(i,{normal,origin:c});break;}
    }
  }
  if(!caps.size)return exclusion;
  const extended=points.map((p,i)=>{
    const previous=(i+points.length-1)%points.length,next=(i+1)%points.length;
    const before=caps.get(previous),after=caps.get(i),cap=before??after;
    if(!cap)return exclusion[i];
    let direction;
    if(before&&after)direction=[before.normal[0]+after.normal[0],before.normal[1]+after.normal[1]];
    else {const neighbor=points[before?next:previous];direction=[p[0]-neighbor[0],p[1]-neighbor[1]];}
    const denominator=direction[0]*cap.normal[0]+direction[1]*cap.normal[1];
    if(denominator<=1e-9)direction=cap.normal;
    const gap=(p[0]-cap.origin[0])*cap.normal[0]+(p[1]-cap.origin[1])*cap.normal[1];
    let reach=(CONTACT_TOLERANCE_M*2-gap)/(direction[0]*cap.normal[0]+direction[1]*cap.normal[1]);
    if(Math.hypot(...direction)*Math.abs(reach)>.005){direction=cap.normal;reach=CONTACT_TOLERANCE_M*2-gap;}
    return [origin[0]+(p[0]+direction[0]*reach)/scaleX,origin[1]+(p[1]+direction[1]*reach)/scaleY];
  });
  return [...extended,[...extended[0]]];
}
function topology(polygon,exclusions){
  const outer=ring(polygon);if(!outer)return [];
  const holes=(Array.isArray(exclusions)?exclusions:[]).map(e=>ring(Array.isArray(e)?e:e?.geometry)).filter(Boolean);
  const key=JSON.stringify([outer,holes]);
  if(topologyCache.has(key))return clone(topologyCache.get(key));
  let result;
  try{result=holes.length?clipping.difference([outer],...holes.map(r=>[normalizeBoundaryContacts(r,outer)])):clipping.union([outer]);}catch{return [];}
  result=result.filter(g=>area(g)>1e-18);
  topologyCache.set(key,result);
  if(topologyCache.size>32)topologyCache.delete(topologyCache.keys().next().value);
  return clone(result);
}
function geometryHash(geometry){
  let hash=2166136261;
  for(const char of JSON.stringify(geometry)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(36);
}
function design(p,fallback){
  const inherited=p?.mode!=='local';
  const source=inherited?(p?.inheritedDesign??p??fallback):(p??fallback);
  const result={orientationDeg:Number.isFinite(Number(source.orientationDeg))?Number(source.orientationDeg):fallback.orientationDeg,rowCurvePoints:normalizeRowCurvePoints(source.rowCurvePoints),maintainRowEquidistance:source.maintainRowEquidistance!==false};
  return {mode:inherited?'inherited':'local',...result,...(inherited?{inheritedDesign:clone(result)}:{})};
}

export function resolveRowPortions({polygon,exclusions=[],rowPortions=[],orientationDeg=0,rowCurvePoints=[],maintainRowEquidistance=true,budget}={}){
  const strict=terrainSurfaceGroupsPresent(exclusions),operationBudget=strict?(budget??createTerrainBudget({kind:'cut'})):budget;
  const usable=strict?resolveTerrainUsablePresentation({exclusions,field:polygon,budget:operationBudget}):null;
  const geometries=strict?usable.geometry.coordinates:topology(polygon,exclusions);
  if(!geometries.length)return [];
  const fallback={orientationDeg:Number(orientationDeg)||0,rowCurvePoints:normalizeRowCurvePoints(rowCurvePoints),maintainRowEquidistance:maintainRowEquidistance!==false};
  const saved=(Array.isArray(rowPortions)?rowPortions:[]).filter(p=>p&&typeof p.id==='string'&&Array.isArray(p.geometry)&&p.geometry.length&&p.geometry.every(r=>ring(r)));
  const overlaps=strict?null:geometries.map(g=>saved.map(p=>{try{return clipping.intersection(g,p.geometry).reduce((sum,component)=>sum+area(component),0);}catch{return 0;}}));
  // Match the largest overlaps globally; array order never transfers an identity.
  const pairs=strict?rankTerrainUsablePortionOverlaps(usable,saved,{budget:operationBudget}):overlaps.flatMap((scores,i)=>scores.map((score,j)=>({i,j,score}))).filter(p=>p.score>1e-18).sort((a,b)=>b.score-a.score||saved[a.j].id.localeCompare(saved[b.j].id)||a.i-b.i);
  const assigned=new Map(),used=new Set();
  for(const p of pairs)if(!assigned.has(p.i)&&!used.has(p.j)){assigned.set(p.i,p.j);used.add(p.j);}
  const ids=new Set(saved.map(p=>p.id));
  const labels=new Set([...assigned.values()].map(index=>saved[index].label).filter(Boolean));
  const newLabel=()=>{let n=1;while(labels.has(`Porzione ${n}`))n++;const label=`Porzione ${n}`;labels.add(label);return label;};
  return geometries.map((geometry,index)=>{
    const matches=pairs.filter(p=>p.i===index),source=saved[assigned.get(index)]??saved[matches[0]?.j];
    let id=assigned.has(index)?source.id:`portion-${geometryHash(geometry)}`;
    if(!assigned.has(index)){const base=id;let suffix=2;while(ids.has(id))id=`${base}-${suffix++}`;ids.add(id);}
    const chosen=design(source,fallback);
    const signatures=new Set(matches.map(p=>JSON.stringify(design(saved[p.j],fallback))));
    const conflict=signatures.size>1?{type:'merged-layouts',portionIds:matches.map(p=>saved[p.j].id).sort(),selectedPortionId:source.id}:source?.conflict;
    return {id,label:(assigned.has(index)&&source?.label)||newLabel(),geometry,anchor:interiorAnchor(geometry),...chosen,...(source?.terrainDesign?{terrainDesign:clone(source.terrainDesign)}:{}),...(strict&&source&&Object.hasOwn(source,'terrainScopeRecipe')?{terrainScopeRecipe:clone(source.terrainScopeRecipe)}:{}),...(conflict?{conflict:clone(conflict)}:{})};
  });
}

export function updateRowPortion(portions,id,patch={}){
  return (Array.isArray(portions)?portions:[]).map(portion=>{
    if(portion.id!==id)return portion;
    const editsDesign=['orientationDeg','rowCurvePoints','maintainRowEquidistance'].some(key=>Object.hasOwn(patch,key));
    const next={...portion,...patch,id:portion.id,geometry:portion.geometry};
    if(editsDesign){
      if(portion.mode!=='local'&&!Object.hasOwn(patch,'rowCurvePoints'))next.rowCurvePoints=[];
      next.mode='local';delete next.inheritedDesign;
      next.rowCurvePoints=normalizeRowCurvePoints(next.rowCurvePoints).map(({segmentId,...point})=>point);
      next.orientationDeg=Number.isFinite(Number(next.orientationDeg))?Number(next.orientationDeg):0;
      next.maintainRowEquidistance=next.maintainRowEquidistance!==false;
      delete next.conflict;
    }
    return next;
  });
}
