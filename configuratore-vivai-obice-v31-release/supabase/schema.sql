create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;

create schema if not exists private;

create type public.project_environment as enum ('TEST','LIVE');
create type public.project_status as enum ('draft','saved','pdf_downloaded','quote_requested','contacted','client');
create type public.consent_state as enum ('necessary','analytics');
create type public.quote_request_status as enum ('new','contacted','quoted','closed');

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null check (char_length(trim(company_name)) > 0),
  first_name text not null check (char_length(trim(first_name)) > 0),
  last_name text not null check (char_length(trim(last_name)) > 0),
  phone text not null check (char_length(trim(phone)) > 0),
  email text not null check (position('@' in email) > 1),
  privacy_version text not null,
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.visitors (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  analytics_consent boolean not null default true check (analytics_consent = true),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  visitor_id uuid references public.visitors(id) on delete set null,
  environment public.project_environment not null default 'TEST',
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  device_class text,
  referrer text,
  consent_state public.consent_state not null default 'necessary'
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  last_session_id uuid references public.sessions(id) on delete set null,
  public_code text not null unique default encode(gen_random_bytes(12), 'hex'),
  resume_token_hash text unique,
  environment public.project_environment not null default 'TEST',
  status public.project_status not null default 'draft',
  geometry extensions.geometry(Polygon,4326),
  source_type text not null default 'manual' check (source_type in ('manual','cadastral','mixed')),
  cadastral_refs jsonb not null default '[]'::jsonb,
  location_label text,
  municipality text,
  province text,
  region text,
  gross_area_m2 double precision not null default 0,
  net_area_m2 double precision not null default 0,
  perimeter_m double precision not null default 0,
  vertex_count integer not null default 0,
  row_spacing_m double precision,
  plant_spacing_m double precision,
  row_orientation_deg double precision not null default 0,
  headland_width_m double precision,
  theoretical_plants integer not null default 0,
  simulated_plants integer not null default 0,
  commercial_plants_25 integer not null default 0,
  row_count integer not null default 0,
  row_linear_m double precision not null default 0,
  post_spacing_m double precision,
  head_posts integer not null default 0,
  intermediate_posts integer not null default 0,
  total_posts integer not null default 0,
  mechanization jsonb not null default '{}'::jsonb,
  field_plans jsonb not null default '[]'::jsonb,
  active_field_id text,
  project_context_type text,
  project_context_note text,
  grape_variety text,
  rootstock text,
  clone_selection text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_events (
  id bigint generated always as identity primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  visitor_id uuid references public.visitors(id) on delete set null,
  environment public.project_environment not null default 'TEST',
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);


create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  environment public.project_environment not null default 'TEST',
  status public.quote_request_status not null default 'new',
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_notes (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index projects_owner_idx on public.projects(owner_user_id);
create index projects_environment_status_idx on public.projects(environment,status);
create index projects_geometry_gix on public.projects using gist(geometry);
create index sessions_owner_started_idx on public.sessions(owner_user_id,started_at desc);
create index events_project_created_idx on public.project_events(project_id,created_at desc);
create index events_session_created_idx on public.project_events(session_id,created_at desc);
create index contacts_email_idx on public.contacts(lower(email));
create index quote_requests_project_idx on public.quote_requests(project_id,created_at desc);
create index quote_requests_environment_status_idx on public.quote_requests(environment,status);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false)
$$;

alter table public.contacts enable row level security;
alter table public.visitors enable row level security;
alter table public.sessions enable row level security;
alter table public.projects enable row level security;
alter table public.project_events enable row level security;
alter table public.quote_requests enable row level security;
alter table public.admin_notes enable row level security;

revoke all on public.contacts, public.visitors, public.sessions, public.projects, public.project_events, public.quote_requests, public.admin_notes from anon;
grant select, insert, update on public.contacts, public.visitors, public.sessions, public.projects to authenticated;
grant select, insert on public.project_events to authenticated;
grant select, insert, update on public.quote_requests to authenticated;
grant select, insert, update, delete on public.admin_notes to authenticated;

create policy contacts_owner_or_admin_select on public.contacts for select to authenticated
using ((select auth.uid()) = owner_user_id or (select private.is_admin()));
create policy contacts_owner_insert on public.contacts for insert to authenticated
with check ((select auth.uid()) = owner_user_id);
create policy contacts_owner_update on public.contacts for update to authenticated
using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);

create policy visitors_owner_or_admin_select on public.visitors for select to authenticated
using ((select auth.uid()) = owner_user_id or (select private.is_admin()));
create policy visitors_owner_insert on public.visitors for insert to authenticated
with check ((select auth.uid()) = owner_user_id and analytics_consent = true);
create policy visitors_owner_update on public.visitors for update to authenticated
using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id and analytics_consent = true);

create policy sessions_owner_or_admin_select on public.sessions for select to authenticated
using ((select auth.uid()) = owner_user_id or (select private.is_admin()));
create policy sessions_owner_insert on public.sessions for insert to authenticated
with check ((select auth.uid()) = owner_user_id);
create policy sessions_owner_update on public.sessions for update to authenticated
using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);

create policy projects_owner_or_admin_select on public.projects for select to authenticated
using ((select auth.uid()) = owner_user_id or (select private.is_admin()));
create policy projects_owner_insert on public.projects for insert to authenticated
with check ((select auth.uid()) = owner_user_id);
create policy projects_owner_update on public.projects for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check (
  (select auth.uid()) = owner_user_id
  and status in ('draft','saved','pdf_downloaded','quote_requested')
);
create policy projects_admin_update on public.projects for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy events_owner_or_admin_select on public.project_events for select to authenticated
using ((select auth.uid()) = owner_user_id or (select private.is_admin()));
create policy events_owner_insert on public.project_events for insert to authenticated
with check ((select auth.uid()) = owner_user_id);


create policy quote_requests_owner_or_admin_select on public.quote_requests for select to authenticated
using ((select auth.uid()) = owner_user_id or (select private.is_admin()));
create policy quote_requests_owner_insert on public.quote_requests for insert to authenticated
with check ((select auth.uid()) = owner_user_id);
create policy quote_requests_admin_update on public.quote_requests for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

create policy admin_notes_admin_all on public.admin_notes for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

-- Anonymous Auth is used as invisible technical ownership for public users.
-- Admin users must be permanent Auth users with app_metadata.role = 'admin'.

-- Foreign-key indexes recommended by Supabase Database Advisor.
create index if not exists admin_notes_author_idx on public.admin_notes(author_id);
create index if not exists admin_notes_project_idx on public.admin_notes(project_id);
create index if not exists contacts_owner_idx on public.contacts(owner_user_id);
create index if not exists events_owner_idx on public.project_events(owner_user_id);
create index if not exists events_visitor_idx on public.project_events(visitor_id);
create index if not exists projects_contact_idx on public.projects(contact_id);
create index if not exists projects_last_session_idx on public.projects(last_session_id);
create index if not exists quote_requests_contact_idx on public.quote_requests(contact_id);
create index if not exists quote_requests_owner_idx on public.quote_requests(owner_user_id);
create index if not exists sessions_visitor_idx on public.sessions(visitor_id);

-- Secure project resume: bearer token is hashed in projects; privileged ownership transfer stays private.
create or replace function private.claim_project_internal(p_public_code text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  project_record public.projects%rowtype;
  payload jsonb;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  select p.* into project_record
  from public.projects p
  where p.public_code = p_public_code
    and p.resume_token_hash is not null
    and p.resume_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  limit 1;

  if project_record.id is null then
    return null;
  end if;

  update public.projects set owner_user_id = current_user_id, updated_at = now()
  where id = project_record.id;

  if project_record.contact_id is not null then
    update public.contacts set owner_user_id = current_user_id
    where id = project_record.contact_id;
  end if;

  update public.quote_requests set owner_user_id = current_user_id, updated_at = now()
  where project_id = project_record.id;

  select p.* into project_record from public.projects p where p.id = project_record.id;

  payload := (to_jsonb(project_record) - 'resume_token_hash' - 'owner_user_id')
    || jsonb_build_object(
      'geometry', case when project_record.geometry is null then null else extensions.st_asgeojson(project_record.geometry)::jsonb end
    );
  return payload;
end;
$$;

revoke all on function private.claim_project_internal(text,text) from public, anon;
grant execute on function private.claim_project_internal(text,text) to authenticated;

create or replace function public.claim_project(p_public_code text, p_token text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.claim_project_internal(p_public_code, p_token)
$$;
revoke all on function public.claim_project(text,text) from public, anon;
grant execute on function public.claim_project(text,text) to authenticated;

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
create index sync_operations_project_idx on public.sync_operations(project_id);

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
    when coalesce(((select auth.jwt())->'app_metadata'->>'role')='admin',false) then 'admin'::public.owner_kind
    when coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) then 'guest'::public.owner_kind
    else 'user'::public.owner_kind
  end
);
create policy profiles_owner_update on public.profiles for update to authenticated
using ((select auth.uid()) = user_id) with check (
  (select auth.uid()) = user_id
  and owner_kind = case
    when coalesce(((select auth.jwt())->'app_metadata'->>'role')='admin',false) then 'admin'::public.owner_kind
    when coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) then 'guest'::public.owner_kind
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

-- V31 profile authentication and one-time Guest ownership transfer.

alter table public.profiles
  add column if not exists username text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9._-]{3,32}$');

create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username)) where username is not null;

create table if not exists private.guest_transfer_grants (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  guest_user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  claimed_by_user_id uuid references auth.users(id) on delete set null,
  transferred_project_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists private.login_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1
);

revoke all on table private.guest_transfer_grants from public, anon, authenticated;

create or replace function private.set_own_profile_internal(
  p_display_name text,
  p_username text
)
returns public.profiles
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_username text := lower(trim(p_username));
  normalized_name text := trim(p_display_name);
  expected_kind public.owner_kind;
  result public.profiles;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  if normalized_name = '' or length(normalized_name) > 80 then raise exception 'invalid_display_name'; end if;
  if normalized_username !~ '^[a-z0-9._-]{3,32}$' then raise exception 'invalid_username'; end if;

  expected_kind := case
    when coalesce((auth.jwt()->'app_metadata'->>'role')='admin',false) then 'admin'::public.owner_kind
    when coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then 'guest'::public.owner_kind
    else 'user'::public.owner_kind
  end;

  insert into public.profiles(user_id,owner_kind,display_name,username,last_seen_at,updated_at)
  values(current_user_id,expected_kind,normalized_name,normalized_username,now(),now())
  on conflict(user_id) do update set
    owner_kind=excluded.owner_kind,
    display_name=excluded.display_name,
    username=excluded.username,
    last_seen_at=excluded.last_seen_at,
    updated_at=excluded.updated_at
  returning * into result;
  return result;
end;
$$;

create or replace function private.create_guest_transfer_grant_internal()
returns text
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  current_guest_id uuid := auth.uid();
  transfer_token text;
begin
  if current_guest_id is null
     or not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'guest_required';
  end if;

  transfer_token := encode(gen_random_bytes(32),'hex');
  insert into private.guest_transfer_grants(token_hash,guest_user_id,expires_at)
  values(encode(digest(transfer_token,'sha256'),'hex'),current_guest_id,now()+interval '15 minutes');
  return transfer_token;
end;
$$;

create or replace function private.consume_guest_transfer_grant_internal(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  grant_record private.guest_transfer_grants%rowtype;
  moved_count integer := 0;
begin
  if current_user_id is null
     or coalesce((auth.jwt()->>'is_anonymous')::boolean,true) then
    raise exception 'permanent_user_required';
  end if;

  select * into grant_record
  from private.guest_transfer_grants
  where token_hash=encode(digest(p_token,'sha256'),'hex')
  for update;

  if grant_record.id is null then raise exception 'invalid_transfer_grant'; end if;
  if grant_record.consumed_at is not null then
    if grant_record.claimed_by_user_id = current_user_id then
      return jsonb_build_object('status','already_claimed','transferredProjectCount',grant_record.transferred_project_count);
    end if;
    raise exception 'transfer_grant_consumed';
  end if;
  if not (grant_record.expires_at > now()) then raise exception 'transfer_grant_expired'; end if;
  if grant_record.guest_user_id=current_user_id then raise exception 'different_target_required'; end if;

  update public.projects set owner_user_id=current_user_id,owner_kind='user'
    where owner_user_id=grant_record.guest_user_id;
  get diagnostics moved_count = row_count;
  update public.project_fields set owner_user_id=current_user_id
    where owner_user_id=grant_record.guest_user_id;
  update public.project_revisions set owner_user_id=current_user_id
    where owner_user_id=grant_record.guest_user_id;
  update public.sync_operations set owner_user_id=current_user_id
    where owner_user_id=grant_record.guest_user_id;
  update public.contacts set owner_user_id=current_user_id
    where owner_user_id=grant_record.guest_user_id;
  update public.quote_requests set owner_user_id=current_user_id
    where owner_user_id=grant_record.guest_user_id;
  update public.project_events set owner_user_id=current_user_id
    where owner_user_id=grant_record.guest_user_id;

  update private.guest_transfer_grants set
    consumed_at=now(),claimed_by_user_id=current_user_id,transferred_project_count=moved_count
  where id=grant_record.id;

  return jsonb_build_object('status','claimed','transferredProjectCount',moved_count);
end;
$$;

create or replace function private.resolve_login_email(p_username text)
returns text
language sql
security definer
stable
set search_path = public, private, auth, pg_temp
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id=p.user_id
  where lower(p.username)=lower(trim(p_username))
    and p.owner_kind in ('user','admin')
  limit 1
$$;

create or replace function private.consume_login_rate_limit_internal(p_key text)
returns boolean language plpgsql security definer
set search_path=private,pg_temp
as $$
declare current_attempts integer;
begin
  insert into private.login_rate_limits(rate_key,window_started_at,attempts)
  values(p_key,now(),1)
  on conflict(rate_key) do update set
    attempts=case when private.login_rate_limits.window_started_at < now()-interval '15 minutes' then 1 else private.login_rate_limits.attempts+1 end,
    window_started_at=case when private.login_rate_limits.window_started_at < now()-interval '15 minutes' then now() else private.login_rate_limits.window_started_at end
  returning attempts into current_attempts;
  return current_attempts <= 10;
end;
$$;

create or replace function public.set_own_profile(p_display_name text,p_username text)
returns public.profiles language sql security invoker
set search_path=public,private,pg_temp
as $$ select private.set_own_profile_internal(p_display_name,p_username) $$;

create or replace function public.create_guest_transfer_grant()
returns text language sql security invoker
set search_path=public,private,pg_temp
as $$ select private.create_guest_transfer_grant_internal() $$;

create or replace function public.consume_guest_transfer_grant(p_token text)
returns jsonb language sql security invoker
set search_path=public,private,pg_temp
as $$ select private.consume_guest_transfer_grant_internal(p_token) $$;

create or replace function public.resolve_login_email(p_username text)
returns text language sql security invoker
set search_path=public,private,pg_temp
as $$ select private.resolve_login_email(p_username) $$;

create or replace function public.consume_login_rate_limit(p_key text)
returns boolean language sql security invoker
set search_path=public,private,pg_temp
as $$ select private.consume_login_rate_limit_internal(p_key) $$;

revoke all on function private.set_own_profile_internal(text,text) from public,anon;
revoke all on function private.create_guest_transfer_grant_internal() from public,anon;
revoke all on function private.consume_guest_transfer_grant_internal(text) from public,anon;
revoke all on function private.resolve_login_email(text) from public,anon,authenticated;
revoke all on function private.consume_login_rate_limit_internal(text) from public,anon,authenticated;
revoke all on function public.set_own_profile(text,text) from public,anon;
revoke all on function public.create_guest_transfer_grant() from public,anon;
revoke all on function public.consume_guest_transfer_grant(text) from public,anon;
revoke all on function public.resolve_login_email(text) from public,anon,authenticated;
revoke all on function public.consume_login_rate_limit(text) from public,anon,authenticated;

grant usage on schema private to authenticated,service_role;
grant execute on function private.set_own_profile_internal(text,text) to authenticated;
grant execute on function private.create_guest_transfer_grant_internal() to authenticated;
grant execute on function private.consume_guest_transfer_grant_internal(text) to authenticated;
grant execute on function private.resolve_login_email(text) to service_role;
grant execute on function private.consume_login_rate_limit_internal(text) to service_role;
grant execute on function public.set_own_profile(text,text) to authenticated;
grant execute on function public.create_guest_transfer_grant() to authenticated;
grant execute on function public.consume_guest_transfer_grant(text) to authenticated;
grant execute on function public.resolve_login_email(text) to service_role;
grant execute on function public.consume_login_rate_limit(text) to service_role;

create index if not exists guest_transfer_grants_guest_user_idx
  on private.guest_transfer_grants(guest_user_id);

create index if not exists guest_transfer_grants_claimed_by_idx
  on private.guest_transfer_grants(claimed_by_user_id)
  where claimed_by_user_id is not null;
grant execute on function public.archive_stale_guest_drafts() to authenticated;
