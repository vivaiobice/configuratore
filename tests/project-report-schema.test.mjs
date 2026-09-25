import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/202609240001_project_reports_and_audit.sql', import.meta.url), 'utf8').catch(()=>'');

for (const [label,sql] of [['schema',schema],['migration',migration]]) {
  test(`${label} stores immutable report issues with audit metadata`, () => {
    assert.match(sql,/create table public\.project_reports/i);
    assert.match(sql,/selected_field_ids text\[\] not null/i);
    assert.match(sql,/recipient_snapshot jsonb not null/i);
    assert.match(sql,/share_token_hash text not null unique/i);
    assert.match(sql,/share_revoked_at timestamptz/i);
    assert.match(sql,/created_by_user_id uuid/i);
    assert.match(sql,/change_summary jsonb not null/i);
    assert.doesNotMatch(sql,/\bshare_token\s+text/i);
  });

  test(`${label} exposes only token-gated sanitized public report access`, () => {
    assert.match(sql,/private\.get_shared_project_report_internal/i);
    assert.match(sql,/extensions\.digest\(p_token\s*,\s*'sha256'\)/i);
    assert.match(sql,/share_revoked_at is null/i);
    assert.match(sql,/grant execute on function public\.get_shared_project_report\(uuid,text\) to anon,authenticated/i);
    assert.match(sql,/revoke all on table public\.project_reports from public,anon,authenticated/i);
    const publicResult=sql.match(/response\s*:=\s*jsonb_build_object\([\s\S]*?\);/i)?.[0] ?? '';
    assert.notEqual(publicResult,'');
    assert.doesNotMatch(publicResult,/recipient_snapshot|owner_user_id|created_by_user_id|share_token_hash/i);
  });

  test(`${label} restricts report issue and revoke operations to authenticated owners or admins`, () => {
    assert.match(sql,/private\.issue_project_report_internal[\s\S]*project access denied/i);
    assert.match(sql,/private\.revoke_project_report_internal[\s\S]*project access denied/i);
    assert.match(sql,/grant execute on function public\.issue_project_report/i);
    assert.match(sql,/grant execute on function public\.revoke_project_report/i);
    assert.match(sql,/alter table public\.project_reports enable row level security/i);
  });

  test(`${label} authorizes shared edit handoff without exposing project ownership`,()=>{
    assert.match(sql,/private\.can_edit_project_internal\(p_project_id uuid\)/i);
    assert.match(sql,/public\.can_edit_project\(p_project_id uuid\)/i);
    assert.match(sql,/grant execute on function public\.can_edit_project\(uuid\) to authenticated/i);
    assert.match(sql,/revoke all on function public\.can_edit_project\(uuid\) from public,anon/i);
    assert.match(sql,/auth\.jwt\(\)->>'is_anonymous'\)='false'/i);
  });
}
