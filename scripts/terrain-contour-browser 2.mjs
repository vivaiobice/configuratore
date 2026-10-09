// Actual checkout app/controller/worker; only anonymous auth, native provider,
// pinned third-party assets and transparent Worker observation are fixtures.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createInitialState} from '../src/state.js';
import {ensureProjectFields} from '../src/fields.js';
import {createTerrainModel} from '../src/terrain-model.js';
import {fromUTM} from '../src/coordinate-system.js';

const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.env.APP_PATH??fileURLToPath(new URL('../',import.meta.url)));
const output=resolve(process.env.TERRAIN_CONTOUR_BROWSER_OUTPUT??resolve(root,'.superpowers/sdd/2026-10-05-contour-rows-and-cut-suggestions/task-8b-core-artifacts/browser'));
await mkdir(output,{recursive:true});
const assets=process.env.MAP_VISIBILITY_BROWSER_ASSETS??'/tmp/contour-qa-runtime/assets';
const [maplibre,draw,maplibreCss,drawCss]=await Promise.all(['maplibre-gl.js','mapbox-gl-draw.js','maplibre-gl.css','mapbox-gl-draw.css'].map(name=>readFile(resolve(assets,name),'utf8')));
const geo=([x,y])=>fromUTM([500000+x,5000000+y],32632);
const geometry=[[0,0],[12,0],[12,12],[0,12],[0,0]].map(geo);
const source={id:'anonymous-core-dtm',label:'DTM anonimo del campo',resolutionM:5,surveyEpoch:'2019',release:'fixture 2026',citation:'Fixture nativa anonima 5×5',license:'CC0',url:'https://example.test/native-fixture'};
const model=createTerrainModel({source,acquiredAt:'2026-10-06T00:00:00Z',grid:{width:5,height:5,origin:[499995,5000015],step:[5,-5],values:Array.from({length:25},(_,i)=>(15-Math.floor(i/5)*5)/2)}});
const seed=createInitialState();seed.project=ensureProjectFields({...seed.project,localProjectId:'terrain-core-fixture',localProjectName:'Terreno anonimo',activeFieldId:'f',fields:['f','other'].map(id=>({...seed.project.fields[0],id,label:id==='f'?'Campo anonimo':'Altro campo anonimo',geometry,terrain:null,rowPortions:[],rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:0,orientationDeg:0,orientationLocked:true,rowCurvePoints:[]}))});
const owner='00000000-0000-4000-8000-000000000148',draftKey='vivai-obice:configuratore:draft:live:'+owner;
const sdk=`export function createClient(){
 const user=window.__fixture.user,session={user,access_token:'anonymous-fixture'};
 const chain=table=>{let row=null,single=false;const query=new Proxy({}, {get(_target,key){
  if(key==='then')return(done,fail)=>Promise.resolve({data:single?(table==='profiles'?{user_id:user.id,owner_kind:'guest',display_name:'Anonimo',...row}:{id:'fixture',...row}):[],error:null}).then(done,fail);
  return(...args)=>{if(key==='upsert'||key==='insert')row=args[0];if(key==='single'||key==='maybeSingle')single=true;return query;};
 }});return query;};
 return{auth:{async getSession(){if(!window.__map?.__initialLoad)await new Promise(done=>window.__map.once('load',done));return{data:{session},error:null};},onAuthStateChange(callback){(window.__authHandlers??=[]).push(callback);return{data:{subscription:{unsubscribe(){}}}};}},from:chain,rpc(){return Promise.resolve({data:{status:'applied',projectId:'fixture',version:1},error:null});}};
}`;
const exposeMap=`;const NativeMap=maplibregl.Map;maplibregl.Map=class extends NativeMap{constructor(...args){super(...args);window.__map=this;this.on('load',()=>this.__initialLoad=true);}};`;
const server=createServer(async(req,res)=>{try{
 let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname.endsWith('/'))pathname+='index.html';
 const path=resolve(root,'.'+pathname);if(!path.startsWith(root+'/'))throw new Error('Forbidden');
 res.setHeader('Content-Type',({'.js':'application/javascript','.mjs':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.json':'application/json'})[extname(path)]??'application/octet-stream');
 res.end(await readFile(path));
}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+server.address().port;
let browser;const reports=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.COUNTS_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const mobile of (process.env.TERRAIN_CONTOUR_BROWSER_VIEW==='mobile'?[true]:[false,true])){
  const name=mobile?'mobile':'desktop';const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1440,height:1000}});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.stack??error.message));
  const workspace={version:1,ownerId:owner,projectId:seed.project.localProjectId,fieldId:'f',map:{drawing:false,mode:'perimeter',vertices:[],previousPerimeter:null,editRing:null,camera:{center:geo([6,6]),zoom:18,bearing:0}},navigation:{mobile:{screen:'map',transaction:false},fullscreen:false,transactionSnapshot:null}};
  await context.addInitScript(({seed,workspace,owner,draftKey,model})=>{
   window.__fixture={model,user:{id:owner,is_anonymous:true,app_metadata:{}},failProvider:sessionStorage.getItem('provider-ready')!=='true'};
   if(!localStorage.getItem(draftKey))localStorage.setItem(draftKey,JSON.stringify({version:3,state:seed,workspace,savedAt:'2026-10-06T00:00:00Z'}));
   localStorage.setItem('vivai-obice:configuratore:consent','necessary');
   window.__solver=[];const NativeWorker=Worker;window.Worker=class extends NativeWorker{
    constructor(url,options){super(url,options);this.record={url:String(url),messages:[],request:null,terminated:false};if(this.record.url.includes('/terrain-worker.js'))window.__solver.push(this.record);
     this.addEventListener('message',({data})=>{if(this.record.url.includes('/terrain-worker.js'))this.record.messages.push(data);});}
    postMessage(data,...args){if(this.record.url.includes('/terrain-worker.js'))this.record.request=data;return super.postMessage(data,...args);}
    terminate(){this.record.terminated=true;return super.terminate();}
   };
  },{seed,workspace,owner,draftKey,model});
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.href.startsWith(base+'/')){
    if(url.pathname==='/src/terrain-provider.js')return route.fulfill({contentType:'application/javascript',body:'export async function loadTerrainForField(){if(window.__fixture.failProvider)throw new Error("Fixture acquisizione non disponibile");return window.__fixture.model;}'});
    return route.continue();
   }
   const pinned={
    'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js':['application/javascript',maplibre+exposeMap],
    'https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.js':['application/javascript',draw],
    'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css':['text/css',maplibreCss],
    'https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.css':['text/css',drawCss],
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm':['application/javascript',sdk],
   };
   if(pinned[url.href])return route.fulfill({contentType:pinned[url.href][0],body:pinned[url.href][1]});
   if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:''});return route.abort();
  });
  const click=async selector=>{const locator=page.locator(selector).first();await locator.scrollIntoViewIfNeeded();if(mobile)await locator.tap();else await locator.click();};
  // Durable snapshots deliberately omit the editor's duplicate terrain mirror.
  const saved=async()=>ensureProjectFields(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.project,draftKey));
  const action=name=>`[data-terrain-action="${name}"]`;
  const waitReady=async()=>page.waitForFunction(()=>document.querySelector('[data-terrain-action="terrain"]')?.disabled===false,null,{timeout:20000});
  const waitProposal=async()=>page.waitForFunction(()=>document.querySelector('[data-terrain-action="apply"]')?.disabled===false,null,{timeout:15000});
  const openControls=async()=>{if(mobile){
   // A genuine saved workspace resumes its editor transaction after reload.
   if(await page.evaluate(()=>document.body.dataset.mobileScreen!=='editor')){await click('#mobile-app [data-view="fields"]');await click('.mobile-field-card[data-field-id="f"]');await click('#mobile-edit-map');}
   await click('#mobile-app [data-sheet="orientation"]');await click('[data-filari-section="curve"]>summary');
  }};
  const compactGeometry=()=>page.evaluate(()=>{const sheet=document.querySelector('.mobile-sheet'),bounds=sheet.getBoundingClientRect();return {sheet:{left:bounds.left,right:bounds.right},buttons:[...document.querySelectorAll('#terrain-curve-controls button')].map(button=>{const rect=button.getBoundingClientRect();return {action:button.dataset.terrainAction,left:rect.left,right:rect.right,height:rect.height,pressed:button.getAttribute('aria-pressed'),background:getComputedStyle(button).backgroundColor};})};});
  const operationReport=()=>page.evaluate(()=>__solver.map(record=>({kind:record.request?.kind,algorithmVersion:record.request?.algorithmVersion,
   phases:record.messages.filter(m=>m.type==='progress').map(m=>m.phase),ok:record.messages.find(m=>m.type==='result')?.proposal?.ok,
   status:record.messages.find(m=>m.type==='result')?.proposal?.status,terminated:record.terminated})));
  try{
   await page.goto(base+'/');await page.waitForFunction(()=>window.__map?.getSource('vineyard-rows')&&!document.querySelector('.workspace-restore-gate')&&document.querySelector('[data-terrain-retry]'),null,{timeout:25000});
   await openControls();assert.equal(await page.locator('#terrain-card').count(),0);assert.equal(await page.locator('#terrain-curve-controls').count(),1);assert.equal(await page.locator('[data-map-terrain]').count(),1);
   assert.equal(await page.locator(action('manual')).getAttribute('aria-pressed'),'true');
   await page.evaluate(()=>{window.__fixture.failProvider=false;sessionStorage.setItem('provider-ready','true');});await click('[data-terrain-retry]');await waitReady();
   const original=await saved();assert.equal(original.terrain,null);
   await click(action('terrain'));await waitProposal();assert.deepEqual(await saved(),original);assert.match(await page.locator('#terrain-proposal-review').textContent(),/tutto il campo/);
   assert.match(await page.locator('#terrain-proposal-review').textContent(),/—|→/);assert.equal(await page.locator(action('cut')).count(),0);
   await page.screenshot({path:resolve(output,name+'-proposal.png'),fullPage:true});
   if(mobile){const geometry=await compactGeometry();await writeFile(resolve(output,'mobile-controls-geometry.json'),JSON.stringify(geometry,null,2));for(const button of geometry.buttons){assert.ok(button.left>=geometry.sheet.left && button.right<=geometry.sheet.right,`${button.action} must fit horizontally inside existing mobile sheet`);assert.ok(button.height>=44,`${button.action} touch target must be at least44px`);}assert.notEqual(geometry.buttons.find(button=>button.action==='apply').background,geometry.buttons.find(button=>button.action==='manual').background,'Apply must retain its active appearance');}
   if(process.env.TERRAIN_CONTOUR_BROWSER_LAYOUT_ONLY==='1'){reports.push({name,compactControls:true});continue;}
   await click(action('cancel'));await page.waitForFunction(()=>!document.querySelector('[data-terrain-action="apply"]'));assert.deepEqual(await saved(),original);
   await click(action('terrain'));await waitProposal();await click(action('apply'));
   await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.project.fields.find(field=>field.id==='f')?.terrain?.history?.entries.length===1&&!document.querySelector('[data-terrain-action="apply"]'),draftKey,{timeout:15000});
   const applied=await saved(),baseline=applied.terrain.history.entries[0].before;
   assert.equal(baseline.source.rowPortionsPresence,'empty');assert.deepEqual(baseline.source.portions,original.rowPortions);
   await writeFile(resolve(output,name+'-saved-applied.json'),JSON.stringify(applied.fields.find(field=>field.id==='f'),null,2));
   assert.equal(applied.terrain.model.contentHash,model.contentHash);assert.equal(applied.terrain.applied.result.terrainStatus,'applied');
   assert.match(await page.locator('#terrain-summary').textContent(),/DTM anonimo del campo/);assert.match(await page.locator('#terrain-summary').textContent(),/Dislivello del campo/);
   assert.ok(await page.locator(action('restore')).count());await page.screenshot({path:resolve(output,name+'-applied.png'),fullPage:true});
   const adaptOps=await operationReport();assert.ok(adaptOps.filter(op=>op.kind==='adapt').length>=2);assert.ok(adaptOps.every(op=>op.algorithmVersion==='terrain-contour-family-1'&&op.ok===true&&op.terminated));
   await page.reload();await page.waitForFunction(()=>window.__map?.getSource('vineyard-rows')&&!document.querySelector('.workspace-restore-gate'),null,{timeout:20000});
   await openControls();await waitReady();assert.deepEqual(await saved(),applied);
   await click(action('manual'));await waitProposal();assert.deepEqual(await saved(),applied);
   assert.ok((await operationReport()).some(op=>op.kind==='measure'&&op.ok));await click(action('cancel'));await page.waitForFunction(()=>!document.querySelector('[data-terrain-action="apply"]'));
   await click(action('restore'));await waitProposal();assert.deepEqual(await saved(),applied);assert.ok((await operationReport()).some(op=>op.kind==='restore'&&op.ok));
   await click(action('apply'));await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.project.fields.find(field=>field.id==='f')?.terrain?.history?.entries.length===0&&!document.querySelector('[data-terrain-action="apply"]'),draftKey,{timeout:15000});
   const restored=await saved();assert.equal(restored.terrain.applied.result.terrainStatus,'applied');assert.equal(restored.terrain.history.entries.length,0);
   assert.deepEqual(restored.rowPortions,baseline.source.portions);
   for(const before of baseline.portions){const after=restored.terrain.applied.portionResults.find(portion=>portion.id===before.id);assert.deepEqual(after.rows,before.rows);assert.equal(after.quantityBasis,before.quantityBasis);}
   assert.equal(restored.terrain.applied.result.quantityBasis,'legacy-planar');
   await writeFile(resolve(output,name+'-saved-restored.json'),JSON.stringify(restored.fields.find(field=>field.id==='f'),null,2));
   const restoreOps=await operationReport();
   await page.reload();await page.waitForFunction(()=>window.__map?.getSource('vineyard-rows')&&!document.querySelector('.workspace-restore-gate'),null,{timeout:20000});
   await openControls();await waitReady();assert.deepEqual(await saved(),restored);
   const drawnRows=await page.evaluate(()=>window.__map.getSource('vineyard-rows')._data.features);assert.equal(drawnRows.length,restored.terrain.applied.result.rows.length);assert.ok(drawnRows.length>0);
   if(mobile){
    await click('#mobile-close-sheet');await click('#mobile-editor-next');await page.locator('#mobile-parameters-metrics .terrain-field-summary').waitFor();
    assert.match(await page.locator('#mobile-parameters-metrics').textContent(),/DTM anonimo del campo/);
    await page.locator('#mobile-parameters-metrics .terrain-field-summary').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,'mobile-source-summary.png'),fullPage:true});
   }
   await page.screenshot({path:resolve(output,name+'-restored.png'),fullPage:true});
   const manualControls=await page.evaluate(()=>['curve-add-button','curve-equidistance','curve-points-list','curve-edit-button','curve-reset-button'].every(id=>document.getElementById(id)));
   assert.equal(manualControls,true);assert.equal(await page.locator('#terrain-curve-controls').count(),1);
   if(mobile){await page.setViewportSize({width:1440,height:1000});await page.waitForFunction(()=>!document.body.classList.contains('mobile-app-active'));assert.equal(await page.locator('.step[data-step="2"] #terrain-curve-controls').count(),1);}
   assert.deepEqual(errors,[]);reports.push({name,sourceFixture:model.contentHash,retryAcquisition:true,actualWorkerAdapt:true,unappliedCancel:true,atomicApplyHistory:true,reloadedRestore:true,exactSavedBaselineRowsAndBasis:true,restoredRowFeatures:drawnRows.length,manualMeasure:true,
    sourceAndFieldRelief:true,manualControlsPreserved:true,singleReparentedHost:true,nativeCutAvailable:false,operations:[...adaptOps,...restoreOps,...await operationReport()],errors});
  }catch(error){await page.screenshot({path:resolve(output,name+'-failure.png'),fullPage:true});await writeFile(resolve(output,name+'-failure.json'),JSON.stringify({error:error.stack,errors,operations:await operationReport(),saved:await saved()},null,2));throw error;}
  finally{await context.close();}
 }
 await writeFile(resolve(output,'report.json'),JSON.stringify({browser:await browser.version(),hardwareFluidity:'unverified; prior 150ms diagnostic FAIL unchanged',reports},null,2));console.log(JSON.stringify(reports));
}finally{await browser?.close();server.close();}
