import test from 'node:test';
import assert from 'node:assert/strict';
import pako from '../src/vendor/pako.js';
import {encodeTerrainHistoryBefore,decodeTerrainHistoryBefore} from '../src/terrain-history-codec.js';
import {packTerrainRowMirror,hydrateTerrainRows,inspectTerrainRowMirrors} from '../src/terrain-row-mirror.js';
import {serializeTerrainSnapshot,deserializeTerrainSnapshot} from '../src/terrain-serialization.js';
import {ensureProjectFields} from '../src/fields.js';
import {migrateProjectArchive,migrateDraftEnvelope} from '../src/local-migrations.js';
import {buildCloudSnapshot,snapshotToFieldRows} from '../src/cloud-project-model.js';
import {toProjectRow,projectPayloadToState} from '../src/backend.js';
import {summarizeRevisionChanges} from '../src/revision-summary.js';
import {ensureQuoteRevision} from '../src/quote-sync.js';
import {terrainInputHash} from '../src/terrain-model.js';
import {readTerrainRestoreEntries} from '../src/terrain-history.js';

const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
function fieldFixture(){
 const coordinates=Array.from({length:16000},(_,i)=>[9+i*.00000012711111,45+i*.000000231111]);
 const row={coordinates,start:coordinates[0],end:coordinates.at(-1),lengthM:123,portionId:'p'};
 return {id:'f',label:'Synthetic storage fixture',geometry:[[9,45],[9.001,45],[9.001,45.001],[9,45]],rowPortions:[],terrain:{model:{contentHash:'native-unchanged'},applied:{schemaVersion:2,algorithmVersion:'terrain-contour-family-1',inputs:{},result:{rows:[structuredClone(row)],terrainStatus:'applied'},portionResults:[{id:'p',rows:[row]}],inputHash:'input-unchanged',resultHash:'result-unchanged',snapshotHash:'snapshot-unchanged'},history:{schemaVersion:1,entries:[{before:{opaque:'unchanged'}}]}}};
}
const archivedProject=()=>({localProjectId:'fixture',localProjectName:'Synthetic project',campaignYear:2026,origin:'native',activeFieldId:'f',fields:[fieldFixture()]});
const makeEncoded=text=>({codec:'json-deflate-1',plainBytes:new TextEncoder().encode(text).length,data:Buffer.from(pako.deflate(new TextEncoder().encode(text))).toString('base64')});
function historyFixture(size=900000){
 const before={source:{rowPortionsPresence:'empty',portions:[],referencePortions:[]},portions:[{id:'p',rows:[],quantityBasis:'legacy-planar',note:'x'.repeat(size)}],quantityContextFingerprint:'q'};
 const entry={schemaVersion:1,operationId:'x',kind:'adapt',affectedIds:['p'],before,afterFingerprint:'a',contextFingerprint:'c'};
 entry.baselineHash=terrainInputHash(entry);
 return {plain:{schemaVersion:1,entries:[entry]},encoded:{schemaVersion:2,entries:[{...entry,before:encodeTerrainHistoryBefore(before)}]}};
}

test('codec encoding shares the decoder depth limit and checks deadlines during its walk',()=>{
 let tooDeep={text:'x'.repeat(70000)};for(let i=0;i<600;i++)tooDeep={child:tooDeep};
 assert.ok(encodeTerrainHistoryBefore(tooDeep)===tooDeep);
 let boundary={text:'x'.repeat(70000)};for(let i=0;i<511;i++)boundary={child:boundary};
 const encoded=encodeTerrainHistoryBefore(boundary);assert.equal(encoded.codec,'json-deflate-1');assert.deepEqual(decodeTerrainHistoryBefore(encoded),boundary);
 const stop=Object.assign(new Error('expired'),{status:'budget-exceeded'});let checks=0;
 assert.throws(()=>encodeTerrainHistoryBefore({text:'x'.repeat(70000),nested:{child:{value:true}}},{check(){if(++checks===4)throw stop;}}),error=>error===stop);
});

test('project preflight combines plain fields, decoded histories and row mirrors before allocation',()=>{
 const {encoded}=historyFixture();
 const project={fields:Array.from({length:3},(_,i)=>({id:'f'+i,label:'z'.repeat(800000),terrain:{history:encoded}}))};
 assert.ok(bytes(project)<4*1024*1024);
 assert.throws(()=>serializeTerrainSnapshot(project),/4 MiB|bounded snapshot/);
 const raw=JSON.stringify(project);let copies=0;const originalClone=globalThis.structuredClone;
 try{globalThis.structuredClone=(...args)=>{copies++;return originalClone(...args);};assert.throws(()=>deserializeTerrainSnapshot(raw),/4 MiB|bounded snapshot/);assert.equal(copies,0);}finally{globalThis.structuredClone=originalClone;}
 const mixedHistory=historyFixture(550000).encoded;
 const mixed={fields:Array.from({length:3},(_,i)=>({id:'f'+i,terrain:{
  history:mixedHistory,rowMirrorStorage:{schemaVersion:1,convention:'portion-results-order'},
  applied:{result:{},portionResults:[{id:'p',rows:[{note:'x'.repeat(450000),coordinates:[[9,45],[9.01,45.01]]}]}]}
 }}))};
 assert.ok(bytes(mixed)<4*1024*1024);assert.throws(()=>hydrateTerrainRows(mixed),/4 MiB|bounded snapshot/);
});

test('snapshot input checks expired budget and UTF8 wire bytes before JSON parsing',()=>{
 let parses=0;const parse=JSON.parse,stop=Object.assign(new Error('expired'),{status:'budget-exceeded'});
 try{JSON.parse=(...args)=>{parses++;return parse(...args);};assert.throws(()=>deserializeTerrainSnapshot('{"fields":[]}',{budget:{check(){throw stop;}}}),error=>error===stop);assert.equal(parses,0);assert.throws(()=>deserializeTerrainSnapshot(JSON.stringify({terrain:{note:'é'.repeat(2200000)}})),/4 MiB|bounded snapshot/);assert.equal(parses,0);}finally{JSON.parse=parse;}
});

test('snapshot coordinates are charged before parsing without restricting legacy plaintext depth',()=>{
 const text='{"terrain":{"rows":['+'[0,0],'.repeat(500000)+'[0,0]]}}';
 let parses=0;const parse=JSON.parse;
 try{JSON.parse=(...args)=>{parses++;return parse(...args);};assert.throws(()=>deserializeTerrainSnapshot(text),error=>error.status==='budget-exceeded'&&error.budgetReason==='work');assert.equal(parses,0);}finally{JSON.parse=parse;}
 let deep={text:'x'.repeat(70000)};for(let i=0;i<600;i++)deep={child:deep};
 const project={terrain:{history:{schemaVersion:1,entries:[{before:deep}]}}},wire=serializeTerrainSnapshot(project);
 assert.equal(JSON.stringify(deserializeTerrainSnapshot(wire)),JSON.stringify(project));
 const manual={fields:[{id:'manual',note:'x'.repeat(5*1024*1024)}]};
 assert.equal(JSON.stringify(deserializeTerrainSnapshot(serializeTerrainSnapshot(manual))),JSON.stringify(manual));
 const manualWire='{"rows":['+'[0,0],'.repeat(500000)+'[0,0]]}';
 assert.equal(deserializeTerrainSnapshot(manualWire).rows.length,500001);
 let charged=0;deserializeTerrainSnapshot('{"rows":[[0,0],[1,1]]}',{budget:{check:n=>charged+=n??0}});assert.equal(charged,2);
});

test('canonical project preflight omits the active terrain facade exactly like transport',()=>{
 const row={coordinates:[[9,45],[9.01,45.01]],portionId:'p',note:'x'.repeat(650000)};
 const fields=Array.from({length:3},(_,i)=>({id:'f'+i,terrain:{applied:{result:{rows:[row]},portionResults:[{id:'p',rows:[row]}]}}}));
 const plain={fields},facade={fields,activeFieldId:'f0',terrain:fields[0].terrain};
 assert.ok(bytes(plain)<4*1024*1024);const wire=serializeTerrainSnapshot(facade);
 assert.equal(wire,serializeTerrainSnapshot({...plain,activeFieldId:'f0'}));assert.deepEqual(deserializeTerrainSnapshot(wire).fields,fields);
});

test('new wire formats enforce the 1MiB field cap while legacy and expanded runtime fields keep their limits',()=>{
 const legacy={id:'legacy',label:'x'.repeat(1100000),terrain:{model:{contentHash:'h'}}};
 assert.deepEqual(deserializeTerrainSnapshot(JSON.stringify({fields:[legacy]})).fields[0],legacy);
 const history=historyFixture(70000).encoded,newHistory={...legacy,terrain:{...legacy.terrain,history}};
 assert.throws(()=>deserializeTerrainSnapshot(JSON.stringify({fields:[newHistory]})),/1 MiB/);
 const row={coordinates:[[9,45],[9.01,45.01]]},newMirror={...legacy,terrain:{...legacy.terrain,rowMirrorStorage:{schemaVersion:1,convention:'portion-results-order'},applied:{result:{},portionResults:[{id:'p',rows:[row]}]}}};
 assert.throws(()=>deserializeTerrainSnapshot(JSON.stringify({fields:[newMirror]})),/1 MiB/);
 const original=fieldFixture();original.terrain.history=history;
 const wire=serializeTerrainSnapshot({fields:[original]});assert.ok(bytes(JSON.parse(wire).fields[0])<1048576);
 const logical=deserializeTerrainSnapshot(wire);assert.ok(bytes(logical.fields[0])>1048576);
 assert.deepEqual(ensureProjectFields(logical).fields[0].terrain,original.terrain);
 assert.deepEqual(hydrateTerrainRows(logical).fields[0].terrain,original.terrain);
});

test('logical revision and quote equality decode history representation without hiding content changes',async()=>{
 const history=historyFixture(70000),field={id:'f',label:'Storage history fixture',terrain:{history:history.plain}};
 const plain={name:'n',campaignYear:2026,fields:[field]},encoded={...plain,fields:[{...field,terrain:{history:history.encoded}}]};
 assert.deepEqual(summarizeRevisionChanges(plain,encoded).categories,[]);
 assert.equal(readTerrainRestoreEntries({project:encoded.fields[0]}).length,1);
 const changed=structuredClone(history.plain);changed.entries[0].before.portions[0].note='y'.repeat(70000);const {baselineHash,...hashInput}=changed.entries[0];changed.entries[0].baselineHash=terrainInputHash(hashInput);
 const changedEncoded={schemaVersion:2,entries:changed.entries.map(entry=>({...entry,before:encodeTerrainHistoryBefore(entry.before)}))};
 assert.deepEqual(summarizeRevisionChanges(plain,{...plain,fields:[{...field,terrain:{history:changedEncoded}}]}).categories,['terrain']);
 const project={localProjectId:'fixture',localProjectName:'n',campaignYear:2026,origin:'native',activeFieldId:'f',fields:encoded.fields},state={environment:'LIVE',project,cloud:{clientProjectId:'fixture',projectId:'p'}};
 const snapshot=buildCloudSnapshot(state);let attempts=0,adopted=false;
 const result=await ensureQuoteRevision({sync:{saveRevision:async()=>++attempts===1?{state:'conflict',projectId:'p'}:{state:'synced'},adoptCloudState:()=>adopted=true},backend:{loadEditableProject:async()=>({id:'p',client_project_id:'fixture',name:snapshot.name,campaign_year:2026,origin:'native',field_plans:plain.fields,version:2,latest_revision_number:1})},getState:()=>state,getMetrics:()=>({})});
 assert.equal(result.state,'synced');assert.equal(attempts,2);assert.equal(adopted,true);assert.deepEqual(history.encoded,encoded.fields[0].terrain.history);
});

test('large before codec is lossless and charges every decoded coordinate before allocation',()=>{
 const before={source:{presence:'empty'},rows:Array.from({length:4000},(_,i)=>({coordinates:[[9+i/100000,45+i/100000],[9+i/100000,45.001+i/100000]],flag:false}))};
 const encoded=encodeTerrainHistoryBefore(before);assert.equal(encoded.codec,'json-deflate-1');assert.ok(bytes(encoded)<bytes(before));
 let charged=0;const actual=decodeTerrainHistoryBefore(encoded,{check:n=>{charged+=n??0;}});
 assert.deepEqual(actual,before);assert.equal(charged,8000);
 const stop=Object.assign(new Error('budget'),{status:'budget-exceeded'});
 assert.throws(()=>decodeTerrainHistoryBefore(encoded,{check:n=>{if(n)throw stop;}}),error=>error===stop);
});

test('codec refuses lossy values and rejects tampering, truncation, trailing stream and invalid UTF8',()=>{
 for(const before of [{value:-0,text:'a'.repeat(70000)},{value:undefined,text:'a'.repeat(70000)}])assert.equal(encodeTerrainHistoryBefore(before),before);
 const encoded=makeEncoded(JSON.stringify({rows:[[1,2]],text:'é'.repeat(40000)}));
 for(const corrupt of [{...encoded,codec:'unknown'},{...encoded,plainBytes:encoded.plainBytes-1},{...encoded,data:encoded.data.slice(4)},{...encoded,data:Buffer.concat([Buffer.from(encoded.data,'base64'),Buffer.from([0])]).toString('base64')},{...encoded,extra:true}])assert.throws(()=>decodeTerrainHistoryBefore(corrupt),error=>error.status==='invalid-history');
 const hidden={...encoded};Object.defineProperty(hidden,'hidden',{value:true});assert.throws(()=>decodeTerrainHistoryBefore(hidden),error=>error.status==='invalid-history');
 const invalidUtf8={codec:'json-deflate-1',plainBytes:1,data:Buffer.from(pako.deflate(new Uint8Array([255]))).toString('base64')};assert.throws(()=>decodeTerrainHistoryBefore(invalidUtf8),error=>error.status==='invalid-history');
 assert.throws(()=>decodeTerrainHistoryBefore(makeEncoded('{"a":1,"a":2}')),error=>error.status==='invalid-history');
});

test('row mirror keeps exact geometry, hashes and opaque history and precharges the owned copy',()=>{
 const original=fieldFixture(),before=structuredClone(original),packed=packTerrainRowMirror(original);
 assert.deepEqual(packed.terrain.rowMirrorStorage,{schemaVersion:1,convention:'portion-results-order'});assert.equal(Object.hasOwn(packed.terrain.applied.result,'rows'),false);
 let charged=0;const hydrated=hydrateTerrainRows(packed,{budget:{check:n=>charged+=n??0}});
 assert.deepEqual(hydrated,original);assert.deepEqual(original,before);assert.equal(charged,16000);
 assert.notEqual(hydrated.terrain.applied.result.rows,packed.terrain.applied.portionResults[0].rows);
 assert.deepEqual(packed.terrain.history,original.terrain.history);
});

test('strict row mirrors reject mixed markers and refuse typed differences hidden by JSON',()=>{
 const original=fieldFixture(),packed=packTerrainRowMirror(original);
 for(const mutate of [f=>f.terrain.rowMirrorStorage.extra=true,f=>f.terrain.rowMirrorStorage.schemaVersion=2,f=>f.terrain.applied.result.rows=[],f=>delete f.terrain.applied.portionResults[0].rows]){const f=structuredClone(packed);mutate(f);assert.throws(()=>hydrateTerrainRows(f),/Invalid terrain row mirror/);}
 const different=fieldFixture();different.terrain.applied.result.rows[0].lengthM++;assert.equal(packTerrainRowMirror(different),different);
 const negative=fieldFixture();negative.terrain.applied.result.rows[0].coordinates[0][0]=-0;negative.terrain.applied.portionResults[0].rows[0].coordinates[0][0]=-0;assert.equal(packTerrainRowMirror(negative),negative);
});

test('unchanged 1MiB wire gate fits exact rows and expanded hydration has its own bounded preflight',()=>{
 const original=fieldFixture();assert.ok(bytes(original)>1048576);
 assert.throws(()=>serializeTerrainSnapshot(original,{rowMirrors:false}),/1 MiB/);
 const wire=serializeTerrainSnapshot(original);assert.ok(new TextEncoder().encode(wire).length<=1048576);
 assert.deepEqual(deserializeTerrainSnapshot(wire),original);
 const packed=JSON.parse(wire);assert.throws(()=>inspectTerrainRowMirrors(packed,{wireBytes:4*1024*1024}),/4 MiB|bounded snapshot/);
 const oversized={...original,label:'x'.repeat(1048576)};assert.throws(()=>serializeTerrainSnapshot(oversized),/1 MiB/);
});

test('field normalization and archive migration hydrate per project, allowing a multi-project archive',()=>{
 const project=archivedProject(),packed=JSON.parse(serializeTerrainSnapshot(project));
 const expected=ensureProjectFields(project);assert.deepEqual(ensureProjectFields(packed),expected);
 const draft=migrateDraftEnvelope({version:3,savedAt:'2026-10-11T00:00:00Z',state:{project:packed,cloud:{clientProjectId:'fixture'}}});assert.deepEqual(draft.state.project.fields[0].terrain,project.fields[0].terrain);
 const projects=Array.from({length:8},(_,i)=>({id:'fixture-'+i,savedAt:'2026-10-11T00:00:00Z',project:{...packed,localProjectId:'fixture-'+i},cloud:{clientProjectId:'fixture-'+i}}));
 assert.ok(bytes({version:2,projects})>4*1024*1024);
 const archive=migrateProjectArchive({version:2,projects});assert.equal(archive.projects.length,8);for(const item of archive.projects)assert.deepEqual(item.project.fields[0].terrain,project.fields[0].terrain);
});

test('actual cloud row and snapshot carry compact wire fields and logical revisions stay unchanged',()=>{
 const project=archivedProject(),state={environment:'LIVE',project,cloud:{clientProjectId:'fixture'}};
 const snapshot=buildCloudSnapshot(state);assert.ok(snapshot.fields[0].terrain.rowMirrorStorage);assert.ok(bytes(snapshot.fields[0])<1048576);
 const row=toProjectRow(state,{}, {ownerUserId:'owner',sessionId:'session'});assert.ok(row.field_plans[0].terrain.rowMirrorStorage);assert.ok(bytes(row.field_plans[0])<1048576);
 const rows=snapshotToFieldRows(snapshot,'project','owner');assert.ok(rows[0].design_data.terrain.rowMirrorStorage);
 const reloaded=projectPayloadToState({...row,id:'project',name:project.localProjectName,client_project_id:'fixture'});assert.deepEqual(reloaded.project.fields[0].terrain,project.fields[0].terrain);
 const logical={name:'n',campaignYear:2026,fields:project.fields},wire={...logical,fields:snapshot.fields.map(({clientFieldId,cloudReady,metrics,...field})=>field)};
 assert.deepEqual(summarizeRevisionChanges(logical,wire).categories,[]);
});

test('quote conflict recovery compares exact logical design across compact representation',async()=>{
 const project=archivedProject(),state={environment:'LIVE',project,cloud:{clientProjectId:'fixture',projectId:'p'}};const snapshot=buildCloudSnapshot(state);let attempts=0,adopted=false;
 const result=await ensureQuoteRevision({sync:{saveRevision:async()=>++attempts===1?{state:'conflict',projectId:'p'}:{state:'synced'},adoptCloudState:()=>adopted=true},backend:{loadEditableProject:async()=>({id:'p',client_project_id:'fixture',name:snapshot.name,campaign_year:2026,origin:'native',field_plans:project.fields,version:2,latest_revision_number:1})},getState:()=>state,getMetrics:()=>({})});
 assert.equal(result.state,'synced');assert.equal(attempts,2);assert.equal(adopted,true);
});
