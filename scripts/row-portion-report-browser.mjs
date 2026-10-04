// Anonymous report fixtures; Chromium uses only local files. No cloud calls.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {calculateProject} from '../src/project-calculator.js';
import {resolveRowPortions,updateRowPortion} from '../src/row-portions.js';
import {buildProjectReportModel} from '../src/pdf-model.js';
import {renderProjectReportHtml} from '../src/report-template.js';
import {buildProjectPdfBytes} from '../src/report-pdf-download.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const PDFLib=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/pdf-lib');
const root=resolve(new URL('../',import.meta.url).pathname),output=resolve(process.env.COUNTS_BROWSER_OUTPUT||'/tmp/v125-task3-report');
await mkdir(output,{recursive:true});
const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures/l-shaped-portions.json'),'utf8'));
let portions=resolveRowPortions(fixture);portions=updateRowPortion(portions,portions[0].id,{orientationDeg:35,rowCurvePoints:[]});
portions=updateRowPortion(portions,portions[1].id,{orientationDeg:105,rowCurvePoints:[{id:'curve',position:.5,offsetM:3}],maintainRowEquidistance:false});
const field={...fixture,id:'anonymous',label:'Campo anonimo',geometry:fixture.polygon,headlandWidthM:4,rowPortions:portions,projectContextNote:'Note del campo conservate nella pagina dati.'};
const metrics=calculateProject({...field,polygon:field.geometry});
const model=buildProjectReportModel({state:{environment:'TEST',project:{localProjectName:'Porzioni indipendenti',fields:[field]}},getMetrics:()=>metrics,
 report:{projectCode:'VO-1234567',revisionNumber:1,generatedAt:'2026-10-03T00:00:00Z'}});
const many=structuredClone(model);many.fields[0].layout.portions=Array.from({length:60},(_,i)=>({id:`synthetic-${i}`,label:`Porzione ${i+1} ${'etichetta lunga '.repeat(i%4)}`,mode:'local',orientationDeg:35+i/10,curved:i%2===1,maintainRowEquidistance:i%2===0}));
if(process.env.COUNTS_WIDE_PORTION_LABEL==='1')many.fields[0].layout.portions[0].label='W'.repeat(1728);
const documents=new Map(),reports=[];
for(const [name,value] of [['mixed',model],['many',many]]){
 const html=`<!doctype html><html lang="it"><head><meta charset="utf-8"><link rel="stylesheet" href="/report.css?v=1.2.4"><link rel="stylesheet" href="/report-layout.css?v=1.2.5"><link rel="stylesheet" href="/fonts.css?v=1.2.4"><link rel="stylesheet" href="/report-print.css?v=45" media="print"></head><body>${renderProjectReportHtml(value)}</body></html>`;
 documents.set('/fixture-'+name+'.html',html);await writeFile(resolve(output,name+'.html'),html);
 const bytes=await buildProjectPdfBytes(value,{pdfLib:PDFLib,assetLoader:async path=>new Uint8Array(await readFile(resolve(root,path)))});
 await writeFile(resolve(output,'native-'+name+'.pdf'),bytes);
}
const oldCore=new Map(['src/fields.js','src/project-calculator.js','src/row-curves.js'].map(path=>[path,execFileSync('git',['show','ead425c^:'+path],{cwd:root,encoding:'utf8'})]));
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),path=url.pathname.slice(1);
 if(documents.has(url.pathname)){res.setHeader('Content-Type','text/html');res.end(documents.get(url.pathname));return;}
 if(url.pathname==='/warm.html'){res.setHeader('Content-Type','text/html');res.end('<title>Cache fixture</title>');return;}
 const local=resolve(root,path);if(!local.startsWith(root+'/'))throw new Error('Forbidden');
 res.setHeader('Cache-Control','public, max-age=3600');
 res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.ttf':'font/ttf'})[extname(local)]||'application/octet-stream');
 res.end(oldCore.has(path)&&url.searchParams.get('v')!=='1.2.5'?oldCore.get(path):await readFile(local));
 }catch{res.writeHead(404);res.end('Missing fixture');}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.COUNTS_CHROMIUM_PATH||'/tmp/v125-chromium-package/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:1200,height:1100}}),page=await context.newPage(),requests=[],errors=[];
 page.on('request',request=>requests.push(request.url()));page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/warm.html');
 await page.evaluate(async()=>{await import('/src/fields.js?v=55.1');await import('/src/project-calculator.js?v=1.2.4');});
 const result=await page.evaluate(async field=>{const {calculateProject}=await import('/src/project-calculator.js?v=1.2.5');await import('/src/pdf-model.js?v=1.2.5');const m=calculateProject({...field,polygon:field.geometry});return {rowCount:m.rowCount,headPosts:m.headPosts,portions:m.portions.length};},field);
 assert.deepEqual(result,{rowCount:metrics.rowCount,headPosts:metrics.headPosts,portions:2});
 for(const path of ['/src/fields.js','/src/project-calculator.js','/src/row-curves.js','/src/row-portions.js']){
  const urls=[...new Set(requests.filter(url=>new URL(url).pathname===path&&new URL(url).searchParams.get('v')==='1.2.5'))];assert.equal(urls.length,1,path+' has one current module identity');
 }
 for(const [name,value] of [['mixed',model],['many',many]]){
  await page.goto(base+'/fixture-'+name+'.html');await page.emulateMedia({media:'print'});await page.evaluate(()=>document.fonts.ready);
  const bounds=await page.evaluate(()=>[...document.querySelectorAll('.document-portion-line')].map(node=>{const a=node.getBoundingClientRect(),page=node.closest('.report-page'),b=page.getBoundingClientRect(),footer=page.querySelector('.document-footer').getBoundingClientRect();return {bottom:a.bottom,footer:footer.top,left:a.left,right:a.right,pageLeft:b.left,pageRight:b.right,height:a.height,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth};}));
  assert.ok(bounds.length);for(const b of bounds){assert.ok(b.bottom<b.footer,'portion line clear of footer');assert.equal(b.height,18,'each chunk stays on one actual line');assert.ok(b.scrollWidth<=b.clientWidth,'no horizontal clipping');assert.ok(b.left>=b.pageLeft&&b.right<=b.pageRight,'portion line inside page');}
  const fonts=await page.evaluate(()=>({document:getComputedStyle(document.querySelector('.report-document')).fontFamily,ui:getComputedStyle(document.body).fontFamily}));assert.ok(!fonts.document.includes('Comfortaa'),'document font remains the prior system stack');
  await page.pdf({path:resolve(output,'print-'+name+'.pdf'),preferCSSPageSize:true,printBackground:true});
  reports.push({name,portions:value.fields[0].layout.portions.length,htmlPages:await page.locator('.report-page').count(),fonts});
 }
 assert.deepEqual(errors,[]);
 await writeFile(resolve(output,'summary.json'),JSON.stringify({passed:true,metrics:{rows:metrics.rowCount,plants:metrics.simulatedPlants,posts:metrics.totalPosts},reports,requests,errors},null,2));
 console.log(JSON.stringify({passed:true,reports,requestCount:requests.length},null,2));await context.close();
}finally{await browser?.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
