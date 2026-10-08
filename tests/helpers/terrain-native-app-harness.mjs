import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {checkpointTerrainProposal,terrainPortionEditorState} from '../../src/terrain-controller.js';
import {calculateProject} from '../../src/project-calculator.js';
import {mergeProjectState} from '../../src/state.js';
import {migrateDraftEnvelope} from '../../src/local-migrations.js';
import {saveDraft} from '../../src/storage.js';

// This executes the actual app adapter and checkpoint callbacks unchanged.
// Only account, UI and browser storage surfaces are supplied by the caller;
// the real controller/worker owns every proposal, operation and history entry.
const source=readFileSync(new URL('../../src/app.js',import.meta.url),'utf8');
function between(startMarker,endMarker,{endOffset=0}={}){
 const start=source.indexOf(startMarker);
 assert.ok(start>=0,`SETUP actual app marker ${startMarker}`);
 assert.equal(source.indexOf(startMarker,start+startMarker.length),-1,`SETUP unique app marker ${startMarker}`);
 const end=source.indexOf(endMarker,start+startMarker.length);
 assert.ok(end>start,`SETUP actual app end marker ${endMarker}`);
 return source.slice(start+startMarker.length,end+endOffset);
}
const nativeFunctions='function terrainContext(){'+between('function terrainContext(){','\nconst terrainCoreMount=');
const snapshotArrow=between('getCheckpointSnapshot:',',onStatus:');
const proposalArrow=between('onProposalChange:',',\n applyProposal:');
const checkpointArrow=between(' applyProposal:','\n }});',{endOffset:3});
const fieldCalculation='function calculateFieldProject(project) {'+between('function calculateFieldProject(project) {','\nfunction calculateAndRender() {');
const selectionReconciliation=between('function calculateAndRender() {','\n  renderRowPortionPicker(');

export function createNativeAppHarness({state,storage,ownerId,portionId='source',captureWorkspace=()=>null,reconcilePortionSelection=false,
 onPreview=()=>{},onCalculateAndRender=()=>{},onDirty=()=>{},onSync=()=>{},onRenderCurveControls=()=>{},onSyncCurveEditor=()=>{}}){
 let api;
 const scope={state,localStorage:storage,identityFrozen:false,overviewMode:false,pendingNativeEndpoint:null,
  terrainController:null,activeRowPortionId:portionId,rowPortionFieldId:state.project.activeFieldId,curveEditingActive:false,latestMetrics:null,
  authBridge:{getState:()=>({user:ownerId==null?null:{id:ownerId}})},
  captureWorkspace,checkpointTerrainProposal,mergeProjectState,migrateDraftEnvelope,saveDraft,calculateProject,terrainPortionEditorState,
  mapApi:{setTerrainProposalPreview:proposal=>onPreview(proposal,api)},
  summarySaveFeedback:{dirty:()=>onDirty(api)},calculateAndRender:()=>{if(reconcilePortionSelection)scope.actualSelectionReconciliation();onCalculateAndRender(api);},
  projectSync:{schedule:reason=>onSync(reason,api)},renderCurveControls:()=>onRenderCurveControls(api),syncCurveEditor:()=>onSyncCurveEditor(api),
 };
 runInNewContext(`${nativeFunctions}\n${fieldCalculation}\nthis.actualSelectionReconciliation=function(){${selectionReconciliation}\n};\nthis.actualCheckpointSnapshot=(${snapshotArrow});\nthis.actualProposalChange=(${proposalArrow});\nthis.actualApplyProposal=(${checkpointArrow});`,scope,{filename:'actual-native-app-adapter'});
 api={
  bindController(controller){scope.terrainController=controller;},
  applyEndpoint:(request,control)=>scope.applyNativePassageEndpoint(request,control),
  getCheckpointSnapshot:candidateProject=>scope.actualCheckpointSnapshot(candidateProject),
  onProposalChange:proposal=>scope.actualProposalChange(proposal),
  applyProposal:(proposal,context)=>scope.actualApplyProposal(proposal,context),
  getContext:()=>scope.terrainContext(),
  getEditContext:()=>scope.nativePassageEditContext(),
  get state(){return scope.state;},get portionId(){return scope.activeRowPortionId;},get pending(){return scope.pendingNativeEndpoint;},get latestMetrics(){return scope.latestMetrics;},
  dispose:()=>scope.clearPendingNativeEndpoint(),
 };
 return api;
}
