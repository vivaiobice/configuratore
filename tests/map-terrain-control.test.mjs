import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
const load=()=>import('../src/map-terrain-control.js');
test('one accessible common-map control follows desktop fields and mobile map reparenting',async()=>{
 const {createMapTerrainControl}=await load();const {document}=parseHTML('<div id="desktop"><div class="map-wrap"><div id="map"></div></div></div><div id="mobile"></div>');let toggles=0;
 const map={getContainer:()=>document.querySelector('#map')};const control=createMapTerrainControl({map,onToggle:()=>toggles++});const button=document.querySelector('[data-map-terrain]');assert.equal(button.disabled,true);assert.equal(button.getAttribute('aria-pressed'),'false');
 control.setState({available:true,active:false,busy:false});button.click();assert.equal(toggles,1);document.querySelector('#mobile').append(document.querySelector('.map-wrap'));control.setState({available:true,active:true,busy:false});assert.equal(document.querySelectorAll('[data-map-terrain]').length,1);assert.equal(button.getAttribute('aria-pressed'),'true');assert.match(button.getAttribute('aria-label'),/2D/);control.setState({available:false,active:false,busy:false});assert.equal(button.disabled,true);control.destroy();assert.equal(document.querySelectorAll('[data-map-terrain]').length,0);
});
test('busy control announces waiting and accepts a close while active',async()=>{
 const {createMapTerrainControl}=await load();const {document}=parseHTML('<div class="map-wrap"><div id="map"></div></div>');const control=createMapTerrainControl({map:{getContainer:()=>document.querySelector('#map')},onToggle(){}});const button=document.querySelector('[data-map-terrain]');control.setState({available:true,active:false,busy:true});assert.equal(button.disabled,true);assert.equal(button.getAttribute('aria-busy'),'true');control.setState({available:true,active:true,busy:true});assert.equal(button.disabled,false);control.destroy();
});
test('a non-DOM map adapter can still use editor initialization without an unusable visual control',async()=>{
 const {createMapTerrainControl}=await load();const control=createMapTerrainControl({map:{getContainer:()=>({addEventListener(){}})}});assert.doesNotThrow(()=>control.setState({available:true,active:false,busy:false}));assert.doesNotThrow(()=>control.destroy());
});
