import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as content from '../src/terrain-actual-content.js?v=1.3.11';
import {fieldCalculationInputs} from '../src/field-calculation-inputs.js?v=1.3.11';
import {createTerrainCalculationPresentationCache} from '../src/terrain-calculation-presentation-cache.js?v=1.3.11';

const field=()=>({id:'f',geometry:[[9,45],[9.01,45.01]],rowSpacingM:3,terrain:{model:{contentHash:'unchanged',grid:{valuesBase64:'actual'}},applied:{result:{rows:[]}},history:{entries:[]}}});
const applied=()=>({terrainStatus:'applied',rows:[{coordinates:[[9,45],[9.01,45.01]]}],rowCount:1});
test('fresh display calculation always executes and seeds only an independent display copy',()=>{
 let calls=0,last;const cache=createTerrainCalculationPresentationCache(()=>{calls++;return last=applied();}),project=field(),context={ownerId:'one'};
 const fresh=cache.readFresh(project,()=>context);assert.strictEqual(fresh,last);assert.equal(calls,1);
 fresh.rows[0].coordinates[0][0]=100;
 const displayed=cache.read(project,context);assert.equal(calls,1);assert.equal(displayed.rows[0].coordinates[0][0],9);
 displayed.rows.length=0;assert.equal(cache.read(project,context).rows.length,1);
 assert.strictEqual(cache.readFresh(project,()=>context),last);assert.equal(calls,2);
});
test('failed or throwing fresh calculations clear older applied evidence before execution',()=>{
 for(const failure of ['invalid','throw']){
  let calls=0,fail=false;const stop=new Error('fresh failure'),cache=createTerrainCalculationPresentationCache(()=>{calls++;if(fail){if(failure==='throw')throw stop;return {terrainStatus:'invalid',rows:[]};}return applied();}),project=field(),context={ownerId:'one'};
  cache.read(project,context);fail=true;
  if(failure==='throw')assert.throws(()=>cache.readFresh(project,()=>context),error=>error===stop);
  else assert.equal(cache.readFresh(project,()=>context).terrainStatus,'invalid');
  fail=false;assert.equal(cache.read(project,context).terrainStatus,'applied');assert.equal(calls,3);
 }
});
test('fresh seeding checks actual input changes and re-reads replaced owner context',()=>{
 for(const mutation of ['input','owner','field','environment']){
  const project=field();let current={ownerId:'one',fieldId:'f',environment:'LIVE'},calls=0,contextReads=0;
  const cache=createTerrainCalculationPresentationCache(()=>{calls++;if(calls===1){if(mutation==='input')project.geometry[0][0]++;else current={...current,[mutation==='owner'?'ownerId':mutation==='field'?'fieldId':'environment']:'changed'};}return applied();});
  cache.readFresh(project,()=>{contextReads++;return current;});assert.equal(contextReads,2,mutation);
  cache.read(project,current);assert.equal(calls,2,mutation);
 }
});
test('unsupported source/result descriptors bypass fresh memoization without reading getters',()=>{
 let getterReads=0,calls=0;const project=field();Object.defineProperty(project,'unsupported',{get(){getterReads++;return 1;}});
 const cache=createTerrainCalculationPresentationCache(()=>{calls++;return applied();});cache.readFresh(project,()=>({}));cache.read(project,{});
 assert.equal(getterReads,0);assert.equal(calls,2);
 const resultCache=createTerrainCalculationPresentationCache(()=>{calls++;const result=applied();Object.defineProperty(result,'unsupported',{get(){getterReads++;return 1;}});return result;});
 resultCache.readFresh(field(),()=>({}));resultCache.read(field(),{});assert.equal(getterReads,0);assert.equal(calls,4);
 const statusCache=createTerrainCalculationPresentationCache(()=>Object.defineProperty({rows:[]},'terrainStatus',{get(){getterReads++;return 'applied';}}));
 statusCache.readFresh(field(),()=>({}));assert.equal(getterReads,0);
});
test('post-calculation context lookup cannot mutate inputs after the final comparison snapshot',()=>{
 let calls=0,contexts=0;const project=field(),cache=createTerrainCalculationPresentationCache(()=>{calls++;return applied();});
 cache.readFresh(project,()=>{if(++contexts===2)project.rowSpacingM=4;return {ownerId:'one'};});
 project.rowSpacingM=3;cache.read(project,{ownerId:'one'});assert.equal(calls,2,'a context callback mutation must prevent fresh seeding');
});
test('boolean content guard preserves typed key semantics without serializing discarded key strings',()=>{
 assert.equal(typeof content.isSupportedActualTerrainContent,'function');
 const values=[null,undefined,-0,NaN,Infinity,{x:-0},Array(1),[undefined],Object.assign([],{extra:1}),Object.create(null)];
 assert.deepEqual(values.map(content.actualTerrainContentKey),['n;','u;','v-0;','vNaN;','vInfinity;','o{"x"111:v-0;}','a{"length"001:v1;}','a{"0"111:u;"length"001:v1;}','a{"length"001:v0;"extra"111:v1;}','z{}']);
 let calls=0;const stringify=JSON.stringify;
 try{JSON.stringify=(...args)=>{calls++;return stringify(...args);};for(const value of values)assert.equal(content.isSupportedActualTerrainContent(value),true);assert.equal(calls,0);}finally{JSON.stringify=stringify;}
 let getterReads=0;const cycle={};cycle.self=cycle;
 const unsupported=[cycle,new Map(),{x:Symbol()},()=>{},Object.defineProperty({},'x',{get(){getterReads++;return 1;}}),Object.assign({}, {[Symbol('key')]:1})];
 for(const value of unsupported){assert.equal(content.actualTerrainContentKey(value),null);assert.equal(content.isSupportedActualTerrainContent(value),false);}assert.equal(getterReads,0);
 let depth=null;for(let i=0;i<513;i++)depth={child:depth};assert.equal(content.isSupportedActualTerrainContent(depth),false);
 const stop=Object.assign(new Error('deadline'),{status:'budget-exceeded'});assert.throws(()=>content.isSupportedActualTerrainContent({}, {budget:{check(){throw stop;}}}),error=>error===stop);
});
test('actual main app calculation seeds display once while other authority callbacks still calculate fresh',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8'),start=app.indexOf('function calculateFieldProject('),main=app.indexOf('function calculateAndRender('),published=app.indexOf('  latestMetrics = result;',main);
 assert.ok(start>=0&&main>start&&published>main);
 let calls=0;const live={...field(),activeFieldId:'f',localProjectId:'p'},state={project:live,environment:'LIVE'},scope={calculateProject:()=>{calls++;return applied();},fieldCalculationInputs,createTerrainCalculationPresentationCache,state,APP_CONFIG:{environment:'LIVE'},authBridge:{getState:()=>({user:{id:'one'}})},identityFrozen:false,overviewMode:false};
 const source=app.slice(start,main)+app.slice(main,published+'  latestMetrics = result;'.length)+'return result;}';
 const methods=Function(...Object.keys(scope),'let latestMetrics;'+source+'return {calculateAndRender,calculateFieldProject,calculateFieldPresentation};')(...Object.values(scope));
 const first=methods.calculateAndRender();assert.equal(first.terrainStatus,'applied');assert.equal(calls,1);
 methods.calculateFieldPresentation(live);assert.equal(calls,1,'display reuses the just-completed genuine main calculation');
 methods.calculateAndRender();assert.equal(calls,2,'main never uses a cache hit');methods.calculateFieldProject(live);methods.calculateFieldProject(live);assert.equal(calls,4);
 assert.match(app,/ensureQuoteRevision\([^\n]*getMetrics:\(field\)=>calculateFieldProject\(field\)/);assert.match(app,/buildCloudSnapshot\([^\n]*field=>calculateFieldProject\(field\)/);
});
