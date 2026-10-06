import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createContourDomain} from '../src/terrain-contour-domain.js';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
const api=existsSync(new URL('../src/terrain-contours.js',import.meta.url))?await import('../src/terrain-contours.js'):{};
const domain=(height,geometryXY)=>{const f=contourFixture({height,geometryXY});return createContourDomain({model:f.model,geometry:{type:'Polygon',coordinates:[f.project.geometry]}});};
const trace=(d,h)=>{assert.equal(typeof api.traceContourLevel,'function');return api.traceContourLevel(d,h,{portionId:'p'});};
test('20 percent plane produces straight level rows',()=>{
 const d=domain((x,y)=>y/5),r=trace(d,3);
 assert.equal(r.axes.length,1);assert.equal(r.axes[0].components.length,1);
 const ps=r.axes[0].components[0].coordinatesXY;
 assert.ok(ps.length>3);assert.ok(ps.every(p=>p[1]===5000015));assert.equal(r.diagnostics.length,0);
});
test('vertex and edge contour has no fake fragments',()=>{
 const r=trace(domain((x,y)=>y/5),2);
 assert.equal(r.axes.length,1);assert.equal(r.axes[0].components.length,1);
 const ps=r.axes[0].components[0].coordinatesXY;
 assert.equal(new Set(ps.map(p=>p.join(','))).size,ps.length);
 assert.ok(ps.length>3);
});
test('flat level and ridge edge are diagnosed without fake row',()=>{
 assert.ok(trace(domain(()=>0),0).diagnostics.some(d=>d.reason==='plateau'));
 const ridge=trace(domain((x,y)=>Math.abs(y-20)),0);
 assert.ok(ridge.diagnostics.some(d=>d.reason==='ridge-valley'));assert.equal(ridge.axes.length,0);
});
test('holes create physical components while native edges do not',()=>{
 const f=contourFixture({height:(x,y)=>y/5,exclusionsXY:[[[10,10],[20,10],[20,20],[10,20],[10,10]]]});
 const d=createContourDomain({model:f.model,geometry:{type:'Polygon',coordinates:[f.project.geometry,...f.project.exclusions]}});
 const r=trace(d,3);assert.equal(r.axes.length,1);assert.equal(r.axes[0].components.length,2);
});
