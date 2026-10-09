-- Additive Conteggi schema. No project/editor writes. Mutations use service-only CAS routines.
create table public.counts_lists (
 id uuid primary key, owner_user_id uuid not null references auth.users(id),
 environment text not null check(environment in ('TEST','LIVE')),
 data jsonb not null check(char_length(data->>'title') between 1 and 200 and data->>'status' in ('open','closed')),
 revision bigint not null check(revision>0), deleted_at timestamptz, updated_at timestamptz not null default now(),
 unique(id,owner_user_id,environment)
);
create table public.counts_entries (
 id uuid primary key,list_id uuid not null,owner_user_id uuid not null references auth.users(id),environment text not null check(environment in ('TEST','LIVE')),
 data jsonb not null check(data->>'category' in ('plants','posts','other') and char_length(data->>'title') between 1 and 200 and char_length(data->>'notes')<=10000 and (data->>'quantity')::numeric between 0 and 9007199254740991 and (data->>'quantity')::numeric=trunc((data->>'quantity')::numeric)),
 revision bigint not null check(revision>0),deleted_at timestamptz,updated_at timestamptz not null default now(),
 foreign key(list_id,owner_user_id,environment) references public.counts_lists(id,owner_user_id,environment) on update cascade
);
create table public.counts_operations (owner_user_id uuid not null references auth.users(id),environment text not null,operation_id uuid not null,payload_digest text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(owner_user_id,environment,operation_id));
create table public.counts_notice_receipts (owner_user_id uuid not null references auth.users(id),environment text not null,version text not null,acknowledged_at timestamptz not null default now(),primary key(owner_user_id,environment,version));
create table public.counts_submissions (id uuid primary key,owner_user_id uuid not null references auth.users(id),environment text not null,payload_digest text not null,snapshot jsonb not null,contact jsonb not null,message text not null check(char_length(message)<=5000),notice_version text not null,accepted_at timestamptz not null default now(),unique(id,owner_user_id,environment));
create table public.counts_deliveries (submission_id uuid primary key references public.counts_submissions(id),owner_user_id uuid not null,environment text not null,state text not null default 'pending' check(state in ('pending','sending','provider_accepted','failed','uncertain')),provider_id text,body jsonb,first_attempt_at timestamptz,lease_until timestamptz,attempts integer not null default 0,provider_accepted_at timestamptz,last_error text,foreign key(submission_id,owner_user_id,environment) references public.counts_submissions(id,owner_user_id,environment) on update cascade);
create index counts_lists_owner_env_updated on public.counts_lists(owner_user_id,environment,updated_at,id);
create index counts_entries_owner_env_list on public.counts_entries(owner_user_id,environment,list_id,id);
create index counts_submissions_owner_env_date on public.counts_submissions(owner_user_id,environment,accepted_at,id);
do $$ declare tbl text;begin
 foreach tbl in array array['counts_lists','counts_entries','counts_operations','counts_notice_receipts','counts_submissions','counts_deliveries'] loop
 execute format('alter table public.%I enable row level security',tbl);
 execute format('revoke all on public.%I from anon, authenticated',tbl);
 execute format('grant select on public.%I to authenticated',tbl);
 execute format('grant all on public.%I to service_role',tbl);
 execute format('create policy counts_owner_read on public.%I for select to authenticated using (owner_user_id = (select auth.uid()))',tbl);
 end loop;
end $$;

create function public.counts_apply(p_owner uuid,p_environment text,p_operation uuid,p_kind text,p_expected bigint,p_value jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare entity uuid;previous record;digest text;cached record;clean jsonb;result jsonb;new_revision bigint;changed_at timestamptz:=now();parent record;
begin
 if p_environment not in ('TEST','LIVE') or p_kind not in ('list','count') or p_expected<0 then raise exception 'VALIDATION_ERROR';end if;
 entity:=case when p_kind='list' then (p_value->>'listId')::uuid else (p_value->>'countId')::uuid end;
 if entity is null then raise exception 'VALIDATION_ERROR';end if;
 digest:=encode(sha256(convert_to(jsonb_build_object('kind',p_kind,'expected',p_expected,'value',p_value)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||p_environment||p_operation::text,0));
 select * into cached from public.counts_operations where owner_user_id=p_owner and environment=p_environment and operation_id=p_operation;
 if found then if cached.payload_digest<>digest then raise exception 'VALIDATION_ERROR';end if;return cached.result;end if;
 perform pg_advisory_xact_lock(hashtextextended('counts:'||entity::text,0));
 clean:=p_value-'revision'-'localRevision'-'syncState'-'updatedAt'-'conflict';
 if p_kind='list' then
 select * into previous from public.counts_lists where id=entity;
 else
 select * into previous from public.counts_entries where id=entity;
 select * into parent from public.counts_lists where id=(clean->>'listId')::uuid;
 if parent.id is null or parent.owner_user_id<>p_owner or parent.environment<>p_environment or (parent.deleted_at is not null and not coalesce((clean->>'deleted')::boolean,false)) then raise exception 'NOT_FOUND_OR_FORBIDDEN';end if;
 if previous.id is not null and (previous.list_id<>(clean->>'listId')::uuid or previous.data->>'category'<>clean->>'category') then raise exception 'VALIDATION_ERROR';end if;
 if clean->'field'->>'associationStatus'='verified' and not exists(select 1 from public.project_fields f join public.projects p on p.id=f.project_id where p.id=(clean->'field'->>'projectId')::uuid and f.client_field_id=clean->'field'->>'fieldId' and p.owner_user_id=p_owner and f.owner_user_id=p_owner and p.environment::text=p_environment and p.deleted_at is null and f.deleted_at is null) then
 if previous.id is not null and previous.data->'field'->>'projectId'=clean->'field'->>'projectId' and previous.data->'field'->>'fieldId'=clean->'field'->>'fieldId' then clean:=jsonb_set(clean,'{field}',jsonb_build_object('projectId',clean->'field'->>'projectId','fieldId',clean->'field'->>'fieldId','projectLabel','','fieldLabel','','associationStatus','unavailable'));
 else raise exception 'FIELD_UNAVAILABLE';end if;end if;
 end if;
 if previous.id is not null then
 if previous.owner_user_id<>p_owner or previous.environment<>p_environment then raise exception 'NOT_FOUND_OR_FORBIDDEN';end if;
 if previous.revision<>p_expected or (previous.deleted_at is not null and not coalesce((clean->>'deleted')::boolean,false)) then raise exception 'VERSION_CONFLICT' using detail=jsonb_build_object('current',previous.data||jsonb_build_object('revision',previous.revision,'updatedAt',previous.updated_at))::text;end if;
 elsif p_expected<>0 then raise exception 'NOT_FOUND_OR_FORBIDDEN';end if;
 new_revision:=coalesce(previous.revision,0)+1;
 if p_kind='list' then
 insert into public.counts_lists(id,owner_user_id,environment,data,revision,deleted_at,updated_at) values(entity,p_owner,p_environment,clean,new_revision,case when (clean->>'deleted')::boolean then changed_at end,changed_at) on conflict(id) do update set data=excluded.data,revision=excluded.revision,deleted_at=excluded.deleted_at,updated_at=excluded.updated_at;
 else
 insert into public.counts_entries(id,list_id,owner_user_id,environment,data,revision,deleted_at,updated_at) values(entity,(clean->>'listId')::uuid,p_owner,p_environment,clean,new_revision,case when (clean->>'deleted')::boolean then changed_at end,changed_at) on conflict(id) do update set data=excluded.data,revision=excluded.revision,deleted_at=excluded.deleted_at,updated_at=excluded.updated_at;
 end if;
 result:=jsonb_build_object('value',clean||jsonb_build_object('revision',new_revision,'updatedAt',changed_at));
 insert into public.counts_operations values(p_owner,p_environment,p_operation,digest,result,changed_at);return result;
end $$;

create function public.counts_accept_submission(p_owner uuid,p_environment text,p_key uuid,p_snapshot jsonb,p_contact jsonb,p_message text,p_notice text,p_required_notice text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached public.counts_submissions;digest text;row jsonb;live jsonb;list public.counts_lists;result jsonb;
begin
 digest:=encode(sha256(convert_to(jsonb_build_object('snapshot',p_snapshot,'contact',p_contact,'message',p_message,'notice',p_notice)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('counts-submit:'||p_key::text,0));
 select * into cached from public.counts_submissions where id=p_key;
 if found then if cached.owner_user_id<>p_owner or cached.environment<>p_environment then raise exception 'NOT_FOUND_OR_FORBIDDEN';end if;if cached.payload_digest<>digest then raise exception 'VALIDATION_ERROR';end if;
 else
 if p_required_notice is not null and p_notice<>p_required_notice then raise exception 'NOTICE_REQUIRED';end if;
 select * into list from public.counts_lists where id=(p_snapshot->>'listId')::uuid and owner_user_id=p_owner and environment=p_environment and deleted_at is null for share;
 if list.id is null then raise exception 'NOT_FOUND_OR_FORBIDDEN';end if;
 if p_snapshot->>'listTitle'<>list.data->>'title' or jsonb_array_length(p_snapshot->'entries') not between 1 and 500 then raise exception 'VERSION_CONFLICT';end if;
 for row in select value from jsonb_array_elements(p_snapshot->'entries') loop
 select (e.data||jsonb_build_object('revision',e.revision,'updatedAt',e.updated_at))-'deleted' into live from public.counts_entries e where e.id=(row->>'countId')::uuid and e.list_id=list.id and e.owner_user_id=p_owner and e.environment=p_environment and e.deleted_at is null for share;
 if live is null then raise exception 'NOT_FOUND_OR_FORBIDDEN';end if;if live<>row then raise exception 'VERSION_CONFLICT';end if;
 end loop;
 if (select count(distinct value->>'countId') from jsonb_array_elements(p_snapshot->'entries'))<>jsonb_array_length(p_snapshot->'entries') then raise exception 'VALIDATION_ERROR';end if;
 insert into public.counts_submissions(id,owner_user_id,environment,payload_digest,snapshot,contact,message,notice_version) values(p_key,p_owner,p_environment,digest,p_snapshot,p_contact,p_message,p_notice) returning * into cached;
 insert into public.counts_deliveries(submission_id,owner_user_id,environment) values(p_key,p_owner,p_environment);
 end if;
 result:=jsonb_build_object('submissionId',cached.id,'snapshot',cached.snapshot,'contact',cached.contact,'message',cached.message,'noticeVersion',cached.notice_version,'acceptedAt',cached.accepted_at);return result;
end $$;
create function public.counts_claim_delivery(p_owner uuid,p_environment text,p_key uuid,p_body jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare delivery public.counts_deliveries;
begin
 select * into delivery from public.counts_deliveries where submission_id=p_key and owner_user_id=p_owner and environment=p_environment for update;
 if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN';end if;
 if delivery.state='provider_accepted' then return jsonb_build_object('send',false,'state',delivery.state,'providerAcceptedAt',delivery.provider_accepted_at);end if;
 if delivery.lease_until>now() then return jsonb_build_object('send',false,'state','sending');end if;
 if delivery.first_attempt_at<now()-interval '23 hours' then update public.counts_deliveries set state='uncertain',lease_until=null where submission_id=p_key;return jsonb_build_object('send',false,'state','uncertain');end if;
 update public.counts_deliveries set body=coalesce(body,p_body),state='sending',first_attempt_at=coalesce(first_attempt_at,now()),lease_until=now()+interval '2 minutes',attempts=attempts+1 where submission_id=p_key returning * into delivery;
 return jsonb_build_object('send',true,'state','sending','body',delivery.body);
end $$;
create function public.counts_finish_delivery(p_owner uuid,p_environment text,p_key uuid,p_state text,p_provider_id text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_state not in ('provider_accepted','failed','uncertain') then raise exception 'VALIDATION_ERROR';end if;
 update public.counts_deliveries set state=p_state,provider_id=p_provider_id,lease_until=null,provider_accepted_at=case when p_state='provider_accepted' then now() end,last_error=case when p_state='failed' then 'provider_rejected' when p_state='uncertain' then 'provider_result_unknown' end where submission_id=p_key and owner_user_id=p_owner and environment=p_environment and state='sending';
end $$;
revoke all on function public.counts_apply(uuid,text,uuid,text,bigint,jsonb),public.counts_accept_submission(uuid,text,uuid,jsonb,jsonb,text,text,text),public.counts_claim_delivery(uuid,text,uuid,jsonb),public.counts_finish_delivery(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.counts_apply(uuid,text,uuid,text,bigint,jsonb),public.counts_accept_submission(uuid,text,uuid,jsonb,jsonb,text,text,text),public.counts_claim_delivery(uuid,text,uuid,jsonb),public.counts_finish_delivery(uuid,text,uuid,text,text) to service_role;
-- Administrative read only snapshot; auth.users is not exposed through the ordinary gateway.
create function public.counts_admin_read(p_environment text,p_action text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;selected uuid;page_size integer:=least(100,greatest(1,coalesce((p_input->>'limit')::integer,50)));rows jsonb;next_cursor text;
begin
 if p_environment not in ('TEST','LIVE') then raise exception 'VALIDATION_ERROR';end if;
 if p_action='getUserList' then
 selected:=(p_input->>'listId')::uuid;
 select jsonb_build_object('owner',jsonb_build_object('technicalId',l.owner_user_id,'kind',case when u.is_anonymous then 'guest' else 'user' end),'list',l.data||jsonb_build_object('revision',l.revision,'updatedAt',l.updated_at),'counts',coalesce((select jsonb_agg(e.data||jsonb_build_object('revision',e.revision,'updatedAt',e.updated_at)) from public.counts_entries e where e.list_id=l.id and e.deleted_at is null),'[]'::jsonb)) into result from public.counts_lists l join auth.users u on u.id=l.owner_user_id where l.id=selected and l.environment=p_environment and l.deleted_at is null;
 elsif p_action='getSubmission' then
 select jsonb_build_object('submissionId',s.id,'snapshot',s.snapshot,'contact',s.contact,'message',s.message,'acceptedAt',s.accepted_at,'emailState',d.state,'providerAcceptedAt',d.provider_accepted_at) into result from public.counts_submissions s join public.counts_deliveries d on d.submission_id=s.id where s.id=(p_input->>'submissionId')::uuid and s.environment=p_environment;
 elsif p_action='listUserLists' then
 with candidates as (select l.*,case when u.is_anonymous then 'guest' else 'user' end as owner_kind,exists(select 1 from public.counts_submissions s where s.environment=l.environment and s.owner_user_id=l.owner_user_id and s.snapshot->>'listId'=l.id::text) as submitted from public.counts_lists l join auth.users u on u.id=l.owner_user_id where l.environment=p_environment and l.deleted_at is null),page as (select * from candidates where (not p_input?'ownerKind' or owner_kind=p_input->>'ownerKind') and (not p_input?'listStatus' or data->>'status'=p_input->>'listStatus') and (not p_input?'hasSubmission' or submitted=(p_input->>'hasSubmission')::boolean) and (not p_input?'from' or updated_at>=(p_input->>'from')::timestamptz) and (not p_input?'to' or updated_at<=(p_input->>'to')::timestamptz) and (not p_input?'cursor' or id>(p_input->>'cursor')::uuid) order by id limit page_size+1)
 select coalesce(jsonb_agg(jsonb_build_object('listId',id,'title',data->>'title','status',data->>'status','updatedAt',updated_at,'owner',jsonb_build_object('technicalId',owner_user_id,'kind',owner_kind),'hasSubmission',submitted) order by id),'[]'::jsonb) into rows from page;
 elsif p_action='listSubmissions' then
 with page as (select s.*,d.state,d.provider_accepted_at,case when u.is_anonymous then 'guest' else 'user' end as owner_kind from public.counts_submissions s join public.counts_deliveries d on d.submission_id=s.id join auth.users u on u.id=s.owner_user_id where s.environment=p_environment and (not p_input?'ownerKind' or (case when u.is_anonymous then 'guest' else 'user' end)=p_input->>'ownerKind') and (not p_input?'emailState' or d.state=p_input->>'emailState') and (not p_input?'from' or s.accepted_at>=(p_input->>'from')::timestamptz) and (not p_input?'to' or s.accepted_at<=(p_input->>'to')::timestamptz) and (not p_input?'cursor' or s.id>(p_input->>'cursor')::uuid) order by s.id limit page_size+1)
 select coalesce(jsonb_agg(jsonb_build_object('submissionId',id,'listTitle',snapshot->>'listTitle','acceptedAt',accepted_at,'emailState',state,'providerAcceptedAt',provider_accepted_at,'owner',jsonb_build_object('technicalId',owner_user_id,'kind',owner_kind)) order by id),'[]'::jsonb) into rows from page;
 else raise exception 'VALIDATION_ERROR';end if;
 if rows is not null then
 if jsonb_array_length(rows)>page_size then next_cursor:=coalesce(rows->(page_size-1)->>'listId',rows->(page_size-1)->>'submissionId');rows:=rows-page_size;end if;return jsonb_build_object('items',rows,'nextCursor',next_cursor);
 end if;
 if result is null then raise exception 'NOT_FOUND_OR_FORBIDDEN';end if;return result;
end $$;
revoke all on function public.counts_admin_read(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.counts_admin_read(text,text,jsonb) to service_role;
create schema if not exists private;
-- Hook for the existing guest coordinator, NOT a client endpoint. Invoke in the transaction that
-- verifies/consumes its grant, only after a separate explicit choice to move Conteggi.
-- No grant is minted, consumed, inferred from login, or duplicated in this module.
create function private.counts_transfer_after_verified_grant(p_source uuid,p_target uuid,p_environment text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_source=p_target then return;end if;
 if p_environment not in ('TEST','LIVE') or (select auth.uid()) is distinct from p_target or not exists(select 1 from auth.users where id=p_source and is_anonymous is true) or not exists(select 1 from auth.users where id=p_target and is_anonymous is not true) then raise exception 'AUTH_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('counts-transfer:'||p_source::text||p_environment,0));
 update public.counts_lists set owner_user_id=p_target where owner_user_id=p_source and environment=p_environment;
 update public.counts_operations set owner_user_id=p_target where owner_user_id=p_source and environment=p_environment;
 update public.counts_submissions set owner_user_id=p_target where owner_user_id=p_source and environment=p_environment;
 insert into public.counts_notice_receipts(owner_user_id,environment,version,acknowledged_at) select p_target,environment,version,acknowledged_at from public.counts_notice_receipts where owner_user_id=p_source and environment=p_environment on conflict(owner_user_id,environment,version) do nothing;
 delete from public.counts_notice_receipts where owner_user_id=p_source and environment=p_environment;
end $$;
revoke all on function private.counts_transfer_after_verified_grant(uuid,uuid,text) from public,anon,authenticated,service_role;
