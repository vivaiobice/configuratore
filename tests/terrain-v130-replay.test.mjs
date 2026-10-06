import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {readAppliedTerrainResult,terrainDesignInputHash} from '../src/terrain-design.js';
import {terrainInputHash} from '../src/terrain-model.js';
import {calculateProject} from '../src/project-calculator.js';
const replay=existsSync(new URL('../src/terrain-replay.js',import.meta.url))?await import('../src/terrain-replay.js'):{};
const historical=JSON.parse(readFileSync(new URL('./fixtures/terrain-v130-applied.json',import.meta.url),'utf8'));
const api=()=>{assert.equal(typeof replay.readTerrainEnvelope,'function');return replay;};
const fresh=()=>{const old=structuredClone(historical.cases[1]);const envelope=api().createContourEnvelope({project:old.project,model:old.project.terrain.model,result:old.result,portionResults:old.envelope.portionResults,validation:old.envelope.validation});return {...old.project,terrain:{model:old.project.terrain.model,applied:envelope}};};

test('historical opaque algorithm and raw portions replay unchanged',()=>{
 const {readTerrainEnvelope,hashTerrainEnvelope}=api();
 assert.equal(historical.sourceCommit,'1ecdaca94353dd94f7bcf1f783913bbf275326ef');
 for(const old of historical.cases){
  const project=structuredClone(old.project),beforeRaw=structuredClone(project.rowPortions);
  assert.deepEqual(readTerrainEnvelope(project),old.result);
  assert.deepEqual(readAppliedTerrainResult(project),old.result);
  assert.deepEqual(calculateProject({...project,polygon:project.geometry}),old.result);
  assert.equal(terrainDesignInputHash(project,project.terrain.model),old.hashes.inputHash);
  assert.equal(hashTerrainEnvelope(old.envelope),old.hashes.snapshotHash);
  assert.equal(terrainInputHash(old.result),old.hashes.resultHash);
  project.terrain.applied.algorithmVersion='unknown-future';
  assert.deepEqual(readTerrainEnvelope(project),old.result);
  assert.deepEqual(project.rowPortions,beforeRaw);
  assert.deepEqual(old.project.terrain.applied,old.envelope);
  const raw=structuredClone(old.project);raw.rowPortions=structuredClone(old.rawArchive.rowPortions);
  Object.assign(raw.terrain.applied,{inputs:structuredClone(old.rawArchive.inputs),inputHash:old.rawArchive.inputHash,snapshotHash:old.rawArchive.snapshotHash,algorithmVersion:'opaque-raw-archive'});
  const before=structuredClone(raw);
  assert.deepEqual(readTerrainEnvelope(raw),old.result);
  assert.deepEqual(raw,before);
  const replayed=readTerrainEnvelope(raw);replayed.rows[0].lengthM++;
  assert.deepEqual(raw,before);

 }
});
test('historical tampering rejects each original hash independently',()=>{
 const {readTerrainEnvelope}=api();
 for(const edit of [p=>p.rowSpacingM++,p=>p.terrain.applied.result.rows[0].lengthM++,p=>p.terrain.applied.portionResults[0].design.phase++,p=>p.terrain.applied.inputs.rowPortions[0].label='corrupt']){
  const project=structuredClone(historical.cases[0].project);edit(project);
  assert.equal(readTerrainEnvelope(project).terrainStatus,'invalid');
  assert.equal(readTerrainEnvelope(project).rowCount,null);
 }
});
test('v2 envelope detects tampering',()=>{
 const {readTerrainEnvelope,hashTerrainEnvelope}=api();const project=fresh(),before=structuredClone(project);
 assert.equal(project.terrain.applied.schemaVersion,2);
 assert.equal(project.terrain.applied.algorithmVersion,'terrain-contour-family-1');
 assert.deepEqual(readTerrainEnvelope(project),historical.cases[1].result);
 assert.equal(hashTerrainEnvelope(project.terrain.applied),project.terrain.applied.snapshotHash);
 assert.deepEqual(project,before);
 for(const edit of [p=>p.terrain.applied.algorithmVersion='unknown-future',p=>p.terrain.applied.result.rows[0].lengthM++,p=>p.terrain.applied.validation.valid=false,p=>p.terrain.applied.portionResults[0].design.phase++,p=>p.terrain.applied.inputs.orientationDeg++,p=>p.rowPortions[0].terrainDesign.phase++,p=>p.terrain.applied.resultHash='bad']){
  const tampered=structuredClone(project);edit(tampered);
  const result=readTerrainEnvelope(tampered);assert.equal(result.terrainStatus,'invalid');assert.equal(result.rowCount,null);
 }
 // The caller owns its data; the constructor and reader must not alias it.
 project.terrain.applied.result.rows[0].lengthM++;
 assert.deepEqual(historical.cases[1].result,before.terrain.applied.result);
});
test('v2 geometry hash excludes presentation and history while retaining design and passage provenance',()=>{
 const {readTerrainEnvelope,terrainGeometryInputHash}=api();const project=fresh(),model=project.terrain.model,hash=terrainGeometryInputHash(project,model);
 const presentation=structuredClone(project);presentation.label='New field';presentation.rowPortions[0].label='New portion';presentation.rowPortions[0].conflict={display:true};presentation.rowPortions[0].selected=true;presentation.terrain.history={schemaVersion:1,entries:[]};presentation.exclusions=presentation.exclusions.map(geometry=>({geometry,label:'Road'}));
 assert.equal(terrainGeometryInputHash(presentation,model),hash);
 assert.deepEqual(readTerrainEnvelope(presentation),historical.cases[1].result);
 for(const edit of [p=>p.rowSpacingM++,p=>p.plantSpacingM++,p=>p.postSpacingM++,p=>p.headlandWidthM++,p=>p.orientationDeg++,p=>p.maintainRowEquidistance=false,p=>p.rowCurvePoints=[{position:.5,offsetM:2}],p=>p.rowPortions[0].inheritedDesign.orientationDeg++,p=>p.rowPortions[0].geometry[0][0][0]+=.001,p=>p.rowPortions[0].anchor[0]+=.001,p=>p.rowPortions[0].mode='local',p=>p.rowPortions[0].id='other',p=>p.rowPortions[0].terrainDesign.phase++]){
  const changed=structuredClone(project);edit(changed);assert.notEqual(terrainGeometryInputHash(changed,model),hash);assert.equal(readTerrainEnvelope(changed).terrainStatus,'invalid');
 }
 for(const key of ['id','type','sourceAxis','widthM','widthBasis','modelHash','scopePortionId','scopeGeometry','passageGroupId']){
  const changed=structuredClone(project);changed.exclusions[0]={geometry:changed.exclusions[0],[key]:key==='widthM'?1.5:key==='scopeGeometry'?{type:'Polygon',coordinates:[project.geometry]}:'changed'};
  assert.notEqual(terrainGeometryInputHash(changed,model),hash,key);
 }
 assert.notEqual(terrainGeometryInputHash(project,{...model,contentHash:'other'}),hash);
});
test('unsupported schemas and malformed envelopes never fall back to planar estimates',()=>{
 const {readTerrainEnvelope}=api();assert.equal(readTerrainEnvelope({}),null);
 for(const edit of [p=>p.terrain.applied.schemaVersion=3,p=>p.terrain.applied.schemaVersion=null,p=>p.terrain.applied=null,p=>p.terrain.model=null,p=>p.terrain.applied.inputs=null,p=>p.terrain.applied.result.rows=null]){
  const project=fresh();edit(project);const before=structuredClone(project);
  assert.equal(readTerrainEnvelope(project).terrainStatus,'invalid');
  assert.equal(calculateProject({...project,polygon:project.geometry}).rowCount,null);
  assert.deepEqual(project,before);
 }
});
