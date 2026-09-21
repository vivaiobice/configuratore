-- Cloud archive and immutable project history (Phase A, additive to the V29 schema).
do $$ begin
  create type public.project_origin as enum ('native','fieldarea');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.owner_kind as enum ('guest','user','admin');
exception when duplicate_object then null;
end $$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  owner_kind public.owner_kind not null default 'guest',
  display_name text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.projects
  add column client_project_id uuid,
  add column name text not null default 'Il mio impianto',
  add column campaign_year integer not null default extract(year from now())::integer
    check (campaign_year between 2000 and 2100),
  add column origin public.project_origin not null default 'native',
  add column owner_kind public.owner_kind not null default 'guest',
  add column snapshot_schema_version integer not null default 2,
  add column version bigint not null default 0 check (version >= 0),
  add column latest_revision_number integer not null default 0 check (latest_revision_number >= 0),
  add column deleted_at timestamptz;

create unique index projects_client_project_uidx on public.projects(client_project_id);
create index projects_campaign_idx on public.projects(environment,campaign_year,status);
create index projects_owner_deleted_idx on public.projects(owner_user_id,deleted_at,updated_at desc);

create table public.project_fields (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  client_field_id text not null,
  label text not null default 'Campo',
  geometry extensions.geometry(Polygon,4326),
  exclusions jsonb not null default '[]'::jsonb,
  design_data jsonb not null default '{}'::jsonb,
  gross_area_m2 double precision not null default 0,
  net_area_m2 double precision not null default 0,
  simulated_plants integer not null default 0,
  commercial_plants_25 integer not null default 0,
  row_count integer not null default 0,
  row_linear_m double precision not null default 0,
  head_posts integer not null default 0,
  intermediate_posts integer not null default 0,
  total_posts integer not null default 0,
  display_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id,client_field_id)
);

create table public.project_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  snapshot_schema_version integer not null default 2,
  snapshot jsonb not null,
  reason text not null default 'manual_save'
    check (reason in ('manual_save','migration','admin_checkpoint','revision_restore')),
  created_at timestamptz not null default now(),
  unique (project_id,revision_number)
);

create table public.sync_operations (
  operation_id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  operation_type text not null,
  client_version bigint,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index project_fields_project_order_idx on public.project_fields(project_id,display_order);
create index project_fields_owner_idx on public.project_fields(owner_user_id);
create index project_fields_geometry_gix on public.project_fields using gist(geometry);
create index project_revisions_project_number_idx on public.project_revisions(project_id,revision_number desc);
create index project_revisions_owner_idx on public.project_revisions(owner_user_id);
create index sync_operations_owner_created_idx on public.sync_operations(owner_user_id,created_at desc);

alter table public.profiles enable row level security;
alter table public.project_fields enable row level security;
alter table public.project_revisions enable row level security;
alter table public.sync_operations enable row level security;

revoke all on public.profiles, public.project_fields, public.project_revisions, public.sync_operations from anon;
grant select, insert, update on public.profiles, public.project_fields to authenticated;
grant select, insert on public.project_revisions, public.sync_operations to authenticated;

create policy profiles_owner_or_admin_select on public.profiles for select to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));
create policy profiles_owner_insert on public.profiles for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and owner_kind = case
    when coalesce((auth.jwt()->'app_metadata'->>'role')='admin',false) then 'admin'::public.owner_kind
    when coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then 'guest'::public.owner_kind
    else 'user'::public.owner_kind
  end
);
create policy profiles_owner_update on public.profiles for update to authenticated
using ((select auth.uid()) = user_id) with check (
  (select auth.uid()) = user_id
  and owner_kind = case
    when coalesce((auth.jwt()->'app_metadata'->>'role')='admin',false) then 'admin'::public.owner_kind
    when coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then 'guest'::public.owner_kind
    else 'user'::public.owner_kind
  end
);

create policy project_fields_owner_or_admin_select on public.project_fields for select to authenticated
using ((select auth.uid()) = owner_user_id or (select private.is_admin()));
create policy project_fields_owner_insert on public.project_fields for insert to authenticated
with check ((select auth.uid()) = owner_user_id);
create policy project_fields_owner_update on public.project_fields for update to authenticated
using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);

create policy project_revisions_owner_or_admin_select on public.project_revisions for select to authenticated
using ((select auth.uid()) = owner_user_id or (select private.is_admin()));
create policy project_revisions_owner_insert on public.project_revisions for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy sync_operations_owner_or_admin_select on public.sync_operations for select to authenticated
using ((select auth.uid()) = owner_user_id or (select private.is_admin()));
create policy sync_operations_owner_insert on public.sync_operations for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

-- Idempotent optimistic-locking write. Direct table grants are retained for V29;
-- the new synchronization coordinator only uses this RPC.
create or replace function private.apply_project_operation_internal(
  p_operation_id uuid,
  p_expected_version bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  project_record public.projects%rowtype;
  field_data jsonb;
  field_geometry extensions.geometry;
  new_version bigint;
  response jsonb;
  resolved_owner_kind public.owner_kind;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;

  select so.result into response from public.sync_operations so
  where so.operation_id = p_operation_id and so.owner_user_id = current_user_id;
  if found then return response; end if;

  if coalesce(p_snapshot->>'clientProjectId','') = '' then
    raise exception 'clientProjectId required';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(p_snapshot->'fields','[]'::jsonb)) item
    where coalesce((item->>'cloudReady')::boolean,false)
  ) then
    raise exception 'at least one cloud-ready field required';
  end if;

  resolved_owner_kind := case
    when private.is_admin() then 'admin'::public.owner_kind
    when coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then 'guest'::public.owner_kind
    else 'user'::public.owner_kind
  end;

  select p.* into project_record from public.projects p
  where p.client_project_id = (p_snapshot->>'clientProjectId')::uuid
     or p.id = nullif(p_snapshot->>'projectId','')::uuid
  for update;

  if project_record.id is null then
    if p_expected_version <> 0 then
      return jsonb_build_object('status','conflict','serverVersion',null);
    end if;
    insert into public.projects (
      owner_user_id,client_project_id,environment,name,campaign_year,origin,owner_kind,
      snapshot_schema_version,version,field_plans,status,updated_at
    ) values (
      current_user_id,(p_snapshot->>'clientProjectId')::uuid,
      coalesce((p_snapshot->>'environment')::public.project_environment,'TEST'),
      coalesce(nullif(p_snapshot->>'name',''),'Il mio impianto'),
      coalesce((p_snapshot->>'campaignYear')::integer,extract(year from now())::integer),
      coalesce((p_snapshot->>'origin')::public.project_origin,'native'),resolved_owner_kind,
      coalesce((p_snapshot->>'schemaVersion')::integer,2),1,p_snapshot->'fields','draft',now()
    ) returning * into project_record;
    new_version := 1;
  else
    if project_record.owner_user_id <> current_user_id and not private.is_admin() then
      raise exception 'project access denied';
    end if;
    if project_record.version <> p_expected_version then
      return jsonb_build_object('status','conflict','projectId',project_record.id,
        'serverVersion',project_record.version,'serverSnapshot',project_record.field_plans);
    end if;
    new_version := project_record.version + 1;
    update public.projects set
      name = coalesce(nullif(p_snapshot->>'name',''),'Il mio impianto'),
      campaign_year = coalesce((p_snapshot->>'campaignYear')::integer,campaign_year),
      origin = coalesce((p_snapshot->>'origin')::public.project_origin,origin),
      snapshot_schema_version = coalesce((p_snapshot->>'schemaVersion')::integer,2),
      client_project_id=coalesce(client_project_id,(p_snapshot->>'clientProjectId')::uuid),
      version = new_version, field_plans = p_snapshot->'fields', deleted_at = null, updated_at = now()
    where id = project_record.id;
  end if;

  update public.project_fields set deleted_at = now(), updated_at = now()
  where project_id = project_record.id
    and client_field_id not in (
      select value->>'clientFieldId' from jsonb_array_elements(p_snapshot->'fields')
    );

  for field_data in select value from jsonb_array_elements(p_snapshot->'fields') loop
    field_geometry := null;
    if coalesce((field_data->>'cloudReady')::boolean,false) and jsonb_typeof(field_data->'geometry') = 'array' then
      field_geometry := extensions.st_setsrid(
        extensions.st_geomfromgeojson(jsonb_build_object(
          'type','Polygon','coordinates',jsonb_build_array(field_data->'geometry')
        )::text),4326
      );
    end if;
    insert into public.project_fields (
      project_id,owner_user_id,client_field_id,label,geometry,exclusions,design_data,
      gross_area_m2,net_area_m2,simulated_plants,commercial_plants_25,row_count,row_linear_m,
      head_posts,intermediate_posts,total_posts,display_order,deleted_at,updated_at
    ) values (
      project_record.id,current_user_id,field_data->>'clientFieldId',
      coalesce(nullif(field_data->>'label',''),'Campo'),field_geometry,
      coalesce(field_data->'exclusions','[]'::jsonb),
      field_data-'geometry'-'exclusions'-'metrics'-'clientFieldId'-'cloudReady',
      coalesce((field_data->'metrics'->>'grossAreaM2')::double precision,
        (field_data->'metrics'->>'areaM2')::double precision,0),
      coalesce((field_data->'metrics'->>'netAreaM2')::double precision,0),
      coalesce((field_data->'metrics'->>'simulatedPlants')::integer,0),
      coalesce((field_data->'metrics'->>'commercialPlants25')::integer,0),
      coalesce((field_data->'metrics'->>'rowCount')::integer,0),
      coalesce((field_data->'metrics'->>'rowLinearM')::double precision,0),
      coalesce((field_data->'metrics'->>'headPosts')::integer,0),
      coalesce((field_data->'metrics'->>'intermediatePosts')::integer,0),
      coalesce((field_data->'metrics'->>'totalPosts')::integer,0),
      coalesce((field_data->>'displayOrder')::integer,0),null,now()
    ) on conflict (project_id,client_field_id) do update set
      label=excluded.label,geometry=excluded.geometry,exclusions=excluded.exclusions,
      design_data=excluded.design_data,gross_area_m2=excluded.gross_area_m2,
      net_area_m2=excluded.net_area_m2,simulated_plants=excluded.simulated_plants,
      commercial_plants_25=excluded.commercial_plants_25,row_count=excluded.row_count,
      row_linear_m=excluded.row_linear_m,head_posts=excluded.head_posts,
      intermediate_posts=excluded.intermediate_posts,total_posts=excluded.total_posts,
      display_order=excluded.display_order,deleted_at=null,updated_at=now();
  end loop;

  response := jsonb_build_object('status','applied','projectId',project_record.id,
    'version',new_version,'latestRevisionNumber',project_record.latest_revision_number);
  insert into public.sync_operations(operation_id,owner_user_id,project_id,operation_type,client_version,result)
  values (p_operation_id,current_user_id,project_record.id,'apply_snapshot',p_expected_version,response);
  return response;
end;
$$;

create or replace function public.apply_project_operation(p_operation_id uuid,p_expected_version bigint,p_snapshot jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.apply_project_operation_internal(p_operation_id,p_expected_version,p_snapshot)
$$;

create or replace function private.create_project_revision_internal(
  p_operation_id uuid,p_project_id uuid,p_expected_version bigint,p_snapshot jsonb,p_reason text default 'manual_save'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid(); project_record public.projects%rowtype;
  response jsonb; revision_no integer;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  select so.result into response from public.sync_operations so
  where so.operation_id=p_operation_id and so.owner_user_id=current_user_id;
  if found then return response; end if;
  select p.* into project_record from public.projects p where p.id=p_project_id for update;
  if project_record.id is null or (project_record.owner_user_id<>current_user_id and not private.is_admin()) then
    raise exception 'project access denied';
  end if;
  if project_record.version<>p_expected_version then
    return jsonb_build_object('status','conflict','projectId',p_project_id,'serverVersion',project_record.version);
  end if;
  revision_no := project_record.latest_revision_number+1;
  insert into public.project_revisions(project_id,owner_user_id,revision_number,snapshot_schema_version,snapshot,reason)
  values (p_project_id,project_record.owner_user_id,revision_no,
    coalesce((p_snapshot->>'schemaVersion')::integer,2),p_snapshot,p_reason);
  update public.projects set latest_revision_number=revision_no,status='saved',updated_at=now() where id=p_project_id;
  response := jsonb_build_object('status','revision_created','projectId',p_project_id,
    'version',project_record.version,'revisionNumber',revision_no);
  insert into public.sync_operations(operation_id,owner_user_id,project_id,operation_type,client_version,result)
  values (p_operation_id,current_user_id,p_project_id,'create_revision',p_expected_version,response);
  return response;
end;
$$;

create or replace function public.create_project_revision(
  p_operation_id uuid,p_project_id uuid,p_expected_version bigint,p_snapshot jsonb,p_reason text default 'manual_save'
)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.create_project_revision_internal(p_operation_id,p_project_id,p_expected_version,p_snapshot,p_reason)
$$;

create or replace function private.soft_delete_project_internal(p_operation_id uuid,p_project_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid:=auth.uid(); project_record public.projects%rowtype; response jsonb;
begin
  select so.result into response from public.sync_operations so
  where so.operation_id=p_operation_id and so.owner_user_id=current_user_id;
  if found then return response; end if;
  select p.* into project_record from public.projects p where p.id=p_project_id for update;
  if project_record.id is null or (project_record.owner_user_id<>current_user_id and not private.is_admin()) then
    raise exception 'project access denied';
  end if;
  update public.projects set deleted_at=now(),updated_at=now() where id=p_project_id;
  if project_record.last_session_id is not null then
    insert into public.project_events(owner_user_id,project_id,session_id,environment,event_type)
    values(project_record.owner_user_id,p_project_id,project_record.last_session_id,project_record.environment,'project_soft_deleted');
  end if;
  response:=jsonb_build_object('status','deleted','projectId',p_project_id,'recoverableUntil',now()+interval '30 days');
  insert into public.sync_operations(operation_id,owner_user_id,project_id,operation_type,client_version,result)
  values(p_operation_id,current_user_id,p_project_id,'soft_delete',project_record.version,response);
  return response;
end;
$$;

create or replace function public.soft_delete_project(p_operation_id uuid,p_project_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.soft_delete_project_internal(p_operation_id,p_project_id)
$$;

create or replace function private.restore_project_internal(p_operation_id uuid,p_project_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid:=auth.uid(); project_record public.projects%rowtype; response jsonb;
begin
  select so.result into response from public.sync_operations so
  where so.operation_id=p_operation_id and so.owner_user_id=current_user_id;
  if found then return response; end if;
  select p.* into project_record from public.projects p where p.id=p_project_id for update;
  if project_record.id is null or project_record.deleted_at is null
     or project_record.deleted_at < now()-interval '30 days'
     or (project_record.owner_user_id<>current_user_id and not private.is_admin()) then
    raise exception 'project cannot be restored';
  end if;
  update public.projects set deleted_at=null,updated_at=now() where id=p_project_id;
  if project_record.last_session_id is not null then
    insert into public.project_events(owner_user_id,project_id,session_id,environment,event_type)
    values(project_record.owner_user_id,p_project_id,project_record.last_session_id,project_record.environment,'project_restored');
  end if;
  response:=jsonb_build_object('status','restored','projectId',p_project_id);
  insert into public.sync_operations(operation_id,owner_user_id,project_id,operation_type,client_version,result)
  values(p_operation_id,current_user_id,p_project_id,'restore',project_record.version,response);
  return response;
end;
$$;

create or replace function public.restore_project(p_operation_id uuid,p_project_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.restore_project_internal(p_operation_id,p_project_id)
$$;

create or replace function private.restore_project_revision_internal(p_operation_id uuid,p_project_id uuid,p_revision_number integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid:=auth.uid(); project_record public.projects%rowtype;
  revision_record public.project_revisions%rowtype; response jsonb; field_data jsonb; field_geometry extensions.geometry;
begin
  if not private.is_admin() then raise exception 'admin required'; end if;
  select so.result into response from public.sync_operations so
  where so.operation_id=p_operation_id and so.owner_user_id=current_user_id;
  if found then return response; end if;
  select p.* into project_record from public.projects p where p.id=p_project_id for update;
  select r.* into revision_record from public.project_revisions r
  where r.project_id=p_project_id and r.revision_number=p_revision_number;
  if revision_record.id is null then raise exception 'revision not found'; end if;
  update public.projects set
    name=coalesce(nullif(revision_record.snapshot->>'name',''),name),
    campaign_year=coalesce((revision_record.snapshot->>'campaignYear')::integer,campaign_year),
    field_plans=revision_record.snapshot->'fields',version=version+1,
    latest_revision_number=latest_revision_number+1,deleted_at=null,updated_at=now()
  where id=p_project_id;
  update public.project_fields set deleted_at=now(),updated_at=now() where project_id=p_project_id;
  for field_data in select value from jsonb_array_elements(revision_record.snapshot->'fields') loop
    field_geometry:=null;
    if coalesce((field_data->>'cloudReady')::boolean,false) then
      field_geometry:=extensions.st_setsrid(extensions.st_geomfromgeojson(jsonb_build_object(
        'type','Polygon','coordinates',jsonb_build_array(field_data->'geometry'))::text),4326);
    end if;
    insert into public.project_fields(project_id,owner_user_id,client_field_id,label,geometry,exclusions,design_data,
      gross_area_m2,net_area_m2,simulated_plants,commercial_plants_25,row_count,row_linear_m,head_posts,intermediate_posts,total_posts,display_order,deleted_at,updated_at)
    values(p_project_id,project_record.owner_user_id,field_data->>'clientFieldId',coalesce(field_data->>'label','Campo'),field_geometry,
      coalesce(field_data->'exclusions','[]'::jsonb),field_data-'geometry'-'exclusions'-'metrics'-'clientFieldId'-'cloudReady',
      coalesce((field_data->'metrics'->>'areaM2')::double precision,0),coalesce((field_data->'metrics'->>'netAreaM2')::double precision,0),
      coalesce((field_data->'metrics'->>'simulatedPlants')::integer,0),coalesce((field_data->'metrics'->>'commercialPlants25')::integer,0),
      coalesce((field_data->'metrics'->>'rowCount')::integer,0),coalesce((field_data->'metrics'->>'rowLinearM')::double precision,0),
      coalesce((field_data->'metrics'->>'headPosts')::integer,0),coalesce((field_data->'metrics'->>'intermediatePosts')::integer,0),
      coalesce((field_data->'metrics'->>'totalPosts')::integer,0),coalesce((field_data->>'displayOrder')::integer,0),null,now())
    on conflict(project_id,client_field_id) do update set label=excluded.label,geometry=excluded.geometry,exclusions=excluded.exclusions,
      design_data=excluded.design_data,gross_area_m2=excluded.gross_area_m2,net_area_m2=excluded.net_area_m2,
      simulated_plants=excluded.simulated_plants,commercial_plants_25=excluded.commercial_plants_25,row_count=excluded.row_count,
      row_linear_m=excluded.row_linear_m,head_posts=excluded.head_posts,intermediate_posts=excluded.intermediate_posts,
      total_posts=excluded.total_posts,display_order=excluded.display_order,deleted_at=null,updated_at=now();
  end loop;
  insert into public.project_revisions(project_id,owner_user_id,revision_number,snapshot_schema_version,snapshot,reason)
  values(p_project_id,project_record.owner_user_id,project_record.latest_revision_number+1,
    revision_record.snapshot_schema_version,revision_record.snapshot,'revision_restore');
  if project_record.last_session_id is not null then
    insert into public.project_events(owner_user_id,project_id,session_id,environment,event_type,event_payload)
    values(project_record.owner_user_id,p_project_id,project_record.last_session_id,project_record.environment,
      'project_revision_restored',jsonb_build_object('revisionNumber',p_revision_number));
  end if;
  response:=jsonb_build_object('status','revision_restored','projectId',p_project_id,
    'revisionNumber',p_revision_number,'restoredAsRevision',project_record.latest_revision_number+1,
    'version',project_record.version+1);
  insert into public.sync_operations(operation_id,owner_user_id,project_id,operation_type,client_version,result)
  values(p_operation_id,current_user_id,p_project_id,'restore_revision',project_record.version,response);
  return response;
end;
$$;

create or replace function public.restore_project_revision(p_operation_id uuid,p_project_id uuid,p_revision_number integer)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.restore_project_revision_internal(p_operation_id,p_project_id,p_revision_number)
$$;

create or replace function private.archive_stale_guest_drafts_internal()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if not private.is_admin() then raise exception 'admin required'; end if;
  update public.projects set deleted_at=coalesce(deleted_at,now()),updated_at=now()
  where owner_kind='guest' and status='draft' and deleted_at is null
    and updated_at < now()-interval '90 days';
  get diagnostics affected=row_count;
  return affected;
end;
$$;

create or replace function public.archive_stale_guest_drafts()
returns integer language sql security invoker set search_path = '' as $$
  select private.archive_stale_guest_drafts_internal()
$$;

revoke all on function private.apply_project_operation_internal(uuid,bigint,jsonb) from public,anon;
revoke all on function private.create_project_revision_internal(uuid,uuid,bigint,jsonb,text) from public,anon;
revoke all on function private.soft_delete_project_internal(uuid,uuid) from public,anon;
revoke all on function private.restore_project_internal(uuid,uuid) from public,anon;
revoke all on function private.restore_project_revision_internal(uuid,uuid,integer) from public,anon;
revoke all on function private.archive_stale_guest_drafts_internal() from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.apply_project_operation_internal(uuid,bigint,jsonb) to authenticated;
grant execute on function private.create_project_revision_internal(uuid,uuid,bigint,jsonb,text) to authenticated;
grant execute on function private.soft_delete_project_internal(uuid,uuid) to authenticated;
grant execute on function private.restore_project_internal(uuid,uuid) to authenticated;
grant execute on function private.restore_project_revision_internal(uuid,uuid,integer) to authenticated;
grant execute on function private.archive_stale_guest_drafts_internal() to authenticated;
revoke all on function public.apply_project_operation(uuid,bigint,jsonb) from public,anon;
revoke all on function public.create_project_revision(uuid,uuid,bigint,jsonb,text) from public,anon;
revoke all on function public.soft_delete_project(uuid,uuid) from public,anon;
revoke all on function public.restore_project(uuid,uuid) from public,anon;
revoke all on function public.restore_project_revision(uuid,uuid,integer) from public,anon;
revoke all on function public.archive_stale_guest_drafts() from public,anon;
grant execute on function public.apply_project_operation(uuid,bigint,jsonb) to authenticated;
grant execute on function public.create_project_revision(uuid,uuid,bigint,jsonb,text) to authenticated;
grant execute on function public.soft_delete_project(uuid,uuid) to authenticated;
grant execute on function public.restore_project(uuid,uuid) to authenticated;
grant execute on function public.restore_project_revision(uuid,uuid,integer) to authenticated;
grant execute on function public.archive_stale_guest_drafts() to authenticated;
