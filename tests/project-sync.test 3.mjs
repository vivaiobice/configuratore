import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectSync } from '../src/project-sync.js';
import { createSyncQueue } from '../src/sync-queue.js';

function validField() {
  return { id:'f1', label:'Campo 1', geometry:[[8,44],[8.01,44],[8.01,44.01],[8,44]], orientationDeg:0 };
}

function memoryQueue() {
  const map = new Map();
  return createSyncQueue({
    async put(value){ map.set(value.id,structuredClone(value)); },
    async list(){ return [...map.values()].map((value) => structuredClone(value)); },
    async remove(id){ map.delete(id); },
    async replace(value){ map.set(value.id,structuredClone(value)); }
  });
}

function createHarness({ fields=[validField()], response=null, failFirst=false } = {}) {
  let state = { environment:'TEST', project:{ localProjectId:'00000000-0000-4000-8000-000000000010', fields } };
  let sequence = 0;
  let shouldFail = failFirst;
  const timers = [];
  const queue = memoryQueue();
  const backend = {
    calls:[],
    async applyProjectOperation(args) {
      this.calls.push(['apply',args]);
      if (shouldFail) { shouldFail=false; throw new Error('network'); }
      return response ?? { status:'applied', projectId:'server-p1', version:args.expectedVersion+1, latestRevisionNumber:0 };
    },
    async createProjectRevision(args) {
      this.calls.push(['revision',args]);
      return { status:'revision_created', projectId:args.projectId, version:args.expectedVersion, revisionNumber:1 };
    },
    async loadLatestProjectRevision(projectId) {
      this.calls.push(['load-revision',{projectId}]);
      return { snapshot:{ environment:'TEST',name:'Il mio impianto',campaignYear:2026,fields:[{
        clientFieldId:'f1',id:'f1',label:'Campo 1',geometry:[[8,44],[8.01,44],[8.01,44.01],[8,44]],orientationDeg:0
      }] } };
    }
  };
  const service = createProjectSync({
    backend, queue, getState:() => state, getMetrics:() => ({}),
    idFactory:() => `00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`,
    setTimeout:(fn) => { timers.push(fn); return fn; },
    clearTimeout:(fn) => { const index=timers.indexOf(fn); if (index>=0) timers.splice(index,1); },
    onSnapshot:(cloud) => { state={ ...state, cloud:{ ...state.cloud, ...cloud } }; }
  });
  return {
    service,backend,queue,
    setOrientation(value){ state.project.fields[0].orientationDeg=value; },
    clock:{ async runAll(){ while(timers.length) await timers.shift()(); } }
  };
}

test('no cloud project is created before a valid perimeter exists', async () => {
  const sync = createHarness({ fields:[{ id:'f1', geometry:null }] });
  sync.service.schedule('parameter_changed');
  await sync.clock.runAll();
  assert.equal(sync.backend.calls.length, 0);
});

test('rapid changes collapse into one autosave with the final snapshot', async () => {
  const sync = createHarness();
  sync.service.schedule('orientation_changed');
  sync.setOrientation(90);
  sync.service.schedule('orientation_changed');
  await sync.clock.runAll();
  const applies = sync.backend.calls.filter(([type]) => type === 'apply');
  assert.equal(applies.length, 1);
  assert.equal(applies[0][1].snapshot.fields[0].orientationDeg, 90);
});

test('ambiguous failure retries the same id and does not create a duplicate', async () => {
  const sync = createHarness({ failFirst:true });
  sync.service.schedule('geometry_changed');
  await sync.clock.runAll();
  assert.equal(sync.service.status().state, 'error');
  await sync.service.retryPending();
  const ids = sync.backend.calls.filter(([type]) => type === 'apply').map(([,args]) => args.operationId);
  assert.deepEqual(ids, [ids[0],ids[0]]);
  assert.equal((await sync.queue.pending()).length, 0);
});

test('server version conflict is retained for recovery and never overwritten', async () => {
  const sync = createHarness({ response:{ status:'conflict', serverVersion:8 } });
  sync.service.schedule('geometry_changed');
  await sync.clock.runAll();
  assert.equal(sync.service.status().state, 'conflict');
  assert.equal(sync.service.status().serverVersion, 8);
  assert.equal((await sync.queue.pending()).length, 1);
});

test('manual save applies current state before creating one immutable revision', async () => {
  const sync = createHarness();
  const result = await sync.service.saveRevision();
  assert.equal(result.state, 'synced');
  assert.deepEqual(sync.backend.calls.map(([type]) => type), ['apply','load-revision','revision']);
  assert.equal(sync.backend.calls[2][1].expectedVersion, 1);
  assert.equal(sync.service.status().latestRevisionNumber, 1);
});

test('report issue revision records its reason, author-ready summary and affected field', async () => {
  const sync=createHarness();
  sync.setOrientation(90);
  const result=await sync.service.saveRevision({reason:'report_issue'});
  assert.equal(result.state,'synced');
  const revision=sync.backend.calls.find(([type])=>type==='revision')[1];
  assert.equal(revision.reason,'report_issue');
  assert.deepEqual(revision.changeSummary,{
    categories:['layout'],fieldIds:['f1'],label:'Sesto d’impianto'
  });
});

test('version conflict prevents report issue revision creation', async () => {
  const sync=createHarness({response:{status:'conflict',serverVersion:8}});
  const result=await sync.service.saveRevision({reason:'report_issue'});
  assert.equal(result.state,'conflict');
  assert.equal(sync.backend.calls.some(([type])=>type==='revision'),false);
});

test('offline Save survives a restart and creates exactly one revision when connectivity returns', async () => {
  const records = new Map();
  const queue = createSyncQueue({
    async put(value){ records.set(value.id,structuredClone(value)); },
    async list(){ return [...records.values()].map((value) => structuredClone(value)); },
    async remove(id){ records.delete(id); },
    async replace(value){ records.set(value.id,structuredClone(value)); }
  });
  const state = {
    environment:'TEST',
    project:{ localProjectId:'00000000-0000-4000-8000-000000000099', fields:[validField()] }
  };
  const applied = new Map();
  const revised = new Map();
  let online = false;
  let sequence = 0;
  const backend = {
    projects:0,
    revisions:0,
    async applyProjectOperation(args) {
      if (!applied.has(args.operationId)) {
        this.projects = 1;
        applied.set(args.operationId,{ status:'applied',projectId:'server-offline-1',version:1,latestRevisionNumber:0 });
      }
      if (!online) throw new Error('network_after_commit');
      return applied.get(args.operationId);
    },
    async createProjectRevision(args) {
      if (!revised.has(args.operationId)) {
        this.revisions += 1;
        revised.set(args.operationId,{ status:'revision_created',projectId:args.projectId,version:args.expectedVersion,revisionNumber:1 });
      }
      return revised.get(args.operationId);
    }
  };
  const options = {
    backend,queue,getState:() => state,getMetrics:() => ({}),
    idFactory:() => `00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`,
    onSnapshot:(cloud) => { state.cloud={ ...state.cloud,...cloud }; }
  };

  const beforeRestart = createProjectSync(options);
  const offlineResult = await beforeRestart.saveRevision();
  assert.equal(offlineResult.state,'error');
  assert.deepEqual((await queue.pending()).map((operation) => operation.type),['autosave','manual_revision']);

  online = true;
  const afterRestart = createProjectSync(options);
  const recovered = await afterRestart.retryPending();

  assert.equal(recovered.state,'synced');
  assert.equal(backend.projects,1);
  assert.equal(backend.revisions,1);
  assert.equal((await queue.pending()).length,0);
});

test('suspended sync does not flush Guest operations until identity transfer resumes it',async()=>{
  const harness=createHarness();harness.service.suspend('identity_transfer');
  const blocked=await harness.service.flush();
  assert.equal(blocked.state,'suspended');assert.equal((await harness.queue.pending()).length,0);assert.equal(harness.backend.calls.length,0);
  harness.service.resume();assert.notEqual(harness.service.status().state,'suspended');
});

test('adopting an archived cloud project preserves its id and server version on the next sync',async()=>{
  const harness=createHarness();
  assert.equal(typeof harness.service.adoptCloudState,'function');
  harness.service.adoptCloudState({projectId:'server-selected',version:8,latestRevisionNumber:3});
  assert.equal(harness.service.status().projectId,'server-selected');
  assert.equal(harness.service.status().serverVersion,8);
  await harness.service.flush();
  const apply=harness.backend.calls.find(([type])=>type==='apply');
  assert.equal(apply[1].expectedVersion,8);
});
