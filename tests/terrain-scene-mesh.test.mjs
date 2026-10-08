import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainModel,createTerrainSampler} from '../src/terrain-model.js';
import {fromUTM} from '../src/coordinate-system.js';

const sceneModule=await import('../src/terrain-scene-mesh.js').catch(error=>{
 if(error.code==='ERR_MODULE_NOT_FOUND')return {};
 throw error;
});
const buildTerrainScene=options=>{
 assert.equal(typeof sceneModule.buildTerrainScene,'function','native scene builder is required');
 return sceneModule.buildTerrainScene(options);
};
const geo=([x,y])=>fromUTM([500000+x,5000000+y],32632);
const ring=points=>points.map(geo);
function fixture(){
 const model=createTerrainModel({grid:{width:3,height:3,origin:[500000,5000010],step:[5,-5],values:[100,100,110,100,108,112,102,110,115]}});
 const geometry=ring([[0,0],[10,0],[10,10],[0,10],[0,0]]);
 return {model,geometry};
}
const heights=(positions,reference)=>Array.from({length:positions.length/3},(_,i)=>positions[i*3+2]/reference.metersToMercator+reference.height);
const close=(actual,expected,tolerance=1e-5)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);
function restoreCoordinate(positions,index,reference){
 const x=positions[index*3]+reference.anchor[0],y=positions[index*3+1]+reference.anchor[1];
 return [x*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI];
}

// Catches grid decimation, a changed native diagonal, or resampled vertex heights.
test('scene retains every frozen native vertex and calculator triangle at height one',()=>{
 const f=fixture(),scene=buildTerrainScene(f);
 assert.ok(scene.positions instanceof Float32Array);
 assert.ok(scene.indices instanceof Uint32Array);
 assert.equal(scene.nativeVertexCount,9);assert.equal(scene.nativeTriangleCount,8);
 assert.equal(scene.positions.length,27);
 assert.deepEqual(Array.from(scene.indices),[0,1,3,1,4,3,1,2,4,2,5,4,3,4,6,4,7,6,4,5,7,5,8,7]);
 assert.equal(scene.modelHash,f.model.contentHash);
 close(scene.reference.height,108,1e-7);
 heights(scene.positions,scene.reference).forEach((height,index)=>close(height,[100,100,110,100,108,112,102,110,115][index]));
 for(let i=0;i<scene.normals.length;i+=3){close(Math.hypot(...scene.normals.slice(i,i+3)),1,1e-6);assert.ok(scene.normals[i+2]>0);}
 assert.ok(scene.bounds[0]<scene.bounds[2]&&scene.bounds[1]<scene.bounds[3]);
});

// Catches endpoint-only row lifting and bilinear interpolation across native faces.
test('row lines split at grid and native diagonal crossings with exact face heights',()=>{
 const f=fixture(),rows=[{id:'actual-row',coordinates:ring([[0,7.5],[10,7.5]]),lengthM:10}];
 const scene=buildTerrainScene({...f,rows}),range=scene.lineRanges.find(item=>item.kind==='rows');
 assert.ok(range);assert.equal(range.id,'actual-row');assert.equal(range.count,8);
 const values=heights(scene.linePositions.slice(range.offset*3,(range.offset+range.count)*3),scene.reference);
 values.forEach((height,index)=>close(height,[100,100,100,104,104,109,109,111][index]));
 const sample=createTerrainSampler(f.model);
 for(let i=range.offset;i<range.offset+range.count;i++)close(heights(scene.linePositions,scene.reference)[i],sample(restoreCoordinate(scene.linePositions,i,scene.reference)),3e-5);
});

// Catches ignoring a saved polyline in favor of its start/end compatibility fields.
test('actual row coordinates preserve bends and start/end legacy rows remain supported',()=>{
 const f=fixture(),bend=geo([5,5]);
 const scene=buildTerrainScene({...f,rows:[{id:'bent',coordinates:[geo([1,8]),bend,geo([9,8])],start:geo([1,1]),end:geo([9,1])},{id:'legacy',start:geo([0,7.5]),end:geo([10,7.5])}]});
 const ranges=scene.lineRanges.filter(item=>item.kind==='rows');assert.equal(ranges.length,2);
 const bent=ranges[0];
 assert.ok(Array.from({length:bent.count},(_,i)=>restoreCoordinate(scene.linePositions,bent.offset+i,scene.reference)).some(point=>Math.hypot(point[0]-bend[0],point[1]-bend[1])<1e-9));
 assert.ok(ranges[1].count>=2);
});

// Catches losing effective MultiPolygon passage rings, holes, or portion boundaries.
test('field passage and portion line ranges retain actual polygon rings and independent visibility kinds',()=>{
 const f=fixture(),outer=ring([[1,1],[4,1],[4,4],[1,4],[1,1]]),hole=ring([[2,2],[3,2],[3,3],[2,3],[2,2]]),second=ring([[6,6],[9,6],[9,9],[6,9],[6,6]]);
 const exclusions={type:'FeatureCollection',features:[{type:'Feature',id:'passage',properties:{groupId:'native-passage'},geometry:{type:'MultiPolygon',coordinates:[[outer,hole],[second]]}}]};
 const rowPortions=[{id:'portion',geometry:[outer,hole]}];
 const scene=buildTerrainScene({...f,exclusions,rowPortions});
 assert.equal(scene.lineRanges.filter(item=>item.kind==='field').length,1);
 assert.equal(scene.lineRanges.filter(item=>item.kind==='exclusions').length,3);
 assert.equal(scene.lineRanges.filter(item=>item.kind==='portions').length,2);
 assert.ok(scene.lineRanges.filter(item=>item.kind==='exclusions').every(item=>item.id==='passage'));
 assert.equal(scene.lineColors.length,scene.linePositions.length);
 for(const range of scene.lineRanges){assert.equal(range.count%2,0);assert.ok(range.count>=2);}
});

// Catches mutation of project geometry, saved rows, frozen grid, or overlay topology.
test('scene preparation does not mutate any supplied model or presentation input',()=>{
 const f=fixture(),input={...f,rows:[{coordinates:ring([[1,7],[9,7]])}],exclusions:[{id:'area',geometry:ring([[1,1],[3,1],[3,3],[1,3],[1,1]])}],rowPortions:[]};
 const before=structuredClone(input);buildTerrainScene(input);assert.deepEqual(input,before);
});

// Catches edge clamping, null-to-zero coercion, and accepting malformed overlays.
test('uncovered field or overlay points and invalid frozen model reject instead of drawing flat ground',()=>{
 const f=fixture();
 assert.throws(()=>buildTerrainScene({...f,geometry:ring([[0,0],[15,0],[15,5],[0,5],[0,0]])}),/copertura|coverage|fuori/i);
 assert.throws(()=>buildTerrainScene({...f,rows:[{start:geo([1,1]),end:geo([15,1])}]}),/copertura|coverage|fuori/i);
 assert.throws(()=>buildTerrainScene({...f,rows:[{coordinates:[[NaN,45],[9,45]]}]}),/coordinate|finite|line/i);
 const broken=structuredClone(f.model);broken.grid.valuesBase64='missing';
 assert.throws(()=>buildTerrainScene({...f,model:broken}),/griglia|base64|modello|grid/i);
});

// Catches omitted buffers or transferring an input/model buffer by accident.
test('transferables contain each owned output buffer exactly once',()=>{
 const f=fixture(),scene=buildTerrainScene(f);
 assert.equal(typeof sceneModule.terrainSceneTransferables,'function');
 const transfer=sceneModule.terrainSceneTransferables(scene);
 assert.equal(new Set(transfer).size,5);
 assert.deepEqual(new Set(transfer),new Set([scene.positions.buffer,scene.normals.buffer,scene.indices.buffer,scene.linePositions.buffer,scene.lineColors.buffer]));
});

// Exercises the production worker boundary; no renderer or terrain acquisition is substituted.
test('production scene worker returns transferred native scene and rejects invalid input',async()=>{
 const {Worker}=await import('node:worker_threads');
 const workerURL=new URL('../src/terrain-scene-worker.js',import.meta.url).href;
 const thread=new Worker(`const {parentPort}=require('node:worker_threads');global.self={postMessage:(data,transfer)=>parentPort.postMessage(data,transfer)};const loaded=import(${JSON.stringify(workerURL)});parentPort.on('message',async data=>{await loaded;self.onmessage({data});});`,{eval:true});
 const ask=data=>new Promise((resolve,reject)=>{thread.once('message',resolve);thread.once('error',reject);thread.postMessage(data);});
 try{
  const f=fixture(),response=await ask({type:'build',id:17,scene:f});
  assert.equal(response.type,'scene');assert.equal(response.id,17);assert.equal(response.scene.modelHash,f.model.contentHash);assert.equal(response.scene.positions.length,27);assert.ok(response.scene.indices instanceof Uint32Array);
  const failure=await ask({type:'build',id:18,scene:{...f,rows:[{start:geo([1,1]),end:geo([20,1])}]}});
  assert.equal(failure.type,'error');assert.equal(failure.id,18);assert.match(failure.message,/copertura|coverage|fuori/i);assert.equal(failure.scene,undefined);
 }finally{await thread.terminate();}
});
