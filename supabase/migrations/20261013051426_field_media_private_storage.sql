-- V1.3.11: private per-field attachments, separate from project snapshot JSON.
-- Only permanent accounts write cloud media. Anonymous guests use device IndexedDB.
create table public.field_media (
  id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  -- Creation provenance remains immutable when the normalized field is moved.
  project_id uuid not null,
  project_field_id uuid not null references public.project_fields(id) on delete cascade,
  client_project_id uuid not null,
  client_field_id text not null check (length(btrim(client_field_id)) between 1 and 255),
  environment public.project_environment not null,
  object_path text not null unique,
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  mime_type text not null check (length(mime_type) between 1 and 255),
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  kind text not null check (kind in ('photo','file')),
  note text not null default '' check (length(note) <= 2000),
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','ready')),
  constraint field_media_canonical_path check (
    object_path = owner_user_id::text || '/' || client_project_id::text || '/' || environment::text || '/' || id::text
  )
);
create index field_media_scope_created_idx on public.field_media(owner_user_id,project_field_id,created_at desc,id desc);
create index field_media_field_idx on public.field_media(project_field_id);
create index field_media_project_idx on public.field_media(project_id);
alter table public.field_media enable row level security;
revoke all on public.field_media from public,anon,authenticated;
grant select,delete on public.field_media to authenticated;
grant insert (id,owner_user_id,project_id,project_field_id,client_project_id,client_field_id,environment,object_path,file_name,mime_type,size_bytes,kind,note,status) on public.field_media to authenticated;
grant update (status) on public.field_media to authenticated;
grant all on public.field_media to service_role;

create policy field_media_owner_or_admin_read on public.field_media for select to authenticated
using (
  not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)
  and (owner_user_id=(select auth.uid()) or (select private.is_admin()))
  and exists (
    select 1 from public.project_fields f join public.projects p on p.id=f.project_id
    where f.id=field_media.project_field_id
      and p.owner_user_id=field_media.owner_user_id and p.deleted_at is null
      and f.owner_user_id=field_media.owner_user_id and f.deleted_at is null
  )
);
create policy field_media_owner_insert on public.field_media for insert to authenticated
with check (
  owner_user_id=(select auth.uid())
  and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)
  and status='pending'
  and exists (
    select 1 from public.projects p join public.project_fields f on f.project_id=p.id
    where f.id=field_media.project_field_id and p.id=field_media.project_id
      and p.owner_user_id=field_media.owner_user_id
      and p.client_project_id=field_media.client_project_id
      and p.environment=field_media.environment and p.deleted_at is null
      and f.owner_user_id=field_media.owner_user_id
      and f.client_field_id=field_media.client_field_id and f.deleted_at is null
  )
);
create policy field_media_owner_status_update on public.field_media for update to authenticated
using (
  owner_user_id=(select auth.uid())
  and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)
)
with check (
  owner_user_id=(select auth.uid())
  and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)
  and exists (
    select 1 from public.project_fields f join public.projects p on p.id=f.project_id
    where f.id=field_media.project_field_id
      and p.owner_user_id=field_media.owner_user_id and p.deleted_at is null
      and f.owner_user_id=field_media.owner_user_id and f.deleted_at is null
  )
);
create policy field_media_owner_delete on public.field_media for delete to authenticated
using (
  owner_user_id=(select auth.uid())
  and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)
);

insert into storage.buckets(id,name,public,file_size_limit)
values ('field-media','field-media',false,26214400)
on conflict (id) do update set public=false,file_size_limit=26214400;

create policy field_media_storage_owner_insert on storage.objects for insert to authenticated
with check (
  bucket_id='field-media'
  and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (
    select 1 from public.field_media m
    join public.projects p on p.id=m.project_id
    join public.project_fields f on f.project_id=p.id
    where m.object_path=storage.objects.name and m.status='pending' and f.id=m.project_field_id
      and m.owner_user_id=(select auth.uid())
      and p.owner_user_id=m.owner_user_id and p.client_project_id=m.client_project_id
      and p.environment=m.environment and p.deleted_at is null
      and f.owner_user_id=m.owner_user_id and f.client_field_id=m.client_field_id and f.deleted_at is null
  )
);
-- Owners may remove their own incomplete objects even after a parent project was deleted.
-- Admin reads require a real, authorized, ready field-media record; no broad bucket read.
create policy field_media_storage_authorized_read on storage.objects for select to authenticated
using (
  bucket_id='field-media'
  and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)
  and (
    ((storage.foldername(name))[1]=(select auth.uid())::text and owner_id=(select auth.uid())::text)
    or ((select private.is_admin()) and exists (
      select 1 from public.field_media m
      where m.object_path=storage.objects.name and m.status='ready'
    ))
  )
);
create policy field_media_storage_owner_delete on storage.objects for delete to authenticated
using (
  bucket_id='field-media'
  and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and owner_id=(select auth.uid())::text
);
-- Deliberately no Storage UPDATE policy: each upload is a new immutable UUID path.
