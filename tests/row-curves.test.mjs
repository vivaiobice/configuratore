import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRowCurvePoints,
  generateCurvedRows,
  curvePointToLonLat,
  lonLatToCurvePoint
} from '../src/row-curves.js';

const lonM = 1 / (111320 * Math.cos(44 * Math.PI / 180));
const latM = 1 / 110540;
const rectangle = [[8,44],[8+40*lonM,44],[8+40*lonM,44+60*latM],[8,44+60*latM],[8,44]];

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
