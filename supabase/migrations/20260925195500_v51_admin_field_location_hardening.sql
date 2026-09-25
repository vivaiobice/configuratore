alter table public.project_revisions drop constraint if exists project_revisions_reason_check;
alter table public.project_revisions add constraint project_revisions_reason_check
  check (reason in ('manual_save','migration','admin_checkpoint','revision_restore','report_issue','admin_field_location'));

create or replace function private.admin_set_field_location_internal(
  p_operation_id uuid,
  p_project_id uuid,
  p_client_field_id text,
  p_location_label text,
  p_municipality text,
  p_province text,
  p_region text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  current_user_id uuid:=auth.uid();
  project_record public.projects%rowtype;
  updated_fields jsonb;
  field_found boolean:=false;
  location_patch jsonb;
  revision_no integer;
  snapshot jsonb;
  response jsonb;
  author_label text;
  selected_field jsonb;
  field_geometry extensions.geometry;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if not private.is_admin() then raise exception 'admin required'; end if;
  if p_operation_id is null then raise exception 'operation id required'; end if;
  if nullif(trim(coalesce(p_client_field_id,'')),'') is null then raise exception 'field id required'; end if;
  if nullif(trim(coalesce(p_municipality,'')),'') is null then raise exception 'municipality required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  select so.result into response
  from public.sync_operations so
  where so.operation_id=p_operation_id and so.owner_user_id=current_user_id;
  if found then return response; end if;

  select p.* into project_record
  from public.projects p
  where p.id=p_project_id and p.deleted_at is null
  for update;
  if project_record.id is null then raise exception 'project not found'; end if;

  location_patch:=jsonb_build_object(
    'locationLabel',trim(coalesce(p_location_label,'')),
    'municipality',trim(coalesce(p_municipality,'')),
    'province',trim(coalesce(p_province,'')),
    'region',trim(coalesce(p_region,''))
  );

  select
    coalesce(jsonb_agg(
      case
        when coalesce(item.value->>'clientFieldId',item.value->>'id')=p_client_field_id
          then item.value||location_patch
        else item.value
      end order by item.ordinality
    ),'[]'::jsonb),
    coalesce(bool_or(coalesce(item.value->>'clientFieldId',item.value->>'id')=p_client_field_id),false)
  into updated_fields,field_found
  from jsonb_array_elements(coalesce(project_record.field_plans,'[]'::jsonb))
       with ordinality item(value,ordinality);

  if not field_found then raise exception 'field not found'; end if;
  select item.value||location_patch into selected_field
  from jsonb_array_elements(coalesce(project_record.field_plans,'[]'::jsonb)) item(value)
  where coalesce(item.value->>'clientFieldId',item.value->>'id')=p_client_field_id
  limit 1;

  revision_no:=project_record.latest_revision_number+1;
  update public.projects set
    field_plans=updated_fields,
    location_label=case when jsonb_array_length(updated_fields)=1 then nullif(trim(coalesce(p_location_label,'')),'') else location_label end,
    municipality=case when jsonb_array_length(updated_fields)=1 then trim(p_municipality) else municipality end,
    province=case when jsonb_array_length(updated_fields)=1 then nullif(trim(coalesce(p_province,'')),'') else province end,
    region=case when jsonb_array_length(updated_fields)=1 then nullif(trim(coalesce(p_region,'')),'') else region end,
    version=version+1,
    latest_revision_number=revision_no,
    updated_at=now()
  where id=p_project_id;

  field_geometry:=null;
  if jsonb_typeof(selected_field->'geometry')='array' and jsonb_array_length(selected_field->'geometry')>=4 then
    field_geometry:=extensions.st_setsrid(extensions.st_geomfromgeojson(jsonb_build_object(
      'type','Polygon','coordinates',jsonb_build_array(selected_field->'geometry'))::text),4326);
  end if;
  insert into public.project_fields(
    project_id,owner_user_id,client_field_id,label,geometry,exclusions,design_data,
    gross_area_m2,net_area_m2,simulated_plants,commercial_plants_25,row_count,row_linear_m,
    head_posts,intermediate_posts,total_posts,display_order,deleted_at,updated_at
  ) values (
    p_project_id,project_record.owner_user_id,p_client_field_id,coalesce(selected_field->>'label','Campo'),field_geometry,
    coalesce(selected_field->'exclusions','[]'::jsonb),selected_field-'geometry'-'exclusions'-'metrics'-'clientFieldId'-'cloudReady'||location_patch,
    coalesce((selected_field->'metrics'->>'areaM2')::double precision,0),coalesce((selected_field->'metrics'->>'netAreaM2')::double precision,0),
    coalesce((selected_field->'metrics'->>'simulatedPlants')::integer,0),coalesce((selected_field->'metrics'->>'commercialPlants25')::integer,0),
    coalesce((selected_field->'metrics'->>'rowCount')::integer,0),coalesce((selected_field->'metrics'->>'rowLinearM')::double precision,0),
    coalesce((selected_field->'metrics'->>'headPosts')::integer,0),coalesce((selected_field->'metrics'->>'intermediatePosts')::integer,0),
    coalesce((selected_field->'metrics'->>'totalPosts')::integer,0),coalesce((selected_field->>'displayOrder')::integer,0),null,now()
  ) on conflict(project_id,client_field_id) do update set
    design_data=coalesce(public.project_fields.design_data,'{}'::jsonb)||location_patch,
    deleted_at=null,updated_at=now();

  select coalesce(nullif(trim(p.display_name),''),nullif(trim(p.username),''),'Amministratore')
  into author_label from public.profiles p where p.user_id=current_user_id;
  author_label:=coalesce(author_label,'Amministratore');

  snapshot:=jsonb_build_object(
    'schemaVersion',project_record.snapshot_schema_version,
    'clientProjectId',project_record.client_project_id,
    'projectId',project_record.id,
    'environment',project_record.environment,
    'name',project_record.name,
    'campaignYear',project_record.campaign_year,
    'origin',project_record.origin,
    'fields',updated_fields
  );

  insert into public.project_revisions(
    project_id,owner_user_id,revision_number,snapshot_schema_version,snapshot,reason,
    created_by_user_id,created_by_label,change_summary
  ) values (
    p_project_id,project_record.owner_user_id,revision_no,
    project_record.snapshot_schema_version,snapshot,'admin_field_location',
    current_user_id,author_label,jsonb_build_object(
      'type','field_location_update','fieldId',p_client_field_id,
      'municipality',trim(p_municipality),'province',trim(coalesce(p_province,''))
    )
  );

  response:=jsonb_build_object(
    'status','field_location_updated',
    'projectId',p_project_id,
    'fieldId',p_client_field_id,
    'version',project_record.version+1,
    'revisionNumber',revision_no,
    'location',location_patch
  );
  insert into public.sync_operations(
    operation_id,owner_user_id,project_id,operation_type,client_version,result
  ) values (
    p_operation_id,current_user_id,p_project_id,'field_location_update',
    project_record.version,response
  );
  return response;
end;
$$;
