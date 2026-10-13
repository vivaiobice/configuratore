import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTerrainBudget} from '../src/terrain-budget.js?v=1.3.11';
import {packTerrainRowMirror} from '../src/terrain-row-mirror.js?v=1.3.11';
import {fromUTM} from '../src/coordinate-system.js?v=1.3.11';

// Execute the actual module and its real validators. The only instrumentation
// counts reader entries; no result, hash, numerical predicate, or budget is mocked.
const sourceUrl=new URL('../src/terrain-replay.js',import.meta.url);
const source=readFileSync(sourceUrl,'utf8');
const signature='export function readTerrainEnvelope(project,{budget}={}){';
assert.equal(source.split(signature).length,2);
const instrumented=source.replace(signature,signature+'\n__reads++;')
 .replace(/from\s+(['"])(\.\/[^'"]+)\1/g,(_match,_quote,path)=>`from ${JSON.stringify(new URL(path,sourceUrl).href)}`);
const replay=await import('data:text/javascript;base64,'+Buffer.from('let __reads=0;export const readerCount=()=>__reads;export const resetReaderCount=()=>{__reads=0;};\n'+instrumented).toString('base64'));
const fixture=JSON.parse(readFileSync(new URL('./fixtures/terrain-v130-applied.json',import.meta.url),'utf8')).cases[0];
const fresh=()=>structuredClone(fixture.project);
const budget=()=>createTerrainBudget({kind:'restore'});
function v2(){
 const project=fresh();
 project.terrain.applied=replay.createContourEnvelope({project,model:project.terrain.model,result:fixture.result,portionResults:fixture.envelope.portionResults,validation:fixture.envelope.validation});
 return project;
}
function read(project,options={}){replay.resetReaderCount();return replay.readTerrainSavedAndLive(project,{budget:budget(),...options});}

test('genuine legacy and V2 operands share one proof only within each fresh call',()=>{
 for(const project of [fresh(),v2()]){
  const firstBudget=budget(),first=read(project,{budget:firstBudget});
  assert.equal(first.savedValid,true);assert.equal(first.liveResult.terrainStatus,'applied');assert.equal(replay.readerCount(),1);assert.ok(firstBudget.usage().nodeCount>0);
  first.liveResult.rows.length=0;
  const nextBudget=budget(),next=read(project,{budget:nextBudget});
  assert.equal(next.liveResult.rows.length,fixture.result.rows.length);assert.equal(replay.readerCount(),1);
  assert.equal(nextBudget.usage().nodeCount,firstBudget.usage().nodeCount);
 }
});
test('actual input divergence performs saved and live proofs independently',()=>{
 const project=fresh();project.rowSpacingM+=1;
 const result=read(project);assert.equal(result.savedValid,true);assert.equal(result.liveResult.terrainStatus,'invalid');assert.equal(replay.readerCount(),2);
});
test('lazy decision follows a valid saved proof and requires literal true',()=>{
 for(const required of [false,undefined,1,'true']){
  let calls=0;const project=fresh();project.rowSpacingM+=1;
  const result=read(project,{liveRequired:()=>{calls++;assert.equal(replay.readerCount(),1);return required;}});
  assert.equal(result.savedValid,true);assert.equal(result.liveResult,null);assert.equal(calls,1);assert.equal(replay.readerCount(),1);
 }
 const project=fresh();project.terrain.applied.snapshotHash='forged';let calls=0;
 assert.equal(read(project,{liveRequired:()=>{calls++;return true;}}).savedValid,false);assert.equal(calls,0);assert.equal(replay.readerCount(),1);
});
test('callback mutations of original root or actual terrain bytes force a fresh live proof',()=>{
 for(const mutate of [p=>{p.rowSpacingM+=1;},p=>{p.terrain.model.grid.valuesBase64+='AA';},p=>{p.terrain=structuredClone(p.terrain);}]){
  const project=fresh();const result=read(project,{liveRequired:()=>{mutate(project);return true;}});
  assert.equal(result.savedValid,true);assert.equal(replay.readerCount(),2);
  assert.deepEqual(result.liveResult,replay.readTerrainEnvelope(project,{budget:budget()}));
 }
});
test('packed inputs preserve original caller identity across hydration and callback mutations',()=>{
 for(const replaceOwner of [false,true]){
  const project=packTerrainRowMirror(v2());assert.ok(project.terrain.rowMirrorStorage);
  const result=read(project,{liveRequired:()=>{
   if(replaceOwner){project.terrain=structuredClone(project.terrain);project.terrain.model.grid.valuesBase64+='AA';}
   else project.rowSpacingM+=1;
   return true;
  }});
  assert.equal(result.savedValid,true);assert.equal(result.liveResult.terrainStatus,'invalid');assert.equal(replay.readerCount(),2);
 }
});
test('raw surface-group metadata outside the V2 projection still requires independent proof',()=>{
 const project=v2(),old=project.terrain.applied;
 const geometry=[[50,50],[55,50],[55,55],[50,55],[50,50]].map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
 project.exclusions=[{id:'literal-outside-field',passageGroupId:'literal-edited',surfaceGroupVersion:1,surfaceGroupOwner:true,geometry,surfaceGeometry:{type:'MultiPolygon',coordinates:[[geometry]]},surfaceGeometryConvention:'literal'}];
 project.terrain.applied=replay.createContourEnvelope({project,model:project.terrain.model,result:old.result,portionResults:old.portionResults,validation:old.validation});
 project.exclusions=structuredClone(project.terrain.applied.inputs.exclusions);
 assert.equal(read(project).liveResult.terrainStatus,'applied');assert.equal(replay.readerCount(),1);
 project.exclusions[0].displayName='foreign metadata';
 const result=read(project);assert.equal(result.savedValid,true);assert.equal(result.liveResult.terrainStatus,'applied');assert.equal(replay.readerCount(),2);
});
test('structuredClone differences in signed zero, undefined, holes, and array keys cannot share proof',()=>{
 for(const mutate of [p=>{p.rowCurvePoints.extra=-0;},p=>{p.rowCurvePoints.extra=undefined;},p=>{p.rowCurvePoints.length=1;},p=>{p.rowCurvePoints[0]=undefined;}]){
  const project=fresh();mutate(project.terrain.applied.inputs);
  // Unknown array properties and JSON-normalized holes are deliberately kept
  // in the actual saved input. Rehashing does not erase structural differences.
  project.terrain.applied.inputHash=replay.legacyTerrainDesignInputHash(project.terrain.applied.inputs,project.terrain.model);
  project.terrain.applied.snapshotHash=replay.hashTerrainEnvelope(project.terrain.applied);
  const result=read(project);assert.equal(result.savedValid,true);assert.equal(replay.readerCount(),2);
 }
});
test('unsupported saved input operands fail before getters, copy charges, or replay',()=>{
 for(const kind of ['getter','cycle','map','symbol','outer-getter','terrain-getter','applied-getter']){
  const project=fresh();let getterReads=0;
  const getter=()=>{getterReads++;return {};};
  if(kind==='outer-getter')Object.defineProperty(project.terrain.applied,'inputs',{get:getter});
  else if(kind==='terrain-getter')Object.defineProperty(project,'terrain',{get:getter});
  else if(kind==='applied-getter')Object.defineProperty(project.terrain,'applied',{get:getter});
  else if(kind==='getter')Object.defineProperty(project.terrain.applied.inputs,'extra',{get:getter,enumerable:true});
  else if(kind==='cycle')project.terrain.applied.inputs.extra=project.terrain.applied.inputs;
  else project.terrain.applied.inputs.extra=kind==='map'?new Map():Symbol('unsupported');
  const b=budget();assert.throws(()=>read(project,{budget:b}),TypeError,kind);
  assert.equal(getterReads,0,kind);assert.equal(b.usage().nodeCount,0,kind);assert.equal(replay.readerCount(),0,kind);
 }
});
test('shared caller deadline and saved-coordinate precharge apply before any replay',()=>{
 let time=0;const expired=createTerrainBudget({kind:'restore',deadlineMs:1,clock:()=>time});time=1;
 assert.throws(()=>read(fresh(),{budget:expired}),error=>error.status==='budget-exceeded'&&error.budgetReason==='time');assert.equal(replay.readerCount(),0);
 const exhausted=createTerrainBudget({kind:'restore',initialNodeCount:499999});
 assert.throws(()=>read(fresh(),{budget:exhausted}),error=>error.status==='budget-exceeded'&&error.budgetReason==='work');assert.equal(replay.readerCount(),0);
});
