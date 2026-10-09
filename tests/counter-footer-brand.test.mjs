import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {accessSync,constants,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const runtimeModules=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
let chromium,PNG,skipReason;
try{
 ({chromium}=require(runtimeModules?resolve(runtimeModules,'playwright'):'playwright'));
 ({PNG}=require(runtimeModules?resolve(runtimeModules,'pngjs'):'pngjs'));
}catch{skipReason='browser check requires installed Playwright and pngjs';}
const executableAvailable=path=>{
 try{accessSync(path,constants.X_OK);return statSync(path).isFile();}catch{return false;}
};
const explicitExecutable=process.env.COUNTS_CHROMIUM_PATH;
const invalidOverride=explicitExecutable&&!executableAvailable(explicitExecutable);
// Prefer Playwright's own installation. The optional existing Work cache is
// only a last fallback; a fresh checkout does not depend on that site cache.
const executablePath=explicitExecutable??[
 chromium?.executablePath(),
 '/workspace/sites/dashboard-vivai-obice/.sites-runtime/browser/chromium'
].find(path=>path&&executableAvailable(path));
if(!skipReason&&!executablePath)skipReason='browser check requires installed Chromium or COUNTS_CHROMIUM_PATH';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const output=process.env.COUNTER_FOOTER_OUTPUT??'/tmp/v134-counter-footer-brand';
// The real Counts UI and gateway run locally; only boot/auth integration is replaced.
const fixture=`import {createCountsGateway} from '/src/counts-client.js';
import {mountCountsUI} from '/conteggi/ui.js';
const gateway=createCountsGateway({scope:{backend:'https://fixture.example',environment:'TEST',owner:'00000000-0000-4000-8000-000000000010'},channel:false});
const ui=mountCountsUI({gateway,route:{view:'resume'},config:{syncEnabled:false},feedback:{pulse(){}}});
await ui.ready;document.querySelector('#sync-banner').textContent='Salvataggio su questo dispositivo';globalThis.footerFixture={ui,gateway};`;

test('counter footer preserves alpha, centers its mark across the full footer, and renders a light outline',{skip:invalidOverride?false:skipReason},async()=>{
 assert.equal(!!invalidOverride,false,'COUNTS_CHROMIUM_PATH must point to an executable file');
 await mkdir(output,{recursive:true});
 const server=createServer(async(request,response)=>{
  try{
   let pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
   if(pathname.endsWith('/'))pathname+='index.html';
   const path=resolve(root,'.'+pathname);if(!path.startsWith(root+sep))throw Error('Forbidden');
   const bytes=await readFile(path);
   response.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.ttf':'font/ttf'})[extname(path)]??'application/octet-stream');
   response.end(bytes);
  }catch{response.writeHead(404);response.end('Not found');}
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const base='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  for(const [name,options] of [['desktop',{viewport:{width:1365,height:960}}],['mobile',{viewport:{width:390,height:844},isMobile:true,hasTouch:true}],['mobile-small',{viewport:{width:320,height:568},isMobile:true,hasTouch:true}]]){
   const context=await browser.newContext(options),page=await context.newPage(),errors=[];
   try{
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{
     const url=new URL(route.request().url());
     if(url.origin!==base)return route.abort();
     if(url.pathname==='/conteggi/boot.js')return route.fulfill({contentType:'application/javascript',body:fixture});
     return route.continue();
    });
    await page.goto(base+'/conteggi/');await page.waitForFunction(()=>globalThis.footerFixture);
    assert.equal(await page.locator('body').evaluate(node=>node.classList.contains('counter-mode')),true);
    const brand=page.locator('.counts-footer-brand');await brand.scrollIntoViewIfNeeded();
    await brand.locator('img').evaluate(image=>image.decode());
    const metrics=await brand.evaluate(link=>{
     const image=link.querySelector('img'),footer=link.closest('footer');
     const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height,center:r.left+r.width/2};};
     const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
     const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
     let transparent=0;for(let index=3;index<pixels.length;index+=4)if(pixels[index]===0)transparent++;
     const style=getComputedStyle(footer);
     return {link:rect(link),image:rect(image),footer:rect(footer),available:footer.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),background:getComputedStyle(link).backgroundColor,imageBackground:getComputedStyle(image).backgroundColor,filter:getComputedStyle(image).filter,transparent,src:image.getAttribute('src'),overflow:document.documentElement.scrollWidth>innerWidth};
    });
    await writeFile(resolve(output,name+'-metrics.json'),JSON.stringify(metrics,null,2));
    await page.screenshot({path:resolve(output,name+'-counter-footer.png'),fullPage:true});
    assert.ok(Math.abs(metrics.link.width-metrics.available)<1,'brand slot spans the full footer content width');
    assert.ok(Math.abs(metrics.image.center-metrics.footer.center)<1,'logo is centered across the footer');
    assert.equal(metrics.background,'rgba(0, 0, 0, 0)','brand link has no opaque plate');
    assert.equal(metrics.imageBackground,'rgba(0, 0, 0, 0)');
    assert.ok(metrics.transparent>500000,'approved mark retains substantial transparent pixels');
    assert.equal(metrics.src,'../assets/logo-vivai-obice-lineare.png','original approved mark is preserved');
    assert.equal(metrics.overflow,false);
    const outlined=PNG.sync.read(await brand.screenshot());
    const previous=await brand.locator('img').evaluate(image=>{const value=image.style.filter;image.style.filter='none';return value;});
    const unoutlined=PNG.sync.read(await brand.screenshot());
    await brand.locator('img').evaluate((image,value)=>image.style.filter=value,previous);
    let lightOutline=0;
    for(let index=0;index<outlined.data.length;index+=4){
     const rgb=[outlined.data[index],outlined.data[index+1],outlined.data[index+2]];
     const old=[unoutlined.data[index],unoutlined.data[index+1],unoutlined.data[index+2]];
     if(Math.min(...rgb)>140&&Math.max(...old)<120)lightOutline++;
    }
    assert.ok(lightOutline>100,'visible light pixels follow the mark rather than a background rectangle');
    assert.deepEqual(errors,[]);
   }finally{await context.close();}
  }
 }finally{await browser?.close();await new Promise(done=>server.close(done));}
});
