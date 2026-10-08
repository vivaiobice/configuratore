import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {fixture} from './helpers/terrain-fixture.mjs';
import {calculateProject} from '../src/project-calculator.js';
import {createContourEnvelope,readTerrainEnvelope} from '../src/terrain-replay.js';
import {buildContourTerrainProposal} from '../src/terrain-contour-design.js';
import {fromUTM} from '../src/coordinate-system.js';
const history=existsSync(new URL('../src/terrain-history.js',import.meta.url))?await import('../src/terrain-history.js'):{};
const api=()=>{for(const name of ['attachTerrainRestore','terrainRestoreAvailability','buildTerrainRestoreProposal'])assert.equal(typeof history[name],'function',name);return history;};
const materialize=(project,proposal)=>{
 const result={...structuredClone(project),...structuredClone(proposal.projectPatch??{}),terrain:structuredClone(proposal.terrain)};
 if(Object.hasOwn(proposal,'rowPortions'))result.rowPortions=structuredClone(proposal.rowPortions);
 for(const key of proposal.removeProjectKeys??[])delete result[key];
 return result;
};
async function measuredFixture({split=false,plantSpacingM=1,height=(x,y)=>y/2}={}){
 const {model,project}=await fixture(height);
 project.plantSpacingM=plantSpacingM;
 const ring=points=>points.map(([x,y])=>fromUTM([500000+x,5000000+y],32632));
 project.geometry=ring([[0,0],[12,0],[12,12],[0,12],[0,0]]);
 if(split)project.exclusions=[ring([[5,-1],[7,-1],[7,13],[5,13],[5,-1]])];
 const proposal=buildContourTerrainProposal({project,model,mode:'measure'});
 assert.equal(proposal.ok,true,proposal.message);
 return {project,model,proposal,ids:proposal.rowPortions.map(p=>p.id)};
}

test('history checkpoint guard validates every actual attached baseline without requiring current-context equality',async()=>{
 assert.equal(typeof history.assertTerrainRestoreHistory,'function');
 const {project,proposal}=await measuredFixture({split:true});
 const current=materialize(project,api().attachTerrainRestore({project,proposal,operationId:'guard'})),before=structuredClone(current);
 const fingerprint=history.assertTerrainRestoreHistory({project:current});
 assert.equal(typeof fingerprint,'string');assert.ok(fingerprint.length);
 assert.equal(history.assertTerrainRestoreHistory({project:structuredClone(current)}),fingerprint);assert.deepEqual(current,before);
 const changed=structuredClone(current);changed.plantSpacingM++;
 assert.equal(history.assertTerrainRestoreHistory({project:changed}),fingerprint,'a legitimate shared input edit changes restore mode, not history integrity');
 const corrupt=structuredClone(current);corrupt.terrain.history.entries[1].before.portions[0].rows[0].lengthM++;
 assert.throws(()=>history.assertTerrainRestoreHistory({project:corrupt}),error=>error.status==='invalid-history');
});

test('history guard fingerprint distinguishes absent, empty and same-geometry replaced histories without persisting defaults',async()=>{
 assert.equal(typeof history.assertTerrainRestoreHistory,'function');
 const missing={},missingBefore=structuredClone(missing),empty={terrain:{history:{schemaVersion:1,entries:[]}}};
 const absent=history.assertTerrainRestoreHistory({project:missing}),emptied=history.assertTerrainRestoreHistory({project:empty});
 assert.notEqual(absent,emptied);assert.deepEqual(missing,missingBefore);
 assert.equal(history.assertTerrainRestoreHistory({project:{terrain:{},label:'presentation'}}),absent);
 const historical=JSON.parse(readFileSync(new URL('./fixtures/terrain-v130-applied.json',import.meta.url),'utf8'));
 for(const item of historical.cases){const before=structuredClone(item.project);assert.equal(history.assertTerrainRestoreHistory({project:item.project}),absent);assert.deepEqual(item.project,before);}
 const {project,proposal}=await measuredFixture();
 const first=materialize(project,api().attachTerrainRestore({project,proposal,operationId:'first'}));
 const replacement=materialize(project,api().attachTerrainRestore({project,proposal,operationId:'replacement'}));
 assert.deepEqual(first.terrain.applied,replacement.terrain.applied);
 assert.notEqual(history.assertTerrainRestoreHistory({project:first}),history.assertTerrainRestoreHistory({project:replacement}));
});

test('history guard rejects malformed, unknown, overlapping and recursive histories with typed invalid-history errors',async()=>{
 assert.equal(typeof history.assertTerrainRestoreHistory,'function');
 const {project,proposal}=await measuredFixture(),valid=materialize(project,api().attachTerrainRestore({project,proposal,operationId:'guard'}));
 const {terrainInputHash}=await import('../src/terrain-model.js');
 const mutations=[
  p=>p.terrain.history=null,
  p=>p.terrain.history=undefined,
  p=>p.terrain.history.schemaVersion=2,
  p=>p.terrain.history.entries={},
  p=>p.terrain.history.entries.push(structuredClone(p.terrain.history.entries[0])),
  p=>p.terrain.history.entries[0].baselineHash='broken',
  p=>{const entry=p.terrain.history.entries[0];entry.before.grid={valuesBase64:'duplicated'};const {baselineHash:_,...contents}=entry;entry.baselineHash=terrainInputHash(contents);},
  p=>p.terrain.history.extra=p.terrain.history
 ];
 for(const mutate of mutations){const corrupt=structuredClone(valid);mutate(corrupt);assert.throws(()=>history.assertTerrainRestoreHistory({project:corrupt}),error=>error.status==='invalid-history');}
});

test('cached baseline spacing is bound separately from a valid new apply context',async()=>{
 const {attachTerrainRestore,terrainRestoreAvailability,buildTerrainRestoreProposal}=api();
 const {project,model,proposal,ids}=await measuredFixture();
 const old=materialize(project,attachTerrainRestore({project,proposal,operationId:'first'}));
 old.rowSpacingM=6;old.rowPortions[0].inheritedDesign.orientationDeg=90;
 assert.equal(readTerrainEnvelope(old).terrainStatus,'invalid');
 assert.throws(()=>attachTerrainRestore({project:old,proposal,operationId:'stale-after'}),/complete|context|applied/i);
 const fresh=buildContourTerrainProposal({project:old,model,mode:'measure',recomputeAll:true});assert.equal(fresh.ok,true,fresh.message);
 const current=materialize(old,attachTerrainRestore({project:old,proposal:fresh,operationId:'new-spacing'}));
 assert.equal(terrainRestoreAvailability({project:current,portionId:ids[0]}).reason,'recompute-required');
 const restore=buildTerrainRestoreProposal({project:current,portionId:ids[0],model});assert.equal(restore.ok,true,restore.message);
 assert.equal(restore.terrain.applied.inputs.rowSpacingM,6);assert.equal(restore.result.rowCount,2);
 assert.equal(restore.rowPortions[0].inheritedDesign.orientationDeg,0,'manual reference matches the old saved rows, not live unsaved raw parameters');
 assert.equal(readTerrainEnvelope(materialize(current,restore)).terrainStatus,'applied');
});

test('actual local B producer preserves A original manual undo despite its full presentation change summary',async()=>{
 const {attachTerrainRestore,buildTerrainRestoreProposal}=api();
 const {project,model,proposal,ids}=await measuredFixture({split:true});
 const manual=calculateProject({...project,polygon:project.geometry,terrain:null});
 const original=materialize(project,attachTerrainRestore({project,proposal,operationId:'first'}));
 const originalA=structuredClone(original.terrain.history.entries.find(e=>e.affectedIds.includes(ids[0])));
 const local=buildContourTerrainProposal({project:original,model,portionId:ids[1],mode:'measure'});assert.equal(local.ok,true,local.message);
 assert.deepEqual(local.affectedPortionIds,[ids[1]]);assert.deepEqual(local.changes.map(c=>c.portionId),ids);
 const current=materialize(original,attachTerrainRestore({project:original,proposal:local,operationId:'B'}));
 assert.deepEqual(current.terrain.history.entries.find(e=>e.affectedIds.includes(ids[0])),originalA);
 const b=structuredClone(current.terrain.applied.portionResults.find(p=>p.id===ids[1]));
 const restore=buildTerrainRestoreProposal({project:current,portionId:ids[0],model});assert.equal(restore.ok,true,restore.message);
 assert.deepEqual(restore.terrain.applied.portionResults.find(p=>p.id===ids[0]).rows,manual.rows.filter(r=>r.portionId===ids[0]));
 assert.deepEqual(restore.terrain.applied.portionResults.find(p=>p.id===ids[1]),b);
});

test('explicit contour history rejects missing or malformed authoritative affected identities',async()=>{
 const {attachTerrainRestore}=api();
 const {project,proposal,ids}=await measuredFixture();
 for(const affected of [undefined,[],[ids[0],ids[0]],['unknown'],[null]]){
  const candidate=structuredClone(proposal);
  if(affected===undefined)delete candidate.affectedPortionIds;else candidate.affectedPortionIds=affected;
  const before=structuredClone(project),unchanged=structuredClone(candidate);
  assert.throws(()=>attachTerrainRestore({project,proposal:candidate,operationId:'invalid-scope'}),/affected portion/i);
  assert.deepEqual(project,before);assert.deepEqual(candidate,unchanged);
 }
});

test('actual multi-portion exact terrain restore rounds field density once and all-manual undo preserves its original aggregate',async()=>{
 const {attachTerrainRestore,buildTerrainRestoreProposal}=api();
 const {project,model,proposal,ids}=await measuredFixture({split:true});
 const manual=calculateProject({...project,polygon:project.geometry,terrain:null});
 // Capture the actual terrain baseline without any first-conversion history.
 const original=materialize(project,proposal);
 const same=buildContourTerrainProposal({project:original,model,mode:'measure',recomputeAll:true});assert.equal(same.ok,true,same.message);
 let current=materialize(original,attachTerrainRestore({project:original,proposal:same,operationId:'again'}));
 const undo=buildTerrainRestoreProposal({project:current,portionId:ids[0],model});assert.equal(undo.ok,true,undo.message);
 assert.equal(proposal.result.theoreticalPlants,45);assert.equal(undo.result.theoreticalPlants,proposal.result.theoreticalPlants);
 assert.deepEqual(undo.terrain.applied.portionResults.find(p=>p.id===ids[0]),proposal.terrain.applied.portionResults.find(p=>p.id===ids[0]));
 current=materialize(project,attachTerrainRestore({project,proposal,operationId:'manual-first'}));
 for(const id of ids){const restore=buildTerrainRestoreProposal({project:current,portionId:id,model});assert.equal(restore.ok,true,restore.message);current=materialize(current,restore);}
 const restored=readTerrainEnvelope(current);assert.equal(restored.quantityBasis,'legacy-planar');
 for(const key of ['netAreaM2','headlandAreaM2','rowCount','rowLinearM','simulatedPlants','theoreticalPlants','commercialPlants25','headPosts','intermediatePosts','totalPosts'])assert.equal(restored[key],manual[key],key);
});

test('actual mixed restore exposes unrounded planar and surface density contributions before one field ceil',async()=>{
 const {attachTerrainRestore,buildTerrainRestoreProposal}=api();
 const {project,model,proposal,ids}=await measuredFixture({split:true,plantSpacingM:7/6});
 const current=materialize(project,attachTerrainRestore({project,proposal,operationId:'first'}));
 const restore=buildTerrainRestoreProposal({project:current,portionId:ids[0],model});assert.equal(restore.ok,true,restore.message);
 assert.equal(restore.result.quantityBasis,'mixed-certified-bases');
 const contributions=restore.result.theoreticalDensityContributions;
 assert.deepEqual(contributions.map(c=>c.basis).sort(),['legacy-planar-net','surface-after-explicit-exclusions-and-headlands']);
 const expected=Math.ceil(contributions.reduce((s,c)=>s+c.areaM2,0)/(project.rowSpacingM*project.plantSpacingM));
 assert.equal(expected,37);assert.equal(restore.result.theoreticalPlants,expected);
 assert.equal(contributions.reduce((s,c)=>s+Math.ceil(c.areaM2/(project.rowSpacingM*project.plantSpacingM)),0),38,'per-portion ceil would alter the original aggregation semantics');
});

test('actual exact flat multi-portion restore retains the builder legacy planar density total',async()=>{
 const {attachTerrainRestore,buildTerrainRestoreProposal}=api();
 const {project,model,proposal,ids}=await measuredFixture({split:true,height:()=>0});
 const original=materialize(project,proposal);
 const same=buildContourTerrainProposal({project:original,model,mode:'measure',recomputeAll:true});assert.equal(same.ok,true,same.message);
 const current=materialize(original,attachTerrainRestore({project:original,proposal:same,operationId:'flat'}));
 const restore=buildTerrainRestoreProposal({project:current,portionId:ids[0],model});assert.equal(restore.ok,true,restore.message);
 assert.equal(restore.result.quantityBasis,'certified-flat-legacy');
 for(const key of ['rowCount','rowLinearM','simulatedPlants','theoreticalPlants','commercialPlants25','headPosts','intermediatePosts','totalPosts'])assert.equal(restore.result[key],proposal.result[key],key);
 assert.equal(restore.result.theoreticalPlantsBasis,'certified-flat-legacy-planar-density');
});
// Small replay/transport fixture, deliberately not geometric certification.
async function conversion({split=false,raw='empty'}={}){
 const {model,project}=await fixture((x,y)=>y/2,split?{exclusions:[[[19,-1],[21,-1],[21,41],[19,41],[19,-1]]]}:{});
 if(raw==='missing')delete project.rowPortions;
 const manual=calculateProject({...project,polygon:project.geometry,terrain:null});
 const portions=manual.portions;
 const portionResults=portions.map(portion=>{
  const rows=manual.rows.filter(row=>row.portionId===portion.id||portions.length===1).map((row,index)=>({...row,portionId:portion.id,axisId:`${portion.id}-${index}`,lengthM:row.lengthM*1.25,surfaceLengthM:row.lengthM*1.25,horizontalLengthM:row.lengthM,quantityBasis:'model-surface'}));
  return {id:portion.id,rows,rowCount:rows.length,rowLinearM:rows.reduce((s,r)=>s+r.lengthM,0),quantityBasis:'model-surface',design:{mode:'manual',modelHash:model.contentHash},validation:{valid:true,automaticSpacing:false},coverage:{servedAreaM2:null,referenceAreaM2:100,basis:'surface-after-explicit-exclusions-before-headlands'},headlandArea:{horizontal:0,surface:0},usableSurfaceAreaM2:100,usableHorizontalAreaM2:100};
 });
 const rowPortions=portions.map(p=>({...p,terrainDesign:portionResults.find(r=>r.id===p.id).design}));
 const result={...manual,rows:portionResults.flatMap(p=>p.rows),portions:rowPortions,terrainStatus:'applied',quantityBasis:'model-surface',surfaceUsableAreaM2:portionResults.length*100,surfaceAreaM2:1000};
 const applied=createContourEnvelope({project:{...project,rowPortions},model,result,portionResults,validation:{valid:true}});
 const proposal={ok:true,status:'ready',kind:'adapt',rowPortions,result,terrain:{model,applied},affectedPortionIds:portions.map(p=>p.id),changes:portions.map(p=>({portionId:p.id}))};
 return {project,proposal,manual,model,ids:portions.map(p=>p.id)};
}

test('unchanged undo restores exact manual rows and original raw empty or missing portions',async()=>{
 const {attachTerrainRestore,buildTerrainRestoreProposal,terrainRestoreAvailability}=api();
 for(const raw of ['empty','missing']){
  const {project,proposal,manual,model,ids}=await conversion({raw}),before=structuredClone(project);
  const attached=attachTerrainRestore({project,proposal,operationId:'first'}),current=materialize(project,attached);
  assert.deepEqual(project,before);assert.equal(proposal.terrain.history,undefined);
  assert.equal(terrainRestoreAvailability({project:current,portionId:ids[0]}).available,true);
  const restore=buildTerrainRestoreProposal({project:current,portionId:ids[0],model});
  assert.equal(restore.ok,true,restore.message);assert.equal(restore.kind,'restore');
  const restored=materialize(current,restore);
  assert.deepEqual(restored.rowPortions,before.rowPortions);assert.equal(Object.hasOwn(restored,'rowPortions'),Object.hasOwn(before,'rowPortions'));
  assert.deepEqual(restore.result.rows,manual.rows);assert.equal(restore.result.rowLinearM,manual.rowLinearM);
  assert.equal(restore.result.simulatedPlants,manual.simulatedPlants);assert.equal(restore.result.quantityBasis,'legacy-planar');
  assert.equal(readTerrainEnvelope(restored).terrainStatus,'applied');assert.equal(restored.terrain.history.entries.length,0);
 }
});

test('a B-only applied edit keeps A restore available and preserves B exactly',async()=>{
 const {attachTerrainRestore,buildTerrainRestoreProposal,terrainRestoreAvailability}=api();
 const {project,proposal,manual,model,ids}=await conversion({split:true});
 let current=materialize(project,attachTerrainRestore({project,proposal,operationId:'first'}));
 const next=structuredClone(proposal);next.affectedPortionIds=[ids[1]];next.rowPortions[1].terrainDesign.phase=17;
 next.terrain.applied.portionResults[1].design.phase=17;next.terrain.applied.portionResults[1].rows[0].lengthM+=7;
 next.terrain.applied.result.rows=next.terrain.applied.portionResults.flatMap(p=>p.rows);
 next.terrain.applied=createContourEnvelope({project:{...current,rowPortions:next.rowPortions},model,result:next.terrain.applied.result,portionResults:next.terrain.applied.portionResults,validation:{valid:true}});
 current=materialize(current,attachTerrainRestore({project:current,proposal:next,operationId:'B'}));
 const b=structuredClone(current.terrain.applied.portionResults[1]),rawB=structuredClone(current.rowPortions[1]);
 assert.equal(terrainRestoreAvailability({project:current,portionId:ids[0]}).available,true);
 const restore=buildTerrainRestoreProposal({project:current,portionId:ids[0],model});assert.equal(restore.ok,true,restore.message);
 assert.deepEqual(restore.terrain.applied.portionResults.find(p=>p.id===ids[1]),b);
 assert.deepEqual(restore.rowPortions.find(p=>p.id===ids[1]),rawB);
 assert.deepEqual(restore.terrain.applied.portionResults.find(p=>p.id===ids[0]).rows,manual.rows.filter(r=>r.portionId===ids[0]));
 assert.equal(restore.result.quantityBasis,'mixed-certified-bases');assert.equal(readTerrainEnvelope(materialize(current,restore)).terrainStatus,'applied');
});

test('baseline corruption and edited target quantities block restore without mutation',async()=>{
 const {attachTerrainRestore,terrainRestoreAvailability,buildTerrainRestoreProposal}=api();
 const {project,proposal,model,ids}=await conversion();
 const current=materialize(project,attachTerrainRestore({project,proposal,operationId:'first'}));
 for(const mutate of [p=>p.terrain.history.entries[0].before.portions[0].rows[0].lengthM++,p=>p.terrain.applied.portionResults[0].rows[0].lengthM++]){
  const edited=structuredClone(current);mutate(edited);const before=structuredClone(edited);
  assert.equal(terrainRestoreAvailability({project:edited,portionId:ids[0]}).available,false);
  assert.equal(buildTerrainRestoreProposal({project:edited,portionId:ids[0],model}).status,'restore-conflict');assert.deepEqual(edited,before);
 }
});

test('editing only the aggregate target rows cannot evade the local after fingerprint',async()=>{
 const {attachTerrainRestore,terrainRestoreAvailability}=api();
 const {project,proposal,ids,model}=await conversion(),current=materialize(project,attachTerrainRestore({project,proposal,operationId:'first'}));
 current.terrain.applied.result.rows[0].lengthM++;
 current.terrain.applied=createContourEnvelope({project:current,model,result:current.terrain.applied.result,portionResults:current.terrain.applied.portionResults,validation:{valid:true}});
 assert.equal(terrainRestoreAvailability({project:current,portionId:ids[0]}).available,false);
});

test('changed shared context uses the real fresh builder and respects one injected restore budget',async()=>{
 const {attachTerrainRestore,terrainRestoreAvailability,buildTerrainRestoreProposal}=api();
 const {project,proposal,model,ids}=await conversion();
 const current=materialize(project,attachTerrainRestore({project,proposal,operationId:'first'}));current.plantSpacingM=2;
 assert.equal(terrainRestoreAvailability({project:current,portionId:ids[0]}).available,true);
 const before=structuredClone(current);let checks=0;
 const expired={check(){checks++;throw Object.assign(new Error('expired'),{status:'budget-exceeded'});},phase(){},remainingMs:()=>0,timings:()=>({})};
 const restore=buildTerrainRestoreProposal({project:current,portionId:ids[0],model,budget:expired});
 assert.equal(restore.kind,'restore');assert.equal(restore.ok,false);assert.equal(restore.status,'budget-exceeded');assert.equal(restore.result,undefined);assert.ok(checks);assert.deepEqual(current,before);
});

test('changed plant spacing recomputes actual fresh quantities from saved manual reference',async()=>{
 const {attachTerrainRestore,buildTerrainRestoreProposal}=api();
 const {project,proposal,model,ids}=await conversion();
 const current=materialize(project,attachTerrainRestore({project,proposal,operationId:'first'}));
 current.plantSpacingM=4;current.orientationDeg=90;
 const before=structuredClone(current),restore=buildTerrainRestoreProposal({project:current,portionId:ids[0],model});
 assert.equal(restore.ok,true,restore.message);assert.equal(restore.kind,'restore');
 assert.notEqual(restore.result.simulatedPlants,proposal.result.simulatedPlants);
 assert.deepEqual(restore.rowPortions[0].inheritedDesign.rowCurvePoints,project.rowCurvePoints??[]);
 assert.equal(restore.rowPortions[0].inheritedDesign.orientationDeg,project.orientationDeg,'saved manual reference survives shared orientation edits');
 assert.equal(readTerrainEnvelope(materialize(current,restore)).terrainStatus,'applied');assert.deepEqual(current,before);
});

test('a different supplied frozen model returns a fresh restore proposal with its own canonical grid',async()=>{
 const {attachTerrainRestore,buildTerrainRestoreProposal}=api();
 const {project,proposal,ids}=await conversion(),current=materialize(project,attachTerrainRestore({project,proposal,operationId:'first'}));
 const {model}=await fixture((x,y)=>y/4),before=structuredClone(current);
 const restore=buildTerrainRestoreProposal({project:current,portionId:ids[0],model});
 assert.equal(restore.ok,true,restore.message);assert.equal(restore.kind,'restore');assert.equal(restore.terrain.model.contentHash,model.contentHash);
 assert.equal(readTerrainEnvelope(materialize(current,restore)).terrainStatus,'applied');assert.deepEqual(current,before);
 assert.equal(JSON.stringify(restore.terrain).match(/valuesBase64/g).length,1);assert.equal(restore.terrain.history.entries.length,0);
});

test('presentation edits retain availability while every common design input requests recomputation',async()=>{
 const {attachTerrainRestore,terrainRestoreAvailability}=api();
 const {project,proposal,ids}=await conversion(),current=materialize(project,attachTerrainRestore({project,proposal,operationId:'first'}));
 const presentation=structuredClone(current);presentation.rowPortions[0].label='renamed';presentation.rowPortions[0].conflict={display:true};
 assert.equal(terrainRestoreAvailability({project:presentation,portionId:ids[0]}).reason,'exact');
 for(const mutate of [p=>p.rowSpacingM++,p=>p.plantSpacingM++,p=>p.postSpacingM++,p=>p.headlandWidthM++,p=>p.orientationDeg++,p=>p.rowCurvePoints=[{position:.5,offsetM:2}],p=>p.maintainRowEquidistance=false,p=>p.geometry[0][0]+=.00001]){
  const changed=structuredClone(current);mutate(changed);
  assert.deepEqual(terrainRestoreAvailability({project:changed,portionId:ids[0]}),{available:true,reason:'recompute-required',operationId:'first'});
 }
});

test('a foreign raw topology edit requests fresh reconstruction instead of retaining stale foreign rows',async()=>{
 const {attachTerrainRestore,terrainRestoreAvailability}=api();
 const {project,proposal,ids}=await conversion({split:true}),current=materialize(project,attachTerrainRestore({project,proposal,operationId:'first'}));
 current.rowPortions.find(p=>p.id===ids[1]).geometry[0][0][0]+=.00001;
 assert.equal(terrainRestoreAvailability({project:current,portionId:ids[0]}).reason,'recompute-required');
});

test('recursive baselines and altered restore fingerprints fail closed even with a recomputed baseline hash',async()=>{
 const {attachTerrainRestore,terrainRestoreAvailability}=api();
 const {terrainInputHash}=await import('../src/terrain-model.js');
 const {project,proposal,ids}=await conversion(),current=materialize(project,attachTerrainRestore({project,proposal,operationId:'first'}));
 const entry=current.terrain.history.entries[0];entry.before.portions[0].grid={valuesBase64:'duplicate'};
 const {baselineHash:_,...contents}=entry;entry.baselineHash=terrainInputHash(contents);
 assert.equal(terrainRestoreAvailability({project:current,portionId:ids[0]}).available,false);
});

test('old 1.3.0 envelopes cannot manufacture an exact undo',()=>{
 const {terrainRestoreAvailability}=api();
 const historical=JSON.parse(readFileSync(new URL('./fixtures/terrain-v130-applied.json',import.meta.url),'utf8'));
 for(const item of historical.cases){const before=structuredClone(item.project);assert.equal(terrainRestoreAvailability({project:item.project,portionId:item.project.rowPortions[0]?.id}).available,false);assert.deepEqual(item.project,before);assert.deepEqual(readTerrainEnvelope(item.project),item.result);}
});

test('generic cut contract stores one shared baseline and restores every member atomically',async()=>{
 const {attachTerrainRestore,buildTerrainRestoreProposal}=api();
 const {project,proposal,model,ids}=await conversion(),source=materialize(project,attachTerrainRestore({project,proposal,operationId:'first'}));
 source.exclusions.push({id:'older',type:'passage',geometry:project.geometry});
 source.terrain.applied=createContourEnvelope({project:source,model,result:source.terrain.applied.result,portionResults:source.terrain.applied.portionResults,validation:{valid:true}});
 // Public-contract payload only; the actual Task5 geometric producer is pending.
 const cut=structuredClone(proposal);cut.kind='cut';cut.cut={groupId:'new-cut',scopePortionId:ids[0]};
 cut.rowPortions=['child-A','child-B'].map(id=>({...structuredClone(proposal.rowPortions[0]),id}));
 const portions=cut.rowPortions.map(p=>({...structuredClone(proposal.terrain.applied.portionResults[0]),id:p.id,rows:proposal.terrain.applied.portionResults[0].rows.map(row=>({...row,portionId:p.id}))}));
 cut.projectPatch={exclusions:[...source.exclusions,...['part-1','part-2'].map(id=>({id,type:'passage',geometry:project.geometry,passageGroupId:'new-cut',sourceAxis:{coordinates:[[1,2],[3,4]]},widthM:1.5,widthBasis:'model-surface',modelHash:model.contentHash,scopePortionId:ids[0],scopeGeometry:{type:'Polygon',coordinates:[project.geometry]}}))]};
 cut.result={...cut.result,rows:portions.flatMap(p=>p.rows),portions:cut.rowPortions};
 cut.terrain.applied=createContourEnvelope({project:{...source,...cut.projectPatch,rowPortions:cut.rowPortions},model,result:cut.result,portionResults:portions,validation:{valid:true}});
 const current=materialize(source,attachTerrainRestore({project:source,proposal:cut,operationId:'cut'}));
 assert.equal(current.terrain.history.entries.length,1);assert.deepEqual(current.terrain.history.entries[0].affectedIds,[ids[0],'child-A','child-B']);
 for(const id of ['child-A','child-B']){
  const restore=buildTerrainRestoreProposal({project:current,portionId:id,model});assert.equal(restore.ok,true,restore.message);
  assert.deepEqual(restore.projectPatch.exclusions,source.exclusions);assert.deepEqual(restore.rowPortions,source.rowPortions);
  assert.deepEqual(restore.terrain.applied.portionResults,source.terrain.applied.portionResults);assert.equal(restore.terrain.history.entries.length,0);
 }
 for(const mutate of [p=>p.rowPortions[0].orientationDeg++,p=>p.exclusions.at(-1).widthM++,p=>p.exclusions.at(-1).sourceAxis.coordinates[0][0]++,p=>p.exclusions.at(-1).scopeGeometry.coordinates[0][0][0]++]){
  const edited=structuredClone(current);mutate(edited);const before=structuredClone(edited);
  assert.equal(buildTerrainRestoreProposal({project:edited,portionId:'child-A',model}).status,'restore-conflict');assert.deepEqual(edited,before);
 }
});

test('exact saved source-axis and row-operation provenance survives the history copy and envelope rebuild',async()=>{
 const {attachTerrainRestore,buildTerrainRestoreProposal}=api();
 const {axisSourceHash}=await import('../src/terrain-axis-geometry.js');
 const {terrainInputHash}=await import('../src/terrain-model.js');
 const {project,proposal,model,ids}=await conversion();
 const source=materialize(project,proposal),scope={type:'Polygon',coordinates:[project.geometry]},scopeHash=terrainInputHash(scope);
 // Replay integrity fixture; this does not certify its geometric carrier.
 const axis={axisId:'saved-source',portionId:ids[0],levelM:3,ordinal:0,axisGeometryConvention:'source-domain-intersection-1',components:[{coordinatesXY:[[499980,5000003],[500060,5000003]],faceIds:[1,2]}],axisGeometryBinding:{modelHash:model.contentHash,crs:model.crs,scopeHash,originalScopeHash:scopeHash}};
 const design={mode:'adapt',modelHash:model.contentHash,crs:model.crs,axisGeometryConvention:'source-domain-intersection-1',axisScopeGeometry:scope,originalAxisScopeGeometry:scope,axes:[axis]};
 const row={...source.terrain.applied.portionResults[0].rows[0],axisId:axis.axisId,fragmentId:'saved-fragment',coordinateRole:'render-export-preview',axisOperation:{kind:'source-parameter-intervals-1',intervals:[[.3,.7]],sourceHash:axisSourceHash(axis),...axis.axisGeometryBinding}};
 source.rowPortions[0].terrainDesign=design;source.terrain.applied.portionResults[0].design=design;source.terrain.applied.portionResults[0].rows=[row];source.terrain.applied.result.rows=[row];
 source.terrain.applied=createContourEnvelope({project:source,model,result:source.terrain.applied.result,portionResults:source.terrain.applied.portionResults,validation:{valid:true}});
 assert.equal(readTerrainEnvelope(source).terrainStatus,'applied');
 const next=structuredClone(proposal),current=materialize(source,attachTerrainRestore({project:source,proposal:next,operationId:'replace-source'}));
 const restore=buildTerrainRestoreProposal({project:current,portionId:ids[0],model});assert.equal(restore.ok,true,restore.message);
 assert.deepEqual(restore.terrain.applied.portionResults,source.terrain.applied.portionResults);assert.deepEqual(restore.rowPortions,source.rowPortions);
 assert.equal(readTerrainEnvelope(materialize(current,restore)).terrainStatus,'applied');
 assert.equal(JSON.stringify(current.terrain).match(/valuesBase64/g).length,1);
});
