-- Reversible LIVE RLS validation. Run as the database administrator only.
-- No Auth users are created/changed; no real blobs are uploaded; all fixtures roll back.
-- Supabase's direct Storage DELETE guard remains enabled. The installed DELETE
-- policy is evaluated for owner/nonowner/admin rather than bypassing that guard.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

-- Keep all real identity data inside transaction-local custom GUCs; never emit it.
do $$
declare
  owner_id uuid;
  fixture jsonb;
  project_a uuid:=gen_random_uuid();
  project_b uuid:=gen_random_uuid();
  client_a uuid:=gen_random_uuid();
  client_b uuid:=gen_random_uuid();
  field_id uuid:=gen_random_uuid();
  client_field text:='verify-media-'||gen_random_uuid()::text;
  media_id uuid:=gen_random_uuid();
  pending_id uuid:=gen_random_uuid();
begin
  select id into owner_id from auth.users where not coalesce(is_anonymous,false) order by id limit 1;
  if owner_id is null then raise exception 'verification prerequisite: permanent owner required'; end if;
  insert into public.projects(id,owner_user_id,client_project_id,environment,name,owner_kind)
  values (project_a,owner_id,client_a,'TEST','Media RLS transient source','user'),
         (project_b,owner_id,client_b,'TEST','Media RLS transient destination','user');
  insert into public.project_fields(id,project_id,owner_user_id,client_field_id)
  values(field_id,project_a,owner_id,client_field);
  fixture:=jsonb_build_object('owner',owner_id,'other',gen_random_uuid(),'projectA',project_a,'projectB',project_b,
    'clientA',client_a,'clientB',client_b,'field',field_id,'clientField',client_field,
    'media',media_id,'pending',pending_id,'object',gen_random_uuid(),'pendingObject',gen_random_uuid(),
    'path',owner_id::text||'/'||client_a::text||'/TEST/'||media_id::text,
    'pendingPath',owner_id::text||'/'||client_a::text||'/TEST/'||pending_id::text);
  perform set_config('field_media_verify.fixture',fixture::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','is_anonymous',false,'app_metadata','{}'::jsonb)::text,true);
end $$;
set local role authenticated;

do $$
declare
  v jsonb:=current_setting('field_media_verify.fixture')::jsonb;
  n integer;
  denied boolean;
  predicate text;
begin
  -- Owner metadata creation, pending recovery, immutable fields and readiness update.
  insert into public.field_media(id,owner_user_id,project_id,project_field_id,client_project_id,client_field_id,environment,object_path,file_name,mime_type,size_bytes,kind,note,status)
  values ((v->>'media')::uuid,(v->>'owner')::uuid,(v->>'projectA')::uuid,(v->>'field')::uuid,(v->>'clientA')::uuid,v->>'clientField','TEST',v->>'path','verification.bin','application/octet-stream',1,'file','','pending'),
         ((v->>'pending')::uuid,(v->>'owner')::uuid,(v->>'projectA')::uuid,(v->>'field')::uuid,(v->>'clientA')::uuid,v->>'clientField','TEST',v->>'pendingPath','verification-pending.bin','application/octet-stream',1,'file','','pending');
  select count(*) into n from public.field_media where id in ((v->>'media')::uuid,(v->>'pending')::uuid) and status='pending';
  if n<>2 then raise exception 'FAIL: owner pending insert/read'; end if;
  denied:=false;
  begin
    update public.field_media set owner_user_id=(v->>'other')::uuid where id=(v->>'media')::uuid;
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'FAIL: immutable ownership grant'; end if;
  denied:=false;
  begin
    update public.field_media set project_field_id=gen_random_uuid(),object_path='forged' where id=(v->>'media')::uuid;
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'FAIL: immutable field/path grant'; end if;

  -- Storage metadata INSERT is executed with the real authenticated RLS policies.
  insert into storage.objects(id,bucket_id,name,owner_id,metadata)
  values ((v->>'object')::uuid,'field-media',v->>'path',v->>'owner','{"size":1,"mimetype":"application/octet-stream"}'),
         ((v->>'pendingObject')::uuid,'field-media',v->>'pendingPath',v->>'owner','{"size":1,"mimetype":"application/octet-stream"}');
  select count(*) into n from storage.objects where id in ((v->>'object')::uuid,(v->>'pendingObject')::uuid);
  if n<>2 then raise exception 'FAIL: owner matching-pending Storage insert/read'; end if;
  denied:=false;
  begin
    insert into storage.objects(bucket_id,name,owner_id) values('field-media',(v->>'owner')||'/unmatched/'||gen_random_uuid()::text,v->>'owner');
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'FAIL: unmatched Storage path admitted'; end if;
  denied:=false;
  begin
    update storage.objects set name='overwritten' where id=(v->>'object')::uuid;
    get diagnostics n=row_count;
    denied:=n=0;
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'FAIL: immutable Storage object UPDATE'; end if;
  update public.field_media set status='ready' where id=(v->>'media')::uuid;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'FAIL: owner ready update'; end if;
  select count(*) into n from public.field_media where id=(v->>'media')::uuid and status='ready';
  if n<>1 then raise exception 'FAIL: owner ready read'; end if;

  -- Inspect the actual installed DELETE predicate. Keep protect_delete enabled.
  select pg_get_expr(polqual,polrelid) into predicate from pg_policy
  where polrelid='storage.objects'::regclass and polname='field_media_storage_owner_delete' and polcmd='d';
  if predicate is null then raise exception 'FAIL: installed Storage owner DELETE policy missing'; end if;
  execute 'select count(*) from storage.objects where id=$1 and ('||predicate||')' into n using (v->>'object')::uuid;
  if n<>1 then raise exception 'FAIL: owner Storage DELETE predicate'; end if;
  denied:=false;
  begin
    delete from storage.objects where id=(v->>'pendingObject')::uuid;
  exception when insufficient_privilege then
    if sqlerrm not like 'Direct deletion from storage tables is not allowed.%' then raise; end if;
    denied:=true;
  end;
  if not denied then raise exception 'FAIL: direct Storage DELETE safety guard disabled'; end if;
end $$;

-- Same owner identity carrying an anonymous token must lose all cloud access.
do $$
declare v jsonb:=current_setting('field_media_verify.fixture')::jsonb;n integer;denied boolean:=false;
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v->>'owner','role','authenticated','is_anonymous',true,'app_metadata','{}'::jsonb)::text,true);
  select count(*) into n from public.field_media where id=(v->>'media')::uuid;
  if n<>0 then raise exception 'FAIL: anonymous metadata read'; end if;
  select count(*) into n from storage.objects where id=(v->>'object')::uuid;
  if n<>0 then raise exception 'FAIL: anonymous Storage read'; end if;
  begin
    insert into storage.objects(bucket_id,name,owner_id) values('field-media',v->>'pendingPath',v->>'owner');
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'FAIL: anonymous Storage insert'; end if;
  denied:=false;
  begin
    insert into public.field_media(id,owner_user_id,project_id,project_field_id,client_project_id,client_field_id,environment,object_path,file_name,mime_type,size_bytes,kind,status)
    values(gen_random_uuid(),(v->>'owner')::uuid,(v->>'projectA')::uuid,(v->>'field')::uuid,(v->>'clientA')::uuid,v->>'clientField','TEST','anonymous','x','text/plain',1,'file','pending');
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'FAIL: anonymous metadata insert'; end if;
  update public.field_media set status='pending' where id=(v->>'media')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'FAIL: anonymous metadata update'; end if;
  delete from public.field_media where id=(v->>'media')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'FAIL: anonymous metadata delete'; end if;
end $$;

-- Wrong owner and user-editable user_metadata.role='admin' must remain powerless.
do $$
declare v jsonb:=current_setting('field_media_verify.fixture')::jsonb;n integer;denied boolean:=false;predicate text;
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v->>'other','role','authenticated','is_anonymous',false,'app_metadata','{}'::jsonb,'user_metadata',jsonb_build_object('role','admin'))::text,true);
  if private.is_admin() then raise exception 'FAIL: user_metadata admin spoof'; end if;
  select count(*) into n from public.field_media where id in ((v->>'media')::uuid,(v->>'pending')::uuid);
  if n<>0 then raise exception 'FAIL: wrong owner metadata read'; end if;
  select count(*) into n from storage.objects where id in ((v->>'object')::uuid,(v->>'pendingObject')::uuid);
  if n<>0 then raise exception 'FAIL: wrong owner Storage read'; end if;
  begin
    insert into public.field_media(id,owner_user_id,project_id,project_field_id,client_project_id,client_field_id,environment,object_path,file_name,mime_type,size_bytes,kind,status)
    values(gen_random_uuid(),(v->>'owner')::uuid,(v->>'projectA')::uuid,(v->>'field')::uuid,(v->>'clientA')::uuid,v->>'clientField','TEST','forged','x','text/plain',1,'file','pending');
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'FAIL: forged metadata owner'; end if;
  denied:=false;
  begin
    insert into storage.objects(bucket_id,name,owner_id) values('field-media',v->>'pendingPath',v->>'other');
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'FAIL: forged Storage namespace'; end if;
  update public.field_media set status='pending' where id=(v->>'media')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'FAIL: wrong owner metadata update'; end if;
  delete from public.field_media where id=(v->>'media')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'FAIL: wrong owner metadata delete'; end if;
  select pg_get_expr(polqual,polrelid) into predicate from pg_policy where polrelid='storage.objects'::regclass and polname='field_media_storage_owner_delete';
  execute 'select count(*) from storage.objects where id=$1 and ('||predicate||')' into n using (v->>'object')::uuid;
  if n<>0 then raise exception 'FAIL: wrong owner Storage DELETE predicate'; end if;
end $$;

-- Only the trusted app_metadata admin role may read cross-owner media; no write/delete.
do $$
declare v jsonb:=current_setting('field_media_verify.fixture')::jsonb;n integer;predicate text;
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v->>'other','role','authenticated','is_anonymous',false,'app_metadata',jsonb_build_object('role','admin'))::text,true);
  if not private.is_admin() then raise exception 'FAIL: trusted admin role'; end if;
  select count(*) into n from public.field_media where id=(v->>'media')::uuid and status='ready';
  if n<>1 then raise exception 'FAIL: trusted admin metadata read'; end if;
  select count(*) into n from storage.objects where id=(v->>'object')::uuid;
  if n<>1 then raise exception 'FAIL: trusted admin ready Storage read'; end if;
  select count(*) into n from storage.objects where id=(v->>'pendingObject')::uuid;
  if n<>0 then raise exception 'FAIL: admin pending Storage read'; end if;
  update public.field_media set status='pending' where id=(v->>'media')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'FAIL: cross-owner admin metadata update'; end if;
  delete from public.field_media where id=(v->>'media')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'FAIL: cross-owner admin metadata delete'; end if;
  select pg_get_expr(polqual,polrelid) into predicate from pg_policy where polrelid='storage.objects'::regclass and polname='field_media_storage_owner_delete';
  execute 'select count(*) from storage.objects where id=$1 and ('||predicate||')' into n using (v->>'object')::uuid;
  if n<>0 then raise exception 'FAIL: cross-owner admin Storage DELETE predicate'; end if;
end $$;

-- Move the transient normalized field; original media provenance/path remains intact.
do $$
declare v jsonb:=current_setting('field_media_verify.fixture')::jsonb;n integer;
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v->>'owner','role','authenticated','is_anonymous',false,'app_metadata','{}'::jsonb)::text,true);
  update public.project_fields set project_id=(v->>'projectB')::uuid,client_field_id='moved-'||(v->>'clientField') where id=(v->>'field')::uuid;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'FAIL: transient normalized field move'; end if;
  select count(*) into n from public.field_media m join public.project_fields f on f.id=m.project_field_id join public.projects p on p.id=f.project_id
  where m.id=(v->>'media')::uuid and p.client_project_id=(v->>'clientB')::uuid and f.client_field_id='moved-'||(v->>'clientField') and m.object_path=v->>'path';
  if n<>1 then raise exception 'FAIL: moved field media linkage/provenance'; end if;
  update public.field_media set status='ready' where id=(v->>'media')::uuid;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'FAIL: moved field status update'; end if;
  -- Soft-deleting only the old provenance project must preserve moved-field access.
  update public.projects set deleted_at=now() where id=(v->>'projectA')::uuid;
  select count(*) into n from public.field_media where id=(v->>'media')::uuid;
  if n<>1 then raise exception 'FAIL: old-project deletion hides moved field media'; end if;
  delete from public.field_media where id=(v->>'pending')::uuid;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'FAIL: owner pending reservation delete after move'; end if;
  delete from public.field_media where id=(v->>'media')::uuid;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'FAIL: owner ready metadata delete'; end if;
end $$;
reset role;
rollback;
-- This statement is reached only if every assertion above passed.
select 'PASS: owner, anonymous, wrong owner, user_metadata spoof, trusted admin, Storage INSERT/SELECT/DELETE policy, immutable grants, pending recovery and normalized field move; all fixtures rolled back; direct Storage DELETE guard retained' as verification;
