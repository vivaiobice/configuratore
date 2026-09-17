// Mobile presentation reuses the existing controls and their event handlers.
// Every moved element has an anchor so desktop order is restored verbatim.
export function createMobileUI({isMobile, setFullscreen, getField, stopTools, finishEdit, undoPoint}) {
  const $=s=>document.querySelector(s);
  const map=$('.map-wrap');
  const homes=new Map();
  let enabled=false, drawing=false, editing=false;
  const nav=document.createElement('nav');
  nav.className='mobile-navigation mobile-only';
  nav.setAttribute('aria-label','Navigazione progetto');
  nav.innerHTML='<button type="button" data-view="project">Progetto</button><button type="button" data-view="fields">Campi</button><button type="button" data-view="map">Mappa</button>';
  document.body.append(nav);
  const controls=document.createElement('div');
  controls.className='mobile-map-controls mobile-only';
  controls.innerHTML='<button type="button" data-sheet="field" class="mobile-field-title">Campo</button><div class="mobile-map-menu"><button type="button" data-sheet="layers">Livelli</button><button type="button" data-sheet="perimeter">Perimetro</button><button type="button" data-sheet="cuts">Passaggi / esclusioni</button></div>';
  map.append(controls);
  const sheet=document.createElement('section');
  sheet.className='mobile-sheet mobile-only'; sheet.hidden=true;
  sheet.setAttribute('role','dialog'); sheet.setAttribute('aria-label','Strumenti del progetto');
  sheet.innerHTML='<div class="mobile-sheet-handle"></div><header><strong id="mobile-sheet-title"></strong><button type="button" aria-label="Chiudi pannello">Chiudi</button></header><div data-content="fields"></div><div data-content="field"><p id="mobile-field-info"></p><button type="button" id="mobile-field-settings">Parametri d’impianto</button></div><div data-content="layers"></div><div data-content="perimeter"></div><div data-content="cuts"></div>';
  document.body.append(sheet);
  const actions=document.createElement('div'); actions.className='mobile-draw-actions mobile-only'; actions.hidden=true;
  actions.innerHTML='<button type="button" data-action="cancel">Annulla disegno</button><button type="button" data-action="undo">↶ Ultimo punto</button><button type="button" data-action="finish">Fine modifica</button>';
  map.append(actions);
  const detailButton=document.createElement('button'); detailButton.type='button';detailButton.className='mobile-summary-toggle mobile-only';detailButton.textContent='Mostra dettagli e pali';detailButton.setAttribute('aria-expanded','false');
  $('.map-summary').append(detailButton);
  detailButton.addEventListener('click',()=>{
    const open=$('.map-summary').classList.toggle('mobile-details-open');
    detailButton.setAttribute('aria-expanded',String(open));detailButton.textContent=open?'Nascondi dettagli':'Mostra dettagli e pali';
  });
  function move(node,parent){if(!node)return;if(!homes.has(node)){const anchor=document.createComment('mobile-home');node.before(anchor);homes.set(node,anchor);}parent.append(node);}
  function closeSheet(){sheet.hidden=true;document.querySelectorAll('[data-sheet]').forEach(b=>b.setAttribute('aria-expanded','false'));}
  function openSheet(name){
    if(!enabled)return;
    closeSheet();
    const titles={fields:'I tuoi campi',field:'Campo selezionato',layers:'Livelli della mappa',perimeter:'Perimetro del campo',cuts:'Passaggi e aree escluse'};
    $('#mobile-sheet-title').textContent=titles[name];
    sheet.querySelectorAll('[data-content]').forEach(n=>n.hidden=n.dataset.content!==name);
    sheet.hidden=false;renderField();
    controls.querySelector(`[data-sheet="${name}"]`)?.setAttribute('aria-expanded','true');
  }
  sheet.querySelector('header button').addEventListener('click',closeSheet);
  controls.addEventListener('click',e=>{const button=e.target.closest('[data-sheet]');if(button)openSheet(button.dataset.sheet);});
  nav.addEventListener('click',e=>{
    const view=e.target.closest('[data-view]')?.dataset.view;if(!view)return;
    if(view==='fields'){openSheet('fields');return;}
    closeSheet();setFullscreen(view==='map');
    if(view==='project')window.scrollTo({top:0,behavior:'smooth'});
  });
  $('#mobile-field-settings').addEventListener('click',()=>{closeSheet();setFullscreen(false);$('.step[data-step="2"]').scrollIntoView({behavior:'smooth',block:'start'});});
  actions.querySelector('[data-action="cancel"]').addEventListener('click',()=>{stopTools();actions.hidden=true;});
  actions.querySelector('[data-action="undo"]').addEventListener('click',undoPoint);
  actions.querySelector('[data-action="finish"]').addEventListener('click',()=>{stopTools();finishEdit();});
  // Exit the sheet after choosing a drawing tool, but keep layer toggles open.
  sheet.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.closest('[data-content="perimeter"]')||['exclude-zone-button','exclude-line-button'].includes(b.id)||b.textContent==='Modifica')closeSheet();
    if(['remove-vertex-button','select-cadastre-button'].includes(b.id))editingState({active:true});
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet();});
  function renderField(){
    const field=getField();if(!field)return;
    $('.mobile-field-title').textContent=field.label||'Campo';
    $('#mobile-field-info').textContent=`${field.label||'Campo'} · ${$('#summary-area')?.textContent||'—'}`;
  }
  function sync(){
    enabled=isMobile();
    if(enabled){
      const groups={fields:['.field-manager'],layers:['.segmented','#cadastre-button'],perimeter:['#draw-map-button','#edit-vertices-button','#remove-vertex-button','#clear-field-button','#select-cadastre-button'],cuts:['#exclude-line-button','#exclude-zone-button','#fullscreen-exclusions']};
      for(const [group,selectors] of Object.entries(groups))for(const s of selectors){
        const node=$(s);
        if(group==='layers'&&!map.classList.contains('fullscreen-map')){if(homes.has(node))homes.get(node).after(node);}
        else move(node,sheet.querySelector(`[data-content="${group}"]`));
      }
      move($('#close-perimeter-button'),actions);
      for(const [id,label] of [['summary-save-project','Salva'],['summary-open-report','PDF'],['summary-request-quote','Preventivo']]){
        const button=$('#'+id);if(!button.dataset.desktopLabel)button.dataset.desktopLabel=button.textContent;button.textContent=label;
      }
    }else{
      closeSheet();for(const [node,anchor] of homes)anchor.after(node);
      for(const b of document.querySelectorAll('[data-desktop-label]'))b.textContent=b.dataset.desktopLabel;
    }
    const full=map.classList.contains('fullscreen-map');
    nav.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-current',(b.dataset.view===(full?'map':'project'))?'page':'false'));
    if(!full){closeSheet();drawing=false;editing=false;actions.hidden=true;map.classList.remove('mobile-tool-active');}
    renderField();
  }
  function drawingState({active,vertexCount=0}){
    drawing=active;if(!enabled)return;
    if(active)closeSheet();actions.hidden=!(drawing||editing);
    actions.querySelector('[data-action="cancel"]').hidden=!active;
    actions.querySelector('[data-action="undo"]').hidden=!active;
    actions.querySelector('[data-action="undo"]').disabled=vertexCount===0;
    actions.querySelector('[data-action="finish"]').hidden=active||!editing;
    map.classList.toggle('mobile-tool-active',drawing||editing);
  }
  function editingState({active}){
    editing=active;if(!enabled)return;
    if(active)closeSheet();drawingState({active:drawing});
  }
  sync();
  return {sync,renderField,drawingState,editingState};
}
