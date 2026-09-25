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
  project_record public.projects%rowtype;
  revision_record public.project_revisions%rowtype;
  public_fields jsonb;
  response jsonb;
begin
  begin
    headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  exception when others then
    headers:='{}'::jsonb;
  end;

  requester:=nullif(trim(split_part(coalesce(headers->>'x-forwarded-for',''),',',1)),'');
  requester:=coalesce(requester,auth.uid()::text,nullif(headers->>'user-agent',''),'unknown');
  requester_hash_value:=encode(extensions.digest(requester,'sha256'),'hex');

  delete from private.project_public_lookup_attempts
    where requester_hash=requester_hash_value
      and attempted_at<now()-interval '1 day';

  select count(*) into recent_attempts
  from private.project_public_lookup_attempts
  where requester_hash=requester_hash_value
    and attempted_at>=now()-interval '10 minutes';

  if recent_attempts>=12 then return null; end if;

  if normalized_code !~ '^VO-[0-9]{7}$' then
    insert into private.project_public_lookup_attempts(requester_hash,successful)
      values(requester_hash_value,false);
    return null;
  end if;

  select p.* into project_record
  from public.projects p
  where p.public_code=normalized_code
    and p.deleted_at is null
    and p.latest_revision_number>0
    and p.status in ('saved','pdf_downloaded','quote_requested','contacted','client')
  limit 1;

  if project_record.id is null then
    insert into private.project_public_lookup_attempts(requester_hash,successful)
      values(requester_hash_value,false);
    return null;
  end if;

  select r.* into revision_record
  from public.project_revisions r
  where r.project_id=project_record.id
    and r.revision_number=project_record.latest_revision_number;

  if revision_record.id is null then
    insert into private.project_public_lookup_attempts(requester_hash,successful)
      values(requester_hash_value,false);
    return null;
  end if;

  select coalesce(jsonb_agg(field order by ordinal),'[]'::jsonb) into public_fields
  from jsonb_array_elements(coalesce(revision_record.snapshot->'fields','[]'::jsonb))
    with ordinality selected(field,ordinal)
  where jsonb_typeof(field->'geometry')='array'
    and jsonb_array_length(field->'geometry')>=4;

  response:=jsonb_build_object(
    'projectCode',project_record.public_code,
    'projectId',project_record.id,
    'projectName',revision_record.snapshot->>'name',
    'revisionNumber',revision_record.revision_number,
    'currentRevisionNumber',project_record.latest_revision_number,
    'fields',public_fields,
    'createdAt',revision_record.created_at,
    'disclaimerVersion','public-code-v1'
  );

  insert into private.project_public_lookup_attempts(requester_hash,successful)
    values(requester_hash_value,true);
  return response;
end;
$$;

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

