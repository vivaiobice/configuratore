function clone(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function defaultId() {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure project identity unavailable');
  return globalThis.crypto.randomUUID();
}

function nowIso(now) {
  const value = typeof now === 'function' ? now() : new Date().toISOString();
  return value instanceof Date ? value.toISOString() : String(value);
}

function campaignYear(savedAt, fallbackIso) {
  const saved = new Date(savedAt);
  const fallback = new Date(fallbackIso);
  const year = Number.isFinite(saved.getTime()) ? saved.getUTCFullYear() : fallback.getUTCFullYear();
  return year >= 2000 && year <= 2100 ? year : fallback.getUTCFullYear();
}

function migrateState(state, savedAt, idFactory, now) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('Draft state is invalid');
  const next = clone(state);
  const project = next.project && typeof next.project === 'object' ? next.project : {};
  const cloud = next.cloud && typeof next.cloud === 'object' ? next.cloud : {};
  const clientProjectId = cloud.clientProjectId || project.localProjectId || idFactory();
  const timestamp = nowIso(now);
  next.project = {
    ...project,
    localProjectId:project.localProjectId || clientProjectId,
    campaignYear:Number.isInteger(Number(project.campaignYear))
      && Number(project.campaignYear) >= 2000 && Number(project.campaignYear) <= 2100
      ? Number(project.campaignYear) : campaignYear(savedAt,timestamp),
    origin:project.origin === 'fieldarea' ? 'fieldarea' : 'native'
  };
  next.cloud = {
    ...cloud,
    clientProjectId,
    version:Number(cloud.version) || 0,
    ...(cloud.ownerUserId ? { identityReconciliationRequired:true } : {})
  };
  return next;
}

export function migrateDraftEnvelope(envelope, idFactory = defaultId, now = () => new Date().toISOString()) {
  if (!envelope || ![1,2].includes(envelope.version)) throw new TypeError('Unsupported draft envelope version');
  const savedAt = envelope.savedAt || nowIso(now);
  return {
    ...clone(envelope),
    version:2,
    savedAt,
    state:migrateState(envelope.state,savedAt,idFactory,now)
  };
}

export function migrateProjectArchive(envelope, idFactory = defaultId, now = () => new Date().toISOString()) {
  if (!envelope || ![1,2].includes(envelope.version) || !Array.isArray(envelope.projects)) {
    throw new TypeError('Project archive is invalid or unsupported');
  }
  return {
    ...clone(envelope),
    version:2,
    projects:envelope.projects.map((item) => {
      if (!item?.project || !Array.isArray(item.project.fields)) throw new TypeError('Project archive item is invalid');
      const state = migrateState({ project:item.project, cloud:item.cloud },item.savedAt,idFactory,now);
      return { ...clone(item), project:state.project, cloud:state.cloud };
    })
  };
}
