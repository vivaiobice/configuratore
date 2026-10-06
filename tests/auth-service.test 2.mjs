import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthService} from '../src/auth-service.js';

const guest=id=>({user:{id,email:null,is_anonymous:true,app_metadata:{}}});
const user=(id,email='m@example.it')=>({user:{id,email,is_anonymous:false,app_metadata:{}}});

function fixture({ambiguous=false}={}){
  const calls=[];let session=guest('guest-1');let consumeCount=0;
  const client={auth:{
    async getSession(){return {data:{session}};},
    async updateUser(){session=user('guest-1');calls.push('updateUser');return {data:{user:session.user},error:null};},
    async setSession(next){session=user(next.access_token==='new-a'?'guest-1':'user-2');calls.push('setSession');return {data:{session},error:null};},
    async signOut(){calls.push('signOut');session=null;return {error:null};},
    async resetPasswordForEmail(){calls.push('resetPassword');return {error:null};}
  }};
  const backend={
    async ensureAnonymousSession(){if(!session)session=guest('guest-2');return session;},
    async getProfile(){return session?.user?.is_anonymous?null:{display_name:'Marco',username:'marco'};},
    async upsertProfile(row){calls.push(['upsertProfile',row]);return row;},
    async promoteGuestAccount(){calls.push('promoteGuestAccount');session=user('guest-1');return {session:{access_token:'new-a',refresh_token:'new-r'}};},
    async createGuestTransferGrant(){calls.push('createGrant');return 'grant-1';},
    async loginByIdentifier(){calls.push('loginByIdentifier');return {access_token:'a',refresh_token:'r'};},
    async consumeGuestTransferGrant(){calls.push('consumeGrant');consumeCount++;if(ambiguous&&consumeCount===1)throw new Error('network_after_commit');return {status:consumeCount>1?'already_claimed':'claimed',transferredProjectCount:1};}
  };
  const storage=new Map();
  return {client,backend,calls,storage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}};
}

test('registration promotes the anonymous user without changing uid',async()=>{
  const f=fixture(),service=createAuthService(f);
  const state=await service.register({email:'m@example.it',username:'001234',displayName:'Marco',password:'12345678'});
  assert.equal(state.user.id,'guest-1');
  assert.deepEqual(f.calls,['promoteGuestAccount','setSession']);
});

test('existing-account login mints then consumes a guest transfer',async()=>{
  const f=fixture(),service=createAuthService(f);
  await service.login({identifier:'marco',password:'12345678'});
  assert.deepEqual(f.calls,['createGrant','loginByIdentifier','setSession','consumeGrant']);
});

test('lost transfer response is retried without creating a second grant',async()=>{
  const f=fixture({ambiguous:true}),service=createAuthService(f);
  await assert.rejects(service.login({identifier:'marco',password:'12345678'}),/network_after_commit/);
  const state=await service.resumePendingTransfer();
  assert.equal(state.transfer.status,'completed');
  assert.equal(state.transfer.transferredProjectCount,1);
  assert.equal(f.calls.filter(value=>value==='createGrant').length,1);
  assert.equal(f.calls.filter(value=>value==='consumeGrant').length,2);
});

test('logout immediately returns to a fresh Guest session',async()=>{
  const f=fixture(),service=createAuthService(f);
  await service.login({identifier:'marco',password:'12345678'});
  const state=await service.logout();
  assert.equal(state.kind,'guest');assert.equal(state.user.id,'guest-2');
});

test('password reset delegates with the configured TEST callback',async()=>{
  const f=fixture(),service=createAuthService({...f,resetRedirectTo:'https://test.example/reset'});
  await service.requestPasswordReset('M@Example.it');
  assert.ok(f.calls.includes('resetPassword'));
});

test('identity hooks suspend before login and refresh after transfer',async()=>{
  const f=fixture(),events=[],service=createAuthService({...f,beforeIdentityChange:()=>events.push('before'),afterIdentityChange:()=>events.push('after')});
  await service.login({identifier:'marco',password:'12345678'});
  assert.deepEqual(events,['before','after']);
});

test('authenticated profile details are normalized and saved on the owner row',async()=>{
  const f=fixture(),service=createAuthService(f);
  await service.login({identifier:'marco',password:'12345678'});
  const state=await service.updateProfile({firstName:' Mario ',lastName:' Rossi ',companyName:' Vigna SRL ',province:'cn',vatNumber:'IT123'});
  const call=f.calls.find(value=>Array.isArray(value)&&value[0]==='upsertProfile');
  assert.equal(call[1].user_id,'user-2');assert.equal(call[1].owner_kind,'user');
  assert.equal(call[1].province,'CN');assert.equal(call[1].company_name,'Vigna SRL');
  assert.equal(state.displayName,'Mario Rossi');assert.equal(state.vatNumber,'IT123');
});
