import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initMap} from '../src/map.js';
import {createFieldLocationCoordinator} from '../src/field-location.js';

// Execute the actual app storage callback without booting auth/DOM services.
const appSource=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
const storageStart=appSource.indexOf('function storeSearchResult(');
const storageSource=appSource.slice(storageStart,appSource.indexOf('\nasync function runSearch(',storageStart));
const storageCallback=(fieldLocationCoordinator,patchProject)=>new Function('fieldLocationCoordinator','patchProject',`${storageSource};return storeSearchResult;`)(fieldLocationCoordinator,patchProject);

// Replace only the external MapLibre surface and network. The real initMap
// search/suggestion callbacks select the branch, coordinates, marker and status.
class MapSurface {
 constructor(){this.events=new Map();this.flights=[];this.markers=[];this.host={addEventListener(){},removeEventListener(){}};this.canvas={style:{}};this.dragRotate={disable(){}};this.touchZoomRotate={enable(){},disableRotation(){}};}
 addControl(){} on(name,fn){this.events.set(name,[...(this.events.get(name)??[]),fn]);} off(){}
 getContainer(){return this.host;} getCanvasContainer(){return this.host;} getCanvas(){return this.canvas;}
 getLayer(){} getSource(){} loaded(){return false;} getBearing(){return 0;}
 flyTo(options){this.flights.push(options);}
}
class Marker {
 setLngLat(value){this.coordinate=value;return this;} setPopup(value){this.popup=value;return this;}
 addTo(map){map.markers.push(this);return this;} remove(){this.removed=true;}
}
class Popup {setText(value){this.text=value;return this;}}
async function withMap(action,respond){
 const previous={maplibregl:globalThis.maplibregl,MapboxDraw:globalThis.MapboxDraw,fetch:globalThis.fetch};
 const requests=[],statuses=[];
 globalThis.MapboxDraw=undefined;
 globalThis.maplibregl={Map:MapSurface,Marker,Popup,NavigationControl:class{},ScaleControl:class{}};
 globalThis.fetch=async url=>{requests.push(new URL(url));if(!respond)throw Error('Coordinate input reached external geocoding');return {ok:true,json:async()=>respond(new URL(url))};};
 try{const api=initMap({container:'map',onStatus:value=>statuses.push(value)});await action({api,map:api.map,requests,statuses});}
 finally{Object.assign(globalThis,previous);}
}

test('actual map search navigates and replaces its marker for DMS and decimal input without a request',async()=>{
 await withMap(async({api,map,requests})=>{
  const result=await api.search(`44°58'20.5"N 7°57'49.3"E`);
  assert.ok(Math.abs(result.lon-7.963694444444445)<1e-12);assert.ok(Math.abs(result.lat-44.97236111111111)<1e-12);
  assert.deepEqual(map.flights[0].center,[result.lon,result.lat]);assert.equal(map.flights[0].zoom,16.5);
  assert.deepEqual(map.markers[0].coordinate,map.flights[0].center);assert.equal(map.markers[0].popup.text,result.label);
  await api.search('-44.5, -7.25');assert.deepEqual(map.flights[1].center,[-7.25,-44.5]);assert.equal(map.markers[0].removed,true);assert.equal(requests.length,0);
 });
});

test('coordinate autocomplete and selection stay local even if a stale provider key is present',async()=>{
 await withMap(async({api,map,requests})=>{
  const [item]=await api.suggest(`44°58'20.5"N 7°57'49.3"E`);assert.ok(item?.label);
  await api.searchSuggestion({...item,magicKey:'stale-address-key'});
  assert.ok(Math.abs(map.flights[0].center[0]-7.963694444444445)<1e-12);assert.equal(requests.length,0);
 });
});

test('invalid coordinates neither move the map nor reach either geocoder',async()=>{
 await withMap(async({api,map,requests,statuses})=>{
  for(const query of [`44°60'0"N 7°0'0"E`,'91,7',`44°58'`,'44,7 E']){
   assert.deepEqual(await api.suggest(query),[]);assert.equal(await api.search(query),null);
   assert.match(statuses.at(-1),/coordinate/i);assert.equal(await api.searchSuggestion({label:query,magicKey:'stale'}),null);
  }
  assert.equal(map.flights.length,0);assert.equal(map.markers.length,0);assert.equal(requests.length,0);
 });
});

test('ordinary addresses keep existing geocoding, suggestions and provider-key selection',async()=>{
 await withMap(async({api,map,requests})=>{
  const result=await api.search('Via Roma 44, Torino');assert.equal(result.municipality,'Torino');assert.deepEqual(map.flights[0].center,[7.68,45.07]);
  const [item]=await api.suggest('Torino');assert.equal(item.magicKey,'address-key');await api.searchSuggestion(item);
  assert.equal(requests[0].searchParams.get('q'),'Via Roma 44, Torino');assert.match(requests[1].pathname,/suggest$/);assert.equal(requests[2].searchParams.get('magicKey'),'address-key');
 },url=>url.pathname.endsWith('/suggest')?{suggestions:[{text:'Torino, ITA',magicKey:'address-key'}]}:url.pathname.endsWith('/findAddressCandidates')?{candidates:[{address:'Torino',location:{x:7.68,y:45.07},attributes:{City:'Torino'}}]}:[{lon:'7.68',lat:'45.07',display_name:'Torino',address:{city:'Torino'}}]);
});

test('a numbered street containing an apostrophe still reaches address geocoding',async()=>{
 await withMap(async({api,map,requests})=>{
  const result=await api.search("12 Via dell'Amore, Canelli");
  assert.equal(result?.municipality,'Canelli');assert.deepEqual(map.flights[0].center,[8.29,44.72]);
  assert.equal(requests.length,1);assert.equal(requests[0].searchParams.get('q'),"12 Via dell'Amore, Canelli");
 },()=>[{lon:'8.29',lat:'44.72',display_name:"Via dell'Amore, Canelli",address:{city:'Canelli'}}]);
});

test('coordinate navigation preserves existing project locality through the actual app storage callback',async()=>{
 await withMap(async({api})=>{
  const project={locationLabel:'Campo già configurato',municipality:'Canelli',province:'Asti',region:'Piemonte',localProjectId:'kept'},before=structuredClone(project);
  const store=storageCallback(createFieldLocationCoordinator(),patch=>Object.assign(project,patch));
  store(await api.search(`44°58'20.5"N 7°57'49.3"E`));assert.deepEqual(project,before);
  const [item]=await api.suggest('44.972361, 7.963694');store(await api.searchSuggestion(item));assert.deepEqual(project,before);
 });
});

test('coordinate navigation keeps an existing field-location request generation valid',async()=>{
 await withMap(async({api})=>{
  let resolveLocation;const field={id:'field-a',geometry:[[7,44],[8,44],[8,45],[7,44]]},applied=[];
  const location={locationLabel:'Campo',municipality:'Canelli',province:'Asti',region:'Piemonte'};
  const coordinator=createFieldLocationCoordinator({resolve:()=>new Promise(done=>{resolveLocation=done;}),getField:()=>field,apply:value=>applied.push(value)});
  const pending=coordinator.refresh(field),store=storageCallback(coordinator,()=>{});
  store(await api.search('44.972361, 7.963694'));resolveLocation(location);
  assert.deepEqual(await pending,location);assert.deepEqual(applied,[location]);
 });
});

test('address storage still updates locality and invalidates an older field-location request',async()=>{
 await withMap(async({api})=>{
  let resolveLocation;const field={id:'field-a',geometry:[[7,44],[8,44],[8,45],[7,44]]};
  const project={locationLabel:'Prima',municipality:'Canelli',province:'Asti',region:'Piemonte'},applied=[];
  const coordinator=createFieldLocationCoordinator({resolve:()=>new Promise(done=>{resolveLocation=done;}),getField:()=>field,apply:value=>applied.push(value)});
  const pending=coordinator.refresh(field),store=storageCallback(coordinator,patch=>Object.assign(project,patch));
  store(await api.search('Torino'));assert.deepEqual(project,{locationLabel:'Torino centro',municipality:'Torino',province:'Torino',region:'Piemonte'});
  resolveLocation({locationLabel:'Vecchio campo'});assert.equal(await pending,null);assert.deepEqual(applied,[]);
 },()=>[{lon:'7.68',lat:'45.07',display_name:'Torino centro',address:{city:'Torino',county:'Torino',state:'Piemonte'}}]);
});
