const GROUPS = [
 {key:'field',label:'Campo',layers:['project-geometry-fill','project-geometry-line','other-project-fields-fill','other-project-fields-line','excluded-zones-fill','excluded-zones-line','row-portions-fill','row-portions-outline'],selector:'.map-field-label-overlay, .field-label-marker'},
 {key:'schema',label:'Schema vigneto',layers:['vineyard-rows-line','other-project-rows-line'],selector:null},
 {key:'quotes',label:'Quote',layers:[],selector:'.side-measurement-label'}
];
let controlSequence=0;

// Preferences belong to the map view, never to project/save data. Editor drafts,
// handles, basemaps and cadastral layers deliberately keep their own visibility.
export function createMapOverlayVisibility({map,documentRef=globalThis.document}={}){
 const host=map.getContainer();
 const controlHost=host.closest?.('.map-wrap')??host;
 const state={field:true,schema:true,quotes:true};
 let control=null;
 function refresh(){
  for(const group of GROUPS){
   const visible=state[group.key],value=visible?'visible':'none';
   host.setAttribute?.(`data-map-${group.key}-visible`,String(visible));
   for(const id of group.layers){
    const layer=map.getLayer(id);if(!layer)continue;
    const current=map.getLayoutProperty?.(id,'visibility')??layer.layout?.visibility??'visible';
    if(current!==value)map.setLayoutProperty?.(id,'visibility',value);
   }
   if(group.selector){
    // Hide the HTML label overlay parent: its viewport updates can safely keep
    // positioning individual labels without showing a hidden field again.
    for(const element of host.querySelectorAll?.(group.selector)??[]){
     if(element.classList.contains('field-label-marker')&&element.closest('.map-field-label-overlay'))continue;
     element.style.display=visible?'':'none';
    }
   }
   const input=control?.querySelector(`[data-map-visibility="${group.key}"]`);
   if(input)input.checked=visible;
  }
  control?.classList.toggle('has-hidden-overlays',Object.values(state).some(value=>!value));
 }
 function set(next={}){
  for(const key of Object.keys(state))if(typeof next[key]==='boolean')state[key]=next[key];
  refresh();return {...state};
 }
 if(host?.append&&documentRef?.createElement){
  control=documentRef.createElement('div');control.className='map-visibility-control';
  const panelId=`map-visibility-panel-${++controlSequence}`;
  control.innerHTML=`<button type="button" class="map-visibility-trigger" data-map-visibility-trigger aria-label="Visibilità mappa" title="Visibilità mappa" aria-expanded="false" aria-controls="${panelId}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button><div class="map-visibility-panel" id="${panelId}" role="group" aria-label="Elementi visibili sulla mappa" hidden><strong>Visibilità mappa</strong>${GROUPS.map(({key,label})=>`<label><input type="checkbox" data-map-visibility="${key}" checked><span>${label}</span></label>`).join('')}<button type="button" data-map-visibility-restore>Mostra tutto</button></div>`;
  const trigger=control.querySelector('[data-map-visibility-trigger]'),panel=control.querySelector('.map-visibility-panel');
  function close(restoreFocus=false){panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(restoreFocus)trigger.focus?.();}
  trigger.addEventListener('click',()=>{panel.hidden=!panel.hidden;trigger.setAttribute('aria-expanded',String(!panel.hidden));});
  for(const input of control.querySelectorAll('[data-map-visibility]'))input.addEventListener('change',()=>set({[input.dataset.mapVisibility]:input.checked}));
  control.querySelector('[data-map-visibility-restore]').addEventListener('click',()=>set({field:true,schema:true,quotes:true}));
  // Native checkbox/keyboard behavior is preserved while map drawing, gestures
  // and Escape/Enter editor shortcuts cannot consume the panel's events.
  for(const type of ['click','dblclick','pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','touchmove','wheel'])control.addEventListener(type,event=>event.stopPropagation(),{passive:true});
  control.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close(true);}});
  control.addEventListener('focusout',event=>{if(event.relatedTarget&&!control.contains(event.relatedTarget))close();});
  const outside=event=>{if(!control.contains(event.target))close();};
  documentRef.addEventListener('pointerdown',outside);
  controlHost.append(control);
  map.on?.('remove',()=>{documentRef.removeEventListener('pointerdown',outside);map.off?.('styledata',refresh);control.remove();});
 }
 map.on?.('styledata',refresh);
 refresh();
 return {set,refresh,state:()=>({...state})};
}
