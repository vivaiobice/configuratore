import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createDesktopLibraryUI} from '../src/desktop-library-ui.js';
import {createTerrainController} from '../src/terrain-controller.js';
import {actualTerrainContentKey} from '../src/terrain-actual-content.js';
import {createTerrainCalculationPresentationCache} from '../src/terrain-calculation-presentation-cache.js';
import {createTerrainRestorePresentationCache} from '../src/terrain-restore-presentation-cache.js';
import {fieldCalculationInputs} from '../src/field-calculation-inputs.js';

const field=()=>({id:'field',geometry:[[1,2],[3,4]],rowSpacingM:3,terrain:{model:{contentHash:'same',grid:{valuesBase64:'actual'}},applied:{result:{rows:[]}},history:{entries:[]}}});
const result=()=>({terrainStatus:'applied',rows:[{coordinates:[[1,2],[3,4]]}],rowCount:1});
test('exact keys distinguish special values and bypass unsupported descriptors without reads',()=>{
 const values=[{}, {a:undefined},{a:0},{a:-0},{a:NaN},{a:Infinity},[],Array(1),[undefined],Object.assign([],{extra:1}),Object.create(null)];
 assert.equal(new Set(values.map(value=>actualTerrainContentKey(value))).size,values.length);
 let reads=0;const cycle={};cycle.self=cycle;
 for(const value of [cycle,{get value(){reads++;return 1;}},{x:new Date()},{x:Symbol()}])assert.equal(actualTerrainContentKey(value),null);
 assert.equal(reads,0);
});
test('display metrics copy results and invalidate actual geometry model history and owner changes',()=>{
 let calls=0;const cache=createTerrainCalculationPresentationCache(()=>{calls++;return result();}),live=field(),owner={ownerId:'one'};
 cache.read(live,owner).rows[0].coordinates[0][0]=9;
 assert.equal(cache.read(structuredClone(live),owner).rows[0].coordinates[0][0],1);assert.equal(calls,1);
 for(const mutate of [()=>live.geometry[0][0]++,()=>live.terrain.model.grid.valuesBase64+='x',()=>live.terrain.history.entries.push({id:'new'}),()=>owner.ownerId='two']){mutate();cache.read(live,owner);}assert.equal(calls,5);
 let negatives=0;const invalid=createTerrainCalculationPresentationCache(()=>({terrainStatus:++negatives===1?'invalid':'applied'}));invalid.read(live,owner);invalid.read(live,owner);invalid.read(live,owner);assert.equal(negatives,2);
});
test('advisory negatives retry and content/portion edits invalidate independently copied values',()=>{
 let calls=0;const cache=createTerrainRestorePresentationCache(()=>++calls===1?{available:false,reason:'invalid-history'}:{available:true}),live=field();
 assert.equal(cache.read(live,'A').available,false);cache.read(live,'A').available=false;assert.equal(cache.read(live,'A').available,true);assert.equal(calls,2);
 live.geometry[0][0]++;cache.read(live,'A');cache.read(live,'B');assert.equal(calls,4);cache.clear();cache.read(live,'B');assert.equal(calls,5);
});
test('closed library avoids metrics and reopens with current field cards and actions',()=>{
 const {document}=parseHTML('<html><body><div class="topbar-actions"></div></body></html>');let fields=[{id:'a',label:'Old',geometry:[]}],calls=0;
 const ui=createDesktopLibraryUI({document,isDesktop:()=>true,getFields:()=>fields,getProjects:()=>[],getFieldMetrics:()=>{calls++;return {rows:[],rowCount:1,commercialPlants25:25};}});ui.mount();ui.render();assert.equal(calls,0);
 ui.open('fields');assert.ok(document.querySelector('[data-desktop-field="a"]'));const count=calls;
 ui.close();fields=[{id:'b',label:'New',geometry:[]}];ui.render();assert.equal(calls,count);assert.equal(document.querySelector('[data-desktop-field="a"]'),null);
 ui.open('fields');assert.ok(document.querySelector('[data-desktop-field="b"]'));assert.ok(calls>count);
});
test('no-op close3D preserves controls while destroy still publishes unavailable',async()=>{
 const {document}=parseHTML('<section id="terrain-card"></section>'),states=[];
 const controller=createTerrainController({document,getProject:()=>({geometry:[[7,45],[7.1,45],[7,45.1],[7,45]]}),getContext:()=>({fieldId:'f'}),loadTerrain:async()=>({contentHash:'model'}),summarize:async()=>({valid:true}),covers:async()=>true,onStateChange:s=>states.push(s)});
 await controller.refresh();const count=states.length,heading=document.querySelector('.terrain-heading');controller.close3D();controller.close3D();assert.equal(states.length,count);assert.equal(document.querySelector('.terrain-heading'),heading);
 controller.destroy();assert.equal(states.at(-1).available,false);
});
test('actual controller advisory preservation still invalidates edits and keeps Restore and retry fresh',async()=>{
 const file=new URL('../src/terrain-controller.js',import.meta.url),source=readFileSync(file,'utf8')
  .replace('attachTerrainRestore,terrainRestoreAvailability,','attachTerrainRestore,terrainRestoreAvailability as actualAvailability,')
  .replace('terrainRestorePresentationAvailability,','terrainRestorePresentationAvailability as actualPresentationAvailability,')
  .replace('const clone=value=>structuredClone(value);','export let reads=0;const terrainRestoreAvailability=options=>{reads++;return actualAvailability(options);};const terrainRestorePresentationAvailability=options=>{reads++;return actualPresentationAvailability(options);};\nconst clone=value=>structuredClone(value);')
  .replace(/from '([^']+)'/g,(_all,path)=>`from '${new URL(path,file).href}'`);
 const observed=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const {document}=parseHTML('<section id="terrain-card"></section>');let context={fieldId:'first'},live={geometry:[[7,45],[7.1,45],[7,45.1],[7,45]],rowPortions:[]};
 const controller=observed.createTerrainController({document,getProject:()=>live,getContext:()=>context,loadTerrain:async()=>({contentHash:'model'}),summarize:async()=>({valid:true}),covers:async()=>true});
 try{
  const initial=observed.reads;controller.getState();await controller.refresh({preserveRestorePresentation:true});assert.equal(observed.reads,initial);
  live.geometry[0][0]+=.01;controller.getState();assert.equal(observed.reads,initial+1);
  const changed=observed.reads;await controller.refresh({preserveRestorePresentation:true});assert.equal(observed.reads,changed);
  await controller.restore();assert.equal(observed.reads,changed+1);
  const beforeRetry=observed.reads;await controller.retry();assert.equal(observed.reads,beforeRetry+1);
  context={fieldId:'second'};const beforeDefault=observed.reads;await controller.refresh();assert.equal(observed.reads,beforeDefault+1);
 }finally{controller.destroy();}
});
test('cancelled lazy 3D completion cannot replace a later opening',async()=>{
 let resolveFirst,resolveSecond,creates=0,firstOpens=0,firstDestroys=0;
 const first=new Promise(resolve=>resolveFirst=resolve),second=new Promise(resolve=>resolveSecond=resolve),{document}=parseHTML('<section id="terrain-card"></section>');
 const controller=createTerrainController({document,getProject:()=>({geometry:[[7,45],[7.1,45],[7,45.1],[7,45]]}),getContext:()=>({fieldId:'f'}),getMapApi:()=>({map:{}}),loadTerrain:async()=>({contentHash:'model'}),summarize:async()=>({valid:true}),covers:async()=>true,createMapView:()=>++creates===1?first:second});
 await controller.refresh();const opening=controller.toggle3D();await new Promise(resolve=>setTimeout(resolve,0));controller.close3D();controller.close3D();
 const newer=controller.toggle3D();await new Promise(resolve=>setTimeout(resolve,0));resolveFirst({open:async()=>firstOpens++,destroy:()=>firstDestroys++});await opening;
 assert.equal(firstOpens,0);assert.equal(firstDestroys,1);assert.equal(controller.getState().viewOpening,true);
 resolveSecond({open:async()=>{},close(){},destroy(){}});await newer;assert.equal(controller.getState().in3D,true);controller.destroy();
});
test('actual app wrapper caches only display and retains fresh authority callbacks',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 assert.match(app,/function calculateFieldPresentation\(/);
 let calls=0;const live=field(),context={calculateProject:()=>{calls++;return result();},fieldCalculationInputs,createTerrainCalculationPresentationCache,state:{project:{...live,localProjectId:'p'},environment:'LIVE'},APP_CONFIG:{environment:'LIVE'},authBridge:{getState:()=>({user:{id:'owner'}})},identityFrozen:false,overviewMode:false};
 const functions=Function(...Object.keys(context),app.slice(app.indexOf('function calculateFieldProject('),app.indexOf('function calculateAndRender('))+';return {calculateFieldProject,calculateFieldPresentation};')(...Object.values(context));
 functions.calculateFieldPresentation(live);functions.calculateFieldPresentation(live);assert.equal(calls,1);functions.calculateFieldProject(live);functions.calculateFieldProject(live);assert.equal(calls,3);
 assert.match(app,/const result = calculationPresentation\.readFresh\(project,/);assert.match(app,/void terrainController\?\.refresh\(\{preserveRestorePresentation:true\}\)/);
 assert.match(app,/ensureQuoteRevision\([^\n]*getMetrics:\(field\)=>calculateFieldProject\(field\)/);assert.match(app,/buildCloudSnapshot\([^\n]*field=>calculateFieldProject\(field\)/);
 assert.doesNotMatch(app,/loadActiveFieldOnMap\(\);renderFieldManager\(\);renderExclusions\(\);syncProjectControls\(\);calculateAndRender\(\);/);
});
