import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compactTerrainRowPreview,validTerrainRowPreview,TERRAIN_ROW_PREVIEW_CONVENTION,TERRAIN_ROW_PREVIEW_TOLERANCE_M} from '../src/terrain-row-preview.js';
const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/n)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
test('preview reduces redundant knots, preserves endpoints and conservatively bounds deviations',()=>{
 const points=Array.from({length:4001},(_,i)=>[500000+i/40,5000000+.006*Math.sin(i/30)+.08*Math.sin(i/800)]),before=structuredClone(points);
 const preview=compactTerrainRowPreview(points);
 assert.ok(preview.length<points.length/10);assert.deepEqual(preview[0],points[0]);assert.deepEqual(preview.at(-1),points.at(-1));assert.deepEqual(points,before);
 let segment=0;for(const point of points){while(segment<preview.length-2&&point[0]>preview[segment+1][0])segment++;assert.ok(distance(point,preview[segment],preview[segment+1])<=.01);}
 assert.notEqual(preview[0],points[0]);
});
test('preview retains folds and deviations above the fixed bound',()=>{
 const points=[[0,0],[1,0],[1,.021],[1,0],[0,0]],preview=compactTerrainRowPreview(points);
 assert.deepEqual(preview,[[0,0],[1,0],[1,.021],[1,0],[0,0]]);
});
test('new preview copies are precharged and deadline failure cannot emit partial rows',()=>{
 let charged=0;const preview=compactTerrainRowPreview([[0,0],[1,0],[2,0]],.01,{budget:{check(n=0){charged+=n;if(n)assert.equal(charged,2);}}});assert.equal(charged,2);assert.equal(preview.length,2);
 let checks=0;assert.throws(()=>compactTerrainRowPreview([[0,0],[1,0],[2,0]],.01,{budget:{check(){if(++checks===5)throw new Error('deadline');}}}),/deadline/);
});
test('only the declared fixed presentation convention is accepted',()=>{
 const marker={convention:TERRAIN_ROW_PREVIEW_CONVENTION,toleranceM:TERRAIN_ROW_PREVIEW_TOLERANCE_M};assert.equal(validTerrainRowPreview(marker),true);
 for(const bad of [Object.assign({...marker},{[Symbol('unknown')]:true}),Object.defineProperty({...marker},'hidden',{value:true}),Object.defineProperty({...marker},'convention',{get(){throw new Error('getter executed');},enumerable:true}),null,{},[marker],{...marker,toleranceM:.02},{...marker,convention:'unknown'},{...marker,extra:true}])assert.equal(validTerrainRowPreview(bad),false);
 for(const bad of [[],[[0,0]],[[0,0],[NaN,1]]])assert.throws(()=>compactTerrainRowPreview(bad),/Invalid/);
});
test('native lengths are integrated before optional marked preview, and replay reconstructs that convention',async()=>{
 const family=await readFile(new URL('../src/terrain-contour-family.js',import.meta.url),'utf8'),replay=await readFile(new URL('../src/terrain-replay.js',import.meta.url),'utf8'),design=await readFile(new URL('../src/terrain-contour-design.js',import.meta.url),'utf8');
 assert.ok(family.indexOf('surfaceLengthBoundsM=exactPieceLengthBounds(actual')<family.indexOf('nativeCoordinatesXY='));
 assert.match(family,/rowPreview\?compactTerrainRowPreview/);assert.match(replay,/validTerrainRowPreview\(design.rowPreview\)/);assert.match(replay,/rowPreview:design.rowPreview\?\?null/);
 assert.match(design,/rowPreview:\{convention:TERRAIN_ROW_PREVIEW_CONVENTION,toleranceM:TERRAIN_ROW_PREVIEW_TOLERANCE_M\}/);
});
