import {buildCloudSnapshot} from './cloud-project-model.js?v=1.3.4';

function comparable(value) {
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort()
      .filter(key => !['metrics','cloudReady','clientFieldId'].includes(key))
      .map(key => [key,comparable(value[key])]));
  }
  return value;
}

function sameDesign(snapshot,server) {
  return snapshot.clientProjectId === server.client_project_id
    && snapshot.name === server.name
    && snapshot.campaignYear === Number(server.campaign_year)
    && snapshot.origin === server.origin
    && Array.isArray(server.field_plans)
    && JSON.stringify(comparable(snapshot.fields)) === JSON.stringify(comparable(server.field_plans));
}

export async function ensureQuoteRevision({sync,backend,getState,getMetrics}) {
  let revision=await sync.saveRevision();
  if (revision.state !== 'conflict') return revision;
  const state=getState();
  const projectId=revision.projectId ?? state.cloud?.projectId;
  if (!projectId || !backend?.loadEditableProject) return revision;
  const server=await backend.loadEditableProject(projectId);
  const snapshot=buildCloudSnapshot(state,getMetrics);
  if (!sameDesign(snapshot,server)) return revision;
  sync.adoptCloudState({
    ...state.cloud,
    projectId:server.id,
    version:server.version,
    latestRevisionNumber:server.latest_revision_number
  });
  revision=await sync.saveRevision();
  return revision;
}
