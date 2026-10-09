// Exercise terrain quantity availability and basis through the real configurator.
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
const output=resolve(process.env.MAP_VISIBILITY_BROWSER_OUTPUT??'/tmp/v130-mobile-basis-chip-qa');
await mkdir(output,{recursive:true});
const assets=process.env.MAP_VISIBILITY_BROWSER_ASSETS??'/tmp/v126-browser-assets';
const maplibre=await readFile(process.env.COUNTS_MAPLIBRE_PATH??resolve(assets,'maplibre-gl.js'),'utf8');
const draw=await readFile(process.env.COUNTS_MAPBOX_DRAW_PATH??resolve(assets,'mapbox-gl-draw.js'),'utf8');
const maplibreCss=await readFile(process.env.COUNTS_MAPLIBRE_CSS_PATH??resolve(assets,'maplibre-gl.css'),'utf8');
const drawCss=await readFile(process.env.COUNTS_MAPBOX_DRAW_CSS_PATH??resolve(assets,'mapbox-gl-draw.css'),'utf8');
const appOverride=(await readFile(resolve(root,'src/app.js'),'utf8'))+';window.__terrainTest={controller:terrainController,getState:()=>state,mapApi,mobileUi};';
const adminOverride=(await readFile(resolve(root,'admin/admin.js'),'utf8')).replace(/^init\(\);$/m,'')+';projects=window.__fixture.adminProjects;render();';
const engineOverride=process.env.COUNTS_ROW_CURVES_PATH?await readFile(process.env.COUNTS_ROW_CURVES_PATH,'utf8'):null;
const server=createServer(async(req,res)=>{try{
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.endsWith('/'))pathname+='index.html';
  const path=resolve(root,'.'+pathname);
  if(!path.startsWith(root+'/'))throw new Error('Forbidden');
  res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.ttf':'font/ttf'})[extname(path)]??'application/octet-stream');
  if(pathname==='/admin/admin.js'){res.end(adminOverride);return;}
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
import {calculateProject} from '../src/project-calculator.js';
import {fromUTM} from '../src/coordinate-system.js';
import {buildTerrainProposal} from '../src/terrain-design.js';
const geographic=point=>fromUTM([500000+point[0],5000000+point[1]],32632);
const geometry=[[0,0],[60,0],[60,20],[30,20],[30,60],[0,60],[0,0]].map(geographic);
const model=createTerrainModel({source:{id:'anonymous-l-dtm',label:'DTM anonimo',resolutionM:5,surveyEpoch:'2019',release:'fixture',citation:'Fixture L numerica',license:'CC0',url:'about:blank'},grid:{width:25,height:25,origin:[499980,5000100],step:[5,-5],values:Array.from({length:625},(_,i)=>(-20+i%25*5)/8)}});
const initial={label:'Campo L anonimo',geometry,exclusions:[{id:'cut',type:'linear',widthM:1.5,geometry:[[-5,19.25],[65,19.25],[65,20.75],[-5,20.75],[-5,19.25]].map(geographic)}],rowSpacingM:3,plantSpacingM:1,postSpacingM:5,headlandWidthM:0,orientationDeg:45,rowCurvePoints:[],rowPortions:[]};
const initialProposal=buildTerrainProposal({project:initial,model,followTerrain:false});assert.equal(initialProposal.ok,true,initialProposal.message);
const frozen={field:{...initial,rowPortions:initialProposal.rowPortions,terrain:initialProposal.terrain}};
const state=createInitialState();state.project=ensureProjectFields({...state.project,localProjectId:'terrain-fixture',localProjectName:'Terreno',activeFieldId:'f',fields:[{...state.project.fields[0],...frozen.field,id:'f',terrain:frozen.field.terrain,rowPortions:frozen.field.rowPortions,rowCurvePoints:[],label:'Campo anonimo'},{...state.project.fields[0],...initial,id:'valid',terrain:null,rowPortions:[],label:'Campo valido'}]});
const owner='00000000-0000-4000-8000-000000000130',draftKey='vivai-obice:configuratore:draft:live:'+owner;
const adminProjects=[{id:'p',owner_user_id:'fixture-owner',environment:'LIVE',name:'Progetto anonimo',field_plans:state.project.fields.map(f=>{const field={...f,...(f.id==='f'?{rowSpacingM:4}:{})};return {...field,metrics:calculateProject({...field,polygon:field.geometry})};})}];
const reports=[];let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.COUNTS_CHROMIUM_PATH??'/tmp/v126-chrome/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const mixed of [false,true]){
  const mobile=true,name=mixed?'mixed':'flat';
  const cut={id:'split',type:'linear',widthM:1.5,geometry:[[18.25,0],[19.75,0],[19.75,40],[18.25,40],[18.25,0]].map(geographic)};
  const fixture=appliedTerrainField(mixed?(x=>x<=20?0:(x-20)/2):(()=>0),{rowSpacingM:1,...(mixed?{exclusions:[cut]}:{})});const model=fixture.field.terrain.model;
  const state=createInitialState();state.project=ensureProjectFields({...state.project,localProjectId:'terrain-fixture',localProjectName:'Terreno',activeFieldId:'f',fields:[{...state.project.fields[0],...fixture.field,id:'f',label:'Campo anonimo'}]});const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1440,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const workspace={version:1,ownerId:owner,projectId:'terrain-fixture',fieldId:'f',map:{drawing:false,mode:'perimeter',vertices:[],previousPerimeter:null,editRing:null,camera:{center:state.project.geometry[0],zoom:17,bearing:0}},navigation:{mobile:{screen:'map',transaction:false},fullscreen:false,transactionSnapshot:null}};
  await context.addInitScript(({state,workspace,owner,draftKey,model,adminProjects})=>{window.__fixture={adminProjects,user:{id:owner,is_anonymous:true,app_metadata:{}},model};localStorage.setItem(draftKey,JSON.stringify({version:3,state,workspace,savedAt:new Date().toISOString()}));localStorage.setItem('vivai-obice:configuratore:consent','necessary');},{state,workspace,owner,draftKey,model,adminProjects});
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
   await page.goto(base+'/');await page.waitForFunction(()=>window.__terrainTest?.controller.getState().model&&window.__map?.getSource('vineyard-rows')&&!document.querySelector('.workspace-restore-gate'),null,{timeout:20000});await page.waitForFunction(()=>!__map.isMoving());
   await click('#mobile-app [data-view="fields"]');await click('.mobile-field-card[data-field-id="f"]');
   const values=await page.locator('#mobile-field-detail .mobile-metrics div').evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>[node.querySelector('dt').textContent,node.querySelector('dd').textContent])));
   const expected=await page.evaluate(result=>[result.rowLinearM,result.surfaceRowLinearM].map(n=>n.toLocaleString('it-IT',{maximumFractionDigits:1})+' m'),fixture.result);assert.equal(values['Metri per quantità'],expected[0]);assert.equal(values['Metri sul terreno'],expected[1]);assert.notEqual(values['Metri per quantità'],values['Metri sul terreno']);
   const notice=await page.locator('.mobile-terrain-quantity-basis').textContent();assert.match(notice,mixed?/Quantità in parte conservate/:/Quantità del disegno conservate/);assert.doesNotMatch(notice,/1\.2\.6/);
   await page.screenshot({path:resolve(output,name+'-basis-detail.png'),fullPage:true});await click('#mobile-edit-parameters');await page.evaluate(()=>{const input=document.getElementById('row-spacing');input.value='4';input.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal((await quantities()).terrainStatus,'invalid');assert.equal(await page.locator('#mobile-active-field').textContent(),'Campo anonimo · Da rivedere ›');assert.match(await page.locator('#mobile-parameters-metrics').textContent(),/Da rivedere/);assert.deepEqual(errors,[]);
   reports.push({name,actualMapLibre:'4.7.1',anonymous:true,quantityBasis:fixture.result.quantityBasis,quantityMetres:values['Metri per quantità'],groundMetres:values['Metri sul terreno'],versionFreeNotice:true,invalidActiveChip:true,errors});
  }catch(error){await page.screenshot({path:resolve(output,name+'-failure.png'),fullPage:true});console.error(name,await page.evaluate(()=>({status:window.__terrainTest?.controller.getState().status,terrain:window.__map?.getTerrain(),tiles:window.__map?.getTerrain()?Object.keys(window.__map.style.sourceCaches[window.__map.getTerrain().source]?._tiles??{}):[],screen:document.body.dataset.mobileScreen})),errors);throw error;}finally{await context.close();}
 }
 await writeFile(resolve(output,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
}finally{await browser?.close();server.close();}
