import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createContourDomain} from '../src/terrain-contour-domain.js';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
const api=existsSync(new URL('../src/terrain-contour-validation.js',import.meta.url))?await import('../src/terrain-contour-validation.js'):{};
const contours=existsSync(new URL('../src/terrain-contours.js',import.meta.url))?await import('../src/terrain-contours.js'):{};
const make=(height=()=>0,exclusionsXY=[])=>{const f=contourFixture({height,exclusionsXY});return createContourDomain({model:f.model,geometry:{type:'Polygon',coordinates:[f.project.geometry,...f.project.exclusions]}});};
const axis=(id,y,x0=1,x1=39,levelM=0)=>({axisId:id,portionId:'p',ordinal:+id,levelM,components:[{faceIds:[],coordinatesXY:[[500000+x0,5000000+y],[500000+x1,5000000+y]]}]});
const spacing=(d,axes,opts={})=>{assert.equal(typeof api.certifyContourSpacing,'function');return api.certifyContourSpacing(d,axes,{spacingM:3,...opts});};
const elevation=(d,axes)=>{assert.equal(typeof api.certifyContourElevation,'function');return api.certifyContourElevation(d,axes,{});};
test('same-height endpoints over hump fail elevation',()=>{
 const d=make(x=>x<=20?x/5:(40-x)/5),a=axis('0',10,0,40,0),r=elevation(d,[a]);
 assert.equal(r.valid,false);assert.ok(r.maxDeviationM>=4);assert.ok(r.critical.some(c=>c.reason==='elevation'));
});
test('extracted straight rows certify elevation continuously',()=>{
 assert.equal(typeof contours.traceContourLevel,'function');const d=make((x,y)=>y/5),r=elevation(d,contours.traceContourLevel(d,3,{}).axes);
 assert.equal(r.valid,true);assert.ok(r.maxDeviationM<=.001);
});
test('inclusive bidirectional 2.80 to 3.20 certificate',()=>{
 // Local exact XY avoids losing an ULP to a large projected origin.
 const d=exactFlat(),a=(id,y)=>({axisId:id,ordinal:+id,levelM:0,components:[{coordinatesXY:[[1,y],[9,y]],faceIds:[]}]});
 for(const y of [2.8,3.2]){const r=spacing(d,[a('0',0),a('1',y)]);assert.equal(r.valid,true,JSON.stringify(r));assert.ok(r.lowerM>=2.8&&r.upperM<=3.2);assert.ok(r.spans.some(s=>s.direction==='reverse'));assert.equal(r.coverage.complete,true);}
 const bits=new DataView(new ArrayBuffer(8));bits.setFloat64(0,2.8);bits.setBigUint64(0,bits.getBigUint64(0)-1n);assert.equal(spacing(d,[a('0',0),a('1',bits.getFloat64(0))]).valid,false);
 bits.setFloat64(0,3.2);bits.setBigUint64(0,bits.getBigUint64(0)+1n);assert.equal(spacing(d,[a('0',0),a('1',bits.getFloat64(0))]).valid,false);
});
function exactFlat(){const vs=[[0,-1,0],[10,-1,0],[0,10,0],[10,10,0]],faces=[[0,1,2],[1,3,2]].map((ids,id)=>({id,vertexIds:ids,vertices:ids.map(i=>vs[i]),edgeIds:ids.map((v,i)=>[v,ids[(i+1)%3]].sort((a,b)=>a-b).join(':')),neighbors:id===0?[null,1,null]:[null,null,0],bounds:[0,-1,10,10]}));return {faces,boundaries:[{id:'outer',polygonIndex:0,ringIndex:0,hole:false,coordinatesXY:[[0,-1],[10,-1],[10,10],[0,10],[0,-1]]}],faceById:new Map(faces.map(f=>[f.id,f])),spatialIndex:{query:()=>[0,1]}};}
test('omitted interior row fails upper bound',()=>{const r=spacing(make(),[axis('0',5),axis('2',11)]);assert.equal(r.valid,false);assert.ok(r.critical.some(c=>c.reason==='too-far'));});
test('reverse extra span detects missing source piece',()=>{const r=spacing(make(),[axis('0',5,10,30),axis('1',8)]);assert.equal(r.valid,false);assert.ok(r.critical.some(c=>c.reason==='missing-axis'&&c.direction==='reverse'&&c.event.kind==='level'));});
test('real boundary exception only',()=>{const d=make(()=>0,[[[0,6],[40,6],[40,7],[0,7],[0,6]]]),r=spacing(d,[axis('0',5),axis('1',11)]);assert.equal(r.valid,true,JSON.stringify(r));assert.ok(r.exceptions.length>0);assert.ok(r.exceptions.every(e=>e.boundaryId));});
test('nearly tangent hole cannot waive an interior gap',()=>{
 const d=make(()=>0,[[[20,8],[21,9],[19,9],[20,8]]]),r=spacing(d,[axis('0',5),axis('1',11)]);
 assert.equal(r.valid,false);assert.ok(r.critical.some(c=>c.reason==='too-far'));
});
test('close endpoints cannot evade approach check',()=>{
 const a=axis('0',5,1,10),b=axis('1',8,1,10);b.components.push({coordinatesXY:[[500010,5000005.1],[500012,5000006]],faceIds:[]});
 const r=spacing(make(),[a,b]);assert.equal(r.valid,false);assert.ok(r.critical.some(c=>c.reason==='too-close'));
});
test('ambiguous normal itinerary is unresolved',()=>{
 const d=make((x,y)=>y<20?y/5:4),a=axis('0',15,1,39,3),b=axis('1',25,1,39,4),r=spacing(d,[a,b]);
 assert.equal(r.valid,false);assert.ok(r.unresolved.length>0);
});

test('short XYZ chord across an extruded crease is refined to surface lower bound',()=>{
 const d=make(x=>x<20?.1*x:2+2*(x-20));
 const a={axisId:'0',levelM:1.91,ordinal:0,components:[{coordinatesXY:[[500019.1,5000001],[500019.1,5000039]]}]},b={axisId:'1',levelM:3.8,ordinal:1,components:[{coordinatesXY:[[500020.9,5000001],[500020.9,5000039]]}]};
 const r=spacing(d,[a,b]);assert.equal(r.valid,true,JSON.stringify(r));assert.ok(r.approach.proofs.some(p=>p.kind==='extrusion-isometry-lower'));assert.ok(r.lowerM>2.9168&&r.upperM<2.9171);
});

test('varying failed spans report an interior witness wholly outside the allowed interval',()=>{
 const d=exactFlat(),a={axisId:'0',ordinal:0,levelM:0,components:[{coordinatesXY:[[1,0],[9,0]]}]},b={axisId:'1',ordinal:1,levelM:0,components:[{coordinatesXY:[[1,2.7],[9,3]]}]},r=spacing(d,[a,b]);
 const failures=r.critical.filter(c=>c.direction==='forward'&&c.reason==='too-close');assert.ok(failures.length>0);assert.ok(failures.every(c=>c.distanceM[1]<2.8));assert.ok(failures.every(c=>c.witnessSeedParameter));
});

test('known ordinal gap remains missing-axis even before a real hole',()=>{
 const d=make(()=>0,[[[0,9],[40,9],[40,10],[0,10],[0,9]]]),r=spacing(d,[axis('0',5),axis('2',11)]);
 assert.equal(r.valid,false);assert.ok(r.critical.some(c=>c.reason==='missing-axis'&&c.detail==='known-ordinal-gap'));
});
test('provisional contour ordinals cannot silently establish family order',()=>{
 const d=make((x,y)=>y/5),a=contours.traceContourLevel(d,1,{}).axes[0],b=contours.traceContourLevel(d,1.6,{}).axes[0],r=spacing(d,[a,b]);
 assert.equal(r.valid,false);assert.ok(r.unresolved.some(c=>c.detail==='ambiguous-ordinal-order'));
});
test('physical components of the same asserted row may share an ordinal',()=>{
 const d=exactFlat(),a=(id,ordinal,y,x0,x1)=>({axisId:id,ordinal,levelM:0,components:[{coordinatesXY:[[x0,y],[x1,y]]}]}),r=spacing(d,[a('a',0,0,1,5),a('b',0,0,5,9),a('c',1,3,1,9)]);
 assert.equal(r.valid,true,JSON.stringify(r));
});

test('flat manual corner normals remain unresolved instead of using a selected tangent',()=>{
 const d=exactFlat(),a={axisId:'0',ordinal:0,levelM:0,components:[{coordinatesXY:[[1,0],[9,0]]}]},b={axisId:'1',ordinal:1,levelM:0,components:[{coordinatesXY:[[1,3],[5,3.1],[9,3]]}]},r=spacing(d,[a,b]);
 assert.equal(r.valid,false);assert.ok(r.unresolved.some(c=>c.detail==='flat-row-corner-or-offset-component'));
});

test('a complete 34-row plane spacing proof fits the live shared operation budget',async()=>{
 const {createTerrainModel}=await import('../src/terrain-model.js'),{fromUTM}=await import('../src/coordinate-system.js'),{createTerrainBudget}=await import('../src/terrain-budget.js');
 const model=createTerrainModel({acquiredAt:'2026-10-05T00:00:00.000Z',grid:{width:25,height:25,origin:[499990,5000110],step:[5,-5],values:Array.from({length:625},(_,i)=>(110-Math.floor(i/25)*5)/5)}});
 const ring=[[500000,5000000],[500100,5000000],[500100,5000100],[500000,5000100],[500000,5000000]].map(p=>fromUTM(p));
 const budget=createTerrainBudget({kind:'adapt'}),domain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[ring]},budget});
 const axes=Array.from({length:34},(_,i)=>({axisId:`a${i}`,portionId:'p',ordinal:i,levelM:(1+i*3/Math.sqrt(1.04))/5,components:[{coordinatesXY:[[500001,5000001+i*3/Math.sqrt(1.04)],[500099,5000001+i*3/Math.sqrt(1.04)]]}]}));
 const r=spacing(domain,axes,{budget});
 assert.equal(r.valid,true,JSON.stringify({critical:r.critical,unresolved:r.unresolved}));
 assert.equal(r.coverage.complete,true);
 assert.ok(r.spans.some(s=>s.direction==='forward')&&r.spans.some(s=>s.direction==='reverse'));
 assert.ok(r.coverage.seedCount<200);
});
