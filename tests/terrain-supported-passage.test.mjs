import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {createContourDomain} from '../src/terrain-contour-domain.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {fromUTM,toUTM} from '../src/coordinate-system.js';
import {resolveTerrainExclusionGroups} from '../src/terrain-exclusion-groups.js?v=1.3.4';
import {sumMeasuredSurfaceAreas,compareMeasuredSurfaceAreas,traceSurfaceBand} from '../src/terrain-surface-bands.js?v=1.3.4';
const api=existsSync(new URL('../src/terrain-passage.js',import.meta.url))?await import('../src/terrain-passage.js'):{};
const geographic=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
function run({geometryXY,polygonsXY,axisXY,widthM=1.5,height}={}){
 assert.equal(typeof api.traceSupportedPassageStrip,'function');
 const {project,model}=contourFixture({geometryXY,height}),budget=createTerrainBudget({kind:'cut'});
 const geometry=polygonsXY?{type:'MultiPolygon',coordinates:polygonsXY.map(ring=>[geographic(ring)])}:{type:'Polygon',coordinates:[project.geometry]};
 const physicalDomain=createContourDomain({model,geometry,budget});
 return api.traceSupportedPassageStrip({model,physicalDomain,sourceAxis:geographic(axisXY),widthM,budget});
}

test('supported full-width strip includes the slanted-cap wedge and binds original physical scope',()=>{
 const result=run({geometryXY:[[0,0],[10,0],[10,10],[0,6],[0,0]],axisXY:[[5,-2],[5,12]]});
 assert.equal(result.valid,true,JSON.stringify(result.validation));
 assert.equal(result.surfaceConstructionPolicy,'native-supported-axis-clip-1');
 assert.equal(result.validation.exceptions.length,0);
 assert.equal(result.validation.supportedWholeAxis,true);
 assert.equal(compareMeasuredSurfaceAreas(sumMeasuredSurfaceAreas([result]),result),0);
 assert.ok(Math.abs(result.areaM2-12)<1e-5);
 assert.ok(result.validation.serializedHalfWidthsM.every(bounds=>bounds[0]<=.75+1e-5&&bounds[1]>=.75-1e-5));
 assert.ok(result.scopeGeometry.coordinates[0].some(p=>p[0]!==result.geometry.coordinates[0][0][0][0]));
});

test('physical masking preserves reentry at original distance without filling a hole or third lobe',()=>{
 const result=run({geometryXY:[[0,0],[8,0],[8,4],[0,4],[0,0]],polygonsXY:[[[0,0],[5.2,0],[5.2,4],[0,4],[0,0]],[[5.4,0],[8,0],[8,4],[5.4,4],[5.4,0]]],axisXY:[[5,-3],[5,7]],widthM:3});
 assert.equal(result.valid,true,JSON.stringify(result.validation));
 assert.ok(Math.abs(result.areaM2-11.2)<1e-5);
 assert.equal(result.validation.topology.projectedBand,'2:0');
 assert.equal(result.validation.exceptions.length,0);
});

test('unchanged finite short source keeps the real cap gap and insufficient native support fails closed',()=>{
 const short=run({geometryXY:[[0,0],[10,0],[10,10],[0,10],[0,0]],axisXY:[[5,-3],[5,9.9995]]});
 assert.equal(short.valid,true,JSON.stringify(short.validation));
 assert.equal(short.validation.topology.projectedRemainder,'1:0');
 assert.deepEqual(short.sourceAxis,geographic([[5,-3],[5,9.9995]]));
 assert.throws(()=>run({geometryXY:[[0,0],[10,0],[10,10],[0,10],[0,0]],axisXY:[[5,-21],[5,12]]}),{status:'uncovered'});
});

test('a finite source on a native crease retains both actual incident-plane cap and width proofs',()=>{
 const result=run({height:(x,y)=>(x<0?.05:.4)*x+.2*y,geometryXY:[[-5,0],[5,0],[5,4],[-5,4],[-5,0]],axisXY:[[0,-3],[0,7]]});
 assert.equal(result.valid,true,JSON.stringify(result.validation.unresolved));
 assert.equal(result.validation.supportedWholeAxis,true);
 assert.equal(compareMeasuredSurfaceAreas(sumMeasuredSurfaceAreas([result]),result),0);
 assert.equal(result.validation.exceptions.length,0);
 assert.ok(result.validation.serializedHalfWidthsM.every(bounds=>bounds[0]>.75-1e-5&&bounds[1]<.75+1e-5));
 assert.ok(result.validation.boundaryGuards.some(guard=>guard.kind==='finite-original-source-cap'));
});

test('persisted passage group factory binds actual strip evidence and raw construction once',()=>{
 const strip=run({geometryXY:[[0,0],[10,0],[10,10],[0,10],[0,0]],axisXY:[[5,-3],[5,13]]});
 assert.equal(strip.valid,true,JSON.stringify(strip.validation.unresolved));
 assert.equal(typeof api.createTerrainPassageGroup,'function');
 const before=JSON.stringify(strip),parts=api.createTerrainPassageGroup({strip,scopePortionId:'original',passageGroupId:'new-road',createId:()=> 'owner'});
 assert.equal(parts.length,1);
 assert.equal(parts[0].surfaceGroupOwner,true);
 assert.deepEqual(parts[0].surfaceGeometry,strip.geometry);
 assert.deepEqual(parts[0].scopeGeometry,strip.scopeGeometry);
 assert.deepEqual(parts[0].sourceAxis,strip.sourceAxis);
 assert.equal(resolveTerrainExclusionGroups({exclusions:parts,field:strip.scopeGeometry}).groups.length,1);
 assert.equal(JSON.stringify(strip),before);
 assert.equal(compareMeasuredSurfaceAreas(strip,strip),0);
 assert.throws(()=>api.createTerrainPassageGroup({strip:structuredClone(strip),scopePortionId:'original',passageGroupId:'g',createId:()=> 'fake'}),{status:'area-order-unresolved'});
});

test('direct supported band producer requires the complete actual geographic source before certification',()=>{
 const {project,model}=contourFixture({geometryXY:[[0,0],[10,0],[10,10],[0,10],[0,0]]});
 const budget=createTerrainBudget({kind:'cut'}),physicalDomain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[project.geometry]},budget});
 const domain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[geographic([[2,-6],[8,-6],[8,16],[2,16],[2,-6]])]},budget});
 const sourceAxis=geographic([[5,-3],[5,13]]),axisXY=sourceAxis.map(p=>toUTM(p,32632));
 const options={domain,physicalDomain,axisXY,widthM:1.5,budget};
 for(const geographicSourceAxis of [undefined,null,[],[[9,45]],[[NaN,45],[9,45]],[[500000,5000000],[500000,5000010]],geographic([[4,-3],[4,13]])]){
  assert.throws(()=>traceSurfaceBand({...options,geographicSourceAxis}),/geographic binding/);
 }
 assert.throws(()=>traceSurfaceBand({...options,axisXY:[...axisXY,[...axisXY[1]]],geographicSourceAxis:sourceAxis}),/geographic binding/);
});
