import test from 'node:test';
import assert from 'node:assert/strict';
import {initMap} from '../src/map.js';

class Source{constructor(spec){this.data=spec.data;}setData(value){this.data=value;}}
class Bounds{constructor(){}extend(){return this;}}
class MapStub{
  constructor(){MapStub.current=this;this.handlers=new Map();this.sources=new Map();this.layers=new Map();this.canvas={style:{},classList:{toggle(){}},focus(){}};this.container={addEventListener(){}};this.dragPan={enable(){},disable(){}};this.doubleClickZoom={enable(){},disable(){}};this.touchZoomRotate={enable(){}};this.dragRotate={enable(){}};this.camera={center:[8,44],zoom:16,bearing:27};}
  on(type,fn){const list=this.handlers.get(type)??[];list.push(fn);this.handlers.set(type,list);}once(type,fn){this.on(type,fn);}emit(type,event={}){for(const fn of this.handlers.get(type)??[])fn(event);}
  addControl(){}addSource(id,spec){this.sources.set(id,new Source(spec));}getSource(id){return this.sources.get(id);}addLayer(spec){this.layers.set(spec.id,spec);}getLayer(id){return this.layers.get(id);}getCanvas(){return this.canvas;}getCanvasContainer(){return this.container;}getContainer(){return this.container;}loaded(){return true;}project([lon,lat]){return{x:lon*10,y:lat*10};}fitBounds(){}
  getCenter(){return{lng:this.camera.center[0],lat:this.camera.center[1]};}getZoom(){return this.camera.zoom;}getBearing(){return this.camera.bearing;}jumpTo({center,zoom,bearing}){this.camera={center,zoom,bearing};}setBearing(value){this.camera.bearing=value;}easeTo({bearing}){if(Number.isFinite(bearing))this.camera.bearing=bearing;}
}

test('two unfinished perimeter vertices restore without committing a field',()=>{
  const previous=globalThis.maplibregl;
  try{
    globalThis.maplibregl={Map:MapStub,NavigationControl:class{},ScaleControl:class{},LngLatBounds:Bounds};
    let committed=0,changed=0,drawing;
    const first=initMap({container:'map',onGeometryChange:()=>committed++,onDraftChange:()=>changed++,onDrawingState:value=>drawing=value});
    MapStub.current.emit('load');first.beginDraw();MapStub.current.emit('click',{lngLat:{lng:8,lat:44}});MapStub.current.emit('click',{lngLat:{lng:8.01,lat:44}});
    const pending=first.capturePendingEdit();assert.equal(pending.mode,'perimeter');assert.equal(pending.vertices.length,2);assert.equal(changed>=2,true);assert.equal(committed,0);
    const second=initMap({container:'map',onGeometryChange:()=>committed++,onDrawingState:value=>drawing=value});MapStub.current.emit('load');
    assert.equal(second.restorePendingEdit(pending),true);assert.equal(drawing.active,true);assert.equal(drawing.vertexCount,2);assert.equal(committed,0);
    assert.deepEqual(second.capturePendingEdit().vertices,pending.vertices);assert.deepEqual(MapStub.current.camera,pending.camera);
  }finally{globalThis.maplibregl=previous;}
});

test('a started perimeter with zero points still restores drawing mode',()=>{
  const previous=globalThis.maplibregl;
  try{
    globalThis.maplibregl={Map:MapStub,NavigationControl:class{},ScaleControl:class{},LngLatBounds:Bounds};
    const first=initMap({container:'map'});MapStub.current.emit('load');first.beginDraw();
    const pending=first.capturePendingEdit();assert.equal(pending.vertices.length,0);
    let drawing=null,committed=0;
    const second=initMap({container:'map',onGeometryChange:()=>committed++,onDrawingState:value=>drawing=value});MapStub.current.emit('load');
    assert.equal(second.restorePendingEdit(pending),true);assert.equal(drawing.active,true);assert.equal(committed,0);
  }finally{globalThis.maplibregl=previous;}
});
