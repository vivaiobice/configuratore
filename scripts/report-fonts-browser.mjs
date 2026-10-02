// Historical generated-document typography against the real report template. Remote requests are blocked.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`);
const mode=process.argv[2]||'verify';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const outputDir=process.env.COUNTS_BROWSER_OUTPUT??'.counts-work/browser';await fs.mkdir(outputDir,{recursive:true});
const server=http.createServer(async(req,res)=>{try{const filename=path.join(root,new URL(req.url,'http://localhost').pathname);const data=await fs.readFile(filename);const type=filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.html')?'text/html':filename.endsWith('.ttf')?'font/ttf':filename.endsWith('.png')?'image/png':'application/octet-stream';res.writeHead(200,{'Content-Type':type});res.end(data);}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({...(process.env.COUNTS_CHROMIUM_PATH?{executablePath:process.env.COUNTS_CHROMIUM_PATH}:{}),headless:true,args:['--no-sandbox']});
const model={title:'Studio preliminare ed esemplificativo di impianto viticolo',company:{name:'VIVAI OBICE S.S.A.',address:'Via Cossano, 6',email:'info@vivaiobice.com',phone:'393 892 9801',vat:'01656710041',sdi:'SUBM70N'},project:{name:'Vigneto prova',code:'VO-10',revisionNumber:4,documentId:'DOC-1',generatedAt:'2026-09-24T10:00:00Z'},recipient:{companyName:'Azienda esempio',firstName:'Mario',lastName:'Rossi',address:'Via delle vigne 6',addressPostalCode:'12000',addressCity:'Borgo',addressProvince:'CN',plantLocation:'Santo Stefano Belbo',province:'CN'},fields:[{id:'f1',label:'Moscato Premium',location:{label:'Santo Stefano Belbo'},geometry:[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]],exclusions:[],rows:[{start:[8.005,44],end:[8.005,44.01]}],layout:{rowSpacingM:2.5,plantSpacingM:.9,orientationDeg:10,headlandWidthM:6,postSpacingM:4.5,mechanizedHarvest:true},plantMaterial:{grapeVariety:'Moscato',cloneSelection:'CVT 57',rootstock:'S.O.4'},plantingYear:2027,context:{label:'Nuovo Impianto',note:'Nota'},metrics:{grossAreaM2:2400,netAreaM2:2100,perimeterM:205,rowCount:14,rowLinearM:778,calculatedPlants:872,commercialPlants:875,headPosts:28,intermediatePosts:165,totalPosts:193},satelliteImage:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=',mapAttribution:'Imagery © Esri',cadastralRefs:[{municipality:'Borgo',sheet:'1',parcel:'50'}],soil:{cartographic:{}}}],summary:{fieldCount:1,commercialPlants:875,calculatedPlants:872,netAreaM2:2100,rowCount:14,rowLinearM:778,totalPosts:193},qrSvg:'<svg class="test-qr" viewBox="0 0 100 100"><path d="M0 0L100 100"/></svg>',shareUrl:'https://example.test/shared',disclaimer:{short:'Elaborato preliminare ed esemplificativo.',full:'Testo completo del disclaimer.',version:'1'}};
async function render({baseline=false,mobile=false}={}){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1366,height:900}});
 await page.route('https://**/*',route=>route.abort());
 await page.route('**/src/report.js?*',route=>route.fulfill({contentType:'text/javascript',body:'/* QA: render real report template without remote issue/satellite side effects. */'}));
 if(baseline)await page.route('**/fonts.css?*',route=>route.fulfill({contentType:'text/css',body:'/* Baseline before v1.2.1. */'}));
 await page.goto(`${base}/report.html${mobile?'?source=mobile':''}`,{waitUntil:'networkidle'});
 await page.evaluate(async ({model,mobile})=>{
   if(mobile){document.documentElement.dataset.reportSource='mobile';for(const href of ['./v55.4-report-print.css?v=55.4','./v1.0.1-report-print.css?v=1.0.1']){const link=document.createElement('link');link.rel='stylesheet';link.media='print';link.href=href;document.head.append(link);}}
   const {renderProjectReportHtml}=await import('./src/report-template.js?v=1.0.1');
   document.querySelector('#report-preview').innerHTML=renderProjectReportHtml(model,{mobile});
   await document.fonts.ready;
 },{model,mobile});
 return page;
}
async function inspect(page,media){
 await page.emulateMedia({media});
 return page.evaluate(()=>{
  const nodes=[...document.querySelectorAll('.report-document, .report-document *')];
  const properties=nodes.map(node=>({tag:node.tagName,cls:node.getAttribute('class')||'',family:getComputedStyle(node).fontFamily,before:getComputedStyle(node,'::before').fontFamily,after:getComputedStyle(node,'::after').fontFamily}));
  const sample=selector=>getComputedStyle(document.querySelector(selector)).fontFamily;
  const ui={header:sample('.report-app-header strong'),heading:sample('#report-preflight-title'),input:sample('#report-recipient-form input'),action:sample('#report-generate'),toolbar:sample('#report-print-top')};
  return {properties,ui,samples:{document:sample('.report-document'),title:sample('.document-cover h1'),body:sample('.document-data-row span'),footer:sample('.document-footer'),diagram:sample('.side-label text'),north:sample('.north text')},pageCount:document.querySelectorAll('.report-page').length};
 });
}
const output=[];
try{
 for(const mobile of [false,true]){
  const baselinePage=await render({baseline:true,mobile});const currentPage=await render({mobile});
  for(const media of ['screen','print']){
   const baseline=await inspect(baselinePage,media);const current=await inspect(currentPage,media);
   const mismatches=baseline.properties.flatMap((row,index)=>['family','before','after'].filter(key=>row[key]!==current.properties[index][key]).map(key=>({index,key,tag:row.tag,cls:row.cls,baseline:row[key],current:current.properties[index][key]})));
   output.push({mobile,media,nodeCount:current.properties.length,pageCount:current.pageCount,mismatchCount:mismatches.length,mismatches:mismatches.slice(0,8),ui:current.ui,samples:current.samples,baselineSamples:baseline.samples});
   if(mode==='verify'){
    assert.equal(mismatches.length,0,`Generated ${mobile?'mobile':'desktop'} document typography must match pre-v1.2.1 under ${media}`);
    for(const [key,family]of Object.entries(current.ui))assert.match(family,/^Comfortaa,/,`${key} keeps Comfortaa under ${media}`);
    assert.equal(current.samples.diagram,'Arial, sans-serif');assert.equal(current.samples.north,'Arial, sans-serif');
   }
  }
  if(mode==='verify'){await currentPage.emulateMedia({media:'screen'});await currentPage.screenshot({path:`${outputDir}/report-font-${mobile?'mobile':'desktop'}.png`,fullPage:true});await currentPage.emulateMedia({media:'print'});await currentPage.pdf({path:`${outputDir}/report-font-${mobile?'mobile':'desktop'}.pdf`,format:'A4',printBackground:true});}
  await baselinePage.close();await currentPage.close();
 }
 console.log(JSON.stringify(output,null,2));
 if(mode==='verify')console.log('PASS: generated document fonts exactly match historical baseline; report controls remain Comfortaa on screen and print for desktop and mobile.');
}catch(error){console.log(JSON.stringify(output,null,2));throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
