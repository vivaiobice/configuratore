// Anonymous frozen-model report fixtures, served locally; no live service writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {appliedTerrainField} from '../tests/fixtures/terrain-field.mjs';
import {fieldSummaryMetrics} from '../src/project-summary.js';
import {buildProjectReportModel} from '../src/pdf-model.js';
import {renderProjectReportHtml} from '../src/report-template.js';
import {buildTerrainProposal} from '../src/terrain-design.js';
import {buildProjectPdfBytes} from '../src/report-pdf-download.js';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const root=resolve(new URL('../',import.meta.url).pathname),output=process.env.COUNTS_BROWSER_OUTPUT||'/tmp/v130-task5-terrain-report';await mkdir(output,{recursive:true});
const {field}=appliedTerrainField(),documents=new Map();
const {field:reference}=appliedTerrainField(x=>x/5,{orientationDeg:45});
const automatic=buildTerrainProposal({project:{...reference,terrain:null,rowPortions:[]},model:reference.terrain.model,followTerrain:true});
assert.equal(automatic.ok,true,automatic.message);
const automaticField={...reference,rowPortions:automatic.rowPortions,terrain:automatic.terrain};
const styles=[...(await readFile(resolve(root,'report.html'),'utf8')).matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*>/g)].map(match=>match[0]).join('');
for(const [name,fields] of [['applied',[field]],['invalid',[{...field,id:'invalid',plantSpacingM:2},field]],['automatic',[automaticField]]]){
 const model=buildProjectReportModel({state:{project:{fields}},getMetrics:fieldSummaryMetrics});
 const html=`<!doctype html><html lang="it"><head><meta charset="utf-8">${styles}</head><body>${renderProjectReportHtml(model)}</body></html>`;
 documents.set('/'+name,html);await writeFile(resolve(output,name+'.html'),html);
 if(name==='automatic'){
  const pdfLib=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/pdf-lib');
  const path=resolve(output,'automatic-native.pdf');
  await writeFile(path,await buildProjectPdfBytes(model,{pdfLib,assetLoader:async file=>new Uint8Array(await readFile(resolve(root,file)))}));
  const text=execFileSync('pdftotext',['-layout',path,'-'],{encoding:'utf8'});
  assert.match(text,/Guida\s+dal\s+terreno/);assert.doesNotMatch(text,/45[,.]0?°|Rettilinei|Equidistanza/);
  execFileSync('pdftoppm',['-f','3','-l','3','-r','100','-png','-singlefile',path,resolve(output,'automatic-native-data')]);
 }
}
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;if(documents.has(path)){res.setHeader('Content-Type','text/html');res.end(documents.get(path));return;}
 const local=resolve(root,path.slice(1));if(!local.startsWith(root+'/'))throw new Error('Forbidden');res.setHeader('Content-Type',({'.css':'text/css','.png':'image/png','.ttf':'font/ttf'})[extname(local)]||'application/octet-stream');res.end(await readFile(local));
}catch{res.writeHead(404);res.end();}});await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;const reports=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.COUNTS_CHROMIUM_PATH||'/tmp/v126-chrome/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1200,height:1100}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const name of documents.keys()){
  await page.goto('http://127.0.0.1:'+server.address().port+name);await page.emulateMedia({media:'print'});await page.evaluate(()=>document.fonts.ready);
  const measurements=await page.evaluate(()=>[...document.querySelectorAll('.document-field-data')].map(data=>{const body=data.getBoundingClientRect(),footer=data.closest('.report-page').querySelector('.document-footer').getBoundingClientRect();return {bottom:body.bottom,footer:footer.top,font:getComputedStyle(data).fontFamily};}));
  for(const m of measurements){assert.ok(m.bottom<m.footer,`${name} data stays above footer`);assert.ok(!m.font.includes('Comfortaa'));}
  assert.match(await page.locator('.report-document').innerText(),/Lunghezze sul terreno/);
  if(name==='/invalid')assert.match(await page.locator('.report-document').innerText(),/Terreno non disponibile/);
  if(name==='/automatic'){const text=await page.locator('.report-document').innerText();assert.match(text,/Guida\s+dal\s+terreno/);assert.doesNotMatch(text,/45[,.]0?°|Rettilinei|Equidistanza/);}
  await page.pdf({path:resolve(output,name.slice(1)+'.pdf'),preferCSSPageSize:true,printBackground:true});reports.push({name,measurements,pages:await page.locator('.report-page').count()});
 }
 assert.deepEqual(errors,[]);await writeFile(resolve(output,'summary.json'),JSON.stringify({passed:true,reports,errors},null,2));console.log(JSON.stringify({passed:true,reports,errors},null,2));
}finally{await browser?.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
