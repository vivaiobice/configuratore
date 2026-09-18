import {renderProjectDiagramSvg} from './report-diagram.js';
import {calculateManualPlants} from './project-calculator.js?v=16';

const icons={map:'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2V5zm6-2v16m6-14v16',fields:'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',projects:'M3 7h7l2-3h9v16H3z',plus:'M12 4v16M4 12h16',search:'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',layers:'M2 7l10-5 10 5-10 5zm0 5l10 5 10-5M2 17l10 5 10-5',calc:'M5 2h14v20H5zM8 6h8M8 11h1m6 0h1m-8 4h1m6 0h1m-8 4h1m6 0h1',back:'M15 4l-8 8 8 8'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name]}"/></svg>`;
const n=value=>Number(value||0).toLocaleString('it-IT',{maximumFractionDigits:1});
const area=value=>value>=10000?`${n(value/10000)} ha`:`${n(Math.round(value||0))} m²`;
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createMobileUI(api){
 const $=s=>document.querySelector(s), map=$('.map-wrap'), homes=new Map();
 let enabled=false,screen='map',drawing=false,editing=false,awaitingPerimeter=false,transaction=false,saving=false;
 let oldAdvancedOpen=false;
 const root=document.createElement('div');root.id='mobile-app';root.className='mobile-only';
 root.innerHTML=`
 <div id="mobile-map-host"></div>
 <header class="mobile-brand"><img src="./assets/logo-vivai-obice-v14.png?v=14" alt="Vivai Obice"/></header>
 <div class="mobile-home-tools"><button data-sheet="search" aria-label="Cerca località">${icon('search')}</button><button data-sheet="calculator" aria-label="Calcolatore rapido">${icon('calc')}</button><button data-sheet="layers" aria-label="Livelli mappa">${icon('layers')}</button></div>
 <div class="mobile-home-bottom"><button id="mobile-active-field" class="mobile-field-chip"></button></div>
 <button id="mobile-add-field" class="mobile-primary">${icon('plus')} Aggiungi campo</button>
 <div class="mobile-editor-top"><button id="mobile-editor-cancel">${icon('back')} Annulla</button><strong id="mobile-editor-title">Disegna campo</strong><button id="mobile-editor-next" class="mobile-primary">Continua</button></div>
 <div class="mobile-editor-tools"><button data-sheet="perimeter">Perimetro</button><button data-sheet="cuts">Passaggi / esclusioni</button><button data-sheet="orientation">Filari</button><button data-sheet="layers">${icon('layers')}</button></div>
 <div id="mobile-drawing-actions"><button id="mobile-undo">↶ Ultimo punto</button><button id="mobile-stop-tool">Annulla disegno</button><button id="mobile-finish-edit">Fine modifica</button></div>
 <main id="mobile-pages">
  <section data-screen="fields"><header class="mobile-page-heading"><h1>Campi</h1><button id="mobile-add-from-fields" aria-label="Aggiungi campo">${icon('plus')}</button></header><div id="mobile-fields-total"></div><div id="mobile-fields-list"></div></section>
  <section data-screen="detail"><header class="mobile-page-heading"><button data-go="fields" aria-label="Torna ai campi">${icon('back')}</button><h1 id="mobile-detail-title">Campo</h1></header><div id="mobile-field-detail"></div><div class="mobile-two-actions"><button id="mobile-edit-parameters" class="mobile-primary">Modifica impianto</button><button id="mobile-edit-map">Modifica sulla mappa</button></div><div class="mobile-two-actions"><button id="mobile-detail-pdf">Proposta / PDF</button><button id="mobile-detail-quote">Preventivo</button></div></section>
  <section data-screen="parameters"><header class="mobile-page-heading"><button id="mobile-cancel-field">Annulla</button><h1>Imposta l’impianto</h1></header><div id="mobile-parameters-preview"></div><div id="mobile-parameters-body"></div><button id="mobile-parameters-map">Modifica perimetro e passaggi</button><div id="mobile-parameters-metrics"></div><p id="mobile-save-error" role="alert"></p><button id="mobile-save-field" class="mobile-primary">Salva impianto</button><p class="mobile-storage-note">Salvato su questo dispositivo. PDF e preventivo sono disponibili nella scheda del campo.</p></section>
  <section data-screen="projects"><header class="mobile-page-heading"><h1>Progetti</h1><button id="mobile-new-project">${icon('plus')} Nuovo</button></header><label class="mobile-label">Nome progetto<input id="mobile-project-name" maxlength="80" placeholder="Il mio impianto"/></label><button id="mobile-save-project" class="mobile-primary">Salva progetto attuale</button><p class="mobile-storage-note">Progetti salvati su questo dispositivo</p><div id="mobile-projects-list"></div></section>
 </main>
 <nav class="mobile-navigation" aria-label="Navigazione principale"><button data-view="map">${icon('map')}<span>Mappa</span></button><button data-view="fields">${icon('fields')}<span>Campi</span></button><button data-view="projects">${icon('projects')}<span>Progetti</span></button></nav>
 <section class="mobile-sheet" role="dialog" aria-label="Strumenti mappa" hidden><div class="mobile-sheet-handle"></div><header><strong id="mobile-sheet-title"></strong><button id="mobile-close-sheet">Chiudi</button></header><div data-content="search"></div><div data-content="layers"></div><div data-content="perimeter"></div><div data-content="cuts"></div><div data-content="orientation"></div><div data-content="calculator"><div class="mobile-quick-grid"><label>Superficie m²<input id="mobile-quick-area" type="number" min="1" inputmode="decimal" placeholder="5000"/></label><label>Distanza piante m<input id="mobile-quick-plants" type="number" min="0.3" step="0.05" value="0.9"/></label><label>Distanza filari m<input id="mobile-quick-rows" type="number" min="1" step="0.1" value="2.5"/></label></div><p id="mobile-quick-result" aria-live="polite">Inserisci la superficie</p></div></section>
 <p id="mobile-notice" role="status" hidden></p>`;
 document.body.append(root);
 const sheet=$('.mobile-sheet');
 function move(node,parent){if(!node||!parent)return;if(!homes.has(node)){const anchor=document.createComment('mobile-home');node.before(anchor);homes.set(node,anchor);}parent.append(node);}
 function closeSheet(){sheet.hidden=true;}
 function showNotice(message){$('#mobile-notice').textContent=message;$('#mobile-notice').hidden=false;}
 function placeMap(next){
  const preview=$('#mobile-parameters-preview');
  if(next==='parameters'){
   preview.replaceChildren();preview.dataset.base='satellite';preview.append(map);api.showSatellitePreview?.();
   $('#mobile-parameters-body').dataset.mobileInteractive='true';
  }else{
   const host=$('#mobile-map-host');host.append(map);delete preview.dataset.base;
   if(next==='fields'){host.dataset.base='satellite';api.showSatellitePreview?.();}
   else{delete host.dataset.base;api.restoreBaseMap?.();}
  }
 }
 function protectParameterControls(){
  const body=$('#mobile-parameters-body');
  for(const type of ['touchstart','touchend','pointerdown','pointerup'])body.addEventListener(type,event=>{
   if(event.target.closest?.('input,select,textarea'))event.stopPropagation();
  });
 }
 function navigate(next){
  if(!enabled)return;
  if(transaction&&!['parameters','editor'].includes(next)){
   if(globalThis.confirm&&!globalThis.confirm('Uscire senza confermare le modifiche?'))return;
   cancel();return;
  }
  screen=next;document.body.dataset.mobileScreen=next;root.dataset.screen=next;closeSheet();$('#mobile-notice').hidden=true;placeMap(next);
  root.querySelectorAll('[data-screen]').forEach(node=>node.hidden=node.dataset.screen!==next);
  root.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-current',button.dataset.view===(next==='detail'?'fields':next)?'page':'false'));
  $('#mobile-pages').scrollTop=0;
  if(next!=='editor'){api.stopTools();drawing=false;editing=false;}
  placeOrientation();renderField();
  if(next==='fields')renderFields();if(next==='detail')renderDetail();if(next==='projects')renderProjects();
  api.resizeMap();if(next==='map')api.focusAll();
 }
 function placeOrientation(){
  const parent=screen==='editor'?sheet.querySelector('[data-content="orientation"]'):$('.step[data-step="2"]');
  move($('.range-field'),parent);move($('.orientation-presets'),parent);
 }
 function openSheet(name){
  if(!enabled)return;
  if(['perimeter','cuts','orientation'].includes(name)&&screen!=='editor')return;
  const titles={search:'Cerca il terreno',calculator:'Calcolatore rapido',layers:'Livelli mappa',perimeter:'Perimetro',cuts:'Passaggi e aree escluse',orientation:'Orientamento filari'};
  $('#mobile-sheet-title').textContent=titles[name];sheet.querySelectorAll('[data-content]').forEach(node=>node.hidden=node.dataset.content!==name);sheet.hidden=false;
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
  saving=true;$('#mobile-save-field').disabled=true;
  try{await api.saveProject($('#mobile-project-name').value);transaction=false;awaitingPerimeter=false;navigate('map');showNotice('Impianto salvato su questo dispositivo.');}
  catch(error){showNotice(`Salvataggio non riuscito: ${error.message}`);}
  finally{saving=false;$('#mobile-save-field').disabled=false;}
 }
 function metricsHtml(field){const m=api.getMetrics(field);return `<dl class="mobile-metrics">${[
  ['Superficie',area(m.areaM2)],['Superficie netta',area(m.netAreaM2)],['Barbatelle',n(m.simulatedPlants)],['Quantità commerciale',n(m.commercialPlants25)],['Pali intermedi',n(m.intermediatePosts)],['Pali di testa',n(m.headPosts)],['Pali totali',n(m.totalPosts)],['Tratti di filare',n(m.rowCount)],['Metri di filare',`${n(m.rowLinearM)} m`],['Perimetro',`${n(m.perimeterM)} m`]
 ].map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;}
 function preview(field){return renderProjectDiagramSvg({polygon:field.geometry,rows:api.getMetrics(field).rows});}
 function renderFields(){
  const fields=api.getFields().filter(f=>Array.isArray(f?.geometry)&&f.geometry.length>=4),metrics=fields.map(api.getMetrics);
  const sum=key=>metrics.reduce((total,m)=>total+(Number(m[key])||0),0);
  $('#mobile-fields-total').innerHTML=`<strong>${fields.length} campi · ${area(sum('areaM2'))}</strong><span>${n(sum('simulatedPlants'))} barbatelle · ${n(sum('totalPosts'))} pali</span><small>${n(sum('intermediatePosts'))} intermedi · ${n(sum('headPosts'))} di testa</small>`;
  const list=$('#mobile-fields-list');list.replaceChildren();
  if(!fields.length){list.innerHTML='<p class="mobile-empty">Nessun campo disegnato. Aggiungi il primo campo dalla mappa.</p>';return;}
  for(const field of fields){const m=api.getMetrics(field),button=document.createElement('button');button.type='button';button.className='mobile-field-card';button.dataset.fieldId=field.id;button.innerHTML=`<div class="mobile-card-preview">${preview(field)}</div><div><strong>${escape(field.label)}</strong><span>${area(m.areaM2)} · ${n(m.simulatedPlants)} barbatelle</span><small>${escape(field.grapeVariety||'Vitigno da definire')} · ${n(m.totalPosts)} pali</small></div><b aria-hidden="true">›</b>`;button.addEventListener('click',()=>openField(field.id));list.append(button);}
 }
 function openField(id){if(transaction)return;api.selectField(id);navigate('detail');}
 function renderDetail(){
  const field=api.getField();$('#mobile-detail-title').textContent=field.label||'Campo';
  $('#mobile-field-detail').innerHTML=`<div class="mobile-large-preview">${preview(field)}</div>${metricsHtml(field)}<dl class="mobile-materials">${[
   ['Sesto',`${n(field.plantSpacingM)} × ${n(field.rowSpacingM)} m`],['Capezzagne',`${n(field.headlandWidthM)} m`],['Distanza pali',`${n(field.postSpacingM)} m`],['Orientamento',`${n(field.orientationDeg)}°`],['Vitigno',field.grapeVariety||'Da definire'],['Portainnesto',field.rootstock||'Da definire'],['Clone',field.cloneSelection||'Da definire'],['Vendemmia meccanica',field.mechanizedHarvest?'Sì':'No'],['Passaggi / esclusioni',n(field.exclusions?.length)],['Note',field.projectContextNote||'—']
  ].map(([label,value])=>`<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl><p class="mobile-storage-note">Stima preliminare da verificare in fase di progettazione definitiva.</p>`;
 }
 function renderProjects(){
  const list=$('#mobile-projects-list');list.replaceChildren();$('#mobile-project-name').value=api.getField().localProjectName||'Il mio impianto';
  try{const items=api.listProjects();if(!items.length)list.innerHTML='<p class="mobile-empty">Nessun progetto archiviato. La bozza corrente è conservata automaticamente.</p>';
   for(const item of items){const button=document.createElement('button');button.type='button';button.className='mobile-project-card';button.innerHTML=`<strong>${escape(item.name)}</strong><span>${item.project.fields.filter(f=>f.geometry).length} campi · ${new Date(item.savedAt).toLocaleDateString('it-IT')}</span><small>Apri progetto ›</small>`;button.addEventListener('click',()=>{api.loadProject(item);navigate('fields');});list.append(button);}
  }catch(error){showNotice(error.message);}
 }
 function renderField(){
  if(!enabled)return;const field=api.getField();if(!field)return;
  $('#mobile-active-field').textContent=field.geometry?`${field.label} · ${area(api.getMetrics(field).areaM2)} ›`:'I tuoi campi sulla mappa';
  $('#mobile-active-field').disabled=!field.geometry;
  $('#mobile-editor-next').disabled=!field.geometry&&!drawing;
  if(screen==='parameters'){$('#mobile-parameters-metrics').innerHTML=metricsHtml(field);}
  if(screen==='detail')renderDetail();
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
  if(next){
   document.body.classList.add('mobile-app-active');oldAdvancedOpen=$('.advanced').open;
   move(map,$('#mobile-map-host'));
   move($('.field-manager'),$('#mobile-parameters-body'));move($('.step[data-step="2"]'),$('#mobile-parameters-body'));move($('.advanced'),$('#mobile-parameters-body'));$('.advanced').open=true;
   move($('.exclusion-panel'),sheet.querySelector('[data-content="cuts"]'));
   for(const [name,selectors] of Object.entries({search:['.search-shell'],layers:['.segmented','#cadastre-button'],perimeter:['#draw-map-button','#edit-vertices-button','#remove-vertex-button','#clear-field-button','#select-cadastre-button'],cuts:['#exclude-line-button','#exclude-zone-button']}))for(const selector of selectors)move($(selector),sheet.querySelector(`[data-content="${name}"]`));
   move($('#close-perimeter-button'),$('#mobile-drawing-actions'));
   move($('#map-gps-button'),$('.mobile-home-tools'));move($('#center-field-button'),$('.mobile-home-tools'));move($('#north-button'),$('.mobile-home-tools'));
   $('#mobile-project-name').value=api.getField()?.localProjectName||'Il mio impianto';
   screen='map';navigate('map');
  }else{
   api.stopTools();closeSheet();for(const [node,anchor] of homes)anchor.after(node);
   $('.advanced').open=oldAdvancedOpen;
   document.body.classList.remove('mobile-app-active','mobile-drawing','mobile-editing');delete document.body.dataset.mobileScreen;
   map.classList.remove('fullscreen-map');document.body.classList.remove('map-fullscreen-open');
   api.resizeMap();
  }
 }
 root.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.view)navigate(button.dataset.view);if(button.dataset.go)navigate(button.dataset.go);if(button.dataset.sheet)openSheet(button.dataset.sheet);});
 $('#mobile-close-sheet').addEventListener('click',closeSheet);
 $('#mobile-add-field').addEventListener('click',beginNew);$('#mobile-add-from-fields').addEventListener('click',beginNew);
 $('#mobile-active-field').addEventListener('click',()=>openField(api.getField().activeFieldId));
 $('#mobile-edit-parameters').addEventListener('click',()=>edit('parameters'));$('#mobile-edit-map').addEventListener('click',()=>edit('editor'));
 $('#mobile-editor-cancel').addEventListener('click',cancel);$('#mobile-cancel-field').addEventListener('click',cancel);
 $('#mobile-editor-next').addEventListener('click',nextEditor);$('#mobile-parameters-map').addEventListener('click',()=>{navigate('editor');api.focusField();});
 $('#mobile-save-field').addEventListener('click',save);$('#mobile-save-project').addEventListener('click',save);
 $('#mobile-new-project').addEventListener('click',()=>{api.newProject();navigate('map');});
 $('#mobile-undo').addEventListener('click',api.undoPoint);$('#mobile-stop-tool').addEventListener('click',()=>{api.stopTools();drawingState({active:false});});
 $('#mobile-finish-edit').addEventListener('click',()=>{api.stopTools();editingState({active:false});});
 $('#mobile-detail-pdf').addEventListener('click',()=>api.finalAction('report'));$('#mobile-detail-quote').addEventListener('click',()=>api.finalAction('quote'));
 sheet.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;
  if(b.id==='draw-map-button')awaitingPerimeter=true;
  if(b.closest('[data-content="perimeter"]')||['exclude-line-button','exclude-zone-button'].includes(b.id)||b.textContent==='Modifica')closeSheet();
  if(['remove-vertex-button','select-cadastre-button'].includes(b.id))editingState({active:true});
 });
 let forwardingTouch=false,lastTouchButton=null,lastTouchAt=0;
 root.addEventListener('click',(event)=>{
  const button=event.target.closest?.('button');
  if(!forwardingTouch&&button===lastTouchButton&&Date.now()-lastTouchAt<700){event.preventDefault();event.stopImmediatePropagation?.();}
 },true);
 root.addEventListener('pointerup',(event)=>{
  if(event.pointerType!=='touch')return;
  const button=event.target.closest?.('button');if(!button||button.disabled)return;
  event.preventDefault();lastTouchButton=button;lastTouchAt=Date.now();forwardingTouch=true;button.click();forwardingTouch=false;
 });
 for(const id of ['mobile-quick-area','mobile-quick-plants','mobile-quick-rows'])$('#'+id).addEventListener('input',()=>{const result=calculateManualPlants({areaM2:$('#mobile-quick-area').value,plantSpacingM:$('#mobile-quick-plants').value,rowSpacingM:$('#mobile-quick-rows').value});$('#mobile-quick-result').textContent=result.theoreticalPlants?`${n(result.theoreticalPlants)} barbatelle · ordine: ${n(result.commercialPlants25)} (multipli di 25)`:'Inserisci superficie e distanze valide';});
 protectParameterControls();
 const controller={sync,navigate,renderField,drawingState,editingState,geometryCommitted,openField,isHome:()=>enabled&&screen==='map',isActive:()=>enabled};
 sync();
 return controller;
}
