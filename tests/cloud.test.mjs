import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudService } from '../src/cloud.js';

function fakeBackend() {
  const calls = [];
  return {
    calls,
    async ensureAnonymousSession(){ calls.push(['auth']); return { user:{ id:'u1', is_anonymous:true } }; },
    async upsertVisitor(row){ calls.push(['visitor',row]); return { id:'v1' }; },
    async upsertSession(row){ calls.push(['session',row]); return { id:row.id }; },
    async upsertProject(row){ calls.push(['project',row]); return { id:row.id ?? 'p1', public_code:'VO-123', status:row.status }; },
    async saveContact(contact, options){ calls.push(['contact',contact,options]); return { id:'c1' }; },
    async requestQuote(row){ calls.push(['quote',row]); return { id:'q1', status:'new' }; },
    async recordEvent(row){ calls.push(['event',row]); return true; }
  };
}

const state = { environment:'TEST', project:{ geometry:null, rowSpacingM:2.5, plantSpacingM:1, orientationDeg:0 }, contact:null };
const metrics = { areaM2:1000, commercialPlants25:400 };

test('cloud service initializes anonymous ownership and stores every session', async () => {
  const backend = fakeBackend();
  const cloud = createCloudService({ backend, sessionId:'s1', environment:'TEST', consentState:'necessary', referrer:'https://vivaiobice.com' });
  const snapshot = await cloud.initialize();
  assert.equal(snapshot.ownerUserId, 'u1');
  assert.equal(snapshot.ownerKind, 'guest');
  const sessionCall = backend.calls.find(([name]) => name === 'session');
  assert.equal(sessionCall[1].id, 's1');
  assert.equal(sessionCall[1].consent_state, 'necessary');
});

test('cloud identity classifies permanent and admin users from protected app metadata', async () => {
  const userBackend = fakeBackend();
  userBackend.ensureAnonymousSession = async () => ({ user:{ id:'u2', is_anonymous:false, app_metadata:{} } });
  const user = await createCloudService({ backend:userBackend, sessionId:'s-user' }).initialize();
  assert.equal(user.ownerKind, 'user');

  const adminBackend = fakeBackend();
  adminBackend.ensureAnonymousSession = async () => ({
    user:{ id:'u3', is_anonymous:false, app_metadata:{ role:'admin' }, user_metadata:{ role:'user' } }
  });
  const admin = await createCloudService({ backend:adminBackend, sessionId:'s-admin' }).initialize();
  assert.equal(admin.ownerKind, 'admin');
});

test('cloud service saves contact then links it to the project', async () => {
  const backend = fakeBackend();
  const cloud = createCloudService({ backend, sessionId:'s1', environment:'TEST', consentState:'necessary' });
  const contact = { companyName:'Vivai Obice', firstName:'Marco', lastName:'Obice', phone:'333', email:'marco@example.it' };
  const result = await cloud.saveContactAndProject({ ...state, contact }, metrics, contact);
  assert.equal(result.contactId, 'c1');
  assert.equal(result.projectId, 'p1');
  const projectCall = backend.calls.filter(([name]) => name === 'project').at(-1);
  assert.equal(projectCall[1].contact_id, 'c1');
  assert.equal(projectCall[1].status, 'saved');
});

test('cloud service creates quote request and moves project status to quote_requested', async () => {
  const backend = fakeBackend();
  const cloud = createCloudService({ backend, sessionId:'s1', environment:'TEST', consentState:'necessary' });
  const contact = { companyName:'Vivai Obice', firstName:'Marco', lastName:'Obice', phone:'333', email:'marco@example.it' };
  await cloud.saveContactAndProject({ ...state, contact }, metrics, contact);
  const result = await cloud.requestQuote({ ...state, contact }, metrics, 'Richiamatemi');
  assert.equal(result.quoteRequestId, 'q1');
  const quoteCall = backend.calls.find(([name]) => name === 'quote');
  assert.equal(quoteCall[1].project_id, 'p1');
  assert.equal(quoteCall[1].contact_id, 'c1');
  const projectCall = backend.calls.filter(([name]) => name === 'project').at(-1);
  assert.equal(projectCall[1].status, 'quote_requested');
});


test('analytics consent creates a persistent visitor and links it to the session', async () => {
  const backend = fakeBackend();
  const cloud = createCloudService({ backend, sessionId:'s1', environment:'TEST', consentState:'analytics' });
  const snapshot = await cloud.initialize();
  assert.equal(snapshot.visitorId, 'v1');
  const visitorCall = backend.calls.find(([name]) => name === 'visitor');
  assert.equal(visitorCall[1].owner_user_id, 'u1');
  const sessionCall = backend.calls.find(([name]) => name === 'session');
  assert.equal(sessionCall[1].visitor_id, 'v1');
  assert.equal(sessionCall[1].consent_state, 'analytics');
});

test('first cloud save creates a secure resume token and stores only its hash', async () => {
  const backend = fakeBackend();
  const cloud = createCloudService({ backend, sessionId:'s1', environment:'TEST', consentState:'necessary', resumeBaseUrl:'https://progetta.vivaiobice.com/' });
  const result = await cloud.saveProject(state, metrics);
  assert.match(result.resumeToken, /^[A-Za-z0-9_-]{40,}$/);
  assert.match(result.resumeUrl, /^https:\/\/progetta\.vivaiobice\.com\/\?project=VO-123&token=/);
  const projectCall = backend.calls.find(([name]) => name === 'project');
  assert.match(projectCall[1].resume_token_hash, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(projectCall[1], 'resume_token'), false);
});

test('resume request claims the project and returns a restored client state', async () => {
  const backend = fakeBackend();
  backend.claimProject = async (publicCode, token) => {
    backend.calls.push(['claim', publicCode, token]);
    return { id:'p9', public_code:publicCode, contact_id:'c9', environment:'TEST', source_type:'manual', cadastral_refs:[], geometry:null, row_spacing_m:2.8, plant_spacing_m:0.9, row_orientation_deg:90, mechanization:{} };
  };
  backend.loadContact = async (id) => ({ id, company_name:'Vigna SRL', first_name:'Luca', last_name:'B', phone:'123', email:'luca@example.it', marketing_consent:false });
  const cloud = createCloudService({ backend, sessionId:'s1', environment:'TEST', consentState:'necessary', resumeBaseUrl:'https://progetta.vivaiobice.com/', resumeRequest:{ publicCode:'CODE9', token:'secret' } });
  const result = await cloud.initialize();
  assert.equal(result.projectId, 'p9');
  assert.equal(result.restoredState.project.rowSpacingM, 2.8);
  assert.equal(result.restoredState.contact.companyName, 'Vigna SRL');
});

test('cloud service reuses locally persisted cloud identifiers instead of creating a duplicate project', async () => {
  const backend = fakeBackend();
  const cloud = createCloudService({
    backend,
    sessionId:'s2',
    environment:'TEST',
    consentState:'necessary',
    resumeBaseUrl:'https://progetta.vivaiobice.com/',
    initialCloud:{ projectId:'p-existing', publicCode:'VO-OLD', contactId:'c-existing', resumeToken:'existing-secret' }
  });
  const result = await cloud.saveProject({ ...state, contact:{ companyName:'A' } }, metrics);
  assert.equal(result.projectId, 'p-existing');
  assert.equal(result.contactId, 'c-existing');
  assert.equal(result.publicCode, 'VO-123');
  const projectCall = backend.calls.find(([name]) => name === 'project');
  assert.equal(projectCall[1].id, 'p-existing');
  assert.equal(projectCall[1].contact_id, 'c-existing');
});

test('cloud analytics records funnel events but strips GPS coordinates', async () => {
  const backend = fakeBackend();
  const cloud = createCloudService({ backend, sessionId:'s1', environment:'TEST', consentState:'necessary' });
  await cloud.trackEvent('gps_used', { latitude:44.7, longitude:8.2, accuracy:5, source:'button' });
  const event = backend.calls.find(([name]) => name === 'event')[1];
  assert.equal(event.event_type, 'gps_used');
  assert.deepEqual(event.event_payload, { source:'button' });
  assert.equal(event.visitor_id, null);
});

test('accepting analytics during the session creates visitor identity and updates subsequent events', async () => {
  const backend = fakeBackend();
  const cloud = createCloudService({ backend, sessionId:'s1', environment:'TEST', consentState:'necessary' });
  await cloud.initialize();
  const snapshot = await cloud.updateConsent('analytics');
  assert.equal(snapshot.visitorId, 'v1');
  await cloud.trackEvent('orientation_changed', { degrees:45 });
  const event = backend.calls.filter(([name]) => name === 'event').at(-1)[1];
  assert.equal(event.visitor_id, 'v1');
  assert.deepEqual(event.event_payload, { degrees:45 });
  const session = backend.calls.filter(([name]) => name === 'session').at(-1)[1];
  assert.equal(session.consent_state, 'analytics');
});


test('saving a project explicitly records the project_saved funnel event', async () => {
  const backend = fakeBackend();
  const cloud = createCloudService({ backend, sessionId:'s1', environment:'TEST', consentState:'necessary' });
  await cloud.saveProject(state, metrics, { status:'saved' });
  const event = backend.calls.filter(([name]) => name === 'event').find(([, row]) => row.event_type === 'project_saved');
  assert.ok(event);
  assert.equal(event[1].project_id, 'p1');
});

test('signed-in owner projects hydrate the local archive without deleting local-only drafts', async () => {
  const cloudModule=await import('../src/cloud.js');
  assert.equal(typeof cloudModule.hydrateOwnedProjects,'function');
  const data=new Map();
  const storage={getItem:(key)=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  const {writeLocalProject}=await import('../src/local-projects.js');
  writeLocalProject(storage,{localProjectId:'local-only',fields:[]},'Bozza locale');
  const result=await cloudModule.hydrateOwnedProjects({
    backend:{async listOwnedProjects(owner){assert.equal(owner,'u1');return [{
      id:'server-p1',client_project_id:'00000000-0000-4000-8000-000000000123',name:'Cloud recente',
      environment:'TEST',campaign_year:2026,origin:'native',version:4,latest_revision_number:2,
      updated_at:'2026-09-22T06:00:00.000Z',field_plans:[{id:'f1',geometry:[[8,44],[8.1,44],[8,44.1],[8,44]]}]
    }];}},
    ownerUserId:'u1',storage,currentProject:{fields:[{id:'empty',geometry:null}]}
  });
  assert.equal(result.imported,1);
  assert.equal(result.projects.length,2);
  assert.equal(result.activeProject.name,'Cloud recente');
  assert.equal(result.activeProject.cloud.projectId,'server-p1');
});

test('cloud hydration never replaces a non-empty local draft automatically', async () => {
  const {hydrateOwnedProjects}=await import('../src/cloud.js');
  const data=new Map();
  const storage={getItem:(key)=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  const result=await hydrateOwnedProjects({
    backend:{async listOwnedProjects(){return [{
      id:'server-p1',client_project_id:'00000000-0000-4000-8000-000000000123',name:'Cloud',
      environment:'TEST',field_plans:[{id:'f1',geometry:[[8,44],[8.1,44],[8,44.1],[8,44]]}]
    }];}},ownerUserId:'u1',storage,
    currentProject:{fields:[{id:'local',geometry:[[9,45],[9.1,45],[9,45.1],[9,45]]}]}
  });
  assert.equal(result.activeProject,null);
});

test('selecting an archived project makes the cloud service update that server id', async () => {
  const backend=fakeBackend();
  const cloud=createCloudService({backend,sessionId:'s-select'});
  await cloud.initialize();
  assert.equal(typeof cloud.selectProject,'function');
  cloud.selectProject({projectId:'server-selected',clientProjectId:'client-selected',version:8});
  await cloud.saveProject(state,metrics);
  const projectCall=backend.calls.filter(([name])=>name==='project').at(-1);
  assert.equal(projectCall[1].id,'server-selected');
});
