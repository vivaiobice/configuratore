import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProposalHtml, renderProjectReportHtml } from '../src/report-template.js';

test('renderProposalHtml includes project/customer/layout data and escapes user content', () => {
  const html = renderProposalHtml({
    title: "Proposta preliminare d’impianto", brand:'Vivai Obice', projectCode:'VO-1', generatedAt:'2026-09-15T08:00:00Z', environment:'TEST',
    customer:{ companyName:'Azienda <script>x</script>', firstName:'Mario', lastName:'Rossi', phone:'123', email:'m@example.it' },
    geometry:{ areaM2:5240, perimeterM:314, vertexCount:5 },
    layout:{ rowSpacingM:2.5, plantSpacingM:1, orientationDeg:45, rowCount:23, rowLinearM:2032, commercialPlants25:2050, totalPosts:483, mechanizedHarvest:true },
    plantMaterial:{ grapeVariety:'Barbera N.', rootstock:'1103 P', cloneSelection:null },
    context:{ label:'Bando', note:'PSR 2026' }, disclaimer:'Documento preliminare', cta:'Richiedi preventivo a Vivai Obice', resumeUrl:null
  });
  assert.match(html, /2\.050/);
  assert.match(html, /Barbera N\./);
  assert.match(html, /Bando/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('renderProposalHtml includes a self-contained technical vineyard diagram', () => {
  const html = renderProposalHtml({
    title:'Proposta', brand:'Vivai Obice', projectCode:'VO-2', generatedAt:'2026-09-15T08:00:00Z', environment:'TEST', customer:null, context:null,
    geometry:{ areaM2:100, netAreaM2:80, headlandAreaM2:20, perimeterM:40, vertexCount:4, polygon:[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]], rows:[{start:[8.005,44],end:[8.005,44.01],lengthM:100}] },
    layout:{ rowSpacingM:2.5, plantSpacingM:1, orientationDeg:0, rowCount:1, rowLinearM:100, commercialPlants25:100, totalPosts:10, mechanizedHarvest:false },
    plantMaterial:{ grapeVariety:'Barbera', rootstock:'1103P' }, disclaimer:'Preliminare', cta:'Contatti', resumeUrl:null
  });
  assert.match(html, /class="project-diagram"/);
  assert.match(html, /class="parcel"/);
  assert.match(html, /Superficie netta stimata/);
});

test('renderProposalHtml includes project locality when available', () => {
  const html = renderProposalHtml({
    title:'Proposta', brand:'Vivai Obice', projectCode:'VO-LOC', generatedAt:'2026-09-15T08:00:00Z', environment:'TEST', customer:null, context:null,
    location:{ label:'Santo Stefano Belbo, Cuneo, Piemonte', municipality:'Santo Stefano Belbo', province:'Cuneo', region:'Piemonte' },
    geometry:{ areaM2:100, perimeterM:40, vertexCount:4 }, layout:{ commercialPlants25:0 }, plantMaterial:{}, disclaimer:'Preliminare', cta:'Contatti', resumeUrl:null
  });
  assert.match(html, /Santo Stefano Belbo/);
  assert.match(html, /Cuneo/);
});

function reportModel(fieldCount=1){
  const fields=Array.from({length:fieldCount},(_,index)=>({
    id:`f${index+1}`,label:index?'Nebbiolo':'Moscato <Premium>',location:{label:'Santo Stefano Belbo'},
    geometry:[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]],exclusions:[],
    rows:[{start:[8.005,44],end:[8.005,44.01]}],layout:{rowSpacingM:2.5,plantSpacingM:.9,orientationDeg:10,headlandWidthM:6,postSpacingM:4.5,mechanizedHarvest:true},
    plantMaterial:{grapeVariety:index?'Nebbiolo':'Moscato',cloneSelection:'CVT 57',rootstock:'S.O.4'},plantingYear:2027,context:{label:'Nuovo Impianto',note:'Nota'},notes:'',
    metrics:{grossAreaM2:2400,netAreaM2:2100,perimeterM:205,rowCount:14,rowLinearM:778,calculatedPlants:872,commercialPlants:875,headPosts:28,intermediatePosts:165,totalPosts:193},
    satelliteImage:'data:image/png;base64,abc',mapAttribution:'Imagery © Esri'
  }));
  return {title:'Studio preliminare ed esemplificativo di impianto viticolo',company:{name:'VIVAI OBICE S.S.A.',address:'Via Cossano, 6',email:'info@vivaiobice.com',phone:'393 892 9801',vat:'01656710041',sdi:'SUBM70N'},project:{name:'Vigneto prova',code:'VO-10',revisionNumber:4,documentId:'DOC-1',generatedAt:'2026-09-24T10:00:00Z'},recipient:{companyName:'Cliente <script>',firstName:'Mario',lastName:'Rossi'},fields,summary:{fieldCount,commercialPlants:875*fieldCount,calculatedPlants:872*fieldCount,grossAreaM2:2400*fieldCount,netAreaM2:2100*fieldCount,rowCount:14*fieldCount,rowLinearM:778*fieldCount,totalPosts:193*fieldCount,grapeVarieties:['Moscato'],clones:['CVT 57'],rootstocks:['S.O.4'],plantingYears:['2027']},qrSvg:'<svg class="test-qr"></svg>',shareUrl:'https://example.test/shared',disclaimer:{short:'Elaborato preliminare ed esemplificativo.',full:'Testo completo del disclaimer.'}};
}

test('professional report uses explicit pages with repeated letterhead, footer and page numbering',()=>{
  const html=renderProjectReportHtml(reportModel(1));
  const pages=html.match(/class="report-page/g)??[];
  assert.ok(pages.length>=4);
  assert.equal((html.match(/logo-vivai-obice-lineare\.png/g)??[]).length,pages.length);
  assert.equal((html.match(/VIVAI OBICE S\.S\.A\./g)??[]).length,pages.length);
  assert.match(html,new RegExp(`Pagina ${pages.length} di ${pages.length}`));
  assert.match(html,/Studio preliminare ed esemplificativo di impianto viticolo/);
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/Cliente &lt;script&gt;/);
  assert.match(html,/class="test-qr"/);
  assert.equal((html.match(/logo-filigrana\.png/g)??[]).length,pages.length);
  assert.doesNotMatch(html,/https:\/\/example\.test\/shared/);
  assert.match(html,/ID progetto[^<]*VO-10|Codice progetto<\/dt><dd>VO-10/);
  assert.match(html,/Il QR apre questa versione/);
  assert.doesNotMatch(html,/Documento<\/dt><dd>DOC-1/);
  assert.match(html,/Carica progetto[^<]*apre l’ultima versione disponibile/);
});

test('one field omits project summary while multiple fields include it and render both map modes',()=>{
  assert.doesNotMatch(renderProjectReportHtml(reportModel(1)),/Riepilogo dei campi/);
  const html=renderProjectReportHtml(reportModel(2));
  assert.match(html,/Riepilogo dei campi/);
  assert.equal((html.match(/<h2>Mappa satellitare<\/h2>/g)??[]).length,2);
  assert.equal((html.match(/<h2>Schema tecnico<\/h2>/g)??[]).length,2);
  assert.match(html,/class="quantity-commercial"/);
  assert.match(html,/class="quantity-calculated"/);
  assert.match(html,/Testo completo del disclaimer/);
  assert.doesNotMatch(html,/class="actions"/);
});

test('professional report prints row orientation with one decimal place',()=>{
  const model=reportModel(1);
  model.fields[0].layout.orientationDeg=42.7;
  const html=renderProjectReportHtml(model);
  assert.match(html,/42,7°/);
});

test('recipient address and planting province are printed together without changing profile details',()=>{
  const model=reportModel(1);
  model.recipient={...model.recipient,address:'Via delle Vigne 2, 12000 Borgo (CN), Italia',plantLocation:'Borgo',province:'CN'};
  const html=renderProjectReportHtml(model);
  assert.match(html,/Via delle Vigne 2, 12000 Borgo \(CN\), Italia/);
  assert.match(html,/Borgo \(CN\)/);
});

test('preview keeps recipient city and planting location as separate document details',()=>{
  const model=reportModel(1);
  model.recipient={...model.recipient,address:'Via dei Vigneti 6',addressPostalCode:'12000',addressCity:'Comune destinatario',addressProvince:'CN',plantLocation:'Comune impianto',province:'AT'};
  const html=renderProjectReportHtml(model);
  assert.match(html,/Via dei Vigneti 6/);
  assert.match(html,/12000 Comune destinatario \(CN\)/);
  assert.match(html,/Località impianto: Comune impianto \(AT\)/);
});

test('satellite page uses a single captured image with vectors already georeferenced, while the technical diagram stays separate',()=>{
  const model=reportModel(1);
  model.fields[0].satelliteOverlayMapModel={valid:true,width:1000,height:650,polygon:[[42,42],[342,42],[342,242],[42,42]],rows:[],exclusions:[],sideMeasurements:[]};
  const html=renderProjectReportHtml(model);
  assert.match(html,/class="report-satellite-composite"><img src="data:image\/png;base64,abc"/);
  assert.doesNotMatch(html,/class="map-overlay"/);
  assert.match(html,/class="technical-diagram"/);
});
