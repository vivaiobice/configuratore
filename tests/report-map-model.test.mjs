import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportMapModel } from '../src/report-map-model.js';

const polygon=[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]];

test('report map model uses one deterministic projection for polygon rows and side labels', () => {
  const model=buildReportMapModel({
    polygon,rows:[{start:[8.005,44],end:[8.005,44.01],lengthM:1110}],width:800,height:500,padding:50
  });
  assert.equal(model.valid,true);
  assert.equal(model.sideMeasurements.length,4);
  assert.equal(model.rows.length,1);
  for(const point of model.polygon){
    assert.ok(point[0]>=0&&point[0]<=800);
    assert.ok(point[1]>=0&&point[1]<=500);
  }
  assert.equal(model.captureBounds.length,2);
  assert.deepEqual(model.geo.polygon[0],polygon[0]);
  assert.deepEqual(model.geo.rows[0].coordinates[0],[8.005,44]);
});

test('report map model normalizes area and linear exclusions without mutating inputs', () => {
  const area=[[8.002,44.002],[8.004,44.002],[8.004,44.004],[8.002,44.002]];
  const passage=[[8.006,44],[8.007,44],[8.007,44.01],[8.006,44]];
  const exclusions=[area,{id:'p1',type:'linear',geometry:passage,label:'Passaggio'}];
  const original=structuredClone(exclusions);
  const model=buildReportMapModel({polygon,exclusions});
  assert.deepEqual(exclusions,original);
  assert.deepEqual(model.exclusions.map(item=>item.type),['area','linear']);
  assert.ok(model.exclusions.every(item=>item.points.length>=4));
});

test('report map model returns an invalid neutral model for an incomplete polygon', () => {
  const model=buildReportMapModel({polygon:null});
  assert.equal(model.valid,false);
  assert.deepEqual(model.polygon,[]);
});

test('report map model projects every vertex of a curved vineyard row', () => {
  const coordinates=[[8.002,44],[8.004,44.006],[8.006,44.003],[8.008,44.01]];
  const model=buildReportMapModel({
    polygon,
    rows:[{start:coordinates[0],end:coordinates.at(-1),coordinates,lengthM:1400}]
  });
  assert.equal(model.rows.length,1);
  assert.equal(model.rows[0].coordinates.length,4);
  assert.deepEqual(model.rows[0].start,model.rows[0].coordinates[0]);
  assert.deepEqual(model.rows[0].end,model.rows[0].coordinates.at(-1));
});
