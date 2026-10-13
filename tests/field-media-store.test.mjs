import test from 'node:test';
import assert from 'node:assert/strict';
import {context,file,fakeIndexedDB,fakeCloud,deferred,OWNER,PROJECT,SERVER_PROJECT,SERVER_FIELD} from './helpers/field-media-fixtures.mjs';
const module=await import('../src/field-media-store.js').catch(()=>({}));
function create(options){assert.equal(typeof module.createFieldMediaStore,'function','field media store is implemented');return module.createFieldMediaStore(options);}
let next=0;const uuid=()=>`44444444-4444-4444-8444-${String(++next).padStart(12,'0')}`;

test('guest Blobs persist across store instances and stay out of project JSON',async()=>{
  const indexedDB=fakeIndexedDB();let current=context();const getContext=()=>current;
  const store=create({indexedDB,getContext,uuid});const photo=await store.upload(file(),{kind:'photo',note:'Sopralluogo'});
  assert.equal(photo.storage,'local');assert.equal(photo.status,'ready');assert.equal(photo.note,'Sopralluogo');assert.equal(photo.mime,'image/jpeg');assert.equal(photo.size,11);
  assert.equal(JSON.stringify(photo).includes('photo bytes'),false);
  const reopened=create({indexedDB,getContext,uuid});assert.deepEqual(await reopened.list(),[photo]);
  const url=await reopened.getURL(photo.id);assert.equal(await (await fetch(url)).text(),'photo bytes');
  reopened.releaseURL(url);await reopened.delete(photo.id);assert.deepEqual(await store.list(),[]);
});
test('guest field, project, environment and guest identity are isolated',async()=>{
  let current=context();const store=create({indexedDB:fakeIndexedDB(),getContext:()=>current,uuid});const item=await store.upload(file());
  for(const change of [{fieldId:'field-b'},{projectId:'other'},{environment:'TEST'},{guestId:'other-guest'}]){
    current=context(change);assert.deepEqual(await store.list(),[]);await assert.rejects(store.getURL(item.id),{code:'MEDIA_NOT_FOUND'});await assert.rejects(store.delete(item.id),{code:'MEDIA_NOT_FOUND'});
  }
});
test('quota abort reports failure rather than claiming a saved guest attachment',async()=>{
  const indexedDB=fakeIndexedDB();const store=create({indexedDB,getContext:()=>context(),uuid});indexedDB.failNextCommit();await assert.rejects(store.upload(file()),{code:'LOCAL_STORAGE_FAILED'});assert.deepEqual(await store.list(),[]);
});
test('uploads have a transparent per-file limit, empty file guard and read-only guard',async()=>{
  let current=context();const store=create({indexedDB:fakeIndexedDB(),getContext:()=>current,uuid,maxFileBytes:10});
  await assert.rejects(store.upload(file()),{code:'FILE_TOO_LARGE'});await assert.rejects(store.upload(file('empty','','')),{code:'EMPTY_FILE'});
  current=context({readOnly:true});await assert.rejects(store.upload(file('x','','a')),{code:'READ_ONLY'});
});
test('cloud uploads reserve validated owned field metadata and use private unique object paths',async()=>{
  const client=fakeCloud();const store=create({client,getContext:()=>context({ownerId:OWNER}),uuid});const item=await store.upload(file('details.pdf','application/pdf'),{note:'Rilievo'});
  assert.equal(item.storage,'cloud');assert.equal(client.media.get(item.id).status,'ready');assert.equal(client.objects.size,1);
  const upload=client.calls.find(c=>c[0]==='upload');assert.equal(upload[3].upsert,false);assert.match(upload[2],new RegExp(`^${OWNER}/${PROJECT}/LIVE/`));assert.equal(upload[2].includes('details.pdf'),false);
  assert.deepEqual(await store.list(),[item]);const url=await store.getURL(item.id,{download:true});assert.match(url,/^https:/);assert.equal(client.calls.find(c=>c[0]==='signed')[3],3600);
});
test('forged owner or field fails before cloud blob writes; permanent accounts never fall back locally',async()=>{
  const client=fakeCloud();let current=context({ownerId:'99999999-9999-4999-8999-999999999999'});const store=create({client,indexedDB:fakeIndexedDB(),getContext:()=>current,uuid});
  await assert.rejects(store.upload(file()),{code:'OWNER_MISMATCH'});current=context({ownerId:OWNER,fieldId:'foreign-field'});await assert.rejects(store.upload(file()),{code:'PROJECT_NOT_SAVED'});assert.equal(client.objects.size,0);
  client.setUser({id:OWNER,is_anonymous:true});current=context({ownerId:OWNER});await assert.rejects(store.upload(file()),{code:'AUTH_REQUIRED'});
});
test('metadata failure removes uploaded object and reservation, with cleanup failure surfaced',async()=>{
  const client=fakeCloud();client.failReady(new Error('db unavailable'));const store=create({client,getContext:()=>context({ownerId:OWNER}),uuid});
  await assert.rejects(store.upload(file()),{code:'CLOUD_STORAGE_FAILED'});assert.equal(client.objects.size,0);assert.equal(client.media.size,0);
  client.failRemove(new Error('offline'));await assert.rejects(store.upload(file()),{code:'CLEANUP_FAILED'});assert.equal(client.media.size,1,'reservation retained so cleanup can be retried');
  const pending=(await store.list())[0];assert.ok(pending,'incomplete reservation is visible for recovery');assert.equal(pending.status,'pending');await assert.rejects(store.getURL(pending.id),{code:'MEDIA_NOT_FOUND'});client.failRemove(null);await store.delete(pending.id);assert.deepEqual(await store.list(),[]);assert.equal(client.objects.size,0);
});
test('switching active field during cloud upload cleans up and rejects stale result',async()=>{
  const client=fakeCloud();const pause=deferred();client.hooks.upload=()=>pause.promise;let current=context({ownerId:OWNER});const store=create({client,getContext:()=>current,uuid});const uploading=store.upload(file());
  while(!client.calls.some(c=>c[0]==='upload'))await new Promise(r=>setImmediate(r));current=context({ownerId:OWNER,fieldId:'field-b'});pause.resolve();await assert.rejects(uploading,{code:'CONTEXT_CHANGED'});assert.equal(client.media.size,0);assert.equal(client.objects.size,0);
});
test('auth changes suppress an in-flight list or signed URL result',async()=>{
  const client=fakeCloud();const store=create({client,getContext:()=>context({ownerId:OWNER}),uuid});const item=await store.upload(file());const pause=deferred();client.hooks.signed=()=>pause.promise;const result=store.getURL(item.id);while(!client.calls.some(c=>c[0]==='signed'))await new Promise(r=>setImmediate(r));client.setUser(null);pause.resolve();await assert.rejects(result,{code:'AUTH_REQUIRED'});
});
test('delete failure retains cloud metadata so user can retry deleting both parts',async()=>{
  const client=fakeCloud();const store=create({client,getContext:()=>context({ownerId:OWNER}),uuid});const item=await store.upload(file());client.failRemove(new Error('offline'));
  await assert.rejects(store.delete(item.id),{code:'CLOUD_STORAGE_FAILED'});assert.equal(client.media.size,1);client.failRemove(null);await store.delete(item.id);assert.equal(client.media.size,0);assert.equal(client.objects.size,0);
});
test('context invalidation and disposal revoke issued local URLs',async()=>{
  let current=context();const revoked=[];const URL={createObjectURL:()=>`blob:media-${next}`,revokeObjectURL:url=>revoked.push(url)};const store=create({indexedDB:fakeIndexedDB(),getContext:()=>current,uuid,URL});const item=await store.upload(file());const url=await store.getURL(item.id);current=context({fieldId:'other'});await store.list();assert.deepEqual(revoked,[url]);store.dispose();await assert.rejects(store.list(),{code:'STORE_DISPOSED'});
});
test('chronological register lists newest first',async()=>{
  const indexedDB=fakeIndexedDB();let tick=0;const store=create({indexedDB,getContext:()=>context(),uuid,now:()=>new Date(Date.UTC(2026,9,13,10,tick++))});const a=await store.upload(file('a'));const b=await store.upload(file('b'));assert.deepEqual((await store.list()).map(x=>x.id),[b.id,a.id]);
});

test('owners can recover pending reservations while read-only admins see ready media only',async()=>{
  const client=fakeCloud();let current=context({ownerId:OWNER});const store=create({client,getContext:()=>current,uuid});const ready=await store.upload(file());const raw=client.media.get(ready.id);const pendingId=uuid();client.media.set(pendingId,{...raw,id:pendingId,status:'pending',object_path:`${OWNER}/${PROJECT}/LIVE/${pendingId}`});
  assert.equal((await store.list()).length,2);client.setUser({id:'99999999-9999-4999-8999-999999999999',is_anonymous:false,app_metadata:{role:'admin'}});current=context({ownerId:OWNER,readOnly:true});assert.deepEqual((await store.list()).map(item=>item.id),[ready.id]);await assert.rejects(store.upload(file()),{code:'READ_ONLY'});await assert.rejects(store.delete(ready.id),{code:'READ_ONLY'});
});
test('ambiguous metadata insert response triggers cleanup of any committed reservation',async()=>{
  const client=fakeCloud();client.failInsert(new Error('response lost'));client.hooks['field_media:insert']=()=>{const row=client.calls.at(-1)[3];client.media.set(row.id,{...row,created_at:'2026-10-13T10:00:00Z'});};const store=create({client,getContext:()=>context({ownerId:OWNER}),uuid});await assert.rejects(store.upload(file()),{code:'CLOUD_STORAGE_FAILED'});assert.equal(client.media.size,0);assert.equal(client.objects.size,0);
});

test('media follows the normalized field when moved to another project or renamed by collision',async()=>{
  const client=fakeCloud();let current=context({ownerId:OWNER});const store=create({client,getContext:()=>current,uuid});const attachment=await store.upload(file());const target='66666666-6666-4666-8666-666666666666',targetClient='77777777-7777-4777-8777-777777777777';
  client.projects.set(target,{...client.projects.get(SERVER_PROJECT),id:target,client_project_id:targetClient});client.fields.set(SERVER_FIELD,{...client.fields.get(SERVER_FIELD),project_id:target,client_field_id:'moved-field'});current=context({ownerId:OWNER,projectId:targetClient,fieldId:'moved-field'});
  assert.deepEqual(await store.list(),[attachment]);assert.match(await store.getURL(attachment.id),new RegExp(PROJECT));await store.delete(attachment.id);assert.equal(client.media.size,0);assert.equal(client.objects.size,0);
});
test('same-user token refresh does not cancel an upload while sign-out invalidates results',async()=>{
  const client=fakeCloud();const pause=deferred();client.hooks.upload=()=>pause.promise;const store=create({client,getContext:()=>context({ownerId:OWNER}),uuid});const uploading=store.upload(file());while(!client.calls.some(call=>call[0]==='upload'))await new Promise(r=>setImmediate(r));client.emitAuth('TOKEN_REFRESHED');pause.resolve();assert.equal((await uploading).status,'ready');
  const urlPause=deferred();client.hooks.signed=()=>urlPause.promise;const item=(await store.list())[0];const opening=store.getURL(item.id);while(!client.calls.some(call=>call[0]==='signed'))await new Promise(r=>setImmediate(r));client.emitAuth('SIGNED_OUT');urlPause.resolve();await assert.rejects(opening,{code:'CONTEXT_CHANGED'});
});
