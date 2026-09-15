import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProposalHtml } from '../src/report-template.js';

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
