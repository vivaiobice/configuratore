import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const worker=existsSync(new URL('../src/terrain-worker-client.js',import.meta.url))?await import('../src/terrain-worker-client.js'):{};
test('worker adapter terminates canceled work before a late result can resolve',async()=>{
 assert.equal(typeof worker.runTerrainProposal,'function');
 let instance;
 class Worker {constructor(){instance=this;}postMessage(){}terminate(){this.terminated=true;}}
 const controller=new AbortController();const pending=worker.runTerrainProposal({deadlineMs:1000},{signal:controller.signal,WorkerImpl:Worker});controller.abort();
 await assert.rejects(pending,{name:'AbortError'});assert.equal(instance.terminated,true);
});
