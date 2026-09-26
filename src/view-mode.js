const KEY='vivai-obice:view-mode:v1';
const MODES=new Set(['auto','mobile','desktop']);

export function createViewMode({storage=globalThis.localStorage,isTablet=()=>Math.min(globalThis.screen?.width??0,globalThis.screen?.height??0)>=700&&(Number(globalThis.navigator?.maxTouchPoints)>=2||Boolean(globalThis.matchMedia?.('(pointer: coarse)')?.matches)),autoMobile=()=>Boolean(globalThis.matchMedia?.('(max-width: 800px), (max-width: 1100px) and (pointer: coarse)')?.matches)}={}){
  function get(){try{const value=storage?.getItem(KEY);return MODES.has(value)?value:'auto';}catch{return 'auto';}}
  function set(value){if(!MODES.has(value))throw new TypeError('Visualizzazione non valida');try{storage?.setItem(KEY,value);}catch{}return value;}
  function isMobile(){if(!isTablet())return autoMobile();const choice=get();return choice==='mobile'||choice==='auto'&&autoMobile();}
  return {get,set,isMobile,isTablet};
}
