import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState} from '../src/state.js';
import {ensureProjectFields} from '../src/fields.js';
import {encodeTerrainHistoryBefore} from '../src/terrain-history-codec.js';
import {terrainInputHash} from '../src/terrain-model.js';
import {hasReportProjectChanges} from '../src/report-project-source.js';
function states(note='x'){
 const before={source:{rowPortionsPresence:'empty',portions:[],referencePortions:[]},portions:[{id:'p',rows:[],quantityBasis:'legacy-planar',note:note.repeat(70000)}],quantityContextFingerprint:'q'};
 const entry={schemaVersion:1,operationId:'x',kind:'adapt',affectedIds:['p'],before,afterFingerprint:'a',contextFingerprint:'c'};entry.baselineHash=terrainInputHash(entry);
 const plain=createInitialState();plain.project=ensureProjectFields({...plain.project,activeFieldId:'f',fields:[{...plain.project.fields[0],id:'f',label:'Synthetic history comparison',geometry:[[9,45],[9.001,45],[9.001,45.001],[9,45]],terrain:{history:{schemaVersion:1,entries:[entry]}}}]});
 const encoded=structuredClone(plain);encoded.project.fields[0].terrain.history={schemaVersion:2,entries:[{...entry,before:encodeTerrainHistoryBefore(before)}]};encoded.project=ensureProjectFields(encoded.project);
 return {plain,encoded};
}
test('PDF update detection compares logical history and keeps the saved representation untouched',()=>{
 const {plain,encoded}=states(),original=structuredClone(encoded);
 assert.equal(hasReportProjectChanges(plain,encoded),false);assert.equal(hasReportProjectChanges(encoded,plain),false);assert.deepEqual(encoded,original);
 assert.equal(hasReportProjectChanges(plain,states('y').encoded),true);
});
