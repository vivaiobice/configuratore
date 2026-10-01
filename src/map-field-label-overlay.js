import {interiorLabelPoint} from './geometry.js';

// The map's HTML overlay remains above raster, row, and draw layers. Its labels
// are rebuilt from every project field, independent of the selected field.
export function createMapFieldLabelOverlay({map,documentRef=globalThis.document}={}){
 const host=map?.getContainer?.();
 if(!host?.append||!documentRef?.createElement||!map?.project)return null;
 const layer=documentRef.createElement('div');layer.className='map-field-label-overlay';layer.setAttribute('aria-hidden','true');host.append(layer);
 let labels=[];
 const update=()=>{
  for(const {label,point} of labels){
   const projected=map.project(point);
   if(!Number.isFinite(projected?.x)||!Number.isFinite(projected?.y))continue;
   label.style.left=`${projected.x}px`;label.style.top=`${projected.y}px`;
  }
 };
 for(const event of ['move','resize','load'])map.on?.(event,update);
 return {setFields(fields=[]){
   labels=[];layer.replaceChildren();
   for(const field of fields){
    const point=interiorLabelPoint(field?.geometry);if(!point)continue;
    const label=documentRef.createElement('span');label.className='field-label-marker';
    label.textContent=String(field.label??'Campo').trim()||'Campo';layer.append(label);labels.push({label,point});
   }
   update();
  },destroy(){for(const event of ['move','resize','load'])map.off?.(event,update);layer.remove();labels=[];}};
}
