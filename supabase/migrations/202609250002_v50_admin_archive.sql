-- V50: field lifecycle, human quote numbers, and transactional field moves.

alter table public.project_fields
  add column if not exists planting_status text not null default 'planned';

update public.project_fields
set planting_status=case
  when design_data->>'plantingStatus'='planted' then 'planted'
  else 'planned'
end;

alter table public.project_fields
  drop constraint if exists project_fields_planting_status_check;
alter table public.project_fields
  add constraint project_fields_planting_status_check
  check (planting_status in ('planned','planted'));

create or replace function private.sync_project_field_planting_status()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  new.planting_status:=case
    when new.design_data->>'plantingStatus'='planted' then 'planted'
    else 'planned'
  end;
  return new;
end;
$$;

drop trigger if exists sync_project_field_planting_status on public.project_fields;
create trigger sync_project_field_planting_status
before insert or update of design_data on public.project_fields
for each row execute function private.sync_project_field_planting_status();

revoke all on function private.sync_project_field_planting_status() from public,anon,authenticated;

alter table public.quote_requests
  add column if not exists quote_number text;

create unique index if not exists quote_requests_environment_quote_number_uidx
  on public.quote_requests(environment,quote_number)
  where quote_number is not null and btrim(quote_number)<>'';

create or replace function private.move_project_field_internal(
  p_operation_id uuid,
  p_source_project_id uuid,
  p_target_project_id uuid,
  p_client_field_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  current_user_id uuid:=auth.uid();
  source_project public.projects%rowtype;
  target_project public.projects%rowtype;
  moved_project_field public.project_fields%rowtype;
  moved_field jsonb;
  source_fields jsonb;
  target_fields jsonb;
  replacement_field jsonb;
  source_snapshot jsonb;
  target_snapshot jsonb;
  response jsonb;
  moved_field_id text;
  replacement_field_id text;
  source_revision integer;
  target_revision integer;
  target_display_order integer;
  author_label text;
  field_geometry extensions.geometry;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_operation_id is null then raise exception 'operation id required'; end if;
  if p_source_project_id=p_target_project_id then raise exception 'target project must be different'; end if;
  if nullif(trim(coalesce(p_client_field_id,'')),'') is null then raise exception 'field id required'; end if;

  select so.result into response
  from public.sync_operations so
  where so.operation_id=p_operation_id and so.owner_user_id=current_user_id;
  if found then return response; end if;

  perform 1
  from public.projects p
  where p.id in (p_source_project_id,p_target_project_id)
  order by p.id
  for update;

  select p.* into source_project
  from public.projects p
  where p.id=p_source_project_id and p.deleted_at is null;
  select p.* into target_project
  from public.projects p
  where p.id=p_target_project_id and p.deleted_at is null;

  if source_project.id is null or target_project.id is null
     or source_project.owner_user_id<>target_project.owner_user_id
     or (source_project.owner_user_id<>current_user_id and not private.is_admin()) then
    raise exception 'project access denied';
  end if;

  select item.value into moved_field
  from jsonb_array_elements(coalesce(source_project.field_plans,'[]'::jsonb)) item(value)
  where coalesce(item.value->>'clientFieldId',item.value->>'id')=p_client_field_id
  limit 1;
  if moved_field is null then raise exception 'field not found'; end if;

  moved_field_id:=p_client_field_id;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(target_project.field_plans,'[]'::jsonb)) item(value)
    where coalesce(item.value->>'clientFieldId',item.value->>'id')=moved_field_id
  ) then
    moved_field_id:=extensions.gen_random_uuid()::text;
    moved_field:=jsonb_set(
      jsonb_set(moved_field,'{clientFieldId}',to_jsonb(moved_field_id),true),
      '{id}',to_jsonb(moved_field_id),true
    );
  end if;

  select coalesce(jsonb_agg(item.value order by item.ordinality),'[]'::jsonb)
  into source_fields
  from jsonb_array_elements(coalesce(source_project.field_plans,'[]'::jsonb))
       with ordinality item(value,ordinality)
  where coalesce(item.value->>'clientFieldId',item.value->>'id')<>p_client_field_id;

  target_fields:=coalesce(target_project.field_plans,'[]'::jsonb)||jsonb_build_array(moved_field);
  target_display_order:=greatest(jsonb_array_length(target_fields)-1,0);

  if jsonb_array_length(source_fields)=0 then
    replacement_field_id:=extensions.gen_random_uuid()::text;
    replacement_field:=jsonb_build_object('plantingStatus','planned',
      'id',replacement_field_id,
      'clientFieldId',replacement_field_id,
      'label','Campo 1',
      'cloudReady',false,
      'geometry',null,
      'exclusions','[]'::jsonb,
      'metrics','{}'::jsonb,
      'displayOrder',0
    );
    source_fields:=jsonb_build_array(replacement_field);
  end if;

  source_revision:=source_project.latest_revision_number+1;
  target_revision:=target_project.latest_revision_number+1;

  update public.projects set
    field_plans=source_fields,
    active_field_id=case
      when active_field_id=p_client_field_id then
        coalesce(source_fields->0->>'clientFieldId',source_fields->0->>'id')
      else active_field_id
    end,
    version=version+1,
    latest_revision_number=source_revision,
    updated_at=now()
  where id=source_project.id;

  update public.projects set
    field_plans=target_fields,
    active_field_id=coalesce(active_field_id,moved_field_id),
    version=version+1,
    latest_revision_number=target_revision,
    updated_at=now()
  where id=target_project.id;

  select pf.* into moved_project_field
  from public.project_fields pf
  where pf.project_id=source_project.id
    and pf.client_field_id=p_client_field_id
    and pf.deleted_at is null
  for update;

  if moved_project_field.id is not null then
    update public.project_fields set
      project_id=target_project.id,
      owner_user_id=target_project.owner_user_id,
      client_field_id=moved_field_id,
      display_order=target_display_order,
      deleted_at=null,
      updated_at=now()
    where id=moved_project_field.id;
  else
    field_geometry:=null;
    if coalesce((moved_field->>'cloudReady')::boolean,false)
       and jsonb_typeof(moved_field->'geometry')='array' then
      field_geometry:=extensions.st_setsrid(
        extensions.st_geomfromgeojson(jsonb_build_object(
          'type','Polygon','coordinates',jsonb_build_array(moved_field->'geometry')
        )::text),4326
      );
    end if;
    insert into public.project_fields(
      project_id,owner_user_id,client_field_id,label,geometry,exclusions,design_data,
      gross_area_m2,net_area_m2,simulated_plants,commercial_plants_25,row_count,row_linear_m,
      head_posts,intermediate_posts,total_posts,display_order,deleted_at,updated_at
    ) values (
      target_project.id,target_project.owner_user_id,moved_field_id,
      coalesce(nullif(moved_field->>'label',''),'Campo'),field_geometry,
      coalesce(moved_field->'exclusions','[]'::jsonb),
      moved_field-'geometry'-'exclusions'-'metrics'-'clientFieldId'-'cloudReady',
      coalesce((moved_field->'metrics'->>'grossAreaM2')::double precision,
        (moved_field->'metrics'->>'areaM2')::double precision,0),
      coalesce((moved_field->'metrics'->>'netAreaM2')::double precision,0),
      coalesce((moved_field->'metrics'->>'simulatedPlants')::integer,0),
      coalesce((moved_field->'metrics'->>'commercialPlants25')::integer,0),
      coalesce((moved_field->'metrics'->>'rowCount')::integer,0),
      coalesce((moved_field->'metrics'->>'rowLinearM')::double precision,0),
      coalesce((moved_field->'metrics'->>'headPosts')::integer,0),
      coalesce((moved_field->'metrics'->>'intermediatePosts')::integer,0),
      coalesce((moved_field->'metrics'->>'totalPosts')::integer,0),
      target_display_order,null,now()
    );
  end if;

  if replacement_field is not null then
    insert into public.project_fields(
      project_id,owner_user_id,client_field_id,label,exclusions,design_data,display_order
    ) values (
      source_project.id,source_project.owner_user_id,replacement_field_id,'Campo 1',
      '[]'::jsonb,jsonb_build_object('plantingStatus','planned'),0
    );
  end if;

  select coalesce(nullif(trim(p.display_name),''),nullif(trim(p.username),''),'Utente')
  into author_label from public.profiles p where p.user_id=current_user_id;
  author_label:=coalesce(author_label,'Utente');

  source_snapshot:=jsonb_build_object(
    'schemaVersion',source_project.snapshot_schema_version,
    'clientProjectId',source_project.client_project_id,
    'projectId',source_project.id,
    'environment',source_project.environment,
    'name',source_project.name,
    'campaignYear',source_project.campaign_year,
    'origin',source_project.origin,
    'fields',source_fields
  );
  target_snapshot:=jsonb_build_object(
    'schemaVersion',target_project.snapshot_schema_version,
    'clientProjectId',target_project.client_project_id,
    'projectId',target_project.id,
    'environment',target_project.environment,
    'name',target_project.name,
    'campaignYear',target_project.campaign_year,
    'origin',target_project.origin,
    'fields',target_fields
  );

  insert into public.project_revisions(
    project_id,owner_user_id,revision_number,snapshot_schema_version,snapshot,reason,
    created_by_user_id,created_by_label,change_summary
  ) values
  (
    source_project.id,source_project.owner_user_id,source_revision,
    source_project.snapshot_schema_version,source_snapshot,'manual_save',
    current_user_id,author_label,jsonb_build_object(
      'type','field_move','direction','out','fieldId',p_client_field_id,
      'otherProjectId',target_project.id
    )
  ),
  (
    target_project.id,target_project.owner_user_id,target_revision,
    target_project.snapshot_schema_version,target_snapshot,'manual_save',
    current_user_id,author_label,jsonb_build_object(
      'type','field_move','direction','in','fieldId',moved_field_id,
      'otherProjectId',source_project.id
    )
  );

  response:=jsonb_build_object(
    'status','field_moved',
    'fieldId',moved_field_id,
    'sourceProjectId',source_project.id,
    'targetProjectId',target_project.id,
    'sourceVersion',source_project.version+1,
    'targetVersion',target_project.version+1,
    'source_revision',source_revision,
    'target_revision',target_revision
  );
  insert into public.sync_operations(
    operation_id,owner_user_id,project_id,operation_type,client_version,result
  ) values (
    p_operation_id,current_user_id,source_project.id,'field_move',source_project.version,response
  );
  return response;
end;
$$;

create or replace function public.move_project_field(
  p_operation_id uuid,
  p_source_project_id uuid,
  p_target_project_id uuid,
  p_client_field_id text
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.move_project_field_internal(
    p_operation_id,p_source_project_id,p_target_project_id,p_client_field_id
  )
$$;

revoke all on function private.move_project_field_internal(uuid,uuid,uuid,text) from public,anon;
revoke all on function public.move_project_field(uuid,uuid,uuid,text) from public,anon;
grant execute on function private.move_project_field_internal(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.move_project_field(uuid,uuid,uuid,text) to authenticated;
