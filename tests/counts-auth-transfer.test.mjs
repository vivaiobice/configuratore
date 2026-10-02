import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthService} from '../src/auth-service.js';
const guest='00000000-0000-4000-8000-000000000010',target='00000000-0000-4000-8000-000000000011';
function setup(callback){
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};let session={user:{id:guest,is_anonymous:true}},claims=0;
 const client={auth:{getSession:async()=>({data:{session}}),setSession:async()=>{session={user:{id:target,is_anonymous:false,email:'test@example.com'}};return {data:{session}};}}};
 const backend={getProfile:async()=>null,createGuestTransferGrant:async()=>'verified-proof',loginByIdentifier:async()=>({access_token:'fixture',refresh_token:'fixture'}),consumeGuestTransferGrant:async()=>({status:'claimed',transferredProjectCount:0}),claimGuestCounts:async()=>{claims++;return {sourceOwnerId:guest,targetOwnerId:target,environment:'TEST'};}};
 return {auth:createAuthService({client,backend,storage,countsTransferEnvironment:'TEST',onGuestCountsTransfer:callback}),storage,getClaims:()=>claims};
}
test('ordinary login never transfers counts; checked login verifies proof and completes local handoff',async()=>{
 let proof;const first=setup(value=>proof=value);await first.auth.login({identifier:'test@example.com',password:'password'});assert.equal(first.getClaims(),0);assert.equal(proof,undefined);
 const second=setup(value=>proof=value);await second.auth.login({identifier:'test@example.com',password:'password',transferCounts:true});assert.equal(second.getClaims(),1);assert.equal(proof.sourceOwnerId,guest);assert.equal(proof.targetOwnerId,target);
});
test('failed local guest handoff retains the existing proof for explicit recovery',async()=>{
 let available=false;const fixture=setup(async()=>{if(!available)throw new Error('Storage unavailable');});
 await assert.rejects(fixture.auth.login({identifier:'test@example.com',password:'password',transferCounts:true}),/Storage unavailable/);
 assert.equal(fixture.auth.getState().transfer.status,'pending');assert.ok(fixture.storage.getItem('vivai-obice:auth:pending-transfer'));
 available=true;await fixture.auth.resumePendingTransfer();assert.equal(fixture.auth.getState().transfer.status,'completed');assert.equal(fixture.storage.getItem('vivai-obice:auth:pending-transfer'),undefined);
});
