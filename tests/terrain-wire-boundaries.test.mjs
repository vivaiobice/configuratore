import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackend} from '../src/backend.js?v=1.3.9';
import {createAdminService} from '../admin/admin-service.js?v=1.3.9';
import {packTerrainRowMirror} from '../src/terrain-row-mirror.js?v=1.3.9';

const backendFor=value=>createBackend({rpc:async()=>({data:value,error:null})});
function serviceFor(projects){
 const query={select(){return this;},order(){return this;},limit:async()=>({data:projects,error:null})};
 return createAdminService({from:()=>query});
}
const row=()=>({coordinates:[[9,45],[9.01,45.01]],portionId:'p'});
function compactField(id,note=''){
 const r={...row(),note};
 const field={id,label:id,terrain:{applied:{result:{rows:[r]},portionResults:[{id:'p',rows:[r]}]}}};
 return {logical:field,wire:packTerrainRowMirror(field)};
}

for(const boundary of ['claim','administration'])test(`${boundary} HTTP boundary rejects oversized new wire fields`,async()=>{
 const {wire}=compactField('oversized');wire.label='x'.repeat(1100000);
 const payload={id:'p',name:'Project',field_plans:[wire],metadata:'preserved'};
 const read=boundary==='claim'?()=>backendFor(payload).claimProject('VO-1234567','token'):()=>serviceFor([payload]).loadProjects();
 await assert.rejects(read,/1 MiB/);
});

test('claim and administration preserve legacy fields and valid independent wire projects',async()=>{
 const legacy={id:'legacy',label:'x'.repeat(1100000),terrain:{model:{contentHash:'legacy'}}};
 const {wire,logical}=compactField('compact','x'.repeat(650000));
 const incomplete={id:'unfinished',geometry:null},payload={id:'p',name:'Project',field_plans:[wire,incomplete],metadata:'preserved'};
 const claimed=await backendFor(payload).claimProject('VO-1234567','token');
 assert.ok(JSON.stringify(claimed)===JSON.stringify({...payload,field_plans:[logical,incomplete]}));assert.ok(wire.terrain.rowMirrorStorage);
 const old={id:'legacy-project',field_plans:[legacy]};assert.deepEqual(await backendFor(old).claimProject('VO-1234567','token'),old);
 const projects=[old,...Array.from({length:7},(_,i)=>({...payload,id:'project-'+i}))];
 assert.ok(new TextEncoder().encode(JSON.stringify(projects)).length>4*1024*1024);
 assert.deepEqual(await serviceFor(projects).loadProjects(),projects);
});
