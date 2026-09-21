import { renderProjectDiagramSvg } from './report-diagram.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function number(value, digits = 0) {
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
<section class="project-diagram"><h2>Schema del progetto</h2>${renderProjectDiagramSvg({ polygon:geometry.polygon, rows:geometry.rows })}</section>
${customerHtml}
${locationHtml}
${contextHtml}
<section><h2>Dati geometrici</h2>
${row('Superficie lorda', `${number(geometry.areaM2)} m²`)}
${row('Superficie netta stimata', `${number(geometry.netAreaM2 ?? geometry.areaM2)} m²`)}
${geometry.headlandAreaM2 ? row('Area capezzagne stimata', `${number(geometry.headlandAreaM2)} m²`) : ''}
${row('Perimetro', `${number(geometry.perimeterM)} m`)}
${row('Vertici', number(geometry.vertexCount))}
</section>
<section><h2>Impianto</h2>
${row('Distanza filari', `${number(layout.rowSpacingM, 2)} m`)}
${row('Distanza piante', `${number(layout.plantSpacingM, 2)} m`)}
${row('Orientamento', `${number(layout.orientationDeg)}°`)}
${row('Filari', number(layout.rowCount))}
${row('Metri lineari', `${number(layout.rowLinearM)} m`)}
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
