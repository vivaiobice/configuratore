import test from 'node:test';import assert from 'node:assert/strict';import {IDBFactory} from './counts-support.mjs';
import {createCountsRuntime} from '../conteggi/runtime.js';
test('token refresh preserves the active tool; external account change isolates it even if old checkpoint fails',async t=>{
 globalThis.indexedDB=new IDBFactory();let current={user:{id:'00000000-0000-4000-8000-000000000010',is_anonymous:true}},callback,checkpoints=0,failCheckpoint=false;
 const client={auth:{getSession:async()=>({data:{session:current}}),onAuthStateChange(fn){callback=fn;return {data:{subscription:{unsubscribe(){}}}};}}};const runtime=await createCountsRuntime({config:{environment:'TEST',backendUrl:'https://backend.example',syncEnabled:false},client,backendFactory:()=>({getProfile:async()=>null}),authFactory:()=>({refresh:async()=>{}}),beforeIdentityChange:async()=>{checkpoints++;if(failCheckpoint)throw new Error('Storage failure');}});
 t.after(()=>runtime.destroy());await runtime.gateway.createList({title:'Guest only'});callback('TOKEN_REFRESHED',current);await new Promise(r=>setTimeout(r,20));assert.equal(checkpoints,0);assert.equal((await runtime.gateway.listLists()).items.length,1);
 failCheckpoint=true;current={user:{id:'00000000-0000-4000-8000-000000000011',is_anonymous:false}};callback('SIGNED_IN',current);await new Promise(r=>setTimeout(r,20));assert.equal(runtime.gateway.getScope().owner,current.user.id);assert.equal((await runtime.gateway.listLists()).items.length,0);await runtime.destroy();delete globalThis.indexedDB;
});
