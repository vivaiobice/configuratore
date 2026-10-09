import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory,scope} from './counts-support.mjs';
import {createCountsStore} from '../conteggi/store.js';
import {createCountsGateway} from '../src/counts-client.js';
import {createCountsRuntime} from '../conteggi/runtime.js';
import {createCountsHandler} from '../supabase/functions/_shared/counts-handler.js';
import * as countsHandlers from '../supabase/functions/_shared/counts-handler.js';
import {validateSubmission} from '../conteggi/submission.js';

const noticeVersion='counts-v1-2026-10-09';
const owner='00000000-0000-4000-8000-000000000010';
const currentScope=scope(owner);
const flags={sync:true,submit:true,admin:false,emailEnabled:true,environment:'TEST',noticeVersion};
const request=(action,input={})=>new Request('https://backend.example/counts-api',{method:'POST',body:JSON.stringify({environment:'TEST',action,input})});

test('a registered account stores standalone counts without fabricating a notice receipt or a submission',async t=>{
  const store=createCountsStore({indexedDB:new IDBFactory()}),saved={lists:{},counts:{}},receipts=[];
  const gateway=createCountsGateway({store,scope:currentScope,channel:false,noticeVersion,canSyncWithoutNotice:async()=>true,transport:{
    async request(action,input){
      if(action==='notice'){receipts.push(input.version);return {};}
      if(action==='pull')return {lists:Object.values(saved.lists),counts:Object.values(saved.counts),submissions:[]};
      const value={...input.value,revision:input.expectedRevision+1,updatedAt:new Date().toISOString()};
      saved[input.kind==='list'?'lists':'counts'][input.entityId]=value;return {value};
    },
    async submit(){throw new Error('Profile storage must never transmit a request');}
  }});
  t.after(()=>gateway.destroy());
  const list=(await gateway.createList({title:'Letture autonome'})).value;
  const count=(await gateway.createCount({listId:list.listId,category:'plants',quantity:7,notes:'Filare nord',field:null})).value;
  await gateway.refresh();
  const result=await gateway.getCount(list.listId,count.countId);
  assert.equal(result.syncState,'synced');assert.equal(result.quantity,7);assert.equal(result.field,null);
  assert.deepEqual(receipts,[]);assert.equal((await store.read(currentScope)).notice,null);
  const status=await gateway.getSyncStatus();assert.equal(status.profileStorage,true);assert.equal(status.ready,true);assert.equal(status.acknowledged,false);assert.equal(status.pending,0);
});

test('guest sync still requires the current version of the notice',async t=>{
  const store=createCountsStore({indexedDB:new IDBFactory()}),uploaded=[];
  const gateway=createCountsGateway({store,scope:currentScope,channel:false,noticeVersion,canSyncWithoutNotice:async()=>false,transport:{async request(action,input){if(action==='notice')return {};uploaded.push(action);return {value:{...input.value,revision:1}};}}});
  t.after(()=>gateway.destroy());await gateway.createList({title:'Appunti guest'});
  await store.mutate(currentScope,state=>{state.notice='previous-version';});
  await gateway.sync();assert.deepEqual(uploaded,[]);assert.equal((await gateway.getSyncStatus()).ready,false);
  await gateway.acceptNotice(noticeVersion);await gateway.sync();assert.deepEqual(uploaded,['mutate']);assert.equal((await gateway.getSyncStatus()).acknowledged,true);
});

test('a completed acknowledgement of this client does not reject a pending edit of the same local version',async t=>{
  const store=createCountsStore({indexedDB:new IDBFactory()}),remote={lists:{},counts:{}};
  const gateway=createCountsGateway({store,scope:currentScope,channel:false,canSyncWithoutNotice:async()=>true,transport:{async request(action,input){if(action==='pull')return {lists:Object.values(remote.lists),counts:Object.values(remote.counts)};const value={...input.value,revision:input.expectedRevision+1};remote[input.kind==='list'?'lists':'counts'][input.entityId]=value;return {value};}}});
  t.after(()=>gateway.destroy());const list=(await gateway.createList({title:'Letture'})).value,count=(await gateway.createCount({listId:list.listId,category:'plants'})).value;
  await gateway.sync();await gateway.changeQuantity(list.listId,count.countId,'increment');
  const editing=await gateway.getCount(list.listId,count.countId);await gateway.sync();
  assert.equal((await gateway.getCount(list.listId,count.countId)).localRevision,editing.localRevision);
  await gateway.updateCount({listId:list.listId,countId:count.countId,expectedRevision:editing.revision,expectedLocalRevision:editing.localRevision,operationId:crypto.randomUUID(),patch:{notes:'Conserva la mia modifica'}});
  assert.equal((await gateway.getCount(list.listId,count.countId)).notes,'Conserva la mia modifica');
  const beforeForeign=await gateway.getCount(list.listId,count.countId);await gateway.sync();
  remote.counts[count.countId]={...remote.counts[count.countId],notes:'Modifica di un altro dispositivo',revision:remote.counts[count.countId].revision+1};await gateway.refresh();
  await assert.rejects(gateway.updateCount({listId:list.listId,countId:count.countId,expectedRevision:beforeForeign.revision,expectedLocalRevision:beforeForeign.localRevision,operationId:crypto.randomUUID(),patch:{notes:'Proposta vecchia'}}),error=>error.code==='VERSION_CONFLICT');
});

test('the API grants profile storage only to verified nonanonymous sessions',async()=>{
  const repository={hasNotice:async()=>false,pull:async()=>({lists:[],counts:[],submissions:[]})};
  for(const [user,status] of [[{id:owner,isAnonymous:false},200],[{id:owner,isAnonymous:true},403],[{id:owner},403]]){
    const handler=createCountsHandler({flags,authenticate:async()=>user,repository});
    assert.equal((await handler(request('pull'))).status,status);
  }
});

test('verified auth users with an unknown anonymous marker cannot bypass guest notice',async()=>{
  assert.equal(typeof countsHandlers.verifiedCountsIdentity,'function');
  const repository={hasNotice:async()=>false,pull:async()=>({lists:[],counts:[],submissions:[]})};
  for(const [marker,status] of [[false,200],[true,403],[null,403],[undefined,403]]){
    const handler=createCountsHandler({flags,authenticate:async()=>countsHandlers.verifiedCountsIdentity({id:owner,is_anonymous:marker}),repository});
    assert.equal((await handler(request('pull'))).status,status);
  }
});

test('automatic and manual title authorship survive the API and immutable submission boundary',async()=>{
  const listId=crypto.randomUUID(),countId=crypto.randomUUID();let saved;
  const handler=createCountsHandler({flags,authenticate:async()=>({id:owner,isAnonymous:false}),repository:{apply:async input=>{saved=input.value;return {value:saved};}}});
  const value={countId,listId,category:'plants',title:'Lettura',titleMode:'manual',quantity:7,notes:'',field:null};
  const response=await handler(request('mutate',{kind:'count',entityId:countId,operationId:crypto.randomUUID(),expectedRevision:0,value}));
  assert.equal(response.status,200);assert.equal(saved.titleMode,'manual');
  const submission={submissionId:crypto.randomUUID(),snapshot:{listId,listTitle:'Letture',entries:[{...saved,revision:1,updatedAt:new Date().toISOString()}]},contact:{firstName:'Mario',lastName:'Rossi',phone:'12345',email:'test@example.com',companyName:''},message:'',noticeVersion};
  delete submission.snapshot.entries[0].deleted;
  assert.equal(validateSubmission(submission).snapshot.entries[0].titleMode,'manual');
});

test('authenticated capabilities report availability without collecting appunti or sending mail',async()=>{
  const repository=new Proxy({}, {get(){throw new Error('Capabilities must not access stored data');}});
  const handler=createCountsHandler({flags,authenticate:async()=>({id:owner,isAnonymous:true}),repository,deliver:async()=>{throw new Error('Capabilities must not send mail');}});
  const response=await handler(request('capabilities'));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{sync:true,submit:true,emailReady:true,noticeVersion,environment:'TEST'});
  const unauthenticated=createCountsHandler({flags,authenticate:async()=>null,repository});
  assert.equal((await unauthenticated(request('capabilities'))).status,401);
});

test('enabled guest transfer checkpoints work without abandoning the guest archive before login',async t=>{
  const previousDB=globalThis.indexedDB;globalThis.indexedDB=new IDBFactory();let hook,prepared=0;
  const session={user:{id:owner,is_anonymous:true}};
  const client={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};
  const runtime=await createCountsRuntime({config:{environment:'TEST',backendUrl:'https://backend.example',syncEnabled:false,guestTransferEnabled:true},client,backendFactory:()=>({}),authFactory:options=>{hook=options.beforeIdentityChange;return {refresh:async()=>{}};},beforeIdentityChange:async()=>{prepared++;}});
  t.after(async()=>{await runtime.destroy();globalThis.indexedDB=previousDB;});
  await runtime.gateway.createList({title:'Conservati nel guest'});
  await assert.rejects(hook({action:'login',transferCounts:false}),error=>error.code==='SERVICE_DISABLED');
  await hook({action:'login',transferCounts:true});
  assert.equal(prepared,1);assert.equal((await runtime.gateway.listLists()).items.length,1);
});
