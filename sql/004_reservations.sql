-- NEW ParkShare project only. Run manually after 003. No payment processing.
begin;
create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions, pg_catalog;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  parking_space_id text not null references public.parking_spaces(id) on delete restrict,
  driver_id uuid not null references auth.users(id) on delete restrict,
  space_title text not null,
  space_address text not null,
  arrival timestamptz not null,
  departure timestamptz not null,
  vehicle_type text not null check (vehicle_type in ('Car','Bike','SUV')),
  vehicle_registration text not null check (vehicle_registration ~ '^[A-Z0-9][A-Z0-9 -]{3,18}[A-Z0-9]$'),
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  hourly_rate numeric(8,2) not null check (hourly_rate >= 0 and hourly_rate <> 'NaN'::numeric),
  parking_subtotal numeric(12,2) not null check (parking_subtotal >= 0 and parking_subtotal <> 'NaN'::numeric),
  service_fee_rate numeric(4,3) not null check (service_fee_rate = 0.05),
  service_fee numeric(12,2) not null check (service_fee >= 0 and service_fee <> 'NaN'::numeric),
  total numeric(12,2) not null check (total = parking_subtotal + service_fee),
  created_at timestamptz not null default now(),
  check (isfinite(arrival) and isfinite(departure)),
  check (departure - arrival between interval '30 minutes' and interval '7 days'),
  -- Half-open intervals permit an arrival exactly at another booking's departure.
  constraint bookings_no_overlap exclude using gist (
    parking_space_id with =, tstzrange(arrival, departure, '[)') with &&
  ) where (status = 'confirmed')
);
create index if not exists bookings_driver_idx on public.bookings(driver_id);
create index if not exists bookings_space_idx on public.bookings(parking_space_id);
alter table public.bookings enable row level security;
revoke all on public.bookings from public, anon, authenticated;
grant select on public.bookings to authenticated;
drop policy if exists "Booking participants read" on public.bookings;
create policy "Booking participants read" on public.bookings for select to authenticated
  using (driver_id = (select auth.uid()) or exists (
    select 1 from public.parking_spaces s
    where s.id = parking_space_id and s.owner_id = (select auth.uid())
  ));

-- Internal validation helper. It is NOT an exposed callable API.
create or replace function public.validate_booking_interval(p_arrival timestamptz, p_departure timestamptz)
returns void language plpgsql set search_path = '' as $$
begin
  if p_arrival is null or p_departure is null or not pg_catalog.isfinite(p_arrival)
      or not pg_catalog.isfinite(p_departure) or p_arrival <= pg_catalog.clock_timestamp()
      or p_departure - p_arrival < interval '30 minutes'
      or p_departure - p_arrival > interval '7 days' then
    raise exception 'INVALID_INTERVAL' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.validate_booking_interval(timestamptz,timestamptz) from public, anon, authenticated;

-- Public quote exposes ONLY availability and pricing, never booking rows or identities.
create or replace function public.booking_quote(p_space_id text, p_arrival timestamptz,
  p_departure timestamptz, p_vehicle_type text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.parking_spaces%rowtype; minutes numeric; subtotal numeric; fee numeric; available boolean;
begin
  perform public.validate_booking_interval(p_arrival,p_departure);
  select * into s from public.parking_spaces where id = p_space_id and published;
  if not found then raise exception 'SPACE_UNAVAILABLE'; end if;
  if p_vehicle_type is null or not (p_vehicle_type = any(s.supported_vehicles)) then raise exception 'UNSUPPORTED_VEHICLE'; end if;
  minutes := extract(epoch from (p_departure - p_arrival)) / 60;
  subtotal := pg_catalog.round(s.hourly_price * minutes / 60, 2);
  fee := pg_catalog.round(subtotal * 0.05, 2);
  select not exists(select 1 from public.bookings b where b.parking_space_id = s.id
    and b.status = 'confirmed' and pg_catalog.tstzrange(b.arrival,b.departure,'[)') && pg_catalog.tstzrange(p_arrival,p_departure,'[)')) into available;
  return pg_catalog.jsonb_build_object('available',available,'duration_minutes',minutes,
    'hourly_rate',s.hourly_price,'parking_subtotal',subtotal,'service_fee_rate',0.05,
    'service_fee',fee,'total',subtotal+fee);
end;
$$;
revoke all on function public.booking_quote(text,timestamptz,timestamptz,text) from public, anon, authenticated;
grant execute on function public.booking_quote(text,timestamptz,timestamptz,text) to anon, authenticated;

create or replace function public.create_booking(p_space_id text, p_arrival timestamptz,
  p_departure timestamptz, p_vehicle_type text, p_registration text,
  p_idempotency_key uuid, p_expected_hourly_rate numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare driver uuid := auth.uid(); s public.parking_spaces%rowtype; b public.bookings%rowtype;
  registration text := pg_catalog.upper(pg_catalog.btrim(p_registration));
  minutes numeric; subtotal numeric; fee numeric;
begin
  if driver is null then raise exception 'LOGIN_REQUIRED'; end if;
  if p_idempotency_key is null then raise exception 'INVALID_RETRY_KEY'; end if;
  -- Serialize identical retry keys, even across browsers. Do not reveal another user's result.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text,0));
  select * into b from public.bookings where idempotency_key = p_idempotency_key;
  if found then
    if b.driver_id <> driver or b.parking_space_id is distinct from p_space_id
        or b.arrival is distinct from p_arrival or b.departure is distinct from p_departure
        or b.vehicle_type is distinct from p_vehicle_type or b.vehicle_registration is distinct from registration
        or b.hourly_rate is distinct from p_expected_hourly_rate then raise exception 'RETRY_KEY_MISMATCH'; end if;
    return pg_catalog.to_jsonb(b);
  end if;
  -- SHARE conflicts with UPDATE/DELETE: price, ownership, publication and vehicles
  -- cannot change between validation and insert. Concurrent bookings still reach the exclusion constraint.
  select * into s from public.parking_spaces where id = p_space_id for share;
  if not found or not s.published then raise exception 'SPACE_UNAVAILABLE'; end if;
  if s.owner_id = driver then raise exception 'SELF_BOOKING'; end if;
  perform public.validate_booking_interval(p_arrival,p_departure);
  if p_vehicle_type is null or not (p_vehicle_type = any(s.supported_vehicles)) then raise exception 'UNSUPPORTED_VEHICLE'; end if;
  if registration is null or registration !~ '^[A-Z0-9][A-Z0-9 -]{3,18}[A-Z0-9]$' then raise exception 'INVALID_REGISTRATION'; end if;
  -- Expected rate is a comparison guard only, NEVER a source for the calculation.
  if p_expected_hourly_rate is distinct from s.hourly_price then raise exception 'PRICE_CHANGED'; end if;
  minutes := extract(epoch from (p_departure - p_arrival)) / 60;
  subtotal := pg_catalog.round(s.hourly_price * minutes / 60,2);
  fee := pg_catalog.round(subtotal * 0.05,2);
  begin
    insert into public.bookings (idempotency_key,parking_space_id,driver_id,space_title,space_address,
      arrival,departure,vehicle_type,vehicle_registration,hourly_rate,parking_subtotal,service_fee_rate,service_fee,total)
    values (p_idempotency_key,s.id,driver,s.title,s.address,p_arrival,p_departure,p_vehicle_type,registration,
      s.hourly_price,subtotal,0.05,fee,subtotal+fee) returning * into b;
  exception when exclusion_violation then raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end;
  return pg_catalog.to_jsonb(b);
end;
$$;
revoke all on function public.create_booking(text,timestamptz,timestamptz,text,text,uuid,numeric) from public, anon, authenticated;
grant execute on function public.create_booking(text,timestamptz,timestamptz,text,text,uuid,numeric) to authenticated;
commit;
