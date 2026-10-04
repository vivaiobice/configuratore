// Exercise terrain proposals, checkpoint recovery, 3D and coordinate lifecycle in the real app.
// All external requests are fulfilled from local fixtures or blocked.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createInitialState} from '../src/state.js';
import {ensureProjectFields} from '../src/fields.js';


const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const output=resolve(process.env.MAP_VISIBILITY_BROWSER_OUTPUT??'/tmp/v130-terrain-final-qa');
await mkdir(output,{recursive:true});
const assets=process.env.MAP_VISIBILITY_BROWSER_ASSETS??'/tmp/v126-browser-assets';
const maplibre=await readFile(process.env.COUNTS_MAPLIBRE_PATH??resolve(assets,'maplibre-gl.js'),'utf8');
const draw=await readFile(process.env.COUNTS_MAPBOX_DRAW_PATH??resolve(assets,'mapbox-gl-draw.js'),'utf8');
const maplibreCss=await readFile(process.env.COUNTS_MAPLIBRE_CSS_PATH??resolve(assets,'maplibre-gl.css'),'utf8');
const drawCss=await readFile(process.env.COUNTS_MAPBOX_DRAW_CSS_PATH??resolve(assets,'mapbox-gl-draw.css'),'utf8');
const appOverride=(await readFile(resolve(root,'src/app.js'),'utf8'))+';window.__terrainTest={controller:terrainController,getState:()=>state,mapApi,mobileUi};';
const engineOverride=process.env.COUNTS_ROW_CURVES_PATH?await readFile(process.env.COUNTS_ROW_CURVES_PATH,'utf8'):null;
const server=createServer(async(req,res)=>{try{
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.endsWith('/'))pathname+='index.html';
  const path=resolve(root,'.'+pathname);
  if(!path.startsWith(root+'/'))throw new Error('Forbidden');
  res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.ttf':'font/ttf'})[extname(path)]??'application/octet-stream');
  if(pathname==='/src/app.js'&&appOverride!==null){res.end(appOverride);return;}
  res.end(pathname==='/src/row-curves.js'&&engineOverride!==null?engineOverride:await readFile(path));
}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port;
const exposeMap=`;const OriginalMap=maplibregl.Map;maplibregl.Map=class extends OriginalMap{
  constructor(...args){super(...args);window.__map=this;this.on('load',()=>{this.__initialLoad=true;});}};`;
const sdk=`export function createClient(){
  const user=window.__fixture.user,session={user,access_token:'fixture'};
  const chain=table=>{let row=null,single=false;const query=new Proxy({}, {get(_target,key){
    if(key==='then')return (done,fail)=>Promise.resolve({data:single?(table==='profiles'?{
      user_id:user.id,owner_kind:'user',display_name:'Test',first_name:'Test',last_name:'User',
      phone:'123',email:'test@example.test',...row}:{id:'fixture',...row}):[],error:null}).then(done,fail);
    return (...args)=>{if(key==='upsert'||key==='insert')row=args[0];if(key==='single'||key==='maybeSingle')single=true;return query;};
  }});return query;};
  return {auth:{async getSession(){if(!window.__map?.__initialLoad)await new Promise(done=>window.__map.once('load',done));return {data:{session},error:null};},
    onAuthStateChange(callback){(window.__authHandlers??=[]).push(callback);return {data:{subscription:{unsubscribe(){}}}};}},from:chain,rpc(name){return Promise.resolve({data:{status:name==='create_project_revision'?'revision_created':'applied',projectId:'fixture-project',version:1,revisionNumber:1},error:null});}};
}`;

import {appliedTerrainField} from '../tests/fixtures/terrain-field.mjs';
import {createTerrainModel} from '../src/terrain-model.js';
import {fromUTM} from '../src/coordinate-system.js';
import {buildTerrainProposal} from '../src/terrain-design.js';
const geographic=point=>fromUTM([500000+point[0],5000000+point[1]],32632);
const geometry=[[0,0],[60,0],[60,20],[30,20],[30,60],[0,60],[0,0]].map(geographic);
const model=createTerrainModel({source:{id:'anonymous-l-dtm',label:'DTM anonimo',resolutionM:5,surveyEpoch:'2019',release:'fixture',citation:'Fixture L numerica',license:'CC0',url:'about:blank'},grid:{width:25,height:25,origin:[499980,5000100],step:[5,-5],values:Array.from({length:625},(_,i)=>(-20+i%25*5)/8)}});
const initial={label:'Campo L anonimo',geometry,exclusions:[{id:'cut',type:'linear',widthM:1.5,geometry:[[-5,19.25],[65,19.25],[65,20.75],[-5,20.75],[-5,19.25]].map(geographic)}],rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:0,orientationDeg:0,rowCurvePoints:[],rowPortions:[]};
const initialProposal=buildTerrainProposal({project:initial,model,followTerrain:false});assert.equal(initialProposal.ok,true,initialProposal.message);
const frozen={field:{...initial,rowPortions:initialProposal.rowPortions,terrain:initialProposal.terrain}};
const state=createInitialState();state.project=ensureProjectFields({...state.project,localProjectId:'terrain-fixture',localProjectName:'Terreno',activeFieldId:'f',fields:[{...state.project.fields[0],...frozen.field,id:'f',terrain:null,rowPortions:[],rowCurvePoints:[],label:'Campo anonimo'}]});
const owner='00000000-0000-4000-8000-000000000130',draftKey='vivai-obice:configuratore:draft:live:'+owner;
const reports=[];let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.COUNTS_CHROMIUM_PATH??'/tmp/v126-chrome/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const mobile of [false,true]){
  const name=mobile?'mobile':'desktop';const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1440,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const workspace={version:1,ownerId:owner,projectId:'terrain-fixture',fieldId:'f',map:{drawing:false,mode:'perimeter',vertices:[],previousPerimeter:null,editRing:null,camera:{center:state.project.geometry[0],zoom:17,bearing:0}},navigation:{mobile:{screen:'map',transaction:false},fullscreen:false,transactionSnapshot:null}};
  await context.addInitScript(({state,workspace,owner,draftKey,model})=>{window.__fixture={user:{id:owner,is_anonymous:false,email:'test@example.test',app_metadata:{}},model};localStorage.setItem(draftKey,JSON.stringify({version:3,state,workspace,savedAt:new Date().toISOString()}));localStorage.setItem('vivai-obice:configuratore:consent','necessary');},{state,workspace,owner,draftKey,model});
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.href.startsWith(base+'/')){if(url.pathname==='/src/terrain-provider.js')return route.fulfill({contentType:'application/javascript',body:'export async function loadTerrainForField(){return window.__fixture.model;}'});return route.continue();}
   if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js')return route.fulfill({contentType:'application/javascript',body:maplibre+exposeMap});
   if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.js')return route.fulfill({contentType:'application/javascript',body:draw});
   if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css')return route.fulfill({contentType:'text/css',body:maplibreCss});
   if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.css')return route.fulfill({contentType:'text/css',body:drawCss});
   if(url.href==='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')return route.fulfill({contentType:'application/javascript',body:sdk});
   if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:''});return route.abort();
  });
  const click=async selector=>{const node=page.locator(selector).first();await node.scrollIntoViewIfNeeded();if(mobile)await node.tap();else await node.click();};
  const project=()=>page.evaluate(()=>structuredClone(__terrainTest.getState().project));
  const quantities=()=>page.evaluate(async()=>{const {calculateProject}=await import('/src/project-calculator.js');const project=__terrainTest.getState().project;const r=calculateProject({...project,polygon:project.geometry});return {terrainStatus:r.terrainStatus,rowCount:r.rowCount,rowLinearM:r.rowLinearM,rows:r.rows,simulatedPlants:r.simulatedPlants,totalPosts:r.totalPosts};});
  try{
   await page.goto(base+'/');await page.waitForFunction(()=>window.__terrainTest?.controller.getState().model&&window.__map?.getSource('vineyard-rows')&&!document.querySelector('.workspace-restore-gate'),null,{timeout:20000});
   await page.waitForFunction(()=>!__map.isMoving());
   if(mobile){await click('#mobile-app [data-view="fields"]');await click('.mobile-field-card[data-field-id="f"]');await click('#mobile-edit-parameters');}
   await click('.advanced>summary');
   const oldProject=await project(),oldQuantities=await quantities();assert.equal(oldProject.terrain,null);assert.match(await page.locator('#terrain-card').textContent(),/DTM anonimo/);
   await click('[data-terrain="follow"]');await page.waitForFunction(()=>!!__terrainTest.controller.getState().proposal,null,{timeout:15000});assert.deepEqual(await project(),oldProject);assert.deepEqual(await quantities(),oldQuantities);assert.match(await page.locator('#terrain-card').textContent(),/tutto il campo/);assert.equal(await page.locator('.terrain-review-total td').first().textContent(),`${oldQuantities.rowCount} → ${await page.evaluate(()=>__terrainTest.controller.getState().proposal.result.rowCount)}`);
   const sourceBefore=await page.evaluate(()=>__map.getSource('vineyard-rows')._data);
   const camera=await page.evaluate(()=>({pitch:__map.getPitch(),bearing:__map.getBearing()+0,zoom:__map.getZoom()}));
   const eyes=await page.evaluate(()=>__terrainTest.mapApi.getOverlayVisibility());
   await click('[data-terrain="view"]');
   await page.waitForFunction(()=>__map.getTerrain()&&Object.values(__map.style.sourceCaches[__map.getTerrain().source]?._tiles??{}).some(tile=>tile.dem),null,{timeout:20000});
   assert.equal(await page.evaluate(()=>__map.getTerrain().exaggeration),1);assert.deepEqual(await project(),oldProject);assert.deepEqual(await quantities(),oldQuantities);
   await page.evaluate(()=>__map.jumpTo({pitch:67,bearing:33,zoom:18}));assert.deepEqual(await quantities(),oldQuantities);assert.deepEqual(await page.evaluate(()=>__terrainTest.mapApi.getOverlayVisibility()),eyes);
   await page.screenshot({path:resolve(output,name+'-terrain-proposal.png'),fullPage:true});
   await click('[data-terrain="view"]');assert.deepEqual(await page.evaluate(()=>({pitch:__map.getPitch(),bearing:__map.getBearing()+0,zoom:__map.getZoom()})),camera);assert.equal(await page.evaluate(()=>__map.getTerrain()),null);assert.deepEqual(await page.evaluate(()=>__map.getSource('vineyard-rows')._data),sourceBefore);
   await page.evaluate(key=>{window.__draftBefore=localStorage.getItem(key);window.__setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Quota exceeded','QuotaExceededError');return window.__setItem.call(this,k,v);};},draftKey);
   await click('[data-terrain="apply"]');await page.waitForFunction(()=>__terrainTest.controller.getState().status.includes('salvataggio locale non'));assert.deepEqual(await project(),oldProject);assert.equal(await page.evaluate(key=>localStorage.getItem(key)===window.__draftBefore,draftKey),true);assert.ok(await page.locator('[data-terrain="apply"]').isEnabled());
   await page.evaluate(()=>Storage.prototype.setItem=window.__setItem);await click('[data-terrain="apply"]');await page.waitForFunction(()=>__terrainTest.getState().project.terrain?.applied&& !__terrainTest.controller.getState().proposal);
   let applied=await project(),appliedQuantities=await quantities();assert.equal(appliedQuantities.terrainStatus,'applied');assert.equal(applied.terrain.model.contentHash,model.contentHash);
   await click('[data-terrain="view"]');await page.waitForFunction(()=>__map.getTerrain());
   // The app edit entry closes terrain before it creates vertex handles.
   await page.evaluate(()=>__terrainTest.mapApi.beginVertexEditing());await page.waitForFunction(()=>document.querySelectorAll('.vertex-edit-handle').length>0);assert.equal(await page.evaluate(()=>__map.getTerrain()),null);assert.equal(await page.evaluate(()=>__map.getPitch()),camera.pitch);await page.evaluate(()=>__terrainTest.mapApi.finishVertexEditing());assert.deepEqual(await quantities(),appliedQuantities);
   // A manual direction change produces an unapplied terrain proposal.
   await page.evaluate(()=>{const input=document.querySelector('#orientation');input.value='10';input.dispatchEvent(new Event('input',{bubbles:true}));input.value='20';input.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForFunction(()=>!!__terrainTest.controller.getState().proposal,null,{timeout:15000});assert.deepEqual(await project(),applied);assert.deepEqual(await quantities(),appliedQuantities);
   assert.equal(await page.evaluate(()=>__terrainTest.controller.getState().proposal.projectPatch.rowPortions.find(p=>p.mode==='local')?.orientationDeg),20,'latest direction input wins');
   const beforeSelectionBytes=await page.evaluate(key=>localStorage.getItem(key),draftKey);
   const buttons=page.locator('#row-portion-picker [data-portion-id]');assert.equal(await buttons.count(),2);await click('#row-portion-picker [data-portion-id]:nth-child(2)');
   assert.deepEqual(await project(),applied,'portion selection must not checkpoint unapplied manual input');assert.equal(await page.evaluate(key=>localStorage.getItem(key),draftKey),beforeSelectionBytes,'portion selection keeps exact draft bytes');assert.deepEqual(await quantities(),appliedQuantities);
   await page.evaluate(()=>__terrainTest.controller.cancel());

   // Global spacing and headlands on an applied two-portion field require a
   // whole-field proposal, even though a portion is currently selected.
   await page.evaluate(()=>{for(const [id,value] of [['row-spacing','4'],['headland','2']]){const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}});
   assert.equal((await quantities()).terrainStatus,'invalid');await page.waitForFunction(()=>!__terrainTest.controller.getState().busy);
   await click('[data-terrain="follow"]');await page.waitForFunction(()=>!!__terrainTest.controller.getState().proposal,null,{timeout:15000});
   assert.equal(await page.evaluate(()=>__terrainTest.controller.getState().proposal.scope),'field');for(const cell of await page.locator('.terrain-review-total td').allTextContents())assert.match(cell,/^— → /);assert.equal(await page.evaluate(()=>__terrainTest.controller.getState().proposal.terrain.applied.portionResults.length),2);
   await click('[data-terrain="apply"]');await page.waitForFunction(()=>!__terrainTest.controller.getState().proposal&&__terrainTest.getState().project.rowSpacingM===4);
   applied=await project();appliedQuantities=await quantities();assert.equal(appliedQuantities.terrainStatus,'applied');assert.equal(applied.headlandWidthM,2);
   // Rapid 3D opening is serialized through the actual MapLibre lifecycle.
   await page.evaluate(()=>Promise.all([__terrainTest.controller.toggle3D(),__terrainTest.controller.toggle3D()]));
   assert.equal(await page.evaluate(()=>Object.keys(__map.style.sourceCaches).filter(id=>id.startsWith('obice-terrain-')).length),1);
   await page.evaluate(()=>__terrainTest.controller.close3D());assert.equal(await page.evaluate(()=>Object.keys(__map.style.sourceCaches).filter(id=>id.startsWith('obice-terrain-')).length),0);assert.equal(await page.evaluate(()=>__map.getTerrain()),null);
   await page.screenshot({path:resolve(output,name+'-terrain-applied.png'),fullPage:true});
   // Retaining an old coordinate form cannot publish after an account transition,
   // including the recoverable branch where saving the identity checkpoint fails.
   if(mobile){await click('#mobile-parameters-map');}
   await page.evaluate(()=>__terrainTest.mapApi.beginVertexEditing());
   await click('.vertex-edit-handle');await click('.vertex-coordinate-action');await page.locator('.coordinate-dialog').waitFor();
   await page.evaluate(key=>{window.__staleCoordinateForm=document.querySelector('.coordinate-dialog form');Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Quota exceeded','QuotaExceededError');return window.__setItem.call(this,k,v);};for(const handler of window.__authHandlers)handler('SIGNED_IN',{user:{...window.__fixture.user,id:'00000000-0000-4000-8000-000000000999'}});__staleCoordinateForm.dispatchEvent(new Event('submit',{cancelable:true}));},draftKey);
   assert.equal(await page.locator('.coordinate-dialog').count(),0);assert.deepEqual(await project(),applied);assert.equal(await page.locator('.identity-change-notice').count(),1);
   assert.deepEqual(errors,[]);reports.push({name,actualMapLibre:'4.7.1',demTilesLoaded:true,checkpointRecovery:true,manualProposal:true,wholeFieldBeforeAfter:true,latestInputWins:true,selectionNeverSavesProposal:true,wholeFieldGlobalRecalculation:true,serialized3D:true,identityClosesCoordinates:true,errors});
  }catch(error){await page.screenshot({path:resolve(output,name+'-failure.png'),fullPage:true});console.error(name,await page.evaluate(()=>({status:window.__terrainTest?.controller.getState().status,terrain:window.__map?.getTerrain(),tiles:window.__map?.getTerrain()?Object.keys(window.__map.style.sourceCaches[window.__map.getTerrain().source]?._tiles??{}):[],screen:document.body.dataset.mobileScreen})),errors);throw error;}finally{await context.close();}
 }
 await writeFile(resolve(output,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
}finally{await browser?.close();server.close();}
