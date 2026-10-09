import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/terrain-cut-candidates.js';
import {createTerrainModel} from '../src/terrain-model.js';
import {createContourDomain} from '../src/terrain-contour-domain.js?v=1.3.6';
import {traceContourLevel} from '../src/terrain-contours.js?v=1.3.6';
import {certifyContourSpacing} from '../src/terrain-contour-validation.js?v=1.3.6';
import {fromUTM} from '../src/coordinate-system.js';
import {parseHTML} from 'linkedom';
import {createTerrainController} from '../src/terrain-controller.js';

const modelBounds={grid:{width:9,height:9}};
const affine={reason:'too-close',proof:'exact-affine-interior-witness',seedFaceIds:[0],itinerary:[0]};
const approach={reason:'too-close',proof:'continuous-surface-path',sourceFaceId:0,targetFaceId:1};
const diagnostic=records=>({portions:[{portionId:'selected',candidates:[{id:'classification-only',valid:false,validation:{critical:records}}]}]});
function scan(options){assert.equal(typeof api.hasTerrainCutConvergence,'function','actual cheap eligibility API must exist');return api.hasTerrainCutConvergence({portionId:'selected',...options});}
let actualA;
function realAConvergence(){
 if(actualA)return actualA;
 const geo=([x,y])=>fromUTM([500000+x,5000000+y],32632),geometry=[[-10,0],[10,0],[10,10],[-10,10],[-10,0]].map(geo);
 const model=createTerrainModel({acquiredAt:'2026-10-05T00:00:00.000Z',grid:{width:9,height:9,origin:[499980,5000030],step:[5,-5],values:Array.from({length:81},(_,i)=>{const x=-20+(i%9)*5,y=30-Math.floor(i/9)*5;return y/4+(x<0?x/16:x/2);})}});
 const domain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[geometry]}});
 const axes=[1,2].flatMap((level,ordinal)=>traceContourLevel(domain,level,{portionId:'selected'}).axes.map(axis=>({...axis,ordinal})));
 const validation=certifyContourSpacing(domain,axes,{spacingM:3});
 assert.equal(validation.valid,false,'SETUP actual A pair has a real spacing violation');
 assert.ok(validation.critical.some(record=>['too-close','too-far'].includes(record.reason)&&record.proof==='exact-affine-interior-witness'),'SETUP actual A continuous critical witness');
 return actualA={model,geometry,diagnostics:{portions:[{portionId:'selected',candidates:[{id:'actual-level-pair',valid:false,validation}],frontiers:[]}]}};
}

// The following DTOs test UI heuristic classification only. A true result is
// never a geometry, distance, passage, family, area or benefit certificate.
test('cheap cut eligibility is an actual callable API',()=>{
 assert.equal(typeof api.hasTerrainCutConvergence,'function');
});

test('cheap cut eligibility recognizes only preselector spacing witness schemas for the selected portion',()=>{
 for(const record of [affine,{...affine,reason:'too-far'},approach])assert.equal(scan({diagnostics:diagnostic([record]),model:modelBounds}),true);
 for(const mutate of [value=>value.portions[0].portionId='foreign',value=>value.portions[0].candidates[0].valid=true,value=>value.portions[0].candidates[0].valid=null]){
  const value=diagnostic([{...affine}]);mutate(value);assert.equal(scan({diagnostics:value,model:modelBounds}),false);
 }
 for(const portionId of [undefined,null,'',2])assert.equal(scan({portionId,diagnostics:diagnostic([affine]),model:modelBounds}),false);
});

test('budget elevation frontier and transport failures never become cut eligibility',()=>{
 for(const status of ['budget-exceeded','timeout','cancelled','worker-error','invalid-transport','uncovered','invalid-input','unsupported-operation','unsupported-algorithm','stale-context'])assert.equal(scan({diagnostics:{...diagnostic([affine]),status},model:modelBounds}),false,status);
 for(const record of [{...affine,reason:'elevation'},{...affine,proof:'point-sample'},{...approach,reason:'too-far'},{reason:'too-close',xy:[0,0],targetXY:[1,1]}])assert.equal(scan({diagnostics:diagnostic([record]),model:modelBounds}),false);
 for(const diagnostics of [null,{}, {portions:[{portionId:'selected',frontiers:[{kind:'scheduled-range-exhausted-not-impossibility'}]}]}, {portions:'invalid'}])assert.equal(scan({diagnostics,model:modelBounds}),false);
});

test('malformed recognized native identities and itineraries veto eligibility instead of hiding behind a good witness',()=>{
 for(const patch of [
  {seedFaceIds:undefined},{seedFaceIds:[]},{seedFaceIds:[-1]},{seedFaceIds:['0']},{seedFaceIds:[.5]},{seedFaceIds:[Infinity]},
  {itinerary:undefined},{itinerary:[]},{itinerary:[-1]},{itinerary:['0']},{itinerary:[.5]},
 ]){
  const bad={...affine,...patch};assert.equal(scan({diagnostics:diagnostic([bad]),model:modelBounds}),false,JSON.stringify(patch));
  assert.equal(scan({diagnostics:diagnostic([affine,bad]),model:modelBounds}),false,'a malformed eligible witness must not be silently discarded');
 }
 for(const patch of [{sourceFaceId:undefined},{sourceFaceId:-1},{sourceFaceId:.5},{targetFaceId:'1'},{targetFaceId:NaN}])assert.equal(scan({diagnostics:diagnostic([{...approach,...patch}]),model:modelBounds}),false);
});

test('optional actual native grid bounds restrict face IDs without decoding the model',()=>{
 assert.equal(scan({diagnostics:diagnostic([{...affine,seedFaceIds:[127],itinerary:[127]}]),model:modelBounds}),true);
 for(const record of [{...affine,seedFaceIds:[128]},{...affine,itinerary:[128]},{...approach,targetFaceId:128}])assert.equal(scan({diagnostics:diagnostic([record]),model:modelBounds}),false);
 assert.equal(scan({diagnostics:diagnostic([{...affine,seedFaceIds:[128],itinerary:[128]}])}),true,'absence of a grid only disables the optional bounds check; SEARCH remains authoritative');
 for(const model of [{},{grid:{}},{grid:{width:1,height:9}},{grid:{width:9.5,height:9}},{grid:{width:Number.MAX_SAFE_INTEGER,height:9}}])assert.equal(scan({diagnostics:diagnostic([affine]),model}),false);
});

test('cheap scanner reads only dimensions and leaves diagnostics untouched without cloning or parsing',()=>{
 const diagnostics=diagnostic([affine]),before=JSON.stringify(diagnostics),model={grid:{width:9,height:9}};
 Object.defineProperty(model.grid,'valuesBase64',{get(){throw new Error('grid decode forbidden on UI');}});
 const parse=JSON.parse,copy=globalThis.structuredClone;
 JSON.parse=()=>{throw new Error('parse forbidden on UI');};globalThis.structuredClone=()=>{throw new Error('copy forbidden on UI');};
 try{assert.equal(scan({diagnostics,model}),true);}finally{JSON.parse=parse;globalThis.structuredClone=copy;}
 assert.equal(JSON.stringify(diagnostics),before);
});

test('genuine existing A continuous-spacing producer remains eligible without full cut search',()=>{
 assert.equal(typeof api.hasTerrainCutConvergence,'function','missing API fails before numerical SETUP');
 const {model,diagnostics}=realAConvergence(),before=JSON.stringify(diagnostics);
 assert.equal(scan({diagnostics,model}),true);assert.equal(JSON.stringify(diagnostics),before);
});

test('actual controller offers cut search only for its current genuine A convergence and guards the suggest action',async()=>{
 const {model,geometry,diagnostics}=realAConvergence(),original={localProjectId:'eligibility-project',activeFieldId:'eligibility-field',geometry,rowPortions:[{id:'selected',label:'Porzione',geometry:[geometry],orientationDeg:0,rowCurvePoints:[],maintainRowEquidistance:true}],exclusions:[],orientationDeg:0,rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:0,rowCurvePoints:[],maintainRowEquidistance:true};
 let project=structuredClone(original),portionId='selected',owner='anonymous',reply={ok:false,status:'review-required',kind:'adapt',diagnostics},writes=0;
 const calls=[],{document}=parseHTML('<section id="terrain-card"></section>');
 const controller=createTerrainController({document,getProject:()=>project,getContext:()=>({owner,projectId:project.localProjectId,fieldId:project.activeFieldId}),getPortionId:()=>portionId,getResult:()=>null,loadTerrain:async()=>model,summarize:async()=>({valid:true}),covers:async()=>true,runProposal:async options=>{calls.push(options);return structuredClone(reply);},applyProposal:()=>{writes++;return true;}});
 try{
  await controller.refresh();assert.equal(controller.getState().canSuggestCut,false);
  await controller.propose({mode:'terrain'});
  assert.equal(controller.getState().canSuggestCut,true,'owned actual current failed A continuous witness should offer only the readonly SEARCH action');
  assert.equal(controller.getState().canApply,false);assert.equal(writes,0);
  const target={portionId,contextKey:controller.getState().contextKey};
  assert.equal(typeof controller.suggestCut,'function','actual guarded controller search API');
  const count=calls.length;assert.equal(await controller.suggestCut({...target,contextKey:'stale'}),null);assert.equal(calls.length,count);
  reply={ok:false,status:'uncovered',kind:'cut'};
  await controller.suggestCut(target);
  assert.equal(calls.length,count+1);assert.equal(calls.at(-1).kind,'cut');assert.deepEqual(calls.at(-1).cutRequest,{action:'suggest'});assert.equal(calls.at(-1).portionId,'selected');assert.deepEqual(calls.at(-1).diagnostics,diagnostics);assert.equal(controller.getState().canSuggestCut,false);assert.equal(writes,0);
  for(const status of ['budget-exceeded','timeout','uncovered','invalid-transport','worker-error','invalid-input','unsupported-operation']){
   reply={ok:false,status,kind:'adapt',diagnostics};await controller.propose({mode:'terrain'});assert.equal(controller.getState().canSuggestCut,false,status);
  }
  reply={ok:false,status:'review-required',kind:'adapt',diagnostics};
  for(const mutate of [()=>{portionId='foreign';},()=>{owner='other';},()=>{project={...project,rowSpacingM:4};},()=>{project={...project,terrain:{history:{schemaVersion:1,entries:[]}}};},()=>controller.setMode('manual')]){
   project=structuredClone(original);portionId='selected';owner='anonymous';await controller.propose({mode:'terrain'});assert.equal(controller.getState().canSuggestCut,true);mutate();assert.equal(controller.getState().canSuggestCut,false,'selection/account/input/history/mode change must revoke eligibility');
  }
  project=structuredClone(original);portionId='selected';owner='anonymous';
  await controller.propose({mode:'terrain',project:{...project,rowSpacingM:4}});assert.equal(controller.getState().canSuggestCut,false,'an editor draft failure cannot authorize a cut on different live inputs');
  assert.equal(writes,0);
 }finally{controller.destroy();}
});
