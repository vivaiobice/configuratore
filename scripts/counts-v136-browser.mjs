// User-facing Counts acceptance in Chromium. App modules and boot are authentic;
// only Supabase is a local fixture. Every other external request is blocked.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(process.env.COUNTS_V136_BROWSER_ROOT??fileURLToPath(new URL('../',import.meta.url)));
const {APP_CONFIG}=await import(pathToFileURL(resolve(root,'src/config.js')));
assert.equal(APP_CONFIG.version,'1.3.6','v1.3.6 acceptance requires the normalized release');
const output=resolve(process.env.COUNTS_V136_BROWSER_OUTPUT??'/tmp/counts-v136-browser');
await mkdir(output,{recursive:true});
const remote=new Map(),apiCalls=[],moduleHashes=new Map(),pullFailures=new Set();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const scopeState=key=>{if(!remote.has(key))remote.set(key,{lists:{},counts:{},operations:{}});return remote.get(key);};
const server=createServer(async(request,response)=>{
 try{
  const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
  if(pathname==='/__counts-fixture'){
   let bytes='';for await(const chunk of request)bytes+=chunk;
   const {owner,name,body}=JSON.parse(bytes),{action,input}=body??{};
   apiCalls.push({owner,name,action,input:structuredClone(input)});
   response.setHeader('Content-Type','application/json');
   if(name!=='counts-api'){response.writeHead(403);response.end(JSON.stringify({error:'Transmission is disabled in acceptance fixtures',code:'SERVICE_DISABLED'}));return;}
   const state=scopeState(owner+'|'+body.environment);let result;
   if(action==='pull'&&pullFailures.delete(owner)){response.writeHead(503);response.end(JSON.stringify({error:'Sincronizzazione non disponibile: riprova',code:'SYNC_UNAVAILABLE'}));return;}
   if(action==='notice')result={accepted:true};
   else if(action==='pull')result={lists:Object.values(state.lists),counts:Object.values(state.counts),submissions:[],nextCursor:null};
   else if(action==='mutate'){
    if(state.operations[input.operationId])result=state.operations[input.operationId];
    else{
     const map=input.kind==='list'?state.lists:state.counts,existing=map[input.entityId];
     assert.equal(input.expectedRevision,existing?.revision??0,'fixture rejects silent revision overwrites');
     const value={...input.value,revision:input.expectedRevision+1,syncState:'synced'};
     map[input.entityId]=value;result={value};state.operations[input.operationId]=result;
    }
   }else throw new Error('Unexpected fixture action '+action);
   response.end(JSON.stringify(result));return;
  }
  const relative=pathname.endsWith('/')?pathname+'index.html':pathname,path=resolve(root,'.'+relative);
  if(!path.startsWith(root+sep))throw new Error('Outside Counts package');
  const bytes=await readFile(path);if(relative.endsWith('.js'))moduleHashes.set(relative,sha(bytes));
  response.setHeader('Content-Type',({'.js':'application/javascript','.mjs':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.webmanifest':'application/manifest+json'})[extname(path)]??'application/octet-stream');
  response.setHeader('Cache-Control','no-store');response.end(bytes);
 }catch(error){response.writeHead(500,{'Content-Type':'text/plain'});response.end(error.message);}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port;

function sdkFixture(owner,username,anonymous=false){return `
export function createClient(backendUrl){
 const key='sb-'+new URL(backendUrl).hostname.split('.')[0]+'-auth-token';
 const fallback={user:{id:${JSON.stringify(owner)},is_anonymous:${anonymous},email:'qa@example.test',app_metadata:{}},access_token:'acceptance-fixture',refresh_token:'acceptance-fixture'};
 if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(fallback));
 const session=()=>JSON.parse(localStorage.getItem(key)||'null');
 const profile={user_id:${JSON.stringify(owner)},owner_kind:${JSON.stringify(anonymous?'guest':'user')},display_name:'Browser QA',username:${JSON.stringify(username)},first_name:'Browser',last_name:'QA',phone:'000000000'};
 const from=table=>{let row=null,single=false;const query=new Proxy({}, {get(_target,key){
  if(key==='then')return (done,fail)=>Promise.resolve({data:single?(table==='profiles'?{...profile,...row}:null):[],error:null}).then(done,fail);
  return (...args)=>{if(['upsert','insert','update'].includes(key))row=args[0];if(['single','maybeSingle'].includes(key))single=true;return query;};
 }});return query;};
 const client={auth:{async getSession(){return {data:{session:session()},error:null};},async signInAnonymously(){return {data:{session:session()},error:null};},onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},from,
 functions:{async invoke(name,{body}){const response=await fetch('/__counts-fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,owner:session()?.user?.id,body})});const data=await response.json();return response.ok?{data,error:null}:{data:null,error:{message:data.error,context:{json:async()=>data}}};}},rpc(){return Promise.resolve({data:null,error:null});}};
 globalThis.__qaClient=client;return client;
}`;}

const viewports=[['desktop',{width:1365,height:960}],['mobile',{width:390,height:844}],['mobile-small',{width:320,height:568}],['mobile-small-tall',{width:320,height:667}]];
const selected=process.env.COUNTS_V136_BROWSER_VIEW;
const reports=[];let browser,failed=false;
const profileUsername=name=>('qa_'+name.replaceAll('-','_')+'_profilo_lungo').slice(0,32);
async function makeContext(name,viewport,owner,anonymous=false){
 const context=await browser.newContext({viewport,isMobile:viewport.width<600,hasTouch:viewport.width<600,deviceScaleFactor:1,serviceWorkers:'block'});
 const sdk=sdkFixture(owner,profileUsername(name),anonymous);
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());if(url.origin===base)return route.continue();
  if(url.href==='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')return route.fulfill({contentType:'application/javascript',body:sdk});
  return route.abort();
 });
 return context;
}
async function prepare(page,owner){
 await page.waitForFunction(()=>document.querySelector('#quantity-display')||document.querySelector('.archive-intro'),null,{timeout:30000});
 await page.evaluate(async owner=>{
  const [{createCountsGateway},{APP_CONFIG}]=await Promise.all([import('/src/counts-client.js'),import('/src/config.js')]);
  globalThis.__qaProbe=createCountsGateway({scope:{backend:APP_CONFIG.supabaseUrl,environment:APP_CONFIG.environment,owner},channel:false});
  await document.fonts.ready;
 },owner);
}
const reading=page=>page.evaluate(()=>__qaProbe.getReading());
async function waitReading(page,expected){
 await page.waitForFunction(async expected=>{const count=await __qaProbe.getReading();return count&&Object.entries(expected).every(([key,value])=>count[key]===value);},expected,{timeout:10000});
}
async function waitCount(page,listId,countId,expected){
 await page.waitForFunction(async({listId,countId,expected})=>{const count=await __qaProbe.getCount(listId,countId);return count&&Object.entries(expected).every(([key,value])=>count[key]===value);},{listId,countId,expected},{timeout:10000});
}
async function layout(page){return page.evaluate(()=>{
 const rect=selector=>{const node=document.querySelector(selector);if(!node)return null;const {x,y,width,height,bottom,right}=node.getBoundingClientRect();return {x,y,width,height,bottom,right};};
 const summary=document.querySelector('.counter-detail-summary'),summaryStyle=summary&&getComputedStyle(summary),main=document.querySelector('#counts-main'),counter=document.querySelector('.impulse-counter'),counterStyle=getComputedStyle(counter),title=document.querySelector('.reading-title input');
 return {viewport:{width:innerWidth,height:innerHeight},scroll:{window:scrollY,root:document.documentElement.scrollTop,main:main.scrollTop},main:{clientHeight:main.clientHeight,scrollHeight:main.scrollHeight},documentWidth:document.documentElement.scrollWidth,
  counter:rect('.impulse-counter'),counterContentWidth:counter.clientWidth-parseFloat(counterStyle.paddingLeft)-parseFloat(counterStyle.paddingRight),categoryButtons:[...document.querySelectorAll('.type-switch [data-action=category]')].map(node=>({label:node.textContent.trim(),height:node.getBoundingClientRect().height,width:node.getBoundingClientRect().width,fontSize:parseFloat(getComputedStyle(node).fontSize)})),titleInput:rect('.reading-title input'),titleFontSize:parseFloat(getComputedStyle(title).fontSize),category:rect('.type-switch'),title:rect('.reading-title'),details:rect('[data-action="counter-details"]'),summary:rect('.counter-detail-summary'),summaryLineHeight:summaryStyle?Number.parseFloat(summaryStyle.lineHeight):null,
  increment:rect('[data-action="increment"]'),decrement:rect('[data-action="decrement"]'),save:rect('[data-action="confirm-count"]'),quantity:rect('#quantity-display'),header:rect('.counts-header')};
});}
function assertCounterLayout(metrics,label){
 assert.equal(metrics.scroll.window,0,label+': counter stays at the top without scrolling');
 assert.equal(metrics.scroll.main,0,label+': main has no scrolling');
 assert.ok(metrics.main.scrollHeight<=metrics.main.clientHeight+1,label+': main content fits its own box');
 assert.ok(metrics.documentWidth<=metrics.viewport.width,label+': no horizontal overflow');
 assert.ok(metrics.category.bottom<=metrics.title.y+1,label+': category precedes reading name');
 assert.deepEqual(metrics.categoryButtons.map(button=>button.label),['Viti','Pali','Altro'],label+': category labels are legible');
 for(const button of metrics.categoryButtons){assert.ok(button.height>=44&&button.width>=44,label+': '+button.label+' has a 44px touch target');assert.ok(button.fontSize>=14,label+': '+button.label+' has readable 14px lettering');}
 assert.ok(Math.abs(metrics.title.width-Math.min(410,metrics.counterContentWidth))<2,label+': title retains the full available name field width');
 assert.ok(metrics.titleInput.width>=metrics.title.width-40,label+': editable name uses the available field width');
 const maximumTitleFont=metrics.viewport.width>=600?21:metrics.viewport.height<=700?18:19;
 assert.ok(metrics.titleFontSize>=17&&metrics.titleFontSize<=maximumTitleFont,label+': name lettering is smaller while remaining readable');
 const lastDetailBottom=metrics.summary?.height?metrics.summary.bottom:metrics.details.bottom;
 assert.ok(lastDetailBottom<=metrics.quantity.y+1,label+': quantity does not overlap or block the details control/summary');
 for(const key of ['increment','decrement','save','quantity']){
  const box=metrics[key];assert.ok(box&&box.y>=0&&box.bottom<=metrics.viewport.height&&box.x>=0&&box.right<=metrics.viewport.width,label+': '+key+' is fully visible without scrolling');
 }
 assert.ok(metrics.save.height>=36,label+': saving is a distinct touch target');
 if(metrics.summary)assert.ok(metrics.summary.height<=metrics.summaryLineHeight*2+2,label+': detail summary uses at most two lines');
}
async function assertHeader(page){
 assert.equal(await page.locator('[data-action="sync"]').count(),1,'synchronization has one clear header control');
 assert.equal(await page.locator('#counts-sync').getAttribute('aria-label'),'Sincronizza');
 assert.equal(await page.locator('#counts-sync svg').count(),1,'header sync is an icon button');
 assert.equal(await page.locator('#counts-sync').isVisible(),true,'sync stays visible on both Counts screens');
 const metrics=await page.evaluate(()=>{
  const storage=document.querySelector('.header-status [data-action="storage-info"]'),sync=document.querySelector('#counts-sync');
  const box=node=>{const{x,y,width,height,right,bottom}=node.getBoundingClientRect();return{x,y,width,height,right,bottom};};
  const point=sync.getBoundingClientRect(),target=document.elementFromPoint(point.x+point.width/2,point.y+point.height/2);
  return{viewport:{width:innerWidth,height:innerHeight},storage:box(storage),sync:box(sync),adjacent:storage.nextElementSibling===sync,hitTarget:target?.closest('#counts-sync')===sync};
 });
 assert.equal(metrics.adjacent,true,'sync is immediately beside the storage icon');
 assert.ok(Math.abs(metrics.storage.y-metrics.sync.y)<2,'storage and sync share the same header row');
 assert.ok(metrics.storage.right<=metrics.sync.x+1,'header controls do not overlap');
 assert.equal(metrics.hitTarget,true,'header sync can be directly tapped');
 for(const key of ['storage','sync']){const box=metrics[key];assert.ok(box.x>=0&&box.right<=metrics.viewport.width&&box.y>=0&&box.bottom<=metrics.viewport.height,key+' header button is fully visible');}
 assert.equal(await page.locator('.counts-footer [data-action="sync"]').count(),0,'footer has no duplicate sync button');
 assert.equal(await page.locator('[data-action="notice"]').count(),0,'no redundant notice popup button is rendered');
 return metrics;
}
async function assertRegisteredNotice(page){
 assert.equal(await page.locator('#sync-banner button').count(),0,'registered footer shows storage information without extra buttons');
 assert.equal(await page.locator('[data-action="accept-notice"]').count(),0,'registered profile does not require redundant consent');
 assert.match(await page.locator('#sync-banner').textContent(),/amministratori autorizzati/,'the storage and administrator notice remains visible');
}
async function waitSyncedArchive(page){await page.waitForFunction(()=>!document.querySelector('#counts-status')?.textContent.includes('in attesa'),null,{timeout:10000});}
function waitDeletedMutation(page,owner,kind,entityId){return page.waitForResponse(response=>{
 if(response.url()!==base+'/__counts-fixture'||!response.ok())return false;
 const request=response.request().postDataJSON();return request?.owner===owner&&request.body?.action==='mutate'&&request.body.input?.kind===kind&&request.body.input.entityId===entityId&&request.body.input.value.deleted===true;
},{timeout:10000});}

try{
 browser=await chromium.launch({headless:true,executablePath:process.env.COUNTS_CHROMIUM_PATH??'/workspace/sites/dashboard-vivai-obice/.sites-runtime/browser/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const [index,[name,viewport]]of viewports.entries()){
  if(selected&&selected!==name)continue;
  const owner='00000000-0000-4000-8000-'+String(1360+index).padStart(12,'0');
  const context=await makeContext(name,viewport,owner),page=await context.newPage(),errors=[],responses=[],expectedResponses=[],requests=[];
  const report={view:name,viewport,release:APP_CONFIG.version,status:'running',stages:[],layouts:{}};reports.push(report);let stage='initial-counter';
  const trackPage=page=>{page.on('pageerror',error=>errors.push({stage,message:error.message}));page.on('response',response=>{if(response.url().startsWith(base)&&response.status()>=400){const item={stage,url:response.url(),status:response.status()};responses.push(item);if(stage==='sync-pull-failure'&&response.url()===base+'/__counts-fixture'&&response.status()===503)expectedResponses.push(item);}});page.on('request',request=>requests.push({url:request.url(),method:request.method()}));};trackPage(page);
  const tap=locator=>locator[viewport.width<600?'tap':'click']();
  const action=async name=>{const target=page.locator('[data-action="'+name+'"]').first();if(!await target.isVisible()){const group=target.locator('xpath=ancestor::details[1]');if(await group.count())await tap(group.locator('summary').first());}await tap(target);};
  const closeDetails=async()=>{await action('close-modal');await page.locator('#counter-details-form').waitFor({state:'detached'});};
  const capture=async label=>{const metrics=await layout(page);report.layouts[label]=metrics;assertCounterLayout(metrics,name+' '+label);assert.equal(await page.locator('#counts-status').textContent(),'Salvato sul dispositivo','unfinished reading is clearly marked as device-local');report.headers??={};report.headers[label]=await assertHeader(page);await assertRegisteredNotice(page);await page.screenshot({path:resolve(output,name+'-'+label+'.png')});};
  try{
   await page.goto(base+'/conteggi/',{waitUntil:'domcontentloaded'});await prepare(page,owner);
   assert.equal(await page.locator('#quantity-display').textContent(),'0');assert.equal(await page.locator('.reading-title [name="title"]').inputValue(),'Conteggio barbatelle');
   assert.equal(await page.locator('#profile-trigger').textContent(),profileUsername(name));
   assert.equal(await page.locator('[data-action="category"][data-category="posts"] span').textContent(),'Pali');assert.equal(await page.locator('[data-action="category"][data-category="other"] span').textContent(),'Altro');
   assert.equal(await page.locator('#quantity-display').evaluate(node=>getComputedStyle(node).fontFamily.startsWith('Comfortaa')),true);
   report.counterFooter=await page.locator('.counts-footer-brand img').evaluate(node=>({filter:getComputedStyle(node).filter,background:getComputedStyle(node).backgroundColor}));assert.match(report.counterFooter.filter,/drop-shadow/);assert.equal(report.counterFooter.background,'rgba(0, 0, 0, 0)');
   await capture('initial-counter');report.stages.push('registered-profile-category-touch-targets-title-width-and-header-layout');
   stage='registered-storage-information';await action('storage-info');await page.locator('.counts-modal').waitFor({state:'visible'});
   assert.equal(await page.locator('#dialog-title').textContent(),'Salvataggio letture');await assertRegisteredNotice(page);
   assert.equal(await page.locator('.counts-modal [data-action="notice"],.counts-modal [data-action="accept-notice"]').count(),0,'storage information does not add a redundant notice action');
   await action('close-modal');await page.locator('.counts-modal').waitFor({state:'detached'});report.stages.push('registered-storage-information-has-no-redundant-notice-button');
   for(let quantity=1;quantity<=9;quantity++){await action('increment');await waitReading(page,{quantity});}
   await action('decrement');await waitReading(page,{quantity:8});await action('increment');await waitReading(page,{quantity:9});

   stage='automatic-post-details';await tap(page.locator('[data-action="category"][data-category="posts"]'));await waitReading(page,{category:'posts',title:'Conteggio pali',quantity:9});
   await action('counter-details');await page.locator('#counter-details-form').waitFor({state:'visible'});
   await page.locator('#counter-details-form [name="postType"]').fill('testa');await waitReading(page,{postType:'testa',quantity:9});
   await page.locator('#counter-details-form [name="postMaterial"]').fill('ferro');await waitReading(page,{postMaterial:'ferro',title:'Conteggio · Testa · Ferro',quantity:9});
   await page.screenshot({path:resolve(output,name+'-post-details-popup.png')});await closeDetails();
   assert.equal(await page.locator('.reading-title [name="title"]').inputValue(),'Conteggio · Testa · Ferro');await capture('automatic-post-counter');
   await page.reload();await prepare(page,owner);await waitReading(page,{quantity:9,title:'Conteggio · Testa · Ferro'});report.stages.push('automatic-post-title-details-and-quantity-survive-reload');

   stage='automatic-other-details';await tap(page.locator('[data-action="category"][data-category="other"]'));await waitReading(page,{category:'other',title:'Conteggio di…',quantity:9});
   await action('counter-details');await page.locator('#counter-details-form [name="componentType"]').fill('molle');await waitReading(page,{componentType:'molle',title:'Conteggio · Molle',quantity:9});await closeDetails();await capture('automatic-other-counter');
   report.stages.push('other-default-and-component-title');

   stage='automatic-plant-details';await tap(page.locator('[data-action="category"][data-category="plants"]'));await waitReading(page,{category:'plants',title:'Conteggio barbatelle',quantity:9});
   await action('counter-details');await page.locator('#counter-details-form [name="varietyLabel"]').fill('Barbera N.');await waitReading(page,{varietyLabel:'Barbera N.',quantity:9});
   await page.locator('#counter-details-form [name="rootstockLabel"]').fill('110 Richter');await waitReading(page,{rootstockLabel:'110 Richter',title:'Conteggio · Barbera N. · 110 Richter',quantity:9});await closeDetails();await capture('automatic-plant-counter');
   assert.match(await page.locator('.counter-detail-summary').textContent(),/Barbera/);assert.match(await page.locator('.counter-detail-summary').textContent(),/110 Richter/);
   report.stages.push('plant-details-and-automatic-title');

   stage='long-detail-summary';const longVariety='Barbera di un filare con etichetta molto lunga '.repeat(4),longRootstock='Portainnesto con una descrizione molto lunga '.repeat(4);
   await action('counter-details');await page.locator('#counter-details-form [name="varietyLabel"]').fill(longVariety);await waitReading(page,{varietyLabel:longVariety.trim()});await page.locator('#counter-details-form [name="rootstockLabel"]').fill(longRootstock);await waitReading(page,{rootstockLabel:longRootstock.trim(),quantity:9});await closeDetails();await capture('long-detail-counter');
   report.stages.push('long-details-clamped-to-two-lines-with-controls-visible');

   stage='manual-title';const manual='Rimesse filare 7';await page.locator('.reading-title [name="title"]').fill(manual);await waitReading(page,{title:manual});
   await tap(page.locator('[data-action="category"][data-category="posts"]'));await waitReading(page,{category:'posts',title:manual,quantity:9});
   await action('counter-details');await page.locator('#counter-details-form [name="postType"]').fill('filare');await waitReading(page,{postType:'filare',title:manual});await page.locator('#counter-details-form [name="postMaterial"]').fill('castagno');await waitReading(page,{postMaterial:'castagno',title:manual,quantity:9});await closeDetails();
   await page.reload();await prepare(page,owner);await waitReading(page,{category:'posts',title:manual,postType:'filare',postMaterial:'castagno',quantity:9});assert.equal(await page.locator('.reading-title [name="title"]').inputValue(),manual);await capture('manual-post-counter');
   report.stages.push('explicit-name-survives-category-details-and-reload');

   stage='save-to-profile';await action('confirm-count');await page.locator('.count-row').first().waitFor({state:'attached'});
   await page.waitForFunction(()=>document.querySelector('.count-row .sync-state')?.classList.contains('synced'),null,{timeout:15000});
   await page.waitForFunction(()=>!document.querySelector('#counts-status')?.textContent.includes('in attesa'),null,{timeout:10000});
   report.headers.archive=await assertHeader(page);await assertRegisteredNotice(page);
   const saved=Object.values(scopeState(owner+'|'+APP_CONFIG.environment).counts);assert.equal(saved.length,1);assert.equal(saved[0].quantity,9);assert.equal(saved[0].title,manual);assert.equal(saved[0].postMaterial,'castagno');
   assert.equal(apiCalls.filter(call=>call.owner===owner&&call.action==='notice').length,0,'registered account saves without manual notice acknowledgement');
   const row=page.locator('.count-row').first(),group=row.locator('xpath=ancestor::details[1]');if(!await row.isVisible())await tap(group.locator('summary').first());
   assert.equal(await row.locator('strong').textContent(),'9');assert.equal(await row.locator('h4').textContent(),manual);assert.match(await row.locator('.reading-material').textContent(),/Castagno/);
   await page.screenshot({path:resolve(output,name+'-saved-profile-list.png'),fullPage:true});report.savedCount={...saved[0]};report.stages.push('save-is-local-and-automatically-synced-to-registered-profile');
   const storage=await page.locator('#sync-banner').textContent();assert.match(storage,/amministratori/i);report.storageNotice=storage;
   report.archiveFooter=await page.locator('.counts-footer-brand img').evaluate(node=>({filter:getComputedStyle(node).filter,background:getComputedStyle(node).backgroundColor}));assert.equal(report.archiveFooter.background,'rgba(0, 0, 0, 0)');

   stage='explicit-name-equal-default';await action('add-count');await page.locator('#quantity-display').waitFor({state:'visible'});
   await tap(page.locator('[data-action="category"][data-category="posts"]'));await waitReading(page,{category:'posts',title:'Conteggio pali'});
   await page.locator('.reading-title [name="title"]').fill('Nome provvisorio');await waitReading(page,{title:'Nome provvisorio'});
   await page.locator('.reading-title [name="title"]').fill('Conteggio pali');await waitReading(page,{title:'Conteggio pali'});
   for(let quantity=1;quantity<=2;quantity++){await action('increment');await waitReading(page,{quantity});}
   const manualDefault=await reading(page);await action('confirm-count');await page.locator('.count-row').nth(1).waitFor({state:'attached'});await waitCount(page,manualDefault.listId,manualDefault.countId,{syncState:'synced'});
   stage='genuine-auto-name-saved';await action('add-count');await waitReading(page,{category:'plants',title:'Conteggio barbatelle'});
   for(let quantity=1;quantity<=3;quantity++){await action('increment');await waitReading(page,{quantity});}
   const genuineAuto=await reading(page);await action('confirm-count');await page.locator('.count-row').nth(2).waitFor({state:'attached'});await waitCount(page,genuineAuto.listId,genuineAuto.countId,{syncState:'synced'});
   report.stages.push('explicit-default-looking-name-and-genuine-auto-name-saved-separately');

   stage='fresh-browser-profile-restore';const restoredContext=await makeContext(name,viewport,owner),restoredPage=await restoredContext.newPage();
   try{
    trackPage(restoredPage);await restoredPage.goto(base+'/conteggi/?integrationVersion=1&view=lists',{waitUntil:'domcontentloaded'});
    await restoredPage.locator('.count-row').nth(2).waitFor({state:'attached',timeout:15000});await prepare(restoredPage,owner);
    const restoredRow=restoredPage.locator('.count-row').filter({has:restoredPage.locator('[data-action="open-count"][data-count-id="'+saved[0].countId+'"]')});assert.equal(await restoredRow.locator('h4').textContent(),manual);assert.equal(await restoredRow.locator('strong').textContent(),'9');assert.match(await restoredRow.locator('.reading-material').textContent(),/Castagno/);
    const restoredGroup=restoredRow.locator('xpath=ancestor::details[1]');if(!await restoredRow.isVisible())await restoredGroup.locator('summary').first()[viewport.width<600?'tap':'click']();
    await restoredPage.screenshot({path:resolve(output,name+'-fresh-profile-restored.png'),fullPage:true});
    const openSaved=async count=>{
     const button=restoredPage.locator('[data-action="open-count"][data-count-id="'+count.countId+'"]');
     const category=button.locator('xpath=ancestor::details[1]'),visible=await button.isVisible(),categoryOpen=await category.evaluate(node=>node.open);
     if(!visible)await category.locator('summary').first()[viewport.width<600?'tap':'click']();
     (report.savedRowOpenings??=[]).push({stage,countId:count.countId,visibleBefore:visible,categoryOpenBefore:categoryOpen,categoryOpenAtTap:await category.evaluate(node=>node.open)});
     await button[viewport.width<600?'tap':'click']();await restoredPage.locator('#reading-details').waitFor({state:'visible'});
    };
    stage='fresh-profile-manual-default-edit';await openSaved(manualDefault);await restoredPage.locator('#reading-details [name="postMaterial"]').fill('ferro');await waitCount(restoredPage,manualDefault.listId,manualDefault.countId,{postMaterial:'ferro',title:'Conteggio pali',quantity:2});
    assert.equal(await restoredPage.locator('#reading-details [name="title"]').inputValue(),'Conteggio pali');await restoredPage.locator('[data-action="save-details"]')[viewport.width<600?'tap':'click']();await restoredPage.locator('#reading-details').waitFor({state:'detached'});
    await waitCount(restoredPage,manualDefault.listId,manualDefault.countId,{postMaterial:'ferro',title:'Conteggio pali',quantity:2,syncState:'synced'});
    report.stages.push('fresh-profile-preserves-explicit-name-equal-to-generated-default');
    stage='manual-name-equal-full-generated-title';await openSaved(manualDefault);await restoredPage.locator('#reading-details [name="title"]').fill('Conteggio · Ferro');await waitCount(restoredPage,manualDefault.listId,manualDefault.countId,{title:'Conteggio · Ferro',quantity:2});
    await restoredPage.locator('[data-action="save-details"]')[viewport.width<600?'tap':'click']();await restoredPage.locator('#reading-details').waitFor({state:'detached'});await waitCount(restoredPage,manualDefault.listId,manualDefault.countId,{title:'Conteggio · Ferro',syncState:'synced'});
    await restoredPage.reload();await prepare(restoredPage,owner);await openSaved(manualDefault);await restoredPage.locator('#reading-details [name="postMaterial"]').fill('castagno');await waitCount(restoredPage,manualDefault.listId,manualDefault.countId,{postMaterial:'castagno',title:'Conteggio · Ferro',quantity:2});
    assert.equal(await restoredPage.locator('#reading-details [name="title"]').inputValue(),'Conteggio · Ferro');await restoredPage.locator('[data-action="save-details"]')[viewport.width<600?'tap':'click']();await restoredPage.locator('#reading-details').waitFor({state:'detached'});await waitCount(restoredPage,manualDefault.listId,manualDefault.countId,{title:'Conteggio · Ferro',postMaterial:'castagno',quantity:2,syncState:'synced'});
    report.stages.push('reopened-explicit-name-equal-to-full-generated-title-stays-manual');
    stage='fresh-profile-auto-default-edit';await openSaved(genuineAuto);await restoredPage.locator('#reading-details [name="varietyLabel"]').fill('Barbera N.');await waitCount(restoredPage,genuineAuto.listId,genuineAuto.countId,{varietyLabel:'Barbera N.',title:'Conteggio · Barbera N.',quantity:3});
    await restoredPage.locator('#reading-details [name="rootstockLabel"]').fill('110 Richter');await waitCount(restoredPage,genuineAuto.listId,genuineAuto.countId,{rootstockLabel:'110 Richter',title:'Conteggio · Barbera N. · 110 Richter',quantity:3});
    assert.equal(await restoredPage.locator('#reading-details [name="title"]').inputValue(),'Conteggio · Barbera N. · 110 Richter');await restoredPage.locator('[data-action="save-details"]')[viewport.width<600?'tap':'click']();await restoredPage.locator('#reading-details').waitFor({state:'detached'});
    await waitCount(restoredPage,genuineAuto.listId,genuineAuto.countId,{title:'Conteggio · Barbera N. · 110 Richter',quantity:3,syncState:'synced'});report.stages.push('fresh-profile-genuine-auto-name-follows-new-details');
    await restoredPage.waitForFunction(()=>!document.querySelector('#counts-status')?.textContent.includes('in attesa'),null,{timeout:10000});
    await restoredPage.screenshot({path:resolve(output,name+'-fresh-profile-name-edits.png'),fullPage:true});

    stage='sync-pull-failure';await restoredPage.evaluate(()=>scrollTo(0,0));pullFailures.add(owner);
    await restoredPage.locator('#counts-sync')[viewport.width<600?'tap':'click']();
    await restoredPage.waitForFunction(()=>document.querySelector('#counts-status')?.textContent==='Sincronizzazione non disponibile: riprova'&&document.querySelector('#counts-status')?.getAttribute('role')==='alert',null,{timeout:10000});
    await openSaved(genuineAuto);await restoredPage.locator('#reading-details [name="notes"]').fill('Verifica salvataggio locale durante errore di sincronizzazione');
    await waitCount(restoredPage,genuineAuto.listId,genuineAuto.countId,{notes:'Verifica salvataggio locale durante errore di sincronizzazione',syncState:'synced'});
    await restoredPage.locator('[data-action="save-details"]')[viewport.width<600?'tap':'click']();await restoredPage.locator('#reading-details').waitFor({state:'detached'});
    assert.equal(await restoredPage.locator('#counts-status').textContent(),'Sincronizzazione non disponibile: riprova','a queued local-save acknowledgement does not conceal the failed pull');
    assert.equal(await restoredPage.locator('#counts-status').getAttribute('role'),'alert');
    await restoredPage.screenshot({path:resolve(output,name+'-sync-failure-preserved.png'),fullPage:true});report.stages.push('explicit-sync-pull-failure-remains-visible-through-local-save');

    stage='explicit-header-sync-pulls-remote-records';
    const fixture=scopeState(owner+'|'+APP_CONFIG.environment),remoteListId='13600000-0000-4000-8000-'+String(index+1).padStart(12,'0'),remoteFirstId='13610000-0000-4000-8000-'+String(index+1).padStart(12,'0'),remoteSecondId='13620000-0000-4000-8000-'+String(index+1).padStart(12,'0');
    const remoteList={...structuredClone(Object.values(fixture.lists)[0]),listId:remoteListId,title:'Elenco ricevuto dal profilo',revision:1,localRevision:0,deleted:false,updatedAt:new Date().toISOString()};
    const remoteFirst={...structuredClone(saved[0]),listId:remoteListId,countId:remoteFirstId,title:'Lettura remota da eliminare',titleMode:'manual',quantity:17,revision:1,localRevision:0,deleted:false,updatedAt:new Date().toISOString()},remoteSecond={...remoteFirst,countId:remoteSecondId,title:'Lettura remota conservata',quantity:19};
    fixture.lists[remoteListId]=remoteList;fixture.counts[remoteFirstId]=remoteFirst;fixture.counts[remoteSecondId]=remoteSecond;
    assert.equal(await restoredPage.locator('.archive-list[data-list-id="'+remoteListId+'"]').count(),0,'remote-only list is absent before the explicit pull');
    await restoredPage.evaluate(()=>scrollTo(0,0));report.headers.freshArchive=await assertHeader(restoredPage);await assertRegisteredNotice(restoredPage);
    const callsBeforePull=apiCalls.length;await restoredPage.locator('#counts-sync')[viewport.width<600?'tap':'click']();
    await restoredPage.locator('.archive-list[data-list-id="'+remoteListId+'"] h2').waitFor({state:'visible',timeout:10000});
    assert.equal(await restoredPage.locator('.archive-list[data-list-id="'+remoteListId+'"] h2').textContent(),remoteList.title);
    await waitCount(restoredPage,remoteListId,remoteFirstId,{title:remoteFirst.title,quantity:17,syncState:'synced'});
    report.explicitSyncCalls=apiCalls.slice(callsBeforePull).filter(call=>call.owner===owner);assert.ok(report.explicitSyncCalls.some(call=>call.action==='pull'),'tapping the header sync icon invokes the actual Counts pull API');
    await restoredPage.waitForFunction(()=>document.querySelector('#counts-status')?.getAttribute('role')==='status'&&document.querySelector('#counts-status')?.textContent==='Sincronizzato',null,{timeout:10000});
    assert.equal(await restoredPage.locator('#counts-status').getAttribute('role'),'status','a successful explicit pull clears the prior synchronization error');
    report.stages.push('explicit-header-sync-fetches-remote-only-list-and-readings');

    stage='trash-count-and-list-actions';const listTrash=restoredPage.locator('.archive-list[data-list-id="'+remoteListId+'"] [data-action="delete-list"]');
    assert.equal(await listTrash.getAttribute('title'),'Elimina elenco');assert.equal(await listTrash.getAttribute('aria-label'),'Elimina '+remoteList.title);
    const listTrashSVG=await listTrash.locator('svg').innerHTML();await openSaved(remoteFirst);
    const countTrash=restoredPage.locator('#reading-details [data-action="delete-count"]');assert.equal(await countTrash.getAttribute('aria-label'),'Elimina lettura');
    assert.equal(await countTrash.locator('svg').innerHTML(),listTrashSVG,'count and list deletion use the same recognizable bin icon');
    assert.equal(/[Aa]/.test(await countTrash.locator('svg path').getAttribute('d')),false,'the trash icon uses straight bin edges rather than a circular reset arrow');
    await restoredPage.screenshot({path:resolve(output,name+'-trash-count-details.png'),fullPage:true});
    await countTrash[viewport.width<600?'tap':'click']();await restoredPage.locator('[data-action="confirm-delete-count"]').waitFor({state:'visible'});
    assert.equal(await restoredPage.locator('#dialog-title').textContent(),'Eliminare questo conteggio?');
    assert.notEqual(await restoredPage.locator('[data-action="reset"] svg').innerHTML(),listTrashSVG,'reset retains its distinct circular icon');
    assert.equal(fixture.counts[remoteFirstId].deleted,false,'tapping trash only asks for confirmation');
    await Promise.all([waitDeletedMutation(restoredPage,owner,'count',remoteFirstId),restoredPage.locator('[data-action="confirm-delete-count"]')[viewport.width<600?'tap':'click']()]);await restoredPage.locator('.counts-modal').waitFor({state:'detached'});
    await restoredPage.locator('[data-action="open-count"][data-count-id="'+remoteFirstId+'"]').waitFor({state:'detached'});await waitSyncedArchive(restoredPage);
    assert.equal(fixture.counts[remoteFirstId].deleted,true,'confirmed count deletion is synchronized');assert.equal(fixture.counts[remoteSecondId].deleted,false,'deleting one count preserves its sibling');assert.equal(fixture.counts[remoteSecondId].quantity,19);
    await listTrash[viewport.width<600?'tap':'click']();await restoredPage.locator('[data-action="confirm-delete-list"]').waitFor({state:'visible'});
    assert.equal(await restoredPage.locator('#dialog-title').textContent(),'Eliminare questa lista e i suoi conteggi?');assert.equal(fixture.lists[remoteListId].deleted,false,'list trash also requires confirmation');
    await restoredPage.screenshot({path:resolve(output,name+'-trash-list-confirmation.png'),fullPage:true});await Promise.all([waitDeletedMutation(restoredPage,owner,'list',remoteListId),waitDeletedMutation(restoredPage,owner,'count',remoteSecondId),restoredPage.locator('[data-action="confirm-delete-list"]')[viewport.width<600?'tap':'click']()]);
    await restoredPage.locator('.archive-list[data-list-id="'+remoteListId+'"]').waitFor({state:'detached'});await waitSyncedArchive(restoredPage);
    assert.equal(fixture.lists[remoteListId].deleted,true);assert.equal(fixture.counts[remoteSecondId].deleted,true,'confirmed list deletion removes the remaining child count');
    for(const count of [saved[0],manualDefault,genuineAuto])assert.equal(fixture.counts[count.countId].deleted,false,'unrelated saved readings remain intact');
    report.trash={listSVG:listTrashSVG,countDeleted:fixture.counts[remoteFirstId].deleted,siblingDeletedWithList:fixture.counts[remoteSecondId].deleted,listDeleted:fixture.lists[remoteListId].deleted};
    report.stages.push('trash-buttons-confirm-and-delete-only-the-correct-count-or-list');
   }finally{await restoredContext.close();}
   report.stages.push('same-profile-restores-saved-reading-in-fresh-browser');

   stage='guest-explicit-inline-consent';const guestOwner='00000000-0000-4000-8000-'+String(2360+index).padStart(12,'0'),guestContext=await makeContext(name+'-guest',viewport,guestOwner,true),guestPage=await guestContext.newPage();
   try{
    trackPage(guestPage);const guestTap=locator=>locator[viewport.width<600?'tap':'click']();
    await guestPage.goto(base+'/conteggi/',{waitUntil:'domcontentloaded'});await prepare(guestPage,guestOwner);
    assert.equal(await guestPage.locator('body').getAttribute('data-owner-kind'),'guest');
    report.layouts.guestInitial=await layout(guestPage);assertCounterLayout(report.layouts.guestInitial,name+' guest initial');report.headers.guestCounter=await assertHeader(guestPage);
    const consent=guestPage.locator('#sync-banner [data-action="accept-notice"]');assert.equal(await consent.textContent(),'Attiva sincronizzazione');assert.equal(await consent.isVisible(),true);assert.match(await guestPage.locator('#sync-banner').textContent(),/amministratori autorizzati/);
    await guestTap(guestPage.locator('#counts-sync'));await guestPage.locator('#counts-sync:not(:disabled)').waitFor({state:'visible'});
    assert.equal(apiCalls.filter(call=>call.owner===guestOwner).length,0,'guest header synchronization cannot bypass explicit consent');
    await guestTap(guestPage.locator('[data-action="increment"]'));await waitReading(guestPage,{quantity:1});const guestReading=await reading(guestPage);
    await guestTap(guestPage.locator('[data-action="confirm-count"]'));await guestPage.locator('.count-row').first().waitFor({state:'attached'});await waitCount(guestPage,guestReading.listId,guestReading.countId,{quantity:1});
    assert.equal(apiCalls.filter(call=>call.owner===guestOwner).length,0,'guest saves remain device-local until inline consent');
    assert.equal(Object.keys(scopeState(guestOwner+'|'+APP_CONFIG.environment).counts).length,0,'no guest data reaches the mock backend before consent');
    await consent.scrollIntoViewIfNeeded();await guestPage.screenshot({path:resolve(output,name+'-guest-inline-consent.png'),fullPage:true});await guestTap(consent);
    await waitCount(guestPage,guestReading.listId,guestReading.countId,{quantity:1,syncState:'synced'});await consent.waitFor({state:'hidden'});
    assert.equal(await guestPage.locator('.counts-modal').count(),0,'inline consent activates sync without another notice dialog');
    const guestCalls=apiCalls.filter(call=>call.owner===guestOwner),notices=guestCalls.filter(call=>call.action==='notice');assert.equal(notices.length,1);assert.equal(guestCalls[0].action,'notice','the explicit notice precedes all guest synchronization');
    assert.equal(notices[0].input.version,await guestPage.evaluate(async()=>{const{COUNTS_CONFIG}=await import('/conteggi/config.js');return COUNTS_CONFIG.noticeVersion;}),'inline consent acknowledges the current notice version');
    assert.ok(guestCalls.some(call=>call.action==='mutate'));assert.ok(guestCalls.some(call=>call.action==='pull'),'inline consent also performs a real pull');
    assert.equal(scopeState(guestOwner+'|'+APP_CONFIG.environment).counts[guestReading.countId].quantity,1);
    await guestPage.reload();await prepare(guestPage,guestOwner);await guestPage.locator('.count-row').first().waitFor({state:'attached'});await guestPage.locator('#sync-banner [data-action="accept-notice"]').waitFor({state:'hidden'});
    await guestPage.evaluate(()=>scrollTo(0,0));report.headers.guestArchive=await assertHeader(guestPage);report.guestConsent={owner:guestOwner,noticeVersion:notices[0].input.version,quantity:1,calls:guestCalls,hiddenAfterReload:true};report.stages.push('guest-inline-consent-gates-sync-and-persists-after-reload');
   }finally{await guestContext.close();}

   assert.deepEqual(errors,[]);assert.deepEqual(responses,expectedResponses);assert.equal(expectedResponses.length,1,'only the intentionally failed sync pull returns an HTTP error');assert.equal(requests.some(request=>/maplibre|leaflet|catasto|src\/(?:app|terrain-3d|terrain-view)\.js|arcgisonline|tile\.openstreetmap/.test(request.url)),false,'Counts never loads the terrain/map renderer or external map providers');
   assert.deepEqual([...new Set(requests.map(request=>request.url).filter(url=>new URL(url).origin!==base))],['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'],'only the mocked SDK is requested externally; no alternate transmission is attempted');
   report.status='passed';console.log(name+': category targets, title layout, header pull/error recovery, trash, guest consent and profile persistence passed');
  }catch(error){failed=true;report.status='failed';report.failedStage=stage;report.error=error.stack??error.message;await page.screenshot({path:resolve(output,name+'-failure.png'),fullPage:true}).catch(()=>{});console.error(name+': '+stage+': '+error.message);}
  finally{report.errors=errors;report.responses=responses;report.expectedResponses=expectedResponses;report.requests=requests;await writeFile(resolve(output,name+'-result.json'),JSON.stringify(report,null,2));await context.close();}
 }
 assert.equal(apiCalls.some(call=>call.name==='submit-counts'||call.name==='counts-admin'),false,'no email transmission or admin API request');
 for(const path of ['/conteggi/boot.js','/conteggi/runtime.js','/conteggi/ui.js','/conteggi/counter-view.js','/conteggi/storage-banner.js','/conteggi/reading-title.js'])assert.equal(moduleHashes.get(path),sha(await readFile(resolve(root,'.'+path))),path+' served authentic package bytes');
}finally{
 await writeFile(resolve(output,'summary.json'),JSON.stringify({release:APP_CONFIG.version,reports,apiCalls,servedModuleSHA256:Object.fromEntries(moduleHashes)},null,2));
 await browser?.close();await new Promise(done=>server.close(done));
}
if(failed)process.exitCode=1;
