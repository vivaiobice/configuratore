alter table public.project_revisions drop constraint if exists project_revisions_reason_check;
alter table public.project_revisions add constraint project_revisions_reason_check
  check (reason in ('manual_save','migration','admin_checkpoint','revision_restore','report_issue','admin_field_location','admin_field_manage'));

create or replace function private.admin_manage_field_internal(
  p_operation_id uuid,p_project_id uuid,p_client_field_id text,p_expected_version bigint,p_action text,p_label text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); project_record public.projects%rowtype;
  fields jsonb; target jsonb; revision_no integer; response jsonb; author_label text;
  remaining integer; next_active text; snapshot jsonb;
begin
  if actor is null or not private.is_admin() then raise exception 'admin required'; end if;
  if p_operation_id is null or p_project_id is null or nullif(trim(coalesce(p_client_field_id,'')),'') is null then raise exception 'project and field required'; end if;
  if p_action not in ('rename','delete') then raise exception 'invalid action'; end if;
  if p_action='rename' and (nullif(trim(coalesce(p_label,'')),'') is null or length(trim(p_label))>80) then raise exception 'field name required (max 80)'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  select so.result into response from public.sync_operations so where so.operation_id=p_operation_id and so.owner_user_id=actor;
  if found then return response; end if;
  select p.* into project_record from public.projects p where p.id=p_project_id and p.deleted_at is null for update;
  if project_record.id is null then raise exception 'project not found'; end if;
  if project_record.version<>p_expected_version then
    return jsonb_build_object('status','conflict','projectId',p_project_id,'serverVersion',project_record.version);
  end if;
  select value into target from jsonb_array_elements(coalesce(project_record.field_plans,'[]'::jsonb)) item(value)
  where coalesce(value->>'clientFieldId',value->>'id')=p_client_field_id limit 1;
  if target is null then raise exception 'field not found'; end if;

  select coalesce(jsonb_agg(
    case when coalesce(value->>'clientFieldId',value->>'id')=p_client_field_id
      then value||jsonb_build_object('label',trim(p_label),'labelCustomized',true)
      else value end order by ordinality
    ) filter (where p_action='rename' or coalesce(value->>'clientFieldId',value->>'id')<>p_client_field_id),'[]'::jsonb)
  into fields from jsonb_array_elements(project_record.field_plans) with ordinality item(value,ordinality);
  remaining:=jsonb_array_length(fields);
  next_active:=coalesce(fields->0->>'clientFieldId',fields->0->>'id');
  revision_no:=project_record.latest_revision_number+1;
  update public.projects set field_plans=fields,version=version+1,latest_revision_number=revision_no,
    active_field_id=case when p_action='delete' and active_field_id=p_client_field_id then next_active else active_field_id end,
    deleted_at=case when p_action='delete' and remaining=0 then now() else deleted_at end,
    updated_at=now() where id=p_project_id;
  if p_action='rename' then
    update public.project_fields set label=trim(p_label),design_data=coalesce(design_data,'{}'::jsonb)||jsonb_build_object('label',trim(p_label),'labelCustomized',true),updated_at=now()
    where project_id=p_project_id and client_field_id=p_client_field_id and deleted_at is null;
  else
    update public.project_fields set deleted_at=now(),updated_at=now()
    where project_id=p_project_id and client_field_id=p_client_field_id and deleted_at is null;
    update public.projects p set
      gross_area_m2=coalesce((select sum(f.gross_area_m2) from public.project_fields f where f.project_id=p_project_id and f.deleted_at is null),0),
      net_area_m2=coalesce((select sum(f.net_area_m2) from public.project_fields f where f.project_id=p_project_id and f.deleted_at is null),0),
      commercial_plants_25=coalesce((select sum(f.commercial_plants_25) from public.project_fields f where f.project_id=p_project_id and f.deleted_at is null),0),
      row_count=coalesce((select sum(f.row_count) from public.project_fields f where f.project_id=p_project_id and f.deleted_at is null),0),
      row_linear_m=coalesce((select sum(f.row_linear_m) from public.project_fields f where f.project_id=p_project_id and f.deleted_at is null),0)
    where p.id=p_project_id;
  end if;

  select coalesce(nullif(trim(p.display_name),''),nullif(trim(p.username),''),'Amministratore') into author_label
  from public.profiles p where p.user_id=actor;
  snapshot:=jsonb_build_object('schemaVersion',project_record.snapshot_schema_version,'clientProjectId',project_record.client_project_id,
    'projectId',project_record.id,'environment',project_record.environment,'name',project_record.name,
    'campaignYear',project_record.campaign_year,'origin',project_record.origin,'fields',fields);
  insert into public.project_revisions(project_id,owner_user_id,revision_number,snapshot_schema_version,snapshot,reason,
    created_by_user_id,created_by_label,change_summary)
  values(p_project_id,project_record.owner_user_id,revision_no,project_record.snapshot_schema_version,snapshot,
    'admin_field_manage',actor,coalesce(author_label,'Amministratore'),jsonb_build_object('type',p_action,'fieldId',p_client_field_id,'label',case when p_action='rename' then trim(p_label) else target->>'label' end));
  response:=jsonb_build_object('status',case when remaining=0 then 'project_deleted' when p_action='rename' then 'field_renamed' else 'field_deleted' end,
    'projectId',p_project_id,'fieldId',p_client_field_id,'version',project_record.version+1,'revisionNumber',revision_no);
  insert into public.sync_operations(operation_id,owner_user_id,project_id,operation_type,client_version,result)
  values(p_operation_id,actor,p_project_id,'admin_field_manage',project_record.version,response);
  return response;
end;
$$;

create or replace function public.admin_manage_field(
  p_operation_id uuid,p_project_id uuid,p_client_field_id text,p_expected_version bigint,p_action text,p_label text default ''
) returns jsonb language sql security invoker set search_path='' as $$
  select private.admin_manage_field_internal(p_operation_id,p_project_id,p_client_field_id,p_expected_version,p_action,p_label)
$$;

revoke all on function private.admin_manage_field_internal(uuid,uuid,text,bigint,text,text) from public,anon;
revoke all on function public.admin_manage_field(uuid,uuid,text,bigint,text,text) from public,anon;
grant execute on function private.admin_manage_field_internal(uuid,uuid,text,bigint,text,text) to authenticated;
grant execute on function public.admin_manage_field(uuid,uuid,text,bigint,text,text) to authenticated;
