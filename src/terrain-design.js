import {legacyTerrainInputs as inputs,legacyTerrainDesignInputHash as terrainDesignInputHash,readTerrainEnvelope,hashTerrainEnvelope as snapshotHash} from './terrain-replay.js?v=1.3.4';
export {terrainDesignInputHash};
import {FIELD_KEYS} from './fields.js?v=1.3.4';
import clipping from './vendor/polygon-clipping.js?v=1.3.4';
import {toUTM,fromUTM} from './coordinate-system.js?v=1.3.4';
import {getTerrainMesh,validateTerrainModel,terrainPolylineLength,terrainSurfaceArea,terrainInputHash,sampleTerrain} from './terrain-model.js?v=1.3.4';
import {polygonMetrics,estimatePlantsFromRows,roundUpTo25,generateRows} from './geometry.js?v=45';
import {resolveRowPortions} from './row-portions.js?v=1.3.4';
import {rowOwnerId,generateCurvedRows} from './row-curves.js?v=1.3.4';
import {calculateProject} from './project-calculator.js?v=1.3.4';
import {buildContourTerrainProposal} from './terrain-contour-design.js?v=1.3.4';
import {createTerrainBudget} from './terrain-budget.js?v=1.3.4';

const VERSION='terrain-face-chart-1', MAX_NODES=500000, ERROR_TARGET=.01;
const clone=v=>JSON.parse(JSON.stringify(v));
const maxOf=values=>values.reduce((a,b)=>Math.max(a,b),-Infinity);
const minOf=values=>values.reduce((a,b)=>Math.min(a,b),Infinity);
const add=(a,b)=>a.map((v,i)=>v+b[i]), sub=(a,b)=>a.map((v,i)=>v-b[i]), mul=(a,k)=>a.map(v=>v*k), dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0), norm=a=>Math.hypot(...a), cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const mix=(a,b,t)=>add(a,mul(sub(b,a),t));
function fail(status,message){throw Object.assign(new Error(message),{status});}
export const planeHorizontalSpacing=(spacing,a,b)=>spacing*Math.sqrt((1+a*a)/(1+a*a+b*b));
export function readAppliedTerrainResult(input){return readTerrainEnvelope(input);}

function verifyChartBoundary(boundary,tick){
 for(let i=0;i<boundary.length;i++)for(let j=i+2;j<boundary.length;j++){
  tick();if(i===0&&j===boundary.length-1)continue;
  const a=boundary[i],b=boundary[(i+1)%boundary.length],c=boundary[j],d=boundary[(j+1)%boundary.length];
  if(Math.max(a[0],b[0])<Math.min(c[0],d[0])-1e-9||Math.max(c[0],d[0])<Math.min(a[0],b[0])-1e-9||Math.max(a[1],b[1])<Math.min(c[1],d[1])-1e-9||Math.max(c[1],d[1])<Math.min(a[1],b[1])-1e-9)continue;
  const e=sub(b,a),f=sub(d,c),r=sub(c,a),det=cross(e,f);
  if(Math.abs(det)<1e-12){if(Math.abs(cross(r,e))<1e-8)fail('review-required','Il dominio della guida si sovrappone.');continue;}
  const u=cross(r,f)/det,v=cross(r,e)/det;
  if(u>=-1e-9&&u<=1+1e-9&&v>=-1e-9&&v<=1+1e-9)fail('review-required','Il dominio della guida si incrocia.');
 }
}
// Outward IEEE-754 intervals for the scalar-distance certificate. The native
// XYZ triangle is nondegenerate even when a chart is strongly sheared. Using
// ||df1*E2-df2*E1|| / ||E1×E2|| avoids cancellation in a metric determinant.
const intervalBytes=new DataView(new ArrayBuffer(8));
function nextUp(x){if(x===Infinity)return x;if(x===0)return Number.MIN_VALUE;intervalBytes.setFloat64(0,x);let bits=intervalBytes.getBigUint64(0);bits+=x>0?1n:-1n;intervalBytes.setBigUint64(0,bits);return intervalBytes.getFloat64(0);}
const nextDown=x=>-nextUp(-x),interval=x=>[x,x];
const iAdd=(a,b)=>[nextDown(a[0]+b[0]),nextUp(a[1]+b[1])],iSub=(a,b)=>[nextDown(a[0]-b[1]),nextUp(a[1]-b[0])];
const iMul=(a,b)=>{const p=[a[0]*b[0],a[0]*b[1],a[1]*b[0],a[1]*b[1]];return [nextDown(Math.min(...p)),nextUp(Math.max(...p))];};
const iNorm=v=>{let lo=0,hi=0;for(const a of v){const low=a[0]<=0&&a[1]>=0?0:Math.min(a[0]*a[0],a[1]*a[1]),high=Math.max(a[0]*a[0],a[1]*a[1]);lo=nextDown(lo+nextDown(low));hi=nextUp(hi+nextUp(high));}return [nextDown(Math.sqrt(Math.max(0,lo))),nextUp(Math.sqrt(hi))];};
function gradientUpper(face){
 const E=face.q[1].map((v,i)=>iSub(interval(v),interval(face.q[0][i]))),F=face.q[2].map((v,i)=>iSub(interval(v),interval(face.q[0][i])));
 const a=iSub(interval(face.p[1][0]),interval(face.p[0][0])),b=iSub(interval(face.p[2][0]),interval(face.p[0][0]));
 const numerator=iNorm(E.map((_,i)=>iSub(iMul(a,F[i]),iMul(b,E[i]))));
 const N=[0,1,2].map(i=>iSub(iMul(E[(i+1)%3],F[(i+2)%3]),iMul(E[(i+2)%3],F[(i+1)%3]))),denominator=iNorm(N);
 if(!(denominator[0]>0))fail('review-required','Limite numerico della metrica non verificabile.');
 return nextUp(numerator[1]/denominator[0]);
}
// A continuous chart: each native vertex has ONE coordinate, including across
// non-tree edges. Faces with distortion retain their actual metric; unfolding
// is a construction device, never a claim of geodesic distance on curved terrain.
function chartFor(model,tick){
 const mesh=getTerrainMesh(model),{vertices,triangles}=mesh;
 if(vertices.length>MAX_NODES)fail('budget-exceeded','Superato il limite dei nodi di calcolo.');
 const origin=vertices[0],xyz=vertices.map(v=>sub(v,origin)),uv=Array(vertices.length);
 uv[0]=[0,0];uv[1]=[norm(sub(xyz[1],xyz[0])),0];
 for(const ids of triangles){
  tick();const missing=ids.filter(i=>!uv[i]);
  if(missing.length>1)fail('review-required','La superficie non consente una guida continua.');
  if(missing.length){
   const c=missing[0],at=ids.indexOf(c),a=ids[(at+1)%3],b=ids[(at+2)%3],edge=sub(uv[b],uv[a]),d=norm(edge),ac=norm(sub(xyz[c],xyz[a])),bc=norm(sub(xyz[c],xyz[b]));
   const along=(ac*ac+d*d-bc*bc)/(2*d),h2=ac*ac-along*along;
   if(h2<=0)fail('review-required','Superficie ripiegata: disegno da rivedere.');
   // Native triangle indices are clockwise in XY. Preserve that orientation.
   uv[c]=add(uv[a],[edge[0]*along/d+edge[1]*Math.sqrt(h2)/d,edge[1]*along/d-edge[0]*Math.sqrt(h2)/d]);
  }
 }
 let metricError=0;
 const faces=triangles.map(ids=>{
  const p=ids.map(i=>uv[i]),q=ids.map(i=>xyz[i]),e=sub(p[1],p[0]),f=sub(p[2],p[0]),det=cross(e,f);
  if(det>=-1e-10)fail('review-required','Famiglia ripiegata: disegno da rivedere.');
  const E=sub(q[1],q[0]),F=sub(q[2],q[0]);
  const dx=mul(sub(mul(E,f[1]),mul(F,e[1])),1/det),dy=mul(sub(mul(F,e[0]),mul(E,f[0])),1/det);
  const g00=dot(dx,dx),g01=dot(dx,dy),g11=dot(dy,dy),gdet=g00*g11-g01*g01;
  if(!(gdet>0))fail('review-required','Metrica non verificabile.');
  metricError=Math.max(metricError,Math.abs(g00-1),Math.abs(g11-1),Math.abs(g01));
  return {ids,p,q,dx,dy,g00,g01,g11,gdet};
 });
 const boundaryIds=[...Array.from({length:mesh.width},(_,i)=>i),...Array.from({length:mesh.height-1},(_,i)=>(i+1)*mesh.width+mesh.width-1),...Array.from({length:mesh.width-1},(_,i)=>(mesh.height-1)*mesh.width+mesh.width-2-i),...Array.from({length:mesh.height-2},(_,i)=>(mesh.height-2-i)*mesh.width)];
 const boundary=boundaryIds.map(i=>uv[i]);verifyChartBoundary(boundary,tick);
 const epsg=Number(model.crs.split(':')[1]);
 const locateXY=point=>{
  const x=(point[0]-mesh.origin[0])/mesh.step[0],y=(point[1]-mesh.origin[1])/mesh.step[1];
  if(x< -1e-7||y< -1e-7||x>mesh.width-1+1e-7||y>mesh.height-1+1e-7)fail('uncovered','Il modello non copre il campo e il margine di calcolo.');
  const col=Math.max(0,Math.min(mesh.width-2,Math.floor(x))),row=Math.max(0,Math.min(mesh.height-2,Math.floor(y))),fx=x-col,fy=y-row;
  return faces[(row*(mesh.width-1)+col)*2+(fx+fy<=1?0:1)];
 };
 const bary=(point,triangle)=>{const e=sub(triangle[1],triangle[0]),f=sub(triangle[2],triangle[0]),d=sub(point,triangle[0]),den=cross(e,f);return [cross(d,f)/den,cross(e,d)/den];};
 const mapXY=point=>{const face=locateXY(point),[a,b]=bary(sub(point,origin.slice(0,2)),face.q.map(p=>p.slice(0,2)));return add(face.p[0],add(mul(sub(face.p[1],face.p[0]),a),mul(sub(face.p[2],face.p[0]),b)));};
 const splitXY=(a,b)=>{
  const ts=[0,1],ga=[(a[0]-mesh.origin[0])/mesh.step[0],(a[1]-mesh.origin[1])/mesh.step[1]],gb=[(b[0]-mesh.origin[0])/mesh.step[0],(b[1]-mesh.origin[1])/mesh.step[1]];
  // Grid verticals, horizontals, and NE/SW diagonals; all face crossings.
  for(const [u,v] of [[ga[0],gb[0]],[ga[1],gb[1]],[ga[0]+ga[1],gb[0]+gb[1]]])if(Math.abs(v-u)>1e-12)for(let k=Math.floor(Math.min(u,v))+1;k<Math.max(u,v);k++){const t=(k-u)/(v-u);if(t>1e-10&&t<1-1e-10)ts.push(t);}
  return [...new Set(ts)].sort((a,b)=>a-b).map(t=>mix(a,b,t));
 };
 const ringToChart=ring=>ring.slice(0,-1).flatMap((p,i)=>splitXY(toUTM(p,epsg),toUTM(ring[i+1],epsg)).slice(0,-1).map(mapXY));
 return {mesh,origin,xyz,uv,faces,boundary,metricError,epsg,mapXY,splitXY,ringToChart,bary};
}
function intervals(ring,x){const ys=[];for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if((a[0]<=x&&b[0]>x)||(b[0]<=x&&a[0]>x))ys.push(a[1]+(x-a[0])*(b[1]-a[1])/(b[0]-a[0]));}ys.sort((a,b)=>a-b);const out=[];for(let i=0;i+1<ys.length;i+=2)out.push([ys[i],ys[i+1]]);return out;}
function subtract(base,cuts){let output=base;for(const [a,b] of cuts)output=output.flatMap(([c,d])=>b<=c||a>=d?[[c,d]]:[[c,Math.min(a,d)],[Math.max(b,c),d]].filter(([x,y])=>y-x>1e-9));return output;}
function intersect(a,b){return a.flatMap(([x,y])=>b.map(([u,v])=>[Math.max(x,u),Math.min(y,v)]).filter(([u,v])=>v-u>1e-8));}
function length(points){return points.slice(1).reduce((s,p,i)=>s+norm(sub(p.slice(0,3),points[i].slice(0,3))),0);}
function trim(points,amount){if(!amount)return points;const total=length(points);if(total<=amount*2+.05)return [];let walked=0,out=[];for(let i=1;i<points.length;i++){const d=norm(sub(points[i].slice(0,3),points[i-1].slice(0,3))),lo=Math.max(amount,walked),hi=Math.min(total-amount,walked+d);if(hi>lo){const a=mix(points[i-1],points[i],(lo-walked)/d),b=mix(points[i-1],points[i],(hi-walked)/d);if(!out.length)out.push(a);out.push(b);}walked+=d;}return out;}
function rotateChart(chart,orientation){
 const c=Math.cos(orientation),s=Math.sin(orientation),rot=p=>[p[0]*c+p[1]*s,-p[0]*s+p[1]*c];
 return {...chart,boundary:chart.boundary.map(rot),ringToChart:ring=>chart.ringToChart(ring).map(rot),faces:chart.faces.map(face=>{
  const dx=add(mul(face.dx,c),mul(face.dy,s)),dy=add(mul(face.dx,-s),mul(face.dy,c)),g00=dot(dx,dx),g01=dot(dx,dy),g11=dot(dy,dy),gdet=g00*g11-g01*g01;
  return {...face,p:face.p.map(rot),dx,dy,g00,g01,g11,gdet,gradientX:Math.sqrt(g11/gdet)};
 })};
}
function faceLine(chart,x,lo,hi,tick){
 const pieces=[];
 for(const f of chart.faces){tick();const hits=[];
  for(let i=0;i<3;i++){const a=f.p[i],b=f.p[(i+1)%3];if((a[0]<=x&&b[0]>=x)||(a[0]>=x&&b[0]<=x)){if(Math.abs(b[0]-a[0])<1e-12){if(Math.abs(x-a[0])<1e-9)hits.push(a[1],b[1]);}else hits.push(a[1]+(x-a[0])*(b[1]-a[1])/(b[0]-a[0]));}}
  if(hits.length<2)continue;const a=Math.max(lo,Math.min(...hits)),b=Math.min(hi,Math.max(...hits));if(b-a<1e-8)continue;
  const xyz=t=>{const [u,v]=chart.bary([x,t],f.p);return add(f.q[0],add(mul(sub(f.q[1],f.q[0]),u),mul(sub(f.q[2],f.q[0]),v)));};
  pieces.push({a,b,first:[...xyz(a),a],last:[...xyz(b),b]});
 }
 pieces.sort((a,b)=>a.a-b.a||b.b-a.b);const points=[];let end=lo;
 for(const p of pieces){if(p.b<=end+1e-8)continue;if(p.a>end+1e-6)fail('review-required','La guida esce dal dominio verificato.');if(!points.length)points.push(p.first);points.push(p.last);end=p.b;}
 if(end<hi-1e-6)fail('uncovered','Il percorso di distanza esce dalla copertura.');
 return points;
}
// Supporting-plane projection certifies a lower bound even when the numerical
// closest-point witness is ill-conditioned. All arithmetic uses local metres.
function segmentBound(a,b,c,d){
 a=a.slice(0,3);b=b.slice(0,3);c=c.slice(0,3);d=d.slice(0,3);
 const e=sub(b,a),f=sub(d,c),r=sub(a,c),ee=dot(e,e),ff=dot(f,f),ef=dot(e,f),er=dot(e,r),fr=dot(f,r),den=ee*ff-ef*ef;
 const candidates=[];const put=(s,t)=>{s=Math.max(0,Math.min(1,s));t=Math.max(0,Math.min(1,t));const p=mix(a,b,s),q=mix(c,d,t);candidates.push({p,q,d:norm(sub(p,q))});};
 put(0,fr/ff);put(1,(fr+ef)/ff);put(-er/ee,0);put((ef-er)/ee,1);
 if(den>Number.EPSILON*ee*ff){const s=(ef*fr-ff*er)/den,t=(ee*fr-ef*er)/den;if(s>=0&&s<=1&&t>=0&&t<=1)put(s,t);}
 const best=candidates.reduce((a,b)=>a.d<b.d?a:b),scale=1+norm(e)+norm(f)+norm(r),roundoff=256*Number.EPSILON*scale;
 const u=mul(sub(best.p,best.q),1/(best.d+roundoff));
 const projection=Math.min(0,dot(u,e))-Math.max(dot(u,sub(c,a)),dot(u,sub(d,a)));
 return {...best,lower:Math.max(0,projection-roundoff),roundoff};
}
function spacingCertificate(chart,left,right,model,tick){
 const common=intersect(left.intervals,right.intervals);if(!common.length)return null;
 const leftPieces=common.map(([a,b])=>faceLine(chart,left.x,a,b,tick)),rightPieces=common.map(([a,b])=>faceLine(chart,right.x,a,b,tick));
 let lower=Infinity,upper=Infinity,roundoff=0;
 for(const a of leftPieces)for(const b of rightPieces)for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++){
  tick();const pair=segmentBound(a[i-1],a[i],b[j-1],b[j]);lower=Math.min(lower,pair.lower);roundoff=Math.max(roundoff,pair.roundoff);
  if(pair.d<upper){const points=[pair.p,pair.q].map(p=>fromUTM(add(p.slice(0,2),chart.origin.slice(0,2)),chart.epsg));upper=Math.min(upper,terrainPolylineLength(model,points)+pair.roundoff);}
 }
 const faces=chart.faces.filter(f=>Math.min(...f.p.map(p=>p[0]))<=right.x&&Math.max(...f.p.map(p=>p[0]))>=left.x);
 const maxGradient=maxOf(faces.map(gradientUpper));
 const scalarLower=(right.x-left.x)/(maxGradient*(1+256*Number.EPSILON))-roundoff;
 lower=Math.max(lower,scalarLower);
 // A straight connector in the continuous chart is an explicit face-crossing
 // path. This recovers exact intrinsic certificates for developable folds.
 const transposed={...chart,faces:chart.faces.map(f=>({...f,p:f.p.map(p=>[p[1],p[0]])}))};
 for(const [a,b] of common){const connector=faceLine(transposed,(a+b)/2,left.x,right.x,tick);upper=Math.min(upper,length(connector.map(p=>p.slice(0,3)))+roundoff);}
 return {lower,upper,error:Math.max(0,upper-lower),roundoff};
}
function totals(rows,postSpacing,plantSpacing){const bases=new Set(rows.map(r=>r.quantityBasis??'legacy-planar')),quantityBasis=bases.size>1?'mixed-certified-bases':([...bases][0]??'model-surface'),surfaceRowLinearM=rows.every(r=>Number.isFinite(r.surfaceLengthM))?rows.reduce((s,r)=>s+r.surfaceLengthM,0):null;const rowLinearM=rows.reduce((s,r)=>s+r.lengthM,0),horizontalRowLinearM=rows.reduce((s,r)=>s+r.horizontalLengthM,0),simulatedPlants=estimatePlantsFromRows(rows,plantSpacing),headPosts=postSpacing>0?rows.length*2:0,intermediatePosts=postSpacing>0?rows.reduce((s,r)=>s+Math.max(0,Math.ceil(r.lengthM/postSpacing)-1),0):0;return {rows,rowCount:rows.length,rowLinearM,surfaceRowLinearM,quantityBasis,horizontalRowLinearM,simulatedPlants,headPosts,intermediatePosts,totalPosts:headPosts+intermediatePosts};}
function quantities(r){return {rowCount:r?.rowCount??0,rowLinearM:r?.rowLinearM??0,surfaceRowLinearM:r?.surfaceRowLinearM??null,quantityBasis:r?.quantityBasis??'legacy-planar',simulatedPlants:r?.simulatedPlants??0,totalPosts:r?.totalPosts??0};}
function contourGuide(chart,model,portion,tick){
 const level=sampleTerrain(model,portion.anchor)-chart.origin[2],nodes=new Map(),edges=[];
 const put=(key,p)=>{if(!nodes.has(key))nodes.set(key,{key,p,neighbors:new Set()});return nodes.get(key);};
 const epsilon=1e-11*(1+Math.abs(level));
 for(const face of chart.faces){
  tick();const hits=new Map();
  for(let i=0;i<3;i++){
   const j=(i+1)%3,a=face.q[i][2]-level,b=face.q[j][2]-level;
   if(Math.abs(a)<=epsilon){const key=`v:${face.ids[i]}`;hits.set(key,put(key,face.p[i]));}
   if(a*b<0&&Math.abs(a)>epsilon&&Math.abs(b)>epsilon){const key=`e:${Math.min(face.ids[i],face.ids[j])}:${Math.max(face.ids[i],face.ids[j])}`;hits.set(key,put(key,mix(face.p[i],face.p[j],a/(a-b))));}
  }
  const list=[...hits.values()];if(list.length===2){list[0].neighbors.add(list[1].key);list[1].neighbors.add(list[0].key);edges.push([list[0].p,list[1].p]);}
  else if(list.length>2)for(const a of list)for(const b of list)if(a!==b)a.neighbors.add(b.key);
 }
 const region=chart.ringToChart(portion.geometry[0]),seen=new Set(),components=[];
 for(const node of nodes.values()){
  if(seen.has(node.key))continue;const component=[],queue=[node];seen.add(node.key);
  while(queue.length){const n=queue.pop();component.push(n);for(const key of n.neighbors)if(!seen.has(key)){seen.add(key);queue.push(nodes.get(key));}}
  if(component.some(n=>intervals(region,n.p[0]).some(([a,b])=>n.p[1]>=a&&n.p[1]<=b)))components.push(component);
 }
 if(!components.length)fail('review-required','Nessuna curva di livello aperta attraversa la porzione.');
 const center=region.reduce((a,p)=>add(a,p),[0,0]).map(v=>v/region.length);
 components.sort((a,b)=>minOf(a.map(n=>norm(sub(n.p,center))))-minOf(b.map(n=>norm(sub(n.p,center)))));
 const chosen=components[0];if(chosen.some(n=>n.neighbors.size>2))fail('review-required','Curva di livello ramificata: disegno da rivedere.');
 const ends=chosen.filter(n=>n.neighbors.size===1);if(ends.length!==2)fail('review-required','Curva di livello chiusa: disegno da rivedere.');
 let node=ends[0],prior=null;const path=[];
 while(node){path.push(node.p);const next=[...node.neighbors].find(key=>key!==prior);prior=node.key;node=next?nodes.get(next):null;}
 if(path[0][1]>path.at(-1)[1])path.reverse();
 // Only the selected guide through the working portion must be regular. The
// native support may contain other contour components or critical points.
 const inside=p=>intervals(region,p[0]).some(([a,b])=>p[1]>=a&&p[1]<=b);
 const owned=path.map((p,i)=>inside(p)?i:-1).filter(i=>i>=0);
 if(!owned.length)fail('review-required','Guida di terreno troppo breve per la porzione.');
 let relevant=path.slice(Math.max(0,owned[0]-1),Math.min(path.length,owned.at(-1)+2));
 if(relevant.length<2)fail('review-required','Guida di terreno troppo breve per la porzione.');
 const candidates=Array.from({length:721},(_,i)=>(i-360)*Math.PI/720).sort((a,b)=>Math.abs(a)-Math.abs(b));
 let best=null;
 for(const rotation of candidates){
  const c=Math.cos(rotation),s=Math.sin(rotation),rot=p=>[p[0]*c+p[1]*s,-p[0]*s+p[1]*c];let points=relevant.map(rot);
  if(points[0][1]>points.at(-1)[1])points.reverse();
  if(points.every((p,i)=>!i||p[1]-points[i-1][1]>1e-7)){const score=minOf(points.slice(1).map((p,i)=>(p[1]-points[i][1])/norm(sub(p,points[i]))));if(!best||score>best.score+1e-8)best={points,rotation,score};}
 }
 if(best)return best;
 fail('review-required','La guida si ripiega nella porzione: disegno da rivedere.');
}
function shearGuide(chart,guide,tick){
 const knots=guide.map(p=>p[1]),offset=y=>{if(y<=guide[0][1])return guide[0][0];if(y>=guide.at(-1)[1])return guide.at(-1)[0];let i=1;while(guide[i][1]<y)i++;return guide[i-1][0]+(guide[i][0]-guide[i-1][0])*(y-guide[i-1][1])/(guide[i][1]-guide[i-1][1]);};
 const faces=[];let nodeBudget=chart.mesh.vertices.length;
 const cut=(poly,y,above)=>{const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ai=above?a.p[1]>=y:a.p[1]<=y,bi=above?b.p[1]>=y:b.p[1]<=y;if(ai)out.push(a);if(ai!==bi){const t=(y-a.p[1])/(b.p[1]-a.p[1]);out.push({p:mix(a.p,b.p,t),q:mix(a.q,b.q,t)});}}return out;};
 for(const face of chart.faces){
  tick();const minY=Math.min(...face.p.map(p=>p[1])),maxY=Math.max(...face.p.map(p=>p[1]));let rest=face.p.map((p,i)=>({p,q:face.q[i]})),polygons=[];
  for(const y of knots)if(y>minY+1e-8&&y<maxY-1e-8){polygons.push(cut(rest,y,false));rest=cut(rest,y,true);}
  polygons.push(rest);
  for(const polygon of polygons)for(let i=1;i+1<polygon.length;i++){
   const v=[polygon[0],polygon[i],polygon[i+1]],p=v.map(v=>v.p);if(Math.abs(cross(sub(p[1],p[0]),sub(p[2],p[0])))<1e-12)continue;
   faces.push({...face,p,q:v.map(v=>v.q)});nodeBudget+=3;if(nodeBudget>MAX_NODES)fail('budget-exceeded','La guida supera il limite dei nodi di calcolo.');
  }
 }
 return reparameterize({...chart,faces,nodeCount:nodeBudget},p=>[p[0]-offset(p[1]),p[1]],tick);
}
// A physical boundary must be transported piecewise through the complete
// computational triangulation. Mapping only its old native-grid vertices
// would replace a bend at a guide knot with a chord and move an exclusion.
function splitRingAtFaces(ring,faces,tick){
 const output=[];
 for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length],v=sub(b,a),size=dot(v,v),cuts=[0,1];
  if(size<1e-24)continue;
  for(const face of faces){
   tick();for(let j=0;j<3;j++){
    const c=face.p[j],d=face.p[(j+1)%3],w=sub(d,c),r=sub(c,a),den=cross(v,w);
    if(Math.abs(den)>1e-14){const t=cross(r,w)/den,u=cross(r,v)/den;if(t>0&&t<1&&u>=-1e-10&&u<=1+1e-10)cuts.push(t);}
    else if(Math.abs(cross(r,v))<1e-10){for(const p of [c,d]){const t=dot(sub(p,a),v)/size;if(t>0&&t<1)cuts.push(t);}}
   }
  }
  cuts.sort((a,b)=>a-b);
  for(let j=0;j<cuts.length-1;j++)if(!j||cuts[j]-cuts[j-1]>1e-10)output.push(mix(a,b,cuts[j]));
 }
 const distinct=output.filter((p,i)=>!i||norm(sub(p,output[i-1]))>1e-10);
 if(distinct.length>1&&norm(sub(distinct[0],distinct.at(-1)))<=1e-10)distinct.pop();
 return distinct;
}
function reparameterize(chart,transform,tick){
 const mapped=new Map();
 const point=(p,q)=>{const key=p.join(',');if(!mapped.has(key))mapped.set(key,transform(p,q));return mapped.get(key);};
 let metricError=0;
 const faces=chart.faces.map(f=>{
  const p=f.p.map((v,i)=>point(v,f.q[i])),e=sub(p[1],p[0]),v=sub(p[2],p[0]),det=cross(e,v);
  if(det>=-1e-14)fail('review-required','Curve di livello ramificate o guida ripiegata: disegno da rivedere.');
  const E=sub(f.q[1],f.q[0]),F=sub(f.q[2],f.q[0]),dx=mul(sub(mul(E,v[1]),mul(F,e[1])),1/det),dy=mul(sub(mul(F,e[0]),mul(E,v[0])),1/det);
  const g00=dot(dx,dx),g01=dot(dx,dy),g11=dot(dy,dy),gdet=g00*g11-g01*g01;
  metricError=Math.max(metricError,Math.abs(g00-1),Math.abs(g11-1),Math.abs(g01));
  return {...f,p,dx,dy,g00,g01,g11,gdet,gradientX:Math.sqrt(g11/gdet)};
 });
 const convert=p=>{
  for(let i=0;i<chart.faces.length;i++){const [a,b]=chart.bary(p,chart.faces[i].p);if(a>=-1e-7&&b>=-1e-7&&a+b<=1+1e-7){const f=faces[i];return add(f.p[0],add(mul(sub(f.p[1],f.p[0]),a),mul(sub(f.p[2],f.p[0]),b)));}}
  fail('uncovered','Guida fuori dalla superficie disponibile.');
 };
 const boundary=splitRingAtFaces(chart.boundary,chart.faces,tick).map(convert);verifyChartBoundary(boundary,tick);
 return {...chart,boundary,metricError,faces,ringToChart:r=>splitRingAtFaces(chart.ringToChart(r),chart.faces,tick).map(convert)};
}
// In a vertical chart slab every boundary crossing is affine in x and each
// face has constant along-row metric. Split additionally where the requested
// ground headland reaches a face edge: the resulting band polygons are exact
// on the piecewise-linear model, without raster sampling or row-count areas.
function clipRingToTriangle(ring,triangle){
 let output=ring.slice(0,-1);
 for(let edge=0;edge<triangle.length&&output.length;edge++){
  const a=triangle[edge],b=triangle[(edge+1)%triangle.length],v=sub(b,a),input=output;output=[];
  const side=p=>cross(v,sub(p,a)),tolerance=32*Number.EPSILON*(1+norm(v))*maxOf(input.map(p=>1+norm(sub(p,a))));
  for(let i=0;i<input.length;i++){
   const p=input[i],q=input[(i+1)%input.length],sp=side(p),sq=side(q),pi=sp<=tolerance,qi=sq<=tolerance;
   if(pi)output.push(p);
   if(pi!==qi){const t=Math.max(0,Math.min(1,sp/(sp-sq)));output.push(mix(p,q,t));}
  }
 }
 return output;
}
function headlandBands(chart,outer,holes,portion,headland,tick){
 if(!headland)return {horizontal:0,surface:0};
 const expr=(a,b)=>{const m=(b[1]-a[1])/(b[0]-a[0]);return [m,a[1]-m*a[0]];};
 const value=(a,x)=>a[0]*x+a[1],plus=(a,b)=>[a[0]+b[0],a[1]+b[1]],minus=(a,b)=>[a[0]-b[0],a[1]-b[1]];
 const crosses=(ring,x)=>{const out=[];for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if((a[0]<=x&&b[0]>x)||(b[0]<=x&&a[0]>x))out.push(expr(a,b));}return out.sort((a,b)=>value(a,x)-value(b,x));};
 const profile=(x,start,end)=>chart.faces.flatMap(f=>{const es=crosses(f.p,x);if(es.length<2)return [];const a=value(es[0],x)>value(start,x)?es[0]:start,b=value(es.at(-1),x)<value(end,x)?es.at(-1):end;return value(b,x)-value(a,x)>1e-8?[{a,b,speed:Math.sqrt(f.g11)}]:[];}).sort((a,b)=>value(a.a,x)-value(b.a,x));
 const rawX=[...outer.map(p=>p[0]),...chart.faces.flatMap(f=>f.p.map(p=>p[0]))].sort((a,b)=>a-b),xs=rawX.filter((x,i)=>!i||x-rawX[i-1]>1e-7),roots=[];
 for(let i=1;i<xs.length;i++){
  tick();const lo=xs[i-1],hi=xs[i],mid=(lo+hi)/2,ends=crosses(outer,mid);
  for(let j=0;j+1<ends.length;j+=2){
   const cells=profile(mid,ends[j],ends[j+1]);
   const root=(v,target)=>{if(Math.abs(v[0])<1e-12)return;const x=(target-v[1])/v[0];if(x>lo+1e-7&&x<hi-1e-7)roots.push(x);};
   for(const order of [cells,[...cells].reverse()]){let cum=[0,0];for(const c of order){cum=plus(cum,mul(minus(c.b,c.a),c.speed));root(cum,headland);}root(cum,headland*2);}
  }
 }
 const all=[...xs,...roots].sort((a,b)=>a-b),breaks=all.filter((x,i)=>!i||x-all[i-1]>1e-7),region=portion.geometry.map(chart.ringToChart);
 const available=holes.length?clipping.difference(region,...holes.map(h=>[h])):[region];
 const area=ring=>{let a=0;for(let i=0;i<ring.length;i++)a+=cross(ring[i],ring[(i+1)%ring.length]);return Math.abs(a)/2;};
 let surface=0,horizontal=0;
 for(let i=1;i<breaks.length;i++){
  tick();const lo=breaks[i-1],hi=breaks[i],mid=(lo+hi)/2,ends=crosses(outer,mid);
  for(let j=0;j+1<ends.length;j+=2){
   const start=ends[j],end=ends[j+1],cells=profile(mid,start,end),total=cells.reduce((s,c)=>s+(value(c.b,mid)-value(c.a,mid))*c.speed,0);
   const reach=reverse=>{let remaining=headland;for(const c of reverse?[...cells].reverse():cells){const span=(value(c.b,mid)-value(c.a,mid))*c.speed;if(remaining<=span+1e-9){let prior=[0,0];for(const prev of reverse?[...cells].reverse():cells){if(prev===c)break;prior=plus(prior,mul(minus(prev.b,prev.a),prev.speed));}const travel=mul(minus([0,headland],prior),1/c.speed);return reverse?minus(c.b,travel):plus(c.a,travel);}remaining-=span;}return reverse?start:end;};
   const bands=total<=2*headland?[[start,end]]:[[start,reach(false)],[reach(true),end]];
   for(const [a,b] of bands){
    const quad=[[lo,value(a,lo)],[hi,value(a,hi)],[hi,value(b,hi)],[lo,value(b,lo)],[lo,value(a,lo)]];
    const band=quad.slice(0,-1).reverse(),physical=available.map(p=>p.map(r=>{const closed=r.length&&norm(sub(r[0],r.at(-1)))<1e-12?r:[...r,r[0]];const cut=clipRingToTriangle(closed,band);return cut.length?[...cut,cut[0]]:[];}));
    if(!physical.some(p=>p[0].length))continue;
    for(const f of chart.faces){
     tick();if(Math.max(...f.p.map(p=>p[0]))<lo||Math.min(...f.p.map(p=>p[0]))>hi)continue;
     const chartArea=physical.reduce((sum,p)=>sum+area(clipRingToTriangle(p[0],f.p))-p.slice(1).reduce((v,r)=>v+area(clipRingToTriangle(r,f.p)),0),0);
     surface+=chartArea*Math.sqrt(f.gdet);horizontal+=chartArea*Math.abs(cross(f.dx,f.dy));
    }
   }
  }
 }
 return {surface,horizontal};
}
// A retained curved family has its own continuous area chart. Loft adjacent
// observed legacy axes, then intersect that chart with the native DEM faces.
// Thus area bands follow the same curves as physical rows, including the
// terminal tangent extension to the original perimeter.
function retainedFamilyChart(base,family,polygon,tick,requiredAxes){
 const requiredDistances=requiredAxes.map(a=>a.distance);
 const count=maxOf(family.candidates.map(c=>c.sampleCount)),byDistance=new Map();
 for(const c of family.candidates){const prior=byDistance.get(c.distance);if(!prior||c.coordinates.length>prior.coordinates.length)byDistance.set(c.distance,c);}
 const candidates=[...byDistance.values()].sort((a,b)=>a.distance-b.distance);
 if(candidates.length<2||count<2||requiredDistances.some(d=>!byDistance.has(d)))fail('review-required','Famiglia curva non raccordabile per il calcolo delle capezzagne.');
 const local=p=>sub(toUTM(p,base.epsg),base.origin.slice(0,2)),outer=polygon.map(local),bounds=[minOf(outer.map(p=>p[0])),minOf(outer.map(p=>p[1])),maxOf(outer.map(p=>p[0])),maxOf(outer.map(p=>p[1]))];
 const reach=2*Math.hypot(bounds[2]-bounds[0],bounds[3]-bounds[1])+10;
 const axes=candidates.map(c=>{
  const points=c.coordinates.map(local),first=sub(points[0],points[1]),last=sub(points.at(-1),points.at(-2)),missing=c.sampleStart??0;
  const complete=[...Array.from({length:missing},(_,i)=>add(points[0],mul(first,missing-i))),...points,...Array.from({length:count-missing-points.length},(_,i)=>add(points.at(-1),mul(last,i+1)))];
  return {distance:c.distance,points:[add(complete[0],mul(first,reach/norm(first))),...complete,add(complete.at(-1),mul(last,reach/norm(last)))]};
 });
 // A truncated/split legacy candidate is usable only if its actual retained
 // physical rows lie on the selected continuous completion of that same axis.
 for(const required of requiredAxes){
  const axis=axes.find(a=>a.distance===required.distance);
  for(const point of required.fragments.flatMap(f=>f.points)){
   let distance=Infinity;
   for(let j=1;j<axis.points.length;j++){const a=axis.points[j-1],b=axis.points[j],v=sub(b,a),t=Math.max(0,Math.min(1,dot(sub(point.slice(0,2),a),v)/dot(v,v)));distance=Math.min(distance,norm(sub(point.slice(0,2),mix(a,b,t))));}
   if(distance>1e-4)fail('review-required','Frammenti della guida incompatibili con la famiglia delle capezzagne.');
  }
 }
 const overlaps=(xy,b)=>maxOf(xy.map(p=>p[0]))>=b[0]-1e-8&&minOf(xy.map(p=>p[0]))<=b[2]+1e-8&&maxOf(xy.map(p=>p[1]))>=b[1]-1e-8&&minOf(xy.map(p=>p[1]))<=b[3]+1e-8;
 const native=base.faces.filter(f=>overlaps(f.q,bounds)).map(f=>({...f,xy:f.q.map(p=>p.slice(0,2)),bounds:[minOf(f.q.map(p=>p[0])),minOf(f.q.map(p=>p[1])),maxOf(f.q.map(p=>p[0])),maxOf(f.q.map(p=>p[1]))]}));
 const faces=[],constantElevation=base.xyz.every(p=>p[2]===base.xyz[0][2]);
 for(let i=1;i<axes.length;i++)for(let j=1;j<axes[i].points.length;j++){
  const a=axes[i-1],b=axes[i],corners=[a.points[j-1],a.points[j],b.points[j],b.points[j-1]],params=[[a.distance,j-1],[a.distance,j],[b.distance,j],[b.distance,j-1]];
  for(const ids of [[0,1,2],[0,2,3]]){
   tick();const xy=ids.map(k=>corners[k]),uv=ids.map(k=>params[k]);if(!overlaps(xy,bounds))continue;
   if(cross(sub(xy[1],xy[0]),sub(xy[2],xy[0]))>=-1e-12)fail('review-required','La famiglia curva si ripiega tra filari.');
   for(const f of constantElevation?[{xy,q:xy.map(p=>[...p,base.xyz[0][2]]),bounds}]:native){
    if(!overlaps(xy,f.bounds))continue;tick();const clipped=(constantElevation?xy:clipRingToTriangle([...f.xy,f.xy[0]],xy)).filter((p,k,all)=>!k||norm(sub(p,all[k-1]))>1e-9);
    if(clipped.length>1&&norm(sub(clipped[0],clipped.at(-1)))<1e-9)clipped.pop();
    const vertices=clipped.map(point=>{const [s,t]=base.bary(point,xy),[u,v]=base.bary(point,f.xy);return {p:add(uv[0],add(mul(sub(uv[1],uv[0]),s),mul(sub(uv[2],uv[0]),t))),q:[...point,f.q[0][2]+u*(f.q[1][2]-f.q[0][2])+v*(f.q[2][2]-f.q[0][2])]};});
    for(let k=2;k<vertices.length;k++){
     const tri=[vertices[0],vertices[k-1],vertices[k]],p=tri.map(v=>v.p),q=tri.map(v=>v.q),e=sub(p[1],p[0]),v=sub(p[2],p[0]),det=cross(e,v);if(Math.abs(det)<1e-12)continue;
     if(det>0)fail('review-required','Orientamento della famiglia curva non verificabile.');
     const E=sub(q[1],q[0]),F=sub(q[2],q[0]),dx=mul(sub(mul(E,v[1]),mul(F,e[1])),1/det),dy=mul(sub(mul(F,e[0]),mul(E,v[0])),1/det),g00=dot(dx,dx),g01=dot(dx,dy),g11=dot(dy,dy),gdet=g00*g11-g01*g01;
     faces.push({p,q,dx,dy,g00,g01,g11,gdet});
    }
   }
  }
 }
 if(faces.length>MAX_NODES)fail('budget-exceeded','Superato il limite dei nodi di calcolo.');
 const xyFaces=faces.map(f=>({p:f.q.map(p=>p.slice(0,2))}));
 const convert=point=>{
  let mapped=null;
  for(let i=0;i<faces.length;i++){
   const [a,b]=base.bary(point,xyFaces[i].p);if(a>=-1e-8&&b>=-1e-8&&a+b<=1+1e-8){const f=faces[i],p=add(f.p[0],add(mul(sub(f.p[1],f.p[0]),a),mul(sub(f.p[2],f.p[0]),b)));if(mapped&&norm(sub(p,mapped))>1e-5)fail('review-required','La famiglia curva si sovrappone sul perimetro.');mapped=p;}
  }
  if(!mapped)fail('review-required','Famiglia curva incompleta sul perimetro originario.');return mapped;
 };
 const ringToChart=ring=>splitRingAtFaces(ring.slice(0,-1).map(local),xyFaces,tick).map(convert),boundary=ringToChart(polygon);verifyChartBoundary(boundary,tick);
 return {...base,faces,boundary,ringToChart};
}
function preservedFlatFamily({project,model,portion,portions,baseChart,tick,diagnosticPhase}){
 const headland=Math.max(0,Number(project.headlandWidthM)||0),input=inputs(project);
 const angle=(Number(portion.orientationDeg)||0)*Math.PI/180,normal=[Math.cos(angle),Math.sin(angle)],tangent=[-Math.sin(angle),Math.cos(angle)];
 const ref=input.polygon.slice(0,-1).reduce((a,p)=>add(a,p),[0,0]).map(v=>v/(input.polygon.length-1));
 const phase=p=>dot([(p[0]-ref[0])*Math.cos(ref[1]*Math.PI/180),p[1]-ref[1]],normal);
 const design=portion.mode==='local'?portion:(portion.inheritedDesign??portion);
 const observedFamilies=new Map();
 const legacyRows=width=>{
  const curves=portion.mode==='local'||design.rowCurvePoints?.length;
  let rows;
  if(curves)rows=generateCurvedRows({polygon:input.polygon,...(portion.mode==='local'?{guidePolygon:portion.geometry[0],rowOwnership:{portionId:portion.id,portions}}:{}),orientationDeg:design.orientationDeg,rowSpacingM:input.rowSpacingM,rowCurvePoints:design.rowCurvePoints,maintainEquidistance:design.maintainRowEquidistance!==false,exclusions:project.exclusions??[],headlandWidthM:width,includeTerrainAxes:true,onTerrainFamily:width===0?family=>observedFamilies.set(family.id,family):null});
  else{
   const raw=generateRows(input.polygon,input.rowSpacingM,design.orientationDeg),physical=generateRows(input.polygon,input.rowSpacingM,design.orientationDeg,{headlandWidthM:width,exclusions:(project.exclusions??[]).map(e=>Array.isArray(e)?e:e.geometry)});
   rows=physical.map(r=>{const distance=phase(r.start),axis=raw.find(a=>Math.abs(phase(a.start)-distance)<1e-10);return {...r,terrainAxisDistance:distance,terrainAxisFamily:'whole',terrainAxisCoordinates:axis?[axis.start,axis.end]:[r.start,r.end]};});
  }
  return rows.filter(r=>rowOwnerId({coordinates:r.coordinates??[r.start,r.end],portions})===portion.id);
 };
 diagnosticPhase('clipping');
 const untrimmed=legacyRows(0),expected=legacyRows(headland);if(!untrimmed.length)return null;
 const holes=(project.exclusions??[]).map(e=>(Array.isArray(e)?e:e.geometry).map(p=>sub(toUTM(p,baseChart.epsg),baseChart.origin.slice(0,2))));
 const inside=(p,ring)=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
 const clipPhysical=points=>{
  const fragments=[];let current=[];const end=()=>{if(current.length>1)fragments.push(current);current=[];};
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],v=sub(b,a),ts=[0,1];
   for(const ring of holes)for(let j=1;j<ring.length;j++){const c=ring[j-1],d=ring[j],w=sub(d,c),den=cross(v,w);if(Math.abs(den)<1e-14)continue;const t=cross(sub(c,a),w)/den,u=cross(sub(c,a),v)/den;if(t>0&&t<1&&u>=0&&u<=1)ts.push(t);}
   ts.sort((a,b)=>a-b);
   for(let j=1;j<ts.length;j++){const lo=ts[j-1],hi=ts[j];if(hi-lo<1e-12)continue;if(holes.some(h=>inside(mix(a,b,(lo+hi)/2),h))){end();continue;}if(!current.length)current.push(mix(a,b,lo));current.push(mix(a,b,hi));}
  }
  end();return fragments;
 };

 const lift=coordinates=>{
  const points=[];
  for(let i=1;i<coordinates.length;i++)for(const xy of baseChart.splitXY(toUTM(coordinates[i-1],baseChart.epsg),toUTM(coordinates[i],baseChart.epsg)).slice(0,-1)){
   const z=sampleTerrain(model,fromUTM(xy,baseChart.epsg));if(z==null)fail('uncovered','Filare non coperto.');points.push([...sub(xy,baseChart.origin.slice(0,2)),z-baseChart.origin[2]]);
  }
  const xy=toUTM(coordinates.at(-1),baseChart.epsg),z=sampleTerrain(model,coordinates.at(-1));if(z==null)fail('uncovered','Filare non coperto.');points.push([...sub(xy,baseChart.origin.slice(0,2)),z-baseChart.origin[2]]);return points;
 };
 const toGeo=points=>points.map(p=>fromUTM(add(p.slice(0,2),baseChart.origin.slice(0,2)),baseChart.epsg));
 const outerRing=input.polygon.map(p=>sub(toUTM(p,baseChart.epsg),baseChart.origin.slice(0,2)));
 const extendToBoundary=original=>{
  let points=original;
  for(const front of [true,false]){
   const tip=(front?points[0]:points.at(-1)).slice(0,2),neighbor=(front?points.slice(1):points.slice(0,-1).reverse()).find(p=>norm(sub(p.slice(0,2),tip))>1e-8);
   if(!neighbor)continue;const direction=sub(tip,neighbor.slice(0,2));let onBoundary=false,reach=Infinity,closest=Infinity,distance=Infinity;
   for(let j=1;j<outerRing.length;j++){
    const a=outerRing[j-1],b=outerRing[j],edge=sub(b,a),offset=sub(a,tip),size=dot(edge,edge),u=Math.max(0,Math.min(1,dot(sub(tip,a),edge)/size));
    const gap=norm(sub(tip,mix(a,b,u)));distance=Math.min(distance,gap);if(gap<1e-7){onBoundary=true;break;}
    const den=cross(direction,edge);if(Math.abs(den)<1e-16)continue;const t=cross(offset,edge)/den,v=cross(offset,direction)/den;
    if(v>=0&&v<=1){if(t>0)reach=Math.min(reach,t);if(Math.abs(t)<Math.abs(closest))closest=t;}
   }
   if(onBoundary)continue;
   if(!inside(tip,outerRing)&&distance<=.001)reach=closest;
   else if(!inside(tip,outerRing))fail('review-required','La guida conservata esce dal perimetro originario.');
   if(!Number.isFinite(reach))fail('review-required','Estremità della guida non raccordabile al perimetro originario.');
   const boundary=add(tip,mul(direction,reach)),extra=lift([tip,boundary].map(p=>fromUTM(add(p,baseChart.origin.slice(0,2)),baseChart.epsg)));
   points=front?[...extra.slice(1).reverse(),...(reach<0?points.slice(1):points)]:[...(reach<0?points.slice(0,-1):points),...extra.slice(1)];
  }
  return points;
 };
 const axisKey=r=>`${r.terrainAxisFamily}:${r.terrainAxisDistance}`;
 const axes=[];
 for(const original of untrimmed){
  tick();const key=axisKey(original);let axis=axes.find(a=>a.key===key);if(!axis){axis={key,distance:original.terrainAxisDistance,fragments:[],raw:new Set()};axes.push(axis);}
  if(!headland)axis.fragments.push({original,points:lift(original.coordinates??[original.start,original.end])});
  else{
   const identity=JSON.stringify(original.terrainAxisCoordinates);if(axis.raw.has(identity))continue;axis.raw.add(identity);
   for(const points of clipPhysical(trim(extendToBoundary(lift(original.terrainAxisCoordinates)),headland))){const coordinates=toGeo(points);if(rowOwnerId({coordinates,portions})===portion.id&&length(points)>=.05)axis.fragments.push({points});}
  }
 }
 axes.sort((a,b)=>a.distance-b.distance||a.key.localeCompare(b.key));
 for(const axis of axes){
  const originals=expected.filter(r=>axisKey(r)===axis.key);if(originals.length!==axis.fragments.length)fail('review-required','La capezzagna cambia i frammenti della famiglia conservata: verificare il disegno.');
  axis.fragments.forEach((fragment,i)=>{fragment.original=originals[i];fragment.range=[minOf(fragment.points.map(p=>dot(p.slice(0,2),tangent))),maxOf(fragment.points.map(p=>dot(p.slice(0,2),tangent)))];});
 }
 const range=(points,lo,hi)=>{const out=[];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],ta=dot(a.slice(0,2),tangent),tb=dot(b.slice(0,2),tangent),span=tb-ta;if(Math.abs(span)<1e-12)continue;let s=(lo-ta)/span,t=(hi-ta)/span;if(s>t)[s,t]=[t,s];s=Math.max(0,s);t=Math.min(1,t);if(t>s){if(!out.length)out.push(mix(a,b,s));out.push(mix(a,b,t));}}return out;};
 diagnosticPhase('distances');
 const certificates=[];
 for(let k=1;k<axes.length;k++){
  let lower=Infinity,upper=Infinity;
  for(const a of axes[k-1].fragments)for(const b of axes[k].fragments){
   const lo=Math.max(a.range[0],b.range[0]),hi=Math.min(a.range[1],b.range[1]);if(hi<=lo)continue;const ap=range(a.points,lo,hi),bp=range(b.points,lo,hi);
   for(let i=1;i<ap.length;i++)for(let j=1;j<bp.length;j++){tick();const pair=segmentBound(ap[i-1],ap[i],bp[j-1],bp[j]);lower=Math.min(lower,pair.lower);if(pair.d<upper)upper=Math.min(upper,terrainPolylineLength(model,toGeo([pair.p,pair.q]))+pair.roundoff);}
  }
  if(lower!==Infinity){if(lower<input.rowSpacingM||upper-lower>ERROR_TARGET||(baseChart.metricError>=1e-9&&lower-input.rowSpacingM<2*(upper-lower)))return null;certificates.push({lower,upper});}
 }
 const rows=axes.flatMap((axis,i)=>axis.fragments.map(({original,points},j)=>{
  const {terrainAxisCoordinates,terrainAxisDistance,terrainAxisFamily,...legacy}=original,coordinates=toGeo(points);if(!headland){coordinates[0]=original.start;coordinates[coordinates.length-1]=original.end;}
  return {...legacy,coordinates,start:coordinates[0],end:coordinates.at(-1),axisId:`${portion.id}:terrain-axis:${i}`,fragmentId:`${portion.id}:terrain-axis:${i}:fragment:${j}`,portionId:portion.id,lengthM:original.lengthM,surfaceLengthM:terrainPolylineLength(model,coordinates),quantityBasis:'certified-flat-legacy',horizontalLengthM:length(points.map(p=>p.slice(0,2)))};
 }));
 const result=totals(rows,input.postSpacingM,input.plantSpacingM);
 let chart=rotateChart(baseChart,angle);
 if(headland&&design.rowCurvePoints?.length){
  if(observedFamilies.size!==1)fail('review-required','Capezzagne di più famiglie curve da verificare separatamente.');
  chart=retainedFamilyChart(baseChart,[...observedFamilies.values()][0],input.polygon,tick,axes);
 }
 const outer=chart.ringToChart(input.polygon),chartHoles=(project.exclusions??[]).map(e=>chart.ringToChart(Array.isArray(e)?e:e.geometry));
 diagnosticPhase('headlands');
 const headlandArea=headlandBands(chart,outer,chartHoles,portion,headland,tick);
 return {...result,id:portion.id,label:portion.label,headlandArea,rawHorizontal:result.horizontalRowLinearM,rawSurface:result.rowLinearM,design:{guide:'certified-legacy-family',orientationRad:angle,phase:'legacy',spacingChartM:null,axisCount:axes.length,followTerrain:false},validation:{valid:true,method:'supporting-plane-legacy-family',minimumSpacingLowerM:certificates.length?minOf(certificates.map(c=>c.lower)):input.rowSpacingM,errorBoundM:certificates.length?maxOf(certificates.map(c=>c.upper-c.lower)):0,roundoffBoundM:0,pairCount:certificates.length}};
}

function portionElevationRange(chart,portion,tick){
 const region=portion.geometry.map(r=>r.map(p=>sub(toUTM(p,chart.epsg),chart.origin.slice(0,2)))),points=region.flat(),bounds=[minOf(points.map(p=>p[0])),minOf(points.map(p=>p[1])),maxOf(points.map(p=>p[0])),maxOf(points.map(p=>p[1]))];
 // Extrema of an affine face occur at vertices of its actual polygon clip:
 // native vertices, portion vertices, and their edge intersections. Enumerate
 // these directly, avoiding boolean-sweep ambiguity at coincident DEM edges.
 const location=(point,ring)=>{let inside=false;for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i],v=sub(b,a),w=sub(point,a),d=dot(v,v),t=d?Math.max(0,Math.min(1,dot(w,v)/d)):0;if(norm(sub(point,mix(a,b,t)))<1e-8)return 0;if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside?1:-1;};
 const inRegion=p=>location(p,region[0])>=0&&!region.slice(1).some(r=>location(p,r)>0);
 let min=Infinity,max=-Infinity;
 for(const face of chart.faces){
  tick();const xy=face.q.map(p=>p.slice(0,2));if(maxOf(xy.map(p=>p[0]))<bounds[0]||minOf(xy.map(p=>p[0]))>bounds[2]||maxOf(xy.map(p=>p[1]))<bounds[1]||minOf(xy.map(p=>p[1]))>bounds[3])continue;
  const vertices=xy.filter(inRegion);
  for(const ring of region){
   for(const p of ring){const [a,b]=chart.bary(p,xy);if(a>=-1e-10&&b>=-1e-10&&a+b<=1+1e-10&&inRegion(p))vertices.push(p);}
   for(let i=1;i<ring.length;i++)for(let j=0;j<3;j++){const a=ring[i-1],b=ring[i],c=xy[j],d=xy[(j+1)%3],v=sub(b,a),w=sub(d,c),den=cross(v,w);if(Math.abs(den)<1e-16)continue;const r=sub(c,a),t=cross(r,w)/den,u=cross(r,v)/den;if(t>=0&&t<=1&&u>=0&&u<=1){const p=mix(a,b,t);if(inRegion(p))vertices.push(p);}}
  }
  for(const point of vertices){const [a,b]=chart.bary(point,xy),z=face.q[0][2]+a*(face.q[1][2]-face.q[0][2])+b*(face.q[2][2]-face.q[0][2]);min=Math.min(min,z);max=Math.max(max,z);}
 }
 if(!Number.isFinite(min)||!Number.isFinite(max))fail('uncovered','La porzione non è coperta dal modello.');
 return max-min;
}
function designPortion({project,model,portion,portions,baseChart,followTerrain,tick,diagnosticPhase}){
 diagnosticPhase('guide');
 let angle=(Number(portion.orientationDeg)||0)*Math.PI/180;
 const range=portionElevationRange(baseChart,portion,tick);
 if(range<=.01){
  const preserved=preservedFlatFamily({project,model,portion,portions,baseChart,tick,diagnosticPhase});
  if(preserved)return preserved;
  diagnosticPhase('guide');
 }
 if(followTerrain&&range>.01){
  // Deterministic contour-inspired direction from the anchor face. The full
  // family follows the continuous native-face chart, not a planar translation.
  const anchor=toUTM(portion.anchor,baseChart.epsg),p=baseChart.mapXY(anchor);
  let face=baseChart.faces.find(f=>{const [a,b]=baseChart.bary(p,f.p);return a>=-1e-7&&b>=-1e-7&&a+b<=1+1e-7;});
  if(face){const gx=face.dx[2],gy=face.dy[2];if(Math.hypot(gx,gy)>1e-8)angle=Math.atan2(gy,gx);}
 }
 const previous=project.terrain?.applied,priorInput=previous?.inputs?.rowPortions?.find(p=>p.id===portion.id),priorDesign=previous?.portionResults?.find(p=>p.id===portion.id)?.design;
 const sameGuide=priorInput&&terrainInputHash({orientationDeg:priorInput.orientationDeg,rowCurvePoints:priorInput.rowCurvePoints,mode:priorInput.mode})===terrainInputHash({orientationDeg:portion.orientationDeg,rowCurvePoints:portion.rowCurvePoints,mode:portion.mode});
 const retainedAutomatic=!followTerrain&&sameGuide&&priorDesign?.guideCoordinates?.length&&previous.snapshotHash===snapshotHash(previous);
 if(retainedAutomatic)angle=priorDesign.orientationRad;
 let chart=rotateChart(baseChart,angle);
 let automaticGuide=null,guideCoordinates=null;
 if(retainedAutomatic){const c=Math.cos(angle),s=Math.sin(angle);guideCoordinates=clone(priorDesign.guideCoordinates);automaticGuide=guideCoordinates.map(p=>{const q=baseChart.mapXY(toUTM(p,chart.epsg));return [q[0]*c+q[1]*s,-q[0]*s+q[1]*c];});chart=shearGuide(chart,automaticGuide,tick);}
 if(followTerrain&&range>.01){const selected=contourGuide(chart,model,portion,tick);automaticGuide=selected.points;angle+=selected.rotation;chart=rotateChart(chart,selected.rotation);guideCoordinates=automaticGuide.map(p=>{for(const f of chart.faces){const [a,b]=chart.bary(p,f.p);if(a>=-1e-7&&b>=-1e-7&&a+b<=1+1e-7){const q=add(f.q[0],add(mul(sub(f.q[1],f.q[0]),a),mul(sub(f.q[2],f.q[0]),b)));return fromUTM(add(q.slice(0,2),chart.origin.slice(0,2)),chart.epsg);}}fail('uncovered','Guida non coperta.');});chart=shearGuide(chart,automaticGuide,tick);}
 if(!followTerrain&&!retainedAutomatic&&portion.rowCurvePoints?.length){
  const boundary=chart.ringToChart(portion.geometry[0]),ys=boundary.map(p=>p[1]),lo=Math.min(...ys),span=Math.max(...ys)-lo;
  const nodes=[{position:0,offsetM:0},...portion.rowCurvePoints,{position:1,offsetM:0}].sort((a,b)=>a.position-b.position);
  chart=shearGuide(chart,nodes.map(n=>[n.offsetM,lo+n.position*span]),tick);
 }
 diagnosticPhase('clipping');
 const outer=chart.ringToChart(project.geometry??project.polygon),holes=(project.exclusions??[]).map(e=>chart.ringToChart(Array.isArray(e)?e:e.geometry));
 const guide=chart.ringToChart(portion.mode==='local'?portion.geometry[0]:project.geometry??project.polygon),minX=Math.min(...guide.map(p=>p[0])),maxX=Math.max(...guide.map(p=>p[0]));
 const spacing=Number(project.rowSpacingM),headland=Math.max(0,Number(project.headlandWidthM)||0),postSpacing=Number(project.postSpacingM),plantSpacing=Number(project.plantSpacingM);
 const isometric=chart.metricError<1e-9;
 const maxGradient=maxOf(chart.faces.map(gradientUpper));
 const arithmeticMargin=4096*Number.EPSILON*(1+maxOf(baseChart.xyz.map(norm))+spacing);
 let gap=(spacing+(isometric?arithmeticMargin:.02))*maxGradient,last=null,axisIndex=0,rows=[],certificates=[],rawHorizontal=0,rawSurface=0;
 for(let x=minX+gap/2;x<maxX-1e-7;x+=gap){
  tick();const raw=intervals(outer,x),cuts=holes.flatMap(h=>intervals(h,x)),physical=[];
  for(const [a,b] of raw){
   const full=faceLine(chart,x,a,b,tick),trimmed=trim(full,headland);if(!trimmed.length)continue;
   const lo=trimmed[0][3],hi=trimmed.at(-1)[3];
   for(const [u,v] of subtract([[lo,hi]],cuts)){
    const points=faceLine(chart,x,u,v,tick),coordinates=points.map(p=>fromUTM(add(p.slice(0,2),chart.origin.slice(0,2)),chart.epsg));
    if(rowOwnerId({coordinates,portions})!==portion.id)continue;
    const lengthM=length(points.map(p=>p.slice(0,3)));if(lengthM<.05)continue;
    const axisId=`${portion.id}:terrain-axis:${axisIndex}`,fragmentId=`${axisId}:fragment:${physical.length}`;
    physical.push([u,v]);rows.push({axisId,fragmentId,portionId:portion.id,coordinates,start:coordinates[0],end:coordinates.at(-1),lengthM,surfaceLengthM:lengthM,quantityBasis:'model-surface',horizontalLengthM:length(points.map(p=>p.slice(0,2))),sourceDistance:x-minX});
   }
   // Ground headlands are removed before physical exclusions, never at roads.
   for(const [u,v] of subtract([[a,b]],cuts)){
    const points=faceLine(chart,x,u,v,tick),coordinates=points.map(p=>fromUTM(add(p.slice(0,2),chart.origin.slice(0,2)),chart.epsg));
    if(rowOwnerId({coordinates,portions})===portion.id){rawSurface+=length(points.map(p=>p.slice(0,3)));rawHorizontal+=length(points.map(p=>p.slice(0,2)));}
   }
  }
  const current={x,intervals:physical};
  if(last&&physical.length&&last.intervals.length){
   diagnosticPhase('distances');
   const certificate=spacingCertificate(chart,last,current,model,tick);
   diagnosticPhase('clipping');
   if(certificate){
    if(certificate.lower<spacing||certificate.error>ERROR_TARGET)fail('review-required','Interfila non certificabile entro 1 cm: disegno da rivedere.');
    certificates.push(certificate);
   }
  }
  last=current;axisIndex++;
 }
 if(!rows.length)fail('review-required','La guida non produce filari coltivabili verificabili.');
 const result=totals(rows,postSpacing,plantSpacing);
 diagnosticPhase('headlands');
 const headlandArea=headlandBands(chart,outer,holes,portion,headland,tick);
 return {...result,headlandArea,id:portion.id,label:portion.label,design:{guide:automaticGuide?'native-contour-distance-family':'continuous-face-chart',guidePoints:automaticGuide,guideCoordinates,orientationRad:angle,phase:gap/2,spacingChartM:gap,axisCount:axisIndex,followTerrain},validation:{valid:true,nodeCount:chart.nodeCount??chart.xyz.length,method:'continuous-face-chart/supporting-plane-and-scalar-bounds',minimumSpacingLowerM:certificates.length?Math.min(...certificates.map(c=>c.lower)):spacing,errorBoundM:certificates.length?Math.max(...certificates.map(c=>c.error)):0,roundoffBoundM:Math.max(0,...certificates.map(c=>c.roundoff)),pairCount:certificates.length},rawHorizontal,rawSurface};
}
export function buildTerrainProposal({project,model,portionId=null,followTerrain=true,recomputeAll=false,deadlineMs,onPhase,algorithmVersion,mode,budget,manualGroundSpacing=false}={}){
 if(algorithmVersion==='terrain-contour-family-1'){
  const selectedMode=mode??(followTerrain?'adapt':'measure');
  try{
   const operationBudget=budget??createTerrainBudget({kind:selectedMode==='measure'?'measure':'adapt',deadlineMs});
   return buildContourTerrainProposal({project,model,portionId,mode:selectedMode,recomputeAll,manualGroundSpacing,budget:operationBudget});
  }catch(error){return {ok:false,status:error.status??'invalid-input',kind:selectedMode,message:error.message};}
 }
 if(algorithmVersion!==undefined&&algorithmVersion!==VERSION)return {ok:false,status:'unsupported-algorithm',message:'Versione del motore terreno non supportata.'};
 if(deadlineMs===undefined)deadlineMs=10000;
 const started=Date.now();let work=0,currentPhase=null,phaseStarted=0;
 // Diagnostic observers are outside inputs, persisted envelopes and hashes.
 // A broken observer must not change a usable proposal or its failure status.
 const diagnosticPhase=name=>{
  if(typeof onPhase!=='function')return;
  if(currentPhase!==null){const event={name:currentPhase,elapsedMs:performance.now()-phaseStarted};try{onPhase(event);}catch{}}
  currentPhase=name;phaseStarted=performance.now();
 };
 const tick=()=>{if(++work%64===0&&Date.now()-started>=Math.min(10000,deadlineMs))fail('budget-exceeded','Tempo di calcolo superato. Il progetto precedente è conservato.');};
 try{
  if(!(deadlineMs>0))fail('budget-exceeded','Tempo di calcolo superato.');
  if(!project||!validateTerrainModel(model).valid)fail('invalid-model','Modello del terreno non valido.');
  const field=Object.fromEntries(FIELD_KEYS.filter(k=>k!=='terrain').map(k=>[k,project[k]]));
  if(new TextEncoder().encode(JSON.stringify({model,...field})).length>1048576)fail('size-exceeded','Il modello supera il limite di 1 MiB per campo.');
  const input=inputs(project),polygon=input.polygon;
  if(!Array.isArray(polygon)||polygon.length<4||!(input.rowSpacingM>0)||!(input.plantSpacingM>0))fail('invalid-input','Perimetro o distanze non validi.');
  const portions=resolveRowPortions(input);if(!portions.length)fail('invalid-input','Nessuna porzione coltivabile.');
  if(portionId&&!portions.some(p=>p.id===portionId))fail('invalid-input','Porzione non più disponibile.');
  diagnosticPhase('chart');
  const baseChart=chartFor(model,tick),before=calculateProject({...input,terrain:project.terrain??null});
  const previous=project.terrain?.applied,local=!!(!recomputeAll&&previous&&portionId&&project.terrain.model.contentHash===model.contentHash);
  const oldInputs=previous?.inputs;
  if(local){
   if(previous.snapshotHash!==snapshotHash(previous)||previous.inputHash!==terrainDesignInputHash(previous.inputs,model))fail('invalid-applied','Il disegno applicato non supera il controllo di integrità. Ricalcolare il campo.');
   const unchanged={...input,rowPortions:input.rowPortions.filter(p=>p.id!==portionId)};
   const old={...oldInputs,rowPortions:(oldInputs?.rowPortions??[]).filter(p=>p.id!==portionId)};
   if(terrainInputHash(unchanged)!==terrainInputHash(old))fail('review-required','Sono cambiati altri parametri: ricalcolare tutte le porzioni.');
  }
  const portionResults=[];
  for(const portion of portions){
   if(local&&portion.id!==portionId){const saved=previous.portionResults.find(p=>p.id===portion.id);if(!saved)fail('review-required','Porzioni cambiate: ricalcolare il campo.');portionResults.push(clone(saved));continue;}
   portionResults.push(designPortion({project,model,portion,portions,baseChart,followTerrain:followTerrain&&(!portionId||portion.id===portionId),tick,diagnosticPhase}));
  }
  diagnosticPhase('envelope');
  const rows=portionResults.flatMap(p=>p.rows),metrics=polygonMetrics(polygon),surfaceAreaM2=terrainSurfaceArea(model,polygon);
  const usableAreaM2=portions.reduce((s,p)=>s+polygonMetrics(p.geometry[0]).areaM2-p.geometry.slice(1).reduce((a,r)=>a+polygonMetrics(r).areaM2,0),0);
  const usableSurface=portions.reduce((s,p)=>s+terrainSurfaceArea(model,{type:'Polygon',coordinates:p.geometry}),0);
  const sum=totals(rows,input.postSpacingM,input.plantSpacingM);
  // Integrate the physical ground headland polygons in both metrics.
  const surfaceHeadlandAreaM2=Math.min(usableSurface,portionResults.reduce((s,p)=>s+p.headlandArea.surface,0));
  const headlandAreaM2=Math.min(usableAreaM2,portionResults.reduce((s,p)=>s+p.headlandArea.horizontal,0));
  const netAreaM2=Math.max(0,usableAreaM2-headlandAreaM2),surfaceNetAreaM2=Math.max(0,usableSurface-surfaceHeadlandAreaM2),theoreticalPlants=Math.ceil(surfaceNetAreaM2/(input.rowSpacingM*input.plantSpacingM));
  const result={...metrics,...sum,portions,excludedAreaM2:Math.max(0,metrics.areaM2-usableAreaM2),headlandAreaM2,netAreaM2,surfaceAreaM2,surfaceNetAreaM2,surfaceHeadlandAreaM2,theoreticalPlants,commercialPlants25:roundUpTo25(sum.simulatedPlants||theoreticalPlants),terrainStatus:'applied',terrainSource:clone(model.source),terrainAreaMethod:'exact-native-face-headland-bands'};
  if(portionResults.every(p=>p.quantityBasis==='certified-flat-legacy')){
   const legacy=calculateProject({...input,terrain:null});
   for(const key of ['rowCount','rowLinearM','simulatedPlants','theoreticalPlants','commercialPlants25','headPosts','intermediatePosts','totalPosts'])result[key]=legacy[key];
  }
  const rowPortions=portions.map(p=>({...p,terrainDesign:portionResults.find(r=>r.id===p.id).design}));
  const appliedInput={...input,rowPortions};
  const validation={valid:true,method:'continuous-face-chart/supporting-plane-and-scalar-bounds',minimumSpacingLowerM:Math.min(...portionResults.map(p=>p.validation.minimumSpacingLowerM)),errorBoundM:Math.max(...portionResults.map(p=>p.validation.errorBoundM)),nodeCount:Math.max(baseChart.xyz.length,...portionResults.map(p=>p.validation.nodeCount??baseChart.xyz.length)),elapsedMs:Date.now()-started};
  const terrain={model:clone(model),applied:{algorithmVersion:VERSION,inputHash:terrainDesignInputHash(appliedInput,model),inputs:clone(appliedInput),result:clone(result),portionResults:clone(portionResults),validation,resultHash:terrainInputHash(result)}};
  terrain.applied.snapshotHash=snapshotHash(terrain.applied);
  tick();
  if(new TextEncoder().encode(JSON.stringify({...field,rowPortions,terrain})).length>1048576)fail('size-exceeded','Il campo supera il limite di 1 MiB. Il progetto precedente è conservato.');
  const changes=portionResults.map(p=>({portionId:p.id,label:p.label,before:quantities(previous?.portionResults?.find(old=>old.id===p.id)??totals((before.rows??[]).filter(r=>r.portionId===p.id||portions.length===1),input.postSpacingM,input.plantSpacingM)),after:quantities(p)}));
  return {ok:true,status:'ready',message:'Proposta terreno verificata.',terrain,rowPortions,result,changes};
 }catch(error){return {ok:false,status:error.status??'review-required',message:error.message??'Disegno da rivedere.'};}finally{diagnosticPhase(null);}
}
