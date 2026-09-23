export function createDesktopQuickCalculator({document=globalThis.document}={}){
 const dialog=document?.querySelector?.('#quick-calculator-dialog');
 const trigger=document?.querySelector?.('#quick-calculator-trigger');
 const closeButton=document?.querySelector?.('#quick-calculator-close');
 const open=()=>{if(!dialog)return;if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');};
 const close=()=>{if(!dialog)return;if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');};
 const mount=()=>{trigger?.addEventListener('click',open);closeButton?.addEventListener('click',close);dialog?.addEventListener('click',event=>{if(event.target===dialog)close();});};
 return{mount,open,close};
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

export function createCadastreMenu({document=globalThis.document,isActive=()=>false,setActive=()=>{},onSelect=()=>{}}={}){
 const button=document?.querySelector?.('#cadastre-button'),menu=document?.querySelector?.('#cadastre-menu'),select=document?.querySelector?.('#select-cadastre-button');
 function close(){if(menu)menu.hidden=true;button?.setAttribute('aria-expanded','false');}
 function sync(active,{open=false}={}){
  button?.classList.toggle('active',Boolean(active));button?.setAttribute('aria-pressed',String(Boolean(active)));
  if(select)select.disabled=!active;
  if(active&&open){menu.hidden=false;button?.setAttribute('aria-expanded','true');}else close();
 }
 function mount(){
  button?.addEventListener('click',()=>{const next=!isActive();setActive(next);sync(next,{open:next});});
  select?.addEventListener('click',()=>{onSelect();close();});
  sync(isActive());return controller;
 }
 const controller={mount,sync,close};return controller;
}
