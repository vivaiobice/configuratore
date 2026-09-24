import { parseSharedReportUrl } from './report-share.js';
import { parsePublicProjectCodeUrl } from './public-project-access.js';
import { calculateProject } from './project-calculator.js?v=45';
import { buildReportMapModel } from './report-map-model.js?v=45';
import { renderProjectDiagramSvg } from './report-diagram.js?v=45';

export const SHARED_UNAVAILABLE_MESSAGE = 'Collegamento non disponibile. Chiedi a Vivai Obice un nuovo collegamento.';
const DISCLAIMER = 'Il presente documento è uno studio preliminare ed esemplificativo. Non costituisce progetto tecnico firmato, rilievo topografico o catastale, pratica autorizzativa, asseverazione o garanzia di realizzabilità. Prima dell’esecuzione devono essere verificati sul posto confini, quote, pendenze, vincoli, accessi e prescrizioni applicabili.';

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function fieldId(field, index) { return String(field?.id ?? field?.clientFieldId ?? `field-${index + 1}`); }
function fieldLabel(field, index) { return String(field?.label ?? `Campo ${index + 1}`); }
function formatted(value,decimals=0){
  const n=Number(value);
  return Number.isFinite(n)?n.toLocaleString('it-IT',{minimumFractionDigits:decimals,maximumFractionDigits:decimals}):'Da definire';
}
function detailRow(label,value){return `<div class="shared-detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value??'Da definire')}</strong></div>`;}
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

export function sharedPrintAllowed({ accepted, payload, authenticated = false } = {}) {
  return authenticated === true && accepted === true && Boolean(payload?.reportId||payload?.projectCode) && Array.isArray(payload?.fields) && payload.fields.length > 0;
}

export function renderSharedProjectHtml({ payload, canEdit = false } = {}) {
  if (!payload || !Array.isArray(payload.fields)) return `<section class="shared-unavailable"><h1>Documento non disponibile</h1><p>${SHARED_UNAVAILABLE_MESSAGE}</p></section>`;
  const fields = payload.fields.map(fieldPresentation);
  const revisionChanged = Number(payload.currentRevisionNumber) > Number(payload.revisionNumber);
  const editUrl = `./index.html?openProject=${encodeURIComponent(payload.projectId ?? '')}`;
  const summary={netAreaM2:fields.reduce((sum,item)=>sum+(Number(item.metrics.netAreaM2)||0),0),commercialPlants:fields.reduce((sum,item)=>sum+(Number(item.metrics.commercialPlants25)||0),0),posts:fields.reduce((sum,item)=>sum+(Number(item.metrics.totalPosts)||0),0)};
  const summaryPage=fields.length>1?`<section class="shared-summary report-page"><p class="report-eyebrow">Quadro generale</p><h2>Riepilogo dei campi</h2><div class="shared-metrics"><div><span>Campi</span><strong>${fields.length}</strong></div><div><span>Superficie netta</span><strong>${formatted(summary.netAreaM2)} m²</strong></div><div><span>Quantità commerciale</span><strong>${formatted(summary.commercialPlants)}</strong></div><div><span>Pali totali</span><strong>${formatted(summary.posts)}</strong></div></div><ul class="shared-field-list">${fields.map(item=>`<li><strong>${escapeHtml(item.label)}</strong><span>${formatted(item.metrics.netAreaM2)} m² · ${formatted(item.metrics.commercialPlants25)} barbatelle</span></li>`).join('')}</ul></section>`:'';
  const cards = fields.map((item, index) => {
    const { field, metrics, mapModel } = item;
    return `<article class="shared-field report-page" data-shared-field="${escapeHtml(item.id)}">
      <header class="shared-field-header"><p>Campo ${index + 1} di ${fields.length}</p><h2>${escapeHtml(item.label)}</h2><span>${escapeHtml(field.locationLabel || field.municipality || '')}</span></header>
      <section class="shared-map-grid"><figure class="shared-map-panel"><div class="shared-live-map" data-field-index="${index}" aria-label="Mappa satellitare interattiva di ${escapeHtml(item.label)}"></div><figcaption>Immagine satellitare interattiva · Imagery © Esri</figcaption></figure><figure class="shared-map-panel">${renderProjectDiagramSvg({mapModel,mode:'technical'})}<figcaption>Schema tecnico indicativo</figcaption></figure></section>
      <section class="shared-metrics" aria-label="Dati principali del campo"><div><span>Superficie netta</span><strong>${formatted(metrics.netAreaM2)} m²</strong></div><div><span>Quantità commerciale</span><strong>${formatted(metrics.commercialPlants25)}</strong></div><div><span>Barbatelle calcolate</span><strong>${formatted(metrics.simulatedPlants)}</strong></div><div><span>Filari</span><strong>${formatted(metrics.rowCount)}</strong></div></section>
    </article><article class="shared-field-data report-page"><p class="report-eyebrow">Campo ${index+1} di ${fields.length}</p><h2>Dati · ${escapeHtml(item.label)}</h2><div class="shared-detail-grid"><section><h3>Geometria e filari</h3>
      ${detailRow('Superficie lorda',`${formatted(metrics.areaM2)} m²`)}${detailRow('Superficie netta',`${formatted(metrics.netAreaM2)} m²`)}${detailRow('Perimetro',`${formatted(metrics.perimeterM)} m`)}${detailRow('Vertici',formatted(metrics.vertexCount))}${detailRow('Distanza piante',`${formatted(field.plantSpacingM,2)} m`)}${detailRow('Distanza filari',`${formatted(field.rowSpacingM,2)} m`)}${detailRow('Orientamento filari',`${formatted(field.orientationDeg,1)}°`)}${detailRow('Capezzagna',`${formatted(field.headlandWidthM,1)} m`)}${detailRow('Distanza pali',`${formatted(field.postSpacingM,1)} m`)}${detailRow('Filari',formatted(metrics.rowCount))}${detailRow('Metri lineari',`${formatted(metrics.rowLinearM)} m`)}</section><section><h3>Materiale e quantità</h3>
      ${detailRow('Quantità commerciale',formatted(metrics.commercialPlants25))}${detailRow('Barbatelle calcolate',formatted(metrics.simulatedPlants))}${detailRow('Pali intermedi',formatted(metrics.intermediatePosts))}${detailRow('Pali di testa',formatted(metrics.headPosts))}${detailRow('Pali totali',formatted(metrics.totalPosts))}${detailRow('Vitigno',field.grapeVariety||'Da definire')}${detailRow('Clone / selezione',field.cloneSelection||'Da definire')}${detailRow('Portinnesto',field.rootstock||'Da definire')}${detailRow('Altezza barbatella',`${field.plantHeightCm===60?60:40} cm`)}${detailRow('Annata impianto',field.campaignYear??field.plantingYear??'Da definire')}${detailRow('Vendemmia meccanizzata',field.mechanizedHarvest?'Sì':'No')}</section></div>
      <section class="shared-notes"><h3>Inquadramento e note</h3><p>${escapeHtml(field.projectContextType==='new_planting'?'Nuovo impianto':field.projectContextType||'Da definire')}</p><p>${escapeHtml(field.projectContextNote||field.materialRequestNote||'Nessuna nota.')}</p></section></article>`;
  }).join('');
  return `<div class="shared-document"><section class="shared-cover report-page"><img src="./assets/logo-vivai-obice-lineare.png" alt="Vivai Obice"><p class="report-eyebrow">Documento condiviso · sola lettura</p><h1>Studio preliminare ed esemplificativo di impianto viticolo</h1><h2>${escapeHtml(payload.projectName || 'Progetto viticolo')}</h2>${payload.projectCode?`<p class="shared-project-code">ID progetto ${escapeHtml(payload.projectCode)}</p>`:''}<div class="shared-version"><span>Versione documento: ${escapeHtml(payload.revisionNumber)}</span><span>Versione attuale: ${escapeHtml(payload.currentRevisionNumber)}</span></div>${revisionChanged?'<p class="shared-version-warning">Il progetto è stato modificato dopo l’emissione di questo documento.</p>':''}${canEdit?`<a class="shared-edit" href="${editUrl}">Apri nel configuratore</a>`:''}<p class="shared-disclaimer-short">${DISCLAIMER}</p></section>${summaryPage}${cards}<section class="shared-final report-page"><h2>Avvertenze e validità</h2><p>${DISCLAIMER}</p><p>Documento emesso il ${escapeHtml(new Date(payload.createdAt).toLocaleString('it-IT'))} · Revisione ${escapeHtml(payload.revisionNumber)}</p><footer><strong>VIVAI OBICE S.S.A.</strong><br>Via Cossano, 6 · 12058 Santo Stefano Belbo (CN)<br>info@vivaiobice.com · 393 892 9801 · P. IVA 01656710041 · SDI SUBM70N</footer></section></div>`;
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

export async function bootSharedProjectPage({ documentRef = globalThis.document, locationHref = globalThis.location?.href, backend, authService, maplibregl = globalThis.maplibregl } = {}) {
  const root = documentRef?.querySelector?.('#shared-project-root');
  if (!root) return null;
  root.innerHTML='<p class="shared-loading">Caricamento documento…</p>';
  const result = await loadSharedProject({url:locationHref,backend});
  if (result.state !== 'ready') { root.innerHTML=renderSharedProjectHtml({}); return result; }
  root.innerHTML=renderSharedProjectHtml(result);
  const maps=mountSharedSatelliteMaps({root,payload:result.payload,maplibregl});
  const accept=documentRef.querySelector('#shared-disclaimer-accept');
  const print=documentRef.querySelector('#shared-print');
  const modal=documentRef.querySelector('#shared-auth-dialog');
  const login=documentRef.querySelector('#shared-auth-login');
  const register=documentRef.querySelector('#shared-auth-register');
  const feedback=documentRef.querySelector('#shared-auth-feedback');
  const authenticated=()=>authService?.getState?.()?.kind==='user';
  const refresh=()=>{print.disabled=false;documentRef.documentElement.dataset.sharedAuthenticated=String(authenticated());};
  const openAuth=()=>{if(!modal)return;modal.hidden=false;login.hidden=false;register.hidden=true;feedback.textContent='';login.querySelector('[name="identifier"]')?.focus?.();};
  modal?.querySelector('#shared-auth-close')?.addEventListener('click',()=>{modal.hidden=true;});
  modal?.addEventListener('click',event=>{
    const view=event.target.closest?.('[data-auth-view]')?.dataset.authView;
    if(view){login.hidden=view!=='login';register.hidden=view!=='register';feedback.textContent='';}
  });
  async function submitAuth(event,action){
    event.preventDefault();feedback.textContent='Attendi…';
    try{
      if(!authService)throw new Error('Accesso temporaneamente non disponibile.');
      if(action==='register'){
        await backend?.ensureAnonymousSession?.();
        await authService.register({displayName:register.elements.namedItem('displayName').value,email:register.elements.namedItem('email').value,username:register.elements.namedItem('username').value,password:register.elements.namedItem('password').value});
      }
      else await authService.login({identifier:login.elements.namedItem('identifier').value,password:login.elements.namedItem('password').value});
      modal.hidden=true;refresh();
    }catch(error){feedback.textContent=error.message||'Accesso non riuscito.';}
  }
  login?.addEventListener('submit',event=>submitAuth(event,'login'));
  register?.addEventListener('submit',event=>submitAuth(event,'register'));
  accept?.addEventListener('change',refresh);
  print?.addEventListener('click',()=>{
    if(!authenticated()){openAuth();return;}
    if(!sharedPrintAllowed({accepted:accept?.checked,payload:result.payload,authenticated:true})){accept?.focus?.();return;}
    globalThis.print?.();
  });
  authService?.subscribe?.(refresh);refresh();
  return {...result,maps};
}
