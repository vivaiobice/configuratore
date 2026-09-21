import { buildCloudSnapshot } from './cloud-project-model.js';
import { createOperation } from './sync-queue.js';

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
            reason:operation.payload.reason ?? 'manual_save'
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

  async function flush() {
    if (timer) {
      cancelTimer(timer);
      timer = null;
    }
    const snapshot = currentSnapshot();
    if (!snapshot.fields.some((field) => field.cloudReady)) return syncState;
    const operation = operationFactory(
      'autosave', snapshot.clientProjectId, snapshot, syncState.serverVersion, idFactory
    );
    await queue.enqueue(operation);
    return send(operation);
  }

  function schedule() {
    if (timer) cancelTimer(timer);
    timer = scheduleTimer(async () => {
      timer = null;
      await flush();
    }, debounceMs);
  }

  async function retryPending() {
    for (const operation of await queue.pending()) {
      const result = await send(operation);
      if (result.state === 'error' || result.state === 'conflict') break;
    }
    return syncState;
  }

  async function saveRevision() {
    const applied = await flush();
    const snapshot = currentSnapshot();
    if (applied.state === 'conflict') return applied;
    if (applied.state === 'error' || !applied.projectId) {
      const deferred = operationFactory(
        'manual_revision', snapshot.clientProjectId,
        { projectId:null, snapshot, reason:'manual_save', deferred:true },
        applied.serverVersion, idFactory
      );
      await queue.enqueue(deferred);
      return applied;
    }
    const operation = operationFactory(
      'manual_revision', snapshot.clientProjectId,
      { projectId:applied.projectId, snapshot, reason:'manual_save' },
      applied.serverVersion, idFactory
    );
    await queue.enqueue(operation);
    return send(operation);
  }

  return {
    schedule,
    flush,
    retryPending,
    saveRevision,
    status:() => ({ ...syncState })
  };
}
