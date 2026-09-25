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
