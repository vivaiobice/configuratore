// Anonymous certified and mixed terrain quantity/ground PDF layout QA.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appliedTerrainField} from '../tests/fixtures/terrain-field.mjs';
import {fromUTM} from '../src/coordinate-system.js';
import {fieldSummaryMetrics} from '../src/project-summary.js';
import {buildProjectReportModel} from '../src/pdf-model.js';
import {renderProjectReportHtml} from '../src/report-template.js';
import {buildSharedPrintModel} from '../src/shared-project.js';
import {buildProjectPdfBytes} from '../src/report-pdf-download.js';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const pdfLib=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/pdf-lib');
const root=resolve(new URL('../',import.meta.url).pathname);
const output=resolve(process.env.TERRAIN_QUANTITY_LAYOUT_OUTPUT??'/tmp/v130-final-quantity-layout');
await mkdir(output,{recursive:true});
const cut={id:'split',type:'linear',widthM:1.5,geometry:[[18.25,0],[19.75,0],[19.75,40],[18.25,40],[18.25,0]].map(([x,y])=>fromUTM([500000+x,5000000+y],32632))};
const fixtures=[
 {name:'flat',...appliedTerrainField(()=>0,{rowSpacingM:1}),basis:'certified-flat-legacy',quantity:1602,copy:'Quantità del disegno conservate'},
 {name:'mixed',...appliedTerrainField(x=>x<=20?0:(x-20)/2,{rowSpacingM:1,exclusions:[cut]}),basis:'mixed-certified-bases',quantity:1601,copy:'Quantità in parte conservate'}
];
const styleFiles=[['report.css','all'],['report-print.css','print'],['report-layout.css','all'],['report-preview.css','screen'],['v55.2-report.css','screen'],['v55.7-report.css','all'],['v1.0.1-report.css','screen'],['v1.0.1-report-print.css','print'],['fonts.css','all']];
const documents=new Map();
const reports=[];
const assetLoader=async path=>new Uint8Array(await readFile(resolve(root,path)));
for(const fixture of fixtures){
 const {name,field,result,basis,quantity}=fixture;
 const projectCode=name==='flat'?'VO-1234567':'VO-1234568';
 const model=buildProjectReportModel({state:{project:{fields:[field]}},getMetrics:fieldSummaryMetrics,report:{projectCode,generatedAt:'2026-10-04T00:00:00Z',revisionNumber:1}});
 const shared=buildSharedPrintModel({projectName:'Certified',projectCode,fields:[field],createdAt:'2026-10-04T00:00:00Z',revisionNumber:1});
 assert.equal(model.fields[0].terrain.quantityBasis,basis);
 assert.equal(model.fields[0].terrain.surfaceRowLinearM,result.surfaceRowLinearM);
 assert.equal(Math.round(model.fields[0].metrics.rowLinearM),quantity);
 await writeFile(resolve(output,name+'-model.json'),JSON.stringify({result,model,shared},null,2));
 for(const [kind,docModel] of [['project',model],['shared-print',shared]]){
  const route='/'+name+'-'+kind;
  const html='<!doctype html><html lang="it"><head><meta charset="utf-8">'+styleFiles.map(([file,media])=>`<link rel="stylesheet" href="/${file}" media="${media}">`).join('')+'</head><body>'+renderProjectReportHtml(docModel)+'</body></html>';
  documents.set(route,{html,fixture});
  await writeFile(resolve(output,route.slice(1)+'.html'),html);
 }
 const nativePath=resolve(output,name+'-native.pdf');
 await writeFile(nativePath,await buildProjectPdfBytes(model,{pdfLib,assetLoader}));
 const nativeText=execFileSync('pdftotext',['-layout',nativePath,'-'],{encoding:'utf8'});
 const nativeFonts=execFileSync('pdffonts',[nativePath],{encoding:'utf8'});
 assert.match(nativeText,new RegExp('Metri per quantità\\s+'+quantity+' m'));
 assert.match(nativeText,/Metri sul terreno\s+1600 m/);
 assert.ok(nativeText.includes(fixture.copy));
 assert.match(nativeText,/DTM anonimo.*5 m.*Epoca 2019/);
 assert.match(nativeFonts,/Helvetica/);
 assert.doesNotMatch(nativeFonts,/Comfortaa/);
 await writeFile(resolve(output,name+'-native.txt'),nativeText);
 await writeFile(resolve(output,name+'-native-fonts.txt'),nativeFonts);
 execFileSync('pdftoppm',['-f','3','-l','3','-r','110','-png','-singlefile',nativePath,resolve(output,name+'-native-data')]);
}
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(documents.has(path)){res.setHeader('Content-Type','text/html');res.end(documents.get(path).html);return;}
 const local=resolve(root,path.slice(1));if(!local.startsWith(root+'/'))throw new Error('Forbidden');
 res.setHeader('Content-Type',({'.css':'text/css','.png':'image/png','.ttf':'font/ttf'})[extname(local)]||'application/octet-stream');res.end(await readFile(local));
}catch{res.writeHead(404);res.end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.COUNTS_CHROMIUM_PATH??'/tmp/v126-chrome/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1200,height:1100}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 for(const [route,{fixture}] of documents){
  await page.goto('http://127.0.0.1:'+server.address().port+route);
  await page.emulateMedia({media:'print'});
  await page.evaluate(()=>document.fonts.ready);
  const metrics=await page.evaluate(()=>[...document.querySelectorAll('.document-field-data')].map(data=>{
   const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,right:r.right,bottom:r.bottom,left:r.left};};
   const reportPage=data.closest('.report-page'),footer=reportPage.querySelector('.document-footer');
   return {body:rect(data),footer:rect(footer),page:rect(reportPage),font:getComputedStyle(data).fontFamily,basis:data.querySelector('.document-terrain-measures')?.textContent,
    rows:[...data.querySelectorAll('.document-data-row')].map(row=>({label:row.querySelector('span').textContent,value:row.querySelector('strong').textContent,labelRect:rect(row.querySelector('span')),valueRect:rect(row.querySelector('strong')),font:getComputedStyle(row).fontFamily})),
    clipped:[...data.querySelectorAll('*')].filter(node=>node.clientWidth>0&&node.scrollWidth>node.clientWidth+1).map(node=>({tag:node.tagName,className:node.className,text:node.textContent}))};
  }));
  assert.equal(metrics.length,1);
  for(const m of metrics){
   assert.ok(m.body.bottom<m.footer.top,route+' data stays above footer');
   assert.match(m.font,/Inter/);assert.doesNotMatch(m.font,/Comfortaa/);
   assert.ok(m.basis.includes(fixture.copy));
   for(const row of m.rows){assert.ok(row.labelRect.right<=row.valueRect.left+1,route+' '+row.label+' has no label/value overlap');assert.doesNotMatch(row.font,/Comfortaa/);}
   assert.deepEqual(m.clipped,[]);
   const rowValue=label=>m.rows.find(row=>row.label===label)?.value;
   assert.equal(rowValue('Metri lineari per quantità').replace(/[^0-9]/g,''),String(fixture.quantity));
   assert.equal(rowValue('Metri lineari sul terreno').replace(/[^0-9]/g,''),'1600');
  }
  const text=await page.locator('.report-document').innerText();
  assert.doesNotMatch(text,/1\.3\.0|certified-flat-legacy|mixed-certified-bases/);
  const dataPage=page.locator('.report-page').filter({has:page.locator('.document-field-data')});
  await dataPage.screenshot({path:resolve(output,route.slice(1)+'-data.png')});
  const path=resolve(output,route.slice(1)+'-browser.pdf');
  await page.pdf({path,preferCSSPageSize:true,printBackground:true});
  const info=execFileSync('pdfinfo',[path],{encoding:'utf8'});
  const pageCount=await page.locator('.report-page').count();
  assert.match(info,new RegExp('Pages:\\s+'+pageCount+'\\b'));
  execFileSync('pdftoppm',['-f','3','-l','3','-r','110','-png','-singlefile',path,resolve(output,route.slice(1)+'-browser-data')]);
  reports.push({route,pageCount,metrics});
 }
 assert.deepEqual(errors,[]);
 const hashes={};for(const file of ['src/pdf-model.js','src/report-template.js','src/terrain-report-summary.js','src/shared-project.js','src/report-pdf-download.js'])hashes[file]=createHash('sha256').update(await readFile(resolve(root,file))).digest('hex');
 const summary={passed:true,fixtures:fixtures.map(({name,basis,quantity,result})=>({name,basis,quantityMetres:quantity,groundMetres:result.surfaceRowLinearM,horizontalMetres:result.horizontalRowLinearM})),reports,errors,hashes};
 await writeFile(resolve(output,'summary.json'),JSON.stringify(summary,null,2));
 console.log(JSON.stringify({passed:true,output,fixtures:summary.fixtures,reports:reports.map(({route,pageCount,metrics})=>({route,pageCount,font:metrics[0].font,basis:metrics[0].basis,footerGapPx:metrics[0].footer.top-metrics[0].body.bottom})),errors},null,2));
}finally{await browser?.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
