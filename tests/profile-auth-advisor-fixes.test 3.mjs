import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/202609210006_v31_profile_auth_advisor_fixes.sql',import.meta.url),'utf8');

test('guest transfer foreign keys have covering indexes',()=>{
  assert.match(sql,/guest_transfer_grants_guest_user_idx[\s\S]+guest_user_id/i);
  assert.match(sql,/guest_transfer_grants_claimed_by_idx[\s\S]+claimed_by_user_id/i);
});
