-- V49: editable business and contact details for authenticated owners.
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists company_name text,
  add column if not exists address text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists vat_number text,
  add column if not exists phone text;

alter table public.profiles drop constraint if exists profiles_province_format;
alter table public.profiles add constraint profiles_province_format
  check (province is null or province = '' or province ~ '^[A-Z]{2}$');

alter table public.profiles drop constraint if exists profiles_contact_lengths;
alter table public.profiles add constraint profiles_contact_lengths check (
  char_length(coalesce(first_name,'')) <= 160
  and char_length(coalesce(last_name,'')) <= 160
  and char_length(coalesce(company_name,'')) <= 160
  and char_length(coalesce(address,'')) <= 160
  and char_length(coalesce(postal_code,'')) <= 16
  and char_length(coalesce(city,'')) <= 160
  and char_length(coalesce(vat_number,'')) <= 32
  and char_length(coalesce(phone,'')) <= 32
);
