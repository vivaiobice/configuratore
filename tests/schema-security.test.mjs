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
