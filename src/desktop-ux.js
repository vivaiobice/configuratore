function formatItalianInteger(value){
 const integer=Math.trunc(Number(value));
 return integer>0?String(integer).replace(/\B(?=(\d{3})+(?!\d))/g,'.'):'—';
}

export function setToolButtonLabel(button,label,{icon}={}){
 if(!button)return;
 const labelNode=button.querySelector?.('.tool-label');
 const iconNode=button.querySelector?.('.tool-icon');
 if(labelNode){labelNode.textContent=label;if(icon!==undefined&&iconNode)iconNode.textContent=icon;return;}
 button.textContent=icon===undefined?label:`${icon} ${label}`;
}

export function createDesktopQuickCalculator({document=globalThis.document,calculate=null,onCalculate=()=>{}}={}){
 const dialog=document?.querySelector?.('#quick-calculator-dialog');
 const trigger=document?.querySelector?.('#quick-calculator-trigger');
 const closeButton=document?.querySelector?.('#quick-calculator-close');
 const area=document?.querySelector?.('#manual-area');
 const plantSpacing=document?.querySelector?.('#manual-plant-spacing');
 const rowSpacing=document?.querySelector?.('#manual-row-spacing');
 const theoretical=document?.querySelector?.('#manual-theoretical');
 const commercial=document?.querySelector?.('#manual-commercial');
 const open=()=>{if(!dialog)return;if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');};
 const close=()=>{if(!dialog)return;if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');};
 const render=()=>{
  if(typeof calculate!=='function')return;
  const result=calculate({areaM2:area?.value,rowSpacingM:rowSpacing?.value,plantSpacingM:plantSpacing?.value});
  if(theoretical)theoretical.textContent=formatItalianInteger(result?.theoreticalPlants);
  if(commercial)commercial.textContent=formatItalianInteger(result?.commercialPlants25);
 };
 const mount=()=>{
  trigger?.addEventListener('click',()=>{open();render();});closeButton?.addEventListener('click',close);
  dialog?.addEventListener('click',event=>{if(event.target===dialog)close();});
  for(const input of [area,plantSpacing,rowSpacing])input?.addEventListener('input',render);
  area?.addEventListener('change',()=>{const value=Number(area.value);if(Number.isFinite(value)&&value>0)onCalculate(value);});
  return controller;
 };
 const controller={mount,open,close,render};return controller;
}

export function createDesktopFieldSelectors({document=globalThis.document,onSelect=()=>{}}={}){
 const selectors=['#field-select','#map-field-select'];
 const nodes=()=>selectors.map(selector=>document?.querySelector?.(selector)).filter(Boolean);
 function render(fields=[],activeId=''){
  for(const select of nodes()){
   select.replaceChildren();
   for(const field of fields){const option=document.createElement('option');option.value=field.id;option.textContent=field.label;option.selected=field.id===activeId;select.append(option);}
  }
 }
 function mount(){
  for(const select of nodes())select.addEventListener('change',event=>{
   const target=event.target;
   const value=target.value??target.selectedOptions?.[0]?.value??[...(target.options??[])].find(option=>option.selected)?.value;
   if(value)onSelect(value);
  });
  return controller;
 }
 const controller={mount,render};return controller;
}

export function createDesktopMapSearchAction({document=globalThis.document}={}){
 const button=document?.querySelector?.('#map-search-button');
 const panel=document?.querySelector?.('#map-search-form');
 const input=document?.querySelector?.('#map-search-input');
 function setOpen(open){if(!panel)return;panel.hidden=!open;button?.setAttribute?.('aria-expanded',String(open));button?.closest?.('.map-search-control')?.classList?.toggle('is-open',open);if(open){input?.focus?.();input?.select?.();}}
 function activate(){setOpen(Boolean(panel?.hidden));}
 function mount(){button?.addEventListener('click',activate);return controller;}
 const controller={mount,activate,close:()=>setOpen(false)};return controller;
}

export function createSaveFeedback(button,{idleLabel='Salva il progetto'}={}){
 const set=(label,state,disabled=false)=>{if(!button)return;button.textContent=label;button.dataset.saveState=state;button.disabled=disabled;};
 return{
  saving:()=>set('Salvataggio…','saving',true),
  saved:()=>set('✓ Progetto salvato','saved'),
  dirty:()=>set(idleLabel,'dirty'),
  error:()=>set('Salvataggio non riuscito','error')
 };
}

export function createDesktopMapFieldAction({document=globalThis.document,addField=()=>{},finishDraw=()=>{}}={}){
 const button=document?.querySelector?.('#map-add-field-button');
 let drawing=false,canClose=false,blocked=false;
 function render(){
  if(!button)return;
  button.innerHTML=drawing?'<b aria-hidden="true">✓</b><span>Chiudi perimetro</span>':'<b aria-hidden="true">＋</b><span>Aggiungi campo</span>';
  button.disabled=blocked||(drawing&&!canClose);
  button.classList.toggle('is-closing',drawing);
 }
 function activate(){if(blocked||(drawing&&!canClose))return;if(drawing)finishDraw();else addField();}
 function mount(){button?.addEventListener('click',activate);render();return controller;}
 function drawingState({active=false,mode='perimeter',canClose:ready=false}={}){drawing=Boolean(active&&mode==='perimeter');blocked=Boolean(active&&mode!=='perimeter');canClose=Boolean(ready);render();}
 const controller={mount,drawingState};return controller;
}

export function createCadastreToggle({document=globalThis.document,isActive=()=>false,setActive=()=>{}}={}){
 const button=document?.querySelector?.('#cadastre-button');
 const disclosures=[document?.querySelector?.('#cadastre-attribution'),document?.querySelector?.('#cadastre-notice')].filter(Boolean);
 function sync(active){
  const next=Boolean(active);
  button?.classList.toggle('active',next);
  button?.setAttribute('aria-pressed',String(next));
  for(const disclosure of disclosures)disclosure.hidden=!next;
 }
 function mount(){button?.addEventListener('click',()=>{const next=!isActive();setActive(next);sync(next);});sync(isActive());return controller;}
 const controller={mount,sync};return controller;
}
