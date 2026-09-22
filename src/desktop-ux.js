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
