// Real Chromium hit testing and touch activation with local identity/map fixtures.
// No production backend, tiles, SDK, account changes or commercial requests.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium,devices}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const output=process.env.COUNTS_BROWSER_OUTPUT??'.counts-work/browser';await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{try{
 let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname.endsWith('/'))pathname+='index.html';
 const path=resolve(root,'.'+pathname);if(!path.startsWith(root+'/'))throw new Error('Forbidden');
 res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html','.ttf':'font/ttf','.png':'image/png'})[extname(path)]??'application/octet-stream');res.end(await readFile(path));
}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const shellFixture=`
import {createMobileUI} from '/src/mobile-ui.js';import {mountToolMenu} from '/src/tool-menu.js';
import {createProfileUI} from '/src/profile-ui.js';import {createInitialState} from '/src/state.js';
import {checkpointBeforeSwitch} from '/src/tool-switch.js';
const state=createInitialState();state.project.localProjectId='fixture-project';
let identity={kind:'guest',displayName:'Guest',user:{id:'fixture-owner'},profile:{}};const listeners=new Set();
const auth={getState:()=>identity,subscribe(fn){listeners.add(fn);fn(identity);return()=>listeners.delete(fn);}};
let holdNavigation=false,calls=0;
const openCounts=view=>{calls++;if(holdNavigation)return;return checkpointBeforeSwitch({storage:localStorage,state,ownerId:identity.user.id,
 capture:()=>({version:1,ownerId:identity.user.id,projectId:state.project.localProjectId,fieldId:state.project.activeFieldId}),
 navigate:()=>location.assign('/conteggi/?integrationVersion=1&view='+view)});};
const noop=()=>{};const ui=createMobileUI({isMobile:()=>innerWidth<=1100,getField:()=>state.project,getFields:()=>state.project.fields,
 getMetrics:()=>({areaM2:0,netAreaM2:0,rows:[],simulatedPlants:0,totalPosts:0}),auth,countsEnabled:true,openCounts,
 resizeMap:noop,focusAll:noop,stopTools:noop,finishEdit:noop,undoPoint:noop,beginEdit:noop,beginNewField:noop,
 selectField:noop,removeField:noop,cancelEdit:noop,saveProject:noop,listProjects:()=>[],loadProject:noop,newProject:noop});
mountToolMenu({document,onCounts:()=>openCounts('resume'),onError:error=>{throw error;}});
const profile=createProfileUI({authService:auth,document,countsEnabled:true,onCounts:()=>openCounts('resume')});profile.mount();
globalThis.fixture={ui,holdNavigation(){holdNavigation=true;},get calls(){return calls;},login(){identity={kind:'user',displayName:'Mario',username:'mario',email:'m@example.test',user:{id:'fixture-owner'},profile:{}};for(const fn of listeners)fn(identity);}};`;
const countsFixture=`
import {createCountsGateway} from '/src/counts-client.js';import {mountCountsUI} from '/conteggi/ui.js';import {parseCountsUrl} from '/conteggi/navigation.js';
const gateway=createCountsGateway({scope:{backend:'https://fixture.example',environment:'TEST',owner:'00000000-0000-4000-8000-000000000010'},channel:false});
const ui=mountCountsUI({gateway,route:parseCountsUrl(location.href),config:{countsBaseUrl:location.origin+'/conteggi/',configuratorBaseUrl:location.origin+'/',syncEnabled:false}});await ui.ready;globalThis.fixture={ui,gateway};`;
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.COUNTS_CHROMIUM_PATH?{executablePath:process.env.COUNTS_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 for(const [name,options] of [['mobile',{...devices['iPhone 13'],defaultBrowserType:undefined}],['small',{viewport:{width:320,height:568},isMobile:true,hasTouch:true}],['tablet',{viewport:{width:1080,height:810},hasTouch:true}],['desktop',{viewport:{width:1365,height:960}}]]){
  const context=await browser.newContext(options),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(!url.href.startsWith(base+'/'))return route.abort();
   if(url.pathname==='/src/app.js')return route.fulfill({contentType:'application/javascript',body:shellFixture});
   if(url.pathname==='/conteggi/boot.js')return route.fulfill({contentType:'application/javascript',body:countsFixture});return route.continue();});
  const open=async()=>{await page.goto(base+'/');await page.waitForFunction(()=>globalThis.fixture).catch(error=>{throw new Error(error.message+'; '+errors.join('; '));});await page.evaluate(()=>document.fonts.ready);};
  const press=async selector=>{const node=page.locator(selector);await node[options.hasTouch?'tap':'click']();};
  const counter=async()=>{await page.waitForURL(/\/conteggi\/\?integrationVersion=1&view=resume/);await page.waitForFunction(()=>globalThis.fixture?.gateway);await page.locator('#quantity-display').waitFor();assert.equal(await page.locator('#quantity-display').textContent(),'0');};
  const mobile=name!=='desktop';
  await open();await press(mobile?'.mobile-brand-tool-trigger':'.brand');
  const option=page.locator('#tool-selector [data-tool="counts"]');assert.equal(await option.isVisible(),true);
  assert.equal(await option.evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,'Conteggi receives hit testing');
  assert.equal(await option.evaluate(node=>getComputedStyle(node).fontFamily.startsWith('Comfortaa')),true);
  await page.screenshot({path:output+'/'+name+'-tool-menu.png'});await press('#tool-selector [data-tool="counts"]');await counter();
  for(const signedIn of [false,true]){await open();if(signedIn)await page.evaluate(()=>fixture.login());
   if(mobile){await page.evaluate(()=>fixture.ui.navigate('profile'));await press('.mobile-counts-link');}
   else{await press('#profile-trigger');await press('[data-profile-counts]:visible');}await counter();
  }
  if(mobile){
   await open();await press('#mobile-add-field');await press('.mobile-editor-tool-trigger');await press('#tool-selector [data-tool="counts"]');await counter();
   // Omit compatibility click exactly as reported on Safari.
   await open();const missingClickTap=async selector=>{await page.locator(selector).evaluate(node=>{for(const type of ['pointerdown','pointerup'])node.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:7,clientX:20,clientY:20}));});};
   await missingClickTap('.mobile-brand-tool-trigger');await page.locator('#tool-selector').waitFor();await missingClickTap('#tool-selector [data-tool="counts"]');await counter();
   await open();await page.evaluate(()=>fixture.holdNavigation());await missingClickTap('.mobile-brand-tool-trigger');await page.locator('#tool-selector').waitFor();
   await missingClickTap('#tool-selector [data-tool="counts"]');await page.waitForFunction(()=>fixture.calls===1);
   assert.equal(await page.locator('#tool-selector [data-tool="counts"]').evaluate(node=>node.dispatchEvent(new PointerEvent('click',{bubbles:true,cancelable:true,pointerType:'touch',detail:1}))),false);
   assert.equal(await page.evaluate(()=>fixture.calls),1,'delayed compatibility click is cancelled before the target listener');
   await page.setViewportSize({width:1365,height:960});await page.evaluate(()=>fixture.ui.sync());await page.locator('.brand').click();
   assert.equal(await page.locator('#tool-selector').evaluate(node=>node.parentElement===document.body),true,'desktop menu leaves the mobile touch surface');
   await page.locator('#tool-selector [data-tool="counts"]').click();await page.waitForFunction(()=>fixture.calls===2);
  }
  assert.deepEqual(errors,[]);console.log(name+': visible tool selection, touch/click, Profile guest/user, checkpoint and direct counter passed');await context.close();
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
