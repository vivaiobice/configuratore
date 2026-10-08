import {terrainMeasureText,terrainUsesCertifiedQuantities,terrainRowCountText} from './terrain-report-summary.js?v=1.3.1';
import {hasPortionDesign,portionReportPages} from './row-portion-summary.js?v=1.3.1';
import { buildReportMapModel, buildTechnicalReportMapModel } from './report-map-model.js?v=1.3.1';
import {reportExclusionGeometry} from './report-satellite.js?v=1.3.1';
import { buildReportPdfFilename } from './report-filename.js?v=45';

const A4=[595.28,841.89];

function pdfText(value){
  return String(value??'').replace(/[’‘]/g,"'").replace(/[–—]/g,'-').replace(/•/g,'-')
    .replace(/[^\x20-\x7e\u00a0-\u00ff]/g,' ').trim();
}

async function defaultAssetLoader(path){
  const response=await fetch(path);
  return response.ok?new Uint8Array(await response.arrayBuffer()):null;
}

async function embeddedAsset(pdf,path,loader){
  try{const bytes=await loader(path);return bytes?await pdf.embedPng(bytes):null;}catch{return null;}
}

async function embeddedQr(pdf,svg,{documentRef=globalThis.document,imageFactory=()=>new Image()}={}){
  if(!String(svg??'').startsWith('<svg')||!documentRef?.createElement||typeof Image==='undefined')return null;
  try{
    const image=imageFactory();
    const loaded=new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});
    image.src=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await loaded;
    const canvas=documentRef.createElement('canvas');canvas.width=560;canvas.height=560;
    canvas.getContext('2d').drawImage(image,0,0,560,560);
    return await pdf.embedPng(canvas.toDataURL('image/png'));
  }catch{return null;}
}

function wrapped(page,value,{x,y,width,size=10,lineHeight=size*1.5,font,color,maxLines=20}={}){
  const words=pdfText(value).split(/\s+/).filter(Boolean);let line='',lines=0;
  const flush=()=>{if(!line)return;page.drawText(line,{x,y:y-lines*lineHeight,size,font,color});lines++;line='';};
  for(const word of words){
    const next=line?`${line} ${word}`:word;
    if(font.widthOfTextAtSize(next,size)>width&&line)flush();
    if(lines>=maxLines)break;
    if(font.widthOfTextAtSize(word,size)>width){
      let piece='';
      for(const letter of word){
        if(font.widthOfTextAtSize(piece+letter,size)>width&&piece){line=piece;flush();piece='';}
        piece+=letter;
      }
      line=piece;
    }else line=line?`${line} ${word}`:word;
  }
  if(line&&lines<maxLines)flush();
  return y-lines*lineHeight;
}

function line(page,label,value,x,y,width,fonts,colors){
  page.drawText(pdfText(label),{x,y,size:9,font:fonts.regular,color:colors.muted});
  const text=pdfText(value||'Da definire');
  const max=width*.54;let shown=text;
  while(shown.length>1&&fonts.bold.widthOfTextAtSize(shown,9)>max)shown=shown.slice(0,-1);
  if(shown!==text)shown=`${shown.slice(0,-1)}…`.replace('…','...');
  page.drawText(shown,{x:x+width-fonts.bold.widthOfTextAtSize(shown,9),y,size:9,font:fonts.bold,color:colors.ink});
  page.drawLine({start:{x,y:y-5},end:{x:x+width,y:y-5},color:colors.line,thickness:.5});
  return y-22;
}

function metricCard(page,label,value,{x,y,width=155,height=76},fonts,colors,{highlight=false}={}){
  page.drawRectangle({x,y,width,height,color:highlight?colors.green:colors.soft,borderColor:highlight?colors.green:colors.line,borderWidth:.6});
  wrapped(page,label,{x:x+13,y:y+height-22,width:width-26,size:9,lineHeight:11,font:fonts.regular,color:highlight?colors.white:colors.muted,maxLines:2});
  wrapped(page,String(value),{x:x+13,y:y+height-49,width:width-24,size:19,lineHeight:21,font:fonts.bold,color:highlight?colors.white:colors.green,maxLines:1});
}

function frame(pdf,model,index,total,images,fonts,colors){
  const page=pdf.addPage(A4),[width,height]=A4;
  if(images.watermark)page.drawImage(images.watermark,{x:127,y:235,width:340,height:340,opacity:.045});
  if(images.logo)page.drawImage(images.logo,{x:42,y:height-77,width:137.5,height:42});
  else page.drawText('VIVAI OBICE',{x:42,y:height-58,size:19,font:fonts.bold,color:colors.green});
  page.drawText('Studio preliminare di impianto viticolo',{x:345,y:height-55,size:9,font:fonts.regular,color:colors.green});
  page.drawLine({start:{x:42,y:height-87},end:{x:553,y:height-87},color:colors.green,thickness:1});
  page.drawLine({start:{x:42,y:48},end:{x:553,y:48},color:colors.line,thickness:.7});
  const company=model.company??{};
  wrapped(page,`${company.name||'VIVAI OBICE S.S.A.'} - ${company.address||''}\n${company.email||''} - ${company.phone||''} - P. IVA ${company.vat||''} - SDI ${company.sdi||''}`,{x:42,y:38,width:305,size:7,lineHeight:9,maxLines:3,font:fonts.regular,color:colors.muted});
  page.drawText(`Progetto ${pdfText(model.project?.code||'-')}  |  ${index} / ${total}`,{x:420,y:32,size:7,font:fonts.regular,color:colors.muted});
  return page;
}

function title(page,value,fonts,colors){
  return wrapped(page,value,{x:42,y:728,width:510,size:22,lineHeight:28,maxLines:3,font:fonts.bold,color:colors.green});
}

function technical(page,field,colors,fonts,sourceModel){
  const model=buildTechnicalReportMapModel(sourceModel,{fontSize:22,measureText:(label,size)=>fonts.bold.widthOfTextAtSize(pdfText(label),8*size/22)*1000/350});
  const box={x:122,y:69,w:350,h:227.5};
  page.drawRectangle({x:box.x,y:box.y,width:box.w,height:box.h,color:colors.soft});
  if(!model.valid)return;
  const point=([x,y])=>({x:box.x+x*box.w/model.width,y:box.y+box.h-y*box.h/model.height});
  const drawPath=(coordinates,color,thickness)=>{for(let i=1;i<coordinates.length;i++)page.drawLine({start:point(coordinates[i-1]),end:point(coordinates[i]),color,thickness});};
  drawPath(model.polygon,colors.green,2);
  for(const row of model.rows)drawPath(row.coordinates,colors.gold,.8);
  for(const area of model.exclusions){
    const geometry=reportExclusionGeometry(area),rings=geometry.type==='MultiPolygon'?geometry.coordinates.flat():geometry.coordinates;
    for(const ring of rings)drawPath(ring,colors.rust,1.3);
  }
  for(const {leader} of model.annotations)drawPath(leader,colors.green,.5);
  for(const annotation of model.annotations){
    const {x,y}=point(annotation.point),label=pdfText(annotation.label),w=annotation.box.width*box.w/model.width,h=annotation.box.height*box.h/model.height,size=8*annotation.fontSize/22;
    page.drawRectangle({x:x-w/2,y:y-h/2,width:w,height:h,color:colors.white,borderColor:colors.line,borderWidth:.4});
    page.drawText(label,{x:x-fonts.bold.widthOfTextAtSize(label,size)/2,y:y-size*.35,size,font:fonts.bold,color:colors.green});
  }
}

export async function buildProjectPdfBytes(model,{pdfLib=globalThis.PDFLib,assetLoader=defaultAssetLoader,documentRef=globalThis.document}={}){
  if(!model?.fields?.length||!pdfLib?.PDFDocument)throw new TypeError('Modello PDF o motore di stampa non disponibile.');
  // Validate grouped physical presentation before assets or any export work.
  const mapModels=model.fields.map(field=>buildReportMapModel({polygon:field.geometry,rows:field.rows,exclusions:field.exclusions,width:1000,height:650,padding:62}));
  const pdf=await pdfLib.PDFDocument.create();
  pdf.setTitle(buildReportPdfFilename({code:model.project?.code,recipient:model.recipient}).replace(/\.pdf$/i,''));
  pdf.setAuthor('Vivai Obice S.S.A.');
  const fonts={regular:await pdf.embedFont(pdfLib.StandardFonts.Helvetica),bold:await pdf.embedFont(pdfLib.StandardFonts.HelveticaBold)};
  const colors={green:pdfLib.rgb(.09,.24,.16),ink:pdfLib.rgb(.12,.18,.14),muted:pdfLib.rgb(.33,.39,.35),line:pdfLib.rgb(.79,.85,.8),soft:pdfLib.rgb(.93,.96,.93),gold:pdfLib.rgb(.53,.47,.27),rust:pdfLib.rgb(.56,.34,.28),white:pdfLib.rgb(1,1,1)};
  const images={logo:await embeddedAsset(pdf,'./assets/logo-vivai-obice-lineare.png',assetLoader),watermark:await embeddedAsset(pdf,'./assets/logo-filigrana.png',assetLoader),qr:await embeddedQr(pdf,model.qrSvg,{documentRef})};
  const hasOverview=/^data:image\/png;base64,/i.test(String(model.overview?.satelliteImage??''));
  const designs=model.fields.map(field=>portionReportPages(field.layout));
  const total=designs.reduce((n,pages)=>n+Math.max(0,pages.length-1),0)+2+(model.fields.length>1?1:0)+(hasOverview?1:0)+model.fields.length*2;let current=0;
  const add=()=>frame(pdf,model,++current,total,images,fonts,colors);
  let page=add();let y=title(page,model.title||'Progetto viticolo',fonts,colors)-20;
  y=wrapped(page,model.project?.name||'',{x:42,y,width:490,size:13,font:fonts.bold,color:colors.ink})-12;
  const meta=[['Codice progetto',model.project?.code||'-'],['Revisione',model.project?.revisionNumber??'-'],
    ['Campi',model.fields.length],['Data',new Date(model.project?.generatedAt||Date.now()).toLocaleDateString('it-IT')]];
  meta.forEach(([label,value],index)=>metricCard(page,label,value,
    {x:42+(index%2)*252,y:y-57-Math.floor(index/2)*63,width:238,height:54},fonts,colors));
  y-=153;
  page.drawRectangle({x:42,y:y-169,width:490,height:185,color:colors.soft});
  page.drawText('Destinatario',{x:54,y:y-8,size:11,font:fonts.bold,color:colors.green});
  y-=35;
  y=line(page,'Azienda',model.recipient?.companyName,54,y,466,fonts,colors);
  y=line(page,'Nome e cognome',[model.recipient?.firstName,model.recipient?.lastName].filter(Boolean).join(' '),54,y,466,fonts,colors);
  y-=3;
  page.drawText('Indirizzo',{x:54,y,size:9,font:fonts.regular,color:colors.muted});
  const recipientAddress=[model.recipient?.address,[model.recipient?.addressPostalCode,model.recipient?.addressCity,model.recipient?.addressProvince].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const addressBottom=wrapped(page,recipientAddress||'Da definire',{x:195,y,width:322,size:9,lineHeight:12,maxLines:3,font:fonts.bold,color:colors.ink});
  page.drawLine({start:{x:54,y:addressBottom-8},end:{x:520,y:addressBottom-8},color:colors.line,thickness:.5});
  const locality=`${model.recipient?.plantLocation||''}${model.recipient?.province?` (${model.recipient.province})`:''}`;
  y=line(page,'Località impianto',locality,54,addressBottom-28,466,fonts,colors);
  if(images.qr)page.drawImage(images.qr,{x:43,y:125,width:130,height:130});
  wrapped(page,model.disclaimer?.short||'',{x:190,y:246,width:350,size:10,font:fonts.regular,color:colors.muted,maxLines:8});

  if(model.fields.length>1){
    page=add();y=title(page,'Riepilogo dei campi',fonts,colors)-15;
    page.drawText('QUADRO GENERALE',{x:42,y:y+10,size:8,font:fonts.bold,color:colors.green});
    const listed=Math.min(model.fields.length,7);
    model.fields.slice(0,listed).forEach((field,index)=>{
      const rowY=y-25-index*36;
      page.drawRectangle({x:42,y:rowY-11,width:490,height:33,color:colors.soft});
      wrapped(page,field.label,{x:53,y:rowY+4,width:254,size:10,font:fonts.bold,color:colors.green,maxLines:1});
      const detail=field.terrain?.status==='invalid'?'Terreno non disponibile':`${field.metrics?.netAreaM2==null?'Non disponibile':Math.round(field.metrics.netAreaM2)} m² · ${field.metrics?.commercialPlants??'Non disponibile'} barbatelle`;
      wrapped(page,detail,{x:323,y:rowY+4,width:197,size:9,font:fonts.regular,color:colors.ink,maxLines:1});
    });
    if(model.fields.length>listed)page.drawText(`Altri ${model.fields.length-listed} campi nelle pagine seguenti`,{x:48,y:y-29-listed*36,size:9,font:fonts.regular,color:colors.muted});
    const cardsTop=y-70-listed*36;
    const s=model.summary??{};
    const summaryValue=value=>value===null?'Non disponibile':String(value||0);
    const summaryMeasure=(value,unit)=>value===null?'Non disponibile':`${Math.round(value||0)} ${unit}`;
    const cards=[['Campi',model.fields.length],['Superficie netta',summaryMeasure(s.netAreaM2,'m²')],['Filari',summaryValue(s.rowCount)],
      ['Metri lineari',summaryMeasure(s.rowLinearM,'m')],['Quantità commerciale',summaryValue(s.commercialPlants)],['Barbatelle calcolate',summaryValue(s.calculatedPlants)],['Pali totali',summaryValue(s.totalPosts)]];
    cards.forEach(([label,value],index)=>{
      const column=index%3,row=Math.floor(index/3);
      metricCard(page,label,value,{x:42+column*168,y:cardsTop-row*89,width:154,height:75},fonts,colors,{highlight:index===4});
    });
  }

  if(hasOverview){
    page=add();title(page,'Visione aerea generale',fonts,colors);
    page.drawText(`${model.fields.length} campi selezionati${model.overview.cadastre?' · Livello Catasto 60%':''}`,{x:42,y:692,size:10,font:fonts.regular,color:colors.muted});
    const overview=await pdf.embedPng(model.overview.satelliteImage);
    page.drawImage(overview,{x:42,y:340,width:511,height:332.15});
    wrapped(page,model.overview.mapAttribution||'Imagery © Esri',{x:42,y:325,width:511,size:8,lineHeight:10,font:fonts.regular,color:colors.muted,maxLines:3});
  }

  for(const [fieldIndex,field] of model.fields.entries()){
    page=add();y=title(page,field.label,fonts,colors)-12;
    const fieldPlace=[field.location?.municipality,field.location?.province?`(${field.location.province})`:null].filter(Boolean).join(' ');
    if(fieldPlace)page.drawText(pdfText(fieldPlace),{x:50,y:y+1,size:9,font:fonts.regular,color:colors.muted});
    y-=14;
    page.drawText('Mappa satellitare e filari',{x:50,y,size:12,font:fonts.bold,color:colors.ink});
    if(/^data:image\/png;base64,/i.test(String(field.satelliteImage??''))){
      const satellite=await pdf.embedPng(field.satelliteImage);
      page.drawImage(satellite,{x:50,y:345,width:495,height:321.75});
    }else page.drawText('Immagine satellitare non disponibile',{x:50,y:510,size:12,font:fonts.regular,color:colors.muted});
    page.drawText(pdfText(field.mapAttribution||'Imagery © Esri'),{x:50,y:333,size:8,font:fonts.regular,color:colors.muted});
    page.drawText('Schema tecnico',{x:50,y:315,size:12,font:fonts.bold,color:colors.ink});
    technical(page,field,colors,fonts,mapModels[fieldIndex]);

    page=add();y=title(page,`Dati - ${field.label}`,fonts,colors)-26;
    const m=field.metrics??{},l=field.layout??{},p=field.plantMaterial??{};
    const terrain=field.terrain,unavailable=terrain?.status==='invalid';
    const measured=value=>unavailable||value===null||value===undefined?'Non disponibile':String(Math.round(value));
    const count=value=>unavailable||value===null||value===undefined?'Non disponibile':String(value);
    if(terrain)y=wrapped(page,terrainMeasureText(terrain),{x:50,y,width:485,size:9,lineHeight:12,font:fonts.regular,color:colors.muted,maxLines:2})-12;
    const left=[[terrain?'Sup. lorda orizzontale':'Superficie lorda',`${measured(m.grossAreaM2)} m²`],[terrain?'Sup. netta orizzontale':'Superficie netta',`${measured(m.netAreaM2)} m²`],...(terrain?.status==='applied'?[['Superficie sul terreno',`${measured(terrain.surfaceAreaM2)} m²`],['Sup. netta sul terreno',`${measured(terrain.surfaceNetAreaM2)} m²`]]:[]),['Perimetro',`${measured(m.perimeterM)} m`],['Distanza piante',`${l.plantSpacingM??'-'} m`],['Distanza filari',`${l.rowSpacingM??'-'} m`],...(!hasPortionDesign(l)?[['Orientamento',`${l.orientationDeg??'-'}°`],['Curvatura',l.portions?.[0]?.curved?'Curvi':'Rettilinei']]:[]),['Capezzagna',`${l.headlandWidthM??'-'} m`],['Filari',terrainRowCountText(terrain,m.rowCount,count)],[terrain?.status==='applied'?(terrainUsesCertifiedQuantities(terrain)?'Metri per quantità':'Metri sul terreno'):'Metri lineari',`${measured(m.rowLinearM)} m`],...(terrain?.status==='applied'?[...(terrainUsesCertifiedQuantities(terrain)?[['Metri sul terreno',`${measured(terrain.surfaceRowLinearM)} m`]]:[]),['Metri orizzontali',`${measured(terrain.horizontalRowLinearM)} m`]]:[])];
    const right=[['Quantità commerciale',count(m.commercialPlants)],['Barbatelle calcolate',count(m.calculatedPlants)],['Pali intermedi',count(m.intermediatePosts)],['Pali di testa',count(m.headPosts)],['Pali totali',count(m.totalPosts)],['Vitigno',p.grapeVariety],['Clone / selezione',p.cloneSelection],['Portinnesto',p.rootstock],['Altezza barbatella',`${p.plantHeightCm===60?60:40} cm`],['Annata impianto',String(field.plantingYear??'-')],['Vendemmia meccanizzata',l.mechanizedHarvest?'Sì':'No']];
    page.drawText('Geometria e filari',{x:50,y,size:12,font:fonts.bold,color:colors.green});
    page.drawText('Materiale e quantità',{x:310,y,size:12,font:fonts.bold,color:colors.green});
    left.forEach(([label,value],index)=>line(page,label,value,50,y-27-index*24,235,fonts,colors));
    right.forEach(([label,value],index)=>line(page,label,value,310,y-27-index*24,235,fonts,colors));
    const inlinePortions=designs[fieldIndex][0]??[];
    inlinePortions.forEach((text,index)=>page.drawText(pdfText(text),{x:50,y:y-27-left.length*24-index*15,size:10,font:fonts.regular,color:colors.ink}));
    const tableBottom=y-27-(Math.max(left.length,right.length)-1)*24-5;
    const portionBottom=inlinePortions.length?y-27-left.length*24-(inlinePortions.length-1)*15-3:tableBottom;
    const notesY=Math.min(tableBottom,portionBottom)-30;
    wrapped(page,`Inquadramento: ${field.context?.label||'Da definire'}   Riferimento / note: ${field.context?.note||field.notes||'Nessuna nota.'}`,{x:50,y:notesY,width:485,size:10,font:fonts.regular,color:colors.ink,maxLines:9});
    for(const lines of designs[fieldIndex].slice(1)){
      page=add();y=title(page,`Dati - ${field.label}`,fonts,colors)-26;
      page.drawText('Geometria e filari',{x:50,y,size:11,font:fonts.bold,color:colors.green});
      lines.forEach((text,index)=>{if(text)page.drawText(pdfText(text),{x:50,y:y-28-index*15,size:10,font:fonts.regular,color:colors.ink});});
    }

  }
  page=add();y=title(page,'Avvertenze e consultazione',fonts,colors)-28;
  wrapped(page,model.disclaimer?.full||'',{x:50,y,width:485,size:11,lineHeight:18,font:fonts.regular,color:colors.ink,maxLines:21});
  if(images.qr)page.drawImage(images.qr,{x:50,y:166,width:132,height:132});
  page.drawText(pdfText(`ID progetto: ${model.project?.code||'-'}`),{x:205,y:250,size:12,font:fonts.bold,color:colors.green});
  wrapped(page,'Il QR apre questa versione del progetto. Il codice apre l\'ultima versione disponibile.',{x:205,y:222,width:330,size:10,font:fonts.regular,color:colors.muted,maxLines:4});
  return pdf.save();
}

export async function downloadProjectPdf(model,{pdfLib=globalThis.PDFLib,assetLoader,documentRef=globalThis.document,urlApi=globalThis.URL,delayCleanup=(fn)=>setTimeout(fn,60_000)}={}){
  const bytes=await buildProjectPdfBytes(model,{pdfLib,assetLoader,documentRef});
  const filename=buildReportPdfFilename({code:model.project?.code,recipient:model.recipient});
  const url=urlApi.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  const anchor=documentRef.createElement('a');anchor.href=url;anchor.download=filename;
  documentRef.body.append(anchor);anchor.click();anchor.remove();
  delayCleanup(()=>urlApi.revokeObjectURL(url));
  return filename;
}
