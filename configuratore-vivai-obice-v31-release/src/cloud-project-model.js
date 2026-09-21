export const CLOUD_SNAPSHOT_VERSION = 2;

function clone(value) {
  if (value === undefined) return undefined;
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function validCampaignYear(value, now) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : now().getUTCFullYear();
}

function validPosition(position) {
  return Array.isArray(position)
    && Number.isFinite(Number(position[0]))
    && Number.isFinite(Number(position[1]));
}

function isClosedRing(ring) {
  if (!Array.isArray(ring) || ring.length < 4 || !ring.every(validPosition)) return false;
  const first = ring[0];
  const last = ring.at(-1);
  return Number(first[0]) === Number(last[0]) && Number(first[1]) === Number(last[1]);
}

function polygonToWkt(ring) {
  if (!isClosedRing(ring)) return null;
  return `POLYGON((${ring.map(([lon, lat]) => `${Number(lon)} ${Number(lat)}`).join(',')}))`;
}

export function ensureCloudIdentity(state = {}, idFactory = () => globalThis.crypto.randomUUID()) {
  const project = state.project ?? {};
  const existing = state.cloud?.clientProjectId || project.localProjectId;
  const clientProjectId = existing || idFactory();
  return {
    ...state,
    project:{ ...project, localProjectId:project.localProjectId || clientProjectId },
    cloud:{ ...state.cloud, clientProjectId, version:Number(state.cloud?.version) || 0 }
  };
}

export function buildCloudSnapshot(state, getMetrics = () => ({}), { now = () => new Date() } = {}) {
  const normalized = ensureCloudIdentity(state);
  const project = normalized.project;
  const fields = (project.fields ?? []).map((field, index) => ({
    ...clone(field),
    clientFieldId:String(field.clientFieldId || field.id || `field-${index + 1}`),
    cloudReady:isClosedRing(field.geometry),
    metrics:{ ...(getMetrics(field) ?? {}) }
  }));
  return {
    schemaVersion:CLOUD_SNAPSHOT_VERSION,
    clientProjectId:normalized.cloud.clientProjectId,
    projectId:normalized.cloud.projectId ?? null,
    environment:normalized.environment === 'LIVE' ? 'LIVE' : 'TEST',
    name:String(project.localProjectName || 'Il mio impianto').trim() || 'Il mio impianto',
    campaignYear:validCampaignYear(project.campaignYear, now),
    origin:project.origin === 'fieldarea' ? 'fieldarea' : 'native',
    fields
  };
}

export function snapshotToProjectRow(snapshot, ownerUserId, sessionId, ownerKind = 'guest') {
  return {
    client_project_id:snapshot.clientProjectId,
    owner_user_id:ownerUserId,
    last_session_id:sessionId ?? null,
    environment:snapshot.environment === 'LIVE' ? 'LIVE' : 'TEST',
    name:snapshot.name,
    campaign_year:snapshot.campaignYear,
    origin:snapshot.origin === 'fieldarea' ? 'fieldarea' : 'native',
    owner_kind:['guest','user','admin'].includes(ownerKind) ? ownerKind : 'guest',
    updated_at:new Date().toISOString()
  };
}

function fieldDesignData(field) {
  const data = clone(field) ?? {};
  for (const key of ['geometry','exclusions','metrics','clientFieldId','cloudReady']) delete data[key];
  return data;
}

export function snapshotToFieldRows(snapshot, projectId, ownerUserId) {
  return (snapshot.fields ?? []).map((field, index) => ({
    project_id:projectId,
    owner_user_id:ownerUserId,
    client_field_id:field.clientFieldId,
    label:String(field.label || `Campo ${index + 1}`),
    geometry:polygonToWkt(field.geometry),
    exclusions:clone(field.exclusions ?? []),
    design_data:fieldDesignData(field),
    gross_area_m2:Number(field.metrics?.areaM2) || 0,
    net_area_m2:Number(field.metrics?.netAreaM2 ?? field.metrics?.areaM2) || 0,
    simulated_plants:Number(field.metrics?.simulatedPlants) || 0,
    total_posts:Number(field.metrics?.totalPosts) || 0,
    head_posts:Number(field.metrics?.headPosts) || 0,
    display_order:index,
    updated_at:new Date().toISOString()
  }));
}
