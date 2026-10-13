import {createTerrainBudget} from './terrain-budget.js?v=1.3.11';
import {exactDomain,Q,number,height} from './terrain-exact.js?v=1.3.11';

// This predictor offers elevations only. Every offered source contour, retained
// row, distance and service area must still be reconstructed and certified by
// the family builder. No sampled distance or stored label grants authority.
export function buildNativeAdaptiveLevelSchedule({domain,spacingM,phase=.5,budget=createTerrainBudget({kind:'adapt'})}={}) {
 budget.check();budget.phase?.('adaptive-levels');
 if(!Number.isFinite(spacingM)||spacingM<=0||!Number.isFinite(phase)||phase<=0||phase>=1)throw new RangeError('Invalid adaptive spacing or phase');
 const kernel=exactDomain(domain,budget),records=[];
 for(const face of kernel.faces){
  budget.check();
  const points=face.clipped?.flat(2)??face.vertices.map(p=>p.slice(0,2).map(number));
  const elevations=points.map(p=>{budget.check();return number(height(face,p.map(Q)));});
  if(!elevations.length)continue;
  const q=number(face.q),speed=Math.sqrt(q/(1+q));
  records.push({min:Math.min(...elevations),max:Math.max(...elevations),speed,weight:Math.max(Number.MIN_VALUE,face.areaM2??1),id:face.id});
 }
 if(!records.length)throw new RangeError('No native adaptive elevation support');
 const lowerM=Math.min(...records.map(r=>r.min)),upperM=Math.max(...records.map(r=>r.max));
 const speedAt=level=>{
  const active=[];
  for(const record of records){budget.check();if(record.min<=level&&level<=record.max&&record.speed>0)active.push(record);}
  if(!active.length)throw new RangeError('No positive native adaptive progression');
  active.sort((a,b)=>{budget.check();return a.speed-b.speed||a.id-b.id;});
  const total=active.reduce((sum,r)=>sum+r.weight,0);let sum=0;
  for(const record of active){budget.check();sum+=record.weight;if(sum>=total/2)return record.speed;}
  throw new RangeError('Unresolved native adaptive progression');
 };
 const estimateStep=level=>{
  let delta=spacingM*speedAt(level);
  for(let iteration=0;iteration<4;iteration++){
   budget.check();
   const at=Math.min(upperM,level+delta/2);
   delta=spacingM*speedAt(at);
  }
  if(!(delta>0)||!Number.isFinite(delta)||level+delta===level)throw new RangeError('Unrepresentable native adaptive progression');
  return delta;
 };
 const levels=[];let level=lowerM+phase*estimateStep(lowerM);
 while(level<upperM){
  budget.check();
  if(!(level>lowerM)||levels.length&&!(level>levels.at(-1)))throw new RangeError('Non-increasing native adaptive progression');
  levels.push(level);level+=estimateStep(level);
 }
 return {levels,lowerM,upperM,complete:true,certified:false,frontier:'native-elevation-range-exhausted',method:'native-local-median-height-predictor-1',phase};
}
