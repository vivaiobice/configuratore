import test from 'node:test';
import assert from 'node:assert/strict';
import * as history from '../src/terrain-history.js?v=1.3.6';
import {createScopedTerrainCutEvaluator} from '../src/terrain-contour-design.js?v=1.3.6';
import {createContourEnvelope,readTerrainEnvelope} from '../src/terrain-replay.js?v=1.3.6';
import {axisSourceHash} from '../src/terrain-axis-geometry.js?v=1.3.6';
import {terrainInputHash} from '../src/terrain-model.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {fromUTM} from '../src/coordinate-system.js';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';

const clone=value=>structuredClone(value);
const geographic=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
function actualValidator(){
 assert.equal(typeof history.assertNativeTerrainCutAttachment,'function','actual readonly native attachment export');
 return history.assertNativeTerrainCutAttachment;
}
function rehash(entry){
 entry.baselineHash=terrainInputHash(Object.fromEntries(['schemaVersion','operationId','kind','affectedIds','before','afterFingerprint','contextFingerprint'].map(key=>[key,entry[key]])));
}
let fixture,foreignFixture;
function attached(){
 if(fixture)return fixture;
 const {project,model}=contourFixture({height:(_x,y)=>y/4,geometryXY:[[0,0],[9,0],[9,9],[0,9],[0,0]],headlandM:0});
 project.rowPortions=[{id:'source',geometry:[project.geometry],mode:'inherited',orientationDeg:0}];
 const budget=createTerrainBudget({kind:'cut',onProgress:value=>console.info('native-validator-phase',JSON.stringify(value))});
 const evaluator=createScopedTerrainCutEvaluator({project,model,portionId:'source',budget});
 assert.equal(evaluator.noCutFamily.ok,true,`SETUP no-cut: ${JSON.stringify(evaluator.noCutFamily.diagnostics)}`);
 console.info('native-validator-usage',JSON.stringify({stage:'constructor',...budget.usage()}));
 const producer=evaluator.evaluateCandidate({sourceAxis:geographic([[4.5,-3],[4.5,12]]),widthM:1.5,groupId:'road'});
 assert.equal(producer.ok,true,`SETUP producer: ${JSON.stringify(producer)}`);
 console.info('native-validator-usage',JSON.stringify({stage:'candidate',...budget.usage()}));
 assert.equal(readTerrainEnvelope({...project,...producer.projectPatch},{budget}).terrainStatus,'applied','SETUP actual complete native replay');
 console.info('native-validator-usage',JSON.stringify({stage:'replay',...budget.usage()}));
 const operationId='native-validator-operation',proposal=history.attachTerrainRestore({project,proposal:producer,operationId,budget});
 console.info('native-validator-usage',JSON.stringify({stage:'attachment',...budget.usage()}));
 const current={...project,...proposal.projectPatch,terrain:proposal.terrain,rowPortions:proposal.rowPortions};
 fixture={project,model,producer,proposal,operationId,budget,current};return fixture;
}
function foreignAttached(){
 if(foreignFixture)return foreignFixture;
 // Exact proven two-component 5B input, including shared perimeter vertices.
 const {project,model}=contourFixture({height:(_x,y)=>y/4,geometryXY:[[0,0],[8.25,0],[9.75,0],[18,0],[18,9],[9.75,9],[8.25,9],[0,9],[0,0]]});
 const [a,leftLow,rightLow,b,c,rightHigh,leftHigh,d]=project.geometry;
 project.exclusions=[{id:'literal-divider',geometry:[leftLow,rightLow,rightHigh,leftHigh,leftLow]}];
 project.rowPortions=[
  {id:'source',geometry:[[a,leftLow,leftHigh,d,a]],mode:'inherited',orientationDeg:0},
  {id:'native-foreign',geometry:[[rightLow,b,c,rightHigh,rightLow]],mode:'local',orientationDeg:0,rowCurvePoints:[],maintainRowEquidistance:true,custom:{retain:'actual foreign presentation'}}
 ];
 const budget=createTerrainBudget({kind:'cut'}),evaluator=createScopedTerrainCutEvaluator({project,model,portionId:'source',budget});
 assert.equal(evaluator.noCutFamily.ok,true,`SETUP foreign no-cut: ${JSON.stringify(evaluator.noCutFamily.diagnostics)}`);
 console.info('native-validator-usage',JSON.stringify({operation:'foreign-create',stage:'constructor',...budget.usage()}));
 const producer=evaluator.evaluateCandidate({sourceAxis:geographic([[4.5,-3],[4.5,12]]),widthM:1.5,groupId:'road'});
 assert.equal(producer.ok,true,`SETUP foreign producer: ${JSON.stringify(producer)}`);
 console.info('native-validator-usage',JSON.stringify({operation:'foreign-create',stage:'candidate',...budget.usage()}));
 assert.equal(readTerrainEnvelope({...project,...producer.projectPatch},{budget}).terrainStatus,'applied','SETUP actual foreign replay');
 console.info('native-validator-usage',JSON.stringify({operation:'foreign-create',stage:'replay',...budget.usage()}));
 const operationId='native-validator-foreign',proposal=history.attachTerrainRestore({project,proposal:producer,operationId,budget});
 console.info('native-validator-usage',JSON.stringify({operation:'foreign-create',stage:'attachment',...budget.usage()}));
 const current={...project,...proposal.projectPatch,terrain:proposal.terrain,rowPortions:proposal.rowPortions};
 foreignFixture={project,model,producer,proposal,operationId,budget,current};return foreignFixture;
}
function withPayload(input,{rowPortions,portionResults,result,validation,budget}){
 const proposal=clone(input.producer),project={...input.project,...proposal.projectPatch,rowPortions};
 // Rebind bytes using the actual envelope API, not a geometry certificate.
 // Real owner operands and retained component/axis coordinates are unchanged.
 const applied=createContourEnvelope({project,model:input.model,result,portionResults,validation,budget});
 proposal.rowPortions=rowPortions;proposal.result=applied.result;proposal.terrain={model:input.producer.terrain.model,applied};
 proposal.projectPatch={...proposal.projectPatch,rowPortions,terrain:proposal.terrain};
 return proposal;
}
function observedReplay(project,budget,scenario){
 const result=readTerrainEnvelope(project,{budget});
 console.info('native-validator-negative',JSON.stringify({scenario,terrainStatus:result?.terrainStatus,message:result?.terrainMessage,children:(project.rowPortions??[]).filter(portion=>portion.terrainScopeRecipe).map(portion=>({id:portion.id,componentKey:portion.terrainScopeRecipe.componentKey})),...budget.usage()}));
 return result;
}

test('native parent validator API exists on the actual module before genuine geometry setup',()=>{
 actualValidator();
});

test('native parent validator accepts the genuine captured baseline under the same cumulative budget',()=>{
 const validate=actualValidator(),input=attached(),before=JSON.stringify(input.project),proposalBefore=JSON.stringify(input.proposal);
 const result=validate(input);
 console.info('native-validator-usage',JSON.stringify({stage:'parent-validation',...input.budget.usage()}));
 assert.deepEqual(result.result,input.proposal.terrain.applied.result);
 assert.equal(result.historyFingerprint,history.assertTerrainRestoreHistory({project:input.current,budget:input.budget}));
 assert.equal(JSON.stringify(input.project),before);assert.equal(JSON.stringify(input.proposal),proposalBefore);
 assert.ok(input.budget.usage().nodeCount<=500000);
});

test('native parent validator explicit deadline expires before actual reads or owned copies',()=>{
 const validate=actualValidator(),budget=createTerrainBudget({kind:'cut',deadlineMs:0,clock:()=>0}),copy=globalThis.structuredClone,parse=JSON.parse;let copies=0,jsonCopies=0;
 globalThis.structuredClone=(...args)=>{copies++;return copy(...args);};
 JSON.parse=(...args)=>{jsonCopies++;return parse(...args);};
 try{assert.throws(()=>validate({project:{},proposal:{},operationId:'expired',budget}),{status:'budget-exceeded'});assert.equal(copies,0);assert.equal(jsonCopies,0);}finally{globalThis.structuredClone=copy;JSON.parse=parse;}
});

test('native parent validator rejects rehashed baseline structure differing from its genuine capture',()=>{
 const validate=actualValidator(),input=attached();
 const variants=[
  before=>before.source.portionPositions=[1],
  before=>before.source.quantityPositions=[1],
  before=>before.referenceModelHash='different-captured-model',
  before=>before.source.portions[0].custom={unowned:'substituted raw original'},
  before=>before.portions[0].rows[0].lengthM+=1
 ];
 assert.ok(input.proposal.terrain.history.entries[0].before.portions[0].rows.length,'SETUP actual manual rows');
 for(const mutate of variants){
  const proposal=clone(input.proposal),entry=proposal.terrain.history.entries[0];mutate(entry.before);rehash(entry);
  assert.throws(()=>validate({...input,proposal,budget:createTerrainBudget({kind:'cut'})}),{status:'invalid-history'});
 }
});

test('native parent validator binds the operation identity and complete candidate owner operands',()=>{
 const validate=actualValidator(),input=attached();
 assert.throws(()=>validate({...input,operationId:'different-operation',budget:createTerrainBudget({kind:'cut'})}),{status:'invalid-history'});
 const proposal=clone(input.proposal);proposal.cut.widthM+=.25;
 assert.throws(()=>validate({...input,proposal,budget:createTerrainBudget({kind:'cut'})}),{status:'invalid-history'});
});

test('native parent validator carried node quota rejects before allocating a returned result',()=>{
 const validate=actualValidator(),input=attached(),budget=createTerrainBudget({kind:'cut',initialNodeCount:500000,clock:()=>0}),copy=globalThis.structuredClone,parse=JSON.parse;let copies=0,jsonCopies=0;
 globalThis.structuredClone=(...args)=>{copies++;return copy(...args);};
 JSON.parse=(...args)=>{jsonCopies++;return parse(...args);};
 try{assert.throws(()=>validate({...input,budget}),{status:'budget-exceeded'});assert.equal(copies,0);assert.equal(jsonCopies,0);}finally{globalThis.structuredClone=copy;JSON.parse=parse;}
});

test('native attachment rejects a genuine created child colliding with a captured literal exclusion identity',()=>{
 const input=attached(),childId=input.producer.createdChildIds[0];assert.ok(childId,'SETUP actual producer allocated child');
 // The complete candidate remains the genuine native producer output, not a
 // rewritten/rehashed certificate. The captured original has a legitimate
 // outside-field literal exclusion, whose identity the candidate cannot claim.
 const project={...input.project,exclusions:[{id:childId,geometry:geographic([[12,12],[14,12],[14,14],[12,14],[12,12]])}]};
 assert.equal(readTerrainEnvelope({...input.project,...input.producer.projectPatch}).terrainStatus,'applied','SETUP untouched genuine candidate');
 assert.throws(()=>history.attachTerrainRestore({project,proposal:input.producer,operationId:'namespace-collision',budget:createTerrainBudget({kind:'cut'})}),{status:'invalid-history'});
});

test('native namespace collision cannot be concealed by omitting a genuinely new child declaration',()=>{
 const input=attached(),childId=input.producer.createdChildIds[0];assert.ok(childId,'SETUP actual allocated child');
 const project={...input.project,exclusions:[{id:childId,geometry:geographic([[12,12],[14,12],[14,14],[12,14],[12,12]])}]};
 const proposal={...input.producer,createdChildIds:input.producer.createdChildIds.filter(id=>id!==childId)};
 for(const key of ['terrain','rowPortions','result','projectPatch','cut'])assert.equal(proposal[key],input.producer[key],'untouched genuine geometry and payload');
 assert.throws(()=>history.attachTerrainRestore({project,proposal,operationId:'concealed-namespace-collision',budget:createTerrainBudget({kind:'cut'})}),{status:'invalid-history'});
});

test('native namespace declaration omission cannot claim a preserved genuine literal identity',()=>{
 const input=foreignAttached(),oldId=input.producer.createdChildIds[0],collision='literal-divider';assert.ok(oldId,'SETUP genuine created identity');
 const rowPortions=clone(input.producer.rowPortions),portionResults=clone(input.producer.terrain.applied.portionResults);
 const raw=rowPortions.find(portion=>portion.id===oldId),portion=portionResults.find(portion=>portion.id===oldId);assert.ok(raw&&portion,'SETUP actual created component');
 raw.id=collision;portion.id=collision;
 const axes=new Map();for(const axis of portion.design.axes){axis.portionId=collision;axes.set(axis.axisId,axis);}
 for(const row of portion.rows){row.portionId=collision;row.axisOperation.sourceHash=axisSourceHash(axes.get(row.axisId));}
 raw.terrainDesign=portion.design;
 const result={...clone(input.producer.result),rows:portionResults.flatMap(record=>record.rows),portions:rowPortions};
 const validation=clone(input.producer.terrain.applied.validation);validation.automaticPortionIds=validation.automaticPortionIds.map(id=>id===oldId?collision:id);
 const budget=createTerrainBudget({kind:'cut'}),proposal=withPayload(input,{rowPortions,portionResults,result,validation,budget});
 proposal.cutOperation.afterPortionIds=proposal.cutOperation.afterPortionIds.map(id=>id===oldId?collision:id);
 proposal.affectedPortionIds=proposal.affectedPortionIds.map(id=>id===oldId?collision:id);proposal.createdChildIds=[];
 proposal.changes=proposal.changes.map(change=>({...change,portionId:change.portionId===oldId?collision:change.portionId}));
 assert.deepEqual(proposal.projectPatch.exclusions,input.producer.projectPatch.exclusions,'all genuine unrelated exclusions are preserved');
 assert.deepEqual(proposal.cut,input.producer.cut,'all actual native owner operands and coordinates are preserved');
 assert.equal(observedReplay({...input.project,...proposal.projectPatch},budget,'preserved-exclusion-identity').terrainStatus,'applied','SETUP genuine complete components with changed identity metadata only');
 assert.throws(()=>history.attachTerrainRestore({project:input.project,proposal,operationId:'preserved-exclusion-identity-collision',budget}),{status:'invalid-history'});
});

test('native replay rejects omission of an actual canonical remainder component',()=>{
 const input=attached(),removed=input.producer.createdChildIds[0];assert.ok(removed,'SETUP actual split child');
 const rowPortions=clone(input.producer.rowPortions.filter(portion=>portion.id!==removed));
 const portionResults=clone(input.producer.terrain.applied.portionResults.filter(portion=>portion.id!==removed));
 const result={...clone(input.producer.result),rows:portionResults.flatMap(portion=>portion.rows),portions:rowPortions};
 const validation=clone(input.producer.terrain.applied.validation);validation.automaticPortionIds=validation.automaticPortionIds.filter(id=>id!==removed);
 const budget=createTerrainBudget({kind:'cut'}),proposal=withPayload(input,{rowPortions,portionResults,result,validation,budget});
 proposal.cutOperation.afterPortionIds=proposal.cutOperation.afterPortionIds.filter(id=>id!==removed);
 proposal.createdChildIds=proposal.createdChildIds.filter(id=>id!==removed);proposal.affectedPortionIds=proposal.affectedPortionIds.filter(id=>id!==removed);
 proposal.changes=proposal.changes.filter(change=>change.portionId!==removed);
 assert.deepEqual(proposal.cut,input.producer.cut,'actual complete native owner operands remain untouched');
 const after={...input.project,...proposal.projectPatch};
 assert.equal(observedReplay(after,budget,'omitted-component').terrainStatus,'invalid','actual reconstruction must require every canonical remainder component');
 assert.throws(()=>history.attachTerrainRestore({project:input.project,proposal,operationId:'omitted-component',budget}),{status:'invalid-applied'});
});

test('native replay rejects omission of all actual owner group children',()=>{
 const input=attached(),budget=createTerrainBudget({kind:'cut'}),result={...clone(input.producer.result),rows:[],portions:[]};
 const validation={...clone(input.producer.terrain.applied.validation),automaticPortionIds:[]};
 const proposal=withPayload(input,{rowPortions:[],portionResults:[],result,validation,budget});
 assert.deepEqual(proposal.projectPatch.exclusions,input.producer.projectPatch.exclusions,'the actual complete marked owner group remains');
 assert.equal(observedReplay({...input.project,...proposal.projectPatch},budget,'all-components-omitted').terrainStatus,'invalid','marked owners cannot disappear from reconstruction merely because all recipes are absent');
});

test('native replay rejects two identities claiming one genuine canonical component',()=>{
 const input=attached(),[first,second]=input.producer.rowPortions;assert.ok(second,'SETUP actual split child');
 const firstResult=input.producer.terrain.applied.portionResults.find(portion=>portion.id===first.id),duplicate=clone(firstResult);
 duplicate.id=second.id;
 const renamedAxes=new Map();
 for(const axis of duplicate.design.axes){const old=axis.axisId;axis.axisId=`${old}:duplicate`;axis.portionId=second.id;renamedAxes.set(old,axis);}
 for(const row of duplicate.rows){const axis=renamedAxes.get(row.axisId);row.axisId=axis.axisId;row.portionId=second.id;row.fragmentId=`${row.fragmentId}:duplicate`;row.axisOperation.sourceHash=axisSourceHash(axis);}
 const duplicateRaw={...clone(first),id:second.id,terrainDesign:duplicate.design};
 const rowPortions=[clone(first),duplicateRaw],portionResults=[clone(firstResult),duplicate];
 const result={...clone(input.producer.result),rows:portionResults.flatMap(portion=>portion.rows),portions:rowPortions};
 const budget=createTerrainBudget({kind:'cut'}),proposal=withPayload(input,{rowPortions,portionResults,result,validation:clone(input.producer.terrain.applied.validation),budget});
 assert.deepEqual(proposal.cut,input.producer.cut,'actual native owner operands remain untouched');
 assert.deepEqual(duplicate.design.axes.map(axis=>axis.components),firstResult.design.axes.map(axis=>axis.components),'genuine source coordinates only');
 assert.equal(rowPortions[0].terrainScopeRecipe.componentKey,rowPortions[1].terrainScopeRecipe.componentKey);
 assert.equal(observedReplay({...input.project,...proposal.projectPatch},budget,'duplicate-component').terrainStatus,'invalid','actual reconstruction must bind each component exactly once');
 assert.throws(()=>history.attachTerrainRestore({project:input.project,proposal,operationId:'duplicate-component',budget}),{status:'invalid-applied'});
});

test('native attachment preserves an unrelated physically harmless captured exclusion',()=>{
 const input=attached(),project={...input.project,exclusions:[{id:'unrelated-outside-field',geometry:geographic([[12,12],[14,12],[14,14],[12,14],[12,12]]),custom:{retain:'actual unrelated exclusion'}}]};
 // The candidate is unchanged. A valid literal outside P cannot be deleted by
 // a cut merely because it contributes no current clipped area.
 assert.throws(()=>history.attachTerrainRestore({project,proposal:input.producer,operationId:'unowned-exclusion-deletion',budget:createTerrainBudget({kind:'cut'})}),{status:'invalid-history'});
});

test('native attachment preserves genuine foreign raw presentation during first conversion',()=>{
 const input=foreignAttached(),proposal=clone(input.producer),foreign=proposal.rowPortions.find(portion=>portion.id==='native-foreign');assert.ok(foreign,'SETUP actual foreign raw record');
 delete foreign.custom;
 assert.equal(proposal.rowPortions,proposal.projectPatch.rowPortions,'actual mirror alias is preserved');
 assert.throws(()=>history.attachTerrainRestore({project:input.project,proposal,operationId:'foreign-presentation-deletion',budget:createTerrainBudget({kind:'cut'})}),{status:'invalid-history'});
});

test('native parent validator preserves genuine unrelated foreign raw presentation',()=>{
 const validate=actualValidator(),input=foreignAttached(),proposal=clone(input.proposal),foreign=proposal.rowPortions.find(portion=>portion.id==='native-foreign');assert.ok(foreign,'SETUP actual foreign raw record');
 foreign.custom={substituted:'unowned presentation'};
 assert.equal(proposal.rowPortions,proposal.projectPatch.rowPortions,'actual mirror alias is preserved');
 assert.throws(()=>validate({...input,proposal,budget:createTerrainBudget({kind:'cut'})}),{status:'invalid-history'});
});

test('native attachment active field quota includes genuine captured history while its old mirror is manual',()=>{
 const input=attached(),project={...input.project,activeFieldId:'active-native-field',rowPortions:clone(input.project.rowPortions)};
 project.rowPortions[0].custom={originalPresentation:'x'.repeat(1024*1024)};
 const foreign={id:'foreign-field',geometry:project.geometry,rowPortions:[],terrain:null,custom:'retain foreign field'};
 project.fields=[{id:project.activeFieldId,geometry:project.geometry,exclusions:project.exclusions,rowPortions:clone(input.project.rowPortions),terrain:null},foreign];
 const before=JSON.stringify(project);
 // The genuine native candidate is unchanged; presentation-only source data
 // is intentionally captured by history, and must be counted in the new field.
 assert.throws(()=>history.attachTerrainRestore({project,proposal:input.producer,operationId:'native-field-history-quota',budget:createTerrainBudget({kind:'cut'})}),/1 MiB/);
 assert.equal(JSON.stringify(project),before);assert.equal(project.fields[1],foreign);
});

test('native public restore availability inspects genuine history without reconstruction or owned copies',()=>{
 const input=attached(),budget=createTerrainBudget({kind:'restore',initialNodeCount:500000,clock:()=>0}),copy=globalThis.structuredClone,parse=JSON.parse;let copies=0,jsonCopies=0,availability;
 globalThis.structuredClone=(...args)=>{copies++;return copy(...args);};
 JSON.parse=(...args)=>{jsonCopies++;return parse(...args);};
 try{
  assert.doesNotThrow(()=>{availability=history.terrainRestoreAvailability({project:input.current,portionId:'source',budget});},'advisory availability does not spend geometric reconstruction nodes');
  assert.deepEqual(availability,{available:true,reason:'exact',operationId:input.operationId});
  assert.equal(copies,0);assert.equal(jsonCopies,0);assert.equal(budget.usage().nodeCount,500000);
 }finally{globalThis.structuredClone=copy;JSON.parse=parse;}
});
