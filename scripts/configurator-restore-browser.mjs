// Exercise the real app.js startup, map editor and restoration gate in Chromium.
// Auth/database responses and raster images are local fixtures; no live writes.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createInitialState} from '../src/state.js';
const require=createRequire(import.meta.url);
const {chromium,devices}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),output=process.env.COUNTS_BROWSER_OUTPUT??'.counts-work/browser';await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{try{
 let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname.endsWith('/'))pathname+='index.html';
 const path=resolve(root,'.'+pathname);if(!path.startsWith(root+'/'))throw new Error('Forbidden');
 res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.ttf':'font/ttf'})[extname(path)]??'application/octet-stream');res.end(await readFile(path));
}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const maplibre=await readFile(process.env.COUNTS_MAPLIBRE_PATH,'utf8'),draw=await readFile(process.env.COUNTS_MAPBOX_DRAW_PATH,'utf8');
// Hold loaded() false only after the initial load, as with ongoing satellite
// requests/source updates. This reproduces the deadlock without slow networking.
const busyMap=`;const OriginalMap=maplibregl.Map;maplibregl.Map=class extends OriginalMap{
 constructor(...args){super(...args);window.__map=this;this.on('load',()=>{this.__initialLoad=true;});}
 loaded(){return this.__initialLoad?false:super.loaded();}};`;
const sdk=`export function createClient(){
 const user=window.__fixture.user,session={user,access_token:'fixture'};
 const chain=table=>{let row=null,single=false;const query=new Proxy({}, {get(_target,key){if(key==='then')return (done,fail)=>Promise.resolve({data:single?(table==='profiles'?{user_id:user.id,owner_kind:user.is_anonymous?'guest':'user',display_name:'Test',first_name:'Test',last_name:'User',phone:'123',email:'test@example.test',...row}:{id:'fixture',...row}):[],error:null}).then(done,fail);return (...args)=>{if(key==='upsert'||key==='insert')row=args[0];if(key==='single'||key==='maybeSingle')single=true;return query;};}});return query;};
 return {auth:{async getSession(){if(!window.__map?.__initialLoad)await new Promise(resolve=>window.__map.once('load',resolve));return {data:{session},error:null};},onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},from:chain,rpc(){return Promise.resolve({data:{},error:null});}};
}`;
const owner='00000000-0000-4000-8000-000000000020',draftKey='vivai-obice:configuratore:draft:live:'+owner;
const ring=[[8,44],[8.001,44],[8.001,44.001],[8,44.001],[8,44]];
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.COUNTS_CHROMIUM_PATH?{executablePath:process.env.COUNTS_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 for(const [name,options,partial,guest] of [
  ['desktop-user',{viewport:{width:1365,height:960}},false,false],
  ['mobile-user',{...devices['iPhone 13'],defaultBrowserType:undefined},false,false],
  ['desktop-guest-draft',{viewport:{width:1365,height:960}},true,true],
  ['mobile-guest-draft',{...devices['iPhone 13'],defaultBrowserType:undefined},true,true]
 ]){
  const context=await browser.newContext(options),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const state=createInitialState();state.project.localProjectId='fixture-project';state.project.geometry=partial?null:ring;state.project.fields[0].geometry=state.project.geometry;
  if(name==='desktop-user'){
   state.project.rowCurvePoints=[{id:'before',position:.25,offsetM:5},{id:'after',position:.75,offsetM:-5}];
   state.project.exclusions=[{id:'passage',type:'linear',widthM:1.5,geometry:[[7.9999,44.00049325],[8.0011,44.00049325],[8.0011,44.00050675],[7.9999,44.00050675],[7.9999,44.00049325]]}];
   Object.assign(state.project.fields[0],{rowCurvePoints:state.project.rowCurvePoints,exclusions:state.project.exclusions});
  }
  const workspace={version:1,ownerId:owner,projectId:state.project.localProjectId,fieldId:state.project.activeFieldId,
   map:{drawing:partial,mode:'perimeter',vertices:partial?[[8,44],[8.001,44]]:[],previousPerimeter:null,editRing:null,camera:{center:[8.0005,44.0005],zoom:16,bearing:0}},
   navigation:{mobile:{screen:partial?'editor':'map',transaction:partial},fullscreen:partial,transactionSnapshot:partial?state:null}};
  await context.addInitScript(({draftKey,state,workspace,owner,guest})=>{
   window.__fixture={user:{id:owner,is_anonymous:guest,email:guest?undefined:'test@example.test',app_metadata:{}}};
   if(!localStorage.getItem(draftKey))localStorage.setItem(draftKey,JSON.stringify({version:3,state,workspace,savedAt:new Date().toISOString()}));
   localStorage.setItem('vivai-obice:configuratore:consent','necessary');
  },{draftKey,state,workspace,owner,guest});
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.href.startsWith(base+'/'))return route.continue();
   if(url.href==='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js')return route.fulfill({contentType:'application/javascript',body:maplibre+busyMap});
   if(url.href==='https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.js')return route.fulfill({contentType:'application/javascript',body:draw});
   if(url.href==='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')return route.fulfill({contentType:'application/javascript',body:sdk});
   if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:''});
   return route.abort();
  });
  const readDraft=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),draftKey);
  await page.goto(base+'/');
  await page.waitForFunction(()=>window.__map?.getSource('manual-draw')&&document.querySelector('#profile-trigger')?.textContent!=='Profilo').catch(error=>{throw new Error(error.message+'; '+errors.join('; '));});
  await page.waitForFunction(key=>{const record=JSON.parse(localStorage.getItem(key));return record.workspace?.savedAt&&record.workspace.map.drawing===document.body.classList.contains('mobile-drawing')||record.workspace?.savedAt&&!document.body.classList.contains('mobile-app-active');},draftKey,{timeout:10000}).catch(error=>{throw new Error(error.message+'; '+errors.join('; ')+'; status: '+error);});
  assert.equal(await page.evaluate(()=>__map.loaded()),false);
  if(partial){
   assert.equal((await readDraft()).workspace.map.vertices.length,2,'unfinished vertices restored');
   if(options.hasTouch){await page.locator('#mobile-undo').tap();assert.equal((await readDraft()).workspace.map.vertices.length,1,'restored editor accepts touch');}
   else{const bounds=await page.locator('#map canvas').boundingBox();await page.mouse.click(bounds.x+bounds.width*.7,bounds.y+bounds.height*.6);assert.equal((await readDraft()).workspace.map.vertices.length,3,'restored editor accepts the next mouse point');}
  }else if(options.hasTouch){
   for(let i=0;i<3;i++){
    await page.locator('.mobile-navigation [data-view="fields"]').tap();await page.waitForFunction(()=>document.body.dataset.mobileScreen==='fields');
    await page.locator('.mobile-navigation [data-view="map"]').tap();await page.waitForFunction(()=>document.body.dataset.mobileScreen==='map');
   }
   await page.locator('#mobile-add-field').tap();await page.waitForFunction(()=>document.body.dataset.mobileScreen==='editor');
  }else{
   await page.locator('#row-spacing').fill('3.10');assert.equal((await readDraft()).state.project.rowSpacingM,3.1,'restored project accepts parameter edits');
   assert.match(await page.locator('.curve-point-card').nth(0).textContent(),/Tratto 1/);
   assert.match(await page.locator('.curve-point-card').nth(1).textContent(),/Tratto 2/);
   const signature=()=>page.evaluate(async key=>{const project=JSON.parse(localStorage.getItem(key)).state.project;
    const {calculateProject}=await import('/src/project-calculator.js');const result=calculateProject({polygon:project.geometry,...project});
    const ids=[...new Set(result.rows.map(row=>row.segmentId))];return {ids,rows:ids.map(id=>result.rows.filter(row=>row.segmentId===id)),map:__map.getSource('vineyard-rows')._data.features.map(feature=>feature.geometry.coordinates)};
   },draftKey);
   const before=await signature();assert.equal(before.ids.length,2);assert.ok(before.ids.every(Boolean));
   await page.locator('.curve-point-card').nth(0).locator('input[type="range"]').nth(1).evaluate(node=>{node.value='12';node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));});
   const after=await signature();assert.deepEqual(after.rows[1],before.rows[1],'changing the first curve keeps the second section unchanged');
   assert.notDeepEqual(after.rows[0],before.rows[0]);assert.notDeepEqual(after.map,before.map,'the actual map redraws the independently modified curves');
   assert.equal((await readDraft()).state.project.rowCurvePoints.find(point=>point.id==='before').offsetM,12);
  }
  if(options.hasTouch){
   assert.equal(await page.locator('.mobile-brand').isVisible(),false,'home header stays hidden in the restored editor');
   const boxes=await page.locator('.mobile-editor-top').evaluate(node=>[...node.children].filter(child=>getComputedStyle(child).display!=='none').map(child=>{const r=child.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
   for(let i=1;i<boxes.length;i++)assert.ok(boxes[i].x>=boxes[i-1].right&&boxes[i].y<boxes[i-1].bottom,'editor tool, back, title and continue share one row without overlap');
  }
  assert.doesNotMatch(await page.locator('#map-status').textContent(),/Ripristino della bozza in corso/);
  await page.screenshot({path:output+'/'+name+'-restore.png'});assert.deepEqual(errors,[]);
  console.log(name+': real app startup, one initial load, tiles pending, draft restore and interaction passed');await context.close();
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
