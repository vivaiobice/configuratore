import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createMapFieldLabelOverlay} from '../src/map-field-label-overlay.js';

function fixture(){
 const {document}=parseHTML('<div id="map"></div>'),host=document.querySelector('#map'),handlers=new Map();
 Object.defineProperties(host,{clientWidth:{value:300},clientHeight:{value:300}});
 let pan=0;
 const map={getContainer:()=>host,project:([lon,lat])=>({x:(lon-8)*10000+pan,y:(44.02-lat)*10000}),on:(event,fn)=>handlers.set(event,fn),off:event=>handlers.delete(event)};
 return {host,overlay:createMapFieldLabelOverlay({map,documentRef:document}),move(x){pan=x;handlers.get('move')();}};
}

// The field's center projects to x=-50, while the right-hand third of its
// perimeter is visible. Selecting an adjacent field creates this camera view.
const clippedField={label:'Moscato',geometry:[[7.98,44],[8.01,44],[8.01,44.01],[7.98,44.01],[7.98,44]]};

test('a visible parcel retains its name when its geographic center is off screen',()=>{
 const {host,overlay}=fixture();overlay.setFields([clippedField]);
 const label=host.querySelector('.field-label-marker');
 assert.equal(label.textContent,'Moscato');
 assert.ok(Number.parseFloat(label.style.left)>0,'label stays inside the visible part of the parcel');
 assert.ok(Number.parseFloat(label.style.left)<100);
 assert.equal(label.hidden,false);
});

test('labels follow visible parcel intersections as the map is panned away and back',()=>{
 const {host,overlay,move}=fixture();overlay.setFields([clippedField]);
 const label=host.querySelector('.field-label-marker');
 move(-400);assert.equal(label.hidden,true,'a completely off-screen parcel has no floating tag');
 move(150);assert.equal(label.hidden,false);
 assert.ok(Number.parseFloat(label.style.left)>0&&Number.parseFloat(label.style.left)<300);
 assert.equal(host.querySelector('.field-label-marker'),label,'movement preserves each field tag');
});

test('overlapping fields keep separate readable tags without hiding either name',()=>{
 const {host,overlay}=fixture();overlay.setFields([clippedField,{...clippedField,label:'Barbera'}]);
 const [first,second]=host.querySelectorAll('.field-label-marker');
 assert.equal(first.hidden,false);assert.equal(second.hidden,false);
 assert.notEqual(first.style.top,second.style.top,'coincident parcels retain two visible names');
});
test('terrain projection positions the same tag and closing restores its 2D position',()=>{
 const {host,overlay}=fixture();overlay.setFields([clippedField]);const label=host.querySelector('.field-label-marker'),before=[label.style.left,label.style.top];
 assert.equal(typeof overlay.setProjector,'function');overlay.setProjector(([lon,lat])=>({x:(lon-8)*10000+80,y:(44.02-lat)*10000-20}));
 assert.notDeepEqual([label.style.left,label.style.top],before);assert.equal(host.querySelector('.field-label-marker'),label);
 overlay.setProjector(null);assert.deepEqual([label.style.left,label.style.top],before);
});
