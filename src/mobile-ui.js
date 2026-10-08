import {rowPortionDescriptors,hasPortionDesign,formatPortionDesign} from './row-portion-summary.js?v=1.3.2';
import {projectSummaryText} from './project-summary.js?v=1.3.2';
import {soilProfileIsCurrent,SOIL_DISCLAIMER,SOIL_SOURCE} from './soil.js?v=55.3';
import {renderProjectDiagramSvg} from './report-diagram.js?v=1.3.2';
import {calculateManualPlants,calculateManualArea} from './project-calculator.js?v=1.3.2';
import {createMobileChoices,installMobileKeyboard} from './mobile-controls.js?v=26';
import {getTheme,setTheme} from './theme.js';
import {installPenTapFallback} from './pen-tap.js?v=55.5';
import {mobileUserProfileHtml,readMobileProfileForm} from './mobile-profile.js?v=55.2';
import {terrainUsesCertifiedQuantities,terrainQuantityBasisText} from './terrain-report-summary.js?v=1.3.2';
import {terrainFieldSummaryHtml} from './terrain-core-presentation.js?v=1.3.2';

const icons={map:'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2V5zm6-2v16m6-14v16',fields:'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',projects:'M3 7h7l2-3h9v16H3z',profile:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0',plus:'M12 4v16M4 12h16',refresh:'M20 11a8 8 0 1 1-2.5-5.7M20 4v6h-6',search:'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',layers:'M2 7l10-5 10 5-10 5zm0 5l10 5 10-5M2 17l10 5 10-5',calc:'M5 2h14v20H5zM8 6h8M8 11h1m6 0h1m-8 4h1m6 0h1m-8 4h1m6 0h1',back:'M15 4l-8 8 8 8',north:'M12 2l4.2 8.1L12 8.4 7.8 10.1 12 2zm0 20V8.4',print:'M6 9V3h12v6M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6z',mail:'M2 5h20v14H2zM3 7l9 7 9-7',edit:'M4 16l-.8 4.8L8 20 19 9l-4-4L4 16zM13.5 6.5l4 4',save:'M4 3h14l3 3v15H3V3zm3 0v7h10V3M7 21v-8h10v8'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name]}"/></svg>`;
const n=value=>Number(value||0).toLocaleString('it-IT',{maximumFractionDigits:1});
const area=value=>value>=10000?`${n(value/10000)} ha`:`${n(Math.round(value||0))} m²`;
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createMobileUI(api){
 const $=s=>document.querySelector(s), map=$('.map-wrap'), homes=new Map();
 const releaseLabel=escape($('.test-badge')?.textContent?.trim()??'');
 let enabled=false,screen='map',drawing=false,editing=false,awaitingPerimeter=false,transaction=false,saving=false;
 let oldAdvancedOpen=false,oldCompassLabel=null;
 const root=document.createElement('div');root.id='mobile-app';root.className='mobile-only';
 root.innerHTML=`
 <div id="mobile-map-host"></div>
 <header class="mobile-brand"><img src="./assets/logo-vivai-obice-v14.png?v=14" alt="Vivai Obice"/><span>${releaseLabel}</span></header>
 <div class="mobile-home-tools"><button data-sheet="search" aria-label="Cerca località">${icon('search')}</button><button data-sheet="calculator" aria-label="Calcolatore rapido">${icon('calc')}</button><button data-sheet="layers" aria-label="Livelli mappa">${icon('layers')}</button></div>
 <div class="mobile-home-bottom"><button id="mobile-active-field" class="mobile-field-chip"></button></div>
 <button id="mobile-add-field" class="mobile-primary" aria-label="Aggiungi campo">${icon('plus')}<span>Campo</span></button>
 <div class="mobile-editor-top"><button id="mobile-editor-cancel" aria-label="Annulla">${icon('back')}<span class="mobile-cancel-label">Annulla</span></button><strong id="mobile-editor-title">Disegna campo</strong><button id="mobile-editor-next" class="mobile-primary">Continua</button></div>
 <div class="mobile-editor-tools"><button data-sheet="perimeter">Perimetro</button><button data-sheet="cuts">Passaggi / esclusioni</button><button data-sheet="orientation">Filari</button><button data-sheet="layers">${icon('layers')}</button></div>
 <div id="mobile-drawing-actions"><button id="mobile-undo">↶ Ultimo punto</button><button id="mobile-stop-tool">Annulla disegno</button><button id="mobile-finish-edit">Fine modifica</button></div>
 <main id="mobile-pages">
  <section data-screen="fields"><header class="mobile-page-heading"><h1>Campi</h1><div class="mobile-heading-actions"><button id="mobile-refresh-fields" aria-label="Aggiorna campi" title="Aggiorna campi">${icon('refresh')}</button><button id="mobile-add-from-fields" aria-label="Aggiungi campo" title="Aggiungi campo">${icon('plus')}</button><button id="mobile-save-fields" type="button" aria-label="Salva modifiche" title="Salva modifiche">${icon('save')}</button><button id="mobile-fields-print" type="button" aria-label="Stampa PDF di tutti i campi" title="Stampa PDF di tutti i campi">${icon('print')}</button><button id="mobile-fields-quote" type="button" aria-label="Preventivo di tutti i campi" title="Preventivo di tutti i campi">${icon('mail')}</button></div></header><div id="mobile-fields-total"></div><div id="mobile-fields-list"></div></section>
  <section data-screen="detail"><header class="mobile-page-heading"><button data-go="fields" aria-label="Torna ai campi">${icon('back')}</button><h1 id="mobile-detail-title">Campo</h1></header><div id="mobile-detail-map" aria-label="Mappa satellitare interattiva del campo"></div><div id="mobile-field-detail"></div><div class="mobile-two-actions"><button id="mobile-edit-parameters" class="mobile-primary">Modifica impianto</button><button id="mobile-edit-map">Modifica sulla mappa</button></div><div class="mobile-two-actions"><button id="mobile-detail-pdf">Stampa / PDF</button><button id="mobile-detail-quote">Preventivo</button></div><button id="mobile-delete-field" class="mobile-delete-field">Elimina campo</button></section>
  <section data-screen="parameters"><header class="mobile-page-heading"><button id="mobile-cancel-field">Annulla</button><h1>Imposta l’impianto</h1></header><button id="mobile-parameters-map" type="button">Modifica perimetro e passaggi</button><div id="mobile-parameters-preview"></div><div id="mobile-parameters-body"></div><div id="mobile-parameters-metrics"></div><p id="mobile-save-error" role="alert"></p><button id="mobile-save-field" class="mobile-primary">Salva impianto</button><p class="mobile-storage-note">Con accesso effettuato: salvataggio online. Come Guest: salvataggio su questo dispositivo.</p></section>
  <section data-screen="projects"><header class="mobile-page-heading"><h1>Progetti</h1><div class="mobile-heading-actions"><button id="mobile-refresh-projects" aria-label="Aggiorna progetti" title="Aggiorna progetti">${icon('refresh')}</button><button id="mobile-new-project" aria-label="Nuovo progetto" title="Nuovo progetto">${icon('plus')}</button><button id="mobile-save-project" class="mobile-primary" aria-label="Salva progetto attuale" title="Salva progetto attuale">${icon('save')}</button><button id="mobile-projects-print" aria-label="Stampa PDF del progetto aperto" title="Stampa PDF del progetto aperto">${icon('print')}</button><button id="mobile-projects-quote" aria-label="Preventivo del progetto aperto" title="Preventivo del progetto aperto">${icon('mail')}</button></div></header><button id="mobile-load-code" type="button">Carica progetto esistente</button><label class="mobile-label">Nome progetto<input id="mobile-project-name" maxlength="80" placeholder="Il mio impianto"/></label><p class="mobile-storage-note">Progetti salvati su questo dispositivo</p><button id="mobile-user-projects" type="button" hidden>Progetti degli utenti</button><div id="mobile-projects-list"></div></section>
  <section data-screen="profile"><header class="mobile-page-heading"><h1>Profilo</h1></header><div id="mobile-profile-content"></div><p id="mobile-auth-feedback" class="mobile-auth-feedback" role="status"></p></section>
 </main>
 <nav class="mobile-navigation" aria-label="Navigazione principale"><button data-view="map">${icon('map')}<span>Mappa</span></button><button data-view="fields">${icon('fields')}<span>Campi</span></button><button data-view="projects">${icon('projects')}<span>Progetti</span></button><button data-view="profile">${icon('profile')}<span>Profilo</span></button></nav>
 <section class="mobile-sheet" role="dialog" aria-label="Strumenti mappa" hidden><div class="mobile-sheet-handle"></div><header><strong id="mobile-sheet-title"></strong><button id="mobile-close-sheet" type="button" aria-label="Chiudi">×</button></header><div data-content="search"></div><div data-content="layers"></div><div data-content="perimeter"></div><div data-content="cuts"></div><div data-content="orientation"><details data-filari-section="orientation"><summary>Orientamento filari</summary><div id="mobile-orientation-controls"></div></details><details data-filari-section="curve"><summary>Curvatura filari</summary><div id="mobile-curve-controls"></div></details></div><div data-content="calculator"><div class="mobile-quick-heading"><div><strong>Calcolo rapido senza mappa</strong><span>Usa un sesto indipendente dal progetto.</span></div><button id="mobile-quick-mode" class="calculator-mode-swap" type="button" aria-pressed="false" title="Calcola superficie dal numero di viti" aria-label="Calcola superficie dal numero di viti"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h15m0 0-4-4m4 4-4 4M20 16H5m0 0 4-4m-4 4 4 4"/></svg></button></div><div class="mobile-quick-grid"><label id="mobile-quick-area-field">Superficie m²<input id="mobile-quick-area" type="number" min="1" inputmode="decimal" placeholder="5000"/></label><label id="mobile-quick-vines-field" hidden>Numero di viti<input id="mobile-quick-vines" type="number" min="1" step="1" inputmode="numeric" placeholder="1025"/></label><label>Distanza piante m<input id="mobile-quick-plants" type="number" min="0.3" step="0.05" value="0.9"/></label><label>Distanza filari m<input id="mobile-quick-rows" type="number" min="1" step="0.1" value="2.5"/></label></div><p id="mobile-quick-result" aria-live="polite">Inserisci la superficie</p></div></section>
 <p id="mobile-notice" role="status" hidden></p>`;
 document.body.append(root);
 const sheet=$('.mobile-sheet');
 let authState=api.auth?.getState?.()??{kind:'guest'};
 const choices=createMobileChoices(root,()=>enabled);
 const keyboard=installMobileKeyboard(root,()=>enabled);
 const mapInstance=api.getMap?.(),desktopPaints=new Map();
 function updateMapPresentation(){
  if(!mapInstance)return;
  for(const id of ['project-geometry-line','other-project-fields-line']){
   if(!mapInstance.getLayer(id))continue;
   const mobilePaint={'line-color':'#f5f6ed','line-width':1.1,'line-opacity':0.62};
   if(enabled){
    if(!desktopPaints.has(id))desktopPaints.set(id,Object.fromEntries(Object.keys(mobilePaint).map(key=>[key,mapInstance.getPaintProperty(id,key)??null])));
    for(const [key,value] of Object.entries(mobilePaint))mapInstance.setPaintProperty(id,key,value);
   }else if(desktopPaints.has(id)){
    for(const [key,value] of Object.entries(desktopPaints.get(id)))mapInstance.setPaintProperty(id,key,value);
    desktopPaints.delete(id);
   }
  }
 }
 mapInstance?.on('load',updateMapPresentation);
 function move(node,parent){if(!node||!parent)return;if(!homes.has(node)){const anchor=document.createComment('mobile-home');node.before(anchor);homes.set(node,anchor);}parent.append(node);}
 function closeSheet(){if(sheet.contains(document.activeElement))document.activeElement.blur?.();sheet.hidden=true;sheet.classList.remove('mobile-orientation-sheet');}
 function showNotice(message){$('#mobile-notice').textContent=message;$('#mobile-notice').hidden=false;}
 function placeMap(next){
  const preview=$('#mobile-parameters-preview');
  const center=$('#center-field-button'),homeTools=$('.mobile-home-tools');
  map.classList.toggle('mobile-viewer-only',next==='detail'||next==='parameters');
  if(next==='parameters'){
   preview.replaceChildren();preview.dataset.base='satellite';preview.append(map);if(center)preview.append(center);api.showSatellitePreview?.();
   $('#mobile-parameters-body').dataset.mobileInteractive='true';
  }else if(next==='detail'){
   if(center&&homeTools)homeTools.append(center);
   const detail=$('#mobile-detail-map');detail.replaceChildren();detail.dataset.base='satellite';detail.append(map);api.showSatellitePreview?.();
  }else{
   if(center&&homeTools)homeTools.append(center);
   const host=$('#mobile-map-host');host.append(map);delete preview.dataset.base;
   if(next==='fields'){host.dataset.base='satellite';api.showSatellitePreview?.();}
   else{delete host.dataset.base;api.restoreBaseMap?.();}
  }
 }
 function protectNativeControls(container){
  for(const type of ['touchstart','touchend','pointerdown','pointerup'])container.addEventListener(type,event=>{
   const control=event.target.closest?.('input,select,textarea');if(!control)return;
   if(control.matches('select'))return;
   if(type==='touchstart'&&control.matches('input:not([type="range"]):not([type="checkbox"]),textarea')){
    try{control.focus({preventScroll:true});}catch{control.focus();}
   }
   event.stopPropagation();
  });
 }
 function navigate(next){
  if(!enabled)return;
  if(transaction&&!['parameters','editor'].includes(next)){
   if(globalThis.confirm&&!globalThis.confirm('Uscire senza confermare le modifiche?'))return;
   cancel();return;
  }
  choices.close(false);screen=next;document.body.dataset.mobileScreen=next;root.dataset.screen=next;closeSheet();$('#mobile-notice').hidden=true;placeMap(next);
  root.querySelectorAll('[data-screen]').forEach(node=>node.hidden=node.dataset.screen!==next);
  root.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-current',button.dataset.view===(next==='detail'?'fields':next)?'page':'false'));
  $('#mobile-pages').scrollTop=0;
  if(next!=='editor'){api.stopTools();drawing=false;editing=false;}
  placeOrientation();renderField();
  if(next==='fields')renderFields();if(next==='detail')renderDetail();if(next==='projects')renderProjects();if(next==='profile')renderProfile();
  keyboard.update();api.resizeMap();if(next==='map')api.focusAll();
  if(next==='detail'||next==='parameters'){
   const focus=()=>{if(enabled&&screen===next)api.focusField();};
   if(globalThis.requestAnimationFrame)globalThis.requestAnimationFrame(focus);else focus();
  }
 }
 function placeOrientation(){
  const parent=screen==='editor'?$('#mobile-orientation-controls'):$('.step[data-step="2"]');
  move($('#row-portion-picker'),parent);
  move($('.range-field'),parent);
  move($('.row-curve-controls'),$('#mobile-curve-controls'));
 }
 function openSheet(name){
  if(!enabled)return;
  if(['perimeter','cuts','orientation'].includes(name)&&screen!=='editor')return;
  const titles={search:'Cerca il terreno',calculator:'Calcolatore rapido',layers:'Livelli mappa',perimeter:'Perimetro',cuts:'Passaggi e aree escluse',orientation:'Orientamento filari'};
  $('#mobile-sheet-title').textContent=titles[name];sheet.querySelectorAll('[data-content]').forEach(node=>node.hidden=node.dataset.content!==name);sheet.hidden=false;sheet.classList.toggle('mobile-orientation-sheet',name==='orientation');
  if(name==='orientation'){
   sheet.querySelector('[data-filari-section="orientation"]').open=true;
   sheet.querySelector('[data-filari-section="curve"]').open=false;
  }
 }
 function beginNew(){
  transaction=true;awaitingPerimeter=true;screen='editor';navigate('editor');
  $('#mobile-editor-title').textContent='Disegna il campo';api.beginNewField();updateDrawingActions();
 }
 function edit(mode){api.beginEdit();transaction=true;awaitingPerimeter=false;navigate(mode);if(mode==='editor')api.focusField();}
 function cancel(){
  awaitingPerimeter=false;transaction=false;api.stopTools();api.cancelEdit();drawing=false;editing=false;navigate('map');
 }
 function geometryCommitted(){
  if(!enabled||!awaitingPerimeter)return;
  awaitingPerimeter=false;drawing=false;navigate('parameters');
 }
 async function nextEditor(){
  if(drawing){const result=await api.finishDraw();if(!result)return;}
  if(!api.getField()?.geometry){showNotice('Completa prima il perimetro del campo.');return;}
  awaitingPerimeter=false;api.stopTools();navigate('parameters');
 }
 function validateParameters(){
  for(const node of $('#mobile-parameters-body').querySelectorAll('input[type="number"]'))if(node.checkValidity&&!node.checkValidity()){node.reportValidity?.();return false;}
  for(const id of ['plant-spacing','row-spacing','post-spacing'])if(!(Number($('#'+id).value)>0)){showNotice('Imposta distanze maggiori di zero.');return false;}
  return true;
 }
 async function save(){
  if(saving)return;if(screen==='parameters'&&!validateParameters())return;
  if(!api.getFields().some(f=>f.geometry)){showNotice('Disegna almeno un campo prima di salvare.');return;}
  saving=true;$('#mobile-save-field').disabled=true;$('#mobile-save-project').disabled=true;
  try{const fieldId=api.getField()?.activeFieldId;const result=await api.saveProject($('#mobile-project-name').value,{commitCloud:screen==='projects'||api.auth?.getState?.().kind==='user'});transaction=false;awaitingPerimeter=false;if(fieldId)api.selectField(fieldId);navigate('detail');showNotice(result?.location==='cloud'?'Progetto salvato online.':'Impianto salvato su questo dispositivo.');}
  catch(error){showNotice(`Salvataggio non riuscito: ${error.message}`);}
  finally{saving=false;$('#mobile-save-field').disabled=false;$('#mobile-save-project').disabled=false;}
 }
 function metricsHtml(field){const m=api.getMetrics(field),invalid=m.terrainStatus==='invalid',separateGround=!invalid&&terrainUsesCertifiedQuantities(m),native=m.terrainStatus==='applied'&&typeof m.quantityBasis==='string',unavailable=value=>invalid||(native&&!Number.isFinite(value)),q=value=>unavailable(value)?'—':n(value),a=value=>unavailable(value)?'—':area(value),metres=value=>unavailable(value)?'—':`${n(value)} m`,presentation=api.getTerrainPresentation?.(field);return `${invalid?'<p class="mobile-terrain-status" role="status">Da rivedere: ricalcola e applica il disegno sul terreno.</p>':''}${separateGround?`<p class="mobile-terrain-quantity-basis">${terrainQuantityBasisText(m)} · Lunghezze sul terreno misurate</p>`:''}<section class="mobile-vines-summary"><span>Quantità commerciale barbatelle</span><strong class="mobile-commercial-vines">${q(m.commercialPlants25)}</strong><small>Barbatelle calcolate: <b class="mobile-calculated-vines">${q(m.simulatedPlants)}</b></small></section><dl class="mobile-metrics">${[
  ['Superficie',a(m.areaM2)],['Superficie netta',a(m.netAreaM2)],['Pali intermedi',q(m.intermediatePosts)],['Pali di testa',q(m.headPosts)],['Pali totali',q(m.totalPosts)],['Tratti di filare',q(m.rowCount)],[separateGround?'Metri per quantità':'Metri di filare',metres(m.rowLinearM)],...(separateGround?[['Metri sul terreno',metres(m.surfaceRowLinearM)]]:[]),['Perimetro',metres(m.perimeterM)]
 ].map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>${terrainFieldSummaryHtml({metrics:presentation?.proposal?.result??m,model:presentation?.model??field.terrain?.model,preview:Boolean(presentation?.proposal),sourceAvailable:presentation?.sourceAvailable===true})}`;}
 function preview(field){return renderProjectDiagramSvg({polygon:field.geometry,rows:api.getMetrics(field).rows});}
 function renderFields(){
  const fields=api.getFields().filter(f=>Array.isArray(f?.geometry)&&f.geometry.length>=4),metrics=fields.map(api.getMetrics);
  const invalid=metrics.some(m=>m.terrainStatus==='invalid'),sum=key=>metrics.reduce((total,m)=>total+(Number(m[key])||0),0),total=key=>invalid?'—':n(sum(key));
  $('#mobile-fields-total').innerHTML=`<strong>${fields.length} campi · ${invalid?'—':area(sum('areaM2'))}</strong><span>${invalid?'Da rivedere · ':''}${total('simulatedPlants')} barbatelle · ${total('totalPosts')} pali</span><small>${total('intermediatePosts')} intermedi · ${total('headPosts')} di testa</small>`;
  const list=$('#mobile-fields-list');list.replaceChildren();
  if(!fields.length){list.innerHTML='<p class="mobile-empty">Nessun campo disegnato. Aggiungi il primo campo dalla mappa.</p>';return;}
  for(const field of fields){
   const m=api.getMetrics(field),row=document.createElement('div'),button=document.createElement('button'),remove=document.createElement('button');
   let swipeStartX=null,suppressOpen=false;
   row.className='mobile-field-card-row';button.type='button';button.className='mobile-field-card';button.dataset.fieldId=field.id;
   button.innerHTML=`<div class="mobile-card-preview">${preview(field)}</div><div><strong>${escape(field.label)}</strong><span>${m.terrainStatus==='invalid'?'Da rivedere · — barbatelle comm. · — filari':`${n(m.commercialPlants25)} barbatelle comm. · ${n(m.rowCount)} filari`}</span><small>${escape(field.grapeVariety||'Vitigno da definire')} · ${m.terrainStatus==='invalid'?'—':area(m.areaM2)}</small></div><b aria-hidden="true">›</b>`;
   button.addEventListener('pointerdown',event=>{swipeStartX=event.clientX;});
   button.addEventListener('pointerup',event=>{
    if(swipeStartX===null)return;const delta=event.clientX-swipeStartX;swipeStartX=null;if(Math.abs(delta)<45)return;
    suppressOpen=true;for(const other of list.querySelectorAll('.mobile-field-card-row.delete-revealed'))if(other!==row)other.classList.remove('delete-revealed');
    row.classList.toggle('delete-revealed',delta<0);remove.setAttribute('aria-hidden',delta<0?'false':'true');remove.tabIndex=delta<0?0:-1;
   });
   button.addEventListener('click',()=>{if(suppressOpen){suppressOpen=false;return;}openField(field.id);});
   remove.type='button';remove.className='mobile-card-delete';remove.dataset.removeField=field.id;remove.setAttribute('aria-label',`Elimina ${field.label}`);remove.setAttribute('aria-hidden','true');remove.tabIndex=-1;remove.textContent='Elimina';remove.addEventListener('click',()=>deleteField(field.id));
   const extra=document.createElement('div');extra.className='mobile-field-row-actions';extra.hidden=true;
   const edit=document.createElement('button');edit.type='button';edit.className='mobile-card-edit';edit.dataset.fieldAction='edit';edit.title=`Modifica ${field.label}`;edit.setAttribute('aria-label',`Modifica ${field.label}`);edit.setAttribute('aria-expanded','false');edit.innerHTML=icon('edit');edit.addEventListener('click',()=>{extra.hidden=!extra.hidden;edit.setAttribute('aria-expanded',String(!extra.hidden));});
   const rename=document.createElement('button');rename.type='button';rename.dataset.fieldAction='rename';rename.textContent='Rinomina';rename.addEventListener('click',()=>{const name=globalThis.prompt?.('Nome del campo',field.label);if(name==null)return;try{api.renameField?.(field,name);renderFields();showNotice('Campo rinominato.');}catch(error){showNotice(error.message);}});
   const duplicate=document.createElement('button');duplicate.type='button';duplicate.dataset.fieldAction='duplicate';duplicate.textContent='Duplica';duplicate.addEventListener('click',()=>{try{api.beginEdit?.();api.duplicateField?.(field.id);transaction=true;awaitingPerimeter=false;navigate('editor');api.beginDuplicateEdit?.();showNotice('Modifica i punti del perimetro della copia.');}catch(error){showNotice(error.message);}});
   const deleteAction=document.createElement('button');deleteAction.type='button';deleteAction.textContent='Elimina';deleteAction.dataset.fieldAction='delete';deleteAction.addEventListener('click',()=>deleteField(field.id));
   extra.append(rename,duplicate,deleteAction);const entry=document.createElement('div');entry.className='mobile-field-entry';row.append(remove,button,edit);entry.append(row,extra);list.append(entry);
  }
 }
 function openField(id){if(transaction)return;api.selectField(id);navigate('detail');}
 function deleteField(id){
  if(globalThis.confirm&&!globalThis.confirm('Eliminare definitivamente questo campo?'))return;
  api.removeField(id);transaction=false;awaitingPerimeter=false;navigate('fields');showNotice('Campo eliminato.');
 }
 function renderDetail(){
  const field=api.getField(),portions=rowPortionDescriptors(field,api.getMetrics(field));$('#mobile-detail-title').textContent=field.label||'Campo';
  const soil=field.soil?.cartographic??field.soil;
  const soilValues=[['Tessitura superficiale',soil?.texture],['Calcare superficiale',soil?.limestone],['Drenaggio',soil?.drainage],['Reazione superficiale',soil?.reaction]];
  $('#mobile-field-detail').innerHTML=`${metricsHtml(field)}<dl class="mobile-materials">${[
   ['Annata impianto',field.campaignYear||'Da definire'],['Stato impianto',field.plantingStatus==='planted'?'Impianto realizzato / archivio storico':'Da realizzare'],['Sesto',`${n(field.plantSpacingM)} × ${n(field.rowSpacingM)} m`],['Capezzagne',`${n(field.headlandWidthM)} m`],['Distanza pali',`${n(field.postSpacingM)} m`],...(hasPortionDesign({portions})?portions.map(p=>[p.label,formatPortionDesign(p)]):[['Orientamento',`${n(field.orientationDeg)}°`]]),['Vitigno',field.grapeVariety||'Da definire'],['Portainnesto',field.rootstock||'Da definire'],['Clone',field.cloneSelection||'Da definire'],['Vendemmia meccanica',field.mechanizedHarvest?'Sì':'No'],['Passaggi / esclusioni',n(field.exclusions?.length)],['Note',field.projectContextNote||'—']
  ].map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}${soilValues.map(([label,value])=>`<div><dt>${label}</dt><dd>${escape(value||'Non disponibile')}</dd></div>`).join('')}</dl><div class="mobile-soil-footer"><small>Fonte: ${escape(SOIL_SOURCE)} · CC BY 4.0${soil?.retrievedAt?` · ${escape(new Date(soil.retrievedAt).toLocaleDateString('it-IT'))}`:''}${soil&&!soilProfileIsCurrent(field.soil,field.geometry)?' · Perimetro modificato: aggiorna i dati.':''}</small><small>${escape(SOIL_DISCLAIMER)}</small><button type="button" data-mobile-refresh-soil>Aggiorna dati suolo</button><p data-mobile-soil-status role="status"></p></div><p class="mobile-storage-note">Stima preliminare da verificare in fase di progettazione definitiva.</p>`;
  if(api.countsEnabled){const count=document.createElement('button');count.type='button';count.className='mobile-counts-link';count.textContent='＋ Nuovo conteggio per questo campo';count.addEventListener('click',()=>Promise.resolve().then(()=>api.openCountsForField?.(field.id)).catch(error=>showNotice(error.message||'Conteggi non disponibile.')));$('#mobile-field-detail').append(count);}
  const refresh=$('[data-mobile-refresh-soil]');refresh.disabled=!field.geometry;refresh.addEventListener('click',async()=>{refresh.disabled=true;const status=$('[data-mobile-soil-status]');status.textContent='Consultazione della cartografia in corso…';try{const result=await api.analyzeSoil?.();if(result)renderDetail();else status.textContent='Dati del suolo temporaneamente non disponibili';}finally{if(refresh.isConnected)refresh.disabled=false;}});
 }
 function renderProjects(){
  const list=$('#mobile-projects-list');list.replaceChildren();
  const adminButton=$('#mobile-user-projects');if(adminButton)adminButton.hidden=api.auth?.getState?.().isAdmin!==true;$('#mobile-project-name').value=api.getField().localProjectName||'Il mio impianto';
  try{const items=api.listProjects();for(const id of ['mobile-projects-print','mobile-projects-quote'])$('#'+id).disabled=!items.length;if(!items.length)list.innerHTML='<p class="mobile-empty">Nessun progetto archiviato. La bozza corrente è conservata automaticamente.</p>';
   for(const item of items){
    const row=document.createElement('article');row.className='mobile-project-row';row.dataset.mobileProject=item.id;
    const button=document.createElement('button');button.type='button';button.className='mobile-project-card';button.innerHTML=`<strong>${escape(item.name)}</strong><span>${escape(projectSummaryText(item.project,api.getMetrics))} · ${item.savedAt?new Date(item.savedAt).toLocaleDateString('it-IT'):'bozza locale'}</span><small>Apri progetto ›</small>`;button.addEventListener('click',()=>{api.loadProject(item);navigate('fields');});
    const actions=document.createElement('div');actions.className='mobile-project-actions';
    const edit=document.createElement('button');edit.type='button';edit.dataset.mobileProjectAction='edit';edit.className='mobile-card-edit';edit.setAttribute('aria-label',`Modifica ${item.name}`);edit.title=`Modifica ${item.name}`;edit.setAttribute('aria-expanded','false');edit.innerHTML=icon('edit');edit.addEventListener('click',()=>{actions.hidden=!actions.hidden;edit.setAttribute('aria-expanded',String(!actions.hidden));});
    const rename=document.createElement('button');rename.type='button';rename.dataset.mobileProjectAction='rename';rename.textContent='Rinomina';
    const remove=document.createElement('button');remove.type='button';remove.dataset.mobileProjectAction='delete';remove.textContent='Elimina';
    rename.addEventListener('click',()=>{
     if(row.querySelector('.mobile-project-rename'))return;
     const editor=document.createElement('div');editor.className='mobile-project-rename';
     const input=document.createElement('input');input.value=item.name||'Progetto';input.maxLength=80;input.setAttribute('aria-label','Nuovo nome progetto');
     const confirm=document.createElement('button');confirm.type='button';confirm.dataset.mobileProjectAction='confirm-rename';confirm.textContent='Salva';
     confirm.addEventListener('click',async()=>{try{await api.renameProject?.(item,input.value);renderProjects();showNotice('Progetto rinominato.');}catch(error){showNotice(`Rinomina non riuscita: ${error.message}`);}});
     editor.append(input,confirm);row.append(editor);input.focus?.();
    });
    remove.addEventListener('click',async()=>{const ask=api.confirm??globalThis.confirm;if(ask&&!ask(`Eliminare il progetto “${item.name||'Progetto'}”?`))return;try{await api.deleteProject?.(item);renderProjects();showNotice('Progetto eliminato.');}catch(error){showNotice(`Eliminazione non riuscita: ${error.message}`);}});
    actions.append(rename,remove);actions.hidden=true;const titlebar=document.createElement('div');titlebar.className='mobile-project-titlebar';titlebar.append(button,edit);row.append(titlebar,actions);list.append(row);
   }
  }catch(error){showNotice(error.message);}
 }
 function authFeedback(message,error=false){const node=$('#mobile-auth-feedback');node.textContent=message||'';node.classList.toggle('error',error);}
 function mountThemeChoice(content){
  const label=document.createElement('label');label.className='mobile-theme-setting';label.textContent='Tema';
  const select=document.createElement('select');select.id='mobile-theme-choice';select.setAttribute('aria-label','Tema grafico');
  for(const [value,title] of [['light','Chiaro'],['dark','Scuro'],['auto','Automatico']]){const option=document.createElement('option');option.value=value;option.textContent=title;option.selected=value===getTheme();select.append(option);}
  select.addEventListener('change',()=>setTheme(select.value,{root:document.documentElement}));label.append(select);content.append(label);
 }
 function renderProfile(){
  const content=$('#mobile-profile-content');if(!content)return;
  if(authState.kind==='user'){
   content.innerHTML=mobileUserProfileHtml(authState);
   addCountsProfileAccess(content);
   mountThemeChoice(content);
   choices.sync();
   $('#mobile-public-project')?.addEventListener('click',()=>api.openPublicProject?.());
   content.querySelector('[data-mobile-profile-action="save"]')?.addEventListener('click',async()=>{const form=content.querySelector('.mobile-profile-edit');const values=readMobileProfileForm(form);authFeedback('Salvataggio in corso…');try{await api.auth.updateProfile(values);authFeedback('Profilo aggiornato.');}catch(error){authFeedback(error.message||'Salvataggio non riuscito.',true);}});
   content.querySelector('[data-mobile-profile-action="reset-password"]')?.addEventListener('click',async()=>{authFeedback('Invio in corso…');try{await api.auth.requestPasswordReset(authState.email);authFeedback('Ti abbiamo inviato le istruzioni per reimpostare la password.');}catch(error){authFeedback(error.message||'Invio non riuscito.',true);}});
   content.querySelector('[data-mobile-profile-action="logout"]')?.addEventListener('click',async()=>{try{await api.auth.logout();authFeedback('Ora stai lavorando come Guest.');}catch(error){authFeedback(error.message,true);}});
   return;
  }
  content.innerHTML=`<div class="mobile-auth-card"><p class="mobile-storage-note">Continua come Guest oppure accedi per ritrovare i progetti su altri dispositivi.</p><button id="mobile-public-project">Carica progetto con ID</button><div id="mobile-login-form"><label>E-mail o username<input id="mobile-auth-identifier" autocomplete="username"/></label><label>Password<input id="mobile-auth-password" type="password" autocomplete="current-password"/></label>${api.auth.supportsCountsTransfer?'<label><input id="mobile-transfer-counts" type="checkbox"> Trasferisci anche i conteggi ospite a questo account</label>':''}<button id="mobile-auth-login" class="mobile-primary">Accedi</button><button id="mobile-show-register">Crea account</button><button id="mobile-auth-reset">Password dimenticata?</button></div><div id="mobile-register-form" hidden><label>Nome profilo<input id="mobile-register-name" autocomplete="name"/></label><label>E-mail<input id="mobile-register-email" type="email" autocomplete="email"/></label><label>Username<input id="mobile-register-username" autocomplete="username" placeholder="anche solo numeri"/></label><label>Password<input id="mobile-register-password" type="password" autocomplete="new-password"/></label><button id="mobile-auth-register" class="mobile-primary">Crea account</button><button id="mobile-show-login">Ho già un account</button></div></div>`;
  addCountsProfileAccess(content);
  mountThemeChoice(content);
  choices.sync();
  const run=async action=>{authFeedback('Attendi…');try{await action();authFeedback('Operazione completata.');}catch(error){authFeedback(error.message||'Operazione non riuscita',true);}};
  $('#mobile-auth-login').addEventListener('click',()=>run(()=>api.auth.login({identifier:$('#mobile-auth-identifier').value,password:$('#mobile-auth-password').value,...($('#mobile-transfer-counts')?.checked?{transferCounts:true}:{})})));
  $('#mobile-auth-register').addEventListener('click',()=>run(()=>api.auth.register({displayName:$('#mobile-register-name').value,email:$('#mobile-register-email').value,username:$('#mobile-register-username').value,password:$('#mobile-register-password').value})));
  $('#mobile-auth-reset').addEventListener('click',()=>run(()=>api.auth.requestPasswordReset($('#mobile-auth-identifier').value)));
  $('#mobile-public-project')?.addEventListener('click',()=>api.openPublicProject?.());
  $('#mobile-show-register').addEventListener('click',()=>{$('#mobile-login-form').hidden=true;$('#mobile-register-form').hidden=false;});
  $('#mobile-show-login').addEventListener('click',()=>{$('#mobile-register-form').hidden=true;$('#mobile-login-form').hidden=false;});
 }
 function addCountsProfileAccess(content){
  if(!api.countsEnabled)return;
  const button=document.createElement('button');button.type='button';button.className='mobile-counts-link';button.textContent='Conteggi · Rimesse, pali e appunti di campo';
  button.addEventListener('click',()=>Promise.resolve().then(()=>api.openCounts?.('resume')).catch(error=>showNotice(error.message||'Conteggi non disponibile.')));
  content.append(button);
 }
 function renderField(){
  if(!enabled)return;choices.sync();const field=api.getField();if(!field)return;
  const metrics=field.geometry?api.getMetrics(field):null;
  $('#mobile-active-field').textContent=field.geometry?`${field.label} · ${metrics.terrainStatus==='invalid'?'Da rivedere':area(metrics.areaM2)} ›`:'I tuoi campi sulla mappa';
  $('#mobile-active-field').disabled=!field.geometry;
  $('#mobile-editor-next').disabled=!field.geometry&&!drawing;
  if(screen==='parameters'){$('#mobile-parameters-metrics').innerHTML=metricsHtml(field);}
  if(screen==='detail')renderDetail();
 }
 async function refreshProjects(button){
  if(button.disabled)return;
  button.disabled=true;button.setAttribute('aria-busy','true');
  try{await api.refreshProjects?.();if(screen==='fields')renderFields();if(screen==='projects')renderProjects();showNotice('Sincronizzazione completata.');}
  catch(error){showNotice(`Sincronizzazione non riuscita: ${error.message}`);}
  finally{button.disabled=false;button.removeAttribute('aria-busy');}
 }
 function updateDrawingActions(){
  document.body.classList.toggle('mobile-drawing',drawing);
  document.body.classList.toggle('mobile-editing',editing);
  $('#mobile-undo').hidden=!drawing;$('#mobile-stop-tool').hidden=!drawing;$('#mobile-finish-edit').hidden=!editing;
  $('#mobile-editor-next').hidden=drawing;
 }
 function drawingState({active,vertexCount=0}){drawing=active;if(!enabled)return;if(active)closeSheet();$('#mobile-undo').disabled=vertexCount===0;updateDrawingActions();}
 function editingState({active}){editing=active;if(!enabled)return;if(active)closeSheet();updateDrawingActions();}
 function sync(){
  const next=api.isMobile();
  if(next===enabled){if(enabled)api.resizeMap();return;}
  enabled=next;
  api.layoutCadastral?.(next);
  updateMapPresentation();
  if(next){
   document.body.classList.add('mobile-app-active');oldAdvancedOpen=$('.advanced').open;
   move(map,$('#mobile-map-host'));
   move($('.field-manager'),$('[data-screen="parameters"]'));$('#mobile-parameters-map').before($('.field-manager'));
   move($('.step[data-step="2"]'),$('#mobile-parameters-body'));move($('.advanced'),$('#mobile-parameters-body'));$('.advanced').open=false;
   move($('.exclusion-panel'),sheet.querySelector('[data-content="cuts"]'));
   for(const [name,selectors] of Object.entries({search:['.search-shell'],layers:['.segmented','#cadastre-button','#cadastre-opacity-control','#soil-button','.soil-section'],perimeter:['#draw-map-button','#edit-vertices-button','#remove-vertex-button','#clear-field-button'],cuts:['#exclude-line-button','#exclude-zone-button']}))for(const selector of selectors)move($(selector),sheet.querySelector(`[data-content="${name}"]`));
   move($('#close-perimeter-button'),$('#mobile-drawing-actions'));
   move($('#map-gps-button'),$('.mobile-home-tools'));move($('#center-field-button'),$('.mobile-home-tools'));
   const compass=$('.maplibregl-ctrl-compass');
   if(compass){oldCompassLabel=compass.getAttribute('aria-label');move(compass,$('.mobile-home-tools'));compass.setAttribute('aria-label','Bussola: ripristina il Nord');}
   choices.activate();
   $('#mobile-project-name').value=api.getField()?.localProjectName||'Il mio impianto';
   screen='map';navigate('map');
  }else{
   api.stopTools();closeSheet();choices.deactivate();keyboard.reset();for(const [node,anchor] of homes)anchor.after(node);
   const compass=$('.maplibregl-ctrl-compass');if(compass){if(oldCompassLabel===null)compass.removeAttribute('aria-label');else compass.setAttribute('aria-label',oldCompassLabel);}
   $('.advanced').open=oldAdvancedOpen;
   document.body.classList.remove('mobile-app-active','mobile-drawing','mobile-editing');delete document.body.dataset.mobileScreen;
   map.classList.remove('fullscreen-map','mobile-viewer-only');document.body.classList.remove('map-fullscreen-open');
   api.restoreBaseMap?.();api.resizeMap();
  }
 }
 root.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.view)navigate(button.dataset.view);if(button.dataset.go)navigate(button.dataset.go);if(button.dataset.sheet)openSheet(button.dataset.sheet);});
 $('#mobile-close-sheet').addEventListener('click',closeSheet);
 sheet.querySelectorAll('[data-filari-section] summary').forEach(summary=>summary.addEventListener('click',event=>{
  event.preventDefault();const current=summary.parentElement,open=!current.open;
  sheet.querySelectorAll('[data-filari-section]').forEach(section=>{section.open=section===current&&open;});
 }));
 $('#mobile-add-field').addEventListener('click',beginNew);$('#mobile-add-from-fields').addEventListener('click',beginNew);
 $('#mobile-active-field').addEventListener('click',()=>openField(api.getField().activeFieldId));
 $('#mobile-edit-parameters').addEventListener('click',()=>edit('parameters'));$('#mobile-edit-map').addEventListener('click',()=>edit('editor'));
 $('#mobile-editor-cancel').addEventListener('click',cancel);$('#mobile-cancel-field').addEventListener('click',cancel);
 $('#mobile-editor-next').addEventListener('click',nextEditor);$('#mobile-parameters-map').addEventListener('click',()=>{navigate('editor');api.focusField();});
 $('#mobile-save-field').addEventListener('click',save);$('#mobile-save-project').addEventListener('click',save);
 $('#mobile-save-fields').addEventListener('click',async()=>{const button=$('#mobile-save-fields');if(button.disabled)return;button.disabled=true;try{const result=await api.saveProject(api.getField()?.localProjectName||'Il mio impianto',{commitCloud:api.auth?.getState?.().kind==='user'});showNotice(result?.location==='cloud'?'Modifiche salvate online.':'Modifiche salvate su questo dispositivo.');}catch(error){showNotice(`Salvataggio non riuscito: ${error.message}`);}finally{button.disabled=false;}});
 $('#mobile-fields-print').addEventListener('click',()=>{try{api.openReport?.();}catch(error){showNotice(error.message||'Documento non disponibile.');}});
 $('#mobile-fields-quote').addEventListener('click',()=>{try{api.openQuote?.();}catch(error){showNotice(error.message||'Preventivo non disponibile.');}});
 const selectedProject=()=>api.listProjects().find(item=>item.id===api.getField()?.localProjectId)??null;
 $('#mobile-projects-print').addEventListener('click',()=>{try{api.openReport?.(selectedProject());}catch(error){showNotice(error.message||'Documento non disponibile.');}});
 $('#mobile-projects-quote').addEventListener('click',()=>{try{api.openQuote?.(selectedProject());}catch(error){showNotice(error.message||'Preventivo non disponibile.');}});
 $('#mobile-refresh-fields').addEventListener('click',event=>refreshProjects(event.currentTarget));$('#mobile-refresh-projects').addEventListener('click',event=>refreshProjects(event.currentTarget));
 $('#mobile-new-project').addEventListener('click',()=>{api.newProject();navigate('map');});
 $('#mobile-load-code').addEventListener('click',()=>api.openPublicProject?.());
 $('#mobile-undo').addEventListener('click',api.undoPoint);$('#mobile-stop-tool').addEventListener('click',()=>{api.stopTools();drawingState({active:false});});
 $('#mobile-finish-edit').addEventListener('click',()=>{api.stopTools();editingState({active:false});});
 $('#mobile-user-projects')?.addEventListener('click',()=>{if(api.auth?.getState?.().isAdmin)api.openUserProjects?.();});
 $('#mobile-detail-pdf').addEventListener('click',()=>{try{api.openReportForField?.(api.getField().activeFieldId);}catch(error){showNotice(error.message||'Impossibile aprire il documento.');}});$('#mobile-detail-quote').addEventListener('click',()=>{try{api.openQuoteForField?.(api.getField().activeFieldId);}catch(error){showNotice(error.message);}});
 $('#mobile-delete-field').addEventListener('click',()=>deleteField(api.getField().activeFieldId));
 sheet.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;
  if(b.id==='draw-map-button')awaitingPerimeter=true;
  if(b.closest('[data-content="perimeter"]')||['exclude-line-button','exclude-zone-button'].includes(b.id)||b.textContent==='Modifica')closeSheet();
  if(b.id==='remove-vertex-button')editingState({active:true});
 });
 let inverseCalculator=false;
 const renderQuickCalculation=()=>{
  const spacing={plantSpacingM:$('#mobile-quick-plants').value,rowSpacingM:$('#mobile-quick-rows').value};
  if(inverseCalculator){const result=calculateManualArea({...spacing,plants:$('#mobile-quick-vines').value});$('#mobile-quick-result').innerHTML=result.areaM2?`<strong>${result.areaM2.toLocaleString('it-IT',{useGrouping:true,maximumFractionDigits:2})} m²</strong><span>superficie netta teorica</span><small>Capezzagne e passaggi esclusi dalla stima.</small>`:'Inserisci numero di viti e distanze valide';return;}
  const result=calculateManualPlants({...spacing,areaM2:$('#mobile-quick-area').value});$('#mobile-quick-result').innerHTML=result.theoreticalPlants?`<strong>${n(result.theoreticalPlants)}</strong><span>barbatelle stimate</span><small>Da ordinare: <b>${n(result.commercialPlants25)}</b> · multipli di 25</small>`:'Inserisci superficie e distanze valide';
 };
 $('#mobile-quick-mode').addEventListener('click',event=>{inverseCalculator=!inverseCalculator;const button=event.currentTarget;button.setAttribute('aria-pressed',String(inverseCalculator));const action=inverseCalculator?'Calcola viti dalla superficie':'Calcola superficie dal numero di viti';button.title=action;button.setAttribute('aria-label',action);$('#mobile-quick-area-field').hidden=inverseCalculator;$('#mobile-quick-vines-field').hidden=!inverseCalculator;renderQuickCalculation();});
 for(const id of ['mobile-quick-area','mobile-quick-vines','mobile-quick-plants','mobile-quick-rows'])$('#'+id).addEventListener('input',renderQuickCalculation);
 protectNativeControls($('#mobile-pages'));protectNativeControls(sheet);
 installPenTapFallback(root,()=>enabled,{onMapTap:event=>{
  const instance=api.getMap?.(),canvas=instance?.getCanvas?.();if(!instance||!canvas?.contains(event.target))return;
  const rect=canvas.getBoundingClientRect(),point={x:event.clientX-rect.left,y:event.clientY-rect.top};
  instance.fire('click',{point,lngLat:instance.unproject(point),originalEvent:event});
 }});
 api.auth?.subscribe?.(next=>{authState=next;if(screen==='profile')renderProfile();if(screen==='projects')renderProjects();});
 function captureSession(){return {screen,transaction,awaitingPerimeter,drawing,editing,scrollTop:$('#mobile-pages')?.scrollTop??0};}
 function restoreSession(saved){
  if(!enabled||!saved||!['map','fields','detail','parameters','projects','profile','editor'].includes(saved.screen))return false;
  transaction=false;navigate(saved.screen);
  transaction=Boolean(saved.transaction);awaitingPerimeter=Boolean(saved.awaitingPerimeter);
  drawing=Boolean(saved.drawing);editing=Boolean(saved.editing);updateDrawingActions();
  if(Number.isFinite(saved.scrollTop))$('#mobile-pages').scrollTop=Math.max(0,saved.scrollTop);
  return true;
 }
 const controller={sync,navigate,renderField,drawingState,editingState,geometryCommitted,openField,captureSession,restoreSession,isHome:()=>enabled&&screen==='map',isActive:()=>enabled};
 sync();
 return controller;
}
