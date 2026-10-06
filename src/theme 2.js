const KEY='vivai-obice:theme:v1';
const CHOICES=new Set(['light','dark','auto']);

export function getTheme(storage=globalThis.localStorage){
  try{const chosen=storage?.getItem(KEY);return CHOICES.has(chosen)?chosen:'light';}
  catch{return 'light';}
}

export function applyTheme({storage=globalThis.localStorage,root=globalThis.document?.documentElement,systemDark=()=>globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches}={}){
  const chosen=getTheme(storage);
  if(root?.dataset)root.dataset.theme=chosen==='auto'?(systemDark()?'dark':'light'):chosen;
  updateThemeToggle(root);
  return chosen;
}

export function setTheme(choice,{storage=globalThis.localStorage,root=globalThis.document?.documentElement,systemDark}={}){
  if(!CHOICES.has(choice))throw new TypeError('Tema non valido');
  try{storage?.setItem(KEY,choice);}catch{}
  if(root?.dataset)root.dataset.theme=choice==='auto'?(systemDark?.()??globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches?'dark':'light'):choice;
  root?.ownerDocument?.querySelectorAll?.('[data-theme-choice]')?.forEach?.(select=>{select.value=choice;});
  updateThemeToggle(root);
  return choice;
}

export function initializeTheme(){
  applyTheme();
  const toggle=globalThis.document?.querySelector?.('#theme-toggle');
  toggle?.addEventListener('click',()=>setTheme(globalThis.document.documentElement.dataset.theme==='dark'?'light':'dark'));
  globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change',()=>{if(getTheme()==='auto')applyTheme();});
}

export function updateThemeToggle(root){
  const toggle=root?.ownerDocument?.querySelector?.('#theme-toggle');
  if(!toggle)return;
  const dark=root.dataset.theme==='dark';
  const label=dark?'Attiva tema chiaro':'Attiva tema scuro';
  toggle.setAttribute('aria-label',label);toggle.setAttribute('title',label);
}
