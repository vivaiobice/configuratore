import { buildCloudSnapshot } from './cloud-project-model.js?v=1.3.7';
import { createOperation } from './sync-queue.js';
import { summarizeRevisionChanges } from './revision-summary.js?v=1.3.7';

const SUCCESS = new Set(['applied','revision_created']);

export function createProjectSync({
  backend,
  queue,
  getState,
  getMetrics,
  onSnapshot = () => {},
  buildSnapshot = buildCloudSnapshot,
  operationFactory = createOperation,
  idFactory = () => globalThis.crypto.randomUUID(),
  setTimeout: scheduleTimer = globalThis.setTimeout,
  clearTimeout: cancelTimer = globalThis.clearTimeout,
  debounceMs = 1500,
  now = () => new Date()
}) {
  if (!backend || !queue || !getState) throw new TypeError('backend, queue and getState are required');
  const initialCloud = getState()?.cloud ?? {};
  let syncState = {
    state:'local',
    serverVersion:Number(initialCloud.version) || 0,
    projectId:initialCloud.projectId ?? null,
    latestRevisionNumber:Number(initialCloud.latestRevisionNumber) || 0,
    lastError:null
  };
  let timer = null;
  let suspended = false;
  let suspensionReason = null;
  let stateBeforeSuspend = syncState.state;
  let lastRevisionSnapshot = null;
  let operationTail = Promise.resolve();

  function serialize(work) {
    const result = operationTail.then(work, work);
    operationTail = result.catch(() => {});
    return result;
  }

  function publish(extra = {}) {
    const update = {
      projectId:syncState.projectId,
      version:syncState.serverVersion,
      latestRevisionNumber:syncState.latestRevisionNumber,
      syncState:syncState.state,
      ...extra
    };
    onSnapshot(update);
  }

  function currentSnapshot() {
    return buildSnapshot(getState(), getMetrics);
  }

  async function send(operation) {
    syncState = { ...syncState, state:'syncing', lastError:null };
    publish();
    try {
      const response = operation.type === 'manual_revision'
        ? await backend.createProjectRevision({
            operationId:operation.id,
            projectId:operation.payload.projectId ?? syncState.projectId,
            expectedVersion:operation.payload.deferred ? syncState.serverVersion : operation.expectedVersion,
            snapshot:operation.payload.snapshot,
            reason:operation.payload.reason ?? 'manual_save',
            changeSummary:operation.payload.changeSummary ?? {}
          })
        : await backend.applyProjectOperation({
            operationId:operation.id,
            expectedVersion:operation.expectedVersion,
            snapshot:operation.payload
          });

      if (response?.status === 'conflict') {
        syncState = {
          ...syncState,
          state:'conflict',
          serverVersion:Number(response.serverVersion) || syncState.serverVersion,
          serverSnapshot:response.serverSnapshot ?? null,
          lastError:'version_conflict'
        };
        publish();
        return syncState;
      }
      if (!SUCCESS.has(response?.status)) throw new Error(`Unexpected sync response: ${response?.status ?? 'empty'}`);

      await queue.acknowledge(operation.id);
      syncState = {
        ...syncState,
        state:'synced',
        projectId:response.projectId ?? syncState.projectId,
        serverVersion:Number(response.version) || syncState.serverVersion,
        latestRevisionNumber:Number(response.revisionNumber ?? response.latestRevisionNumber)
          || syncState.latestRevisionNumber,
        serverSnapshot:null,
        lastError:null
      };
      publish({ lastSyncedAt:now().toISOString() });
      return syncState;
    } catch (error) {
      await queue.markFailed(operation.id, error?.message || error);
      syncState = { ...syncState, state:'error', lastError:String(error?.message || error) };
      publish();
      return syncState;
    }
  }

  async function flushInternal() {
    if (suspended) return syncState;
    if (timer) {
      cancelTimer(timer);
      timer = null;
    }
    const snapshot = currentSnapshot();
    if (!snapshot.fields.some((field) => field.cloudReady)) return syncState;
    const superseded = (await queue.pending()).filter((item) =>
      item.type === 'autosave' && item.projectClientId === snapshot.clientProjectId
    );
    const operation = operationFactory(
      'autosave', snapshot.clientProjectId, snapshot, syncState.serverVersion, idFactory
    );
    await queue.enqueue(operation);
    const result = await send(operation);
    if (result.state === 'synced') {
      for (const older of superseded) await queue.acknowledge(older.id);
    }
    return result;
  }

  function flush() { return serialize(flushInternal); }

  function enqueueForLater(){return serialize(async()=>{
    if(suspended)return syncState;
    if(timer){cancelTimer(timer);timer=null;}
    const snapshot=currentSnapshot();
    if(!snapshot.fields.some(field=>field.cloudReady))return syncState;
    const pending=(await queue.pending()).filter(item=>item.type==='autosave'&&item.projectClientId===snapshot.clientProjectId);
    if(pending.length){
      const newest=pending.at(-1);
      if(!newest.attempts)await queue.enqueue({...newest,payload:snapshot});
    }else await queue.enqueue(operationFactory('autosave',snapshot.clientProjectId,snapshot,syncState.serverVersion,idFactory));
    syncState={...syncState,state:'pending'};publish();return syncState;
  });}

  function schedule() {
    if (suspended) return;
    if (timer) cancelTimer(timer);
    timer = scheduleTimer(async () => {
      timer = null;
      await flush();
    }, debounceMs);
  }

  async function retryPendingInternal(projectClientId = null) {
    if (suspended) return syncState;
    for (const operation of await queue.pending()) {
      if (projectClientId && operation.projectClientId !== projectClientId) continue;
      const result = await send(operation);
      if (result.state === 'error' || result.state === 'conflict') break;
    }
    return syncState;
  }

  function retryPending() { return serialize(() => retryPendingInternal()); }

  async function saveRevisionInternal({ reason='manual_save' } = {}) {
    if (suspended) return syncState;
    const snapshotBeforeSave = currentSnapshot();
    if (syncState.state === 'conflict') return syncState;
    if (syncState.state !== 'synced') {
      const recovered = await retryPendingInternal(snapshotBeforeSave.clientProjectId);
      if (recovered.state === 'error' || recovered.state === 'conflict') return recovered;
    }
    const applied = await flushInternal();
    const snapshot = currentSnapshot();
    if (applied.state === 'conflict') return applied;
    if (!lastRevisionSnapshot && applied.projectId && backend.loadLatestProjectRevision) {
      const latest=await backend.loadLatestProjectRevision(applied.projectId);
      lastRevisionSnapshot=latest?.snapshot??null;
    }
    const changeSummary=summarizeRevisionChanges(lastRevisionSnapshot,snapshot);
    if (applied.state === 'error' || !applied.projectId) {
      const deferred = operationFactory(
        'manual_revision', snapshot.clientProjectId,
        { projectId:null, snapshot, reason, changeSummary, deferred:true },
        applied.serverVersion, idFactory
      );
      await queue.enqueue(deferred);
      return applied;
    }
    const operation = operationFactory(
      'manual_revision', snapshot.clientProjectId,
      { projectId:applied.projectId, snapshot, reason, changeSummary },
      applied.serverVersion, idFactory
    );
    await queue.enqueue(operation);
    const result=await send(operation);
    if(result.state==='synced')lastRevisionSnapshot=snapshot;
    return result;
  }

  function saveRevision(options) { return serialize(() => saveRevisionInternal(options)); }

  function suspend(reason='manual') {
    if (!suspended) stateBeforeSuspend=syncState.state;
    suspended=true;suspensionReason=reason;syncState={...syncState,state:'suspended',lastError:reason};
    if(timer){cancelTimer(timer);timer=null;}publish();return syncState;
  }

  function resume(expectedReason=null) {
    if(expectedReason&&(!suspended||suspensionReason!==expectedReason))return syncState;
    suspended=false;suspensionReason=null;
    if(syncState.state==='suspended')syncState={...syncState,state:stateBeforeSuspend==='suspended'?'local':stateBeforeSuspend,lastError:null};
    publish();return syncState;
  }

  function adoptCloudState(cloud = {}) {
    if(timer){cancelTimer(timer);timer=null;}
    suspended=false;suspensionReason=null;
    syncState={
      state:cloud.syncState ?? (cloud.projectId ? 'synced' : 'local'),
      serverVersion:Number(cloud.version) || 0,
      projectId:cloud.projectId ?? null,
      latestRevisionNumber:Number(cloud.latestRevisionNumber) || 0,
      lastError:null
    };
    stateBeforeSuspend=syncState.state;
    lastRevisionSnapshot=null;
    publish();
    return syncState;
  }

  // The report saved the current frozen drawing through a separate scoped sync.
  // Its successful revision covers earlier autosaves, but not manual history.
  function acknowledgeReportAutosaves(projectClientId) { return serialize(async()=>{
    if(!suspended)throw new Error('Report acknowledgement requires a paused editor sync.');
    for(const item of await queue.pending()){
      if(item.type==='autosave'&&item.projectClientId===projectClientId)await queue.acknowledge(item.id);
    }
  }); }

  return {
    acknowledgeReportAutosaves,
    schedule,
    flush,
    enqueueForLater,
    retryPending,
    saveRevision,
    suspend,
    resume,
    adoptCloudState,
    status:() => ({ ...syncState })
  };
}
