import {createCadastralOverlay} from '../src/cadastral-overlay.js?v=53.2';
import {buildCadastralWmsUrl,buildCadastralIdentifyUrl,CADASTRAL_MIN_ZOOM} from '../src/cadastre.js?v=53.2';
import {createCadastralDwellIdentifier} from '../src/cadastral-identify.js?v=53.2';

export function mountAdminCadastre({map,container,beforeLayerId,fetchImpl=globalThis.fetch}={}) {
  if(!map||!container?.append)throw new TypeError('Admin map and wrapper required');
  const controls=container.ownerDocument.createElement('div');controls.className='admin-cadastre-controls';
  const button=container.ownerDocument.createElement('button');button.type='button';button.textContent='▦ Catasto';button.setAttribute('aria-pressed','false');controls.append(button);
  const status=container.ownerDocument.createElement('div');status.className='admin-cadastre-status';status.textContent='Catasto: fonte Agenzia delle Entrate · dato indicativo';status.hidden=true;container.append(controls,status);
  let active=false;
  const viewport=()=>{
    const bounds=map.getBounds(),canvas=map.getCanvas(),scale=Math.min(2,globalThis.devicePixelRatio||1);
    const west=bounds.getWest(),south=bounds.getSouth(),east=bounds.getEast(),north=bounds.getNorth();
    return {west,south,east,north,width:Math.max(1,Math.round((canvas.clientWidth||canvas.width||1)*scale)),height:Math.max(1,Math.round((canvas.clientHeight||canvas.height||1)*scale)),clientWidth:Math.max(1,canvas.clientWidth||canvas.width||1),clientHeight:Math.max(1,canvas.clientHeight||canvas.height||1)};
  };
  const overlay=createCadastralOverlay({map,requestForViewport:()=>{
    const {west,south,east,north,width,height}=viewport();
    return {url:buildCadastralWmsUrl({west,south,east,north,width,height,mode:'parcels'}),coordinates:[[west,north],[east,north],[east,south],[west,south]]};
  },beforeLayerId:()=>map.getLayer?.(beforeLayerId)?beforeLayerId:undefined,onState:state=>{
    if(active&&state.reason==='zoom')status.textContent='Catasto disponibile dallo zoom 16 · fonte Agenzia delle Entrate';
    if(active&&state.error)status.textContent='Catasto temporaneamente non disponibile';
  }});
  overlay.setOpacity(.6);
  const identifier=createCadastralDwellIdentifier({identify:async(point,signal)=>{
    const {west,south,east,north,width,height,clientWidth,clientHeight}=viewport();
    const url=buildCadastralIdentifyUrl({west,south,east,north,width,height,x:point.x*width/clientWidth,y:point.y*height/clientHeight});
    const response=await fetchImpl(url,{signal,headers:{accept:'application/json'}});
    if(response.status===404)return null;
    if(!response.ok)throw new Error('Identificazione catastale non disponibile');
    return response.json();
  },onState:state=>{
    if(!active)return;
    status.textContent=state.status==='found'?`Foglio ${state.sheet} · Particella ${state.parcel} · fonte Agenzia delle Entrate`:state.status==='zoom'?'Catasto disponibile dallo zoom 16':state.status==='error'?'Identificazione catastale non disponibile · dato indicativo':'Catasto · ferma il puntatore per identificare il mappale · dato indicativo';
  }});
  function setActive(next){active=Boolean(next);button.setAttribute('aria-pressed',String(active));status.hidden=!active;const policy=overlay.setVisible(active);identifier.setEnabled(active&&policy.renderable);if(active&&!policy.renderable)status.textContent='Catasto disponibile dallo zoom 16 · fonte Agenzia delle Entrate';return policy;}
  function move(event){if(active&&map.getZoom()>=CADASTRAL_MIN_ZOOM)identifier.pointerMoved(event.point);}
  function leave(){identifier.cancel();}
  function mapChanged(){identifier.cancel();if(active){const policy=overlay.refresh();identifier.setEnabled(policy.renderable);if(!policy.renderable)status.textContent='Catasto disponibile dallo zoom 16 · fonte Agenzia delle Entrate';}}
  function toggle(){setActive(!active);}
  button.addEventListener('click',toggle);map.on?.('mousemove',move);map.on?.('mouseout',leave);map.on?.('moveend',mapChanged);
  return {setActive,isActive:()=>active,destroy(){setActive(false);identifier.destroy();overlay.destroy();button.removeEventListener('click',toggle);map.off?.('mousemove',move);map.off?.('mouseout',leave);map.off?.('moveend',mapChanged);controls.remove();status.remove();}};
}
