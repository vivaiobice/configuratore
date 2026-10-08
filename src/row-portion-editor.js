import {resolveRowPortions,updateRowPortion,portionAtCoordinate} from './row-portions.js?v=1.3.1';
import {normalizeRowCurvePoints,curvePointToLonLat,lonLatToCurvePoint,getRowCurveSegments} from './row-curves.js?v=1.3.1';
import {nextCurveControlPoint} from './row-curve-control-state.js';

export function rowPortionEditorState(project={},activeId=null,resolved=null){
 const portions=resolved??resolveRowPortions({...project,polygon:project.geometry});
 const enabled=portions.length>1||(portions.length>0&&Boolean(project.rowPortions?.length));
 const active=enabled?(portions.find(p=>p.id===activeId)??portions[0]):null;
 const local=active?.mode==='local';
 return {enabled,portions,active,orientationDeg:active?.orientationDeg??project.orientationDeg,
  points:active?(local?normalizeRowCurvePoints(active.rowCurvePoints):[]):normalizeRowCurvePoints(project.rowCurvePoints),
  maintainRowEquidistance:(active??project).maintainRowEquidistance!==false,
  context:{polygon:active?.geometry[0]??project.geometry,orientationDeg:active?.orientationDeg??project.orientationDeg,exclusions:active?[]:(project.exclusions??[])}};
}

export function rowPortionDesignPatch(project,activeId,patch){
 const state=rowPortionEditorState(project,activeId);
 return state.active?{rowPortions:updateRowPortion(state.portions,state.active.id,patch)}:patch;
}

// The local guide's bounding-box centre may lie outside a concave component or
// in a hole. Start at its interior anchor; later additions prefer free positions.
export function nextPortionCurvePoint(portion,points=[],id){
 const polygon=portion.geometry[0],orientationDeg=portion.orientationDeg;
 const context={polygon,orientationDeg},target=nextCurveControlPoint(points,getRowCurveSegments(context),id);
 const valid=point=>portionAtCoordinate([portion],curvePointToLonLat({...context,point}))&&points.every(p=>Math.abs(p.position-point.position)>=.001);
 if(points.length&&valid(target))return target;
 const candidates=[portion.anchor];
 const xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 for(let y=1;y<20;y++)for(let x=1;x<20;x++)candidates.push([minX+(maxX-minX)*x/20,minY+(maxY-minY)*y/20]);
 const controls=candidates.filter(c=>c&&portionAtCoordinate([portion],c)).map(coordinate=>normalizeRowCurvePoints([lonLatToCurvePoint({...context,coordinate,id})])[0]).filter(p=>p&&valid(p));
 if(points.length)controls.sort((a,b)=>Math.abs(a.position-target.position)-Math.abs(b.position-target.position));
 return controls[0]??null;
}

export function renderRowPortionPicker(container,state,onSelect){
 if(!container)return;
 container.replaceChildren();container.hidden=!state.enabled;
 if(!state.enabled)return;
 const document=container.ownerDocument,title=document.createElement('strong');title.textContent='Porzione da progettare';container.append(title);
 const group=document.createElement('div');group.className='row-portion-buttons';group.setAttribute('role','group');group.setAttribute('aria-label','Porzione da progettare');
 for(const portion of state.portions){const button=document.createElement('button');button.type='button';button.textContent=portion.label;button.dataset.portionId=portion.id;button.setAttribute('aria-pressed',String(portion.id===state.active?.id));button.addEventListener('click',()=>onSelect(portion.id));group.append(button);}
 container.append(group);
 if(state.active?.mode==='inherited'){const copy=document.createElement('p');copy.className='row-portion-note';copy.textContent='Disegno precedente mantenuto. Modifica direzione o aggiungi un punto per progettare questa porzione.';container.append(copy);}
 if(state.active?.conflict){const copy=document.createElement('p');copy.className='row-portion-conflict';copy.setAttribute('role','status');copy.textContent=`Porzioni unite: mantenuto il disegno di ${state.active.label}. Le altre curve non sono state unite. Modifica direzione o curva per confermare questo disegno.`;container.append(copy);}
}
