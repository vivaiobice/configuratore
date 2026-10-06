import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import * as terrain from '../src/terrain-model.js';
import {toUTM,fromUTM} from '../src/coordinate-system.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
const api=existsSync(new URL('../src/terrain-contour-domain.js',import.meta.url))?await import('../src/terrain-contour-domain.js'):{};
const scoped=(model,geometry)=>{assert.equal(typeof terrain.terrainScopedSummary,'function');return terrain.terrainScopedSummary(model,geometry);};
const domainFor=(model,geometry,budget)=>{assert.equal(typeof api.createContourDomain,'function');return api.createContourDomain({model,geometry,budget});};
const polygon=p=>({type:'Polygon',coordinates:[p.geometry,...p.exclusions]});

test('outside steep support cannot change field summary',()=>{
 const {model,project}=contourFixture({height:x=>x<0?-x*10:0,geometryXY:[[1,1],[39,1],[39,39],[1,39],[1,1]]});
 const summary=scoped(model,polygon(project));
 assert.equal(summary.valid,true);assert.equal(summary.rangeM,0);
 assert.equal(summary.maxSlopePercent,0);
 assert.ok(terrain.terrainSummary(model).maxSlopePercent>=1000);
});
test('clipped boundary heights contribute extrema',()=>{
 const {model,project}=contourFixture({height:(x,y)=>x*.25+y*.5,geometryXY:[[1,2],[4,2],[4,4],[1,4],[1,2]]});
 const summary=scoped(model,polygon(project)),expectedClippedRange=1.75;
 assert.ok(Math.abs(summary.rangeM-expectedClippedRange)<.001);
 assert.ok(Math.abs(summary.minM-1.25)<.001);assert.ok(Math.abs(summary.maxM-3)<.001);
 assert.ok(Math.abs(summary.maxSlopePercent-100*Math.hypot(.25,.5))<1e-9);
});
test('holes and L topology retain correct area',()=>{
 const {model,project}=contourFixture({height:x=>x*.25,geometryXY:[[0,0],[40,0],[40,10],[10,10],[10,40],[0,40],[0,0]],exclusionsXY:[[[2,2],[4,2],[4,4],[2,4],[2,2]]]});
 const domain=domainFor(model,polygon(project));
 assert.equal(domain.modelHash,model.contentHash);
 assert.ok(Math.abs(domain.areaM2-696)<.001);assert.ok(Math.abs(domain.surfaceAreaM2-696*Math.sqrt(1.0625))<.001);
 assert.equal(domain.boundaries.filter(b=>b.hole).length,1);
 assert.ok(domain.faces.every(f=>f.areaM2>0));
 assert.ok(domain.faces.some(f=>f.neighbors.some(id=>id!==null&&!domain.faceById.has(id))));
 for(const f of domain.faces){assert.equal(f.vertexIds.length,3);assert.equal(f.edgeIds.length,3);assert.equal(f.vertices.length,3);for(const id of f.neighbors.filter(id=>domain.faceById.has(id)))assert.ok(domain.faceById.get(id).neighbors.includes(f.id));}
 assert.ok(domain.spatialIndex.query([500020,5000020,500025,5000025]).length===0);
 assert.ok(domain.elevationIndex.query(1).length>0);assert.deepEqual(domain.elevationIndex.query(999),[]);
});
test('a physical hole removes the native peak from domain and scoped summary extrema',()=>{
 const {model,project}=contourFixture({height:(x,y)=>Math.max(0,10-Math.abs(x-10)-Math.abs(y-10)),geometryXY:[[0,0],[20,0],[20,20],[0,20],[0,0]],exclusionsXY:[[[7,7],[13,7],[13,13],[7,13],[7,7]]]});
 const geometry=polygon(project),domain=domainFor(model,geometry),summary=scoped(model,geometry);
 assert.ok(Math.abs(domain.areaM2-364)<.001);
 assert.ok(Math.abs(domain.maxM-7)<1e-7,`domain maximum ${domain.maxM}`);
 assert.ok(Math.abs(summary.maxM-7)<1e-7,`summary maximum ${summary.maxM}`);
 assert.equal(domain.minM,0);assert.equal(summary.minM,0);
});
test('index and model budgets are enforced',()=>{
 const {model,project}=contourFixture();const geometry=polygon(project);
 const domain=domainFor(model,geometry); // prime cache; hits must count retained nodes
 const budget=createTerrainBudget({kind:'adapt'});budget.check(500000);
 const overBudgetDomain=()=>domainFor(model,geometry,budget);
 assert.throws(overBudgetDomain,{status:'budget-exceeded'});
 assert.throws(()=>domainFor(model,geometry,createTerrainBudget({kind:'adapt',deadlineMs:0})),{status:'budget-exceeded'});
 const oversized={...model,grid:{...model.grid,width:262145}};
 assert.throws(()=>domainFor(oversized,geometry),{status:'budget-exceeded'});
 assert.ok(domain.faces.length>0);
});
test('cache cannot hide mutated models or geometry and missing coverage is explicit',()=>{
 const {model,project}=contourFixture();const geometry=polygon(project),first=domainFor(model,geometry);
 const imported=structuredClone(model);imported.grid.valuesBase64='AAAA';
 assert.throws(()=>domainFor(imported,geometry));
 const {project:outside}=contourFixture({geometryXY:[[-30,0],[0,0],[0,10],[-30,10],[-30,0]]});
 assert.throws(()=>domainFor(model,polygon(outside)),{status:'uncovered'});
 geometry.coordinates[0]=geometry.coordinates[0].map(p=>[...p]);
 assert.equal(domainFor(model,geometry),first);
 geometry.coordinates[0][1][0]-=.000001;
 assert.notEqual(domainFor(model,geometry),first);
});

test('coincident native breaks retain the actual projected boundary and positive-area slope',()=>{
 const {model,project}=contourFixture({height:x=>x<20?(20-x)*10:0,geometryXY:[[20,0],[40,0],[40,40],[20,40],[20,0]]});
 const projected=project.geometry.map(p=>toUTM(p,32632)),minimumX=Math.min(...projected.map(p=>p[0]));
 const domain=domainFor(model,polygon(project));
 assert.deepEqual(domain.boundaries[0].coordinatesXY,projected);
 assert.equal(domain.maxSlopePercent,minimumX<500020?1000:0);
});
test('disconnected polygons have distinct real boundaries and independent clips',()=>{
 const a=contourFixture({geometryXY:[[1,1],[4,1],[4,4],[1,4],[1,1]]}),b=contourFixture({geometryXY:[[11,11],[14,11],[14,14],[11,14],[11,11]]});
 const domain=domainFor(a.model,{type:'MultiPolygon',coordinates:[[a.project.geometry],[b.project.geometry]]});
 assert.ok(Math.abs(domain.areaM2-18)<.001);assert.equal(domain.boundaries.length,2);
 assert.ok(domain.spatialIndex.query([500000,5000000,500005,5000005]).length>0);
 assert.deepEqual(domain.spatialIndex.query([500006,5000006,500009,5000009]),[]);
 assert.throws(()=>domain.faces[0].vertices[0].push(999),TypeError);
});
test('cold domain construction and bounded cache obey cumulative node limits',()=>{
 const first=contourFixture({geometryXY:[[1,1],[9,1],[9,9],[1,9],[1,1]]}),geometry=polygon(first.project);
 const budget=createTerrainBudget({kind:'adapt'});budget.check(499900);
 assert.throws(()=>domainFor(first.model,geometry,budget),{status:'budget-exceeded'});
 const retained=domainFor(first.model,geometry);
 for(let i=0;i<4;i++){const f=contourFixture({geometryXY:[[11+i,11],[19+i,11],[19+i,19],[11+i,19],[11+i,11]]});domainFor(f.model,polygon(f.project));}
 const rebuilt=domainFor(first.model,geometry);
 assert.notEqual(rebuilt,retained);assert.deepEqual(rebuilt.faces,retained.faces);
});
test('elevation pruning retains native levels beyond clipped summary extrema',()=>{
 const {model,project}=contourFixture({height:(x,y)=>x*.25+y*.5,geometryXY:[[1,2],[4,2],[4,4],[1,4],[1,2]]});
 const domain=domainFor(model,polygon(project));
 assert.ok(domain.minM>1); // true field clip is above level zero
 const candidates=domain.elevationIndex.query(0);
 assert.ok(candidates.length>0); // raw supporting native triangle reaches zero
 assert.ok(candidates.every(id=>domain.faceById.get(id).vertices.some(p=>p[2]===0)));
});

test('positive sub-ULP-display native corner slivers remain in exact whole-domain support',async()=>{
 const {certifyUniformPlaneSupport}=await import('../src/terrain-surface-bands.js');
 const model=terrain.createTerrainModel({acquiredAt:'2026-10-05T00:00:00.000Z',grid:{width:25,height:25,origin:[499990,5000110],step:[5,-5],values:Array.from({length:625},(_,i)=>(110-Math.floor(i/25)*5)/5)}});
 const ring=[[500000,5000000],[500100,5000000],[500100,5000100],[500000,5000100],[500000,5000000]].map(p=>fromUTM(p));
 const domain=domainFor(model,{type:'Polygon',coordinates:[ring]});
 assert.equal(certifyUniformPlaneSupport(domain)?.complete,true);
 assert.ok(domain.faces.some(f=>f.areaM2>0&&f.areaM2<1e-15));
});
