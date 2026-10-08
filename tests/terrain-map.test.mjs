import test from 'node:test';import assert from 'node:assert/strict';
import {encodeTerrainHeight,buildTerrainTilePixels,createTerrainMapView as realCreateTerrainMapView} from '../src/terrain-map.js';
// This fixture replaces only the browser worker boundary; production has no main-thread tile path.
function createTerrainMapView(options){return realCreateTerrainMapView({...options,tileClientFactory:options.tileClientFactory??(()=>({ready:Promise.resolve({bounds:options.bounds}),tile:coordinates=>options.encodePNG(buildTerrainTilePixels(coordinates,options.heightAt),coordinates.size),destroy(){}}))});}
test('local DEM tiles encode heights from the supplied frozen surface only',()=>{
 const pixels=buildTerrainTilePixels({z:0,x:0,y:0,size:2},coordinate=>coordinate[0]<0?120.25:321.5);
 assert.equal(pixels.length,16);const decode=i=>(pixels[i]*256+pixels[i+1]+pixels[i+2]/256)-32768;
 assert.equal(decode(0),120.25);assert.equal(decode(4),321.5);assert.equal(pixels[3],255);assert.deepEqual(encodeTerrainHeight(-1.25),[127,254,192,255]);
});
function mock(){
 let pitch=0,bearing=17,zoom=16,terrain=null;const sources=new Map(),protocols=new Map();const events=[];
 const map={getPitch:()=>pitch,getBearing:()=>bearing,getZoom:()=>zoom,getCenter:()=>({lng:7,lat:45}),getPadding:()=>({top:0,bottom:0,left:0,right:0}),getTerrain:()=>terrain,getSource:id=>sources.get(id),addSource:(id,v)=>{sources.set(id,v);events.push('add');},removeSource:id=>{sources.delete(id);events.push('remove');},setTerrain:v=>{terrain=v;events.push('terrain');},jumpTo:v=>{pitch=v.pitch??pitch;bearing=v.bearing??bearing;zoom=v.zoom??zoom;},dragPan:{isEnabled:()=>false},dragRotate:{isEnabled:()=>false},touchZoomRotate:{isEnabled:()=>true}};
 const library={addProtocol:(name,handler)=>protocols.set(name,handler),removeProtocol:name=>protocols.delete(name)};
 return {map,library,sources,protocols,events};
}
test('3D resources are lazy, exaggeration one, and closing restores camera and leaves gestures alone',async()=>{
 const f=mock();const original={terrain:{model:'unchanged'},rows:[1,2],eye:false};const saved=JSON.stringify(original);
 const view=createTerrainMapView({map:f.map,model:{contentHash:'grid',grid:{width:2,height:2,origin:[0,1],step:[1,-1]}},library:f.library,heightAt:()=>100,bounds:[6.9,44.9,7.1,45.1],encodePNG:async()=>new Uint8Array([1,2]).buffer});
 assert.equal(f.sources.size,0);await view.open();assert.equal(f.map.getTerrain().exaggeration,1);assert.equal(f.map.getPitch(),55);assert.equal(f.protocols.size,1);assert.equal(f.map.dragRotate.isEnabled(),false);
 f.map.jumpTo({pitch:70,bearing:90,zoom:19});view.close();assert.equal(f.map.getPitch(),0);assert.equal(f.map.getBearing(),17);assert.equal(f.map.getZoom(),16);assert.equal(f.sources.size,0);assert.equal(f.protocols.size,0);assert.equal(JSON.stringify(original),saved);view.destroy();
});
test('protocol returns actual local tile bytes and releases resources on destroy',async()=>{
 const f=mock();let pixels;const view=createTerrainMapView({map:f.map,model:{contentHash:'frozen'},library:f.library,heightAt:()=>42.5,bounds:[6,44,8,46],encodePNG:async value=>{pixels=value;return new Uint8Array([1,2,3]).buffer;}});await view.open();const [name,handler]=[...f.protocols][0];const response=await handler({url:`${name}://tiles/0/0/0.png`},{signal:new AbortController().signal});assert.equal(response.data.byteLength,3);assert.equal(pixels.length,256*256*4);view.destroy();assert.equal(f.sources.size,0);
});
test('opening failure releases the registered protocol without changing the saved camera',async()=>{
 const f=mock();f.map.addSource=()=>{throw new Error('source failed');};const view=createTerrainMapView({map:f.map,model:{},library:f.library,heightAt:()=>42,bounds:[6,44,8,46]});await assert.rejects(view.open(),/source failed/);assert.equal(f.protocols.size,0);assert.equal(f.map.getPitch(),0);assert.equal(f.map.getBearing(),17);view.destroy();
});
test('closing an in-flight local tile prevents its late data from being published',async()=>{
 const f=mock();let resolve;const pending=new Promise(done=>resolve=done);const view=createTerrainMapView({map:f.map,model:{},library:f.library,heightAt:()=>42,bounds:[6,44,8,46],encodePNG:()=>pending});await view.open();const [name,handler]=[...f.protocols][0];const response=handler({url:`${name}://tiles/0/0/0.png`},{signal:new AbortController().signal});view.close();resolve(new Uint8Array([1]).buffer);await assert.rejects(response,{name:'AbortError'});assert.equal(f.protocols.size,0);assert.equal(f.sources.size,0);
});

test('a delayed initialization cannot add a source after close and the next generation can open',async()=>{
 const f=mock();let resolve,destroys=0,clients=0;const delayed=new Promise(done=>resolve=done);
 const view=createTerrainMapView({map:f.map,library:f.library,model:{},tileClientFactory:()=>({ready:++clients===1?delayed:Promise.resolve({bounds:[6,44,8,46]}),tile:async()=>new ArrayBuffer(1),destroy(){destroys++;}})});
 const opening=view.open();view.close();await view.open();const [scheme,handler]=[...f.protocols][0];resolve({bounds:[6,44,8,46]});await opening;assert.equal(f.sources.size,1);assert.equal((await handler({url:`${scheme}://tiles/0/0/0.png`})).data.byteLength,1);view.destroy();assert.equal(destroys,2);
});
test('failed source creation releases 3D gesture state and prior terrain after capture',async()=>{
 const f=mock();const prior={source:'prior',exaggeration:2};f.map.setTerrain(prior);f.map.addSource=()=>{throw new Error('source failed');};let releases=0,enters=0,stops=0;f.map.stop=()=>stops++;
 const view=createTerrainMapView({map:f.map,library:f.library,model:{},heightAt:()=>42,bounds:[6,44,8,46],gesturePolicy:{enter3D(){enters++;return ()=>releases++;}}});await assert.rejects(view.open(),/source failed/);assert.equal(enters,1);assert.equal(releases,1);assert.deepEqual(f.map.getTerrain(),prior);assert.equal(stops,2);view.close();assert.equal(releases,1);
});
test('closed and reopened source cannot receive an old generation PNG with the same scheme',async()=>{
 const f=mock();let resolve,first=true;const late=new Promise(done=>resolve=done);const view=createTerrainMapView({map:f.map,library:f.library,model:{},heightAt:()=>42,bounds:[6,44,8,46],encodePNG:()=>first?(first=false,late):Promise.resolve(new ArrayBuffer(2))});await view.open();const [scheme,old]=[...f.protocols][0];const oldTile=old({url:`${scheme}://tiles/0/0/0.png`});view.close();await view.open();resolve(new ArrayBuffer(1));await assert.rejects(oldTile,{name:'AbortError'});const handler=[...f.protocols][0][1];assert.equal((await handler({url:`${scheme}://tiles/0/0/0.png`})).data.byteLength,2);view.destroy();
});
