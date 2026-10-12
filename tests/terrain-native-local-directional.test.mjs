import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainModel} from '../src/terrain-model.js';
import {fromUTM} from '../src/coordinate-system.js';
import {createTerrainBudget} from '../src/terrain-budget.js';
import {createContourDomain} from '../src/terrain-contour-domain.js';
import {traceFinitePolylineContourLevel} from '../src/terrain-polyline-source.js?v=1.3.10';
import * as certificates from '../src/terrain-directional-certificate.js?v=1.3.10';
import {measureContourAxes} from '../src/terrain-contour-family.js';
import {measureNativeDirectionalService} from '../src/terrain-surface-bands.js?v=1.3.10';

function paddedHill({step=.9,headlandM=0,reverseBoth=false,extract=true}={}){
 const n=25,budget=createTerrainBudget({kind:'adapt'});
 const model=createTerrainModel({acquiredAt:'2026-10-12T00:00:00.000Z',grid:{width:n,height:n,origin:[500000,5000000],step:[5,-5],values:Array.from({length:n*n},(_,i)=>{
  const x=(i%n)*5,y=-Math.floor(i/n)*5;
  return Math.fround(120+.05*x+.31*y+.00001*x*y+2*Math.max(0,30-x)+2*Math.max(0,x-80)+(reverseBoth?2*Math.max(0,-90-y)+2*Math.max(0,y+15):0));
 })}});
 const ring=[[40,-70],[70,-70],[70,-30],[40,-30],[40,-70]].map(([x,y])=>fromUTM([500000.37+x+.007*y,5000000.63+y],32632));
 const domain=createContourDomain({model,geometry:{type:'Polygon',coordinates:[ring]},budget});
 if(!extract)return {domain,budget};
 const axes=Array.from({length:4},(_,ordinal)=>{
  const traced=traceFinitePolylineContourLevel(domain,105+ordinal*step,{portionId:'only',ordinal,budget});
  assert.deepEqual(traced.diagnostics,[]);assert.equal(traced.axes.length,1);return traced.axes[0];
 });
 const measured=measureContourAxes({domain,physicalDomain:domain,axes,headlandWidthM:headlandM,budget});
 return {domain,axes,retained:headlandM?certificates.directionalRetainedAxes(axes,measured.rows,budget):axes,budget};
}

test('local continuous native proof ignores unrelated acquired padding and binds exact service authority',()=>{
 const {domain,axes,budget}=paddedHill();
 assert.equal(certificates.certifyNativeDirectionalFamily(domain,axes,{spacingM:3,budget}),null);
 assert.equal(typeof certificates.certifyNativeLocalDirectionalFamily,'function','bounded local native certificate is exported');
 const certificate=certificates.certifyNativeLocalDirectionalFamily(domain,axes,{spacingM:3,budget});
 assert.equal(certificate?.valid,true,JSON.stringify(certificate));
 assert.equal(certificate.method,certificates.DIRECTIONAL_SPACING_METHOD);
 assert.ok(certificate.lowerM>=2.8);assert.ok(certificate.upperM<=3.2);
 assert.equal(certificate.coverage.complete,true);
 assert.equal(certificate.approach.proof,'all-row-native-xyz-segment-lower');
 const service=measureNativeDirectionalService({certificate,axes,widthM:3,budget});
 assert.ok(service.areaBoundsM2[0]>200);
 assert.throws(()=>measureNativeDirectionalService({certificate:structuredClone(certificate),axes,widthM:3,budget}),/Missing actual directional certificate/);
 assert.ok(budget.usage().nodeCount<200000);
});

test('native directional support dispatch reads all acquired padding and grants no proof authority',()=>{
 const {domain,budget}=paddedHill({reverseBoth:true,extract:false});
 assert.equal(typeof certificates.hasNativeDirectionalSupport,'function');
 assert.equal(certificates.hasNativeDirectionalSupport(domain,budget),false);
});

test('local proof rejects actual retained same-native-face approach below the minimum',()=>{
 const {domain,retained,budget}=paddedHill({step:.55,headlandM:4});
 assert.equal(typeof certificates.certifyNativeLocalDirectionalFamily,'function');
 const certificate=certificates.certifyNativeLocalDirectionalFamily(domain,retained,{spacingM:3,budget});
 assert.equal(certificate?.valid,false);
 assert.ok(certificate.critical.some(item=>item.reason==='too-close'&&item.distanceM[1]<2.8));
});

test('local proof resolves actual headland operations and rejects malformed finite source claims',()=>{
 const {domain,axes,retained,budget}=paddedHill({headlandM:4});
 assert.equal(typeof certificates.certifyNativeLocalDirectionalFamily,'function');
 assert.ok(retained.every(axis=>axis.axisOperation));
 const certificate=certificates.certifyNativeLocalDirectionalFamily(domain,retained,{spacingM:3,budget});
 assert.equal(certificate?.valid,true,JSON.stringify(certificate));
 const retainedService=measureNativeDirectionalService({certificate,axes:retained,widthM:3,budget});
 const full=certificates.certifyNativeLocalDirectionalFamily(domain,axes,{spacingM:3,budget});
 const fullService=measureNativeDirectionalService({certificate:full,axes,widthM:3,budget});
 assert.ok(retainedService.areaBoundsM2[1]<fullService.areaBoundsM2[0]);
 const malformed=structuredClone(retained);malformed[0].components[0].coordinatesXY[1][0]+=.01;
 assert.equal(certificates.certifyNativeLocalDirectionalFamily(domain,malformed,{spacingM:3,budget}),null);
});
