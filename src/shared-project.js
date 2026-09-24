import { parseSharedReportUrl } from './report-share.js';
import { parsePublicProjectCodeUrl } from './public-project-access.js';
import { calculateProject } from './project-calculator.js?v=42';
import { buildReportMapModel } from './report-map-model.js?v=42';
import { renderProjectDiagramSvg } from './report-diagram.js?v=42';

export const SHARED_UNAVAILABLE_MESSAGE = 'Collegamento non disponibile. Chiedi a Vivai Obice un nuovo collegamento.';
const DISCLAIMER = 'Il presente documento è uno studio preliminare ed esemplificativo. Non costituisce progetto tecnico firmato, rilievo topografico o catastale, pratica autorizzativa, asseverazione o garanzia di realizzabilità. Prima dell’esecuzione devono essere verificati sul posto confini, quote, pendenze, vincoli, accessi e prescrizioni applicabili.';

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function fieldId(field, index) { return String(field?.id ?? field?.clientFieldId ?? `field-${index + 1}`); }
function fieldLabel(field, index) { return String(field?.label ?? `Campo ${index + 1}`); }
function exclusionRings(field) {
  return (Array.isArray(field?.exclusions) ? field.exclusions : []).map((item) => Array.isArray(item) ? item : item?.geometry).filter(Array.isArray);
}

function fieldPresentation(field, index) {
  const metrics = calculateProject({
    polygon: field?.geometry,
    exclusions: exclusionRings(field),
    rowSpacingM: field?.rowSpacingM,
    plantSpacingM: field?.plantSpacingM,
    orientationDeg: field?.orientationDeg,
    rowCurvePoints: field?.rowCurvePoints,
    maintainRowEquidistance: field?.maintainRowEquidistance!==false,
    postSpacingM: field?.postSpacingM,
    headlandWidthM: field?.headlandWidthM
  });
  const mapModel = buildReportMapModel({ polygon: field?.geometry, rows: metrics.rows, exclusions: field?.exclusions, width:760, height:420, padding:48 });
  return { id:fieldId(field,index), label:fieldLabel(field,index), field, metrics, mapModel };
}

export async function loadSharedProject({ url, backend } = {}) {
  try {
    const parsed = parseSharedReportUrl(url);
    const publicCode=parsePublicProjectCodeUrl(url);
    let payload=null;
    if(parsed&&backend?.getSharedProjectReport)payload=await backend.getSharedProjectReport(parsed.reportId,parsed.token);
    else if(publicCode&&backend?.getPublicProjectByCode)payload=await backend.getPublicProjectByCode(publicCode);
    else throw new Error('invalid');
    if (!payload || !Array.isArray(payload.fields)) throw new Error('unavailable');
    let canEdit = false;
    try { canEdit = Boolean(await backend.canEditProject?.(payload.projectId)); } catch { canEdit = false; }
    return { state:'ready', payload, canEdit };
  } catch {
    return { state:'unavailable', message:SHARED_UNAVAILABLE_MESSAGE, payload:null, canEdit:false };
  }
}

export function sharedPrintAllowed({ accepted, payload } = {}) {
  return accepted === true && Boolean(payload?.reportId||payload?.projectCode) && Array.isArray(payload?.fields) && payload.fields.length > 0;
}

export function renderSharedProjectHtml({ payload, canEdit = false } = {}) {
  if (!payload || !Array.isArray(payload.fields)) return `<section class="shared-unavailable"><h1>Documento non disponibile</h1><p>${SHARED_UNAVAILABLE_MESSAGE}</p></section>`;
  const fields = payload.fields.map(fieldPresentation);
  const revisionChanged = Number(payload.currentRevisionNumber) > Number(payload.revisionNumber);
  const editUrl = `./index.html?openProject=${encodeURIComponent(payload.projectId ?? '')}`;
  const cards = fields.map((item, index) => {
    const { field, metrics, mapModel } = item;
    return `<article class="shared-field report-page" data-shared-field="${escapeHtml(item.id)}">
      <header class="shared-field-header"><p>Campo ${index + 1} di ${fields.length}</p><h2>${escapeHtml(item.label)}</h2><span>${escapeHtml(field.locationLabel || field.municipality || '')}</span></header>
      <section class="shared-map-grid"><figure class="shared-map-panel"><div class="shared-live-map" data-field-index="${index}" aria-label="Mappa satellitare interattiva di ${escapeHtml(item.label)}"></div><figcaption>Immagine satellitare interattiva · Imagery © Esri</figcaption></figure><figure class="shared-map-panel">${renderProjectDiagramSvg({mapModel,mode:'technical'})}<figcaption>Schema tecnico indicativo</figcaption></figure></section>
      <section class="shared-metrics" aria-label="Dati del campo"><div><span>Superficie netta</span><strong>${Math.round(metrics.netAreaM2).toLocaleString('it-IT')} m²</strong></div><div><span>Quantità commerciale</span><strong>${Math.round(metrics.commercialPlants25).toLocaleString('it-IT')}</strong></div><div><span>Barbatelle calcolate</span><strong>${Math.round(metrics.simulatedPlants).toLocaleString('it-IT')}</strong></div><div><span>Filari</span><strong>${metrics.rowCount}</strong></div><div><span>Vitigno</span><strong>${escapeHtml(field.grapeVariety || 'Da definire')}</strong></div><div><span>Portinnesto</span><strong>${escapeHtml(field.rootstock || 'Da definire')}</strong></div></section>
    </article>`;
  }).join('');
  return `<div class="shared-document"><section class="shared-cover report-page"><img src="./assets/logo-vivai-obice-lineare.png" alt="Vivai Obice"><p class="report-eyebrow">Documento condiviso · sola lettura</p><h1>Studio preliminare ed esemplificativo di impianto viticolo</h1><h2>${escapeHtml(payload.projectName || 'Progetto viticolo')}</h2>${payload.projectCode?`<p class="shared-project-code">ID progetto ${escapeHtml(payload.projectCode)}</p>`:''}<div class="shared-version"><span>Versione documento: ${escapeHtml(payload.revisionNumber)}</span><span>Versione attuale: ${escapeHtml(payload.currentRevisionNumber)}</span></div>${revisionChanged?'<p class="shared-version-warning">Il progetto è stato modificato dopo l’emissione di questo documento.</p>':''}${canEdit?`<a class="shared-edit" href="${editUrl}">Apri nel configuratore</a>`:''}<p class="shared-disclaimer-short">${DISCLAIMER}</p></section>${cards}<section class="shared-final report-page"><h2>Avvertenze e validità</h2><p>${DISCLAIMER}</p><p>Documento emesso il ${escapeHtml(new Date(payload.createdAt).toLocaleString('it-IT'))} · Revisione ${escapeHtml(payload.revisionNumber)}</p><footer><strong>VIVAI OBICE S.S.A.</strong><br>Via Cossano, 6 · 12058 Santo Stefano Belbo (CN)<br>info@vivaiobice.com · 393 892 9801 · P. IVA 01656710041 · SDI SUBM70N</footer></section></div>`;
}

export function mountSharedSatelliteMaps({ root, payload, maplibregl } = {}) {
  if (!root || !maplibregl?.Map || !Array.isArray(payload?.fields)) return [];
  return payload.fields.map(fieldPresentation).map((item, index) => {
    if (!item.mapModel.valid) return null;
    const container = root.querySelector(`[data-field-index="${index}"]`);
    if (!container) return null;
    const map = new maplibregl.Map({
      container,
      style:{version:8,sources:{satellite:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19,attribution:'Imagery © Esri'}},layers:[{id:'satellite',type:'raster',source:'satellite'}]},
      interactive:true,
      attributionControl:false,
      pitchWithRotate:false
    });
    map.fitBounds(item.mapModel.captureBounds,{padding:0,duration:0});
    map.on('load',()=>{
      map.addSource('field',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[item.field.geometry]}}});
      map.addLayer({id:'field-fill',type:'fill',source:'field',paint:{'fill-color':'#f7f4cd','fill-opacity':.12}});
      map.addLayer({id:'field-line',type:'line',source:'field',paint:{'line-color':'#f7f4cd','line-width':2}});
      map.addSource('rows',{type:'geojson',data:{type:'FeatureCollection',features:item.metrics.rows.map(row=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:Array.isArray(row.coordinates)&&row.coordinates.length>=2?row.coordinates:[row.start,row.end]}}))}});
      map.addLayer({id:'rows-line',type:'line',source:'rows',paint:{'line-color':'#fffbd4','line-width':1.35}});
    });
    if (maplibregl.NavigationControl) map.addControl(new maplibregl.NavigationControl({showCompass:true,showZoom:true}),'bottom-right');
    return map;
  }).filter(Boolean);
}

export async function bootSharedProjectPage({ documentRef = globalThis.document, locationHref = globalThis.location?.href, backend, maplibregl = globalThis.maplibregl } = {}) {
  const root = documentRef?.querySelector?.('#shared-project-root');
  if (!root) return null;
  root.innerHTML='<p class="shared-loading">Caricamento documento…</p>';
  const result = await loadSharedProject({url:locationHref,backend});
  if (result.state !== 'ready') { root.innerHTML=renderSharedProjectHtml({}); return result; }
  root.innerHTML=renderSharedProjectHtml(result);
  const maps=mountSharedSatelliteMaps({root,payload:result.payload,maplibregl});
  const accept=documentRef.querySelector('#shared-disclaimer-accept');
  const print=documentRef.querySelector('#shared-print');
  const refresh=()=>{print.disabled=!sharedPrintAllowed({accepted:accept?.checked,payload:result.payload});};
  accept?.addEventListener('change',refresh);print?.addEventListener('click',()=>globalThis.print?.());refresh();
  return {...result,maps};
}
