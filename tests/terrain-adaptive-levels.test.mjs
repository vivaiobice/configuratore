import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainModel} from '../src/terrain-model.js';
import {fromUTM} from '../src/coordinate-system.js';
import {createContourDomain} from '../src/terrain-contour-domain.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import * as adaptive from '../src/terrain-adaptive-levels.js';

function varyingHill() {
 const n=21,model=createTerrainModel({grid:{width:n,height:n,origin:[500000,5000000],step:[5,-5],values:Array.from({length:n*n},(_,i)=>{
  const x=(i%n)*5,y=-Math.floor(i/n)*5;
  return Math.fround(150+.03*x+(y< -50?.12*(y+50)-20:.4*y)+.000002*x*y);
 })}});
 const ring=[[12,-84],[32,-84],[32,-16],[12,-16],[12,-84]].map(([x,y])=>fromUTM([500000.37+x+.007*y,5000000.63+y],32632));
 return {model,geometry:{type:'Polygon',coordinates:[ring]}};
}

test('candidate elevations respond to native slope changes rather than keeping a uniform height increment',()=>{
 assert.equal(typeof adaptive.buildNativeAdaptiveLevelSchedule,'function');
 const budget=createTerrainBudget({kind:'adapt'}),fixture=varyingHill();
 const domain=createContourDomain({...fixture,budget});
 const schedule=adaptive.buildNativeAdaptiveLevelSchedule({domain,spacingM:3,budget});
 assert.equal(schedule.complete,true);
 assert.equal(schedule.certified,false,'a numerical guide never grants spacing authority');
 assert.ok(schedule.levels.length>=15);
 assert.ok(schedule.levels.every((h,i)=>Number.isFinite(h)&&h>schedule.lowerM&&h<schedule.upperM&&(!i||h>schedule.levels[i-1])));
 const gaps=schedule.levels.slice(1).map((h,i)=>h-schedule.levels[i]);
 assert.ok(Math.max(...gaps)>2*Math.min(...gaps));
 assert.equal(schedule.frontier,'native-elevation-range-exhausted');
});

test('adaptive elevation search preserves the caller budget and refuses unsupported progress',()=>{
 assert.equal(typeof adaptive.buildNativeAdaptiveLevelSchedule,'function');
 const budget=createTerrainBudget({kind:'adapt'}),fixture=varyingHill(),domain=createContourDomain({...fixture,budget});
 assert.throws(()=>adaptive.buildNativeAdaptiveLevelSchedule({domain,spacingM:0,budget}),/spacing/i);
 const spent=createTerrainBudget({kind:'adapt',deadlineMs:0});
 assert.throws(()=>adaptive.buildNativeAdaptiveLevelSchedule({domain,spacingM:3,budget:spent}),error=>error.status==='budget-exceeded');
});
