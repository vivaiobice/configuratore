import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProject } from '../src/project-calculator.js';

const square10m = [
  [8.0, 44.0],
  [8.0 + 10 / (111320 * Math.cos(44 * Math.PI / 180)), 44.0],
  [8.0 + 10 / (111320 * Math.cos(44 * Math.PI / 180)), 44.0 + 10 / 110540],
  [8.0, 44.0 + 10 / 110540],
  [8.0, 44.0]
];

test('calculateProject returns empty metrics without a valid polygon', () => {
  const result = calculateProject({ polygon: null, rowSpacingM: 2.5, plantSpacingM: 1, orientationDeg: 0 });
  assert.equal(result.areaM2, 0);
  assert.equal(result.rows.length, 0);
  assert.equal(result.simulatedPlants, 0);
});

test('calculateProject computes real rows, theoretical plants and commercial quantity separately', () => {
  const result = calculateProject({ polygon: square10m, rowSpacingM: 2.5, plantSpacingM: 1, orientationDeg: 0 });
  assert.ok(result.areaM2 > 95 && result.areaM2 < 103);
  assert.ok(result.rowCount >= 3 && result.rowCount <= 5);
  assert.ok(result.rowLinearM > 34 && result.rowLinearM < 44);
  assert.ok(result.simulatedPlants > 35);
  assert.ok(result.theoreticalPlants > 35 && result.theoreticalPlants < 45);
  assert.equal(result.commercialPlants25 % 25, 0);
  assert.ok(result.commercialPlants25 >= result.simulatedPlants);
});

test('calculateProject estimates head and intermediate posts from generated rows when spacing is set', () => {
  const result = calculateProject({ polygon: square10m, rowSpacingM: 2.5, plantSpacingM: 1, orientationDeg: 0, postSpacingM: 4.5 });
  assert.equal(result.headPosts, result.rowCount * 2);
  assert.ok(result.intermediatePosts >= result.rowCount);
  assert.equal(result.totalPosts, result.headPosts + result.intermediatePosts);
});

test('headlands shorten physical rows and reduce net planting area, plants and posts', () => {
  const full = calculateProject({ polygon:square10m, rowSpacingM:2.5, plantSpacingM:1, orientationDeg:0, postSpacingM:4.5 });
  const withHeadlands = calculateProject({ polygon:square10m, rowSpacingM:2.5, plantSpacingM:1, orientationDeg:0, postSpacingM:4.5, headlandWidthM:2 });
  assert.ok(withHeadlands.netAreaM2 < full.areaM2);
  assert.ok(withHeadlands.headlandAreaM2 > 0);
  assert.ok(withHeadlands.rowLinearM < full.rowLinearM);
  assert.ok(withHeadlands.simulatedPlants < full.simulatedPlants);
  assert.ok(withHeadlands.totalPosts <= full.totalPosts);
  assert.ok(withHeadlands.rows.every((row) => row.lengthM < 7));
});

test('without headlands net area remains equal to gross area', () => {
  const result = calculateProject({ polygon:square10m, rowSpacingM:2.5, plantSpacingM:1, orientationDeg:0 });
  assert.equal(result.netAreaM2, result.areaM2);
  assert.equal(result.headlandAreaM2, 0);
});

test('excluded zones reduce usable area and split physical rows', () => {
  const lonM = 1 / (111320 * Math.cos(44 * Math.PI / 180));
  const latM = 1 / 110540;
  const exclusion = [
    [8 + 3*lonM,44 + 3*latM], [8 + 7*lonM,44 + 3*latM],
    [8 + 7*lonM,44 + 7*latM], [8 + 3*lonM,44 + 7*latM], [8 + 3*lonM,44 + 3*latM]
  ];
  const full = calculateProject({ polygon:square10m, rowSpacingM:2.5, plantSpacingM:1, orientationDeg:0, postSpacingM:4.5 });
  const cut = calculateProject({ polygon:square10m, exclusions:[exclusion], rowSpacingM:2.5, plantSpacingM:1, orientationDeg:0, postSpacingM:4.5 });
  assert.ok(cut.excludedAreaM2 > 6);
  assert.ok(cut.netAreaM2 < full.netAreaM2);
  assert.ok(cut.rowLinearM < full.rowLinearM);
  assert.ok(cut.simulatedPlants < full.simulatedPlants);
});

test('post spacing defaults to 4.50 m when field supplies the standard default', () => {
  const result = calculateProject({ polygon:square10m, rowSpacingM:2.5, plantSpacingM:1, orientationDeg:0, postSpacingM:4.5 });
  assert.equal(result.headPosts, result.rowCount * 2);
  assert.ok(result.totalPosts > result.headPosts);
});

test('curved control points recalculate plants and posts from polyline lengths',()=>{
  const straight=calculateProject({polygon:square10m,rowSpacingM:2.5,plantSpacingM:1,orientationDeg:0,postSpacingM:4.5});
  const curved=calculateProject({polygon:square10m,rowSpacingM:2.5,plantSpacingM:1,orientationDeg:0,postSpacingM:4.5,rowCurvePoints:[{id:'bend',position:.5,offsetM:2}]});
  assert.ok(curved.rows.every(row=>row.coordinates?.length>2));
  assert.notEqual(curved.rowLinearM,straight.rowLinearM);
  assert.equal(curved.headPosts,curved.rowCount*2);
  assert.equal(curved.totalPosts,curved.headPosts+curved.intermediatePosts);
});

test('project calculation forwards the equidistance option to curved row generation',()=>{
  const args={polygon:square10m,rowSpacingM:2.5,plantSpacingM:1,rowCurvePoints:[{id:'bend',position:.5,offsetM:2}],maintainRowEquidistance:true};
  const equidistant=calculateProject(args);
  const legacy=calculateProject({...args,maintainRowEquidistance:false});
  assert.notDeepEqual(equidistant.rows,legacy.rows);
});
