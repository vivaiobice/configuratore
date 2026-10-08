import test from 'node:test';import assert from 'node:assert/strict';
import {createTerrainModel} from '../src/terrain-model.js';
import {toUTM} from '../src/coordinate-system.js';
import {encodeTerrainHeight,buildTerrainTilePixels,createTerrainMapView} from '../src/terrain-map.js';
test('local DEM tiles encode heights from the supplied frozen surface only',()=>{
 const pixels=buildTerrainTilePixels({z:0,x:0,y:0,size:2},coordinate=>coordinate[0]<0?120.25:321.5);
 assert.equal(pixels.length,16);const decode=i=>(pixels[i]*256+pixels[i+1]+pixels[i+2]/256)-32768;
 assert.equal(decode(0),120.25);assert.equal(decode(4),321.5);assert.equal(pixels[3],255);assert.deepEqual(encodeTerrainHeight(-1.25),[127,254,192,255]);
});
test('map view uses native scene resources without DEM sources or terrain renderer',async()=>{
 let clients=0,destroyed=0,pitch=0;const [x,y]=toUTM([7,45],32632),model=createTerrainModel({source:{id:'adapter-fixture',label:'Anonimo',resolutionM:5,url:'about:blank',license:'CC0',citation:'Anonimo'},grid:{width:3,height:3,origin:[x-5,y+5],step:[5,-5],values:Array(9).fill(100)}});const layers=new Map(),geometry=[[7,45],[7.01,45],[7.01,45.01],[7,45]],scene={modelHash:model.contentHash,reference:{anchor:[0,0,0],coordinate:[7,45],height:100,metersToMercator:1},positions:new Float32Array(9),indices:new Uint32Array([0,1,2]),normals:new Float32Array(9),linePositions:new Float32Array(),lineColors:new Float32Array(),lineRanges:[]};
 const map={stop(){},getCenter:()=>({lng:7,lat:45}),getZoom:()=>16,getPitch:()=>pitch,getBearing:()=>17,getPadding:()=>({top:2,bottom:3,left:4,right:5}),jumpTo:value=>{pitch=value.pitch??pitch;},addLayer:layer=>layers.set(layer.id,layer),getLayer:id=>layers.get(id),removeLayer:id=>layers.delete(id),on(){},off(){},triggerRepaint(){},addSource(){assert.fail('no raster DEM sources');},setTerrain(){assert.fail('no terrain raster renderer');}};
 const view=createTerrainMapView({map,model,geometry,imageryClientFactory:()=>({ready:Promise.resolve({image:{width:256,height:256},width:256,height:256,zoom:16,coverage:[0,0,1,1],attribution:'Imagery fixture'}),destroy(){}}),sceneClientFactory:options=>{clients++;assert.equal(options.model,model);assert.deepEqual(options.geometry,geometry);return {ready:Promise.resolve(scene),destroy(){destroyed++;}};}});
 assert.equal(clients,0);await view.open();assert.equal(clients,1);assert.equal(layers.size,1);assert.equal([...layers.values()][0].type,'custom');assert.equal([...layers.values()][0].renderingMode,'3d');assert.equal(pitch,55);
 view.close();assert.equal(layers.size,0);assert.equal(pitch,0);assert.equal(destroyed,1);view.destroy();
});
