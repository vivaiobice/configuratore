import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildProjectPdfBytes,downloadProjectPdf} from '../src/report-pdf-download.js';

const require=createRequire(import.meta.url);
const PDFLib=require(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/pdf-lib`);
const sample={
  title:'Studio preliminare ed esemplificativo di impianto viticolo',
  company:{name:'VIVAI OBICE S.S.A.',address:'Via Esempio 1, 10000 Borgo (CN)',email:'info@example.it',phone:'000 000',vat:'00000000000',sdi:'ABCDEFG'},
  project:{name:'Impianto di prova',code:'VO-1234567',revisionNumber:2,documentId:'R-2',generatedAt:'2026-09-24T09:00:00Z'},
  recipient:{firstName:'Mario',lastName:'Rossi',address:'Via Campi 2, Borgo',plantLocation:'Borgo',province:'CN'},
  fields:[{id:'field-1',label:'Campo A',geometry:[[8,44],[8.001,44],[8.001,44.001],[8,44.001],[8,44]],rows:[],exclusions:[],layout:{plantSpacingM:1,rowSpacingM:2.5,orientationDeg:20,headlandWidthM:6},plantMaterial:{grapeVariety:'Vitigno A',cloneSelection:'Clone A',rootstock:'Portainnesto A',plantHeightCm:40},metrics:{grossAreaM2:500,netAreaM2:400,perimeterM:95,rowCount:8,rowLinearM:220,calculatedPlants:220,commercialPlants:225,totalPosts:55}}],
  summary:{fieldCount:1,netAreaM2:400,commercialPlants:225},
  disclaimer:{short:'Simulazione preliminare.',full:'Verificare i dati sul posto.'}
};

test('download generator produces a real A4 PDF with a separate map and data page',async()=>{
  const bytes=await buildProjectPdfBytes(sample,{pdfLib:PDFLib,assetLoader:async()=>null});
  assert.equal(new TextDecoder().decode(bytes.slice(0,5)),'%PDF-');
  const document=await PDFLib.PDFDocument.load(bytes);
  assert.equal(document.getPageCount(),4);
  assert.ok(document.getPages().every(page=>Math.abs(page.getWidth()-595.28)<1));
});

test('downloaded two-field PDF has a distinct summary card for every preview metric',async()=>{
  const bytes=await buildProjectPdfBytes({...sample,fields:[...sample.fields,{...sample.fields[0],id:'field-2',label:'Campo B'}],summary:{fieldCount:2,netAreaM2:800,rowCount:16,rowLinearM:440,commercialPlants:450,calculatedPlants:440,totalPosts:110}},
    {pdfLib:PDFLib,assetLoader:async()=>null});
  const pdfjs=await import(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/pdfjs-dist/legacy/build/pdf.mjs`);
  const document=await pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
  assert.equal(document.numPages,7);
  const content=(await (await document.getPage(2)).getTextContent()).items.map(item=>item.str).join(' ');
  for(const label of ['Campi','Superficie netta','Filari','Metri lineari','Quantità commerciale','Barbatelle calcolate','Pali totali'])assert.ok(content.includes(label),label);
});

test('cover address and locality have separate lines even when the address wraps',async()=>{
  const pdfjs=await import(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/pdfjs-dist/legacy/build/pdf.mjs`);
  const bytes=await buildProjectPdfBytes({...sample,recipient:{...sample.recipient,address:'Via dei Filari 123, frazione con un indirizzo di prova molto lungo che va su più righe',addressCity:'Borgo',addressProvince:'CN',plantLocation:'Altro comune'}},
    {pdfLib:PDFLib,assetLoader:async()=>null});
  const items=(await (await (await pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise).getPage(1)).getTextContent()).items;
  const address=items.find(item=>item.str.includes('Via dei Filari'));
  const locality=items.find(item=>item.str==='Località impianto');
  assert.ok(address&&locality);
  assert.ok(address.transform[5]-locality.transform[5]>=35,'la località deve avere spazio dopo l’indirizzo');
});

test('downloaded front cover presents the project code, revision, field count and date as in preview',async()=>{
  const pdfjs=await import(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/pdfjs-dist/legacy/build/pdf.mjs`);
  const bytes=await buildProjectPdfBytes(sample,{pdfLib:PDFLib,assetLoader:async()=>null});
  const content=(await (await (await pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise).getPage(1)).getTextContent()).items.map(item=>item.str).join(' ');
  for(const label of ['Codice progetto','VO-1234567','Revisione','Campi','Data','Destinatario'])assert.ok(content.includes(label),label);
});

test('browser download sets the exact public filename on the anchor',async()=>{
  const log=[];
  const documentRef={body:{append(node){log.push(['append',node.download]);}},createElement(){return {click(){log.push(['click',this.download]);},remove(){log.push(['remove']);}}}};
  const urlApi={createObjectURL(){return 'blob:test';},revokeObjectURL(){log.push(['revoke']);}};
  await downloadProjectPdf(sample,{pdfLib:PDFLib,assetLoader:async()=>null,documentRef,urlApi,delayCleanup:(fn)=>fn()});
  assert.deepEqual(log[0],['append','Progetto_VO1234567_MarioRossi.pdf']);
  assert.deepEqual(log[1],['click','Progetto_VO1234567_MarioRossi.pdf']);
});

test('download includes the annotated satellite overview as an image page',async()=>{
  const pdfjs=await import(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/pdfjs-dist/legacy/build/pdf.mjs`);
  const overview={satelliteImage:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=',mapAttribution:'Imagery © Esri · Catasto © Agenzia delle Entrate, CC BY 4.0',cadastre:true};
  const bytes=await buildProjectPdfBytes({...sample,overview,fields:[sample.fields[0],{...sample.fields[0],id:'field-2',label:'Campo B'}]},{pdfLib:PDFLib,assetLoader:async()=>null});
  const document=await pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
  assert.equal(document.numPages,8,'the overview gets its own page without squeezing existing content');
  const page=await document.getPage(3);
  const content=(await page.getTextContent()).items.map(item=>item.str).join(' ');
  assert.match(content,/Visione aerea generale/);
  assert.match(content,/Catasto/);
  assert.ok((await page.getOperatorList()).fnArray.includes(pdfjs.OPS.paintImageXObject),'the PDF embeds the same labelled overview PNG as the preview');
});

test('native PDF paginates all portion designs without notes overlap or stale global direction',async()=>{
 const portions=Array.from({length:60},(_,index)=>({id:`p-${index}`,label:`Porzione ${index+1} ${'etichetta lunga '.repeat(index%4)}`,mode:'local',orientationDeg:35+index/10,curved:index%2===1,maintainRowEquidistance:index%2===0}));
 const field={...sample.fields[0],layout:{...sample.fields[0].layout,portions,orientationDeg:86.5},notes:'NOTA RISERVATA AL CAMPO'};
 const bytes=await buildProjectPdfBytes({...sample,fields:[field]},{pdfLib:PDFLib,assetLoader:async()=>null});
 const pdfjs=await import(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/pdfjs-dist/legacy/build/pdf.mjs`);
 const doc=await pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
 const pages=[];for(let i=1;i<=doc.numPages;i++)pages.push((await (await doc.getPage(i)).getTextContent()).items);
 const content=pages.flat().map(item=>item.str).join(' ');
 for(let i=1;i<=60;i++)assert.ok(content.includes(`Porzione ${i}`),`portion ${i} retained`);
 assert.doesNotMatch(content,/86[,.]5°/);assert.match(content,/Rettilinei/);assert.match(content,/Curvi/);
 assert.ok(doc.numPages>4);
 for(const items of pages){
  const designs=items.filter(item=>item.str.includes('°')||item.str.includes('Porzione'));
  for(const item of designs)assert.ok(item.transform[5]>65&&item.transform[5]<740,'portion text stays inside printable body');
  const note=items.find(item=>item.str.includes('NOTA RISERVATA'));
  if(note&&designs.length)assert.ok(Math.min(...designs.map(item=>item.transform[5]))-note.transform[5]>20,'inline designs remain clear of notes');
  if(designs.length)assert.ok(items.some(item=>item.str==='Geometria e filari'),'overflow stays part of geometry data');
 }
 const last=pages.at(-1).map(item=>item.str).join(' ');assert.ok(last.includes(`${doc.numPages} / ${doc.numPages}`),'truthful footer page count');
});


test('native PDF integrates ordinary portion direction and curve inside the existing geometry data page',async()=>{
 const portions=[{label:'Porzione A',mode:'local',orientationDeg:35,curved:false},{label:'Porzione B',mode:'local',orientationDeg:105,curved:true,maintainRowEquidistance:false}];
 const bytes=await buildProjectPdfBytes({...sample,fields:[{...sample.fields[0],layout:{...sample.fields[0].layout,portions,orientationDeg:86.5}}]},{pdfLib:PDFLib,assetLoader:async()=>null});
 const pdfjs=await import(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/pdfjs-dist/legacy/build/pdf.mjs`);
 const doc=await pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
 assert.equal(doc.numPages,4);const text=(await (await doc.getPage(3)).getTextContent()).items.map(item=>item.str).join(' ');
 for(const label of ['Geometria e filari','Porzione A','35,0°','Rettilinei','Porzione B','105,0°','Curvi'])assert.ok(text.includes(label),label);
 assert.doesNotMatch(text,/Equidistan|Orientamento e curvatura|86[,.]5°/);
});
test('native PDF prints the effective inherited curve status beside the global direction',async()=>{
 const field={...sample.fields[0],layout:{...sample.fields[0].layout,portions:[{label:'Campo',mode:'inherited',orientationDeg:20,curved:true}]}};
 const bytes=await buildProjectPdfBytes({...sample,fields:[field]},{pdfLib:PDFLib,assetLoader:async()=>null});
 const pdfjs=await import(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/pdfjs-dist/legacy/build/pdf.mjs`),doc=await pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
 const text=(await (await doc.getPage(3)).getTextContent()).items.map(item=>item.str).join(' ');assert.match(text,/Orientamento\s+20°/);assert.match(text,/Curvatura\s+Curvi/);assert.equal(doc.numPages,4);
});

test('wrapped field titles keep six inline portion lines clear of notes',async()=>{
 const portions=Array.from({length:3},(_,i)=>({label:`Porzione ${i+1}`,mode:'local',orientationDeg:35+i,curved:false}));
 const label='Campo prova con nome deliberatamente più lungo per andare a capo '.repeat(2);
 const field={...sample.fields[0],label,layout:{...sample.fields[0].layout,portions},notes:'NOTA DOPO TUTTI I DATI'};
 const bytes=await buildProjectPdfBytes({...sample,fields:[field]},{pdfLib:PDFLib,assetLoader:async()=>null});
 const pdfjs=await import(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/pdfjs-dist/legacy/build/pdf.mjs`),doc=await pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
 const items=(await (await doc.getPage(3)).getTextContent()).items;
 assert.ok(items.filter(item=>item.height>20).length>=2,'fixture title actually wraps');
 const designs=items.filter(item=>item.str.includes('Porzione')||item.str.includes('Rettilinei'));
 assert.equal(designs.length,6,'all three portions stay inline');
 const notes=items.find(item=>item.str.includes('NOTA DOPO TUTTI'));
 assert.ok(notes);assert.ok(Math.min(...designs.map(item=>item.transform[5]))-notes.transform[5]>=20,'notes follow the actual lowest portion line');
 assert.ok(notes.transform[5]>65,'notes remain above the footer');
});

test('native PDF retains all 150 dense perimeter quotes inside the unchanged technical panel',async()=>{
 const geometry=Array.from({length:150},(_,i)=>{const a=i*Math.PI/75;return [8+.006*Math.cos(a),44+.003*Math.sin(a)];});geometry.push(geometry[0]);
 const bytes=await buildProjectPdfBytes({...sample,fields:[{...sample.fields[0],geometry}]},{pdfLib:PDFLib,assetLoader:async()=>null});
 const pdfjs=await import(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/pdfjs-dist/legacy/build/pdf.mjs`),doc=await pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
 const quotes=(await (await doc.getPage(2)).getTextContent()).items.filter(item=>/^\d+ m$/.test(item.str));
 assert.equal(quotes.length,150);
 for(const [i,item] of quotes.entries()){
  const x=item.transform[4],y=item.transform[5];
  assert.equal(item.height,8,'feasible dense fixture keeps the previous 8pt dimension font');
  assert.ok(x>=122&&x+item.width<=472&&y>=69&&y+item.height<=296.5,'full text inside technical panel');
  for(const other of quotes.slice(i+1)){const ox=other.transform[4],oy=other.transform[5];assert.ok(x+item.width<=ox||ox+other.width<=x||y+item.height<=oy||oy+other.height<=y,'actual PDF quote text does not overlap');}
 }
});
