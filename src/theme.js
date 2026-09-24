const KEY='vivai-obice:theme:v1';
const CHOICES=new Set(['light','dark','auto']);

export function getTheme(storage=globalThis.localStorage){
  try{const chosen=storage?.getItem(KEY);return CHOICES.has(chosen)?chosen:'light';}
  catch{return 'light';}
}

export function applyTheme({storage=globalThis.localStorage,root=globalThis.document?.documentElement,systemDark=()=>globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches}={}){
  const chosen=getTheme(storage);
  if(root?.dataset)root.dataset.theme=chosen==='auto'?(systemDark()?'dark':'light'):chosen;
  return chosen;
}

export function setTheme(choice,{storage=globalThis.localStorage,root=globalThis.document?.documentElement,systemDark}={}){
  if(!CHOICES.has(choice))throw new TypeError('Tema non valido');
  try{storage?.setItem(KEY,choice);}catch{}
  if(root?.dataset)root.dataset.theme=choice==='auto'?(systemDark?.()??globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches?'dark':'light'):choice;
  root?.ownerDocument?.querySelectorAll?.('[data-theme-choice]')?.forEach?.(select=>{select.value=choice;});
  return choice;
}

export function initializeTheme(){
  applyTheme();
  const select=globalThis.document?.querySelector?.('#theme-choice');
  if(select){select.value=getTheme();select.addEventListener('change',()=>setTheme(select.value));}
  globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change',()=>{if(getTheme()==='auto')applyTheme();});
}
