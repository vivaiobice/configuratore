import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

test('public project owners cannot promote CRM status to contacted or client', () => {
  assert.match(schema, /projects_owner_update[\s\S]*status in \('draft','saved','pdf_downloaded','quote_requested'\)/i);
  assert.match(schema, /projects_admin_update[\s\S]*private\.is_admin\(\)/i);
});

test('resume security definer stays in private schema and wrapper is invoker', () => {
  assert.match(schema, /private\.claim_project_internal[\s\S]*security definer/i);
  assert.match(schema, /public\.claim_project[\s\S]*security invoker/i);
});

test('cloud archive schema is normalized and versioned', () => {
  assert.match(schema, /create table public\.profiles/i);
  assert.match(schema, /create table public\.project_fields/i);
  assert.match(schema, /create table public\.project_revisions/i);
  assert.match(schema, /create table public\.sync_operations/i);
  assert.match(schema, /unique\s*\(project_id\s*,\s*revision_number\)/i);
  assert.match(schema, /projects_client_project_uidx/i);
});

test('owner and admin policies cover project fields and immutable revisions', () => {
  assert.match(schema, /project_fields_owner_or_admin_select[\s\S]*owner_user_id/i);
  assert.match(schema, /project_revisions_owner_or_admin_select[\s\S]*owner_user_id/i);
  assert.match(schema, /project_revisions_owner_insert[\s\S]*auth\.uid/i);
  assert.doesNotMatch(schema, /create policy project_revisions_owner_update/i);
  assert.doesNotMatch(schema, /create policy project_revisions_owner_delete/i);
});

test('atomic archive RPCs are invoker wrappers over private implementations', () => {
  assert.match(schema, /private\.apply_project_operation_internal[\s\S]*security definer/i);
  assert.match(schema, /public\.apply_project_operation[\s\S]*security invoker/i);
  assert.match(schema, /public\.create_project_revision[\s\S]*security invoker/i);
  assert.match(schema, /public\.soft_delete_project[\s\S]*security invoker/i);
  assert.match(schema, /public\.restore_project[\s\S]*security invoker/i);
  assert.match(schema, /public\.restore_project_revision[\s\S]*security invoker/i);
});

test('retention and recovery functions stay privileged and auditable', () => {
  assert.match(schema, /private\.archive_stale_guest_drafts_internal/i);
  assert.match(schema, /project_soft_deleted/i);
  assert.match(schema, /project_restored/i);
  assert.match(schema, /project_revision_restored/i);
  assert.match(schema, /interval '30 days'/i);
  assert.match(schema, /interval '90 days'/i);
});

test('cloud archive tables enable RLS and deny public anonymous access', () => {
  for (const table of ['profiles','project_fields','project_revisions','sync_operations']) {
    assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(schema, /revoke all on public\.profiles, public\.project_fields, public\.project_revisions, public\.sync_operations from anon/i);
});

test('profile classification follows protected auth claims and recovery RPCs are idempotent', () => {
  assert.match(schema, /profiles_owner_insert[\s\S]*is_anonymous[\s\S]*app_metadata/i);
  assert.match(schema, /public\.soft_delete_project\s*\(p_operation_id uuid\s*,\s*p_project_id uuid\)/i);
  assert.match(schema, /public\.restore_project\s*\(p_operation_id uuid\s*,\s*p_project_id uuid\)/i);
  assert.match(schema, /public\.restore_project_revision\s*\(p_operation_id uuid\s*,\s*p_project_id uuid\s*,\s*p_revision_number integer\)/i);
});
