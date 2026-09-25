create extension if not exists "pgcrypto";

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  image_url text,
  storage_path text,
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid references public.templates(id) on delete set null,
  certificate_id text not null unique,
  recipient_name text not null,
  achievement text not null,
  issue_date date not null,
  verification_hash text not null,
  status text not null default 'valid' check (status in ('valid', 'revoked')),
  created_at timestamptz not null default now()
);

create index if not exists certificates_owner_id_idx on public.certificates(owner_id);
create index if not exists certificates_certificate_id_idx on public.certificates(certificate_id);

alter table public.templates enable row level security;
alter table public.certificates enable row level security;

create policy "Owners can manage their templates"
on public.templates for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "Owners can manage their certificates"
on public.certificates for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop function if exists public.verify_certificate(text);

create or replace function public.verify_certificate(lookup_id text)
returns table (
  certificate_id text,
  recipient_name text,
  achievement text,
  issue_date date,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select c.certificate_id, c.recipient_name, c.achievement, c.issue_date, c.status, c.created_at
  from public.certificates c
  where c.certificate_id = upper(trim(lookup_id))
    and c.status = 'valid'
  limit 1;
$$;

revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;

insert into storage.buckets (id, name, public)
values ('certificate-templates', 'certificate-templates', true)
on conflict (id) do nothing;

create policy "Authenticated users can upload templates"
on storage.objects for insert to authenticated
with check (bucket_id = 'certificate-templates' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "Anyone can view certificate templates"
on storage.objects for select to public
using (bucket_id = 'certificate-templates');

create policy "Owners can update certificate templates"
on storage.objects for update to authenticated
using (bucket_id = 'certificate-templates' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (bucket_id = 'certificate-templates' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "Owners can delete certificate templates"
on storage.objects for delete to authenticated
using (bucket_id = 'certificate-templates' and (storage.foldername(name))[1] = (select auth.uid()::text));
