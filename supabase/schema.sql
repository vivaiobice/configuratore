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
