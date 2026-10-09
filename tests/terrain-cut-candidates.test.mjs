import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createTerrainModel} from '../src/terrain-model.js';
import {createContourDomain} from '../src/terrain-contour-domain.js?v=1.3.6';
import {fromUTM,toUTM} from '../src/coordinate-system.js?v=1.3.6';
import {traceContourLevel} from '../src/terrain-contours.js?v=1.3.6';
import {certifyContourSpacing} from '../src/terrain-contour-validation.js?v=1.3.6';
import {createTerrainBudget} from '../src/terrain-budget.js?v=1.3.6';
const api=existsSync(new URL('../src/terrain-cut-candidates.js',import.meta.url))?await import('../src/terrain-cut-candidates.js'):{};
const geo=([x,y])=>fromUTM([500000+x,5000000+y],32632);
function fixture(height,ring=[[-10,0],[10,0],[10,10],[-10,10],[-10,0]],supportRows=9){
 const model=createTerrainModel({acquiredAt:'2026-10-05T00:00:00.000Z',grid:{width:9,height:supportRows,origin:[499980,5000030],step:[5,-5],values:Array.from({length:9*supportRows},(_,i)=>height(-20+(i%9)*5,30-Math.floor(i/9)*5))}});
 const domain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[ring.map(geo)]}});
 return {model,domain};
}
function select(options){assert.equal(typeof api.preselectTerrainPassageCandidates,'function');return api.preselectTerrainPassageCandidates({portionId:'p',budget:createTerrainBudget({kind:'cut'}),...options});}
function realDiagnostic(domain){
 const axes=[1,2].flatMap((level,ordinal)=>traceContourLevel(domain,level,{portionId:'p'}).axes.map(a=>({...a,ordinal})));
 const validation=certifyContourSpacing(domain,axes,{spacingM:3});
 assert.equal(validation.valid,false);
 assert.ok(validation.critical.some(c=>['too-close','too-far'].includes(c.reason)&&c.proof==='exact-affine-interior-witness'));
 return {portions:[{portionId:'p',candidates:[{id:'actual-level-pair',valid:false,validation}],frontiers:[]}]};
}
test('actual native crease and continuous spacing producer select an original finite source only',()=>{
 const {domain,model}=fixture((x,y)=>y/4+(x<0?x/16:x/2));
 const diagnostics=realDiagnostic(domain),before=JSON.stringify(diagnostics);
 const result=select({domain,model,diagnostics});
 assert.equal(result.candidates.length,1,JSON.stringify(result.diagnostics));
 const candidate=result.candidates[0],xy=candidate.sourceAxis.map(p=>toUTM(p,32632));
 assert.equal(candidate.widthM,1.5);
 assert.ok(xy.every(p=>Math.abs(p[0]-500000)<1e-5));
 assert.ok(Math.min(...xy.map(p=>p[1]))<5000000&&Math.max(...xy.map(p=>p[1]))>5000010);
 assert.equal(candidate.selection.kind,'native-crease-preselection');
 assert.equal(candidate.selection.certified,false);
 for(const key of ['valid','areaM2','validation','proof','domain'])assert.equal(Object.hasOwn(candidate,key),false);
 assert.equal(JSON.stringify(diagnostics),before);
 assert.deepEqual(select({domain,model,diagnostics}),result);
});
// These DTOs test heuristic input classification only. They are not native
// spacing certificates, passage certificates or evidence of served benefit.
function heuristicDiagnostics(domain,faceIds){
 return {portions:[{portionId:'p',candidates:[{id:'heuristic-dto',valid:false,validation:{valid:false,critical:faceIds.map(id=>({reason:'too-close',proof:'exact-affine-interior-witness',axisId:'a',targetAxisId:'b',seedFaceIds:[id],itinerary:[id],distanceM:[1,1.1],witnessSeedParameter:'1/2'}))}}]}]};
}
test('two native diagonal chains center the intervening strip and bound wider preselection',()=>{
 const F=r=>r<=0?r/4:r<=5?r/1024:(r-5)/4+5/1024;
 // Reflect old coordinates (xOld,yOld) to (x=xOld,y=-yOld):
 // rOld=xOld+yOld becomes x-y; tOld=yOld-xOld becomes -x-y.
 // This orthogonal reflection preserves intrinsic metrics and area; x+y
 // changes would cross the frozen negative-Y raster's native triangles.
 // One additional real native row supplies unchanged 5m endpoint reach and
 // 2.60m clearance for width5; the original nine-row support is insufficient.
 const {domain,model}=fixture((x,y)=>-(x+y)/8+F(x-y),[[-10,0],[10,-10],[15,0],[-5,15],[-10,0]],10);
 const middle=domain.faces.find(f=>f.vertices.every(p=>p[0]-p[1]>=-4500000&&p[0]-p[1]<=-4499995));
 assert.ok(middle);
 const diagnostics=heuristicDiagnostics(domain,[middle.id]),result=select({domain,model,diagnostics});
 assert.deepEqual(result.candidates.map(c=>c.widthM),[1.5,4,5],JSON.stringify(result.diagnostics));
 assert.ok(result.candidates.every(c=>c.selection.regimeCount===3));
 for(const candidate of result.candidates){
  const xy=candidate.sourceAxis.map(p=>toUTM(p,32632));
  assert.ok(xy.every(p=>Math.abs(p[0]-p[1]+4499997.5)<1e-5));
  assert.deepEqual(candidate.sourceAxis,result.candidates[0].sourceAxis);
  assert.equal(candidate.selection.certified,false);
 }
});
test('frontier exhaustion elevation generic failure and foreign critical DTOs do not select cuts',()=>{
 const {domain,model}=fixture((x,y)=>y/4+(x<0?x/16:x/2));
 for(const diagnostics of [
  {portions:[{portionId:'p',frontiers:[{kind:'scheduled-range-exhausted-not-impossibility'}]}]},
  {portions:[{portionId:'p',candidates:[{valid:false,validation:{critical:[{reason:'elevation',faceId:domain.faces[0].id}]}}]}]},
  {portions:[{portionId:'foreign',candidates:[{valid:false,validation:{critical:[{reason:'too-close',proof:'exact-affine-interior-witness',seedFaceIds:[domain.faces[0].id],itinerary:[domain.faces[0].id]}]}}]}]},
  {status:'budget-exceeded'},
 ])assert.equal(select({domain,model,diagnostics}).candidates.length,0);
});
test('global approach DTO native face identities can localize a heuristic without a fabricated itinerary',()=>{
 const {domain,model}=fixture((x,y)=>y/4+(x<0?x/16:x/2));
 const left=domain.faces.find(f=>f.vertices.every(p=>p[0]<500000)),right=domain.faces.find(f=>f.vertices.every(p=>p[0]>500000));
 const diagnostics={portions:[{portionId:'p',candidates:[{id:'heuristic-approach-dto',valid:false,validation:{critical:[{reason:'too-close',proof:'continuous-surface-path',sourceFaceId:left.id,targetFaceId:right.id,xy:[0,0],targetXY:[9999,9999]}]}}]}]};
 const result=select({domain,model,diagnostics});
 assert.equal(result.candidates.length,1);
 assert.deepEqual(result.candidates[0].selection.witnesses[0].itinerary,[]);
 assert.equal(result.candidates[0].selection.certified,false);
});
test('missing native witness identity and invalid itinerary remain localized unsupported',()=>{
 const {domain,model}=fixture((x,y)=>y/4+(x<0?x/16:x/2));
 const diagnostics=heuristicDiagnostics(domain,[999999]);
 let result=select({domain,model,diagnostics});
 assert.equal(result.candidates.length,0);
 assert.ok(result.diagnostics.unresolved.some(e=>e.reason==='witness-native-identity'));
 const left=domain.faces.find(f=>f.vertices.every(p=>p[0]<500000)),right=domain.faces.find(f=>f.vertices.every(p=>p[0]>500000));
 const bad=heuristicDiagnostics(domain,[left.id]);bad.portions[0].candidates[0].validation.critical[0].itinerary=[left.id,right.id];
 result=select({domain,model,diagnostics:bad});
 assert.equal(result.candidates.length,0);
 assert.ok(result.diagnostics.unresolved.some(e=>e.reason==='witness-itinerary'));
});
test('uniform plane has no native change chain and never invents one from witness midpoints',()=>{
 const {domain,model}=fixture((x,y)=>y/4),diagnostics=heuristicDiagnostics(domain,[domain.faces[0].id]);
 diagnostics.portions[0].candidates[0].validation.critical[0].seedXY=[[500000,5000000],[500010,5000010]];
 const result=select({domain,model,diagnostics});
 assert.equal(result.candidates.length,0);
 assert.ok(result.diagnostics.unresolved.some(e=>e.reason==='no-native-change-chain'));
});
test('shared exhausted budget returns no partial candidates and records charged preselection work',()=>{
 const {domain,model}=fixture((x,y)=>y/4+(x<0?x/16:x/2)),diagnostics=heuristicDiagnostics(domain,[domain.faces[0].id]);
 const expired=createTerrainBudget({kind:'cut',deadlineMs:0});
 assert.equal(select({domain,model,diagnostics,budget:expired}).diagnostics.status,'budget-exceeded');
 let retained=0;
 const budget={check(n=0){retained+=n;if(retained>30)throw Object.assign(new Error('cap'),{status:'budget-exceeded'});},phase(){}};
 const result=select({domain,model,diagnostics,budget});
 assert.equal(result.candidates.length,0);
 assert.equal(result.diagnostics.status,'budget-exceeded');
 assert.ok(retained>30);
});
test('an actual branching native regime boundary stays unsupported',()=>{
 const {domain,model}=fixture((x,y)=>y/4+Math.max(x,y,0)/2,[[-10,-5],[10,-5],[10,15],[-10,15],[-10,-5]]),diagnostics=heuristicDiagnostics(domain,[domain.faces[0].id]);
 const result=select({domain,model,diagnostics});
 assert.equal(result.candidates.length,0);
 assert.ok(result.diagnostics.unresolved.some(e=>['noncollinear-native-change-chain','ambiguous-native-change-chains','nonparallel-native-change-chains'].includes(e.reason)));
});
test('selected original endpoints with insufficient acquired native clearance are not repaired',()=>{
 const {domain,model}=fixture((x,y)=>y/4+(x<0?x/16:x/2),[[-10,-5],[10,-5],[10,25],[-10,25],[-10,-5]]);
 const result=select({domain,model,diagnostics:heuristicDiagnostics(domain,[domain.faces[0].id])});
 assert.equal(result.candidates.length,0);
 assert.ok(result.diagnostics.unresolved.some(e=>e.reason==='source-native-support-clearance'));
});
