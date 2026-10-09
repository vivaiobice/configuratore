// Real MapLibre canvas and app selection regression for persistent field names.
// Backend/CDN responses are local fixtures; no production requests or writes.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createInitialState} from '../src/state.js';
const require=createRequire(import.meta.url);
const {chromium,devices}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),output=process.env.COUNTS_BROWSER_OUTPUT??'/tmp/map-field-labels-browser';await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{try{
 let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname.endsWith('/'))pathname+='index.html';
 const path=resolve(root,'.'+pathname);if(!path.startsWith(root+'/'))throw new Error('Forbidden');
 res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.ttf':'font/ttf'})[extname(path)]??'application/octet-stream');res.end(await readFile(path));
}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const maplibre=await readFile(process.env.COUNTS_MAPLIBRE_PATH,'utf8'),draw=await readFile(process.env.COUNTS_MAPBOX_DRAW_PATH,'utf8');
const baseline=process.env.MAP_LABEL_BASELINE_PATH?await readFile(process.env.MAP_LABEL_BASELINE_PATH,'utf8'):null;
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
 for(const [name,options,guest] of [
  ['desktop-user',{viewport:{width:1365,height:960}},false],
  ['mobile-user',{...devices['iPhone 13'],defaultBrowserType:undefined},false],
  ['desktop-guest',{viewport:{width:1365,height:960}},true]
 ]){
  const context=await browser.newContext(options),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const state=createInitialState();state.project.localProjectId='fixture-project';state.project.geometry=ring;state.project.fields[0].geometry=ring;state.project.label='Moscato';state.project.fields[0].label='Moscato';state.project.fields.push({...structuredClone(state.project.fields[0]),id:'second',label:'Barbera',geometry:ring.map(([x,y])=>[x+.002,y])});
  const workspace={version:1,ownerId:owner,projectId:state.project.localProjectId,fieldId:state.project.activeFieldId,
   map:{drawing:false,mode:'perimeter',vertices:[],previousPerimeter:null,editRing:null,camera:{center:[8.0005,44.0005],zoom:16,bearing:0}},
   navigation:{mobile:{screen:'map',transaction:false},fullscreen:false,transactionSnapshot:null}};
  await context.addInitScript(({draftKey,state,workspace,owner,guest})=>{
   window.__fixture={user:{id:owner,is_anonymous:guest,email:guest?undefined:'test@example.test',app_metadata:{}}};
   if(!localStorage.getItem(draftKey))localStorage.setItem(draftKey,JSON.stringify({version:3,state,workspace,savedAt:new Date().toISOString()}));
   localStorage.setItem('vivai-obice:configuratore:consent','necessary');
  },{draftKey,state,workspace,owner,guest});
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.href.startsWith(base+'/')){if(baseline&&url.pathname==='/src/map-field-label-overlay.js')return route.fulfill({contentType:'application/javascript',body:baseline});return route.continue();}
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
  const tags=async()=>page.locator('.map-field-label-overlay .field-label-marker').evaluateAll(nodes=>nodes.map(label=>{
   const r=label.getBoundingClientRect(),host=label.parentElement.getBoundingClientRect(),style=getComputedStyle(label);
   return {text:label.textContent,hidden:label.hidden,visible:style.display!=='none'&&style.visibility!=='hidden'&&r.width>0&&r.height>0,
    inside:r.left>=host.left&&r.right<=host.right&&r.top>=host.top&&r.bottom<=host.bottom,
    x:r.x,y:r.y,width:r.width,height:r.height};
  }));
  const allNames=async()=>assert.deepEqual((await tags()).filter(label=>label.visible).map(label=>label.text).sort(),['Barbera','Moscato']);
  await allNames();
  const activeId=state.project.activeFieldId;
  for(const selected of ['', 'second', activeId]){
   // Hidden native selectors on mobile dispatch the same application event.
   await page.evaluate(id=>{const node=document.querySelector('#map-field-select');node.value=id;node.dispatchEvent(new Event('change',{bubbles:true}));},selected);
   await page.evaluate(()=>__map.fitBounds([[8,44],[8.003,44.001]],{padding:50,duration:0}));
   await allNames();
   assert.equal(await page.locator('.map-field-label-overlay').evaluate(layer=>{
    const canvas=layer.parentElement.querySelector('canvas');return getComputedStyle(layer).position==='absolute'&&Number(getComputedStyle(layer).zIndex)>Number(getComputedStyle(canvas).zIndex)||getComputedStyle(layer).position==='absolute'&&Number(getComputedStyle(layer).zIndex)>0&&getComputedStyle(canvas).zIndex==='auto';
   }),true,'field names remain above the real drawing canvas');
  }
  // Leave a portion of Moscato visible, with its geographic center offscreen.
  await page.evaluate(()=>{
   const width=__map.getContainer().clientWidth,zoom=Math.log2(width*.4*360/(512*.001));
   __map.jumpTo({zoom,center:[8.0005+(.5+.08)*.001/.4,44.0005],bearing:0});
  });
  const center=await page.evaluate(()=>__map.project([8.0005,44.0005]).x);assert.ok(center<0,'regression camera has off-screen parcel center');
  const clipped=(await tags()).find(label=>label.text==='Moscato');
  assert.equal(clipped.visible&&clipped.inside,true,'visible parcel retains a complete readable name at the viewport edge');
  for(const bearing of [25,-25,0]){
   await page.evaluate(bearing=>__map.jumpTo({bearing}),bearing);
   assert.equal((await tags()).find(label=>label.text==='Moscato').visible,true,'rotation retains the visible parcel label');
  }
  await page.screenshot({path:output+'/'+name+'-clipped.png'});
  await page.evaluate(()=>__map.jumpTo({center:[8.04,44.0005]}));
  assert.equal((await tags()).find(label=>label.text==='Moscato').visible,false,'fully offscreen parcels do not create border tags');
  await page.evaluate(()=>__map.fitBounds([[8,44],[8.003,44.001]],{padding:50,duration:0}));await allNames();
  if(options.hasTouch){
   await page.locator('.mobile-navigation [data-view="fields"]').tap();
   await page.locator('.mobile-field-card').first().tap();
   await page.waitForFunction(()=>document.querySelector('#mobile-detail-map .map-wrap'));
   await page.evaluate(()=>__map.fitBounds([[8,44],[8.003,44.001]],{padding:50,duration:0}));await allNames();
   assert.equal((await tags()).every(label=>label.inside),true,'detail map labels resize with their new host');
  }else{
   assert.equal(await page.locator('#desktop-counts-trigger').count(),0,'upper-right Conteggi entry is removed');
   await page.locator('.brand').click();assert.equal(await page.locator('#tool-selector [data-tool="counts"]').isVisible(),true);
   await page.locator('#tool-selector [data-tool="configurator"]').click();
   await page.locator('#profile-trigger').click();assert.equal(await page.locator('[data-profile-counts]:visible').isVisible(),true);
  }
  assert.doesNotMatch(await page.locator('#map-status').textContent(),/Ripristino della bozza in corso/);
  await page.screenshot({path:output+'/'+name+'-restore.png'});assert.deepEqual(errors,[]);
  console.log(name+': active/other/no selection, offscreen center, pan/rotation, drawing canvas and preserved Conteggi access passed');await context.close();
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
