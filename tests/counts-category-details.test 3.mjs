import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../conteggi/model.js';
import {buildSubmission,validateSubmission} from '../conteggi/submission.js';
import {createCountsGateway} from '../src/counts-client.js';
import {createCountsStore} from '../conteggi/store.js';
import {createCountsHandler} from '../supabase/functions/_shared/counts-handler.js';
import {composeCountsEmail} from '../supabase/functions/_shared/counts-email.js';
import {IDBFactory,scope} from './counts-support.mjs';

const listId='00000000-0000-4000-8000-000000000020',countId='00000000-0000-4000-8000-000000000021';
const fields={postType:'testa',postMaterial:'castagno',componentType:'molle'};
const input={countId,listId,category:'posts',title:'Sostituzioni',quantity:27,notes:'',field:null};
const contact={firstName:'Mario',lastName:'Rossi',email:'test@example.com',phone:'12345',companyName:''};
const synced={...input,revision:1,localRevision:0,syncState:'synced',updatedAt:'2026-10-02T10:00:00Z',deleted:false};

test('category details normalize custom text and survive category changes without weakening the patch contract',()=>{
  const count=model.newCount({...input,postType:'  testa  ',postMaterial:'  Acciaio zincato  ',componentType:'  tendifili  ',varietyLabel:'Barbera',rootstockLabel:'Kober 5 BB'});
  assert.equal(count.postType,'testa');assert.equal(count.postMaterial,'Acciaio zincato');assert.equal(count.componentType,'tendifili');
  const changed=model.patchCount(model.patchCount(count,{category:'other'}),{category:'posts'});
  assert.equal(changed.postType,'testa');assert.equal(changed.postMaterial,'Acciaio zincato');assert.equal(changed.componentType,'tendifili');assert.equal(changed.rootstockLabel,'Kober 5 BB');
  for(const key of Object.keys(fields)){
    assert.equal(model.patchCount(count,{[key]:null})[key],null);
    assert.equal(model.patchCount(count,{[key]:'è'.repeat(80)})[key],'è'.repeat(80));
    for(const value of ['', '  ', 'a'.repeat(81),42,{},undefined])assert.throws(()=>model.patchCount(count,{[key]:value}),/VALIDATION_ERROR/);
  }
  for(const patch of [{postType:'testa',owner_user_id:'other'},{postMaterial:'ferro',clone:'CVT'},{componentType:'molle',countId:listId}])assert.throws(()=>model.patchCount(count,patch),/VALIDATION_ERROR/);
  const legacy=model.newCount(input);for(const key of Object.keys(fields))assert.equal(Object.hasOwn(legacy,key),false);
});

test('offline reading details reopen and finish in the archive and outbox with stable metadata',async()=>{
  const indexedDB=new IDBFactory(),store=createCountsStore({indexedDB});
  const gateway=createCountsGateway({store,scope:scope(),channel:false});
  let reopened;
  try{
    const reading=await gateway.startReading({category:'posts'});
    await gateway.updateReading({countId:reading.countId,expectedLocalRevision:reading.localRevision,patch:{...fields,quantity:27}});
    reopened=createCountsGateway({store:createCountsStore({indexedDB}),scope:scope(),channel:false});
    const restored=await reopened.getReading();assert.equal(restored.postType,'testa');assert.equal(restored.postMaterial,'castagno');assert.equal(restored.componentType,'molle');
    const operationId=crypto.randomUUID(),finished=await reopened.finishReading({countId:restored.countId,operationId});
    const archived=await gateway.getCount(finished.value.listId,restored.countId);assert.equal(archived.postMaterial,'castagno');assert.equal(archived.quantity,27);
    const queued=(await store.read(scope())).outbox.find(op=>op.operationId===operationId);assert.equal(queued.value.componentType,'molle');assert.equal(queued.value.postType,'testa');
    const update={listId:archived.listId,countId:archived.countId,expectedRevision:archived.revision,expectedLocalRevision:archived.localRevision,operationId:crypto.randomUUID(),patch:{postMaterial:'ferro'}};
    await gateway.updateCount(update);await gateway.updateCount(update);
    assert.equal((await reopened.getCount(archived.listId,archived.countId)).postMaterial,'ferro');
    await assert.rejects(reopened.updateCount({...update,operationId:crypto.randomUUID(),patch:{postMaterial:'cemento'}}),error=>error.code==='VERSION_CONFLICT');
  }finally{await gateway.destroy();await reopened?.destroy();}
});

test('server mutation accepts only validated optional category details and keeps legacy payloads valid',async()=>{
  let persisted;
  const repository={hasNotice:async()=>true,apply:async args=>{persisted=args.value;return {value:{...args.value,revision:1}};}};
  const handler=createCountsHandler({flags:{sync:true,environment:'TEST',noticeVersion:'v1'},authenticate:async()=>({id:'00000000-0000-4000-8000-000000000010'}),repository});
  const send=value=>handler(new Request('https://backend.test/counts',{method:'POST',body:JSON.stringify({action:'mutate',environment:'TEST',input:{operationId:crypto.randomUUID(),kind:'count',entityId:countId,expectedRevision:0,value}})}));
  let response=await send({...input,...fields,postMaterial:'  ferro  '});assert.equal(response.status,200);assert.equal((await response.json()).value.postMaterial,'ferro');assert.equal(persisted.componentType,'molle');
  for(const value of [{...input,...fields,owner_user_id:'other'},{...input,...fields,componentType:'x'.repeat(81)},{...input,...fields,postType:['testa']}])assert.equal((await send(value)).status,400);
  response=await send(input);assert.equal(response.status,200);const legacy=(await response.json()).value;for(const key of Object.keys(fields))assert.equal(Object.hasOwn(legacy,key),false);
});

test('frozen submissions retain optional details while email shows the selected category and escapes custom labels',()=>{
  const counts=[{...synced,...fields,postMaterial:'Ferro <zincato>',varietyLabel:'Barbera',rootstockLabel:'Kober 5 BB'},{...synced,countId:crypto.randomUUID(),category:'other',...fields,componentType:'Tendifilo <speciale>'}];
  const submission=buildSubmission({list:{listId,title:'Rimesse',syncState:'synced'},counts,contact,noticeVersion:'v1'});
  counts[0].postMaterial='cemento';assert.equal(submission.snapshot.entries[0].postMaterial,'Ferro <zincato>');assert.equal(submission.snapshot.entries[0].rootstockLabel,'Kober 5 BB');
  assert.equal(validateSubmission(submission),submission);
  assert.throws(()=>validateSubmission({...submission,snapshot:{...submission.snapshot,entries:[{...submission.snapshot.entries[0],postMaterial:'x'.repeat(81)}]}}),/VALIDATION_ERROR/);
  assert.throws(()=>validateSubmission({...submission,snapshot:{...submission.snapshot,entries:[{...submission.snapshot.entries[0],owner_user_id:'other'}]}}),/VALIDATION_ERROR/);
  const email=composeCountsEmail({...submission,acceptedAt:'2026-10-02T10:00:00Z'},{from:'verified@example.com'});
  assert.ok(email.text.includes('Tipo palo: testa'));assert.ok(email.text.includes('Materiale: Ferro <zincato>'));assert.ok(email.text.includes('Componente: Tendifilo <speciale>'));
  assert.ok(!email.text.includes('Vitigno: Barbera'));assert.ok(!email.text.includes('Portainnesto: Kober 5 BB'));assert.ok(!email.text.includes('Componente: molle'));assert.ok(email.html.includes('Ferro &lt;zincato&gt;'));assert.ok(email.html.includes('Tendifilo &lt;speciale&gt;'));
  assert.deepEqual(model.countDetailLines({...synced,category:'plants',...fields,varietyLabel:'Barbera',rootstockLabel:'Kober 5 BB'}),['Vitigno: Barbera','Portainnesto: Kober 5 BB']);
  assert.deepEqual(model.countDetailLines({...synced,...fields}),['Tipo palo: testa','Materiale: castagno']);
  assert.deepEqual(model.countDetailLines({...synced,category:'other',...fields}),['Componente: molle']);
  assert.doesNotThrow(()=>buildSubmission({list:{listId,title:'Vecchi appunti',syncState:'synced'},counts:[{...synced,category:'plants'}],contact,noticeVersion:'v1'}));
});
