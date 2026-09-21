-- Public RPCs run as the caller. The authenticated role may cross the private
-- schema only to execute the explicitly granted implementations below.
alter function public.apply_project_operation(uuid,bigint,jsonb) security invoker;
alter function public.create_project_revision(uuid,uuid,bigint,jsonb,text) security invoker;
alter function public.soft_delete_project(uuid,uuid) security invoker;
alter function public.restore_project(uuid,uuid) security invoker;
alter function public.restore_project_revision(uuid,uuid,integer) security invoker;
alter function public.archive_stale_guest_drafts() security invoker;

grant usage on schema private to authenticated;
grant execute on function private.apply_project_operation_internal(uuid,bigint,jsonb) to authenticated;
grant execute on function private.create_project_revision_internal(uuid,uuid,bigint,jsonb,text) to authenticated;
grant execute on function private.soft_delete_project_internal(uuid,uuid) to authenticated;
grant execute on function private.restore_project_internal(uuid,uuid) to authenticated;
grant execute on function private.restore_project_revision_internal(uuid,uuid,integer) to authenticated;
grant execute on function private.archive_stale_guest_drafts_internal() to authenticated;
