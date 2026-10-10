import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {initMap} from '../src/map.js';
import {reshapeExclusion,regeneratePassage} from '../src/passage-coordinates.js?v=1.3.7';
import {buildTerrainPassage} from '../src/terrain-passage.js?v=1.3.7';
import {resolveTerrainExclusionGroups} from '../src/terrain-exclusion-groups.js?v=1.3.7';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {fromUTM} from '../src/coordinate-system.js?v=1.3.7';

// Actual native road construction supplies the saved owner operands. Splitting
// one simple raw construction ring along its existing diagonal supplies a
// lossless compatibility member: it invents no width/metric/result certificate.
let acquiredRoad;
const stage=value=>{if(process.env.NATIVE_MAP_DIAGNOSTICS==='1')process.stdout.write(`NATIVE_MAP_STAGE ${value}\n`);};
function nativeRoad(){
 if(!acquiredRoad){
  stage('before road fixture');
  const {project,model}=contourFixture({geometryXY:[[0,0],[10,0],[10,10],[0,10],[0,0]]});
  project.rowPortions=[{id:'source',mode:'inherited',geometry:[structuredClone(project.geometry)],orientationDeg:0,rowCurvePoints:[],maintainRowEquidistance:true}];
  const sourceAxis=[[5,-3],[5,13]].map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
  stage('before buildTerrainPassage');
  const constructed=buildTerrainPassage({project,model,portionId:'source',sourceAxis,widthM:2,groupId:'road',createId:()=> 'owner'});
  stage('after buildTerrainPassage');
  assert.equal(constructed.exclusions.length,1,'SETUP: the actual plane road must have one raw simple part');
  const owner=constructed.exclusions[0],vertices=owner.geometry.slice(0,-1);
  assert.ok(vertices.length>=4,'SETUP: native road must provide a splittable raw ring');
  const first=[vertices[0],vertices[1],vertices[2],vertices[0]].map(point=>[...point]);
  const second=[vertices[0],...vertices.slice(2),vertices[0]].map(point=>[...point]);
  const exclusions=[{...owner,geometry:first,part:1,parts:2},{id:'member',label:'Seconda parte',type:'linear',passageGroupId:'road',surfaceGroupVersion:1,geometry:second,part:2,parts:2}];
  stage('before raw group decomposition validation');
  const resolved=resolveTerrainExclusionGroups({exclusions,field:project.geometry});
  stage('after raw group decomposition validation');
  assert.equal(resolved.groups.length,1,'SETUP: actual raw strip decomposition must validate');
  assert.equal(resolved.groups[0].ownerId,'owner');
  acquiredRoad={project:{...project,exclusions},model,sourceAxis};
 }
 return structuredClone(acquiredRoad);
}

// The external WebGL/browser surface alone is doubled. initMap, the coordinate
// editor, group validation, road factory and every publication callback are real.
class Source{constructor(spec){this.data=structuredClone(spec.data);this.writes=0;}setData(value){this.data=structuredClone(value);this.writes++;}}
const handler=()=>({enabled:true,isEnabled(){return this.enabled;},enable(){this.enabled=true;},disable(){this.enabled=false;}});
class MapSurface{
 constructor({container}){this.host=document.getElementById(container);this.canvas=document.createElement('canvas');this.host.append(this.canvas);this.events=new Map();this.sources=new Map();this.layers=new Map();this.markers=[];this.camera={center:[9,45],zoom:18,bearing:0};for(const name of ['dragRotate','touchPitch','touchZoomRotate','dragPan','doubleClickZoom','scrollZoom'])this[name]=handler();this.touchZoomRotate.enableRotation=()=>{};this.touchZoomRotate.disableRotation=()=>{};}
 on(name,fn){this.events.set(name,[...(this.events.get(name)??[]),fn]);return this;}
 off(name,fn){this.events.set(name,(this.events.get(name)??[]).filter(item=>item!==fn));return this;}
 trigger(name,event={}){for(const fn of [...(this.events.get(name)??[])])fn(event);}
 addControl(){} loaded(){return true;} addSource(id,spec){this.sources.set(id,new Source(spec));} getSource(id){return this.sources.get(id);} addLayer(spec){this.layers.set(spec.id,spec);} getLayer(id){return this.layers.get(id);} getLayersOrder(){return [...this.layers.keys()];} getLayoutProperty(id,key){return this.layers.get(id)?.layout?.[key];} setLayoutProperty(id,key,value){this.layers.get(id).layout={...this.layers.get(id).layout,[key]:value};}
 getContainer(){return this.host;} getCanvasContainer(){return this.host;} getCanvas(){return this.canvas;} project([lng,lat]){return {x:lng*10,y:lat*10};} fitBounds(){} getCenter(){return {lng:this.camera.center[0],lat:this.camera.center[1]};} getZoom(){return this.camera.zoom;} getBearing(){return this.camera.bearing;} jumpTo(value){this.camera={...this.camera,...value};}
}
class Marker{
 constructor({element,draggable}={}){this.element=element;this.draggable=Boolean(draggable);this.events={};this.removed=false;}
 setLngLat(value){this.coordinate=[...value];return this;} getLngLat(){return {lng:this.coordinate[0],lat:this.coordinate[1]};} addTo(map){map.markers.push(this);map.host.append(this.element);return this;} remove(){this.removed=true;this.element.remove();} on(name,fn){this.events[name]=fn;return this;}
}
function setup({project=nativeRoad().project,...callbacks}={}){
 const old={document:globalThis.document,maplibregl:globalThis.maplibregl,MapboxDraw:globalThis.MapboxDraw,innerWidth:globalThis.innerWidth,innerHeight:globalThis.innerHeight};
 const {document,window}=parseHTML('<html><body><section class="map-wrap"><div id="map"></div></section></body></html>');
 globalThis.document=document;globalThis.MapboxDraw=undefined;globalThis.innerWidth=900;globalThis.innerHeight=700;
 globalThis.maplibregl={Map:MapSurface,Marker,NavigationControl:class{},ScaleControl:class{},LngLatBounds:class{extend(){return this;}}};
 const publications=[],statuses=[];
 stage('before initMap');
 const api=initMap({container:'map',onExclusionChange:(...args)=>publications.push({kind:'one',args:structuredClone(args)}),onExclusionsReplace:value=>publications.push({kind:'all',value:structuredClone(value)}),onStatus:value=>statuses.push(value),...callbacks});
 stage('after initMap');api.map.trigger('load');api.setGeometry(project.geometry);stage('before map setExclusions');api.setExclusions(project.exclusions);stage('after map setExclusions');
 return {api,map:api.map,document,window,project,publications,statuses,features:()=>api.map.getSource('excluded-zones').data,handles:cls=>api.map.markers.filter(marker=>!marker.removed&&marker.element.className===cls),restore(){api.stopTools();api.map.trigger('remove');Object.assign(globalThis,old);}};
}
function click(ctx,node){node.dispatchEvent(new ctx.window.Event('click',{bubbles:true,cancelable:true}));}
function openEndpoint(ctx,id,index=0){
 assert.equal(ctx.api.beginExclusionEditing(id),true);
 const endpoint=ctx.handles('passage-endpoint-handle').find(marker=>marker.element.textContent===(index?'B':'A'));
 assert.ok(endpoint,`every native member must expose the original ${index?'B':'A'} endpoint`);
 click(ctx,endpoint.element);const action=ctx.document.querySelector('.vertex-coordinate-action');assert.ok(action);click(ctx,action);
 const dialog=ctx.document.querySelector('.coordinate-dialog');assert.ok(dialog);return {dialog,endpoint};
}
function submitChanged(ctx,dialog){const input=dialog.querySelector('input');input.value=String(Number(input.value)+.000001);dialog.querySelector('form').dispatchEvent(new ctx.window.Event('submit',{cancelable:true}));}
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

// A dangerous marked→legacy branch can remove source/width on a no-op, or
// publish an uncertified literal patch. Absence of editable shape handles is a
// lawful bounded implementation; retained handles must enforce the same guard.
test('opening and finishing a native owner preserves every raw group byte and saved visual',()=>{
 const ctx=setup();try{const before=JSON.stringify(ctx.project.exclusions),visual=structuredClone(ctx.features());assert.equal(ctx.api.beginExclusionEditing('owner'),true);ctx.api.finishVertexEditing();assert.equal(JSON.stringify(ctx.project.exclusions),before);assert.deepEqual(ctx.features(),visual);assert.deepEqual(ctx.publications,[]);}finally{ctx.restore();}
});
for(const id of ['owner','member'])test(`unchanged native ${id} drag is a true no-op without publication`,()=>{
 const ctx=setup();try{const before=JSON.stringify(ctx.project.exclusions),visual=structuredClone(ctx.features());assert.equal(ctx.api.beginExclusionEditing(id),true);const handle=ctx.handles('vertex-edit-handle')[0];if(handle)handle.events.dragend();ctx.api.finishVertexEditing();assert.deepEqual(ctx.publications,[],'same-position drag must not reshape the native group');assert.equal(JSON.stringify(ctx.project.exclusions),before);assert.deepEqual(ctx.features(),visual);}finally{ctx.restore();}
});
for(const action of ['drag','add'])test(`changed native shape ${action} cannot publish an exclusions-only patch`,()=>{
 const ctx=setup();try{const before=JSON.stringify(ctx.project.exclusions),visual=structuredClone(ctx.features());assert.equal(ctx.api.beginExclusionEditing('owner'),true);if(action==='drag'){const handle=ctx.handles('vertex-edit-handle')[0];if(handle){handle.setLngLat([handle.coordinate[0]+.000001,handle.coordinate[1]]);handle.events.dragend();}}else{const handle=ctx.handles('vertex-add-handle')[0];if(handle)click(ctx,handle.element);}assert.deepEqual(ctx.publications,[],'marked shape edit must stop before all publication callbacks');assert.equal(JSON.stringify(ctx.project.exclusions),before);assert.deepEqual(ctx.features(),visual);}finally{ctx.restore();}
});
test('the legacy reshape utility rejects changed native groups and returns original records for a no-op',()=>{
 const {project}=nativeRoad(),before=JSON.stringify(project.exclusions),owner=project.exclusions[0];
 assert.deepEqual(reshapeExclusion(project.exclusions,'owner',structuredClone(owner.geometry)),project.exclusions);
 const changed=structuredClone(owner.geometry);changed[1][0]+=.000001;
 assert.throws(()=>reshapeExclusion(project.exclusions,'owner',changed),/terreno|passaggio|native|gruppo/i);
 assert.equal(JSON.stringify(project.exclusions),before);
});
test('the flat legacy endpoint utility cannot regenerate a marked native road',()=>{
 const {project,sourceAxis}=nativeRoad(),before=JSON.stringify(project.exclusions);
 assert.throws(()=>regeneratePassage({exclusions:project.exclusions,id:'owner',endpointIndex:0,coordinate:[sourceAxis[0][0]+.000001,sourceAxis[0][1]],field:project.geometry}),/terreno|passaggio|native|gruppo/i);
 assert.equal(JSON.stringify(project.exclusions),before);
});
for(const id of ['owner','member'])test(`native ${id} A/B uses the original source and never the raw member cap`,()=>{
 const ctx=setup();try{const {sourceAxis}=nativeRoad();assert.equal(ctx.api.beginExclusionEditing(id),true);const endpoints=ctx.handles('passage-endpoint-handle');assert.equal(endpoints.length,2,'native endpoint controls resolve the owner from any member');assert.deepEqual(endpoints.map(marker=>marker.coordinate),sourceAxis);assert.deepEqual(ctx.publications,[]);}finally{ctx.restore();}
});
for(const [label,mutate] of [
 ['missing owner',xs=>{delete xs[0].surfaceGroupOwner;}],
 ['ambiguous member identity',xs=>{xs.push({...structuredClone(xs[1]),id:'owner'});}],
 ['mixed unmarked sibling',xs=>{delete xs[1].surfaceGroupVersion;}]
])test(`native editing rejects ${label} before exposing mutable handles`,()=>{
 const {project}=nativeRoad();mutate(project.exclusions);const ctx=setup({project});try{assert.equal(ctx.api.beginExclusionEditing('owner'),false,'invalid marked family cannot enter the legacy editor');assert.equal(ctx.handles('vertex-edit-handle').length,0);assert.equal(ctx.handles('passage-endpoint-handle').length,0);assert.deepEqual(ctx.publications,[]);}finally{ctx.restore();}
});
for(const outcome of [false,null,{ok:false,status:'review-required'}])test(`a fulfilled native endpoint failure ${JSON.stringify(outcome)} leaves the coordinate dialog editable`,async()=>{
 let calls=0;const ctx=setup({onNativePassageEndpointRequest:async()=>{calls++;return outcome;}});try{const before=structuredClone(ctx.features()),{dialog}=openEndpoint(ctx,'owner');submitChanged(ctx,dialog);await settle();assert.equal(calls,1,'marked A/B must dispatch the allocated request-only callback');assert.ok(ctx.document.querySelector('.coordinate-dialog')===dialog,'fulfilled failure is not coordinate success');assert.equal(dialog.querySelector('button[type=submit]').disabled,false);assert.ok(dialog.querySelector('[role=alert]').textContent.length>0);assert.deepEqual(ctx.publications,[]);assert.deepEqual(ctx.features(),before);}finally{ctx.restore();}
});
test('native endpoint pending Cancel aborts its actual editor signal without changing saved exclusions',async()=>{
 const work=deferred();let request,signal;const ctx=setup({onNativePassageEndpointRequest:(value,control)=>{request=value;signal=control?.signal;return work.promise;}});try{const before=structuredClone(ctx.features()),{dialog}=openEndpoint(ctx,'member');submitChanged(ctx,dialog);assert.ok(signal instanceof AbortSignal,'the same editor control signal must reach native dispatch');assert.equal(signal.aborted,false);assert.equal(request.exclusionId,'member');assert.equal(request.endpointIndex,0);assert.equal(Object.hasOwn(request,'widthM'),false,'scope/width are owner-derived in the actual worker');assert.equal(Object.hasOwn(request,'projectPatch'),false);assert.deepEqual(ctx.publications,[]);assert.deepEqual(ctx.features(),before);click(ctx,dialog.querySelector('[data-coordinate-cancel]'));assert.equal(signal.aborted,true);work.reject(new Error('cancelled'));await settle();assert.ok(ctx.document.querySelector('.coordinate-dialog')===null);assert.deepEqual(ctx.publications,[]);assert.deepEqual(ctx.features(),before);}finally{ctx.restore();work.reject(new Error('cleanup'));await work.promise.catch(()=>{});}
});
test('changing a sibling invalidates an open native endpoint dialog even when its owner is unchanged',()=>{
 const ctx=setup();try{const {dialog}=openEndpoint(ctx,'owner'),next=structuredClone(ctx.project.exclusions);next[1].geometry[1][0]+=.000001;ctx.api.setExclusions(next);assert.ok(ctx.document.querySelector('.coordinate-dialog')===null,'complete marked family is the editor baseline');submitChanged(ctx,dialog);assert.deepEqual(ctx.publications,[]);}finally{ctx.restore();}
});
test('native dialog Cancel after a failed callback aborts its stable dismissal signal',async()=>{
 let dismissSignal;const ctx=setup({onNativePassageEndpointRequest:async(_request,control)=>{dismissSignal=control.dismissSignal;return false;}});
 try{
  const before=structuredClone(ctx.features()),{dialog}=openEndpoint(ctx,'member');submitChanged(ctx,dialog);await settle();
  assert.ok(ctx.document.querySelector('.coordinate-dialog')===dialog,'failed checkpoint keeps entered coordinates available');
  assert.equal(dialog.querySelector('button[type=submit]').disabled,false);
  assert.ok(dismissSignal instanceof AbortSignal,'dismissal remains observable after the pending Promise rejects');
  assert.equal(dismissSignal.aborted,false);click(ctx,dialog.querySelector('[data-coordinate-cancel]'));
  assert.equal(dismissSignal.aborted,true,'Cancel must discard the same unsaved candidate after a failed checkpoint');
  assert.ok(ctx.document.querySelector('.coordinate-dialog')===null);assert.deepEqual(ctx.publications,[]);assert.deepEqual(ctx.features(),before);
 }finally{ctx.restore();}
});
