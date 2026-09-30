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
  first_name text,
  last_name text,
  company_name text,
  address text,
  postal_code text,
  city text,
  province text,
  vat_number text,
  phone text,
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
    check (reason in ('manual_save','migration','admin_checkpoint','revision_restore','report_issue','admin_field_location')),
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

-- V49 editable profile details. Existing owner-only RLS policies apply.
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists company_name text,
  add column if not exists address text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists vat_number text,
  add column if not exists phone text;

alter table public.profiles drop constraint if exists profiles_province_format;
alter table public.profiles add constraint profiles_province_format
  check (province is null or province = '' or province ~ '^[A-Z]{2}$');

alter table public.profiles drop constraint if exists profiles_contact_lengths;
alter table public.profiles add constraint profiles_contact_lengths check (
  char_length(coalesce(first_name,'')) <= 160
  and char_length(coalesce(last_name,'')) <= 160
  and char_length(coalesce(company_name,'')) <= 160
  and char_length(coalesce(address,'')) <= 160
  and char_length(coalesce(postal_code,'')) <= 16
  and char_length(coalesce(city,'')) <= 160
  and char_length(coalesce(vat_number,'')) <= 32
  and char_length(coalesce(phone,'')) <= 32
);

-- V34 interrupted registration recovery (service-role only).
create or replace function private.verify_pending_registration_internal(
  p_user_id uuid,
  p_email text,
  p_username text,
  p_password text
)
returns boolean language sql security definer stable
set search_path=auth,public,private,extensions,pg_temp
as $$
  select exists (
    select 1 from auth.users u
    join public.profiles p on p.user_id=u.id
    where u.id=p_user_id
      and u.is_anonymous is true
      and u.email is null
      and lower(coalesce(u.email_change,''))=lower(trim(p_email))
      and p.owner_kind='guest'
      and lower(coalesce(p.username,''))=lower(trim(p_username))
      and not exists (select 1 from auth.identities i where i.user_id=u.id)
      and coalesce(u.encrypted_password,'')<>''
      and u.encrypted_password=extensions.crypt(p_password,u.encrypted_password)
  )
$$;

create or replace function private.create_guest_transfer_grant_for_internal(p_guest_user_id uuid)
returns text language plpgsql security definer
set search_path=auth,private,extensions,pg_temp
as $$
declare transfer_token text;
begin
  if not exists(select 1 from auth.users where id=p_guest_user_id and is_anonymous is true) then
    raise exception 'guest_required';
  end if;
  transfer_token:=encode(gen_random_bytes(32),'hex');
  insert into private.guest_transfer_grants(token_hash,guest_user_id,expires_at)
  values(encode(digest(transfer_token,'sha256'),'hex'),p_guest_user_id,now()+interval '15 minutes');
  return transfer_token;
end;
$$;

create or replace function public.verify_pending_registration(p_user_id uuid,p_email text,p_username text,p_password text)
returns boolean language sql security invoker set search_path=public,private,pg_temp
as $$ select private.verify_pending_registration_internal(p_user_id,p_email,p_username,p_password) $$;

create or replace function public.create_guest_transfer_grant_for(p_guest_user_id uuid)
returns text language sql security invoker set search_path=public,private,pg_temp
as $$ select private.create_guest_transfer_grant_for_internal(p_guest_user_id) $$;

revoke all on function private.verify_pending_registration_internal(uuid,text,text,text) from public,anon,authenticated;
revoke all on function private.create_guest_transfer_grant_for_internal(uuid) from public,anon,authenticated;
revoke all on function public.verify_pending_registration(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.create_guest_transfer_grant_for(uuid) from public,anon,authenticated;
grant execute on function private.verify_pending_registration_internal(uuid,text,text,text) to service_role;
grant execute on function private.create_guest_transfer_grant_for_internal(uuid) to service_role;
grant execute on function public.verify_pending_registration(uuid,text,text,text) to service_role;
grant execute on function public.create_guest_transfer_grant_for(uuid) to service_role;

-- V41: printable project reports, revocable sharing, and revision authorship.

alter table public.project_revisions
  add column created_by_user_id uuid references auth.users(id) on delete set null,
  add column created_by_label text not null default 'Utente',
  add column change_summary jsonb not null default '{}'::jsonb;

update public.project_revisions r set
  created_by_user_id=r.owner_user_id,
  created_by_label=coalesce(
    (select nullif(trim(p.display_name),'') from public.profiles p where p.user_id=r.owner_user_id),
    'Utente'
  )
where r.created_by_user_id is null;

alter table public.project_revisions drop constraint if exists project_revisions_reason_check;
alter table public.project_revisions add constraint project_revisions_reason_check
  check (reason in ('manual_save','migration','admin_checkpoint','revision_restore','report_issue','admin_field_location'));

create index project_revisions_created_by_idx
  on public.project_revisions(created_by_user_id,created_at desc);

create table public.project_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  revision_number integer not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_by_user_id uuid references auth.users(id) on delete set null,
  selected_field_ids text[] not null check (cardinality(selected_field_ids) > 0),
  recipient_snapshot jsonb not null default '{}'::jsonb,
  disclaimer_version text not null check (char_length(trim(disclaimer_version)) > 0),
  disclaimer_accepted_at timestamptz not null,
  disclaimer_accepted_by uuid references auth.users(id) on delete set null,
  share_token_hash text not null unique check (
    char_length(share_token_hash)=64 and share_token_hash ~ '^[0-9a-f]{64}$'
  ),
  share_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id,project_id,revision_number),
  foreign key (project_id,revision_number)
    references public.project_revisions(project_id,revision_number) on delete restrict
);

create index project_reports_project_created_idx
  on public.project_reports(project_id,created_at desc);
create index project_reports_owner_created_idx
  on public.project_reports(owner_user_id,created_at desc);

alter table public.project_reports enable row level security;
revoke all on table public.project_reports from public,anon,authenticated;

create policy project_reports_owner_or_admin_select on public.project_reports
for select to authenticated
using ((select auth.uid())=owner_user_id or (select private.is_admin()));

drop function if exists public.create_project_revision(uuid,uuid,bigint,jsonb,text);
drop function if exists private.create_project_revision_internal(uuid,uuid,bigint,jsonb,text);

create or replace function private.create_project_revision_internal(
  p_operation_id uuid,
  p_project_id uuid,
  p_expected_version bigint,
  p_snapshot jsonb,
  p_reason text default 'manual_save',
  p_change_summary jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  current_user_id uuid:=auth.uid();
  project_record public.projects%rowtype;
  response jsonb;
  revision_no integer;
  author_label text;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_reason not in ('manual_save','migration','admin_checkpoint','revision_restore','report_issue') then
    raise exception 'invalid revision reason';
  end if;
  select so.result into response from public.sync_operations so
  where so.operation_id=p_operation_id and so.owner_user_id=current_user_id;
  if found then return response; end if;
  select p.* into project_record from public.projects p where p.id=p_project_id for update;
  if project_record.id is null
     or (project_record.owner_user_id<>current_user_id and not private.is_admin()) then
    raise exception 'project access denied';
  end if;
  if project_record.version<>p_expected_version then
    return jsonb_build_object('status','conflict','projectId',p_project_id,
      'serverVersion',project_record.version);
  end if;
  select coalesce(nullif(trim(p.display_name),''),nullif(trim(p.username),''),'Utente')
    into author_label from public.profiles p where p.user_id=current_user_id;
  author_label:=coalesce(author_label,'Utente');
  revision_no:=project_record.latest_revision_number+1;
  insert into public.project_revisions(
    project_id,owner_user_id,revision_number,snapshot_schema_version,snapshot,reason,
    created_by_user_id,created_by_label,change_summary
  ) values (
    p_project_id,project_record.owner_user_id,revision_no,
    coalesce((p_snapshot->>'schemaVersion')::integer,2),p_snapshot,p_reason,
    current_user_id,author_label,coalesce(p_change_summary,'{}'::jsonb)
  );
  update public.projects set latest_revision_number=revision_no,status='saved',updated_at=now()
    where id=p_project_id;
  response:=jsonb_build_object('status','revision_created','projectId',p_project_id,
    'version',project_record.version,'revisionNumber',revision_no,
    'createdBy',author_label);
  insert into public.sync_operations(
    operation_id,owner_user_id,project_id,operation_type,client_version,result
  ) values (
    p_operation_id,current_user_id,p_project_id,'create_revision',p_expected_version,response
  );
  return response;
end;
$$;

create or replace function public.create_project_revision(
  p_operation_id uuid,
  p_project_id uuid,
  p_expected_version bigint,
  p_snapshot jsonb,
  p_reason text default 'manual_save',
  p_change_summary jsonb default '{}'::jsonb
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.create_project_revision_internal(
    p_operation_id,p_project_id,p_expected_version,p_snapshot,p_reason,p_change_summary
  )
$$;

create or replace function private.issue_project_report_internal(
  p_project_id uuid,
  p_revision_number integer,
  p_selected_field_ids text[],
  p_recipient_snapshot jsonb,
  p_disclaimer_version text,
  p_disclaimer_accepted_at timestamptz,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  current_user_id uuid:=auth.uid();
  project_record public.projects%rowtype;
  revision_record public.project_revisions%rowtype;
  report_record public.project_reports%rowtype;
  normalized_ids text[];
  matched_fields integer;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  select p.* into project_record from public.projects p where p.id=p_project_id;
  if project_record.id is null
     or (project_record.owner_user_id<>current_user_id and not private.is_admin()) then
    raise exception 'project access denied';
  end if;
  select r.* into revision_record from public.project_revisions r
    where r.project_id=p_project_id and r.revision_number=p_revision_number;
  if revision_record.id is null then raise exception 'revision not found'; end if;
  select array_agg(value order by value) into normalized_ids
    from (select distinct trim(value) value from unnest(p_selected_field_ids) value
          where trim(value)<>'') selected;
  if coalesce(cardinality(normalized_ids),0)=0 then raise exception 'field selection required'; end if;
  select count(*) into matched_fields
    from jsonb_array_elements(coalesce(revision_record.snapshot->'fields','[]'::jsonb)) field
    where coalesce(field->>'clientFieldId',field->>'id')=any(normalized_ids);
  if matched_fields<>cardinality(normalized_ids) then raise exception 'invalid field selection'; end if;
  if coalesce(trim(p_disclaimer_version),'')='' or p_disclaimer_accepted_at is null then
    raise exception 'disclaimer acceptance required';
  end if;
  if coalesce(p_token_hash,'') !~ '^[0-9a-f]{64}$' then raise exception 'invalid share token hash'; end if;
  insert into public.project_reports(
    project_id,revision_number,owner_user_id,created_by_user_id,selected_field_ids,
    recipient_snapshot,disclaimer_version,disclaimer_accepted_at,disclaimer_accepted_by,
    share_token_hash
  ) values (
    p_project_id,p_revision_number,project_record.owner_user_id,current_user_id,normalized_ids,
    coalesce(p_recipient_snapshot,'{}'::jsonb),trim(p_disclaimer_version),
    p_disclaimer_accepted_at,current_user_id,p_token_hash
  ) returning * into report_record;
  return jsonb_build_object(
    'status','issued','reportId',report_record.id,'projectId',p_project_id,
    'revisionNumber',p_revision_number,'createdAt',report_record.created_at
  );
end;
$$;

create or replace function public.issue_project_report(
  p_project_id uuid,
  p_revision_number integer,
  p_selected_field_ids text[],
  p_recipient_snapshot jsonb,
  p_disclaimer_version text,
  p_disclaimer_accepted_at timestamptz,
  p_token_hash text
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.issue_project_report_internal(
    p_project_id,p_revision_number,p_selected_field_ids,p_recipient_snapshot,
    p_disclaimer_version,p_disclaimer_accepted_at,p_token_hash
  )
$$;

create or replace function private.get_shared_project_report_internal(
  p_report_id uuid,
  p_token text
)
returns jsonb
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  report_record public.project_reports%rowtype;
  revision_record public.project_revisions%rowtype;
  project_record public.projects%rowtype;
  public_fields jsonb;
  response jsonb;
begin
  if coalesce(p_token,'') !~ '^[0-9a-f]{64}$' then return null; end if;
  select r.* into report_record from public.project_reports r
    where r.id=p_report_id
      and r.share_revoked_at is null
      and r.share_token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  if report_record.id is null then return null; end if;
  select r.* into revision_record from public.project_revisions r
    where r.project_id=report_record.project_id
      and r.revision_number=report_record.revision_number;
  select p.* into project_record from public.projects p where p.id=report_record.project_id;
  if revision_record.id is null or project_record.id is null then return null; end if;
  select coalesce(jsonb_agg(field order by ordinal),'[]'::jsonb) into public_fields
    from jsonb_array_elements(coalesce(revision_record.snapshot->'fields','[]'::jsonb))
      with ordinality selected(field,ordinal)
    where coalesce(field->>'clientFieldId',field->>'id')=any(report_record.selected_field_ids);
  response:=jsonb_build_object(
    'reportId',report_record.id,
    'projectId',report_record.project_id,
    'projectName',revision_record.snapshot->>'name',
    'revisionNumber',report_record.revision_number,
    'currentRevisionNumber',project_record.latest_revision_number,
    'selectedFieldIds',to_jsonb(report_record.selected_field_ids),
    'fields',public_fields,
    'createdAt',report_record.created_at,
    'disclaimerVersion',report_record.disclaimer_version
  );
  return response;
end;
$$;

create or replace function public.get_shared_project_report(p_report_id uuid,p_token text)
returns jsonb
language sql
security invoker
stable
set search_path=''
as $$ select private.get_shared_project_report_internal(p_report_id,p_token) $$;

create or replace function private.revoke_project_report_internal(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  current_user_id uuid:=auth.uid();
  report_record public.project_reports%rowtype;
  project_record public.projects%rowtype;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  select r.* into report_record from public.project_reports r where r.id=p_report_id for update;
  if report_record.id is null then raise exception 'report not found'; end if;
  select p.* into project_record from public.projects p where p.id=report_record.project_id;
  if project_record.id is null
     or (project_record.owner_user_id<>current_user_id and not private.is_admin()) then
    raise exception 'project access denied';
  end if;
  update public.project_reports set share_revoked_at=coalesce(share_revoked_at,now())
    where id=p_report_id;
  return jsonb_build_object('status','revoked','reportId',p_report_id);
end;
$$;

create or replace function public.revoke_project_report(p_report_id uuid)
returns jsonb
language sql
security invoker
set search_path=''
as $$ select private.revoke_project_report_internal(p_report_id) $$;

create or replace function private.list_project_revision_history_internal(p_project_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  current_user_id uuid:=auth.uid();
  project_record public.projects%rowtype;
  response jsonb;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  select p.* into project_record from public.projects p where p.id=p_project_id;
  if project_record.id is null
     or (project_record.owner_user_id<>current_user_id and not private.is_admin()) then
    raise exception 'project access denied';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'revisionNumber',r.revision_number,
    'reason',r.reason,
    'createdAt',r.created_at,
    'createdBy',r.created_by_label,
    'changeSummary',r.change_summary
  ) order by r.revision_number desc),'[]'::jsonb)
    into response from public.project_revisions r where r.project_id=p_project_id;
  return response;
end;
$$;

create or replace function public.list_project_revision_history(p_project_id uuid)
returns jsonb
language sql
security invoker
stable
set search_path=''
as $$ select private.list_project_revision_history_internal(p_project_id) $$;

create or replace function private.can_edit_project_internal(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path=''
as $$
  select auth.uid() is not null and (auth.jwt()->>'is_anonymous')='false' and exists(
    select 1 from public.projects p
    where p.id=p_project_id
      and (p.owner_user_id=auth.uid() or private.is_admin())
  )
$$;

create or replace function public.can_edit_project(p_project_id uuid)
returns boolean
language sql
security invoker
stable
set search_path=''
as $$ select private.can_edit_project_internal(p_project_id) $$;

revoke all on function private.create_project_revision_internal(uuid,uuid,bigint,jsonb,text,jsonb) from public,anon;
revoke all on function private.issue_project_report_internal(uuid,integer,text[],jsonb,text,timestamptz,text) from public,anon;
revoke all on function private.get_shared_project_report_internal(uuid,text) from public;
revoke all on function private.revoke_project_report_internal(uuid) from public,anon;
revoke all on function private.list_project_revision_history_internal(uuid) from public,anon;
revoke all on function private.can_edit_project_internal(uuid) from public,anon;

revoke all on function public.create_project_revision(uuid,uuid,bigint,jsonb,text,jsonb) from public,anon;
revoke all on function public.issue_project_report(uuid,integer,text[],jsonb,text,timestamptz,text) from public,anon;
revoke all on function public.get_shared_project_report(uuid,text) from public,anon,authenticated;
revoke all on function public.revoke_project_report(uuid) from public,anon;
revoke all on function public.list_project_revision_history(uuid) from public,anon;
revoke all on function public.can_edit_project(uuid) from public,anon;

grant execute on function private.create_project_revision_internal(uuid,uuid,bigint,jsonb,text,jsonb) to authenticated;
grant execute on function private.issue_project_report_internal(uuid,integer,text[],jsonb,text,timestamptz,text) to authenticated;
grant execute on function private.get_shared_project_report_internal(uuid,text) to anon,authenticated;
grant execute on function private.revoke_project_report_internal(uuid) to authenticated;
grant execute on function private.list_project_revision_history_internal(uuid) to authenticated;
grant execute on function private.can_edit_project_internal(uuid) to authenticated;

grant execute on function public.create_project_revision(uuid,uuid,bigint,jsonb,text,jsonb) to authenticated;
grant execute on function public.issue_project_report(uuid,integer,text[],jsonb,text,timestamptz,text) to authenticated;
grant execute on function public.get_shared_project_report(uuid,text) to anon,authenticated;

-- Keep historical human-readable codes usable when an older client created a
-- duplicate project row. The alias is private and public access remains limited
-- to the existing rate-limited RPC.
create table if not exists private.project_public_code_aliases (
  public_code text primary key check (public_code ~ '^VO-[0-9]{7}$'),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists project_public_code_aliases_project_idx
  on private.project_public_code_aliases(project_id);

revoke all on table private.project_public_code_aliases from public,anon,authenticated;

insert into private.project_public_code_aliases(public_code,project_id)
select 'VO-5195947',p.id from public.projects p where p.public_code='VO-5949699'
on conflict (public_code) do update set project_id=excluded.project_id;

create or replace function private.get_public_project_by_code_internal(p_public_code text)
returns jsonb
language plpgsql
security definer
volatile
set search_path=''
as $$
declare
  headers jsonb;
  requester text;
  requester_hash_value text;
  normalized_code text:=upper(trim(coalesce(p_public_code,'')));
  recent_attempts integer;
  resolved_project_id uuid;
  project_record public.projects%rowtype;
  revision_record public.project_revisions%rowtype;
  selected_fields jsonb;
  normalized_fields jsonb;
begin
  begin
    headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  exception when others then headers:='{}'::jsonb;
  end;
  requester:=nullif(trim(split_part(coalesce(headers->>'x-forwarded-for',''),',',1)),'');
  requester:=coalesce(requester,auth.uid()::text,nullif(headers->>'user-agent',''),'unknown');
  requester_hash_value:=encode(extensions.digest(requester,'sha256'),'hex');
  delete from private.project_public_lookup_attempts
  where requester_hash=requester_hash_value and attempted_at<now()-interval '1 day';
  select count(*) into recent_attempts from private.project_public_lookup_attempts
  where requester_hash=requester_hash_value and attempted_at>=now()-interval '10 minutes';
  if recent_attempts>=12 then return null; end if;
  if normalized_code !~ '^VO-[0-9]{7}$' then
    insert into private.project_public_lookup_attempts(requester_hash,successful)
    values(requester_hash_value,false);
    return null;
  end if;

  select a.project_id into resolved_project_id
  from private.project_public_code_aliases a
  where a.public_code=normalized_code;
  if resolved_project_id is null then
    select p.id into resolved_project_id
    from public.projects p
    where p.public_code=normalized_code;
  end if;

  select p.* into project_record from public.projects p
  where p.id=resolved_project_id and p.deleted_at is null
    and p.status in ('saved','pdf_downloaded','quote_requested','contacted','client')
  limit 1;
  if project_record.id is null then
    insert into private.project_public_lookup_attempts(requester_hash,successful)
    values(requester_hash_value,false);
    return null;
  end if;

  select r.* into revision_record from public.project_revisions r
  where r.project_id=project_record.id
  order by r.revision_number desc
  limit 1;
  if revision_record.id is not null then
    selected_fields:=revision_record.snapshot->'fields';
  else
    selected_fields:=to_jsonb(project_record.field_plans);
  end if;

  select coalesce(jsonb_agg(
    pf.design_data || jsonb_build_object(
      'id',pf.client_field_id,
      'clientFieldId',pf.client_field_id,
      'label',pf.label,
      'geometry',case when pf.geometry is null then 'null'::jsonb
        else (extensions.st_asgeojson(pf.geometry)::jsonb)->'coordinates'->0 end,
      'exclusions',pf.exclusions,
      'displayOrder',pf.display_order,
      'metrics',jsonb_build_object(
        'areaM2',pf.gross_area_m2,
        'grossAreaM2',pf.gross_area_m2,
        'netAreaM2',pf.net_area_m2,
        'simulatedPlants',pf.simulated_plants,
        'commercialPlants25',pf.commercial_plants_25,
        'rowCount',pf.row_count,
        'rowLinearM',pf.row_linear_m,
        'headPosts',pf.head_posts,
        'intermediatePosts',pf.intermediate_posts,
        'totalPosts',pf.total_posts
      )
    )
  ),'[]'::jsonb)
  into normalized_fields
  from (
    select active_fields.* from public.project_fields active_fields
    where active_fields.project_id=project_record.id and active_fields.deleted_at is null
    order by active_fields.display_order,active_fields.created_at,active_fields.id
  ) pf;

  if jsonb_typeof(selected_fields) is distinct from 'array' then
    selected_fields:=normalized_fields;
  elsif jsonb_typeof(normalized_fields) = 'array'
    and jsonb_array_length(normalized_fields) > jsonb_array_length(selected_fields) then
    selected_fields:=normalized_fields;
  end if;

  if jsonb_typeof(selected_fields) is distinct from 'array' or jsonb_array_length(selected_fields)=0 then
    insert into private.project_public_lookup_attempts(requester_hash,successful)
    values(requester_hash_value,false);
    return null;
  end if;
  insert into private.project_public_lookup_attempts(requester_hash,successful)
  values(requester_hash_value,true);
  return jsonb_build_object(
    'projectCode',normalized_code,
    'projectId',project_record.id,
    'projectName',coalesce(revision_record.snapshot->>'name',project_record.name),
    'revisionNumber',coalesce(revision_record.revision_number,project_record.latest_revision_number,0),
    'currentRevisionNumber',project_record.latest_revision_number,
    'fields',selected_fields,
    'createdAt',coalesce(revision_record.created_at,project_record.updated_at),
    'disclaimerVersion','public-code-v1'
  );
end;
$$;

revoke all on function private.get_public_project_by_code_internal(text) from public,anon,authenticated;

-- V42: memorable public project IDs and rate-limited read-only lookup.

create table if not exists private.project_public_code_registry (
  code text primary key check (code ~ '^VO-[0-9]{7}$'),
  created_at timestamptz not null default now()
);
revoke all on table private.project_public_code_registry from public,anon,authenticated;

create or replace function private.generate_project_public_code()
returns text
language plpgsql
security definer
volatile
set search_path=''
as $$
declare
  candidate text;
begin
  loop
    candidate := 'VO-' || lpad((floor(random()*10000000)::bigint)::text,7,'0');
    insert into private.project_public_code_registry(code)
      values(candidate) on conflict do nothing;
    if found then return candidate; end if;
  end loop;
end;
$$;

revoke all on function private.generate_project_public_code() from public,anon;
grant execute on function private.generate_project_public_code() to authenticated;

insert into private.project_public_code_registry(code)
select p.public_code from public.projects p
where p.public_code ~ '^VO-[0-9]{7}$'
on conflict do nothing;

do $$
declare
  project_record record;
  next_code text;
begin
  for project_record in
    select p.id from public.projects p
    where p.public_code !~ '^VO-[0-9]{7}$'
    order by p.created_at,p.id
  loop
    loop
      begin
        next_code:=private.generate_project_public_code();
        update public.projects set public_code=next_code where id=project_record.id;
        exit;
      exception when unique_violation then
        null;
      end;
    end loop;
  end loop;
end;
$$;

alter table public.projects
  alter column public_code set default private.generate_project_public_code();
alter table public.projects drop constraint if exists projects_public_code_human_check;
alter table public.projects add constraint projects_public_code_human_check
  check (public_code ~ '^VO-[0-9]{7}$');

create table if not exists private.project_public_lookup_attempts (
  id bigint generated always as identity primary key,
  requester_hash text not null,
  attempted_at timestamptz not null default now(),
  successful boolean not null default false
);
create index if not exists project_public_lookup_attempts_requester_idx
  on private.project_public_lookup_attempts(requester_hash,attempted_at desc);
revoke all on table private.project_public_lookup_attempts from public,anon,authenticated;

create or replace function private.get_public_project_by_code_internal(p_public_code text)
returns jsonb
language plpgsql
security definer
volatile
set search_path=''
as $$
declare
  headers jsonb;
  requester text;
  requester_hash_value text;
  normalized_code text:=upper(trim(coalesce(p_public_code,'')));
  recent_attempts integer;
  resolved_project_id uuid;
  project_record public.projects%rowtype;
  revision_record public.project_revisions%rowtype;
  selected_fields jsonb;
  normalized_fields jsonb;
begin
  begin
    headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  exception when others then headers:='{}'::jsonb;
  end;
  requester:=nullif(trim(split_part(coalesce(headers->>'x-forwarded-for',''),',',1)),'');
  requester:=coalesce(requester,auth.uid()::text,nullif(headers->>'user-agent',''),'unknown');
  requester_hash_value:=encode(extensions.digest(requester,'sha256'),'hex');
  delete from private.project_public_lookup_attempts
  where requester_hash=requester_hash_value and attempted_at<now()-interval '1 day';
  select count(*) into recent_attempts from private.project_public_lookup_attempts
  where requester_hash=requester_hash_value and attempted_at>=now()-interval '10 minutes';
  if recent_attempts>=12 then return null; end if;
  if normalized_code !~ '^VO-[0-9]{7}$' then
    insert into private.project_public_lookup_attempts(requester_hash,successful)
    values(requester_hash_value,false);
    return null;
  end if;

  select a.project_id into resolved_project_id
  from private.project_public_code_aliases a
  where a.public_code=normalized_code;
  if resolved_project_id is null then
    select p.id into resolved_project_id
    from public.projects p
    where p.public_code=normalized_code;
  end if;

  select p.* into project_record from public.projects p
  where p.id=resolved_project_id and p.deleted_at is null
    and p.status in ('saved','pdf_downloaded','quote_requested','contacted','client')
  limit 1;
  if project_record.id is null then
    insert into private.project_public_lookup_attempts(requester_hash,successful)
    values(requester_hash_value,false);
    return null;
  end if;

  select r.* into revision_record from public.project_revisions r
  where r.project_id=project_record.id
  order by r.revision_number desc
  limit 1;
  if revision_record.id is not null then
    selected_fields:=revision_record.snapshot->'fields';
  else
    selected_fields:=to_jsonb(project_record.field_plans);
  end if;

  select coalesce(jsonb_agg(
    pf.design_data || jsonb_build_object(
      'id',pf.client_field_id,
      'clientFieldId',pf.client_field_id,
      'label',pf.label,
      'geometry',case when pf.geometry is null then 'null'::jsonb
        else (extensions.st_asgeojson(pf.geometry)::jsonb)->'coordinates'->0 end,
      'exclusions',pf.exclusions,
      'displayOrder',pf.display_order,
      'metrics',jsonb_build_object(
        'areaM2',pf.gross_area_m2,
        'grossAreaM2',pf.gross_area_m2,
        'netAreaM2',pf.net_area_m2,
        'simulatedPlants',pf.simulated_plants,
        'commercialPlants25',pf.commercial_plants_25,
        'rowCount',pf.row_count,
        'rowLinearM',pf.row_linear_m,
        'headPosts',pf.head_posts,
        'intermediatePosts',pf.intermediate_posts,
        'totalPosts',pf.total_posts
      )
    )
  ),'[]'::jsonb)
  into normalized_fields
  from (
    select active_fields.* from public.project_fields active_fields
    where active_fields.project_id=project_record.id and active_fields.deleted_at is null
    order by active_fields.display_order,active_fields.created_at,active_fields.id
  ) pf;

  if jsonb_typeof(selected_fields) is distinct from 'array' then
    selected_fields:=normalized_fields;
  elsif jsonb_typeof(normalized_fields) = 'array'
    and jsonb_array_length(normalized_fields) > jsonb_array_length(selected_fields) then
    selected_fields:=normalized_fields;
  end if;

  if jsonb_typeof(selected_fields) is distinct from 'array' or jsonb_array_length(selected_fields)=0 then
    insert into private.project_public_lookup_attempts(requester_hash,successful)
    values(requester_hash_value,false);
    return null;
  end if;
  insert into private.project_public_lookup_attempts(requester_hash,successful)
  values(requester_hash_value,true);
  return jsonb_build_object(
    'projectCode',normalized_code,
    'projectId',project_record.id,
    'projectName',coalesce(revision_record.snapshot->>'name',project_record.name),
    'revisionNumber',coalesce(revision_record.revision_number,project_record.latest_revision_number,0),
    'currentRevisionNumber',project_record.latest_revision_number,
    'fields',selected_fields,
    'createdAt',coalesce(revision_record.created_at,project_record.updated_at),
    'disclaimerVersion','public-code-v1'
  );
end;
$$;

revoke all on function private.get_public_project_by_code_internal(text) from public,anon,authenticated;

create or replace function public.get_public_project_by_code(p_public_code text)
returns jsonb
language sql
security definer
volatile
set search_path=''
as $$ select private.get_public_project_by_code_internal(p_public_code) $$;

revoke all on function private.get_public_project_by_code_internal(text) from public,anon,authenticated;
revoke all on function public.get_public_project_by_code(text) from public;
grant execute on function public.get_public_project_by_code(text) to anon,authenticated;

grant execute on function public.revoke_project_report(uuid) to authenticated;
grant execute on function public.list_project_revision_history(uuid) to authenticated;
grant execute on function public.can_edit_project(uuid) to authenticated;

-- V41 follow-up: disallow even policy-level direct access to report metadata.
drop policy if exists project_reports_owner_or_admin_select on public.project_reports;

-- Allow the public wrapper, but not the anon role, to access the private lookup.
create or replace function public.get_shared_project_report(p_report_id uuid,p_token text)
returns jsonb
language sql
security definer
stable
set search_path=''
as $$ select private.get_shared_project_report_internal(p_report_id,p_token) $$;
revoke all on function public.get_shared_project_report(uuid,text) from public;
grant execute on function public.get_shared_project_report(uuid,text) to anon,authenticated;

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

create or replace function public.admin_set_field_location(
  p_operation_id uuid,
  p_project_id uuid,
  p_client_field_id text,
  p_location_label text,
  p_municipality text,
  p_province text,
  p_region text
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.admin_set_field_location_internal(
    p_operation_id,p_project_id,p_client_field_id,p_location_label,
    p_municipality,p_province,p_region
  )
$$;

revoke all on function private.admin_set_field_location_internal(uuid,uuid,text,text,text,text,text) from public,anon;
revoke all on function public.admin_set_field_location(uuid,uuid,text,text,text,text,text) from public,anon;
grant execute on function private.admin_set_field_location_internal(uuid,uuid,text,text,text,text,text) to authenticated;
grant execute on function public.admin_set_field_location(uuid,uuid,text,text,text,text,text) to authenticated;
