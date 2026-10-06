import test from 'node:test';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {calculateProject} from '../src/project-calculator.js';
import {getRowCurveSegments,resolveRowCurvePoints,generateCurvedRows} from '../src/row-curves.js';
import {ensureProjectFields} from '../src/fields.js';
import {normalizeIntersectionRings,corridorPolygonFromLine,pointInPolygon} from '../src/geometry.js';

const metresPerDegree=6371008.8*Math.PI/180;
const lonM=1/(metresPerDegree*Math.cos(44*Math.PI/180)),latM=1/metresPerDegree;
const coordinate=([x,y])=>[8+x*lonM,44+y*latM];
const ring=points=>[...points,points[0]].map(coordinate);
const rectangle=(x1,y1,x2,y2)=>ring([[x1,y1],[x2,y1],[x2,y2],[x1,y2]]);

// The map saves the intersection ring, rather than the original corridor rectangle.
// Its parcel-side cap is 2.02m long and its longest passage-side edge is only 1.95m.
const clippedParcel=ring([[0,0],[100,0],[10,100],[30,200],[-10,200],[9.8,100]]);
const clippedPassageRing=ring([[9.7755,99.75],[10.225,99.75],[11.575,98.25],[9.6285,98.25]]);
const savedField=()=>ensureProjectFields(JSON.parse(JSON.stringify({fields:[{
  id:'field-clipped',geometry:clippedParcel,orientationDeg:0,rowSpacingM:5,plantSpacingM:1,
  postSpacingM:4.5,exclusions:[{id:'ex-saved',label:'Passaggio lineare 1,50 m',type:'linear',widthM:1.5,
    geometry:normalizeIntersectionRings([[clippedPassageRing]])[0]}],
  rowCurvePoints:[{id:'lower',position:.2,offsetM:3},{id:'upper',position:.8,offsetM:-3}]
}]}))).fields[0];

test('a saved map-clipped passage uses its corridor sides instead of a longer parcel cap',()=>{
  const field=savedField(),context={polygon:field.geometry,exclusions:field.exclusions};
  const segments=getRowCurveSegments(context);
  assert.equal(segments.length,2);
  assert.ok(Math.abs(segments[0].endPosition-.49125)<1e-7);
  assert.ok(Math.abs(segments[1].startPosition-.49875)<1e-7);
  const points=resolveRowCurvePoints({...context,rowCurvePoints:field.rowCurvePoints});
  assert.deepEqual(points.map(point=>point.segmentId),segments.map(segment=>segment.id));
});

test('changing one drawing beside a saved clipped passage preserves every row in the other drawing',()=>{
  const field=savedField(),args={polygon:field.geometry,exclusions:field.exclusions,rowSpacingM:field.rowSpacingM,rowCurvePoints:field.rowCurvePoints};
  const before=generateCurvedRows(args);
  const after=generateCurvedRows({...args,rowCurvePoints:args.rowCurvePoints.map(point=>point.id==='lower'?{...point,offsetM:12}:point)});
  const upper=rows=>rows.filter(row=>row.coordinates.every(point=>point[1]>=44+99.749*latM));
  assert.ok(upper(before).length>=5);
  assert.deepEqual(upper(after),upper(before));
});

for(const width of [1.46,1.48,1.5])test(`a ${width}m parcel neck resolves an almost square clipped corridor by full-width coverage`,()=>{
  const polygon=ring([[0,-50],[40,-50],[20+width/2,-1],[20+width/2,1],[40,50],[0,50],[20-width/2,1],[20-width/2,-1]]);
  const corners=[[20-width/2,-.75],[20+width/2,-.75],[20+width/2,.75],[20-width/2,.75]];
  for(const ordered of [corners,corners.slice().reverse(),[...corners.slice(2),...corners.slice(0,2)]]){
    const exclusions=[{id:'square-neck',type:'linear',widthM:1.5,geometry:ring(ordered)}];
    const context={polygon,exclusions},segments=getRowCurveSegments(context);
    assert.equal(segments.length,2,'the corridor crosses the neck even when its parcel caps are longer');
    assert.ok(Math.abs(segments[0].endPosition-.4925)<1e-7);
    assert.ok(Math.abs(segments[1].startPosition-.5075)<1e-7);
    const args={...context,rowSpacingM:5,rowCurvePoints:[{id:'lower',position:.2,offsetM:3},{id:'upper',position:.8,offsetM:-3}]};
    const before=generateCurvedRows(args),after=generateCurvedRows({...args,rowCurvePoints:[{id:'lower',position:.2,offsetM:12},{id:'upper',position:.8,offsetM:-3}]});
    const upper=rows=>rows.filter(row=>row.segmentId===segments[1].id);
    assert.ok(upper(before).length>=5);
    assert.ok(isDeepStrictEqual(upper(after),upper(before)),'opposite drawing stays byte-identical for every ring order');
    assert.equal(getRowCurveSegments({...context,orientationDeg:90}).length,1,'the same corridor is longitudinal for east-west rows');
  }
});

test('an excluded zone between curve samples creates two physical pieces and four head posts per row',()=>{
  const args={polygon:rectangle(0,0,20,100),rowSpacingM:2.5,plantSpacingM:1,postSpacingM:4.5,
    headlandWidthM:6,rowCurvePoints:[{id:'neutral',position:.5,offsetM:0}]};
  const full=calculateProject(args);
  const cut=calculateProject({...args,exclusions:[{id:'thin-area',type:'area',geometry:rectangle(0,49.21,20,49.39)}]});
  assert.equal(full.rowCount,7);
  assert.equal(full.headPosts,14);
  assert.equal(cut.rowCount,14);
  assert.equal(cut.headPosts,28);
  assert.ok(Math.abs(full.rowLinearM-cut.rowLinearM-1.26)<.001);
  assert.ok(Math.abs(full.headlandAreaM2-cut.headlandAreaM2)<.001);
  assert.ok(cut.rows.every(row=>row.end[1]<=44+49.211*latM||row.start[1]>=44+49.389*latM));
});

test('a real 1.50m oblique passage interrupts sharp curved rows between sample endpoints',()=>{
  const passage={id:'drawn-passage',type:'linear',widthM:1.5,
    geometry:corridorPolygonFromLine(coordinate([10,20]),coordinate([80,70]),1.5)};
  const args={polygon:rectangle(0,0,90,90),exclusions:[passage],rowSpacingM:2.5,plantSpacingM:1,postSpacingM:4.5,
    rowCurvePoints:[{id:'a',position:.28,offsetM:32},{id:'b',position:.52,offsetM:-32},{id:'c',position:.74,offsetM:30}]};
  const result=calculateProject(args);
  for(const row of result.rows)for(let index=1;index<row.coordinates.length;index++){
    const a=row.coordinates[index-1],b=row.coordinates[index];
    for(let sample=1;sample<20;sample++){
      const t=sample/20,point=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
      assert.equal(pointInPolygon(point,passage.geometry),false,'the row must end and resume at the actual passage edges');
    }
  }
  assert.equal(result.headPosts,result.rows.length*2);
});

test('straight rows retain exact piece counts through passages and local exclusions with headlands',()=>{
  const args={polygon:rectangle(0,0,20,100),rowSpacingM:2.5,plantSpacingM:1,postSpacingM:4.5,headlandWidthM:6};
  const full=calculateProject(args);
  const cut=calculateProject({...args,exclusions:[
    {id:'passage',type:'linear',widthM:1.5,geometry:rectangle(0,49.25,20,50.75)},
    {id:'area',type:'area',geometry:rectangle(5,70,15,80)}
  ]});
  assert.equal(full.rowCount,8);
  assert.equal(full.headPosts,16);
  assert.equal(cut.rowCount,20);
  assert.equal(cut.headPosts,40);
  assert.ok(Math.abs(cut.rowLinearM-652)<.02);
  assert.ok(Math.abs(cut.headlandAreaM2-full.headlandAreaM2)<.02);
});
