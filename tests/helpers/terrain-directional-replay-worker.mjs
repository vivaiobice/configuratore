import {parentPort,workerData} from 'node:worker_threads';
import assert from 'node:assert/strict';
import {createTerrainBudget} from '../../src/terrain-budget.js';
import {readTerrainEnvelope} from '../../src/terrain-replay.js';
const {project,proposal,initialNodeCount,expiresAt}=workerData;
const budget=createTerrainBudget({kind:'adapt',initialNodeCount,deadlineMs:Math.max(0,expiresAt-performance.timeOrigin-performance.now())});
try{
 const replay=readTerrainEnvelope({...project,rowPortions:proposal.rowPortions,terrain:proposal.terrain},{budget});
 assert.deepEqual(replay,proposal.result);budget.check();
 parentPort.postMessage({ok:true,usage:budget.usage()});
}catch(error){parentPort.postMessage({ok:false,message:error.message,status:error.status,usage:budget.usage()});}
