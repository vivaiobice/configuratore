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
  check (reason in ('manual_save','migration','admin_checkpoint','revision_restore','report_issue'));

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
grant execute on function public.revoke_project_report(uuid) to authenticated;
grant execute on function public.list_project_revision_history(uuid) to authenticated;
grant execute on function public.can_edit_project(uuid) to authenticated;
