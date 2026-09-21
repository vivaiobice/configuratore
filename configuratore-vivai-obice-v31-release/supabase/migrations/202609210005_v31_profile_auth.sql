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
