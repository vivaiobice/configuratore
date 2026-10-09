import test from 'node:test';
import assert from 'node:assert/strict';
import {initMap} from '../src/map.js';
import {mapTerrainExclusionFeatures} from '../src/map-terrain-exclusions.js?v=1.3.5';
import {createTerrainBudget} from '../src/terrain-budget.js?v=1.3.5';

const ring=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]];
const field=ring(0,0,10,10);
function group(parts,coordinates,groupId='road'){
 return parts.map((geometry,index)=>({id:`${groupId}-${index}`,label:'Passaggio',passageGroupId:groupId,surfaceGroupVersion:1,geometry,
  ...(index?{}:{surfaceGroupOwner:true,surfaceGeometry:{type:'MultiPolygon',coordinates},surfaceGeometryConvention:'literal'})}));
}
function scoped(){
 const raw=ring(3,-2,7,12);
 return [{id:'owner',label:'Passaggio',passageGroupId:'scope',surfaceGroupVersion:1,surfaceGroupOwner:true,geometry:structuredClone(raw),
  surfaceGeometry:{type:'MultiPolygon',coordinates:[[raw]]},surfaceGeometryConvention:'domain-intersection',
  surfaceConstructionPolicy:'native-supported-axis-clip-1',sourceAxis:[[5,-2],[5,12]],widthM:4,widthBasis:'model-surface',
  modelHash:'model',scopePortionId:'left',scopeGeometry:{type:'Polygon',coordinates:[ring(0,0,5,10)]}}];
}

// Only the MapLibre browser boundary is doubled; map and central geometry are real.
class Source{constructor(spec){this.data=spec.data;}setData(data){this.data=data;}}
class Bounds{extend(){return this;}}
class MapBoundary{
 constructor(){this.handlers=new Map();this.sources=new Map();this.layers=new Map();this.dragRotate={disable(){}};this.touchZoomRotate={enable(){},disableRotation(){}};this.touchPitch={disable(){}};this.dragPan={enable(){},disable(){}};this.doubleClickZoom={enable(){},disable(){}};this.canvas={style:{},classList:{toggle(){}},focus(){}};this.container={addEventListener(){}};}
 addControl(){} on(event,callback){const callbacks=this.handlers.get(event)??[];callbacks.push(callback);this.handlers.set(event,callbacks);} once(event,callback){this.on(event,callback);} trigger(event){for(const callback of this.handlers.get(event)??[])callback();}
 addSource(id,spec){this.sources.set(id,new Source(spec));}getSource(id){return this.sources.get(id);}addLayer(layer){this.layers.set(layer.id,layer);}getLayer(id){return this.layers.get(id);}
 getCanvas(){return this.canvas;}getCanvasContainer(){return this.container;}getContainer(){return this.container;}project([x,y]){return {x:x*10,y:y*10};}fitBounds(){}getBearing(){return 0;}
}
function setup({loaded=true}={}){
 const previous=globalThis.maplibregl,status=[];
 globalThis.maplibregl={Map:MapBoundary,NavigationControl:class{},ScaleControl:class{},LngLatBounds:Bounds};
 const api=initMap({container:'map',onStatus:message=>status.push(message)}),map=api.map;
 if(loaded)map.trigger('load');
 return {api,map,status,features:()=>map.getSource('excluded-zones').data.features,restore(){globalThis.maplibregl=previous;}};
}

// Raw member rendering would add four seam features and fill the canonical hole.
test('one canonical group feature preserves its hole and owner identity without member seams',()=>{
 const ctx=setup();try{
  ctx.api.setGeometry(field);
  ctx.api.setExclusions(group([ring(1,1,9,4),ring(1,6,9,9),ring(1,4,4,6),ring(6,4,9,6)],[[ring(1,1,9,9),ring(4,4,6,6)]]));
  assert.equal(ctx.features().length,1);
  const feature=ctx.features()[0];assert.equal(feature.id,'road-0');assert.equal(feature.properties.ownerId,'road-0');assert.equal(feature.properties.groupId,'road');
  assert.equal(feature.geometry.type,'MultiPolygon');assert.equal(feature.geometry.coordinates.length,1);assert.equal(feature.geometry.coordinates[0].length,2);
  assert.deepEqual(feature.geometry.coordinates[0][1].slice(0,-1).sort(),[[4,4],[4,6],[6,4],[6,6]].sort());
 }finally{ctx.restore();}
});

// Flattening MultiPolygon or exposing a wholly masked raw part loses this result.
test('disjoint components remain one feature and fully masked construction parts disappear',()=>{
 const ctx=setup();try{
  ctx.api.setGeometry(field);
  const parts=[ring(1,1,2,2),ring(6,6,7,7),ring(12,12,13,13)];
  ctx.api.setExclusions(group(parts,parts.map(part=>[part])));
  assert.equal(ctx.features().length,1);assert.equal(ctx.features()[0].geometry.coordinates.length,2);
  assert.ok(ctx.features()[0].geometry.coordinates.flat(2).every(([x,y])=>x<=10&&y<=10));
  ctx.api.setGeometry(ring(20,20,30,30));assert.deepEqual(ctx.features(),[]);
 }finally{ctx.restore();}
});

// Dropping scope or refreshing only when exclusions change would show x=6 or old x=5.
test('actual field and scope mask refresh when the field changes, including mutated operands',()=>{
 const ctx=setup();try{
  ctx.api.setGeometry(field);ctx.api.setExclusions(scoped());
  const vertices=()=>ctx.features()[0].geometry.coordinates.flat(2);
  assert.deepEqual(vertices().slice(0,-1).sort(),[[3,0],[3,10],[5,0],[5,10]].sort());
  const smaller=ring(0,0,4,10);ctx.api.setGeometry(smaller);
  assert.equal(Math.max(...vertices().map(p=>p[0])),4);
  smaller[1][0]=3.5;smaller[2][0]=3.5;ctx.api.setGeometry(smaller);
  assert.equal(Math.max(...vertices().map(p=>p[0])),3.5);
  const exclusions=scoped();exclusions[0].scopeGeometry.coordinates[0]=ring(0,0,3.25,10);ctx.api.setExclusions(exclusions);
  assert.equal(Math.max(...vertices().map(p=>p[0])),3.25);
 }finally{ctx.restore();}
});

// A copied/clipped raw member cannot replace the central proved rational preview.
test('an actual non-dyadic one-third clip renders the canonical bounded preview',()=>{
 const ctx=setup();try{
  const triangle=[[0,0],[1,0],[0,3],[0,0]];
  ctx.api.setGeometry(ring(0,1,1,2));ctx.api.setExclusions(group([triangle],[[triangle]]));
  assert.equal(ctx.features().length,1);assert.equal(ctx.features()[0].geometry.type,'MultiPolygon');
  const vertices=ctx.features()[0].geometry.coordinates[0][0].slice(0,-1).sort(),expected=[[0,1],[0,2],[1/3,2],[2/3,1]].sort();
  assert.equal(vertices.length,4);
  for(let i=0;i<vertices.length;i++)for(let axis=0;axis<2;axis++)assert.ok(Math.abs(vertices[i][axis]-expected[i][axis])<=Number.EPSILON);
  assert.deepEqual(ctx.status,[]);
 }finally{ctx.restore();}
});

// Permissive fallback must never display a corrupt member or an unmarked sibling.
test('invalid groups fail closed with friendly status while unrelated legacy DTOs stay exact',()=>{
 for(const mutate of [
  xs=>{delete xs[0].surfaceGroupOwner;},xs=>{xs[0].surfaceGroupVersion=2;},
  xs=>{xs[0].surfaceConstructionPolicy='future';},xs=>{delete xs[0].scopeGeometry;},
  xs=>{delete xs[0].surfaceGroupVersion;},xs=>{xs[0].geometry[1][0]=6;},
  xs=>{xs.push({id:'unmarked-sibling',passageGroupId:'scope',geometry:ring(8,8,9,9)});}
 ]){
  const ctx=setup();try{
   ctx.api.setGeometry(field);const exclusions=scoped();mutate(exclusions);
   exclusions.push(...group([ring(1,1,2,2)],[[ring(1,1,2,2)]],'valid'));
   const legacy={id:'legacy',label:'Storica',geometry:ring(0,0,1,1)};exclusions.push(legacy);
   assert.doesNotThrow(()=>ctx.api.setExclusions(exclusions));
   assert.deepEqual(ctx.features(),[{type:'Feature',id:'legacy',properties:{label:'Storica'},geometry:{type:'Polygon',coordinates:[legacy.geometry]}}]);
   assert.match(ctx.status.at(-1),/non.*verificat|verificat.*non/i);
  }finally{ctx.restore();}
 }
});

test('partial markers without a group ID do not suppress unrelated unlabelled legacy rings',()=>{
 const legacy=ring(0,0,1,1),malformed={surfaceGeometry:null,geometry:ring(2,2,3,3)};
 const result=mapTerrainExclusionFeatures({exclusions:[malformed,legacy],field});
 assert.equal(result.status,'invalid-surface-group');
 assert.deepEqual(result.featureCollection.features,[{type:'Feature',id:1,properties:{label:'Area esclusa 2'},geometry:{type:'Polygon',coordinates:[legacy]}}]);
});

test('absence of markers retains every historical feature DTO and original fallback index',()=>{
 const old=[{id:'old',label:'Vecchia',geometry:ring(1,1,2,2)},null,ring(3,3,4,4),{geometry:[[1,1],[2,2]]}];
 const result=mapTerrainExclusionFeatures({exclusions:old});
 assert.equal(result.status,'ready');assert.deepEqual(result.featureCollection,{type:'FeatureCollection',features:[
  {type:'Feature',id:'old',properties:{label:'Vecchia'},geometry:{type:'Polygon',coordinates:[old[0].geometry]}},
  {type:'Feature',id:2,properties:{label:'Area esclusa 3'},geometry:{type:'Polygon',coordinates:[old[2]]}}
 ]});
});

test('groups set before load use the latest actual field and require a physical field',()=>{
 const ctx=setup({loaded:false});try{
  ctx.api.setExclusions(scoped());ctx.api.setGeometry(ring(0,0,4,10));ctx.map.trigger('load');
  assert.equal(ctx.features().length,1);assert.equal(Math.max(...ctx.features()[0].geometry.coordinates.flat(2).map(p=>p[0])),4);
  assert.deepEqual(ctx.status,[]);
  const pending=mapTerrainExclusionFeatures({exclusions:scoped()});assert.equal(pending.status,'invalid-surface-group');assert.deepEqual(pending.featureCollection.features,[]);
 }finally{ctx.restore();}
});

test('a real exhausted central budget reports its typed failure without exposing group parts',()=>{
 const legacy={id:'legacy',geometry:ring(0,0,1,1)},budget=createTerrainBudget({kind:'cut',deadlineMs:0});
 const result=mapTerrainExclusionFeatures({exclusions:[...scoped(),legacy],field,budget});
 assert.equal(result.status,'budget-exceeded');assert.equal(result.featureCollection.features.length,1);assert.equal(result.featureCollection.features[0].id,'legacy');
});

test('reordering members retains the canonical owner feature and its display label',()=>{
 const parts=[ring(1,1,2,2),ring(6,6,7,7)],exclusions=group(parts,parts.map(part=>[part]));
 exclusions[0].label='Proprietario';exclusions[1].label='Parte';exclusions.reverse();
 const result=mapTerrainExclusionFeatures({exclusions,field});
 assert.equal(result.status,'ready');assert.equal(result.featureCollection.features.length,1);
 const feature=result.featureCollection.features[0];assert.equal(feature.id,'road-0');assert.equal(feature.properties.ownerId,'road-0');assert.equal(feature.properties.label,'Proprietario');
});
