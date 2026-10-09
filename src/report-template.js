import {terrainMeasureText,terrainUsesCertifiedQuantities,terrainRowCountText} from './terrain-report-summary.js?v=1.3.6';
import {hasPortionDesign,formatPortionDesign,portionReportPages} from './row-portion-summary.js?v=1.3.6';
import {soilRows,SOIL_DISCLAIMER} from './soil.js';
import { renderProjectDiagramSvg } from './report-diagram.js?v=1.3.6';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function number(value, digits = 0) {
  if(value===null)return 'Non disponibile';
  const n = Number(value) || 0;
  return n.toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: true });
}

function row(label, value) {
  return `<div class="report-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

export function renderProposalHtml(model) {
  const customer = model.customer;
  const customerHtml = customer ? `
    <section><h2>Cliente</h2>
      ${row('Azienda', customer.companyName)}
      ${row('Referente', `${customer.firstName} ${customer.lastName}`.trim())}
      ${row('Telefono', customer.phone)}
      ${row('E-mail', customer.email)}
    </section>` : '';
  const contextHtml = model.context ? `
    <section><h2>Inquadramento</h2>${row('Tipologia', model.context.label)}${model.context.note ? row('Riferimento / note', model.context.note) : ''}</section>` : '';
  const locationHtml = model.location ? `
    <section><h2>Località</h2>
      ${model.location.municipality ? row('Comune / località', model.location.municipality) : ''}
      ${model.location.province ? row('Provincia', model.location.province) : ''}
      ${model.location.region ? row('Regione', model.location.region) : ''}
      ${model.location.label && !model.location.municipality ? row('Riferimento', model.location.label) : ''}
    </section>` : '';
  const material = model.plantMaterial ?? {};
  const layout = model.layout ?? {};
  const geometry = model.geometry ?? {};
  const date = new Date(model.generatedAt).toLocaleDateString('it-IT');

  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(model.title)} | ${esc(model.projectCode)}</title>
<style>
:root{font-family:Inter,Arial,sans-serif;color:#172019;background:#fff}body{margin:0;padding:32px;max-width:920px;margin:auto}.report-head{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #183f28;padding-bottom:18px}.report-head h1{margin:4px 0 0;font-size:30px}.brand{font-weight:800;color:#183f28}.meta{text-align:right;font-size:13px;color:#647068}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:24px}section{border:1px solid #dce2dd;border-radius:14px;padding:18px}h2{font-size:15px;margin:0 0 12px;color:#183f28}.report-row{display:flex;justify-content:space-between;gap:16px;padding:7px 0;border-bottom:1px solid #edf0ed}.report-row:last-child{border-bottom:0}.project-diagram{grid-column:1/-1}.project-diagram svg{display:block;width:100%;height:auto}.hero{grid-column:1/-1;background:#183f28;color:#fff}.hero strong{font-size:34px}.hero .report-row{border-color:#365a43}.hero .report-row span{color:#d5e2d9}.foot{margin-top:22px;font-size:12px;color:#68736b;line-height:1.45}.cta{font-weight:800;color:#183f28;margin-top:10px}.actions{margin:20px 0}.actions button{padding:10px 16px;border:0;border-radius:10px;background:#183f28;color:white;font-weight:700}@media print{.actions{display:none}body{padding:0}.report-head{break-inside:avoid}section{break-inside:avoid}}
</style></head><body>
<div class="actions"><button onclick="window.print()">Stampa / salva come PDF</button></div>
<header class="report-head"><div><div class="brand">${esc(model.brand)}</div><h1>${esc(model.title)}</h1></div><div class="meta">Progetto ${esc(model.projectCode || '—')}<br>${esc(date)}${model.environment === 'TEST' ? '<br>AMBIENTE TEST' : ''}</div></header>
<div class="grid">
<section class="project-diagram"><h2>Schema del progetto</h2>${renderProjectDiagramSvg({ polygon:geometry.polygon, rows:geometry.rows, mode:'technical-print' })}</section>
${customerHtml}
${locationHtml}
${contextHtml}
<section><h2>Dati geometrici</h2>
${model.terrain?`<p>${esc(terrainMeasureText(model.terrain))}</p>`:''}
${row(model.terrain?'Superficie lorda orizzontale':'Superficie lorda', `${number(geometry.areaM2)} m²`)}
${row(model.terrain?'Superficie netta orizzontale':'Superficie netta stimata', `${number(model.terrain?geometry.netAreaM2:geometry.netAreaM2 ?? geometry.areaM2)} m²`)}
${geometry.headlandAreaM2 ? row('Area capezzagne stimata', `${number(geometry.headlandAreaM2)} m²`) : ''}
${model.terrain?.status==='applied'?row('Superficie sul terreno',`${number(model.terrain.surfaceAreaM2)} m²`)+row('Superficie netta sul terreno',`${number(model.terrain.surfaceNetAreaM2)} m²`):''}
${row('Perimetro', `${number(geometry.perimeterM)} m`)}
${row('Vertici', number(geometry.vertexCount))}
</section>
<section><h2>Impianto</h2>
${row('Distanza filari', `${number(layout.rowSpacingM, 2)} m`)}
${row('Distanza piante', `${number(layout.plantSpacingM, 2)} m`)}
${hasPortionDesign(layout)?layout.portions.map(p=>row(p.label,formatPortionDesign(p,{includeEquidistance:false}))).join(''):row('Orientamento', `${number(layout.orientationDeg,1)}°`)}
${row('Filari', terrainRowCountText(model.terrain,layout.rowCount,number))}
${row(model.terrain?.status==='applied'?(terrainUsesCertifiedQuantities(model.terrain)?'Metri lineari per quantità':'Metri lineari sul terreno'):'Metri lineari', `${number(layout.rowLinearM)} m`)}${model.terrain?.status==='applied'?(terrainUsesCertifiedQuantities(model.terrain)?row('Metri lineari sul terreno',`${number(model.terrain.surfaceRowLinearM)} m`):'')+row('Metri lineari orizzontali',`${number(model.terrain.horizontalRowLinearM)} m`):''}
${row('Pali stimati', number(layout.totalPosts))}
${row('Vendemmia meccanica', layout.mechanizedHarvest ? 'Sì' : 'No')}
</section>
<section><h2>Materiale vegetale</h2>
${row('Vitigno', material.grapeVariety || 'Da definire')}
${row('Portainnesto', material.rootstock || 'Consigliami')}
${material.cloneSelection ? row('Clone / selezione', material.cloneSelection) : ''}
${material.requestNote ? row('Richiesta particolare', `${material.requestNote}${material.requiresVerification ? ' · da verificare' : ''}`) : ''}
</section>
<section class="hero"><h2 style="color:#fff">Quantità</h2>${row('Barbatelle commerciali', number(layout.commercialPlants25))}<strong>${number(layout.commercialPlants25)}</strong></section>
</div>
<div class="foot">${esc(model.disclaimer)}</div><div class="cta">${esc(model.cta)}</div>
${model.resumeUrl ? `<div class="foot">Riapri progetto: ${esc(model.resumeUrl)}</div>` : ''}
</body></html>`;
}

function reportNumber(value, digits=0){
  if(value===null||value===undefined||value==='')return 'Da definire';
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed.toLocaleString('it-IT',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'Da definire';
}

function valueOrFallback(value){return String(value??'').trim()||'Da definire';}

function pageHeader(){
  return '<header class="document-letterhead"><img src="./assets/logo-vivai-obice-lineare.png" alt="Vivai Obice"><span>Studio preliminare di impianto viticolo</span></header>';
}

function pageFooter(model,page,total){
  const company=model.company??{};
  return `<footer class="document-footer"><div><strong>${esc(company.name||'VIVAI OBICE S.S.A.')}</strong> · ${esc(company.address||'')}<br>${esc(company.email||'')} · ${esc(company.phone||'')} · P. IVA ${esc(company.vat||'')} · SDI ${esc(company.sdi||'')}</div><div>Progetto ${esc(model.project?.code||'—')} · Rev. ${esc(model.project?.revisionNumber??'—')}<br>Pagina ${page} di ${total}</div></footer>`;
}

function coverBody(model){
  const recipient=model.recipient??{};
  const qr=String(model.qrSvg??'').trim().startsWith('<svg')?model.qrSvg:'<div class="report-qr-placeholder">QR non disponibile</div>';
  const location=[recipient.plantLocation,recipient.province?`(${recipient.province})`:null].filter(Boolean).join(' ');
  const destination=[recipient.addressPostalCode,recipient.addressCity,recipient.addressProvince?`(${recipient.addressProvince})`:null].filter(Boolean).join(' ');
  return `<section class="document-cover"><p class="document-kicker">Elaborato Vivai Obice</p><h1>${esc(model.title)}</h1><h2>${esc(model.project?.name||'Progetto viticolo')}</h2><dl class="document-meta"><div><dt>Codice progetto</dt><dd>${esc(model.project?.code||'—')}</dd></div><div><dt>Revisione</dt><dd>${esc(model.project?.revisionNumber??'—')}</dd></div><div><dt>Campi</dt><dd>${model.fields.length}</dd></div><div><dt>Data</dt><dd>${esc(new Date(model.project?.generatedAt??Date.now()).toLocaleDateString('it-IT'))}</dd></div></dl><section class="document-recipient"><h3>Destinatario</h3><strong>${esc(valueOrFallback(recipient.companyName))}</strong><span>${esc(`${recipient.firstName||''} ${recipient.lastName||''}`.trim())}</span><span>${esc(recipient.address||'')}</span><span>${esc(destination)}</span><span>Località impianto: ${esc(location||'Da definire')}</span></section><div class="document-qr">${qr}<p>Inquadra per consultare il progetto</p></div><p class="document-disclaimer-short">${esc(model.disclaimer?.short||'')}</p></section>`;
}

function summaryBody(model,{mobile=false,fields=model.fields,continuation=false,showOverview=true}={}){
  const summary=model.summary??{};
  const fieldList=fields.map(field=>`<li><strong>${esc(field.label)}</strong><span>${esc(field.plantMaterial?.grapeVariety||'Da definire')} · ${reportNumber(field.metrics?.netAreaM2)} m²</span></li>`).join('');
  return `<section class="document-summary"><p class="document-kicker">Quadro generale</p><h1>Riepilogo dei campi${continuation?' · continua':''}</h1><ul class="document-field-list">${fieldList}</ul>${continuation?'':`<div class="document-summary-grid"><div><span>Campi</span><strong>${reportNumber(summary.fieldCount)}</strong></div><div><span>Superficie netta</span><strong>${reportNumber(summary.netAreaM2)} m²</strong></div><div><span>Filari</span><strong>${reportNumber(summary.rowCount)}</strong></div><div><span>Metri lineari</span><strong>${reportNumber(summary.rowLinearM)} m</strong></div><div class="quantity-commercial"><span>${mobile?'Quantità commerciale di barbatelle':'Quantità commerciale'}</span><strong>${reportNumber(summary.commercialPlants)}</strong></div><div class="quantity-calculated"><span>Barbatelle calcolate</span><strong>${reportNumber(summary.calculatedPlants)}</strong></div><div><span>Pali totali</span><strong>${reportNumber(summary.totalPosts)}</strong></div></div>`}${showOverview&&model.overview?overviewBody(model.overview):''}</section>`;
}

function overviewBody(overview){
 return `<figure class="document-overview"><h2>Visione aerea generale</h2><img src="${esc(overview.satelliteImage)}" alt="Vista satellitare di tutti i campi selezionati, con nomi e filari"><figcaption>${esc(overview.mapAttribution)}${overview.cadastre?' · Livello Catasto 60%':''}</figcaption></figure>`;
}
function fieldEvidenceSummary(field){
 const refs=field.cadastralRefs??[],soil=field.soil?.cartographic,lab=field.soil?.labAnalysis;
 const refsHtml=refs.length?`<div class="document-evidence-block"><h2>Riferimenti catastali</h2><div class="document-evidence-refs">${refs.map(ref=>`<span>${esc(ref.municipality||ref.municipalityCode||ref.reference||'Comune non indicato')}${ref.section?` · Sezione ${esc(ref.section)}`:''} · Foglio ${esc(ref.sheet||'—')} · Particella ${esc(ref.parcel||'—')}</span>`).join('')}</div><small>Fonte catastale: Agenzia delle Entrate · Servizio WFS INSPIRE. Dati verificabili e modificabili.</small></div>`:'';
 const soilKnown=soilRows(soil);
 const soilHtml=soilKnown.length?`<div class="document-evidence-block"><h2>Dati del suolo</h2><div class="document-evidence-values">${soilKnown.map(([key,value])=>`<span><b>${esc(key)}:</b> ${esc(value)}</span>`).join('')}</div><small>Fonte: ${esc(soil.source||'Regione Piemonte · Carta dei suoli')} · ${esc(soil.scale||'1:50.000')}${soil.retrievedAt?` · Consultazione ${esc(new Date(soil.retrievedAt).toLocaleDateString('it-IT'))}`:''}. ${esc(SOIL_DISCLAIMER)}${field.soilCurrent===false?' Perimetro modificato: aggiornare la lettura.':''}</small></div>`:'';
 const labRows=lab&&typeof lab==='object'?Object.entries(lab).filter(([,value])=>value!=null&&value!==''&&value!=='Non disponibile'):(lab?[['Analisi',lab]]:[]);
 const labHtml=labRows.length?`<div class="document-evidence-block"><h2>Analisi del terreno</h2><div class="document-evidence-values">${labRows.map(([key,value])=>`<span><b>${esc(key)}:</b> ${esc(typeof value==='object'?JSON.stringify(value):value)}</span>`).join('')}</div></div>`:'';
 return refsHtml+soilHtml+labHtml;
}

function fieldMapBody(field,index,total){
  const mapModel={polygon:field.geometry,rows:field.rows,exclusions:field.exclusions,width:1000,height:650,padding:62};
  const satellite=/^data:image\/png;base64,/i.test(String(field.satelliteImage??''))?`<img src="${esc(field.satelliteImage)}" alt="Immagine satellitare del campo ${esc(field.label)}">`:'<div class="report-map-unavailable">Immagine satellitare non disponibile</div>';
  return `<section class="document-field-map${Array.from(field.label??'').length>80?' document-long-title':''}"><p class="document-kicker">Campo ${index+1} di ${total}</p><h1>${esc(field.label)}</h1><p>${esc(field.location?.label||field.location?.municipality||'')}</p><figure class="report-map-panel"><h2>Mappa satellitare</h2><div class="report-satellite-composite">${satellite}</div><figcaption>${esc(field.mapAttribution||'Imagery © Esri')}</figcaption></figure><figure class="report-map-panel"><h2>Schema tecnico</h2>${renderProjectDiagramSvg({...mapModel,mode:'technical-print'})}</figure></section>`;
}

function fieldDataBody(field,index,total,{mobile=false,portionLines=[]}={}){
  const m=field.metrics??{},l=field.layout??{},p=field.plantMaterial??{};
  const dataRow=(label,value,css='')=>`<div class="document-data-row ${css}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  return `<section class="document-field-data${Array.from(field.label??'').length>80?' document-long-title':''}"><p class="document-kicker">Campo ${index+1} di ${total}</p><h1>Dati · ${esc(field.label)}</h1><div class="document-data-columns"><section><h2>Geometria e filari</h2>${field.terrain?`<p class="document-terrain-measures" style="font-size:11px;line-height:1.4;overflow-wrap:anywhere">${esc(terrainMeasureText(field.terrain))}</p>`:''}${dataRow(field.terrain?'Superficie lorda orizzontale':'Superficie lorda',`${reportNumber(m.grossAreaM2)} m²`)}${dataRow(field.terrain?'Superficie netta orizzontale':'Superficie netta',`${reportNumber(m.netAreaM2)} m²`)}${field.terrain?.status==='applied'?dataRow('Superficie sul terreno',`${reportNumber(field.terrain.surfaceAreaM2)} m²`)+dataRow('Superficie netta sul terreno',`${reportNumber(field.terrain.surfaceNetAreaM2)} m²`):''}${dataRow('Perimetro',`${reportNumber(m.perimeterM)} m`)}${dataRow('Distanza piante',`${reportNumber(l.plantSpacingM,2)} m`)}${dataRow('Distanza filari',`${reportNumber(l.rowSpacingM,2)} m`)}${hasPortionDesign(l)?'':dataRow('Orientamento',`${reportNumber(l.orientationDeg,1)}°`)+dataRow('Curvatura',l.portions?.[0]?.curved?'Curvi':'Rettilinei')}${dataRow('Capezzagna',`${reportNumber(l.headlandWidthM,1)} m`)}${dataRow('Filari',terrainRowCountText(field.terrain,m.rowCount,reportNumber))}${dataRow(field.terrain?.status==='applied'?(terrainUsesCertifiedQuantities(field.terrain)?'Metri lineari per quantità':'Metri lineari sul terreno'):'Metri lineari',`${reportNumber(m.rowLinearM)} m`)}${field.terrain?.status==='applied'?(terrainUsesCertifiedQuantities(field.terrain)?dataRow('Metri lineari sul terreno',`${reportNumber(field.terrain.surfaceRowLinearM)} m`):'')+dataRow('Metri lineari orizzontali',`${reportNumber(field.terrain.horizontalRowLinearM)} m`):''}${portionLines.map(line=>`<p class="document-portion-line">${esc(line)}</p>`).join('')}</section><section><h2>Materiale e quantità</h2>${dataRow(mobile?'Quantità commerciale di barbatelle':'Quantità commerciale',reportNumber(m.commercialPlants),'quantity-commercial')}${dataRow('Barbatelle calcolate',reportNumber(m.calculatedPlants),'quantity-calculated')}${dataRow('Pali intermedi',reportNumber(m.intermediatePosts))}${dataRow('Pali di testa',reportNumber(m.headPosts))}${dataRow('Pali totali',reportNumber(m.totalPosts))}${dataRow('Vitigno',valueOrFallback(p.grapeVariety))}${dataRow('Clone / selezione',valueOrFallback(p.cloneSelection))}${dataRow('Portainnesto',valueOrFallback(p.rootstock))}${dataRow('Altezza barbatella',`${p.plantHeightCm===60?60:40} cm`)}${dataRow('Annata impianto',valueOrFallback(field.plantingYear))}${dataRow('Stato impianto',field.plantingStatus==='planted'?'Impianto realizzato / archivio storico':'Da realizzare')}${dataRow('Vendemmia meccanizzata',l.mechanizedHarvest?'Sì':'No')}</section></div><section class="document-notes"><h2>Inquadramento e note</h2><p><strong>${esc(valueOrFallback(field.context?.label))}</strong></p><p>${esc(field.context?.note||field.notes||'Nessuna nota.')}</p></section><div class="document-field-evidence-inline">${fieldEvidenceSummary(field)}</div></section>`;
}

function portionContinuationBody(field,index,total,lines){
  return `<section class="document-field-data${Array.from(field.label??'').length>80?' document-long-title':''}"><p class="document-kicker">Campo ${index+1} di ${total} · continua</p><h1>Dati · ${esc(field.label)}</h1><div class="document-data-columns"><section><h2>Geometria e filari</h2>${lines.map(line=>`<p class="document-portion-line">${esc(line)}</p>`).join('')}</section></div></section>`;
}

function disclaimerBody(model){
  const qr=String(model.qrSvg??'').trim().startsWith('<svg')?model.qrSvg:'';
  return `<section class="document-disclaimer-page"><p class="document-kicker">Validità e consultazione</p><h1>Avvertenze</h1><p>${esc(model.disclaimer?.full||'')}</p><div class="document-final-qr">${qr}<div><strong>Consulta il progetto</strong><span>ID progetto: ${esc(model.project?.code||'—')}</span><small>Il QR apre questa versione; “Carica progetto” apre l’ultima versione disponibile.</small></div></div><p>Versione disclaimer: ${esc(model.disclaimer?.version||'—')} · Revisione progetto: ${esc(model.project?.revisionNumber??'—')} · Documento: ${esc(model.project?.documentId||'—')}</p></section>`;
}

export function renderProjectReportHtml(model,{mobile=false}={}){
  if(!model?.fields?.length)throw new TypeError('Il documento richiede almeno un campo.');
  const bodies=[coverBody(model)];
  if(model.fields.length>1||model.overview){const size=model.overview?4:12;for(let i=0;i<model.fields.length;i+=size)bodies.push(summaryBody(model,{mobile,fields:model.fields.slice(i,i+size),continuation:i>0,showOverview:i+size>=model.fields.length}));}
  model.fields.forEach((field,index)=>{const portions=portionReportPages(field.layout);bodies.push(fieldMapBody(field,index,model.fields.length));bodies.push(fieldDataBody(field,index,model.fields.length,{mobile,portionLines:portions[0]??[]}));portions.slice(1).forEach(lines=>bodies.push(portionContinuationBody(field,index,model.fields.length,lines)));});
  bodies.push(disclaimerBody(model));
  const total=bodies.length;
  const pages=bodies.map((body,index)=>`<section class="report-page report-page-${index+1}"><img class="document-watermark" src="./assets/logo-filigrana.png" alt="" aria-hidden="true">${pageHeader()}<div class="document-page-body">${body}</div>${pageFooter(model,index+1,total)}</section>`).join('');
  return `<article class="report-document">${pages}</article>`;
}
