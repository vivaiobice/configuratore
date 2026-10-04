import test from 'node:test';import assert from 'node:assert/strict';
import {encodeTerrainHeight,buildTerrainTilePixels,createTerrainMapView} from '../src/terrain-map.js';
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
