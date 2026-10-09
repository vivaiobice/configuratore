import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createTerrainController,checkpointTerrainProposal,terrainContextKey} from '../src/terrain-controller.js';
import * as terrainUI from '../src/terrain-controller.js';
import {createTerrainModel} from '../src/terrain-model.js';
import {fromUTM} from '../src/coordinate-system.js';
import {buildContourTerrainProposal} from '../src/terrain-contour-design.js';
import {attachTerrainRestore,assertTerrainRestoreHistory} from '../src/terrain-history.js';
const ring=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
const baseProject={id:'project',activeFieldId:'field',geometry:ring([[0,0],[12,0],[12,12],[0,12],[0,0]]),exclusions:[ring([[5,-1],[7,-1],[7,13],[5,13],[5,-1]])],orientationDeg:0,rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:0,rowCurvePoints:[],maintainRowEquidistance:true};
const baseModel=createTerrainModel({source:{id:'fixture',label:'Piemonte',resolutionM:5,citation:'Anonymous test model',license:'CC0',url:'about:blank'},grid:{width:5,height:5,origin:[499995,5000015],step:[5,-5],values:Array.from({length:25},(_,i)=>(15-Math.floor(i/5)*5)/2)}});
const baseProposal=buildContourTerrainProposal({project:baseProject,model:baseModel,mode:'measure'});
assert.equal(baseProposal.ok,true,baseProposal.message);
const reviewValues=(before,after)=>['rowCount','rowLinearM',...(before?.quantityBasis==='certified-flat-legacy'?['surfaceRowLinearM']:[]),'simulatedPlants','totalPosts'].map(key=>`${Number.isFinite(before?.[key])?before[key].toLocaleString('it-IT',{maximumFractionDigits:1}):'—'} → ${after[key].toLocaleString('it-IT',{maximumFractionDigits:1})}`);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(extra={}){
 const {document}=parseHTML('<section id="terrain-card"></section>');
 let project=structuredClone(baseProject);let owner='owner';let saves=0;
 const model=baseModel,proposal=structuredClone(baseProposal);
 const controller=createTerrainController({document,getProject:()=>project,getContext:()=>({owner,projectId:project.id,fieldId:project.activeFieldId}),getPortionId:()=>null,getMapApi:()=>null,loadTerrain:async()=>model,runProposal:async()=>proposal,summarize:()=>({valid:true,rangeM:12,maxSlopePercent:8}),covers:async()=>true,applyProposal:async()=>{saves++;return true;},...extra});
 return {document,controller,model,proposal,setProject:p=>project={...project,...p},setOwner:o=>owner=o,saves:()=>saves};
}
test('automatic acquisition is transient; proposal reviews every portion before checkpoint',async()=>{
 const f=fixture();await f.controller.refresh();assert.equal(f.saves(),0);assert.match(f.document.querySelector('#terrain-card').textContent,/Piemonte/);
 await f.controller.propose({mode:'manual'});assert.match(f.document.querySelector('#terrain-card').textContent,/Porzione 1/);assert.match(f.document.querySelector('#terrain-card').textContent,/Porzione 2/);assert.equal(f.saves(),0);await f.controller.apply();assert.equal(f.saves(),1);f.controller.destroy();
});
test('failed local checkpoint keeps the recoverable proposal and retry succeeds',async()=>{
 let fail=true;const f=fixture({applyProposal:async()=>{if(fail)throw new Error('quota');return true;}});await f.controller.refresh();await f.controller.propose({mode:'manual'});assert.equal(await f.controller.apply(),false);assert.equal(f.document.querySelector('[data-terrain="apply"]').disabled,false);assert.match(f.document.querySelector('#terrain-card').textContent,/salvataggio/i);fail=false;assert.equal(await f.controller.apply(),true);f.controller.destroy();
});
test('late acquisition is discarded after account, field or design change even without refresh',async()=>{
 for(const change of [f=>f.setOwner('other'),f=>f.setProject({activeFieldId:'other'}),f=>f.setProject({rowSpacingM:4})]){
 const d=deferred();const f=fixture({loadTerrain:()=>d.promise});const p=f.controller.refresh();change(f);d.resolve(f.model);await p;assert.equal(f.controller.getState().model,null);assert.equal(f.saves(),0);f.controller.destroy();}
});
test('late worker cannot become applicable after design changes',async()=>{
 const d=deferred();const f=fixture({runProposal:()=>d.promise});await f.controller.refresh();const p=f.controller.propose({mode:'manual'});f.setProject({rowSpacingM:4});d.resolve(f.proposal);await p;assert.equal(f.controller.getState().proposal,null);assert.equal(await f.controller.apply(),false);f.controller.destroy();
});
test('acquisition error is recoverable and candidate never enters project',async()=>{
 let first=true;const f=fixture({loadTerrain:async()=>{if(first){first=false;throw new Error('unavailable');}return {contentHash:'retry',source:{label:'Italia'}};}});await f.controller.refresh();assert.match(f.document.querySelector('#terrain-card').textContent,/Riprova/);await f.controller.retry();assert.equal(f.controller.getState().model.contentHash,'retry');assert.equal(f.saves(),0);f.controller.destroy();
});
test('manual edits propose edited project without changing saved project',async()=>{
 let seen;const f=fixture({runProposal:async(options)=>{seen=options;return buildContourTerrainProposal({...options,mode:'measure'});}});await f.controller.refresh();await f.controller.propose({project:{...baseProject,rowSpacingM:4},projectPatch:{rowSpacingM:4},followTerrain:false});assert.equal(seen.followTerrain,false);assert.equal(seen.project.rowSpacingM,4);assert.equal(f.controller.getState().proposal.projectPatch.rowSpacingM,4);assert.ok(f.controller.getState().proposal.projectPatch.terrain.history);f.controller.destroy();
});
test('explicit solver failures keep saved state and never enable apply',async()=>{
 for(const status of ['uncovered','review-required','budget-exceeded','size-exceeded']){const f=fixture({runProposal:async()=>({ok:false,status,message:status})});await f.controller.refresh();await f.controller.propose({mode:'manual'});assert.equal(await f.controller.apply(),false);assert.equal(f.saves(),0);assert.match(f.document.querySelector('#terrain-card').textContent,new RegExp(status));f.controller.destroy();}
});
test('successful checkpoint may advance live terrain before controller clears preview',async()=>{
 const f=fixture({applyProposal:async proposal=>{f.setProject({terrain:proposal.terrain,rowPortions:proposal.rowPortions});return true;}});await f.controller.refresh();await f.controller.propose({mode:'manual'});assert.equal(await f.controller.apply(),true);assert.equal(f.controller.getState().proposal,null);f.controller.destroy();
});
test('settling old acquisition cannot clear new field acquisition ownership',async()=>{
 const old=deferred(),next=deferred();let loads=0;const f=fixture({loadTerrain:()=>++loads===1?old.promise:next.promise});const first=f.controller.refresh();f.setProject({activeFieldId:'new'});const second=f.controller.refresh();old.resolve(f.model);await first;const third=f.controller.refresh();assert.equal(loads,2);next.resolve(f.model);await Promise.all([second,third]);assert.equal(f.controller.getState().model,f.model);f.controller.destroy();
});
test('changed geometry outside frozen support acquires a new candidate without saving',async()=>{
 let loads=0;const f=fixture({covers:async()=>false,loadTerrain:async()=>{loads++;return f.model;}});f.setProject({terrain:{model:{contentHash:'old',source:{label:'old'}}}});await f.controller.refresh();assert.equal(loads,1);assert.equal(f.controller.getState().model,f.model);assert.equal(f.saves(),0);f.controller.destroy();
});
test('3D shows candidate rows and closing restores current saved rows without changing eyes',async()=>{
 const rows=[];let closed=0;const f=fixture({getMapApi:()=>({map:{},setRows:value=>rows.push(value),stopTools(){}}),getResult:()=>({rows:['saved']}),createMapView:async()=>({open:async()=>{},close:()=>closed++,destroy(){}})});await f.controller.refresh();await f.controller.propose({mode:'manual'});await f.controller.toggle3D();assert.deepEqual(rows.at(-1),baseProposal.result.rows);f.controller.close3D();assert.deepEqual(rows.at(-1),['saved']);assert.ok(closed);f.controller.destroy();
});
test('3D receives the candidate passage and portion geometry then closes when its target becomes stale',async()=>{
 let selected=null,closed=0,snapshotOptions,viewOptions;
 const f=fixture({getPortionId:()=>selected,getMapApi:()=>({map:{},getTerrainSceneSnapshot:options=>{snapshotOptions=options;return {geometry:baseProject.geometry,exclusions:options.exclusions,rowPortions:options.rowPortions};},stopTools(){},setRows(){}}),createMapView:async options=>{viewOptions=options;return {open:async()=>{},close:()=>closed++,destroy(){}};}});
 await f.controller.refresh();await f.controller.propose({mode:'manual'});const proposal=f.controller.getState().proposal;await f.controller.toggle3D();
 assert.deepEqual(snapshotOptions.rowPortions,proposal.rowPortions);assert.deepEqual(viewOptions.rows,proposal.result.rows);
 selected='different-target';await f.controller.refresh();assert.equal(f.controller.getState().in3D,false);assert.ok(closed>0);f.controller.destroy();
});

test('checkpoint failure never promotes candidate state and retry writes candidate before return',()=>{
 const current={owner:'o',projectId:'p',fieldId:'f'},state={project:structuredClone(baseProject)};const context={...current,terrainContextKey:terrainContextKey(current,state.project),terrainHistoryFingerprint:assertTerrainRestoreHistory({project:state.project})};const proposal=attachTerrainRestore({project:baseProject,proposal:baseProposal,operationId:'save'});let persisted=state;const mergeState=(state,patch)=>({...state,project:{...state.project,...patch}});
 assert.throws(()=>checkpointTerrainProposal({state,proposal,context,currentContext:current,mergeState,saveCheckpoint:()=>false}),/salvataggio/);assert.equal(persisted,state);assert.equal(state.project.terrain,undefined);
 const next=checkpointTerrainProposal({state,proposal,context,currentContext:current,mergeState,saveCheckpoint:candidate=>{persisted=candidate;return candidate;}});assert.equal(next,persisted);assert.deepEqual(next.project.terrain,proposal.terrain);
 assert.throws(()=>checkpointTerrainProposal({state,proposal,context,currentContext:{...current,owner:'other'},mergeState,saveCheckpoint:()=>{throw new Error('must not save');}}),/contesto/);
});
test('new manual input supersedes an active worker and only the latest edit becomes applicable',async()=>{
 const jobs=[];const f=fixture({runProposal:(options,control)=>{const d=deferred();jobs.push({options,control,...d});return d.promise;}});await f.controller.refresh();const first=f.controller.propose({project:{...baseProject,rowSpacingM:4},projectPatch:{rowSpacingM:4},followTerrain:false});await tick();const second=f.controller.propose({project:{...baseProject,rowSpacingM:6},projectPatch:{rowSpacingM:6},followTerrain:false});await tick();assert.equal(jobs.length,2);assert.equal(jobs[0].control.signal.aborted,true);jobs[0].resolve(f.proposal);await first;assert.equal(f.controller.getState().proposal,null);jobs[1].resolve(buildContourTerrainProposal({...jobs[1].options,mode:'measure'}));await second;assert.equal(f.controller.getState().proposal.projectPatch.rowSpacingM,6);assert.equal(f.saves(),0);f.controller.destroy();
});
test('invalid applied global inputs route the next proposal through whole-field recalculation',async()=>{
 let seen;const f=fixture({getPortionId:()=>baseProposal.rowPortions[0].id,getResult:()=>({terrainStatus:'invalid'}),runProposal:async options=>{seen=options;return buildContourTerrainProposal({...options,mode:'measure'});}});f.setProject({terrain:baseProposal.terrain,rowPortions:baseProposal.rowPortions,rowSpacingM:4});await f.controller.refresh();await f.controller.propose({mode:'manual'});assert.equal(seen.portionId,baseProposal.rowPortions[0].id);assert.equal(seen.recomputeAll,true);assert.equal(f.controller.getState().proposal.scope,'field');assert.match(f.document.querySelector('#terrain-card').textContent,/tutto il campo/);f.controller.destroy();
});
test('double 3D toggle cancels lazy creation and destroys the late view',async()=>{
 const created=deferred();let creates=0,opens=0,closes=0,destroys=0;const f=fixture({getMapApi:()=>({map:{},stopTools(){}}),createMapView:()=>{creates++;return created.promise;}});await f.controller.refresh();const first=f.controller.toggle3D();await tick();const second=f.controller.toggle3D();created.resolve({open:async()=>opens++,close:()=>closes++,destroy:()=>destroys++});await Promise.all([first,second]);assert.equal(creates,1);assert.equal(opens,0);assert.equal(destroys,1);assert.equal(closes,0);assert.equal(f.controller.getState().in3D,false);f.controller.destroy();
});
test('closing while a view is asynchronously opening destroys its late resources',async()=>{
 const started=deferred();let closes=0,destroys=0;const f=fixture({getMapApi:()=>({map:{},stopTools(){}}),createMapView:async()=>({open:()=>started.promise,close:()=>closes++,destroy:()=>destroys++})});await f.controller.refresh();const opening=f.controller.toggle3D();await tick();f.controller.close3D();started.resolve();await opening;assert.equal(f.controller.getState().in3D,false);assert.ok(closes>=1);assert.ok(destroys>=1);f.controller.destroy();
});
test('a queued newer manual edit immediately makes the previous preview inapplicable',async()=>{
 const next=deferred();let runs=0;const f=fixture({runProposal:()=>++runs===1?Promise.resolve(f.proposal):next.promise});await f.controller.refresh();await f.controller.propose({mode:'manual'});const pending=f.controller.propose({project:{...baseProject,rowSpacingM:4},projectPatch:{rowSpacingM:4},followTerrain:false});assert.equal(await f.controller.apply(),false);assert.equal(f.saves(),0);next.resolve(buildContourTerrainProposal({project:{...baseProject,rowSpacingM:4},model:baseModel,mode:'measure'}));await pending;assert.equal(f.controller.getState().proposal.projectPatch.rowSpacingM,4);f.controller.destroy();
});
test('whole-field review freezes verified before quantities and shows before to after totals',async()=>{
 const before={rowCount:30,rowLinearM:2500,simulatedPlants:2000,totalPosts:500};const d=deferred();const f=fixture({getResult:()=>before,runProposal:()=>d.promise});await f.controller.refresh();const pending=f.controller.propose({mode:'manual'});await tick();before.rowCount=99;d.resolve(f.proposal);await pending;assert.equal(f.controller.getState().proposal.beforeTotals?.rowCount,30);assert.deepEqual([...f.document.querySelectorAll('.terrain-review-total td')].map(node=>node.textContent),reviewValues({rowCount:30,rowLinearM:2500,simulatedPlants:2000,totalPosts:500},baseProposal.result));f.controller.destroy();
});
test('invalid applied before quantities are explicitly unavailable in whole-field review',async()=>{
 const f=fixture({getResult:()=>({terrainStatus:'invalid',rowCount:300,rowLinearM:9999,simulatedPlants:9999,totalPosts:9999})});await f.controller.refresh();await f.controller.propose({mode:'manual'});assert.equal(f.controller.getState().proposal.beforeTotals,null);assert.deepEqual([...f.document.querySelectorAll('.terrain-review-total td')].map(node=>node.textContent),reviewValues(null,baseProposal.result));f.controller.destroy();
});

test('global spacing recalculation on two actual small portions preserves the other manual guide',async()=>{
 const first=baseProposal,selected=first.rowPortions[0].id,other=first.rowPortions[1].id;
 const project={...structuredClone(baseProject),rowSpacingM:4,rowPortions:structuredClone(first.rowPortions),terrain:structuredClone(first.terrain)};
 const saved=JSON.stringify(project),oldDesign=first.terrain.applied.portionResults.find(p=>p.id===other).design;
 const {readAppliedTerrainResult,buildTerrainProposal}=await import('../src/terrain-design.js');
 const f=fixture({getProject:()=>project,getPortionId:()=>selected,getResult:()=>readAppliedTerrainResult({...project,polygon:project.geometry}),runProposal:async options=>buildTerrainProposal(options)});
 await f.controller.refresh();const next=await f.controller.propose({mode:'manual'});assert.equal(next.ok,true,next.message);assert.equal(next.scope,'field');
 const selectedDesign=next.terrain.applied.portionResults.find(p=>p.id===selected).design,otherDesign=next.terrain.applied.portionResults.find(p=>p.id===other).design;
 assert.equal(selectedDesign.followTerrain,false);assert.equal(otherDesign.followTerrain,false);assert.equal(otherDesign.orientationRad,oldDesign.orientationRad);assert.equal(next.rowPortions.find(p=>p.id===other).orientationDeg,0);assert.equal(JSON.stringify(project),saved);f.controller.destroy();
});

test('unapplied terrain portion selector uses the existing calculator portions unchanged',async()=>{
 assert.equal(typeof terrainUI.terrainPortionEditorState,'function');
 const [{fromUTM},{calculateProject},{rowPortionEditorState}]=await Promise.all([import('../src/coordinate-system.js'),import('../src/project-calculator.js'),import('../src/row-portion-editor.js')]);
 const ring=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
 const project={geometry:ring([[0,0],[60,0],[60,20],[30,20],[30,60],[0,60],[0,0]]),exclusions:[{id:'road',geometry:ring([[-5,19.25],[65,19.25],[65,20.75],[-5,20.75],[-5,19.25]])}],orientationDeg:45,rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:0,rowPortions:[],rowCurvePoints:[]};
 const result=calculateProject({...project,polygon:project.geometry});assert.equal(result.portions.length,2);const selected=result.portions[1].id;
 assert.deepEqual(terrainUI.terrainPortionEditorState(project,selected,result),rowPortionEditorState(project,selected,result.portions));
});
test('invalid terrain quantities retain the selected saved portion without supplying quantities',async()=>{
 assert.equal(typeof terrainUI.terrainPortionEditorState,'function');
 const [{fromUTM},{rowPortionEditorState}]=await Promise.all([import('../src/coordinate-system.js'),import('../src/row-portion-editor.js')]);
 const ring=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
 const project={geometry:ring([[0,0],[60,0],[60,20],[30,20],[30,60],[0,60],[0,0]]),exclusions:[{id:'road',geometry:ring([[-5,19.25],[65,19.25],[65,20.75],[-5,20.75],[-5,19.25]])}],orientationDeg:45,rowSpacingM:4,rowPortions:[]};
 project.rowPortions=rowPortionEditorState(project).portions;project.terrain={model:{contentHash:'frozen'}};
 const selected=project.rowPortions[1].id,invalid={terrainStatus:'invalid',portions:[],rows:[],rowCount:null,rowLinearM:null};
 const editor=terrainUI.terrainPortionEditorState(project,selected,invalid);assert.equal(editor.active.id,selected);assert.equal(editor.enabled,true);assert.equal(editor.portions.length,2);assert.equal(editor.rowCount,undefined);assert.equal(invalid.rowCount,null);
});

test('certified quantity review freezes its measured ground metres and distinguishes both bases',async()=>{
 const before={terrainStatus:'applied',quantityBasis:'certified-flat-legacy',rowCount:10,rowLinearM:600,surfaceRowLinearM:610,simulatedPlants:900,totalPosts:240};
 const d=deferred(),f=fixture({getResult:()=>before,runProposal:()=>d.promise});
 await f.controller.refresh();const pending=f.controller.propose({mode:'manual'});await tick();before.surfaceRowLinearM=9999;before.quantityBasis='model-surface';d.resolve(f.proposal);await pending;
 assert.deepEqual([...f.document.querySelectorAll('.terrain-review thead th')].map(node=>node.textContent),['Porzione','Filari/tratti','Metri per quantità','Metri sul terreno','Piante','Pali']);
 assert.deepEqual([...f.document.querySelectorAll('.terrain-review-total td')].map(node=>node.textContent),reviewValues({quantityBasis:'certified-flat-legacy',rowCount:10,rowLinearM:600,surfaceRowLinearM:610,simulatedPlants:900,totalPosts:240},baseProposal.result));
 assert.equal(f.document.querySelector('.terrain-quantity-basis'),null,'the measured after result has no retained legacy quantity label');
 f.controller.destroy();
});

test('real flat proposal measures the ground separately while retaining unchanged legacy quantities',async()=>{
 const {appliedTerrainField}=await import('./fixtures/terrain-field.mjs');const {calculateProject}=await import('../src/project-calculator.js');
 const {field,proposal}=appliedTerrainField(()=>0,{rowSpacingM:1}),project={...field,terrain:null};
 const baseline=calculateProject({...project,polygon:project.geometry});
 const f=fixture({getProject:()=>project,getResult:()=>baseline,loadTerrain:async()=>field.terrain.model,runProposal:async()=>proposal});
 await f.controller.refresh();await f.controller.propose({mode:'manual'});
 const cells=[...f.document.querySelectorAll('.terrain-review-total td')].map(node=>node.textContent);
 assert.equal(cells[1],'1601,5 → 1601,5');assert.equal(cells[2],'— → 1600');
 assert.match(f.document.querySelector('.terrain-quantity-basis').textContent,/Quantità del disegno conservate/);
 f.controller.destroy();
});
