import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createTerrainControls} from '../src/terrain-controls.js';
import {terrainCoreWidgetState} from '../src/terrain-core-presentation.js';
import {createTerrainController} from '../src/terrain-controller.js';
import {runTerrainProposal} from '../src/terrain-worker-client.js';

test('terrain widget distinguishes work exhaustion from deadline and unknown budget exhaustion',()=>{
 const {document}=parseHTML('<div id="controls"></div>'),host=document.querySelector('#controls');
 const controls=createTerrainControls({host});
 const state={portionId:'p1',contextKey:'field-1',actualMode:'manual',available:true,
  canAdapt:true,statusKind:'budget-exceeded',lastProposalOutcome:{ok:false,status:'budget-exceeded'}};
 for(const [reason,expected] of [['work',/complessità/i],['time',/tempo/i],[undefined,/limite di calcolo/i]]){
  state.lastProposalOutcome.budgetReason=reason;
  const dto=terrainCoreWidgetState(state);assert.equal(dto.status.budgetReason,reason);
  controls.render(dto);assert.match(host.textContent,expected);
  if(reason==='work')assert.doesNotMatch(host.textContent,/limite di tempo/i);
 }
 controls.destroy();
});

test('transport deadline exposes its time reason and last actual phase without keeping a worker alive',async()=>{
 let callback,worker;
 class Worker{constructor(){worker=this;this.closed=0;}postMessage(){}terminate(){this.closed++;}}
 const pending=runTerrainProposal({algorithmVersion:'terrain-contour-family-1',kind:'adapt'},
  {WorkerImpl:Worker,setTimeoutImpl:fn=>(callback=fn,1),clearTimeoutImpl:()=>{}});
 worker.onmessage({data:{type:'progress',phase:'contour-spacing',elapsedMs:29990,nodeCount:100}});
 callback();const result=await pending;
 assert.equal(result.status,'budget-exceeded');assert.equal(result.budgetReason,'time');
 assert.equal(result.diagnostics.budget.phase,'contour-spacing');assert.equal(worker.closed,1);
});

test('the 3D return control closes the controller view and restores the ordinary map state',async()=>{
 const {document}=parseHTML('<div></div>');
 const geometry=[[8,45],[8.001,45],[8.001,45.001],[8,45.001],[8,45]];
 const project={geometry,rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:0,rowPortions:[]};
 let viewOptions,closed=0,destroyed=0;
 const controller=createTerrainController({document,getProject:()=>project,getContext:()=>({fieldId:'f1'}),
  getPortionId:()=> 'p1',getResult:()=>({rows:[],portions:[]}),
  getMapApi:()=>({map:{},stopTools(){},setRows(){}}),
  loadTerrain:async()=>({contentHash:'fixture'}),summarize:async()=>({valid:true}),covers:async()=>true,
  createMapView:async options=>(viewOptions=options,{open:async()=>{},close:()=>closed++,destroy:()=>destroyed++})});
 await controller.refresh();await controller.toggle3D();assert.equal(controller.getState().in3D,true);
 assert.equal(typeof viewOptions.onReturn2D,'function');viewOptions.onReturn2D();
 assert.equal(controller.getState().in3D,false);assert.equal(closed,1);assert.equal(destroyed,1);
 controller.destroy();
});

test('the manual terrain UI explicitly requests ground spacing while retaining the measurement operation',async()=>{
 const {document}=parseHTML('<div></div>');let request;
 const project={geometry:[[8,45],[8.001,45],[8.001,45.001],[8,45.001],[8,45]],rowSpacingM:3,plantSpacingM:1,rowPortions:[]};
 const controller=createTerrainController({document,getProject:()=>project,getContext:()=>({fieldId:'f1'}),getPortionId:()=> 'p1',getResult:()=>({rows:[],portions:[]}),
  loadTerrain:async()=>({contentHash:'fixture'}),summarize:async()=>({valid:true}),covers:async()=>true,
  runProposal:async options=>(request=options,{ok:false,status:'ground-spacing-unsupported',kind:'measure',message:'fixture'})});
 await controller.refresh();await controller.propose({mode:'manual'});
 assert.equal(request.kind,'measure');assert.equal(request.followTerrain,false);assert.equal(request.manualGroundSpacing,true);
 controller.destroy();
});
