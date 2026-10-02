// Local Chromium checks. Auth is a fixture adapter; production requests are blocked.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium,devices}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const output=process.env.COUNTS_BROWSER_OUTPUT??'.counts-work/browser';await mkdir(output,{recursive:true});
let base=process.env.COUNTS_BROWSER_BASE,server,browser;
if(!base){
 const root=fileURLToPath(new URL('../',import.meta.url));
 server=createServer(async(req,res)=>{try{
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname.endsWith('/'))pathname+='index.html';
  const path=resolve(root,'.'+pathname);if(!path.startsWith(root+'/'))throw new Error('Forbidden');
  const bytes=await readFile(path);res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png'})[extname(path)]??'application/octet-stream');res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
}
const fixture=`import {createCountsGateway} from '/src/counts-client.js';
import {mountCountsUI} from '/conteggi/ui.js';import {parseCountsUrl} from '/conteggi/navigation.js';import {createCountsFeedback} from '/conteggi/feedback.js';
const gateway=createCountsGateway({scope:{backend:'https://fixture.example',environment:'TEST',owner:'00000000-0000-4000-8000-000000000010'},channel:false});
const ui=mountCountsUI({gateway,route:parseCountsUrl(location.href),config:{countsBaseUrl:location.origin+'/conteggi/',configuratorBaseUrl:location.origin+'/index.html',syncEnabled:false},feedback:createCountsFeedback()});await ui.ready;globalThis.fixture={gateway,ui};`;
try{
 browser=await chromium.launch({headless:true,...(process.env.COUNTS_CHROMIUM_PATH?{executablePath:process.env.COUNTS_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
 for(const [name,options] of [['desktop',{viewport:{width:1365,height:960}}],['mobile',{...devices['iPhone 13'],defaultBrowserType:undefined}],['mobile-small',{viewport:{width:320,height:568},isMobile:true,hasTouch:true,deviceScaleFactor:2}]]){
  const context=await browser.newContext(options),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(!url.href.startsWith(base+'/'))return route.abort();
   if(url.pathname==='/index.html')return route.fulfill({contentType:'text/html',body:'<html lang="it"><title>Destinazione locale</title><body>Destinazione locale</body></html>'});
   if(url.pathname==='/conteggi/boot.js')return route.fulfill({contentType:'application/javascript',body:fixture});return route.continue();
  });
  const idle=()=>page.evaluate(()=>fixture.ui.whenIdle());
  const click=async action=>{await page.locator(`[data-action="${action}"]`).first().click();await idle();};
  await page.goto(base+'/conteggi/');await page.waitForFunction(()=>globalThis.fixture);
  assert.equal(await page.locator('#quantity-display').textContent(),'0');assert.equal(await page.locator('select').count(),0);
  await page.locator('[name="title"]').fill('Lettura filare 2');await idle();
  await page.evaluate(()=>{for(let i=0;i<27;i++)document.querySelector('[data-action="increment"]').click();});await idle();
  assert.equal(await page.locator('#quantity-display').textContent(),'27');await page.screenshot({path:output+'/'+name+'-counter.png',fullPage:true});
  await page.reload();await page.waitForFunction(()=>globalThis.fixture);assert.equal(await page.locator('#quantity-display').textContent(),'27');
  const saveBounds=await page.locator('[data-action="confirm-count"]').boundingBox();assert.ok(saveBounds.y+saveBounds.height<=page.viewportSize().height,'save control fits the viewport');
  await context.setOffline(true);await click('increment');assert.equal(await page.locator('#quantity-display').textContent(),'28');await context.setOffline(false);
  await click('reset');await click('close-modal');assert.equal(await page.locator('#quantity-display').textContent(),'28');
  await click('reset');await click('confirm-reset');assert.equal(await page.locator('#quantity-display').textContent(),'0');assert.equal(await page.locator('[data-action="decrement"]').isDisabled(),true);
  await page.locator('[data-action="category"][data-category="posts"]').click();await idle();
  await page.locator('[data-action="increment"]').focus();await page.keyboard.press('Space');await idle();assert.equal(await page.locator('#quantity-display').textContent(),'1');
  await page.keyboard.down('Enter');for(let i=0;i<5;i++)await page.keyboard.down('Enter');await page.keyboard.up('Enter');await idle();assert.equal(await page.locator('#quantity-display').textContent(),'2');
  await click('confirm-count');await page.locator('[data-action="open-count"]').waitFor();await page.screenshot({path:output+'/'+name+'-list.png',fullPage:true});
  await click('open-count');await page.locator('[name="rootstockLabel"]').fill('Kober 5 BB');await idle();await page.locator('[name="quantity"]').fill('100');await idle();await click('save-details');
  assert.equal(await page.locator('.count-row strong').textContent(),'100');assert.match(await page.locator('.reading-material').textContent(),/Kober 5 BB/);
  await click('add-count');await click('increment');await click('confirm-count');assert.equal(await page.locator('.count-row').count(),2);assert.equal((await page.evaluate(()=>fixture.gateway.listRecentLists())).length,1);
  await click('open-count');await click('details-new-list');await page.locator('[name="listTitle"]').fill('Rimesse collina');await click('move-new-list');assert.equal(await page.locator('.list-heading h2').textContent(),'Rimesse collina');
  await click('add-count');await click('increment');await click('counter-menu');await page.locator('[data-tool="configurator"]').click();await page.waitForURL(base+'/index.html');
  await page.goto(base+'/conteggi/');await page.waitForFunction(()=>globalThis.fixture);assert.equal(await page.locator('#quantity-display').textContent(),'1');
  await page.evaluate(()=>fixture.gateway.setScope({backend:'https://fixture.example',environment:'TEST',owner:'00000000-0000-4000-8000-000000000011'}));await idle();assert.equal(await page.locator('#quantity-display').textContent(),'0');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  assert.equal(requests.some(u=>/maplibre|leaflet|soil|catasto|src\/app\.js/.test(u)),false);
  console.log(name+': impulses, restore, offline mutations, reset, keyboard, save, material, moves, scope and viewport passed');await context.close();
 }
}finally{await browser?.close();await new Promise(r=>server?server.close(r):r());}
