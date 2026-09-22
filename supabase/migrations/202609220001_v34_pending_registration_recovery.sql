-- Recover an interrupted anonymous-to-permanent account promotion without
-- exposing password hashes or allowing callers to claim another Guest.

create or replace function private.verify_pending_registration_internal(
  p_user_id uuid,
  p_email text,
  p_username text,
  p_password text
)
returns boolean
language sql
security definer
stable
set search_path = auth, public, private, extensions, pg_temp
as $$
  select exists (
    select 1
    from auth.users u
    join public.profiles p on p.user_id = u.id
    where u.id = p_user_id
      and u.is_anonymous is true
      and u.email is null
      and lower(coalesce(u.email_change,'')) = lower(trim(p_email))
      and p.owner_kind = 'guest'
      and lower(coalesce(p.username,'')) = lower(trim(p_username))
      and not exists (select 1 from auth.identities i where i.user_id = u.id)
      and coalesce(u.encrypted_password,'') <> ''
      and u.encrypted_password = extensions.crypt(p_password,u.encrypted_password)
  )
$$;

create or replace function private.create_guest_transfer_grant_for_internal(
  p_guest_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = auth, private, extensions, pg_temp
as $$
declare
  transfer_token text;
begin
  if not exists (
    select 1 from auth.users
    where id = p_guest_user_id and is_anonymous is true
  ) then
    raise exception 'guest_required';
  end if;

  transfer_token := encode(gen_random_bytes(32),'hex');
  insert into private.guest_transfer_grants(token_hash,guest_user_id,expires_at)
  values(encode(digest(transfer_token,'sha256'),'hex'),p_guest_user_id,now()+interval '15 minutes');
  return transfer_token;
end;
$$;

create or replace function public.verify_pending_registration(
  p_user_id uuid,
  p_email text,
  p_username text,
  p_password text
)
returns boolean
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.verify_pending_registration_internal(p_user_id,p_email,p_username,p_password)
$$;

create or replace function public.create_guest_transfer_grant_for(p_guest_user_id uuid)
returns text
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.create_guest_transfer_grant_for_internal(p_guest_user_id)
$$;

revoke all on function private.verify_pending_registration_internal(uuid,text,text,text) from public,anon,authenticated;
revoke all on function private.create_guest_transfer_grant_for_internal(uuid) from public,anon,authenticated;
revoke all on function public.verify_pending_registration(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.create_guest_transfer_grant_for(uuid) from public,anon,authenticated;

grant execute on function private.verify_pending_registration_internal(uuid,text,text,text) to service_role;
grant execute on function private.create_guest_transfer_grant_for_internal(uuid) to service_role;
grant execute on function public.verify_pending_registration(uuid,text,text,text) to service_role;
grant execute on function public.create_guest_transfer_grant_for(uuid) to service_role;
