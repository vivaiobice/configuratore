import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackend, validateContact, toProjectRow, toSessionRow, projectPayloadToState } from '../src/backend.js';

function fakeRpcClient(data) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push(['rpc', name, args]);
      return { data, error:null };
    }
  };
}

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
    grape_variety:'Barbera', rootstock:'1103P', clone_selection:'VCR',
    client_project_id:'00000000-0000-4000-8000-000000000123', name:'Barbera 1103P',
    campaign_year:2026, origin:'native', version:7, latest_revision_number:3,
    updated_at:'2026-09-22T05:00:00.000Z'
  };
  const contact = { id:'c1', company_name:'Azienda', first_name:'Mario', last_name:'Rossi', phone:'333', email:'a@example.it', marketing_consent:false };
  const state = projectPayloadToState(payload, contact, { resumeToken:'tok', resumeUrl:'https://example.test/?project=CODE1&token=tok' });
  assert.equal(state.project.sourceType, 'cadastral');
  assert.equal(state.project.orientationDeg, 45);
  assert.equal(state.project.mechanizedHarvest, true);
  assert.equal(state.project.municipality, 'Santo Stefano Belbo');
  assert.equal(state.contact.companyName, 'Azienda');
  assert.equal(state.cloud.projectId, 'p1');
  assert.equal(state.project.localProjectId, '00000000-0000-4000-8000-000000000123');
  assert.equal(state.project.localProjectName, 'Barbera 1103P');
  assert.equal(state.project.campaignYear, 2026);
  assert.equal(state.cloud.clientProjectId, '00000000-0000-4000-8000-000000000123');
  assert.equal(state.cloud.version, 7);
  assert.equal(state.cloud.latestRevisionNumber, 3);
  assert.equal(state.cloud.resumeToken, 'tok');
});

test('cloud project payload becomes a stable local archive item', async () => {
  const backendModule = await import('../src/backend.js');
  assert.equal(typeof backendModule.projectPayloadToArchiveItem, 'function');
  const item = backendModule.projectPayloadToArchiveItem({
    id:'server-p1', client_project_id:'00000000-0000-4000-8000-000000000123',
    name:'Vigneto storico', environment:'TEST', campaign_year:2026, origin:'native',
    field_plans:[{ id:'f1', label:'Campo 1', geometry:[[8,44],[8.01,44],[8,44.01],[8,44]] }],
    version:5, latest_revision_number:2, updated_at:'2026-09-22T05:00:00.000Z'
  });
  assert.equal(item.id, '00000000-0000-4000-8000-000000000123');
  assert.equal(item.name, 'Vigneto storico');
  assert.equal(item.cloud.projectId, 'server-p1');
  assert.equal(item.cloud.version, 5);
  assert.equal(item.project.fields.length, 1);
});

test('listOwnedProjects explicitly restricts even an admin to the signed-in owner', async () => {
  const calls=[];
  const terminal={ data:[{id:'p1'}], error:null };
  const chain={
    select(columns){calls.push(['select',columns]);return this;},
    eq(column,value){calls.push(['eq',column,value]);return this;},
    is(column,value){calls.push(['is',column,value]);return this;},
    order(column,options){calls.push(['order',column,options]);return Promise.resolve(terminal);}
  };
  const backend=createBackend({from(table){calls.push(['from',table]);return chain;}});
  const rows=await backend.listOwnedProjects('admin-user-id','TEST');
  assert.deepEqual(rows,[{id:'p1'}]);
  assert.ok(calls.some((call)=>call[0]==='eq'&&call[1]==='owner_user_id'&&call[2]==='admin-user-id'));
  assert.ok(calls.some((call)=>call[0]==='eq'&&call[1]==='environment'&&call[2]==='TEST'));
  assert.ok(calls.some((call)=>call[0]==='is'&&call[1]==='deleted_at'&&call[2]===null));
});

test('public project lookup uses the rate-limited RPC and normalizes its code',async()=>{
  const client=fakeRpcClient({projectCode:'VO-1234567',fields:[]});
  const backend=createBackend(client);
  assert.equal(typeof backend.getPublicProjectByCode,'function');
  const payload=await backend.getPublicProjectByCode(' vo-1234567 ');
  assert.equal(payload.projectCode,'VO-1234567');
  assert.deepEqual(client.calls,[['rpc','get_public_project_by_code',{p_public_code:'VO-1234567'}]]);
});

test('toProjectRow stores gross and net vineyard area separately when headlands are calculated', () => {
  const row = toProjectRow({ environment:'TEST', project:{ headlandWidthM:8 } }, { areaM2:1200, netAreaM2:980 }, { ownerUserId:'u1', sessionId:'s1' });
  assert.equal(row.gross_area_m2, 1200);
  assert.equal(row.net_area_m2, 980);
});

test('multi-field plans are persisted and restored through project payloads', () => {
  const state = { environment:'TEST', project:{
    geometry:[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]], rowSpacingM:2.5, plantSpacingM:0.9, orientationDeg:0,
    fields:[
      { id:'field-a', label:'Campo 1', geometry:[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]], rowSpacingM:2.5, plantSpacingM:0.9, postSpacingM:4.5, exclusions:[] },
      { id:'field-b', label:'Campo 2', geometry:null, rowSpacingM:2.8, plantSpacingM:1, postSpacingM:5, exclusions:[] }
    ], activeFieldId:'field-b'
  }};
  const row = toProjectRow(state, {}, { ownerUserId:'u', sessionId:'s' });
  assert.equal(row.field_plans.length, 2);
  assert.equal(row.active_field_id, 'field-b');
  const restored = projectPayloadToState({ ...row, id:'p', geometry:null, field_plans:row.field_plans, active_field_id:'field-b' });
  assert.equal(restored.project.fields.length, 2);
  assert.equal(restored.project.activeFieldId, 'field-b');
  assert.equal(restored.project.postSpacingM, 5);
});

test('legacy save and revision sync share the same stable client project identity', () => {
  const clientProjectId='00000000-0000-4000-8000-000000000123';
  const row=toProjectRow({environment:'TEST',cloud:{clientProjectId},project:{
    localProjectId:clientProjectId,
    fields:[{id:'field-1',geometry:null},{id:'field-2',geometry:null}]
  }},{},{ownerUserId:'u',sessionId:'s'});
  assert.equal(row.client_project_id,clientProjectId);
  assert.equal(row.field_plans.length,2);
});

test('project upsert resolves conflicts on the stable client identity when no server id exists',async()=>{
  const calls=[];
  const terminal={data:{id:'p1',public_code:'VO-1234567',status:'saved'},error:null};
  const chain={select(columns){calls.push(['select',columns]);return this;},single(){return Promise.resolve(terminal);}};
  const backend=createBackend({from(table){calls.push(['from',table]);return {upsert(row,options){calls.push(['upsert',row,options]);return chain;}};}});
  const clientProjectId='00000000-0000-4000-8000-000000000123';
  await backend.upsertProject({client_project_id:clientProjectId,status:'saved'});
  assert.deepEqual(calls.find(call=>call[0]==='upsert')[2],{onConflict:'client_project_id'});
});

test('applyProjectOperation forwards an idempotent atomic RPC request', async () => {
  const client = fakeRpcClient({ status:'applied', projectId:'p1', version:3 });
  const backend = createBackend(client);
  const result = await backend.applyProjectOperation({
    operationId:'00000000-0000-4000-8000-000000000001',
    expectedVersion:2,
    snapshot:{ schemaVersion:2 }
  });
  assert.deepEqual(client.calls[0], ['rpc','apply_project_operation',{
    p_operation_id:'00000000-0000-4000-8000-000000000001',
    p_expected_version:2,
    p_snapshot:{ schemaVersion:2 }
  }]);
  assert.equal(result.version, 3);
});

test('moveProjectField forwards the atomic cross-project RPC request',async()=>{
  const client=fakeRpcClient({status:'field_moved',fieldId:'f1'});
  const backend=createBackend(client);
  const result=await backend.moveProjectField({
    operationId:'00000000-0000-4000-8000-000000000009',
    sourceProjectId:'source-project',targetProjectId:'target-project',clientFieldId:'f1'
  });
  assert.deepEqual(client.calls[0],['rpc','move_project_field',{
    p_operation_id:'00000000-0000-4000-8000-000000000009',
    p_source_project_id:'source-project',p_target_project_id:'target-project',p_client_field_id:'f1'
  }]);
  assert.equal(result.status,'field_moved');
});

test('revision and recovery methods call only public RPC wrappers', async () => {
  const client = fakeRpcClient({ status:'restored', projectId:'p1' });
  const backend = createBackend(client);
  await backend.createProjectRevision({
    operationId:'00000000-0000-4000-8000-000000000002', projectId:'p1',
    expectedVersion:3, snapshot:{ schemaVersion:2 }, reason:'manual_save',
    changeSummary:{categories:['layout'],fieldIds:['f1'],label:'Sesto d’impianto'}
  });
  await backend.softDeleteProject({ operationId:'00000000-0000-4000-8000-000000000003', projectId:'p1' });
  await backend.restoreProject({ operationId:'00000000-0000-4000-8000-000000000004', projectId:'p1' });
  await backend.restoreProjectRevision({
    operationId:'00000000-0000-4000-8000-000000000005', projectId:'p1', revisionNumber:2
  });
  assert.deepEqual(client.calls.map((call) => call[1]), [
    'create_project_revision','soft_delete_project','restore_project','restore_project_revision'
  ]);
  assert.deepEqual(client.calls[0][2].p_change_summary,{categories:['layout'],fieldIds:['f1'],label:'Sesto d’impianto'});
  assert.deepEqual(client.calls[2], ['rpc','restore_project',{
    p_operation_id:'00000000-0000-4000-8000-000000000004', p_project_id:'p1'
  }]);
});

test('report methods use only dedicated public RPCs and keep the plain share token out of issue calls', async () => {
  const client=fakeRpcClient({status:'ok'});
  const backend=createBackend(client);
  await backend.issueProjectReport({
    projectId:'p1',revisionNumber:4,selectedFieldIds:['f1'],recipient:{companyName:'A'},
    disclaimerVersion:'VO-DISC-2026-01',acceptedAt:'2026-09-24T10:00:00Z',tokenHash:'b'.repeat(64)
  });
  await backend.getSharedProjectReport('00000000-0000-4000-8000-000000000123','a'.repeat(64));
  await backend.revokeProjectReport('00000000-0000-4000-8000-000000000123');
  await backend.listProjectRevisionHistory('p1');
  assert.deepEqual(client.calls.map(call=>call[1]),[
    'issue_project_report','get_shared_project_report','revoke_project_report','list_project_revision_history'
  ]);
  assert.deepEqual(client.calls[0][2],{
    p_project_id:'p1',p_revision_number:4,p_selected_field_ids:['f1'],
    p_recipient_snapshot:{companyName:'A'},p_disclaimer_version:'VO-DISC-2026-01',
    p_disclaimer_accepted_at:'2026-09-24T10:00:00Z',p_token_hash:'b'.repeat(64)
  });
  assert.equal(Object.values(client.calls[0][2]).includes('a'.repeat(64)),false);
});

test('shared edit handoff asks the protected authorization RPC',async()=>{
  const client=fakeRpcClient(true);
  const backend=createBackend(client);
  assert.equal(await backend.canEditProject('22222222-2222-4222-8222-222222222222'),true);
  assert.deepEqual(client.calls[0],['rpc','can_edit_project',{p_project_id:'22222222-2222-4222-8222-222222222222'}]);
});

test('latest revision loader returns null for an empty revision list', async () => {
  const calls=[];
  const result={data:[],error:null};
  const chain={
    select(value){calls.push(['select',value]);return this;},
    eq(key,value){calls.push(['eq',key,value]);return this;},
    order(key,options){calls.push(['order',key,options]);return this;},
    limit(value){calls.push(['limit',value]);return Promise.resolve(result);}
  };
  const backend=createBackend({from(table){calls.push(['from',table]);return chain;}});
  assert.equal(await backend.loadLatestProjectRevision('p1'),null);
  assert.ok(calls.some(call=>call[0]==='eq'&&call[1]==='project_id'&&call[2]==='p1'));
});

test('upsertProfile derives no authorization and writes the supplied protected classification', async () => {
  const calls = [];
  const client = {
    from(table) {
      return {
        upsert(row, options) {
          calls.push([table,row,options]);
          return { select(){ return { single:async () => ({ data:row, error:null }) }; } };
        }
      };
    }
  };
  const backend = createBackend(client);
  await backend.upsertProfile({ user_id:'u1', owner_kind:'guest' });
  assert.deepEqual(calls[0], ['profiles',{ user_id:'u1', owner_kind:'guest' },{ onConflict:'user_id' }]);
});

test('profile authentication methods use protected RPC and Edge Function boundaries',async()=>{
  const calls=[];
  const client={
    async rpc(name,args){calls.push(['rpc',name,args]);return {data:name==='create_guest_transfer_grant'?'grant':{status:'claimed'},error:null};},
    functions:{async invoke(name,options){calls.push(['function',name,options]);return {data:{session:{access_token:'a',refresh_token:'r'}},error:null};}},
    from(){return {select(){return {eq(){return {maybeSingle:async()=>({data:{display_name:'Marco',username:'marco'},error:null})};}};}};}
  };
  const backend=createBackend(client);
  const promoted=await backend.promoteGuestAccount({email:'m@example.it',username:'marco',displayName:'Marco',password:'secret123'});
  assert.equal(promoted.session.access_token,'a');
  assert.equal(await backend.createGuestTransferGrant(),'grant');
  await backend.consumeGuestTransferGrant('grant');
  const session=await backend.loginByIdentifier({identifier:'marco',password:'secret'});
  assert.equal(session.access_token,'a');
  assert.deepEqual(calls.slice(0,4).map(call=>call[1]),['promote-guest-account','create_guest_transfer_grant','consume_guest_transfer_grant','login-by-identifier']);
});

test('Edge Function errors expose the server message instead of the generic SDK status',async()=>{
  const client={functions:{async invoke(){return {data:null,error:{message:'Edge Function returned a non-2xx status code',context:{async json(){return {error:'Username già utilizzato'};}}}};}}};
  const backend=createBackend(client);
  await assert.rejects(backend.promoteGuestAccount({email:'m@example.it',username:'marco',displayName:'Marco',password:'secret123'}),/Username già utilizzato/);
});
