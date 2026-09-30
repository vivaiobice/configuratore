alter table public.contacts drop constraint if exists contacts_company_name_check;
alter table public.contacts add constraint contacts_company_name_check check (company_name is not null);

alter table public.quote_requests
  add column if not exists request_key uuid,
  add column if not exists field_ids text[] not null default '{}'::text[],
  add column if not exists lot_summary jsonb not null default '[]'::jsonb,
  add column if not exists delivery_status text not null default 'pending',
  add column if not exists email_provider_id text,
  add column if not exists email_sent_at timestamptz;
create unique index if not exists quote_requests_request_key_uidx on public.quote_requests(request_key);
alter table public.quote_requests add constraint quote_delivery_status_check
  check (delivery_status in ('pending','sent','failed'));
revoke insert on public.quote_requests from authenticated;
drop policy if exists quote_requests_owner_insert on public.quote_requests;
