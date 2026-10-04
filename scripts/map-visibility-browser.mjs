// Exercise visual overlay preferences through the real configurator in Chromium.
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
const output=resolve(process.env.MAP_VISIBILITY_BROWSER_OUTPUT??'/tmp/v126-map-qa');
await mkdir(output,{recursive:true});
const assets=process.env.MAP_VISIBILITY_BROWSER_ASSETS??'/tmp/v126-browser-assets';
const maplibre=await readFile(process.env.COUNTS_MAPLIBRE_PATH??resolve(assets,'maplibre-gl.js'),'utf8');
const draw=await readFile(process.env.COUNTS_MAPBOX_DRAW_PATH??resolve(assets,'mapbox-gl-draw.js'),'utf8');
const maplibreCss=await readFile(process.env.COUNTS_MAPLIBRE_CSS_PATH??resolve(assets,'maplibre-gl.css'),'utf8');
const drawCss=await readFile(process.env.COUNTS_MAPBOX_DRAW_CSS_PATH??resolve(assets,'mapbox-gl-draw.css'),'utf8');
const appOverride=process.env.COUNTS_APP_PATH?await readFile(process.env.COUNTS_APP_PATH,'utf8'):null;
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
    onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},from:chain,rpc(name){return Promise.resolve({data:{status:name==='create_project_revision'?'revision_created':'applied',projectId:'fixture-project',version:1,revisionNumber:1},error:null});}};
}`;
const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures/l-shaped-portions.json'),'utf8'));
const state=createInitialState();
const plainGeometry=[[.001,45],[.0015,45],[.0015,45.0005],[.001,45.0005],[.001,45]];
state.project=ensureProjectFields({...state.project,localProjectId:'fixture-portions',localProjectName:'Porzioni indipendenti',activeFieldId:'l-field',fields:[
 {...state.project.fields[0],...fixture,id:'l-field',geometry:fixture.polygon,orientationLocked:true,headlandWidthM:4,label:'Campo a L',rowPortions:[]},
 {...state.project.fields[0],id:'plain-field',geometry:plainGeometry,orientationDeg:45,orientationLocked:true,label:'Campo intero',rowCurvePoints:[{id:'plain-curve',position:.5,offsetM:2}],rowPortions:[]}
]});
const owner='00000000-0000-4000-8000-000000000125',draftKey='vivai-obice:configuratore:draft:live:'+owner;
const reports=[];
let browser;
try{
 const executablePath=process.env.MAP_VISIBILITY_CHROMIUM_PATH??process.env.COUNTS_CHROMIUM_PATH;
 browser=await chromium.launch({headless:true,...(executablePath?{executablePath,args:['--no-sandbox','--disable-dev-shm-usage']}: {})});
 for(const mobile of [false,true]){
  const name=mobile?'mobile':'desktop';
  const context=await browser.newContext(mobile?{viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true}:{viewport:{width:1440,height:1000}});
  const page=await context.newPage(),errors=[];let blockedRequests=0;
  page.on('pageerror',error=>errors.push(error.message));
  const workspace={version:1,ownerId:owner,projectId:state.project.localProjectId,fieldId:state.project.activeFieldId,
   map:{drawing:false,mode:'perimeter',vertices:[],previousPerimeter:null,editRing:null,camera:{center:[0,44.9993],zoom:17,bearing:0}},
   navigation:{mobile:{screen:'map',transaction:false},fullscreen:false,transactionSnapshot:null}};
  await context.addInitScript(({draftKey,state,workspace,owner})=>{
   window.__fixture={user:{id:owner,is_anonymous:false,email:'test@example.test',app_metadata:{}}};
   localStorage.setItem(draftKey,JSON.stringify({version:3,state,workspace,savedAt:new Date().toISOString()}));
   localStorage.setItem('vivai-obice:configuratore:consent','necessary');
  },{draftKey,state,workspace,owner});
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.href.startsWith(base+'/'))return route.continue();
   if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js')return route.fulfill({contentType:'application/javascript',body:maplibre+exposeMap});
   if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.js')return route.fulfill({contentType:'application/javascript',body:draw});
   if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css')return route.fulfill({contentType:'text/css',body:maplibreCss});
   if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.css')return route.fulfill({contentType:'text/css',body:drawCss});
   if(url.href==='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')return route.fulfill({contentType:'application/javascript',body:sdk});
   if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:''});
   blockedRequests++;return route.abort();
  });
  const click=async selector=>{const locator=page.locator(selector).first();await locator.scrollIntoViewIfNeeded();if(mobile)await locator.tap();else await locator.click();};
  const eye='[data-map-visibility-trigger]',input=key=>'[data-map-visibility="'+key+'"]';
  const open=async()=>{if(await page.locator(eye).getAttribute('aria-expanded')!=='true')await click(eye);};
  const snapshot=()=>page.evaluate(async key=>{
   const project=JSON.parse(localStorage.getItem(key)).state.project;
   const {calculateProject}=await import('/src/project-calculator.js');
   const result=calculateProject({...project,polygon:project.geometry});
   const sourceIds=['project-geometry','other-project-fields','excluded-zones','vineyard-rows','other-project-rows','row-portions'];
   return {project,rows:result.rows,plants:result.commercialPlants25,headPosts:result.headPosts,
    sources:Object.fromEntries(sourceIds.map(id=>[id,__map.getSource(id)._data]))};
  },draftKey);
  const checkVisibility=async expected=>{
   const actual=await page.evaluate(()=>{
    const fieldIds=['project-geometry-fill','project-geometry-line','other-project-fields-fill','other-project-fields-line','excluded-zones-fill','excluded-zones-line','row-portions-fill','row-portions-outline'];
    const schemaIds=['vineyard-rows-line','other-project-rows-line'];
    const visible=id=>(__map.getLayoutProperty(id,'visibility')??'visible')==='visible';
    return {field:fieldIds.map(visible),schema:schemaIds.map(visible),quotes:[...document.querySelectorAll('.side-measurement-label')].map(node=>getComputedStyle(node).display!=='none'),
     labels:getComputedStyle(document.querySelector('.map-field-label-overlay')).display!=='none',
     sourcePlants:__map.getSource('vineyard-rows')._data.features.length,checks:Object.fromEntries([...document.querySelectorAll('[data-map-visibility]')].map(node=>[node.dataset.mapVisibility,node.checked]))};
   });
   assert.ok(actual.field.every(value=>value===expected.field),'field layers match the checkbox');
   assert.ok(actual.schema.every(value=>value===expected.schema),'schema layers match the checkbox');
   assert.ok(actual.quotes.length>0,'field measurements exist');assert.ok(actual.quotes.every(value=>value===expected.quotes),'measurement labels match the checkbox');
   assert.equal(actual.labels,expected.field);assert.deepEqual(actual.checks,expected);assert.ok(actual.sourcePlants>0,'hidden row data remains available');
  };
  try{
   await page.goto(base+'/');
   await page.waitForFunction(key=>window.__map?.getSource('row-portions')&&document.querySelector('#profile-trigger')?.textContent!=='Profilo'&&JSON.parse(localStorage.getItem(key))?.workspace?.savedAt&&!document.querySelector('.workspace-restore-gate'),draftKey,{timeout:20000});
   await page.waitForFunction(()=>!__map.isMoving());
   const before=await snapshot();
   await open();await checkVisibility({field:true,schema:true,quotes:true});
   await click(input('field'));await checkVisibility({field:false,schema:true,quotes:true});
   assert.deepEqual(await snapshot(),before,'hiding field is purely visual');
   await click(input('schema'));await click(input('quotes'));await checkVisibility({field:false,schema:false,quotes:false});
   await page.screenshot({path:resolve(output,name+'-all-hidden.png'),fullPage:true});
   await click(input('field'));await checkVisibility({field:true,schema:false,quotes:false});
   await page.evaluate(()=>{__map.resize();__map.fire('idle');});await checkVisibility({field:true,schema:false,quotes:false});
   assert.deepEqual(await snapshot(),before,'redraw retains geometry, calculated rows, plants, posts and sources');
   if(mobile){
    await click(eye);await click('#mobile-app [data-view="fields"]');await click('.mobile-field-card[data-field-id="l-field"]');
    await page.waitForFunction(()=>document.body.dataset.mobileScreen==='detail'&&!__map.isMoving());
    assert.ok(await page.locator('#mobile-detail-map '+eye).isVisible(),'Campi detail has a visible eye');
    await open();await checkVisibility({field:true,schema:false,quotes:false});
    await page.screenshot({path:resolve(output,'mobile-campi-eye.png'),fullPage:true});
    await click(eye);await click('#mobile-edit-map');
    await page.waitForFunction(()=>document.body.dataset.mobileScreen==='editor'&&!__map.isMoving());
    await open();await checkVisibility({field:true,schema:false,quotes:false});
    await page.screenshot({path:resolve(output,'mobile-editor-eye.png'),fullPage:true});
    await click(eye);await click('[data-sheet="perimeter"]');await click('#edit-vertices-button');
   }else{await click(eye);await click('#edit-vertices-button');}
   await page.waitForFunction(()=>document.querySelectorAll('.vertex-edit-handle').length>0);
   const editBefore=await snapshot();const handlesBefore=await page.locator('.vertex-edit-handle').count();
   await open();await click(input('field'));await checkVisibility({field:false,schema:false,quotes:false});
   assert.equal(await page.locator('.vertex-edit-handle').count(),handlesBefore,'eye does not end active vertex editing');
   assert.equal(await page.locator('.vertex-edit-handle').first().isVisible(),true,'hidden field leaves editing handles visible');
   await page.locator(input('field')).focus();await page.keyboard.press('Escape');
   assert.equal(await page.locator('.vertex-edit-handle').count(),handlesBefore,'panel Escape preserves active edit');
   await open();await click('[data-map-visibility-restore]');await checkVisibility({field:true,schema:true,quotes:true});
   assert.deepEqual(await snapshot(),editBefore,'show all preserves project/calculations/sources');
   await page.screenshot({path:resolve(output,name+'-restored-edit.png'),fullPage:true});
   const profileViews=[];
   if(mobile){
    await click(eye);await click('#mobile-editor-cancel');
    await click('#mobile-app [data-view="profile"]');
    await page.waitForFunction(()=>document.body.dataset.mobileScreen==='profile'&&document.querySelector('.mobile-profile-details input'));
    for(const [width,height] of [[320,568],[390,844],[568,320]]){
     await page.setViewportSize({width,height});
     await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
     const profile=await page.evaluate(()=>{
      const pages=document.querySelector('#mobile-pages'),nav=document.querySelector('.mobile-navigation').getBoundingClientRect();
      const controls=[...document.querySelectorAll('#mobile-profile-content input,#mobile-profile-content button,#mobile-theme-choice')].map(node=>{const b=node.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right};});
      return {height:pages.clientHeight,scrollHeight:pages.scrollHeight,width:pages.clientWidth,scrollWidth:pages.scrollWidth,navTop:nav.top,controls,inputs:document.querySelectorAll('.mobile-profile-details input').length};
     });
     assert.equal(profile.inputs,10,'all profile fields remain present');
     assert.ok(profile.scrollHeight<=profile.height,'complete profile requires no vertical scrolling');
     assert.ok(profile.scrollWidth<=profile.width,'complete profile has no horizontal overflow');
     assert.ok(profile.controls.every(b=>b.top>=0&&b.bottom<=profile.navTop&&b.left>=0&&b.right<=width),'all profile controls fit above navigation');
     await page.screenshot({path:resolve(output,`mobile-profile-${width}x${height}.png`)});
     profileViews.push({width,height,inputs:profile.inputs,scrolling:false});
    }
   }
   assert.deepEqual(errors,[]);
   reports.push({name,passed:true,blockedRequests,externalRequestsAllowed:0,overlays:['Campo','Schema vigneto','Quote'],editingHandles:handlesBefore,profileViews});
  }catch(error){await page.screenshot({path:resolve(output,name+'-failure.png'),fullPage:true});throw error;}
  finally{await context.close();}
 }
 await writeFile(resolve(output,'summary.json'),JSON.stringify({passed:true,reports},null,2));console.log(JSON.stringify({passed:true,reports},null,2));
}finally{await browser?.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
