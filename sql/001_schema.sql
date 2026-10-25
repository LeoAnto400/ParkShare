-- ONLY for your NEW ParkShare project's SQL Editor. No CLI linkage required.
begin;
create table if not exists public.parking_spaces (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  title text not null check (length(trim(title)) > 0),
  description text not null check (length(trim(description)) > 0),
  locality text not null check (length(trim(locality)) > 0),
  city text not null check (length(trim(city)) > 0),
  address text not null check (length(trim(address)) > 0),
  hourly_price numeric(8,2) not null check (hourly_price >= 0 and hourly_price <> 'NaN'::numeric),
  supported_vehicles text[] not null check (cardinality(supported_vehicles) > 0 and supported_vehicles <@ array['Car','Bike','SUV']::text[] and array_position(supported_vehicles, null) is null),
  amenities text[] not null default '{}' check (array_position(amenities, null) is null),
  parking_rules text[] not null default '{}' check (array_position(parking_rules, null) is null),
  image_urls text[] not null check (cardinality(image_urls) > 0 and array_position(image_urls, null) is null),
  featured boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.parking_spaces enable row level security;
-- Grants restrict operations; this policy restricts visible rows.
revoke all on public.parking_spaces from public, anon, authenticated;
grant usage on schema public to anon;
grant select on public.parking_spaces to anon;
drop policy if exists "Visitors read published spaces" on public.parking_spaces;
create policy "Visitors read published spaces" on public.parking_spaces
  for select to anon using (published = true);
-- No anonymous INSERT, UPDATE, DELETE grants or policies.
commit;
