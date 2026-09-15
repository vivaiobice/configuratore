import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContact, toProjectRow, toSessionRow } from '../src/backend.js';

test('validateContact requires company, first name, last name, phone and valid email', () => {
  assert.equal(validateContact({ companyName:'Vivai Obice', firstName:'Marco', lastName:'Obice', phone:'3331234567', email:'marco@example.it' }).valid, true);
  assert.equal(validateContact({ companyName:'', firstName:'Marco', lastName:'Obice', phone:'3331234567', email:'marco@example.it' }).valid, false);
  assert.equal(validateContact({ companyName:'Vivai Obice', firstName:'Marco', lastName:'Obice', phone:'3331234567', email:'not-an-email' }).valid, false);
});

test('toSessionRow never includes visitor identity without analytics consent', () => {
  const row = toSessionRow({ sessionId:'s1', ownerUserId:'u1', environment:'TEST', analyticsConsent:false, visitorId:'v1', referrer:'https://vivaiobice.com' });
  assert.equal(row.owner_user_id, 'u1');
  assert.equal(row.visitor_id, null);
  assert.equal(row.consent_state, 'necessary');
});

test('toSessionRow keeps visitor identity with analytics consent', () => {
  const row = toSessionRow({ sessionId:'s1', ownerUserId:'u1', environment:'TEST', analyticsConsent:true, visitorId:'v1', referrer:'' });
  assert.equal(row.visitor_id, 'v1');
  assert.equal(row.consent_state, 'analytics');
});

test('toProjectRow separates geometry and computed project metrics', () => {
  const state = {
    environment:'TEST',
    project:{
      geometry:[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]],
      sourceType:'cadastral', cadastralRefs:[{id:'CP.123',reference:'CN_F12_345'}], rowSpacingM:2.5, plantSpacingM:1, orientationDeg:45,
      postSpacingM:4.5, headlandWidthM:8, mechanizedHarvest:true,
      locationLabel:'Santo Stefano Belbo, Cuneo, Piemonte', municipality:'Santo Stefano Belbo', province:'Cuneo', region:'Piemonte',
      projectContextType:'tender', projectContextNote:'Bando regionale', grapeVariety:'Barbera', rootstock:'Consigliami', cloneSelection:''
    }
  };
  const metrics = { areaM2:1000, perimeterM:140, vertexCount:4, theoreticalPlants:400, simulatedPlants:390, commercialPlants25:400, rowCount:20, rowLinearM:3900, headPosts:40, intermediatePosts:820, totalPosts:860 };
  const row = toProjectRow(state, metrics, { ownerUserId:'u1', sessionId:'s1' });
  assert.equal(row.owner_user_id, 'u1');
  assert.equal(row.row_spacing_m, 2.5);
  assert.equal(row.simulated_plants, 390);
  assert.equal(row.environment, 'TEST');
  assert.equal(row.mechanization.vendemmia_meccanica, true);
  assert.equal(row.geometry, 'POLYGON((8 44,8.01 44,8.01 44.01,8 44.01,8 44))');
  assert.deepEqual(row.cadastral_refs, [{id:'CP.123',reference:'CN_F12_345'}]);
  assert.equal(row.municipality, 'Santo Stefano Belbo');
  assert.equal(row.province, 'Cuneo');
});

test('toQuoteRequestRow carries project/contact ownership and TEST environment', async () => {
  const { toQuoteRequestRow } = await import('../src/backend.js');
  const row = toQuoteRequestRow({ projectId: 'p1', contactId: 'c1', ownerUserId: 'u1', environment: 'TEST', message: 'Vorrei essere ricontattato.' });
  assert.deepEqual(row, {
    project_id: 'p1', contact_id: 'c1', owner_user_id: 'u1', environment: 'TEST', message: 'Vorrei essere ricontattato.', status: 'new'
  });
});

test('toContactRow maps required contact fields and technical owner without exposing secrets', async () => {
  const { toContactRow } = await import('../src/backend.js');
  const row = toContactRow({ companyName:' Vivai Obice ', firstName:' Marco ', lastName:' Obice ', phone:' 333 ', email:' TEST@EXAMPLE.IT ', privacyVersion:'v1', marketingConsent:true }, { ownerUserId:'u1' });
  assert.deepEqual(row, { owner_user_id:'u1', company_name:'Vivai Obice', first_name:'Marco', last_name:'Obice', phone:'333', email:'test@example.it', privacy_version:'v1', marketing_consent:true });
});

test('toProjectRow links saved contact when supplied', () => {
  const state = { environment:'TEST', contact:{ companyName:'A' }, project:{ geometry:null, rowSpacingM:2.5, plantSpacingM:1 } };
  const row = toProjectRow(state, {}, { ownerUserId:'u1', sessionId:'s1', contactId:'c1' });
  assert.equal(row.contact_id, 'c1');
  assert.equal(row.status, 'saved');
});

test('toVisitorRow is created only for explicit analytics consent', async () => {
  const { toVisitorRow } = await import('../src/backend.js');
  assert.deepEqual(toVisitorRow({ ownerUserId:'u1', analyticsConsent:true }), { owner_user_id:'u1', analytics_consent:true });
  assert.throws(() => toVisitorRow({ ownerUserId:'u1', analyticsConsent:false }), /analytics consent/i);
});

test('toProjectRow stores only the resume token hash when supplied', () => {
  const row = toProjectRow({ environment:'TEST', project:{} }, {}, { ownerUserId:'u1', sessionId:'s1', resumeTokenHash:'abc123' });
  assert.equal(row.resume_token_hash, 'abc123');
  assert.equal(Object.hasOwn(row, 'resume_token'), false);
});

test('projectPayloadToState restores editable project fields and contact', async () => {
  const { projectPayloadToState } = await import('../src/backend.js');
  const payload = {
    id:'p1', public_code:'CODE1', environment:'TEST', source_type:'cadastral', cadastral_refs:[{id:'CP.1'}],
    geometry:{type:'Polygon',coordinates:[[[8,44],[8.01,44],[8,44.01],[8,44]]]},
    row_spacing_m:2.5, plant_spacing_m:1, row_orientation_deg:45, headland_width_m:8, post_spacing_m:4.5,
    mechanization:{vendemmia_meccanica:true}, project_context_type:'tender', project_context_note:'Bando',
    location_label:'Santo Stefano Belbo, Cuneo', municipality:'Santo Stefano Belbo', province:'Cuneo', region:'Piemonte',
    grape_variety:'Barbera', rootstock:'1103P', clone_selection:'VCR'
  };
  const contact = { id:'c1', company_name:'Azienda', first_name:'Mario', last_name:'Rossi', phone:'333', email:'a@example.it', marketing_consent:false };
  const state = projectPayloadToState(payload, contact, { resumeToken:'tok', resumeUrl:'https://example.test/?project=CODE1&token=tok' });
  assert.equal(state.project.sourceType, 'cadastral');
  assert.equal(state.project.orientationDeg, 45);
  assert.equal(state.project.mechanizedHarvest, true);
  assert.equal(state.project.municipality, 'Santo Stefano Belbo');
  assert.equal(state.contact.companyName, 'Azienda');
  assert.equal(state.cloud.projectId, 'p1');
  assert.equal(state.cloud.resumeToken, 'tok');
});

test('toProjectRow stores gross and net vineyard area separately when headlands are calculated', () => {
  const row = toProjectRow({ environment:'TEST', project:{ headlandWidthM:8 } }, { areaM2:1200, netAreaM2:980 }, { ownerUserId:'u1', sessionId:'s1' });
  assert.equal(row.gross_area_m2, 1200);
  assert.equal(row.net_area_m2, 980);
});
