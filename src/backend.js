import { ensureProjectFields } from './fields.js';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContact(contact) {
  const required = ['companyName', 'firstName', 'lastName', 'phone', 'email'];
  const missing = required.filter((key) => !String(contact?.[key] ?? '').trim());
  const email = String(contact?.email ?? '').trim();
  const errors = [...missing.map((key) => `${key}:required`)];
  if (email && !EMAIL_RE.test(email)) errors.push('email:invalid');
  return { valid: errors.length === 0, errors };
}



export function toVisitorRow({ ownerUserId, analyticsConsent }) {
  if (!analyticsConsent) throw new TypeError('Analytics consent required');
  return { owner_user_id: ownerUserId, analytics_consent: true };
}

export function toContactRow(contact, { ownerUserId } = {}) {
  const check = validateContact(contact);
  if (!check.valid) throw new TypeError(`Invalid contact: ${check.errors.join(',')}`);
  return {
    owner_user_id: ownerUserId,
    company_name: contact.companyName.trim(),
    first_name: contact.firstName.trim(),
    last_name: contact.lastName.trim(),
    phone: contact.phone.trim(),
    email: contact.email.trim().toLowerCase(),
    privacy_version: contact.privacyVersion ?? 'v1',
    marketing_consent: Boolean(contact.marketingConsent)
  };
}

export function toSessionRow({ sessionId, ownerUserId, environment = 'TEST', analyticsConsent = false, visitorId = null, referrer = '', deviceClass = null }) {
  return {
    id: sessionId,
    owner_user_id: ownerUserId,
    visitor_id: analyticsConsent ? visitorId : null,
    environment,
    referrer: referrer || null,
    device_class: deviceClass,
    consent_state: analyticsConsent ? 'analytics' : 'necessary',
    last_seen_at: new Date().toISOString()
  };
}


export function polygonToWkt(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const coords = ring.map(([lon, lat]) => [Number(lon), Number(lat)]);
  if (coords.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat))) return null;
  const first = coords[0];
  const last = coords.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) coords.push([...first]);
  return `POLYGON((${coords.map(([lon, lat]) => `${lon} ${lat}`).join(',')}))`;
}

export function toProjectRow(state, metrics, { ownerUserId, sessionId, projectId = undefined, contactId = undefined, resumeTokenHash = undefined } = {}) {
  const project = state?.project ?? {};
  const row = {
    owner_user_id: ownerUserId,
    last_session_id: sessionId,
    contact_id: contactId ?? null,
    environment: state?.environment ?? 'TEST',
    status: state?.contact ? 'saved' : 'draft',
    source_type: project.sourceType ?? 'manual',
    cadastral_refs: Array.isArray(project.cadastralRefs) ? project.cadastralRefs : [],
    geometry: polygonToWkt(project.geometry),
    location_label: project.locationLabel || null,
    municipality: project.municipality || null,
    province: project.province || null,
    region: project.region || null,
    gross_area_m2: metrics?.areaM2 ?? 0,
    net_area_m2: metrics?.netAreaM2 ?? metrics?.areaM2 ?? 0,
    perimeter_m: metrics?.perimeterM ?? 0,
    vertex_count: metrics?.vertexCount ?? 0,
    row_spacing_m: project.rowSpacingM ?? null,
    plant_spacing_m: project.plantSpacingM ?? null,
    row_orientation_deg: project.orientationDeg ?? 0,
    headland_width_m: project.headlandWidthM ?? null,
    theoretical_plants: metrics?.theoreticalPlants ?? 0,
    simulated_plants: metrics?.simulatedPlants ?? 0,
    commercial_plants_25: metrics?.commercialPlants25 ?? 0,
    row_count: metrics?.rowCount ?? 0,
    row_linear_m: metrics?.rowLinearM ?? 0,
    post_spacing_m: project.postSpacingM ?? null,
    head_posts: metrics?.headPosts ?? 0,
    intermediate_posts: metrics?.intermediatePosts ?? 0,
    total_posts: metrics?.totalPosts ?? 0,
    mechanization: { vendemmia_meccanica: Boolean(project.mechanizedHarvest) },
    project_context_type: project.projectContextType || null,
    project_context_note: project.projectContextNote || null,
    grape_variety: project.grapeVariety || null,
    rootstock: project.rootstock || null,
    clone_selection: project.cloneSelection || null,
    field_plans: Array.isArray(project.fields) ? project.fields : [],
    active_field_id: project.activeFieldId || null,
    updated_at: new Date().toISOString()
  };
  if (projectId) row.id = projectId;
  if (resumeTokenHash) row.resume_token_hash = resumeTokenHash;
  return row;
}

export function projectPayloadToState(payload, contact = null, { resumeToken = null, resumeUrl = null } = {}) {
  const ring = payload?.geometry?.type === 'Polygon' ? payload.geometry.coordinates?.[0] ?? null : null;
  const restoredContact = contact ? {
    companyName: contact.company_name ?? '',
    firstName: contact.first_name ?? '',
    lastName: contact.last_name ?? '',
    phone: contact.phone ?? '',
    email: contact.email ?? '',
    privacyVersion: contact.privacy_version ?? 'v1',
    marketingConsent: Boolean(contact.marketing_consent)
  } : null;
  const legacyProject = {
      geometry: ring,
      sourceType: payload?.source_type ?? 'manual',
      cadastralRefs: Array.isArray(payload?.cadastral_refs) ? payload.cadastral_refs : [],
      rowSpacingM: payload?.row_spacing_m ?? 2.5,
      plantSpacingM: payload?.plant_spacing_m ?? 0.9,
      orientationDeg: payload?.row_orientation_deg ?? 0,
      orientationLocked: true,
      locationLabel: payload?.location_label ?? '',
      municipality: payload?.municipality ?? '',
      province: payload?.province ?? '',
      region: payload?.region ?? '',
      headlandWidthM: payload?.headland_width_m ?? null,
      postSpacingM: payload?.post_spacing_m ?? 4.5,
      mechanizedHarvest: Boolean(payload?.mechanization?.vendemmia_meccanica),
      projectContextType: payload?.project_context_type ?? 'new_planting',
      projectContextNote: payload?.project_context_note ?? '',
      grapeVariety: payload?.grape_variety ?? '',
      rootstock: payload?.rootstock ?? '',
      cloneSelection: payload?.clone_selection ?? '',
      fields: Array.isArray(payload?.field_plans) && payload.field_plans.length ? payload.field_plans : undefined,
      activeFieldId: payload?.active_field_id ?? undefined
    };
  return {
    environment: payload?.environment ?? 'TEST',
    map: { base: 'satellite', cadastralVisible: false },
    project: ensureProjectFields(legacyProject),
    ...(restoredContact ? { contact: restoredContact } : {}),
    cloud: {
      projectId: payload?.id ?? null,
      publicCode: payload?.public_code ?? null,
      contactId: payload?.contact_id ?? contact?.id ?? null,
      resumeToken,
      resumeUrl
    }
  };
}


export function toQuoteRequestRow({ projectId, contactId, ownerUserId, environment = 'TEST', message = '' }) {
  return {
    project_id: projectId,
    contact_id: contactId,
    owner_user_id: ownerUserId,
    environment,
    message: String(message ?? '').trim() || null,
    status: 'new'
  };
}

export function createBackend(client) {
  if (!client) throw new TypeError('Supabase client required');
  async function rpc(name, args) {
    const result = await client.rpc(name, args);
    if (result.error) throw result.error;
    return result.data;
  }
  return {
    async ensureAnonymousSession() {
      const existing = await client.auth.getSession();
      if (existing?.data?.session?.user) return existing.data.session;
      const signed = await client.auth.signInAnonymously();
      if (signed.error) throw signed.error;
      return signed.data.session;
    },
    async upsertVisitor(row) {
      const result = await client.from('visitors').upsert(row, { onConflict:'owner_user_id' }).select('id').single();
      if (result.error) throw result.error;
      return result.data;
    },
    async upsertSession(row) {
      const result = await client.from('sessions').upsert(row).select('id').single();
      if (result.error) throw result.error;
      return result.data;
    },
    async upsertProfile(row) {
      const result = await client.from('profiles').upsert(row, { onConflict:'user_id' }).select('*').single();
      if (result.error) throw result.error;
      return result.data;
    },
    async getProfile(userId) {
      const result = await client.from('profiles').select('display_name,username,owner_kind').eq('user_id', userId).maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    },
    async setOwnProfile({ displayName, username }) {
      return rpc('set_own_profile', { p_display_name:displayName, p_username:username });
    },
    async createGuestTransferGrant() {
      return rpc('create_guest_transfer_grant', {});
    },
    async consumeGuestTransferGrant(token) {
      return rpc('consume_guest_transfer_grant', { p_token:token });
    },
    async loginByIdentifier({ identifier, password }) {
      const result = await client.functions.invoke('login-by-identifier', { body:{ identifier, password } });
      if (result.error || !result.data?.session) throw result.error ?? new Error('Credenziali non valide');
      return result.data.session;
    },
    async applyProjectOperation({ operationId, expectedVersion, snapshot }) {
      return rpc('apply_project_operation', {
        p_operation_id:operationId,
        p_expected_version:expectedVersion,
        p_snapshot:snapshot
      });
    },
    async createProjectRevision({ operationId, projectId, expectedVersion, snapshot, reason = 'manual_save' }) {
      return rpc('create_project_revision', {
        p_operation_id:operationId,
        p_project_id:projectId,
        p_expected_version:expectedVersion,
        p_snapshot:snapshot,
        p_reason:reason
      });
    },
    async softDeleteProject({ operationId, projectId }) {
      return rpc('soft_delete_project', { p_operation_id:operationId, p_project_id:projectId });
    },
    async restoreProject({ operationId, projectId }) {
      return rpc('restore_project', { p_operation_id:operationId, p_project_id:projectId });
    },
    async restoreProjectRevision({ operationId, projectId, revisionNumber }) {
      return rpc('restore_project_revision', {
        p_operation_id:operationId,
        p_project_id:projectId,
        p_revision_number:revisionNumber
      });
    },
    async upsertProject(row) {
      const result = await client.from('projects').upsert(row).select('id,public_code,status').single();
      if (result.error) throw result.error;
      return result.data;
    },
    async saveContact(contactRow, { ownerUserId } = {}) {
      const result = await client.from('contacts').insert(toContactRow(contactRow, { ownerUserId })).select('id').single();
      if (result.error) throw result.error;
      return result.data;
    },
    async recordEvent(eventRow) {
      const result = await client.from('project_events').insert(eventRow);
      if (result.error) throw result.error;
      return true;
    },
    async requestQuote(row) {
      const result = await client.from('quote_requests').insert(row).select('id,status').single();
      if (result.error) throw result.error;
      return result.data;
    },
    async claimProject(publicCode, token) {
      const data = await rpc('claim_project', { p_public_code: publicCode, p_token: token });
      if (!data) throw new Error('Project resume link is invalid or expired');
      return data;
    },
    async loadContact(id) {
      if (!id) return null;
      const result = await client.from('contacts')
        .select('id,company_name,first_name,last_name,phone,email,privacy_version,marketing_consent')
        .eq('id', id)
        .single();
      if (result.error) throw result.error;
      return result.data;
    }
  };
}

export async function connectSupabase({ url, publishableKey }) {
  if (!url || !publishableKey) return null;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  return createClient(url, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
}
