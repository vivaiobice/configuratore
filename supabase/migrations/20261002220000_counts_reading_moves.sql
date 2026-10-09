-- Consente di correggere tipo ed elenco senza duplicare una lettura.
-- CAS, controllo owner/ambiente, RLS e idempotenza restano quelli di counts_v1.
create or replace function public.counts_apply(p_owner uuid,p_environment text,p_operation uuid,p_kind text,p_expected bigint,p_value jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
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
 insert into public.counts_entries(id,list_id,owner_user_id,environment,data,revision,deleted_at,updated_at) values(entity,(clean->>'listId')::uuid,p_owner,p_environment,clean,new_revision,case when (clean->>'deleted')::boolean then changed_at end,changed_at) on conflict(id) do update set list_id=excluded.list_id,data=excluded.data,revision=excluded.revision,deleted_at=excluded.deleted_at,updated_at=excluded.updated_at;
 end if;
 result:=jsonb_build_object('value',clean||jsonb_build_object('revision',new_revision,'updatedAt',changed_at));
 insert into public.counts_operations values(p_owner,p_environment,p_operation,digest,result,changed_at);return result;
end $$;

