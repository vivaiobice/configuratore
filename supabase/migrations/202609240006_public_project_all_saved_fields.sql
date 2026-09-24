-- Include every saved field in code-based consultation, even when its perimeter
-- is incomplete. The document can mark incomplete fields rather than silently
-- dropping them. Preserve saved-only visibility and lookup rate limits.
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
  selected_fields jsonb;
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
  select p.* into project_record from public.projects p
  where p.public_code=normalized_code and p.deleted_at is null
    and p.status in ('saved','pdf_downloaded','quote_requested','contacted','client')
  limit 1;
  if project_record.id is null then
    insert into private.project_public_lookup_attempts(requester_hash,successful)
    values(requester_hash_value,false);
    return null;
  end if;
  if project_record.latest_revision_number>0 then
    select r.* into revision_record from public.project_revisions r
    where r.project_id=project_record.id and r.revision_number=project_record.latest_revision_number;
    selected_fields:=revision_record.snapshot->'fields';
  else
    selected_fields:=to_jsonb(project_record.field_plans);
  end if;
  if jsonb_typeof(selected_fields) is distinct from 'array' or jsonb_array_length(selected_fields)=0 then
    insert into private.project_public_lookup_attempts(requester_hash,successful)
    values(requester_hash_value,false);
    return null;
  end if;
  insert into private.project_public_lookup_attempts(requester_hash,successful)
  values(requester_hash_value,true);
  return jsonb_build_object(
    'projectCode',project_record.public_code,
    'projectId',project_record.id,
    'projectName',coalesce(revision_record.snapshot->>'name',project_record.name),
    'revisionNumber',coalesce(revision_record.revision_number,0),
    'currentRevisionNumber',project_record.latest_revision_number,
    'fields',selected_fields,
    'createdAt',coalesce(revision_record.created_at,project_record.updated_at),
    'disclaimerVersion','public-code-v1'
  );
end;
$$;

revoke all on function private.get_public_project_by_code_internal(text) from public,anon,authenticated;
