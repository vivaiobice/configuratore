import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {initMap} from '../src/map.js';
import {curvePointToLonLat,getRowCurveSegments,resolveRowCurvePoints} from '../src/row-curves.js';

class MapStub{
 constructor(){this.events=new Map();this.sources=new Map();this.canvas={style:{},classList:{toggle(){}}};this.container={addEventListener(){}};this.dragPan={enable(){},disable(){}};this.doubleClickZoom={enable(){},disable(){}};this.touchZoomRotate={enable(){}};this.dragRotate={disable(){}};}
 on(name,callback){const handlers=this.events.get(name)??[];handlers.push(callback);this.events.set(name,handlers);}off(){}once(name,callback){this.on(name,callback);}
 addControl(){}getCanvas(){return this.canvas;}getContainer(){return this.container;}getCanvasContainer(){return this.container;}
 getSource(id){return this.sources.get(id);}addSource(id,spec){this.sources.set(id,{...spec,setData(data){this.data=data;}});}addLayer(){}getLayer(){return null;}
 loaded(){return true;}project([lon,lat]){return{x:lon,y:lat};}
}
class Marker{
 static all=[];
 constructor({element}){this.element=element;this.events=new Map();Marker.all.push(this);}setLngLat(position){this.position=position;return this;}addTo(){return this;}
 getLngLat(){return{lng:this.position[0],lat:this.position[1]};}on(name,callback){this.events.set(name,callback);return this;}remove(){this.removed=true;}
}

test('dragging a curve handle across a passage stays in its own section and retains the other handle',()=>{
 const prior={document:globalThis.document,maplibregl:globalThis.maplibregl};
 const lonM=1/(111320*Math.cos(44*Math.PI/180)),latM=1/110540;
 const geometry=[[8,44],[8+60*lonM,44],[8+60*lonM,44+100*latM],[8,44+100*latM],[8,44]];
 const exclusions=[{id:'pass',type:'linear',widthM:1.5,geometry:[[-2,49.25],[62,49.25],[62,50.75],[-2,50.75],[-2,49.25]].map(([x,y])=>[8+x*lonM,44+y*latM])}];
 const segments=getRowCurveSegments({polygon:geometry,exclusions});
 const points=resolveRowCurvePoints({polygon:geometry,exclusions,rowCurvePoints:[{id:'a',position:.25,offsetM:5},{id:'b',position:.75,offsetM:-5}]});
 try{
  globalThis.document=parseHTML('<html><body></body></html>').document;
  Marker.all=[];globalThis.maplibregl={Map:MapStub,Marker,NavigationControl:class{},ScaleControl:class{}};
  let changed;const api=initMap({container:'map',onRowCurvePointsChange:value=>changed=value});
  api.setRowCurveEditor({geometry,exclusions,points,active:true});
  const handle=Marker.all.find(marker=>marker.element.className==='curve-control-marker');
  handle.setLngLat(curvePointToLonLat({polygon:geometry,point:{id:'a',position:.8,offsetM:12}}));handle.events.get('dragend')();
  assert.equal(changed.find(point=>point.id==='a').segmentId,segments[0].id);
  assert.ok(changed.find(point=>point.id==='a').position<segments[0].endPosition);
  assert.deepEqual(changed.find(point=>point.id==='b'),points.find(point=>point.id==='b'));
 }finally{Object.assign(globalThis,prior);}
});

test('overlapping curve handles complete the merge and notify the editor without throwing',()=>{
 const prior={document:globalThis.document,maplibregl:globalThis.maplibregl};
 const geometry=[[8,44],[8.001,44],[8.001,44.001],[8,44.001],[8,44]];
 const points=[{id:'a',position:.25,offsetM:2},{id:'b',position:.5,offsetM:3}];
 try{
  globalThis.document=parseHTML('<html><body></body></html>').document;
  Marker.all=[];globalThis.maplibregl={Map:MapStub,Marker,NavigationControl:class{},ScaleControl:class{}};
  let changed;const api=initMap({container:'map',onRowCurvePointsChange:value=>changed=value});
  api.setRowCurveEditor({geometry,points,active:true});
  const handle=Marker.all.find(marker=>marker.element.className==='curve-control-marker');
  handle.setLngLat(curvePointToLonLat({polygon:geometry,point:{...points[1],position:.4998}}));
  assert.doesNotThrow(()=>handle.events.get('dragend')());
  assert.equal(changed.length,1);assert.equal(changed[0].id,'b');assert.equal(handle.removed,true);
 }finally{Object.assign(globalThis,prior);}
});

test('a removed curve marker cannot apply a delayed drag to another selected portion',()=>{
 const prior={document:globalThis.document,maplibregl:globalThis.maplibregl};
 const geometry=[[0,45],[.001,45],[.001,45.001],[0,45.001],[0,45]];
 try{
  globalThis.document=parseHTML('<html><body></body></html>').document;
  Marker.all=[];globalThis.maplibregl={Map:MapStub,Marker,NavigationControl:class{},ScaleControl:class{}};
  const changes=[],api=initMap({container:'map',onRowCurvePointsChange:value=>changes.push(value)});
  api.setRowCurveEditor({geometry,points:[{id:'a',position:.3,offsetM:2}],active:true});
  const old=Marker.all.find(marker=>marker.element.className==='curve-control-marker');
  api.setRowCurveEditor({geometry,orientationDeg:80,points:[{id:'b',position:.6,offsetM:4}],active:true});
  old.events.get('dragend')();assert.deepEqual(changes,[],'stale gesture cannot patch the newly selected design');
 }finally{Object.assign(globalThis,prior);}
});
