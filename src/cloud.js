import { projectPayloadToArchiveItem, projectPayloadToState, toProjectRow, toQuoteRequestRow, toSessionRow, toVisitorRow } from './backend.js?v=55';
import { mergeLocalProjects } from './local-projects.js';
import { buildResumeUrl, newResumeToken, sha256Hex } from './resume.js';

function projectHasGeometry(project) {
  return (Array.isArray(project?.geometry) && project.geometry.length >= 3)
    || (Array.isArray(project?.fields) && project.fields.some((field) => Array.isArray(field?.geometry) && field.geometry.length >= 3));
}

export async function hydrateOwnedProjects({ backend, ownerUserId, storage, currentProject, environment = 'TEST' }) {
  if (!backend || !ownerUserId) return { projects:[], imported:0, activeProject:null };
  const payloads = await backend.listOwnedProjects(ownerUserId, environment);
  const importedItems = payloads.map(projectPayloadToArchiveItem);
  const projects = mergeLocalProjects(storage, importedItems);
  return {
    projects,
    imported:importedItems.length,
    activeProject:projectHasGeometry(currentProject) ? null : (importedItems[0] ?? null)
  };
}

export function createCloudService({
  backend,
  sessionId,
  environment = 'TEST',
  consentState = 'necessary',
  referrer = '',
  deviceClass = null,
  resumeBaseUrl = null,
  initialResumeToken = null,
  initialCloud = null,
  resumeRequest = null
}) {
  if (!backend) throw new TypeError('backend required');
  let activeConsentState = consentState;
  let ownerUserId = null;
  let ownerKind = null;
  let projectId = initialCloud?.projectId ?? null;
  let publicCode = initialCloud?.publicCode ?? null;
  let contactId = initialCloud?.contactId ?? null;
  let visitorId = null;
  let resumeToken = initialResumeToken ?? initialCloud?.resumeToken ?? null;
  let resumeUrl = null;
  let restoredState = null;
  let initialized = false;

  function currentResumeUrl() {
    return resumeBaseUrl && publicCode && resumeToken ? buildResumeUrl(resumeBaseUrl, publicCode, resumeToken) : null;
  }

  function snapshot(extra = {}) {
    return { ownerUserId, ownerKind, projectId, publicCode, contactId, visitorId, resumeToken, resumeUrl, restoredState, ...extra };
  }

  async function initialize() {
    if (initialized) return snapshot();
    const session = await backend.ensureAnonymousSession();
    ownerUserId = session?.user?.id ?? null;
    if (!ownerUserId) throw new Error('Anonymous owner unavailable');
    ownerKind = session.user.is_anonymous === true
      ? 'guest'
      : (session.user.app_metadata?.role === 'admin' ? 'admin' : 'user');
    if (typeof backend.upsertProfile === 'function') {
      await backend.upsertProfile({
        user_id:ownerUserId,
        owner_kind:ownerKind,
        last_seen_at:new Date().toISOString()
      });
    }
    if (activeConsentState === 'analytics') {
      const visitor = await backend.upsertVisitor(toVisitorRow({ ownerUserId, analyticsConsent:true }));
      visitorId = visitor.id;
    }
    await backend.upsertSession(toSessionRow({
      sessionId,
      ownerUserId,
      environment,
      analyticsConsent: activeConsentState === 'analytics',
      visitorId,
      referrer,
      deviceClass
    }));

    if (resumeRequest?.publicCode && resumeRequest?.token) {
      const payload = await backend.claimProject(resumeRequest.publicCode, resumeRequest.token);
      projectId = payload.id;
      publicCode = payload.public_code ?? resumeRequest.publicCode;
      contactId = payload.contact_id ?? null;
      resumeToken = resumeRequest.token;
      resumeUrl = currentResumeUrl();
      const contact = contactId ? await backend.loadContact(contactId) : null;
      restoredState = projectPayloadToState(payload, contact, { resumeToken, resumeUrl });
    }

    initialized = true;
    return snapshot();
  }

  function sanitizeEventPayload(eventType, payload = {}) {
    const clean = { ...(payload ?? {}) };
    if (eventType === 'gps_used') {
      for (const key of ['latitude','longitude','lat','lon','lng','accuracy','coords']) delete clean[key];
    }
    return clean;
  }

  async function updateConsent(nextState) {
    if (nextState !== 'necessary' && nextState !== 'analytics') throw new TypeError('Invalid consent state');
    await initialize();
    activeConsentState = nextState;
    if (nextState === 'analytics') {
      const visitor = await backend.upsertVisitor(toVisitorRow({ ownerUserId, analyticsConsent:true }));
      visitorId = visitor.id;
    } else {
      visitorId = null;
    }
    await backend.upsertSession(toSessionRow({
      sessionId,
      ownerUserId,
      environment,
      analyticsConsent: activeConsentState === 'analytics',
      visitorId,
      referrer,
      deviceClass
    }));
    return snapshot();
  }

  async function trackEvent(eventType, payload = {}) {
    await initialize();
    await backend.recordEvent({
      owner_user_id: ownerUserId,
      project_id: projectId,
      session_id: sessionId,
      visitor_id: activeConsentState === 'analytics' ? visitorId : null,
      environment,
      event_type: String(eventType),
      event_payload: sanitizeEventPayload(eventType, payload)
    });
    return true;
  }

  async function saveProject(state, metrics, { status = null } = {}) {
    await initialize();
    if (!resumeToken) resumeToken = newResumeToken();
    const resumeTokenHash = await sha256Hex(resumeToken);
    const row = toProjectRow(state, metrics, { ownerUserId, sessionId, projectId, contactId, resumeTokenHash });
    if (status) row.status = status;
    const saved = await backend.upsertProject(row);
    projectId = saved.id;
    publicCode = saved.public_code ?? publicCode;
    resumeUrl = currentResumeUrl();
    if (status === 'saved') {
      await backend.recordEvent({
        owner_user_id: ownerUserId,
        project_id: projectId,
        session_id: sessionId,
        visitor_id: activeConsentState === 'analytics' ? visitorId : null,
        environment,
        event_type: 'project_saved',
        event_payload: {}
      });
    }
    return snapshot({ status: saved.status ?? row.status });
  }

  async function saveContactAndProject(state, metrics, contact) {
    await initialize();
    const savedContact = await backend.saveContact(contact, { ownerUserId });
    contactId = savedContact.id;
    await saveProject({ ...state, contact }, metrics, { status: 'saved' });
    await backend.recordEvent({
      owner_user_id: ownerUserId,
      project_id: projectId,
      session_id: sessionId,
      visitor_id: visitorId,
      environment,
      event_type: 'contact_completed',
      event_payload: {}
    });
    return snapshot({ status: 'saved' });
  }

  async function requestQuote(state, metrics, message = '') {
    await initialize();
    if (!contactId) throw new Error('Contact required before quote request');
    if (!projectId) await saveProject(state, metrics, { status: 'saved' });
    const quote = await backend.requestQuote(toQuoteRequestRow({ projectId, contactId, ownerUserId, environment, message }));
    await saveProject(state, metrics, { status: 'quote_requested' });
    await backend.recordEvent({
      owner_user_id: ownerUserId,
      project_id: projectId,
      session_id: sessionId,
      visitor_id: visitorId,
      environment,
      event_type: 'quote_requested',
      event_payload: { quote_request_id: quote.id }
    });
    return snapshot({ quoteRequestId: quote.id, status: 'quote_requested' });
  }

  function selectProject(cloud = {}) {
    projectId = cloud.projectId ?? null;
    publicCode = cloud.publicCode ?? null;
    contactId = cloud.contactId ?? null;
    resumeToken = cloud.resumeToken ?? null;
    resumeUrl = cloud.resumeUrl ?? currentResumeUrl();
    restoredState = null;
    return snapshot();
  }

  return { initialize, updateConsent, trackEvent, saveProject, saveContactAndProject, requestQuote, selectProject, snapshot };
}
