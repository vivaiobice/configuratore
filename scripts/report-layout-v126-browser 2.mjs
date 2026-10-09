// Anonymous, local-only report geometry and pagination fixtures.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {calculateProject} from '../src/project-calculator.js';
import {resolveRowPortions,updateRowPortion} from '../src/row-portions.js';
import {buildProjectReportModel} from '../src/pdf-model.js';
import {renderProjectReportHtml} from '../src/report-template.js';
import {buildProjectPdfBytes} from '../src/report-pdf-download.js';
import {buildReportMapModel,buildTechnicalReportMapModel} from '../src/report-map-model.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright'),PDFLib=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/pdf-lib');
const root=resolve(new URL('../',import.meta.url).pathname),output=resolve(process.env.COUNTS_BROWSER_OUTPUT||'/tmp/v126-report-qa');
await mkdir(output,{recursive:true});
const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures/l-shaped-portions.json'),'utf8'));
let portions=resolveRowPortions(fixture);portions=updateRowPortion(portions,portions[0].id,{orientationDeg:35,rowCurvePoints:[]});
portions=updateRowPortion(portions,portions[1].id,{orientationDeg:105,rowCurvePoints:[{id:'curve',position:.5,offsetM:3}],maintainRowEquidistance:false});
const field={...fixture,id:'anonymous',label:'Campo anonimo',geometry:fixture.polygon,headlandWidthM:4,rowPortions:portions,projectContextNote:'Note del campo conservate nella pagina dati.'};
const metrics=calculateProject({...field,polygon:field.geometry});
const model=buildProjectReportModel({state:{environment:'TEST',project:{localProjectName:'Porzioni indipendenti',fields:[field]}},getMetrics:()=>metrics,
 report:{projectCode:'VO-1234567',revisionNumber:1,generatedAt:'2026-10-04T00:00:00Z'}});
const many=structuredClone(model);many.fields[0].layout.portions=Array.from({length:60},(_,i)=>({id:`synthetic-${i}`,label:`Porzione ${i+1} ${'etichetta lunga '.repeat(i%4)}`,mode:'local',orientationDeg:35+i/10,curved:i%2===1,maintainRowEquidistance:i%2===0}));
const wide=structuredClone(many);wide.fields[0].layout.portions[0].label='W'.repeat(1728)+'界'.repeat(120)+'🙂'.repeat(20);
const elbow=structuredClone(model);elbow.fields[0].geometry=[[8,44],[8.01,44],[8.01,44.003],[8.003,44.003],[8.003,44.01],[8,44.01],[8,44]];elbow.fields[0].rows=[];elbow.fields[0].exclusions=[];
const longtitle=structuredClone(model);longtitle.fields[0].label='Campo prova con nome deliberatamente più lungo per andare a capo '.repeat(2);longtitle.fields[0].notes='NOTA DOPO TUTTI I DATI';longtitle.fields[0].context.note='NOTA DOPO TUTTI I DATI';longtitle.fields[0].layout.portions=Array.from({length:3},(_,i)=>({id:`long-${i}`,label:`Porzione ${i+1}`,mode:'local',orientationDeg:35+i,curved:false}));
const denseFixtures=[100,150].map(count=>{const value=structuredClone(elbow);value.fields[0].label=`Campo con ${count} quote`;const ring=Array.from({length:count},(_,i)=>{const a=i*Math.PI*2/count;return [8+.006*Math.cos(a),44+.003*Math.sin(a)];});ring.push(ring[0]);value.fields[0].geometry=ring;return ['dense'+count,value];});
const cases=[['mixed',model],['many',many],['wide',wide],['elbow',elbow],['longtitle',longtitle],...denseFixtures];
const documents=new Map(),reports=[];
for(const [name,value] of cases){
 const html=`<!doctype html><html lang="it"><head><meta charset="utf-8"><link rel="stylesheet" href="/report.css"><link rel="stylesheet" href="/report-layout.css"><link rel="stylesheet" href="/fonts.css"><link rel="stylesheet" href="/report-print.css" media="print"></head><body>${renderProjectReportHtml(value)}</body></html>`;
 documents.set('/fixture-'+name+'.html',html);await writeFile(resolve(output,name+'.html'),html);
 const bytes=await buildProjectPdfBytes(value,{pdfLib:PDFLib,assetLoader:async path=>new Uint8Array(await readFile(resolve(root,path)))});
 await writeFile(resolve(output,'native-'+name+'.pdf'),bytes);
}
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');if(documents.has(url.pathname)){res.setHeader('Content-Type','text/html');res.end(documents.get(url.pathname));return;}
 const local=resolve(root,url.pathname.slice(1));if(!local.startsWith(root+'/'))throw new Error('Forbidden');
 res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.ttf':'font/ttf'})[extname(local)]||'application/octet-stream');res.end(await readFile(local));
 }catch{res.writeHead(404);res.end('Missing fixture');}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+server.address().port;let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.COUNTS_CHROMIUM_PATH||'/tmp/v126-chrome/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:1200,height:1100}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const [name,value] of cases){
  await page.goto(base+'/fixture-'+name+'.html');await page.emulateMedia({media:'print'});await page.evaluate(()=>document.fonts.ready);
  const bounds=await page.evaluate(()=>[...document.querySelectorAll('.document-portion-line')].map(node=>{const a=node.getBoundingClientRect(),p=node.closest('.report-page'),b=p.getBoundingClientRect(),footer=p.querySelector('.document-footer').getBoundingClientRect();return {bottom:a.bottom,footer:footer.top,left:a.left,right:a.right,pageLeft:b.left,pageRight:b.right,height:a.height,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth};}));
  assert.ok(bounds.length);for(const b of bounds){assert.ok(b.bottom<b.footer,'portion line clear of footer');assert.equal(b.height,18,'one actual line per chunk');assert.ok(b.scrollWidth<=b.clientWidth,'no horizontal clipping');assert.ok(b.left>=b.pageLeft&&b.right<=b.pageRight,'inside page');}
  const noteBounds=await page.evaluate(()=>[...document.querySelectorAll('.document-notes')].map(node=>({bottom:node.getBoundingClientRect().bottom,footer:node.closest('.report-page').querySelector('.document-footer').getBoundingClientRect().top})));
  for(const b of noteBounds)assert.ok(b.bottom<b.footer,'all field notes remain clear of footer');
  const fonts=await page.evaluate(()=>({document:getComputedStyle(document.querySelector('.report-document')).fontFamily,ui:getComputedStyle(document.body).fontFamily}));assert.ok(!fonts.document.includes('Comfortaa'));
  await page.pdf({path:resolve(output,'print-'+name+'.pdf'),preferCSSPageSize:true,printBackground:true});
  if(['mixed','elbow','longtitle','dense100','dense150'].includes(name)){await page.locator('.report-page').nth(1).screenshot({path:resolve(output,name+'-map.png')});await page.locator('.report-page').nth(2).screenshot({path:resolve(output,name+'-data.png')});}
  const old=buildReportMapModel({polygon:value.fields[0].geometry,width:1000,height:650,padding:62}),now=buildTechnicalReportMapModel(old),extent=m=>Math.max(...m.polygon.map(p=>p[1]))-Math.min(...m.polygon.map(p=>p[1]));
  if(!name.startsWith('dense'))assert.ok(extent(now)>extent(old),'ordinary technical parcel larger than previous native model');
  reports.push({name,portions:value.fields[0].layout.portions.length,htmlPages:await page.locator('.report-page').count(),fonts,technical:{width:now.width,height:now.height,oldHeight:extent(old),newHeight:extent(now),dimensions:now.annotations.length}});
 }
 assert.deepEqual(errors,[]);await writeFile(resolve(output,'summary.json'),JSON.stringify({passed:true,metrics:{rows:metrics.rowCount,plants:metrics.simulatedPlants,posts:metrics.totalPosts},reports,errors},null,2));console.log(JSON.stringify({passed:true,reports},null,2));await context.close();
}finally{await browser?.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
