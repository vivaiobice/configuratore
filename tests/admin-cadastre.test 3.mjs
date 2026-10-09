import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountAdminCadastre} from '../admin/admin-cadastre.js';

test('Admin cadastre is map-local, fixed at 60 percent and cleans up',()=>{
  const {document}=parseHTML('<div id="a"></div><div id="b"></div>');
  class MapFake{
    constructor(){this.listeners=new Map();this.sources=new Map();this.layers=new Map();this.zoom=17;}
    on(name,handler){const entries=this.listeners.get(name)??[];entries.push(handler);this.listeners.set(name,entries);}
    off(name,handler){this.listeners.set(name,(this.listeners.get(name)??[]).filter(fn=>fn!==handler));}
    getZoom(){return this.zoom;}loaded(){return true;}
    getLayer(id){return this.layers.get(id);}addLayer(value){this.layers.set(value.id,value);}setLayoutProperty(){}getSource(id){return this.sources.get(id);}addSource(id,value){this.sources.set(id,{...value,updateImage(){}});}
    getBounds(){return {getWest:()=>8,getSouth:()=>44,getEast:()=>8.01,getNorth:()=>44.01};}
    getCanvas(){return {clientWidth:400,clientHeight:300};}
  }
  const a=new MapFake(),b=new MapFake();const first=mountAdminCadastre({map:a,container:document.querySelector('#a')});const second=mountAdminCadastre({map:b,container:document.querySelector('#b')});
  assert.equal(first.isActive(),false);first.setActive(true);assert.equal(first.isActive(),true);assert.equal(second.isActive(),false);
  assert.equal(a.getLayer('cadastre-image-layer').paint['raster-opacity'],.6);
  assert.equal(document.querySelectorAll('input[type="range"]').length,0);
  first.destroy();assert.equal(document.querySelector('#a').children.length,0);assert.equal(document.querySelector('#b').children.length,2);second.destroy();
});
