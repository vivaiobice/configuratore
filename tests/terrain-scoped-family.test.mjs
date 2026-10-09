import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainModel} from '../src/terrain-model.js';
import {contourFixture} from './helpers/terrain-contour-fixtures.mjs';
import {createContourDomain} from '../src/terrain-contour-domain.js?v=1.3.6';
import {buildContourFamily} from '../src/terrain-contour-family.js?v=1.3.6';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {compareMeasuredSurfaceAreas} from '../src/terrain-surface-bands.js?v=1.3.6';

test('scoped cut candidate seam certifies a real complete single level when heterogeneous progressions fail',()=>{
 const {project,model}=contourFixture({height:(x,y)=>(x<0?.05:.4)*x+.2*y,
  geometryXY:[[-10,2.5],[0,0],[10,-20],[10,0],[0,20],[-10,22.5],[-10,2.5]]});
 const smallModel=createTerrainModel({acquiredAt:model.acquiredAt,grid:{width:3,height:3,origin:[499960,5000040],step:[40,-40],values:Array.from({length:9},(_,i)=>{const x=-40+(i%3)*40,y=40-Math.floor(i/3)*40;return (x<0?.05:.4)*x+.2*y;})}});
 const budget=createTerrainBudget({kind:'cut',deadlineMs:10000}),domain=createContourDomain({model:smallModel,geometry:{type:'Polygon',coordinates:[project.geometry]},budget});
 let count=0,measurement;
 const family=buildContourFamily({domain,portion:{id:'source'},reference:{headlandWidthM:0,originalDomain:domain},spacingM:3,
  candidateGeneration:{kind:'scoped-cut-1',singleLevelM:2},onSelectedAreaMeasurement(value){count++;measurement=value;},budget});
 assert.equal(family.ok,true,JSON.stringify(family.diagnostics));
 assert.equal(count,1);
 assert.equal(family.diagnostics.selectedCandidateId,'scoped-cut:single-level');
 assert.equal(family.axes.length,1);
 assert.equal(family.axes[0].levelM,2);
 assert.equal(family.validation.valid,true);
 assert.equal(compareMeasuredSurfaceAreas(measurement,measurement,{budget}),0);
 assert.equal(family.diagnostics.globalOptimality,false);
});

test('scoped candidate options reject unknown fields rather than confer validity or alter the absent route',()=>{
 const {project,model}=contourFixture({height:(_x,y)=>y/4,geometryXY:[[0,0],[4,0],[4,4],[0,4],[0,0]]});
 const budget=createTerrainBudget({kind:'cut'}),domain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[project.geometry]},budget});
 const family=buildContourFamily({domain,portion:{id:'source'},spacingM:3,candidateGeneration:{kind:'scoped-cut-1',trusted:true},budget});
 assert.equal(family.ok,false);
 assert.match(family.diagnostics.message,/candidate generation/i);
});
