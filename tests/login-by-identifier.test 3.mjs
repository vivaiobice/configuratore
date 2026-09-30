import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as authIdentifiers from '../supabase/functions/_shared/auth-identifiers.js';

const {resolveIdentifierEmail,publicAuthError,validateLoginPayload,rateLimitKey}=authIdentifiers;

test('email bypasses username resolution',async()=>{
  const calls=[];
  const email=await resolveIdentifierEmail(' A@Example.IT ',{resolveUsername:async value=>{calls.push(value);}});
  assert.equal(email,'a@example.it');assert.deepEqual(calls,[]);
});

test('numeric username is resolved without numeric coercion',async()=>{
  const email=await resolveIdentifierEmail('001234',{resolveUsername:async value=>value==='001234'?'m@example.it':null});
  assert.equal(email,'m@example.it');
});

test('unknown alias and bad password share the same public error',()=>{
  assert.deepEqual(publicAuthError('alias_missing'),publicAuthError('invalid_credentials'));
  assert.deepEqual(publicAuthError(),{status:401,body:{error:'Credenziali non valide'}});
});

test('login payload caps identifier and password before processing',()=>{
  assert.deepEqual(validateLoginPayload({identifier:'marco',password:'12345678'}),{identifier:'marco',password:'12345678'});
  assert.throws(()=>validateLoginPayload({identifier:'x'.repeat(257),password:'12345678'}));
  assert.throws(()=>validateLoginPayload({identifier:'marco',password:'x'.repeat(1025)}));
});

test('rate limit key never contains the raw identifier',async()=>{
  const key=await rateLimitKey('10.0.0.1','Marco');
  assert.doesNotMatch(key,/Marco|marco/);assert.match(key,/^[a-f0-9]{64}$/);
});

test('edge handler uses a server-only resolver and a database rate limit',()=>{
  const edge=fs.readFileSync(new URL('../supabase/functions/login-by-identifier/index.ts',import.meta.url),'utf8');
  const migration=fs.readFileSync(new URL('../supabase/migrations/202609210005_v31_profile_auth.sql',import.meta.url),'utf8');
  assert.match(edge,/consume_login_rate_limit/);
  assert.match(edge,/resolve_login_email/);
  assert.doesNotMatch(edge,/console\.(?:log|info|debug)\([^)]*(?:password|identifier)/i);
  assert.match(migration,/create table if not exists private\.login_rate_limits/i);
  assert.match(migration,/grant execute on function public\.consume_login_rate_limit\(text\) to service_role/i);
});

test('guest promotion verifies the caller and converts the same uid server-side',()=>{
  const edge=fs.readFileSync(new URL('../supabase/functions/promote-guest-account/index.ts',import.meta.url),'utf8');
  assert.match(edge,/auth\.getUser\(/);
  assert.match(edge,/user\.is_anonymous/);
  assert.match(edge,/auth\.admin\.updateUserById\(plan\.targetUserId/);
  assert.match(edge,/email_confirm:\s*true/);
  assert.match(edge,/owner_kind:\s*'user'/);
  assert.match(edge,/signInWithPassword/);
  assert.doesNotMatch(edge,/console\.(?:log|info|debug)\([^)]*(?:password|email|username)/i);
});

test('an interrupted registration is resumed on its original uid only after password verification',()=>{
  assert.equal(typeof authIdentifiers.resolvePromotionTarget,'function');
  assert.deepEqual(authIdentifiers.resolvePromotionTarget({
    currentUserId:'new-guest',
    conflictingUserId:'original-guest',
    pendingCredentialsVerified:true
  }),{targetUserId:'original-guest',transferCurrentGuest:true});
  assert.throws(()=>authIdentifiers.resolvePromotionTarget({
    currentUserId:'new-guest',
    conflictingUserId:'original-guest',
    pendingCredentialsVerified:false
  }),/username_conflict/);
});
