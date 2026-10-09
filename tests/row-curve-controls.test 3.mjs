import test from 'node:test';
import assert from 'node:assert/strict';
import {curveControlRange,nextCurveControlPoint} from '../src/row-curve-control-state.js';

const segments=[
 {id:'before-pass',index:0,label:'Tratto 1',startPosition:0,endPosition:.49},
 {id:'after-pass',index:1,label:'Tratto 2',startPosition:.51,endPosition:1}
];

test('a curve slider is bounded to its own section and reports local progress',()=>{
 const range=curveControlRange({segmentId:'before-pass',position:.245},segments);
 assert.equal(range.segment.id,'before-pass');
 assert.ok(range.min>0&&range.max<.49);
 assert.equal(range.percent,50);
 const other=curveControlRange({segmentId:'after-pass',position:.755},segments);
 assert.ok(other.min>.51&&other.max<1);
 assert.equal(other.percent,50);
});

test('adding a second curve point chooses the unconfigured section across a passage',()=>{
 const point=nextCurveControlPoint([{id:'a',position:.245,offsetM:8,segmentId:'before-pass'}],segments,'b');
 assert.equal(point.id,'b');assert.equal(point.segmentId,'after-pass');
 assert.equal(point.position,.755);assert.equal(point.offsetM,0);
});

test('new curve points remain outside passage gaps after each section has a point',()=>{
 const points=[{id:'a',position:.245,offsetM:0,segmentId:'before-pass'},{id:'b',position:.755,offsetM:0,segmentId:'after-pass'}];
 const point=nextCurveControlPoint(points,segments,'c');
 assert.ok(point.position<.49||point.position>.51);
 assert.ok(Math.abs(point.position-.245)>.01&&Math.abs(point.position-.755)>.01);
});

test('a field without a transverse passage keeps the original whole-field controls',()=>{
 const whole=[{id:'whole',index:0,label:'Tratto 1',startPosition:0,endPosition:1}];
 const point=nextCurveControlPoint([],whole,'first');
 assert.deepEqual(point,{id:'first',position:.5,offsetM:0});
 const range=curveControlRange(point,whole);assert.equal(range.min,.02);assert.equal(range.max,.98);assert.equal(range.percent,50);
});

test('a short edge section keeps its slider and new control inside that section',()=>{
 const short=[{id:'edge',index:0,label:'Tratto 1',startPosition:0,endPosition:.01125},
  {id:'remainder',index:1,label:'Tratto 2',startPosition:.01875,endPosition:1}];
 const range=curveControlRange({segmentId:'edge',position:.005625},short);
 assert.ok(range.min<range.max);assert.ok(range.max<short[0].endPosition);assert.equal(range.percent,50);
 const point=nextCurveControlPoint([{id:'b',position:.5,offsetM:0,segmentId:'remainder'}],short,'edge-point');
 assert.equal(point.segmentId,'edge');assert.equal(point.position,.005625);
});
