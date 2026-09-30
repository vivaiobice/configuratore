import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/202609210005_v31_profile_auth.sql',import.meta.url),'utf8');

test('username is normalized, unique and inaccessible to anon',()=>{
  assert.match(sql,/add column (?:if not exists )?username text/i);
  assert.match(sql,/unique index[^;]+lower\(username\)/is);
  assert.match(sql,/revoke all on function private\.resolve_login_email/is);
  assert.doesNotMatch(sql,/grant execute[^;]+resolve_login_email[^;]+anon/is);
});

test('guest transfer stores only a token hash and expires once',()=>{
  assert.match(sql,/token_hash text not null unique/i);
  assert.doesNotMatch(sql,/token_plain|raw_token/i);
  assert.match(sql,/consumed_at is not null/i);
  assert.match(sql,/expires_at\s*>\s*now\(\)/i);
});

test('guest transfer functions require the correct identity classes',()=>{
  assert.match(sql,/is_anonymous[^;]+true/is);
  assert.match(sql,/is_anonymous[^;]+false/is);
  assert.match(sql,/values\([^;]+current_guest_id[^;]+interval '15 minutes'\)/is);
});

test('transfer updates every owned project relation atomically',()=>{
  for(const table of ['projects','project_fields','project_revisions','sync_operations','contacts','quote_requests','project_events']){
    assert.match(sql,new RegExp(`update public\\.${table}[\\s\\S]+owner_user_id`,'i'));
  }
});

test('transfer retry returns the previously claimed result instead of applying twice',()=>{
  assert.match(sql,/claimed_by_user_id\s*=\s*current_user_id/is);
  assert.match(sql,/jsonb_build_object\('status','already_claimed'/is);
});
