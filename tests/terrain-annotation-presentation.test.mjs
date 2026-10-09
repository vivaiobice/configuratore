import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createTerrainAnnotationPresentation} from '../src/terrain-annotation-presentation.js';
function fixture(){
 const {document}=parseHTML('<div id="map"></div>'),host=document.querySelector('#map'),listeners=new Map(),scale={},controls=new Set([scale]);
 const map={getContainer:()=>host,project:([x,y])=>({x:x*10,y:y*10}),unproject(){assert.fail('annotation projection must not read terrain pixels');},on(type,fn){listeners.set(type,fn);},off(type,fn){if(listeners.get(type)===fn)listeners.delete(type);},removeControl(control){assert.equal(control,scale);controls.delete(control);},addControl(control,position){assert.equal(control,scale);assert.equal(position,'bottom-left');controls.add(control);}};
 const makeMarker=(point,text)=>{const element=document.createElement('div');element.className='side-measurement-label';element.textContent=text;host.append(element);return {point,attached:true,element,getElement:()=>element,getLngLat:()=>({lng:point[0],lat:point[1]}),remove(){this.attached=false;element.remove();},addTo(value){assert.equal(value,map);this.attached=true;host.append(element);return this;}};};
 return {map,host,scale,controls,listeners,makeMarker,presentation:createTerrainAnnotationPresentation({map,scaleControl:scale,documentRef:document})};
}
test('native quote labels project without GPU markers and restore exact 2D marker/control identities',()=>{
 const f=fixture(),marker=f.makeMarker([2,3],'40 m');marker.element.style.display='none';
 f.presentation.setActive(true,[marker]);assert.equal(marker.attached,false);assert.equal(f.controls.has(f.scale),false);const label=f.host.querySelector('.side-measurement-label');assert.notEqual(label,marker.element);assert.equal(label.textContent,'40 m');assert.equal(label.style.display,'none');assert.match(label.style.transform,/20px, 30px/);
 marker.point[0]=5;f.listeners.get('render')();assert.match(label.style.transform,/50px, 30px/);
 label.style.display='';f.presentation.setActive(false,[marker]);assert.equal(marker.attached,true);assert.equal(marker.element.style.display,'');assert.equal(f.controls.has(f.scale),true);assert.equal(f.host.querySelectorAll('.side-measurement-label').length,1);assert.equal(f.listeners.size,0);f.presentation.destroy();
});
test('repeated preparation and geometry replacement do not leak labels or reattach retired markers',()=>{
 const f=fixture(),old=f.makeMarker([1,1],'10 m'),next=f.makeMarker([2,2],'20 m');next.remove();f.presentation.setActive(true,[old]);f.presentation.setActive(true,[old]);assert.equal(f.host.querySelectorAll('.side-measurement-label').length,1);
 f.presentation.setMarkers([next]);assert.equal(f.host.querySelectorAll('.side-measurement-label').length,1);assert.equal(f.host.querySelector('.side-measurement-label').textContent,'20 m');f.presentation.setActive(false,[next]);assert.equal(old.attached,false);assert.equal(next.attached,true);assert.equal(f.listeners.size,0);
});
test('map removal discards terrain annotation presentation without reattaching map resources',()=>{
 const f=fixture(),marker=f.makeMarker([1,1],'10 m');f.presentation.setActive(true,[marker]);f.map.addControl=()=>assert.fail('removed map');marker.addTo=()=>assert.fail('removed map');f.presentation.destroy({removed:true});assert.equal(f.host.querySelectorAll('.side-measurement-label').length,0);assert.equal(f.listeners.size,0);f.presentation.destroy({removed:true});
});
