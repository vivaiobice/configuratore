import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProject } from '../src/project-calculator.js';
import {
  normalizeRowCurvePoints,
  getRowCurveSegments,
  resolveRowCurvePoints,
  generateCurvedRows,
  curvePointToLonLat,
  lonLatToCurvePoint
} from '../src/row-curves.js';
import { corridorPolygonFromLine, pointInPolygon } from '../src/geometry.js';

const lonM = 1 / (111320 * Math.cos(44 * Math.PI / 180));
const latM = 1 / 110540;
const rectangle = [[8,44],[8+40*lonM,44],[8+40*lonM,44+60*latM],[8,44+60*latM],[8,44]];
const transversePassage={id:'crossing',type:'linear',widthM:1.5,geometry:[[8,44+29.25*latM],[8+40*lonM,44+29.25*latM],[8+40*lonM,44+30.75*latM],[8,44+30.75*latM],[8,44+29.25*latM]]};

test('segment identity survives normalization and points in different segments never merge',()=>{
  const points=normalizeRowCurvePoints([{id:'a',position:.5,offsetM:4,segmentId:'lower'},{id:'b',position:.5,offsetM:-4,segmentId:'upper'}]);
  assert.equal(points.length,2);
  assert.equal(points[0].segmentId,'lower');
  assert.equal(points[1].segmentId,'upper');
});

test('changing a bend before a full-width passage leaves every row after it unchanged',()=>{
  const args={polygon:rectangle,rowSpacingM:5,rowCurvePoints:[{id:'lower',position:.25,offsetM:4},{id:'upper',position:.75,offsetM:-4}],exclusions:[transversePassage],sampleStepM:1};
  const before=generateCurvedRows(args);
  const after=generateCurvedRows({...args,rowCurvePoints:[{id:'lower',position:.25,offsetM:12},{id:'upper',position:.75,offsetM:-4}]});
  const upper=rows=>rows.filter(row=>row.coordinates.every(point=>point[1]>=44+30.7*latM));
  assert.ok(upper(before).length>3);
  assert.deepEqual(upper(after),upper(before));
});

test('a bend belongs only to its passage segment and the other segment stays straight',()=>{
  const rows=generateCurvedRows({polygon:rectangle,rowSpacingM:5,rowCurvePoints:[{id:'lower',position:.25,offsetM:8}],exclusions:[transversePassage],sampleStepM:1});
  const upper=rows.filter(row=>row.coordinates.every(point=>point[1]>=44+30.7*latM));
  assert.ok(upper.length>3);
  assert.ok(upper.every(row=>row.coordinates.every(point=>Math.abs(point[0]-row.start[0])<1e-10)));
});

test('calculator accepts archived exclusion objects and accounts for passage area and posts',()=>{
  const result=calculateProject({polygon:rectangle,rowSpacingM:5,plantSpacingM:1,postSpacingM:4.5,exclusions:[transversePassage],rowCurvePoints:[{id:'lower',position:.25,offsetM:4},{id:'upper',position:.75,offsetM:-4}]});
  assert.ok(result.excludedAreaM2>59&&result.excludedAreaM2<61);
  assert.ok(result.rows.every(row=>row.coordinates.every(point=>point[1]<=44+29.251*latM||point[1]>=44+30.749*latM)));
  assert.equal(result.headPosts,result.rowCount*2);
});

test('oblique full-width passages separate curve edits and preserve the actual corridor edges',()=>{
  const passage={id:'diagonal',type:'linear',widthM:1.5,geometry:corridorPolygonFromLine([8-2*lonM,44+20*latM],[8+42*lonM,44+40*latM],1.5)};
  const exclusions=[passage],segments=getRowCurveSegments({polygon:rectangle,exclusions});
  assert.equal(segments.length,2);
  const points=resolveRowCurvePoints({polygon:rectangle,exclusions,rowCurvePoints:[{id:'a',position:.2,offsetM:3},{id:'b',position:.8,offsetM:-3}]});
  assert.equal(points[0].segmentId,segments[0].id);
  assert.equal(points[1].segmentId,segments[1].id);
  const args={polygon:rectangle,rowSpacingM:5,exclusions,rowCurvePoints:points};
  const before=generateCurvedRows(args),after=generateCurvedRows({...args,rowCurvePoints:points.map(point=>point.id==='a'?{...point,offsetM:15}:point)});
  assert.deepEqual(after.filter(row=>row.segmentId===segments[1].id),before.filter(row=>row.segmentId===segments[1].id));
  assert.ok(before.every(row=>row.coordinates.every(point=>!pointInPolygon(point,passage.geometry)||point===row.start||point===row.end)));
  assert.ok(before.some(row=>row.segmentId===segments[0].id&&row.coordinates.some(point=>point[1]>44+29*latM)),'the lower tract reaches the sloping passage instead of a bounding-box cutoff');
});

test('oblique controls resolve within the same reference interval used by sliders and curve generation',()=>{
  const passage={id:'diagonal',type:'linear',widthM:1.5,geometry:corridorPolygonFromLine([8-2*lonM,44+20*latM],[8+42*lonM,44+40*latM],1.5)};
  const context={polygon:rectangle,exclusions:[passage]},segment=getRowCurveSegments(context)[0];
  const max=segment.endPosition-(segment.endPosition-segment.startPosition)*.02;
  for(const position of [.52,.58]){
    const [point]=resolveRowCurvePoints({...context,rowCurvePoints:[{id:'a',position,offsetM:15,segmentId:segment.id}]});
    assert.equal(point.segmentId,segment.id);
    assert.ok(point.position<=max&&point.position>=.02,'resolved handle must fit its slider and interpolation interval');
    assert.equal(point.offsetM,15);
  }
  const first=resolveRowCurvePoints({...context,rowCurvePoints:[{id:'a',position:.3,offsetM:15,segmentId:segment.id}]}),second=resolveRowCurvePoints({...context,rowCurvePoints:[{id:'a',position:.4,offsetM:15,segmentId:segment.id}]});
  for(const maintainEquidistance of [false,true]){
    const args={...context,rowSpacingM:5,maintainEquidistance,sampleStepM:.25};
    assert.notDeepEqual(generateCurvedRows({...args,rowCurvePoints:first}),generateCurvedRows({...args,rowCurvePoints:second}),'valid changes in handle position must change the rows');
  }
});

test('infeasible extreme lateral offsets stay in the assigned oblique tract and resolve idempotently',()=>{
  const passage={id:'diagonal',type:'linear',widthM:1.5,geometry:corridorPolygonFromLine([8-2*lonM,44+20*latM],[8+42*lonM,44+40*latM],1.5)};
  const context={polygon:rectangle,exclusions:[passage]},segment=getRowCurveSegments(context)[0];
  const [point]=resolveRowCurvePoints({...context,rowCurvePoints:[{id:'a',position:.58,offsetM:-100,segmentId:segment.id}]});
  assert.equal(point.segmentId,segment.id);
  assert.ok(point.offsetM>-100&&point.offsetM<0,'reduce an offset whose section never meets the reference tract');
  assert.ok(point.position>segment.startPosition&&point.position<segment.endPosition);
  const coordinate=curvePointToLonLat({polygon:rectangle,point});
  const x=(coordinate[0]-8)/lonM,y=(coordinate[1]-44)/latM;
  assert.ok(y<20+(x+2)*20/44,'handle must remain physically on its assigned side');
  assert.deepEqual(resolveRowCurvePoints({...context,rowCurvePoints:[point]}),[point]);
});

test('a tagged control in a short edge tract keeps a valid position through normalization and map round trips',()=>{
  const passage={id:'edge',type:'linear',widthM:1.5,geometry:corridorPolygonFromLine([8-2*lonM,44+latM],[8+42*lonM,44+latM],1.5)};
  const context={polygon:rectangle,exclusions:[passage]},segment=getRowCurveSegments(context)[0];
  const original={id:'a',position:.002,offsetM:0,segmentId:segment.id};
  const [point]=resolveRowCurvePoints({...context,rowCurvePoints:[original]});
  assert.equal(point.position,.002);
  assert.deepEqual(normalizeRowCurvePoints([point]),[point]);
  assert.ok(point.position>segment.startPosition&&point.position<segment.endPosition);
  const coordinate=curvePointToLonLat({polygon:rectangle,point});
  const restored=lonLatToCurvePoint({polygon:rectangle,coordinate,id:point.id,segmentId:point.segmentId});
  assert.equal(restored.segmentId,point.segmentId);
  assert.ok(Math.abs(restored.position-point.position)<1e-7);
  assert.equal(normalizeRowCurvePoints([{id:'legacy',position:.002,offsetM:0}])[0].position,.02);
  assert.equal(normalizeRowCurvePoints([{id:'whole',position:.002,offsetM:0,segmentId:'whole'}])[0].position,.02);
});

test('multiple passages create stable independent middle and outer tracts',()=>{
  const second={...transversePassage,id:'second',geometry:transversePassage.geometry.map(([lon,lat])=>[lon,lat+15*latM])};
  const exclusions=[transversePassage,second],segments=getRowCurveSegments({polygon:rectangle,exclusions});
  assert.equal(segments.length,3);
  assert.deepEqual(getRowCurveSegments({polygon:rectangle,exclusions:[second,transversePassage]}),segments);
  const points=resolveRowCurvePoints({polygon:rectangle,exclusions,rowCurvePoints:[{id:'a',position:.2,offsetM:3},{id:'b',position:.6,offsetM:-3},{id:'c',position:.9,offsetM:3}]});
  assert.deepEqual(points.map(point=>point.segmentId),segments.map(segment=>segment.id));
  const args={polygon:rectangle,rowSpacingM:5,exclusions,rowCurvePoints:points},before=generateCurvedRows(args),after=generateCurvedRows({...args,rowCurvePoints:points.map(point=>point.id==='b'?{...point,offsetM:13}:point)});
  for(const segment of [segments[0],segments[2]])assert.deepEqual(after.filter(row=>row.segmentId===segment.id),before.filter(row=>row.segmentId===segment.id));
});

test('internal and longitudinal passages remain local obstacles without splitting all curves',()=>{
  const internal={...transversePassage,geometry:transversePassage.geometry.map(([lon,lat])=>[8+10*lonM+(lon-8)*.5,lat])};
  const longitudinal={id:'longitudinal',type:'linear',widthM:1.5,geometry:corridorPolygonFromLine([8+20*lonM,44-2*latM],[8+20*lonM,44+62*latM],1.5)};
  for(const passage of [internal,longitudinal])assert.equal(getRowCurveSegments({polygon:rectangle,exclusions:[passage]}).length,1);
});

test('a passage across the local width of a trapezoid splits curves despite a wider parcel elsewhere',()=>{
  const polygon=[[8,44],[8+60*lonM,44],[8+40*lonM,44+60*latM],[8+20*lonM,44+60*latM],[8,44]];
  const passage={id:'narrow-crossing',type:'linear',widthM:1.5,geometry:corridorPolygonFromLine([8+14*lonM,44+45*latM],[8+46*lonM,44+45*latM],1.5)};
  const exclusions=[passage],segments=getRowCurveSegments({polygon,exclusions});
  assert.equal(segments.length,2);
  const args={polygon,rowSpacingM:5,exclusions,rowCurvePoints:[{id:'a',position:.3,offsetM:3},{id:'b',position:.9,offsetM:-2}]};
  const before=generateCurvedRows(args),after=generateCurvedRows({...args,rowCurvePoints:[{id:'a',position:.3,offsetM:12},{id:'b',position:.9,offsetM:-2}]});
  assert.deepEqual(after.filter(row=>row.segmentId===segments[1].id),before.filter(row=>row.segmentId===segments[1].id));
});

test('assigned controls stay in their tract when dragged and stale tract ids resolve by position',()=>{
  const exclusions=[transversePassage],segments=getRowCurveSegments({polygon:rectangle,exclusions});
  const dragged=resolveRowCurvePoints({polygon:rectangle,exclusions,rowCurvePoints:[{id:'a',position:.9,offsetM:3,segmentId:segments[0].id}]});
  assert.equal(dragged[0].segmentId,segments[0].id);
  assert.ok(dragged[0].position<segments[0].endPosition);
  const stale=resolveRowCurvePoints({polygon:rectangle,exclusions,rowCurvePoints:[{id:'b',position:.8,offsetM:3,segmentId:'removed-passage'}]});
  assert.equal(stale[0].segmentId,segments[1].id);
  const removed=resolveRowCurvePoints({polygon:rectangle,exclusions:[],rowCurvePoints:stale});
  assert.equal(removed[0].position,.8);
  assert.equal(removed[0].segmentId,undefined);
});

test('removing a passage generates the same whole-field rows shown by resolved legacy controls',()=>{
  const stale=[{id:'a',position:.002,offsetM:4,segmentId:'segment:start:removed'},{id:'b',position:.75,offsetM:-4,segmentId:'segment:removed:end'}];
  const resolved=resolveRowCurvePoints({polygon:rectangle,exclusions:[],rowCurvePoints:stale});
  assert.equal(resolved[0].position,.02);
  assert.equal(resolved[0].segmentId,undefined);
  for(const maintainEquidistance of [false,true]){
    const args={polygon:rectangle,rowSpacingM:5,exclusions:[],maintainEquidistance};
    assert.deepEqual(generateCurvedRows({...args,rowCurvePoints:stale}),generateCurvedRows({...args,rowCurvePoints:resolved}));
  }
});

test('overlapping passages use the complete interruption rather than reopening an excluded tract',()=>{
  const broad={...transversePassage,id:'broad',geometry:transversePassage.geometry.map(([lon,lat])=>[lon,lat+(lat>44+30*latM?2:-2)*latM])};
  const segments=getRowCurveSegments({polygon:rectangle,exclusions:[broad,transversePassage]});
  assert.equal(segments.length,2);
  assert.ok(segments[1].startPosition>.54);
});

test('crossing passages retain complete legacy ring clipping without duplicate rows or quantities',()=>{
  const up={id:'up',type:'linear',widthM:1.5,geometry:corridorPolygonFromLine([8-2*lonM,44+20*latM],[8+42*lonM,44+40*latM],1.5)};
  const down={id:'down',type:'linear',widthM:1.5,geometry:corridorPolygonFromLine([8-2*lonM,44+40*latM],[8+42*lonM,44+20*latM],1.5)};
  const args={polygon:rectangle,rowSpacingM:5,plantSpacingM:1,postSpacingM:4.5,rowCurvePoints:[{id:'a',position:.25,offsetM:4},{id:'b',position:.75,offsetM:-4}]};
  const baseline=calculateProject({...args,exclusions:[up.geometry,down.geometry]});
  const compound=calculateProject({...args,exclusions:[up,down]});
  assert.equal(getRowCurveSegments({polygon:rectangle,exclusions:[up,down]}).length,1);
  assert.deepEqual(compound,baseline);
});

test('headlands trim parcel ends once while passage ends keep the existing clearance',()=>{
  const args={polygon:rectangle,rowSpacingM:5,plantSpacingM:1,postSpacingM:4.5,exclusions:[transversePassage],rowCurvePoints:[{id:'a',position:.25,offsetM:0},{id:'b',position:.75,offsetM:0}]};
  const full=calculateProject(args),trimmed=calculateProject({...args,headlandWidthM:2});
  assert.ok(Math.abs(full.rowLinearM-trimmed.rowLinearM-28)<.1);
  const starts=trimmed.rows.flatMap(row=>[row.start[1],row.end[1]]);
  assert.ok(starts.some(lat=>Math.abs(lat-(44+29.25*latM))<1e-8));
  assert.ok(starts.some(lat=>Math.abs(lat-(44+30.75*latM))<1e-8));
});

test('curve points are sorted, clamped and limited without losing stable ids',()=>{
  const input=Array.from({length:10},(_,index)=>({id:`p${index}`,position:index===0?-2:1-index/10,offsetM:index===1?Infinity:index*3}));
  const points=normalizeRowCurvePoints(input);
  assert.equal(points.length,8);
  assert.ok(points.every((point,index)=>point.id&&point.position>0&&point.position<1&&(index===0||point.position>=points[index-1].position)));
  assert.ok(points.every(point=>Number.isFinite(point.offsetM)));
});

test('one control point creates curved row polylines with actual length',()=>{
  const rows=generateCurvedRows({polygon:rectangle,rowSpacingM:5,orientationDeg:0,rowCurvePoints:[{id:'bend',position:.5,offsetM:8}],sampleStepM:1});
  assert.ok(rows.length>=5);
  assert.ok(rows.every(row=>row.coordinates.length>3&&row.start===row.coordinates[0]&&row.end===row.coordinates.at(-1)));
  assert.ok(rows.some(row=>row.lengthM>60.5));
});

test('opposite control offsets create an S rather than a straight chord',()=>{
  const rows=generateCurvedRows({polygon:rectangle,rowSpacingM:5,orientationDeg:0,rowCurvePoints:[{id:'a',position:.3,offsetM:7},{id:'b',position:.7,offsetM:-7}],sampleStepM:1});
  const row=rows.sort((a,b)=>b.coordinates.length-a.coordinates.length)[0];
  const startLon=row.start[0];
  const deviations=row.coordinates.map(point=>(point[0]-startLon)/lonM);
  assert.ok(Math.max(...deviations)>4);
  assert.ok(Math.min(...deviations)<-4);
});

test('curved rows are split by an exclusion and keep every point inside the parcel',()=>{
  const exclusion=[[8+15*lonM,44+24*latM],[8+25*lonM,44+24*latM],[8+25*lonM,44+36*latM],[8+15*lonM,44+36*latM],[8+15*lonM,44+24*latM]];
  const full=generateCurvedRows({polygon:rectangle,rowSpacingM:5,orientationDeg:0,rowCurvePoints:[{id:'bend',position:.5,offsetM:6}]});
  const cut=generateCurvedRows({polygon:rectangle,rowSpacingM:5,orientationDeg:0,rowCurvePoints:[{id:'bend',position:.5,offsetM:6}],exclusions:[exclusion]});
  assert.ok(cut.reduce((sum,row)=>sum+row.lengthM,0)<full.reduce((sum,row)=>sum+row.lengthM,0));
  assert.ok(cut.length>full.length);
});

test('map handle coordinates round-trip through the oriented curve frame',()=>{
  const point={id:'control',position:.35,offsetM:-6.5};
  const coordinate=curvePointToLonLat({polygon:rectangle,orientationDeg:25,point});
  const restored=lonLatToCurvePoint({polygon:rectangle,orientationDeg:25,coordinate,id:point.id});
  assert.equal(restored.id,point.id);
  assert.ok(Math.abs(restored.position-point.position)<.002);
  assert.ok(Math.abs(restored.offsetM-point.offsetM)<.1);
});

function distancePointToSegment(point,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy)));
  return Math.hypot(point[0]-(a[0]+t*dx),point[1]-(a[1]+t*dy));
}

function minimumSpacingBetween(rowA,rowB,origin=[8,44]){
  const metres=([lon,lat])=>[(lon-origin[0])/lonM,(lat-origin[1])/latM];
  const b=rowB.coordinates.map(metres);
  let minimum=Infinity;
  for(let index=10;index<rowA.coordinates.length-10;index+=5){
    const point=metres(rowA.coordinates[index]);
    for(let segment=1;segment<b.length;segment++)minimum=Math.min(minimum,distancePointToSegment(point,b[segment-1],b[segment]));
  }
  return minimum;
}

test('equidistant curved rows keep the requested normal spacing through an S bend',()=>{
  const wide=[[8,44],[8+200*lonM,44],[8+200*lonM,44+200*latM],[8,44+200*latM],[8,44]];
  const bends=[
    {id:'a',position:.2,offsetM:0},{id:'b',position:.4,offsetM:8},
    {id:'c',position:.6,offsetM:-8},{id:'d',position:.8,offsetM:0}
  ];
  const rows=generateCurvedRows({polygon:wide,rowSpacingM:6,orientationDeg:0,rowCurvePoints:bends,sampleStepM:1,maintainEquidistance:true});
  const longest=Math.max(...rows.map(row=>row.coordinates.length));
  const complete=rows.filter(row=>row.coordinates.length===longest);
  assert.ok(complete.length>=3);
  const middle=Math.floor(complete.length/2);
  assert.ok(minimumSpacingBetween(complete[middle-1],complete[middle])>5.65);
});

test('legacy curved-row mode remains available when equidistance is disabled',()=>{
  const wide=[[8,44],[8+200*lonM,44],[8+200*lonM,44+200*latM],[8,44+200*latM],[8,44]];
  const bends=[{id:'a',position:.2,offsetM:0},{id:'b',position:.4,offsetM:20},{id:'c',position:.6,offsetM:-20},{id:'d',position:.8,offsetM:0}];
  const rows=generateCurvedRows({polygon:wide,rowSpacingM:6,rowCurvePoints:bends,sampleStepM:1,maintainEquidistance:false});
  const longest=Math.max(...rows.map(row=>row.coordinates.length));
  const complete=rows.filter(row=>row.coordinates.length===longest);
  const middle=Math.floor(complete.length/2);
  assert.ok(minimumSpacingBetween(complete[middle-1],complete[middle])<4.5);
});

test('tight S bends do not create crossing filari when equal spacing is requested',()=>{
  const polygon=[[8,44],[8+90*lonM,44],[8+90*lonM,44+90*latM],[8,44+90*latM],[8,44]];
  const bends=[{id:'a',position:.28,offsetM:32},{id:'b',position:.52,offsetM:-32},{id:'c',position:.74,offsetM:30}];
  const rows=generateCurvedRows({polygon,rowSpacingM:2.5,rowCurvePoints:bends,sampleStepM:1,maintainEquidistance:true});
  const intersects=(a,b,c,d)=>{
    const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
    return cross(a,b,c)*cross(a,b,d)<-1e-9&&cross(c,d,a)*cross(c,d,b)<-1e-9;
  };
  const local=([lon,lat])=>[(lon-8)/lonM,(lat-44)/latM];
  let crossings=0;
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
    const left=rows[i].coordinates.map(local),right=rows[j].coordinates.map(local);
    for(let a=1;a<left.length;a++)for(let b=1;b<right.length;b++)
      if(intersects(left[a-1],left[a],right[b-1],right[b]))crossings++;
  }
  assert.ok(rows.length>5);
  assert.equal(crossings,0,'filari must not intersect at sharp bends');
});
