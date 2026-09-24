import { buildReportMapModel } from './report-map-model.js?v=45';
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

function frame(pdf,model,index,total,images,fonts,colors){
  const page=pdf.addPage(A4),[width,height]=A4;
  if(images.watermark)page.drawImage(images.watermark,{x:127,y:235,width:340,height:340,opacity:.045});
  if(images.logo)page.drawImage(images.logo,{x:42,y:height-77,width:137.5,height:42});
  else page.drawText('VIVAI OBICE',{x:42,y:height-58,size:19,font:fonts.bold,color:colors.green});
  page.drawText('Studio preliminare di impianto viticolo',{x:345,y:height-55,size:9,font:fonts.regular,color:colors.green});
  page.drawLine({start:{x:42,y:height-87},end:{x:553,y:height-87},color:colors.green,thickness:1});
  page.drawLine({start:{x:42,y:48},end:{x:553,y:48},color:colors.line,thickness:.7});
  const company=model.company??{};
  wrapped(page,`${company.name||'VIVAI OBICE S.S.A.'} - ${company.address||''}\n${company.email||''} - ${company.phone||''} - P. IVA ${company.vat||''} - SDI ${company.sdi||''}`,{x:42,y:37,width:360,size:7,lineHeight:10,maxLines:2,font:fonts.regular,color:colors.muted});
  page.drawText(`Progetto ${pdfText(model.project?.code||'-')}  |  ${index} / ${total}`,{x:405,y:32,size:7,font:fonts.regular,color:colors.muted});
  return page;
}

function title(page,value,fonts,colors){
  return wrapped(page,value,{x:42,y:728,width:510,size:22,lineHeight:28,maxLines:3,font:fonts.bold,color:colors.green});
}

function technical(page,field,colors,fonts){
  const model=buildReportMapModel({polygon:field.geometry,rows:field.rows,exclusions:field.exclusions,width:1000,height:650,padding:62});
  const box={x:122,y:69,w:350,h:227.5};
  page.drawRectangle({x:box.x,y:box.y,width:box.w,height:box.h,color:colors.soft});
  if(!model.valid)return;
  const point=([x,y])=>({x:box.x+x*box.w/model.width,y:box.y+box.h-y*box.h/model.height});
  const drawPath=(coordinates,color,thickness)=>{for(let i=1;i<coordinates.length;i++)page.drawLine({start:point(coordinates[i-1]),end:point(coordinates[i]),color,thickness});};
  drawPath(model.polygon,colors.green,2);
  for(const row of model.rows)drawPath(row.coordinates,colors.gold,.8);
  for(const area of model.exclusions)drawPath(area.points,colors.rust,1.3);
  for(const side of model.sideMeasurements){
    const {x,y}=point(side.point);const label=pdfText(side.label);
    const w=fonts.bold.widthOfTextAtSize(label,8)+12;
    page.drawRectangle({x:x-w/2,y:y-4,width:w,height:15,color:colors.white});
    page.drawText(label,{x:x-w/2+6,y,size:8,font:fonts.bold,color:colors.green});
  }
}

export async function buildProjectPdfBytes(model,{pdfLib=globalThis.PDFLib,assetLoader=defaultAssetLoader,documentRef=globalThis.document}={}){
  if(!model?.fields?.length||!pdfLib?.PDFDocument)throw new TypeError('Modello PDF o motore di stampa non disponibile.');
  const pdf=await pdfLib.PDFDocument.create();
  pdf.setTitle(buildReportPdfFilename({code:model.project?.code,recipient:model.recipient}).replace(/\.pdf$/i,''));
  pdf.setAuthor('Vivai Obice S.S.A.');
  const fonts={regular:await pdf.embedFont(pdfLib.StandardFonts.Helvetica),bold:await pdf.embedFont(pdfLib.StandardFonts.HelveticaBold)};
  const colors={green:pdfLib.rgb(.09,.24,.16),ink:pdfLib.rgb(.12,.18,.14),muted:pdfLib.rgb(.33,.39,.35),line:pdfLib.rgb(.79,.85,.8),soft:pdfLib.rgb(.93,.96,.93),gold:pdfLib.rgb(.53,.47,.27),rust:pdfLib.rgb(.56,.34,.28),white:pdfLib.rgb(1,1,1)};
  const images={logo:await embeddedAsset(pdf,'./assets/logo-vivai-obice-lineare.png',assetLoader),watermark:await embeddedAsset(pdf,'./assets/logo-filigrana.png',assetLoader),qr:await embeddedQr(pdf,model.qrSvg,{documentRef})};
  const total=2+(model.fields.length>1?1:0)+model.fields.length*2;let current=0;
  const add=()=>frame(pdf,model,++current,total,images,fonts,colors);
  let page=add();let y=title(page,model.title||'Progetto viticolo',fonts,colors)-20;
  y=wrapped(page,model.project?.name||'',{x:42,y,width:490,size:13,font:fonts.bold,color:colors.ink})-28;
  y=line(page,'Codice progetto',model.project?.code,42,y,490,fonts,colors);
  y=line(page,'Revisione',String(model.project?.revisionNumber??'-'),42,y,490,fonts,colors);
  y=line(page,'Destinatario',[model.recipient?.firstName,model.recipient?.lastName].filter(Boolean).join(' '),42,y,490,fonts,colors);
  y=line(page,'Azienda',model.recipient?.companyName,42,y,490,fonts,colors);
  page.drawText('Indirizzo',{x:42,y,size:9,font:fonts.regular,color:colors.muted});
  const recipientAddress=[model.recipient?.address,[model.recipient?.addressPostalCode,model.recipient?.addressCity,model.recipient?.addressProvince].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  y=wrapped(page,recipientAddress||'Da definire',{x:192,y,width:340,size:9,lineHeight:12,maxLines:3,font:fonts.bold,color:colors.ink})-12;
  page.drawLine({start:{x:42,y:y+5},end:{x:532,y:y+5},color:colors.line,thickness:.5});
  const locality=`${model.recipient?.plantLocation||''}${model.recipient?.province?` (${model.recipient.province})`:''}`;
  y=line(page,'Località impianto',locality,42,y,490,fonts,colors);
  if(images.qr)page.drawImage(images.qr,{x:43,y:125,width:130,height:130});
  wrapped(page,model.disclaimer?.short||'',{x:190,y:246,width:350,size:10,font:fonts.regular,color:colors.muted,maxLines:8});

  if(model.fields.length>1){
    page=add();y=title(page,'Riepilogo dei campi',fonts,colors)-24;
    for(const field of model.fields)y=line(page,field.label,`${Math.round(field.metrics?.netAreaM2||0)} m²  -  ${field.metrics?.commercialPlants||0} barbatelle`,42,y,490,fonts,colors);
    y-=18;
    y=line(page,'Campi',String(model.fields.length),42,y,490,fonts,colors);
    y=line(page,'Superficie netta',`${Math.round(model.summary?.netAreaM2||0)} m²`,42,y,490,fonts,colors);
    line(page,'Quantità commerciale',String(model.summary?.commercialPlants||0),42,y,490,fonts,colors);
  }

  for(const field of model.fields){
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
    technical(page,field,colors,fonts);

    page=add();y=title(page,`Dati - ${field.label}`,fonts,colors)-26;
    const m=field.metrics??{},l=field.layout??{},p=field.plantMaterial??{};
    const left=[['Superficie lorda',`${Math.round(m.grossAreaM2||0)} m²`],['Superficie netta',`${Math.round(m.netAreaM2||0)} m²`],['Perimetro',`${Math.round(m.perimeterM||0)} m`],['Distanza piante',`${l.plantSpacingM??'-'} m`],['Distanza filari',`${l.rowSpacingM??'-'} m`],['Orientamento',`${l.orientationDeg??'-'}°`],['Capezzagna',`${l.headlandWidthM??'-'} m`],['Filari',String(m.rowCount??0)],['Metri lineari',`${Math.round(m.rowLinearM||0)} m`]];
    const right=[['Quantità commerciale',String(m.commercialPlants??0)],['Barbatelle calcolate',String(m.calculatedPlants??0)],['Pali intermedi',String(m.intermediatePosts??0)],['Pali di testa',String(m.headPosts??0)],['Pali totali',String(m.totalPosts??0)],['Vitigno',p.grapeVariety],['Clone / selezione',p.cloneSelection],['Portinnesto',p.rootstock],['Altezza barbatella',`${p.plantHeightCm===60?60:40} cm`],['Annata impianto',String(field.plantingYear??'-')],['Vendemmia meccanizzata',l.mechanizedHarvest?'Sì':'No']];
    page.drawText('Geometria e filari',{x:50,y,size:12,font:fonts.bold,color:colors.green});
    page.drawText('Materiale e quantità',{x:310,y,size:12,font:fonts.bold,color:colors.green});
    left.forEach(([label,value],index)=>line(page,label,value,50,y-27-index*24,235,fonts,colors));
    right.forEach(([label,value],index)=>line(page,label,value,310,y-27-index*24,235,fonts,colors));
    wrapped(page,`Inquadramento: ${field.context?.label||'Da definire'}   Riferimento / note: ${field.context?.note||field.notes||'Nessuna nota.'}`,{x:50,y:346,width:485,size:10,font:fonts.regular,color:colors.ink,maxLines:9});
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
