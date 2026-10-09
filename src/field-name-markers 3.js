import {interiorLabelPoint} from './geometry.js';
export function createFieldNameMarkers({map,maplibregl=globalThis.maplibregl,documentRef=globalThis.document}={}){
 let markers=[];
 const clear=()=>{for(const marker of markers)marker.remove();markers=[];};
 return {setFields(fields=[]){clear();if(!documentRef||typeof maplibregl?.Marker!=='function')return;for(const field of fields){const point=interiorLabelPoint(field.geometry);if(!point)continue;const element=documentRef.createElement('div');element.className='field-label-marker';element.textContent=field.label||'Campo';markers.push(new maplibregl.Marker({element,anchor:'center'}).setLngLat(point).addTo(map));}},destroy:clear};
}
