import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {terrainCoreWidgetState} from '../src/terrain-core-presentation.js';
import {createTerrainControls} from '../src/terrain-controls.js';
import {createTerrainController} from '../src/terrain-controller.js';
import {createTerrainModel} from '../src/terrain-model.js';
import {fromUTM} from '../src/coordinate-system.js';

let api;
const moduleURL=new URL('../src/terrain-spacing-feedback.js',import.meta.url);
try{api=await import(moduleURL.href);}catch(error){
 if(error.code!=='ERR_MODULE_NOT_FOUND'||new URL(error.url).pathname!==moduleURL.pathname)throw error;
 api={};
}
const options={portionId:'p1',spacingM:2.5};
const record={reason:'too-close',proof:'continuous-surface-path',distanceM:[1.306,1.306000000001],sourceFaceId:7,targetFaceId:7};
const diagnostics=(witness=record)=>({portions:[{portionId:'p1',candidates:[{id:'tried-family',valid:false,validation:{critical:[structuredClone(witness)]}}]}]});
const feedback={distanceM:[...record.distanceM],minimumM:2.3};
const outcome=()=>({ok:false,status:'review-required',kind:'adapt',diagnostics:diagnostics()});
const state=()=>({portionId:'p1',contextKey:'field/current-input',actualMode:'manual',busy:false,viewOpening:false,
 canAdapt:true,canSuggestCut:false,proposal:null,statusKind:'review-required',lastProposalOutcome:outcome()});
const expected='Nelle disposizioni provate i filari si avvicinano a 1,31 m (minimo 2,3 m). Separa le zone con un passaggio o modifica le aree escluse.';
const fallback='Non è stata trovata una disposizione verificabile. Il disegno precedente è conservato.';
function extract(value=diagnostics(),settings=options){
 assert.equal(typeof api.terrainSpacingFailureFeedback,'function','the spacing feedback extracts only proved current failed candidates');
 return api.terrainSpacingFailureFeedback(value,settings);
}
function widget(){
 const {document}=parseHTML('<div id="host"></div>'),host=document.querySelector('#host');
 const controls=createTerrainControls({host,onModeChange(){},onSuggestCut(){}});
 return {document,host,controls,status:()=>host.querySelector('[role="status"]')?.textContent};
}

test('proved failed candidate projects only its finite distance interval and the current minimum',()=>{
 const input=diagnostics(),before=structuredClone(input),result=extract(input);
 assert.deepEqual(result,feedback);assert.deepEqual(input,before);
 input.portions[0].candidates[0].validation.critical[0].distanceM[0]=0;
 assert.deepEqual(result,feedback,'feedback is a detached numeric DTO');
});

test('unproved chords, unknown proof and malformed intervals never supply physical spacing feedback',()=>{
 for(const witness of [
  {...record,proof:'xyz-chord'}, {...record,proof:'unknown'}, {...record,proof:undefined},
  {...record,reason:'too-far'}, {...record,distanceM:[NaN,1.3]}, {...record,distanceM:[1.3,Infinity]},
  {...record,distanceM:[1.4,1.3]}, {...record,distanceM:[-1,1.3]}, {...record,distanceM:[0,0]},
  {...record,distanceM:[1.3]}, {...record,distanceM:[1.3,1.4,1.5]}, {...record,distanceM:['1.3',1.4]},
  {...record,distanceM:[2.2,2.3]}, {...record,distanceM:[2.3,2.4]},
  {...record,sourceFaceId:-1}, {...record,targetFaceId:'7'}, {...record,targetFaceId:undefined},
 ])assert.equal(extract(diagnostics(witness)),null,JSON.stringify(witness));
 for(const spacingM of [undefined,null,'2.5',NaN,Infinity,.2,0,-1])assert.equal(extract(diagnostics(),{...options,spacingM}),null);
});

test('another portion, successful candidate and malformed diagnostic containers never supply feedback',()=>{
 for(const value of [null,{}, {portions:'invalid'}, {portions:[{portionId:'p1',candidates:'invalid'}]},
  {portions:[{portionId:'p1',candidates:[{valid:false,validation:{critical:'invalid'}}]}]},
  {portions:[{portionId:'p2',candidates:diagnostics().portions[0].candidates}]},
  {portions:[{portionId:'p1',candidates:[{valid:true,validation:{critical:[record]}}]}]},
  {portions:[{portionId:'p1',candidates:[{validation:{critical:[record]}}]}]},
 ])assert.equal(extract(value),null);
 for(const portionId of [null,undefined,'',' ','p2'])assert.equal(extract(diagnostics(),{...options,portionId}),null);
});

test('mapper exposes spacing feedback only for the actual current failed adaptation',()=>{
 const current=state(),project={rowSpacingM:2.5},before=structuredClone(current);
 const dto=terrainCoreWidgetState(current,{project});
 assert.deepEqual(dto.status,{kind:'review-required',spacingFeedback:feedback});
 assert.equal(dto.canSuggestCut,false,'physical feedback does not invent cut eligibility');
 assert.equal(terrainCoreWidgetState({...current,canSuggestCut:true},{project}).canSuggestCut,true);
 assert.deepEqual(current,before);
 for(const value of [
  {...current,busy:true}, {...current,viewOpening:true}, {...current,canAdapt:false}, {...current,portionId:'p2'},
  {...current,proposal:{ok:true}}, {...current,lastProposalOutcome:null},
  {...current,lastProposalOutcome:{...outcome(),ok:true}}, {...current,lastProposalOutcome:{...outcome(),ok:'false'}},
  {...current,lastProposalOutcome:{...outcome(),kind:'measure'}}, {...current,lastProposalOutcome:{...outcome(),kind:'cut'}},
  ...['cancelled','budget-exceeded','invalid-input','ready'].flatMap(kind=>[
   {...current,statusKind:kind},{...current,lastProposalOutcome:{...outcome(),status:kind}},
  ]),
 ])assert.equal(terrainCoreWidgetState(value,{project}).status?.spacingFeedback,undefined);
 assert.equal(terrainCoreWidgetState(current,{project,enabled:false}).status,null);
 for(const rowSpacingM of [undefined,null,'2.5',NaN,Infinity])assert.equal(terrainCoreWidgetState(current,{project:{rowSpacingM}}).status?.spacingFeedback,undefined);
});

test('review widget renders actionable numeric feedback as live text without creating actions or HTML',()=>{
 const ui=widget(),dto=terrainCoreWidgetState(state(),{project:{rowSpacingM:2.5}});
 ui.controls.render(dto);
 assert.equal(ui.status(),expected);
 assert.equal(ui.host.querySelector('[role="status"]').getAttribute('aria-live'),'polite');
 assert.equal(ui.host.querySelector('[data-terrain-action="cut"]'),null);
 assert.equal(ui.host.querySelector('[data-terrain-action="apply"]'),null);
 assert.equal(ui.host.querySelectorAll('button').length,2);
 ui.controls.destroy();
});

test('actual controller failed adaptation maps incompatible status to numeric widget feedback',async()=>{
 const ui=widget(),geometry=[[0,0],[10,0],[10,10],[0,10],[0,0]].map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
 const model=createTerrainModel({acquiredAt:'2026-10-06T00:00:00Z',grid:{width:3,height:3,origin:[499995,5000015],step:[10,-10],values:[3,3,3,1,1,1,-1,-1,-1]}});
 const project={localProjectId:'spacing-ui-project',activeFieldId:'spacing-ui-field',geometry,exclusions:[],rowSpacingM:2.5,plantSpacingM:1,postSpacingM:5,headlandWidthM:0,orientationDeg:0,rowCurvePoints:[],maintainRowEquidistance:true,
  rowPortions:[{id:'p1',geometry:[geometry],mode:'inherited',orientationDeg:0,rowCurvePoints:[],maintainRowEquidistance:true}]};
 const before=structuredClone(project);let writes=0;
 // Only the calculation transport is local: acquisition and outcome ownership
 // use the real controller, including its public status normalization.
 const controller=createTerrainController({document:ui.document,getProject:()=>project,
  getContext:()=>({owner:'owner',projectId:project.localProjectId,fieldId:project.activeFieldId}),getPortionId:()=> 'p1',getResult:()=>null,
  loadTerrain:async()=>model,summarize:async()=>({valid:true}),covers:async()=>true,runProposal:async()=>outcome(),applyProposal:()=>{writes++;return true;}});
 try{
  await controller.refresh();await controller.propose({mode:'terrain'});
  const current=controller.getState();
  assert.equal(current.statusKind,'incompatible','the real controller retains its existing public status contract');
  assert.equal(current.lastProposalOutcome?.status,'review-required');
  assert.equal(current.lastProposalOutcome?.kind,'adapt');
  const dto=terrainCoreWidgetState(current,{project});
  assert.deepEqual(dto.status.spacingFeedback,feedback,'the actual owned failed adapt still supplies physical feedback');
  ui.controls.render(dto);assert.equal(ui.status(),expected);
  assert.equal(Boolean(ui.host.querySelector('[data-terrain-action="cut"]')),current.canSuggestCut,'controller continues owning passage eligibility');
  controller.cancel();ui.controls.render(terrainCoreWidgetState(controller.getState(),{project}));
  assert.equal(ui.status(),'Operazione annullata.');assert.doesNotMatch(ui.host.textContent,/filari si avvicinano/);
  assert.equal(writes,0);assert.deepEqual(project,before);
 }finally{controller.destroy();ui.controls.destroy();}
});

test('incompatible widget uses numeric feedback only when validated and preserves its ordinary message otherwise',()=>{
 const ui=widget();
 ui.controls.render({portionId:'p1',canAdapt:true,status:{kind:'incompatible',spacingFeedback:feedback}});
 assert.equal(ui.status(),expected);
 for(const spacingFeedback of [undefined,null,{...feedback,distanceM:[2.3,2.4]}]){
  ui.controls.render({portionId:'p1',canAdapt:true,status:{kind:'incompatible',spacingFeedback,message:'<img src=x>'}});
  assert.equal(ui.status(),'Non è stata trovata una disposizione compatibile per questa porzione.');
  assert.equal(ui.host.querySelector('img'),null);
 }
 for(const overrides of [{busy:true},{portionId:null},{canAdapt:false},{proposal:{pending:true,canApply:false}}]){
  ui.controls.render({portionId:'p1',canAdapt:true,status:{kind:'incompatible',spacingFeedback:feedback},...overrides});
  assert.doesNotMatch(ui.host.textContent,/filari si avvicinano|Separa le zone/);
 }
 ui.controls.destroy();
});

test('review widget uses safe generic feedback for unknown or malformed diagnostics and ignores arbitrary messages',()=>{
 const ui=widget();
 for(const spacingFeedback of [undefined,null,{message:'<img src=x onerror=alert(1)>'},
  {...feedback,distanceM:['<img src=x>',1.4]}, {...feedback,distanceM:[1.4,1.3]},
  {...feedback,minimumM:'2.3'}, {...feedback,distanceM:[2.3,2.4]},
 ]){
  ui.controls.render({portionId:'p1',canAdapt:true,status:{kind:'review-required',spacingFeedback,message:'<img src=x> global impossibility'}});
  assert.equal(ui.status(),fallback);assert.equal(ui.host.querySelector('img'),null);
 }
 ui.controls.render({portionId:'p1',canAdapt:true,status:{kind:'review-required',spacingFeedback:{...feedback,message:'<img src=x>'}}});
 assert.equal(ui.status(),expected);assert.equal(ui.host.querySelector('img'),null);
 ui.controls.destroy();
});

test('busy, disabled, pending and cancelled widget states never repeat a former spacing failure',()=>{
 const ui=widget(),dto=terrainCoreWidgetState(state(),{project:{rowSpacingM:2.5}});
 for(const overrides of [
  {busy:true},{portionId:null},{canAdapt:false},{proposal:{pending:true,canApply:false}},
  {status:{kind:'cancelled',spacingFeedback:feedback}},
  {status:{kind:'budget-exceeded',spacingFeedback:feedback,budgetReason:'work'}},
  {status:{kind:'invalid-input',spacingFeedback:feedback}},
 ]){
  ui.controls.render({...dto,...overrides});
  assert.doesNotMatch(ui.host.textContent,/filari si avvicinano|Separa le zone/);
 }
 ui.controls.render(dto);assert.equal(ui.status(),expected);
 ui.controls.render({...dto,status:{kind:'review-required'}});assert.equal(ui.status(),fallback);
 ui.controls.destroy();
});

test('spacing formatter validates numeric feedback and keeps wording local to the tried arrangements',()=>{
 assert.equal(typeof api.terrainSpacingFailureText,'function');
 assert.equal(api.terrainSpacingFailureText(feedback),expected);
 for(const value of [undefined,null,{distanceM:[1.4,1.3],minimumM:2.3},{distanceM:[1.3,1.4],minimumM:'2.3'}])assert.equal(api.terrainSpacingFailureText(value),null);
 assert.doesNotMatch(expected,/impossibile|automatic|garant/i);
});
