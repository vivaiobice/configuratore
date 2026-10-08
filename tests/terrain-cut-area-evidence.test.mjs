import test from 'node:test';
import assert from 'node:assert/strict';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {createContourDomain} from '../src/terrain-contour-domain.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {measureSurfaceFootprint,compareMeasuredSurfaceAreas} from '../src/terrain-surface-bands.js';
import * as bands from '../src/terrain-surface-bands.js';
import {buildContourFamily} from '../src/terrain-contour-family.js';
import {compareMeasuredSurfaceAreas as compareSelectedSurfaceAreas} from '../src/terrain-surface-bands.js?v=1.3.2';

const geometry=(x0,y0,x1,y1)=>({type:'MultiPolygon',coordinates:[[[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]]]});
function measurements(){
  const {model,project}=contourFixture({geometryXY:[[0,0],[4,0],[4,4],[0,4],[0,0]]});
  const budget=createTerrainBudget({kind:'cut'});
  const domain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[project.geometry]},budget});
  const measure=g=>measureSurfaceFootprint({domain,geometryXY:g,budget});
  return {budget,left:measure(geometry(500000,5000000,500002,5000004)),right:measure(geometry(500002,5000000,500004,5000004)),whole:measure(geometry(500000,5000000,500004,5000004))};
}

// Catches replacing actual signed rational/root evidence with summed midpoints.
test('measured area sum retains exact equality evidence through overlapping bounds',()=>{
  assert.equal(typeof bands.sumMeasuredSurfaceAreas,'function');
  const {budget,left,right,whole}=measurements();
  const sum=bands.sumMeasuredSurfaceAreas([left,right],{budget});
  assert.equal(compareMeasuredSurfaceAreas(sum,whole,{budget}),0);
  assert.equal(sum.areaOperation,'sum-of-measured-areas');
  assert.doesNotThrow(()=>JSON.stringify(sum));
});

test('area sum rejects cloned changed or exhausted evidence instead of trusting scalars',()=>{
  assert.equal(typeof bands.sumMeasuredSurfaceAreas,'function');
  const {budget,left,right}=measurements();
  assert.throws(()=>bands.sumMeasuredSurfaceAreas([structuredClone(left),right],{budget}),{status:'area-order-unresolved'});
  left.areaM2=0;
  assert.throws(()=>bands.sumMeasuredSurfaceAreas([left,right],{budget}),{status:'area-order-unresolved'});
  const fresh=measurements();
  const expired=createTerrainBudget({kind:'cut',deadlineMs:0});
  assert.throws(()=>bands.sumMeasuredSurfaceAreas([fresh.left,fresh.right],{budget:expired}),{status:'budget-exceeded'});
});

// Catches missing or per-candidate callback invocation and saved proof leakage.
test('selected-family area callback fires once only after selection without changing public output',()=>{
  const {model,project}=contourFixture({height:(_x,y)=>y/4,geometryXY:[[0,0],[4,0],[4,4],[0,4],[0,0]]});
  const budget=createTerrainBudget({kind:'cut'});
  const domain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[project.geometry]},budget});
  const options={domain,portion:{id:'p'},spacingM:3,budget};
  const ordinary=buildContourFamily(options),selected=[];
  const callback=buildContourFamily({...options,onSelectedAreaMeasurement:measurement=>selected.push(measurement)});
  assert.equal(ordinary.ok,true);
  assert.equal(callback.ok,true);
  assert.equal(selected.length,1);
  assert.equal(compareSelectedSurfaceAreas(selected[0],selected[0],{budget}),0);
  assert.deepEqual(callback,ordinary);
  assert.equal(Object.hasOwn(callback,'areaMeasurement'),false);
});
