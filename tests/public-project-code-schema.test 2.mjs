import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const schema=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');

test('project codes use a permanently reserved VO plus seven digit random format',()=>{
  assert.match(schema,/create table(?: if not exists)? private\.project_public_code_registry/i);
  assert.match(schema,/lpad\([\s\S]*7[\s\S]*'0'\)/i);
  assert.match(schema,/alter column public_code set default private\.generate_project_public_code\(\)/i);
  assert.match(schema,/public_code ~ '\^VO-\[0-9\]\{7\}\$'/i);
});

test('public code lookup is sanitized, rate limited and never grants table access',()=>{
  assert.match(schema,/create table(?: if not exists)? private\.project_public_lookup_attempts/i);
  assert.match(schema,/current_setting\('request\.headers'/i);
  assert.match(schema,/interval '10 minutes'/i);
  assert.match(schema,/create or replace function public\.get_public_project_by_code/i);
  assert.match(schema,/grant execute on function public\.get_public_project_by_code\(text\) to anon,authenticated/i);
  assert.doesNotMatch(schema,/grant select on (table )?public\.projects to anon/i);
  const lookup=schema.split('create or replace function private.get_public_project_by_code_internal(').at(-1).split('create or replace function public.get_public_project_by_code(')[0];
  assert.match(lookup,/deleted_at is null/i);
  const payload=lookup.match(/response\s*:=\s*jsonb_build_object\(([\s\S]*?)\);/i)?.[1]??'';
  for(const forbidden of ['owner_user_id','contact_id','recipient_snapshot','email','phone'])assert.doesNotMatch(payload,new RegExp(forbidden,'i'));
});

test('legacy public codes can resolve to the current canonical project',()=>{
  assert.match(schema,/create table(?: if not exists)? private\.project_public_code_aliases/i);
  const lookup=schema.split('create or replace function private.get_public_project_by_code_internal(').at(-1).split('create or replace function public.get_public_project_by_code(')[0];
  assert.match(lookup,/project_public_code_aliases/i);
  assert.match(lookup,/'projectCode'\s*,\s*normalized_code/i);
});
