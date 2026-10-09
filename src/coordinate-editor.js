import {toUTM,fromUTM} from './coordinate-system.js?v=1.3.6';
import {polygonMetrics} from './geometry.js?v=45';
const systems=['EPSG:4326','EPSG:32632','EPSG:32633','EPSG:32634'];
export function parseCoordinateNumber(value){
 const text=String(value).trim();
 if(!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(text))throw new RangeError('Inserisci un numero decimale valido.');
 const number=Number(text.replace(',','.'));if(!Number.isFinite(number))throw new RangeError('Coordinate non valide.');return number;
}
export function validateCoordinate(point){if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||Math.abs(point[0])>180||Math.abs(point[1])>90)throw new RangeError('Coordinate WGS84 fuori intervallo.');return point;}
export function createCoordinateDraft(coordinate,crs='EPSG:4326'){
 validateCoordinate(coordinate);if(!systems.includes(crs))throw new RangeError('Sistema di coordinate non supportato.');
 const original=[...coordinate],projected=crs==='EPSG:4326'?original:toUTM(original,Number(crs.slice(5))),values=projected.map(String);
 return {values,read(input){const parsed=input.map(parseCoordinateNumber);if(parsed.length!==2)throw new RangeError('Inserisci entrambe le coordinate.');if(parsed.every((n,i)=>n===projected[i]))return [...original];if(crs==='EPSG:4326')return validateCoordinate(parsed);if(parsed[0]<100000||parsed[0]>900000||parsed[1]<0||parsed[1]>9500000)throw new RangeError('Coordinate UTM fuori intervallo.');return validateCoordinate(fromUTM(parsed,Number(crs.slice(5))));}};
}
function crosses(a,b,c,d){
 const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
 const on=(p,q,r)=>Math.abs(cross(p,q,r))<1e-18&&r[0]>=Math.min(p[0],q[0])&&r[0]<=Math.max(p[0],q[0])&&r[1]>=Math.min(p[1],q[1])&&r[1]<=Math.max(p[1],q[1]);
 const x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);
 return x*y<0&&z*w<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
}
export function validateCoordinateRing(ring){
 if(!Array.isArray(ring)||ring.length<4)throw new RangeError('Servono almeno tre vertici distinti.');ring.forEach(validateCoordinate);
 const points=ring.slice(0,-1),n=points.length;
 if(ring[0].some((v,i)=>v!==ring.at(-1)[i])||new Set(points.map(p=>p.join(','))).size!==n)throw new RangeError('Servono vertici distinti e un anello chiuso.');
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){if(j===i+1||i===0&&j===n-1)continue;if(crosses(points[i],points[(i+1)%n],points[j],points[(j+1)%n]))throw new RangeError('Il contorno si incrocia. Correggi le coordinate.');}
 if(polygonMetrics(ring).areaM2<=1e-8)throw new RangeError('Il contorno deve avere una superficie non nulla.');return ring;
}
export function replaceRingVertex(ring,index,coordinate){
 if(!Number.isInteger(index)||index<0||index>=ring.length-1)throw new RangeError('Vertice non disponibile.');validateCoordinate(coordinate);
 const next=ring.map(p=>[...p]);next[index]=[...coordinate];next[next.length-1]=[...next[0]];return validateCoordinateRing(next);
}
export function createCoordinateEditor({document}){
 let node=null,returnFocus=null,pending=null,openVersion=0,closeCallback=null;
 function close(){const dialog=node,focus=returnFocus,operation=pending,notify=closeCallback;node=null;returnFocus=null;pending=null;closeCallback=null;dialog?.remove();operation?.controller.abort();try{notify?.();}catch{}if(node===null)focus?.focus?.();}
 function open({coordinate,title='Coordinate punto',isCurrent=()=>true,onApply=()=>{},trigger=null,onClose=null}){
  const version=++openVersion;close();if(version!==openVersion)return node;returnFocus=trigger;let draft=createCoordinateDraft(coordinate);
  closeCallback=typeof onClose==='function'?onClose:null;
  node=document.createElement('div');node.className='coordinate-dialog';node.setAttribute('role','dialog');node.setAttribute('aria-modal','true');node.setAttribute('aria-label',title);
  const dialog=node;
  const closeDialog=()=>{if(node===dialog)close();};
  const heading=document.createElement('strong');heading.textContent=title;node.append(heading);
  const form=document.createElement('form');node.append(form);
  const label=document.createElement('label');label.textContent='Sistema di coordinate';const select=document.createElement('select');label.append(select);form.append(label);
  for(const crs of systems){const option=document.createElement('option');option.value=crs;option.textContent=crs==='EPSG:4326'?'WGS84 · EPSG:4326':`WGS84 UTM ${crs.slice(-2)}N · ${crs}`;if(crs==='EPSG:4326')option.setAttribute('selected','');select.append(option);}
  const inputs=[],labels=[];
  for(let i=0;i<2;i++){const l=document.createElement('label'),caption=document.createElement('span'),input=document.createElement('input');input.type='text';input.inputMode='decimal';input.required=true;input.autocomplete='off';l.append(caption,input);form.append(l);inputs.push(input);labels.push(caption);}
  const error=document.createElement('p');error.className='coordinate-error';error.setAttribute('role','alert');form.append(error);
  const actions=document.createElement('div');actions.className='coordinate-actions';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Annulla';cancel.setAttribute('data-coordinate-cancel','');cancel.addEventListener('click',closeDialog);const apply=document.createElement('button');apply.type='submit';apply.textContent='Applica';actions.append(cancel,apply);form.append(actions);
  function lock(value){apply.disabled=value;select.disabled=value;for(const input of inputs)input.disabled=value;if(value)cancel.focus?.();}
  function reset(){if(node!==dialog||pending)return;try{draft=createCoordinateDraft(coordinate,select.value);draft.values.forEach((v,i)=>inputs[i].value=v);labels[0].textContent=select.value==='EPSG:4326'?'Longitudine (°)':'Est (m)';labels[1].textContent=select.value==='EPSG:4326'?'Latitudine (°)':'Nord (m)';error.textContent='';apply.disabled=false;}catch(e){error.textContent=e.message;apply.disabled=true;}}
  select.addEventListener('change',reset);reset();
  form.addEventListener('submit',event=>{
   event.preventDefault();if(node!==dialog||pending)return;const allowed=isCurrent();if(node!==dialog||pending)return;if(!allowed){closeDialog();return;}
   let operation;
   const current=()=>{if(node!==dialog||pending!==operation||operation.controller.signal.aborted)return false;const allowed=isCurrent();if(node!==dialog||pending!==operation||operation.controller.signal.aborted)return false;if(!allowed){closeDialog();return false;}return true;};
   const finish=(message=null)=>{if(!current())return;if(message===null){closeDialog();return;}pending=null;lock(false);error.textContent=message;};
   try{
    const point=draft.read(inputs.map(input=>input.value));if(node!==dialog||pending)return;const allowed=isCurrent();if(node!==dialog||pending)return;if(!allowed){closeDialog();return;}
    if(!point.some((v,i)=>v!==coordinate[i])){closeDialog();return;}
    operation={controller:new AbortController()};pending=operation;lock(true);error.textContent='';
    if(!current())return;
    const result=onApply(point,{signal:operation.controller.signal});
    if(result!=null&&typeof result.then==='function')Promise.resolve(result).then(()=>finish(),()=>finish('Non è stato possibile applicare le coordinate. Riprova.'));
    else finish();
   }catch(e){const message=e?.message??'Non è stato possibile applicare le coordinate. Riprova.';if(operation)finish(message);else if(node===dialog&&!pending){const allowed=isCurrent();if(node!==dialog||pending)return;if(!allowed)closeDialog();else error.textContent=message;}}
  });
  node.addEventListener('keydown',event=>{if(node!==dialog)return;if(event.key==='Escape'){event.preventDefault();closeDialog();}else if(event.key==='Tab'){const focusable=[select,...inputs,cancel,apply].filter(control=>!control.disabled),current=focusable.indexOf(document.activeElement);if(event.shiftKey&&current===0){event.preventDefault();focusable.at(-1)?.focus?.();}else if(!event.shiftKey&&current===focusable.length-1){event.preventDefault();focusable[0]?.focus?.();}}});
  document.body.append(node);inputs[0].focus?.();return node;
 }
 return {open,close,destroy:close};
}
