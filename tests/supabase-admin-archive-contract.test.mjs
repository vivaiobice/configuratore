import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8');

test('schema stores field lifecycle and optional human quote number',()=>{
  assert.match(sql,/add column if not exists planting_status text/);
  assert.match(sql,/planting_status in \('planned','planted'\)/);
  assert.match(sql,/add column if not exists quote_number text/);
  assert.match(sql,/quote_requests_environment_quote_number_uidx/);
  assert.match(sql,/sync_project_field_planting_status/);
});

test('atomic move RPC locks both projects and is idempotent',()=>{
  assert.match(sql,/create or replace function private\.move_project_field_internal/);
  assert.match(sql,/create or replace function public\.move_project_field/);
  assert.match(sql,/p_operation_id uuid/);
  assert.match(sql,/order by p\.id[\s\S]*for update/);
  assert.match(sql,/sync_operations[\s\S]*operation_id=p_operation_id/);
  assert.match(sql,/project access denied/);
  assert.match(sql,/field_move/);
  assert.match(sql,/grant execute on function public\.move_project_field\(uuid,uuid,uuid,text\) to authenticated/);
  assert.match(sql,/revoke all on function private\.move_project_field_internal\(uuid,uuid,uuid,text\) from public,anon/);
});

test('move RPC records revisions for source and target and creates an empty replacement field',()=>{
  assert.match(sql,/source_revision/);
  assert.match(sql,/target_revision/);
  assert.match(sql,/Campo 1/);
  assert.match(sql,/jsonb_build_object\('plantingStatus','planned'/);
  assert.match(sql,/insert into public\.project_revisions/);
});
