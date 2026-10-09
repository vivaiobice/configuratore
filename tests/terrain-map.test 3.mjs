import test from 'node:test';import assert from 'node:assert/strict';
import {createTerrainModel} from '../src/terrain-model.js';
import {toUTM} from '../src/coordinate-system.js';
import {encodeTerrainHeight,buildTerrainTilePixels,createTerrainMapView} from '../src/terrain-map.js';
test('local DEM tiles encode heights from the supplied frozen surface only',()=>{
 const pixels=buildTerrainTilePixels({z:0,x:0,y:0,size:2},coordinate=>coordinate[0]<0?120.25:321.5);
 assert.equal(pixels.length,16);const decode=i=>(pixels[i]*256+pixels[i+1]+pixels[i+2]/256)-32768;
 assert.equal(decode(0),120.25);assert.equal(decode(4),321.5);assert.equal(pixels[3],255);assert.deepEqual(encodeTerrainHeight(-1.25),[127,254,192,255]);
});
test('map adapter selects continuous native DEM presentation and releases it on close',async()=>{
 let clients=0,destroyed=0,pitch=0,terrain=null;const [x,y]=toUTM([7,45],32632),model=createTerrainModel({source:{id:'adapter-fixture',label:'Anonimo',resolutionM:5,url:'about:blank',license:'CC0',citation:'Anonimo'},grid:{width:3,height:3,origin:[x-5,y+5],step:[5,-5],values:Array(9).fill(100)}}),geometry=[[7,45],[7.01,45],[7.01,45.01],[7,45]],sources=new Map(),protocols=new Map();
 const map={stop(){},getCenter:()=>({lng:7,lat:45}),getZoom:()=>16,getPitch:()=>pitch,getBearing:()=>17,getPadding:()=>({top:2,bottom:3,left:4,right:5}),jumpTo:value=>{pitch=value.pitch??pitch;},on(){},off(){},triggerRepaint(){},addSource:(id,value)=>sources.set(id,value),getSource:id=>sources.get(id),removeSource:id=>sources.delete(id),isSourceLoaded:()=>true,getTerrain:()=>terrain,setTerrain:value=>{terrain=value;}};
 const view=createTerrainMapView({map,model,geometry,maplibre:{addProtocol:(id,fn)=>protocols.set(id,fn),removeProtocol:id=>protocols.delete(id)},displayClientFactory:options=>{clients++;assert.equal(options.model,model);assert.deepEqual(options.geometry,geometry);return {ready:Promise.resolve({coordinate:[7,45],attribution:'Anonymous fixture'}),destroy(){destroyed++;}};}});
 assert.equal(clients,0);await view.open();assert.equal(clients,1);assert.equal(sources.size,1);assert.equal([...sources.values()][0].type,'raster-dem');assert.equal(terrain.exaggeration,1);assert.equal(pitch,55);
 view.close();assert.equal(sources.size,0);assert.equal(terrain,null);assert.equal(protocols.size,0);assert.equal(pitch,0);assert.equal(destroyed,1);view.destroy();
});
