// Authentic Counts boot/runtime and scoped service worker in a fresh browser.
// Only the anonymous external SDK and public map/raster providers are fixtures.
// COUNTS_COLD_OFFLINE_RED=1 changes one precache query to simulate an old cache.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {APP_CONFIG} from '../src/config.js';
import {createInitialState} from '../src/state.js';
import {collectCountsOfflineAssets} from './build-counts-offline.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.env.COUNTS_COLD_BROWSER_ROOT??fileURLToPath(new URL('../',import.meta.url)));
const output=resolve(process.env.COUNTS_COLD_BROWSER_OUTPUT??'/tmp/counts-cold-offline-browser');
const assetRoot=process.env.MAP_VISIBILITY_BROWSER_ASSETS??'/tmp/v133-browser-assets';
const red=process.env.COUNTS_COLD_OFFLINE_RED==='1';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(output,{recursive:true});
const html=await readFile(resolve(root,'conteggi/index.html'),'utf8');
const entry=html.match(/type="module" src="([^"]+)"/)[1];
const entryPath=new URL(entry,'https://fixture.test/conteggi/').pathname.slice(1);
const entryURLPath=new URL(entry,'https://fixture.test/conteggi/').pathname+new URL(entry,'https://fixture.test/conteggi/').search;
const swSource=await readFile(resolve(root,'conteggi/sw.js'),'utf8');
const staticAssets=JSON.parse(swSource.match(/const STATIC_ASSETS=(.*);/)[1]);
const expectedAssets=await collectCountsOfflineAssets({root:pathToFileURL(root+sep)});
assert.deepEqual(staticAssets,expectedAssets,'the delivered SW precache must exactly match the delivered Counts graph');
assert.equal(new URL(entry,'https://fixture.test/conteggi/').searchParams.get('v'),APP_CONFIG.version,'entry uses canonical release');
const cacheName=swSource.match(/const CACHE='([^']+)'/)[1];
assert.equal(cacheName,'vivai-obice-counts-static-'+APP_CONFIG.version);
const redAssets=staticAssets.map(spec=>spec===entryURLPath.slice(1)?entryPath+'?v=__previous_release__':spec);
assert.ok(staticAssets.includes(entryURLPath.slice(1)),'current queried boot is in precache');
const servedWorker=red?swSource.replace(/const STATIC_ASSETS=.*?;\n/,`const STATIC_ASSETS=${JSON.stringify(redAssets)};\n`):swSource;
const moduleHashes=new Map();
const server=createServer(async(request,response)=>{
 try{
  let pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);if(pathname.endsWith('/'))pathname+='index.html';
  const path=resolve(root,'.'+pathname);if(!path.startsWith(root+sep))throw Error('Outside extracted package');
  const bytes=pathname==='/conteggi/sw.js'?Buffer.from(servedWorker):await readFile(path);
  if(pathname.endsWith('.js'))moduleHashes.set(pathname,sha(bytes));
  response.setHeader('Content-Type',({'.js':'application/javascript','.mjs':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.webmanifest':'application/manifest+json'})[extname(path)]??'application/octet-stream');
  response.setHeader('Cache-Control','no-store');response.end(bytes);
 }catch{response.writeHead(404);response.end('Not found');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port;
const owner='00000000-0000-4000-8000-000000000163',foreignOwner='00000000-0000-4000-8000-000000000164';
const environment=APP_CONFIG.environment.toLowerCase();
const draftKey='vivai-obice:configuratore:draft:'+environment+':'+owner;
const foreignDraftKey='vivai-obice:configuratore:draft:'+environment+':'+foreignOwner;
const pendingVertices=[[8,44],[8.001,44]];
const state=createInitialState();state.project.localProjectId='cold-offline-project';state.project.localProjectName='Bozza anonima prima dei conteggi';
const workspace={version:1,ownerId:owner,projectId:state.project.localProjectId,fieldId:state.project.activeFieldId,map:{drawing:true,mode:'perimeter',vertices:pendingVertices,previousPerimeter:null,editRing:null,camera:{center:[8.0005,44.0005],zoom:16,pitch:0,bearing:19,padding:{top:0,bottom:0,left:0,right:0}}},navigation:{mobile:{screen:'editor',transaction:true},fullscreen:true,transactionSnapshot:state}};
const draft=JSON.stringify({version:3,state,workspace,savedAt:'2026-10-08T00:00:00.000Z'});
const foreignDraft=JSON.stringify({version:3,state:{...state,project:{...state.project,localProjectId:'foreign-draft',localProjectName:'Bozza altro proprietario'}},workspace:{...workspace,ownerId:foreignOwner,projectId:'foreign-draft'},savedAt:'2026-10-08T00:00:00.000Z'});
const authKey='sb-'+new URL(APP_CONFIG.supabaseUrl).hostname.split('.')[0]+'-auth-token';
const ownerKey='vivai-obice:counts:last-owner:'+JSON.stringify([new URL(APP_CONFIG.supabaseUrl).origin,APP_CONFIG.environment]);
const sdk=`export function createClient(backendUrl){
 const authKey='sb-'+new URL(backendUrl).hostname.split('.')[0]+'-auth-token';
 const fallback={user:{id:${JSON.stringify(owner)},is_anonymous:true,app_metadata:{}},access_token:'anonymous-fixture',refresh_token:'anonymous-fixture'};
 if(!localStorage.getItem(authKey))localStorage.setItem(authKey,JSON.stringify(fallback));
 const session=()=>JSON.parse(localStorage.getItem(authKey)||'null');
 const chain=table=>{let row=null,single=false;const query=new Proxy({}, {get(_target,key){
  if(key==='then')return (done,fail)=>Promise.resolve({data:single?(table==='profiles'?{user_id:session()?.user?.id,owner_kind:'guest',display_name:'Guest',...row}:{id:'anonymous-local-fixture',...row}):[],error:null}).then(done,fail);
  return (...args)=>{if(['upsert','insert','update'].includes(key))row=args[0];if(['single','maybeSingle'].includes(key))single=true;return query;};
 }});return query;};
 return {auth:{async getSession(){if(window.__coldMap&&!window.__coldMapInitialLoad)await new Promise(done=>window.__coldMap.once('load',done));return {data:{session:session()},error:null};},async signInAnonymously(){return {data:{session:session()},error:null};},onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},from:chain,rpc(){return Promise.resolve({data:{status:'applied',id:'anonymous-local-fixture'},error:null});}};
}`;
const libs=await Promise.all(['maplibre-gl.js','mapbox-gl-draw.js','maplibre-gl.css','mapbox-gl-draw.css'].map(name=>readFile(resolve(assetRoot,name))));
const mapProbe=`;const ColdNativeMap=maplibregl.Map;maplibregl.Map=class extends ColdNativeMap{constructor(...args){super(...args);window.__coldMap=this;this.once('load',()=>{window.__coldMapInitialLoad=true;});}};`;
const transparent=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+X5wqAAAAAElFTkSuQmCC','base64');
const reports=[];let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.COUNTS_CHROMIUM_PATH??'/workspace/sites/dashboard-vivai-obice/.sites-runtime/browser/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const requested=process.env.COUNTS_COLD_BROWSER_VIEW;
 for(const mobile of requested==='desktop'?[false]:requested==='mobile'?[true]:[false,true]){
  const name=mobile?'mobile':'desktop',context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1365,height:960}});
  const errors=[],local404=[],denied=new Set(),requests=[],failures=[];let stage='online-warm',page;
  const report={view:name,release:APP_CONFIG.version,cacheName,staticAssetCount:staticAssets.length,redFault:red,root,stages:[],status:'running'};
  reports.push(report);
  context.on('page',p=>{p.on('pageerror',error=>errors.push({stage,message:error.message}));p.on('response',r=>{if(r.url().startsWith(base+'/')&&r.status()===404)local404.push({stage,url:r.url()});});});
  context.on('request',r=>requests.push({stage,url:r.url(),method:r.method()}));
  context.on('requestfailed',r=>failures.push({stage,url:r.url(),error:r.failure()?.errorText}));
  await context.addInitScript(({draftKey,foreignDraftKey,draft,foreignDraft})=>{
   if(!/^https?:$/.test(location.protocol))return;
   if(!localStorage.getItem(draftKey))localStorage.setItem(draftKey,draft);
   if(!localStorage.getItem(foreignDraftKey))localStorage.setItem(foreignDraftKey,foreignDraft);
   localStorage.setItem('vivai-obice:configuratore:consent','necessary');
  },{draftKey,foreignDraftKey,draft,foreignDraft});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin===base)return route.continue();
   if(url.href==='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')return route.fulfill({contentType:'application/javascript',body:sdk});
   const known=[['https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',libs[0].toString()+mapProbe,'application/javascript'],['https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.js',libs[1],'application/javascript'],['https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',libs[2],'text/css'],['https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.css',libs[3],'text/css']].find(([href])=>href===url.href);
   if(known)return route.fulfill({contentType:known[2],body:known[1]});
   if(/arcgisonline\.com$|^tile\.openstreetmap\.org$/.test(url.hostname))return route.fulfill({contentType:'image/png',body:transparent});
   if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
   denied.add(url.origin+url.pathname);return route.abort();
  });
  const activate=locator=>locator[mobile?'tap':'click']();
  const readDraft=()=>page.evaluate(({draftKey,foreignDraftKey})=>({own:localStorage.getItem(draftKey),foreign:localStorage.getItem(foreignDraftKey)}),{draftKey,foreignDraftKey});
  const readyCounter=timeout=>page.waitForFunction(()=>document.querySelector('#quantity-display')&&document.querySelector('[data-action="increment"]'),null,{timeout});
  const waitQuantity=value=>page.waitForFunction(want=>document.querySelector('#quantity-display')?.textContent===String(want),value);
  try{
   page=await context.newPage();await page.goto(base+'/conteggi/',{waitUntil:'domcontentloaded'});await readyCounter(30000);
   assert.equal((await page.locator('[data-release-version]').textContent()).trim(),APP_CONFIG.version+' · '+APP_CONFIG.environment);
   const before=await readDraft();assert.equal(before.own,draft);assert.equal(before.foreign,foreignDraft);
   await page.locator('[name="title"]').fill('Conteggio offline '+name);
   for(let index=1;index<=7;index++){await activate(page.locator('[data-action="increment"]'));await waitQuantity(index);}
   await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(done=>navigator.serviceWorker.addEventListener('controllerchange',done,{once:true}));});
   const online=await page.evaluate(async({cacheName,entryURLPath,ownerKey,authKey})=>{
    const cache=await caches.open(cacheName),current=await cache.match(location.origin+entryURLPath),old=await cache.match(location.origin+'/conteggi/boot.js?v=__previous_release__');
    return {scope:(await navigator.serviceWorker.ready).scope,controller:navigator.serviceWorker.controller.scriptURL,keys:(await cache.keys()).map(r=>new URL(r.url).pathname+new URL(r.url).search),hasCurrentEntry:!!current,hasOldEntry:!!old,owner:JSON.parse(localStorage.getItem(ownerKey)),token:JSON.parse(localStorage.getItem(authKey))};
   },{cacheName,entryURLPath,ownerKey,authKey});
   assert.equal(online.scope,base+'/conteggi/');assert.equal(online.owner.ownerId,owner);assert.equal(online.token.user.id,owner);
   assert.equal(online.hasCurrentEntry,!red);assert.equal(online.hasOldEntry,red);
   await page.screenshot({path:resolve(output,name+'-online-warm.png'),fullPage:true});report.online=online;report.stages.push('authentic-online-count-7');
   await page.close();assert.equal(context.pages().length,0,'cold reopening starts with no warm page');
   stage='offline-cold';await context.setOffline(true);page=await context.newPage();await page.goto(base+'/conteggi/',{waitUntil:'domcontentloaded'});
   if(red){
    let coldFailed=false;try{await readyCounter(5000);}catch{coldFailed=true;}
    assert.equal(coldFailed,true,'old-query precache must fail to supply the current boot script offline');
    report.status='expected-fault-detected';report.stages.push('old-query-cold-start-rejected');
    await page.screenshot({path:resolve(output,name+'-red-cold-cache-miss.png'),fullPage:true});
    throw Error('RED: authentic cold launch failed because only the previous boot query was cached');
   }
   await readyCounter(30000);await waitQuantity(7);
   assert.equal(await page.locator('[name="title"]').inputValue(),'Conteggio offline '+name);
   assert.equal(await page.evaluate(()=>navigator.onLine),false);assert.ok(await page.evaluate(()=>navigator.serviceWorker.controller));
   assert.deepEqual(await readDraft(),before,'cold Counts reopening preserves both configurator owners’ drafts');
   await activate(page.locator('[data-action="increment"]'));await waitQuantity(8);
   await page.screenshot({path:resolve(output,name+'-offline-cold-restored.png'),fullPage:true});report.stages.push('authentic-offline-cold-count-7-then-8');

   stage='offline-foreign-owner';const token=await page.evaluate(key=>localStorage.getItem(key),authKey);
   await page.evaluate(({authKey,foreignOwner})=>localStorage.setItem(authKey,JSON.stringify({user:{id:foreignOwner,is_anonymous:true},access_token:'foreign-anonymous-fixture'})),{authKey,foreignOwner});
   await page.close();page=await context.newPage();await page.goto(base+'/conteggi/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('#counts-status')?.textContent.includes('riconoscere il tuo profilo'));
   assert.equal(await page.locator('[data-action="increment"]').count(),0,'mismatched offline identity cannot reveal the previous owner’s count');
   assert.equal((await readDraft()).foreign,foreignDraft);
   await page.evaluate(({authKey,token})=>localStorage.setItem(authKey,token),{authKey,token});await page.close();
   stage='offline-owner-restored';page=await context.newPage();await page.goto(base+'/conteggi/',{waitUntil:'domcontentloaded'});await readyCounter(30000);await waitQuantity(8);
   report.stages.push('offline-foreign-owner-rejected-and-original-owner-restored');

   stage='online-return-configurator';
   await Promise.all([page.waitForEvent('framenavigated',{predicate:frame=>frame===page.mainFrame()}),context.setOffline(false)]);
   await readyCounter(30000);await waitQuantity(8);
   await activate(page.locator('#tools-trigger'));await activate(page.locator('#tools-menu [data-tool="configurator"]'));
   await page.waitForURL(base+'/');
   await page.waitForFunction(()=>window.__coldMapInitialLoad&&window.__coldMap.getSource('manual-draw')&&document.querySelector('#profile-trigger')?.textContent!=='Profilo');
   assert.equal(await page.evaluate(()=>navigator.serviceWorker.controller),null,'Counts SW does not control root Configuratore');
   assert.equal(await page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration(location.origin+'/'))),false);
   const restored=await readDraft(),restoredRecord=JSON.parse(restored.own);
   assert.equal(restoredRecord.workspace.ownerId,owner);assert.equal(restoredRecord.state.project.localProjectId,'cold-offline-project');
   assert.deepEqual(restoredRecord.workspace.map.vertices,pendingVertices);assert.equal(restoredRecord.workspace.map.drawing,true);assert.equal(restored.foreign,foreignDraft);
   await page.screenshot({path:resolve(output,name+'-configurator-draft-restored.png'),fullPage:true});report.stages.push('tool-menu-return-root-uncontrolled-pending-draft-preserved');
   if(!mobile&&await page.locator('.map-wrap.fullscreen-map').count())await activate(page.locator('#map-fullscreen-button'));
   const trigger=mobile?page.locator('.mobile-editor-tool-trigger'):page.locator('.brand[aria-controls="tool-selector"]');
   await activate(trigger);await activate(page.locator('#tool-selector [data-tool="counts"]'));await page.waitForURL(/\/conteggi\//);await readyCounter(30000);await waitQuantity(8);
   assert.equal((await readDraft()).foreign,foreignDraft);report.stages.push('configurator-tool-menu-round-trip-count-8-preserved');
   await activate(page.locator('[data-action="confirm-count"]'));await page.locator('.count-row').first().waitFor({state:'attached'});
   await activate(page.locator('.archive-category[data-category="plants"] > summary').first());
   assert.equal((await page.locator('.count-row strong').first().textContent()).trim(),'8');
   await page.close();stage='offline-cold-saved-list';await context.setOffline(true);page=await context.newPage();await page.goto(base+'/conteggi/?view=lists',{waitUntil:'domcontentloaded'});
   await page.locator('.count-row strong').first().waitFor({state:'attached'});await activate(page.locator('.archive-category[data-category="plants"] > summary').first());
   assert.equal((await page.locator('.count-row strong').first().textContent()).trim(),'8');
   await page.screenshot({path:resolve(output,name+'-offline-cold-saved-list.png'),fullPage:true});report.stages.push('saved-count-8-survives-second-cold-offline-launch');
   assert.deepEqual(local404,[]);assert.deepEqual(errors,[]);assert.equal(requests.some(r=>r.method!=='GET'&&new URL(r.url).origin!==base),false,'no remote mutation request');
   for(const path of ['/conteggi/boot.js','/conteggi/runtime.js','/conteggi/sw.js'])assert.equal(moduleHashes.get(path),sha(await readFile(resolve(root,'.'+path))),path+' served authentic delivered bytes');
   report.status='passed';console.log(name+': authentic cold Counts, real scoped SW, owner/count restoration and tool/draft isolation passed');
  }catch(error){report.failedStage=stage;report.error=error.stack??error.message;if(report.status==='running')report.status='failed';if(page&&!page.isClosed())await page.screenshot({path:resolve(output,name+'-failure.png'),fullPage:true}).catch(()=>{});throw error;}
  finally{
   report.errors=errors;report.local404=local404;report.denied=[...denied];report.requests=requests;report.requestFailures=failures;
   await writeFile(resolve(output,name+'-result.json'),JSON.stringify(report,null,2));await context.close();
  }
 }
}finally{
 await writeFile(resolve(output,'summary.json'),JSON.stringify({release:APP_CONFIG.version,redFault:red,reports,servedModuleSHA256:Object.fromEntries(moduleHashes)},null,2));
 await browser?.close();await new Promise(done=>server.close(done));
}
