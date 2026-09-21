-- Follow-up for Supabase advisor findings after the Phase A rollout.
create index sync_operations_project_idx on public.sync_operations(project_id);

drop policy profiles_owner_insert on public.profiles;
create policy profiles_owner_insert on public.profiles for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and owner_kind = case
    when coalesce(((select auth.jwt())->'app_metadata'->>'role')='admin',false)
      then 'admin'::public.owner_kind
    when coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
      then 'guest'::public.owner_kind
    else 'user'::public.owner_kind
  end
);

drop policy profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and owner_kind = case
    when coalesce(((select auth.jwt())->'app_metadata'->>'role')='admin',false)
      then 'admin'::public.owner_kind
    when coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
      then 'guest'::public.owner_kind
    else 'user'::public.owner_kind
  end
);
