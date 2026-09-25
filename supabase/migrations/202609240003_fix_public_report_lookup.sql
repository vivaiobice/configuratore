-- The anon role cannot use the private schema. The exposed wrapper must execute
-- with its owner's privileges; the private implementation still validates the
-- token hash and revocation before returning its restricted payload.
create or replace function public.get_shared_project_report(p_report_id uuid,p_token text)
returns jsonb
language sql
security definer
stable
set search_path=''
as $$ select private.get_shared_project_report_internal(p_report_id,p_token) $$;

revoke all on function public.get_shared_project_report(uuid,text) from public;
grant execute on function public.get_shared_project_report(uuid,text) to anon,authenticated;
