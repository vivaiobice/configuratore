-- Keep private implementation functions private while allowing the public RPC
-- wrappers to invoke them with the function owner's privileges.
alter function public.apply_project_operation(uuid,bigint,jsonb) security definer;
alter function public.create_project_revision(uuid,uuid,bigint,jsonb,text) security definer;
alter function public.soft_delete_project(uuid,uuid) security definer;
alter function public.restore_project(uuid,uuid) security definer;
alter function public.restore_project_revision(uuid,uuid,integer) security definer;
alter function public.archive_stale_guest_drafts() security definer;

revoke execute on function private.apply_project_operation_internal(uuid,bigint,jsonb) from authenticated;
revoke execute on function private.create_project_revision_internal(uuid,uuid,bigint,jsonb,text) from authenticated;
revoke execute on function private.soft_delete_project_internal(uuid,uuid) from authenticated;
revoke execute on function private.restore_project_internal(uuid,uuid) from authenticated;
revoke execute on function private.restore_project_revision_internal(uuid,uuid,integer) from authenticated;
revoke execute on function private.archive_stale_guest_drafts_internal() from authenticated;
