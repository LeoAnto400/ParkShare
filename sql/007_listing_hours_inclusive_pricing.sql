-- NEW ParkShare only. Apply manually after 001–006. Preserve historical bookings.
begin;
create function public.valid_opening_schedule(schedule jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare day jsonb; first_day jsonb; opened integer := 0;
begin
  if jsonb_typeof(schedule) is distinct from 'object' or (schedule->>'mode' in ('daily','custom')) is not true
    or jsonb_typeof(schedule->'days') is distinct from 'array' then return false; end if;
  if jsonb_array_length(schedule->'days') <> 7 then return false; end if;
  for day in select value from jsonb_array_elements(schedule->'days') loop
    if day = 'null'::jsonb then continue; end if;
    if jsonb_typeof(day) is distinct from 'object'
      or jsonb_typeof(day->'open') is distinct from 'string' or jsonb_typeof(day->'close') is distinct from 'string'
      or ((day->>'open') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') is not true
      or ((day->>'close') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') is not true then return false; end if;
    if day->>'close' <> '00:00' and day->>'close' <= day->>'open' then return false; end if;
    if schedule->>'mode'='daily' and first_day is not null and day<>first_day then return false; end if;
    first_day := day; opened := opened+1;
  end loop;
  return opened>0;
end; $$;
revoke all on function public.valid_opening_schedule(jsonb) from public,anon,authenticated;
grant execute on function public.valid_opening_schedule(jsonb) to authenticated;

-- Existing listings retain their previous 24/7 availability until the owner edits it.
alter table public.parking_spaces add column opening_schedule jsonb not null default
  '{"mode":"daily","days":[{"open":"00:00","close":"00:00"},{"open":"00:00","close":"00:00"},{"open":"00:00","close":"00:00"},{"open":"00:00","close":"00:00"},{"open":"00:00","close":"00:00"},{"open":"00:00","close":"00:00"},{"open":"00:00","close":"00:00"}]}'::jsonb,
  add constraint valid_weekly_schedule check(public.valid_opening_schedule(opening_schedule));
grant insert(opening_schedule), update(opening_schedule) on public.parking_spaces to authenticated;
-- Mark historical pricing without changing any stored rate, amount or payment.
alter table public.bookings add column pricing_model text not null default 'exclusive_v1'
  check(pricing_model in ('exclusive_v1','inclusive_v1'));
alter table public.bookings alter column pricing_model set default 'inclusive_v1';

-- Entire half-open reservation must be inside opening windows in India.
-- Check each crossed calendar day: this also detects a closed day or overnight gap.
create function public.require_opening_hours(schedule jsonb, arrival timestamptz, departure timestamptz)
returns void language plpgsql set search_path='' as $$
declare day_date date := (arrival at time zone 'Asia/Kolkata')::date;
  last_date date := ((departure - interval '1 microsecond') at time zone 'Asia/Kolkata')::date;
  hours jsonb; opens timestamptz; closes timestamptz; boundary timestamptz;
begin
  while day_date <= last_date loop
    hours := schedule->'days'->(extract(isodow from day_date)::integer-1);
    if hours is null or hours='null'::jsonb then raise exception 'OUTSIDE_OPENING_HOURS'; end if;
    opens := (day_date + (hours->>'open')::time) at time zone 'Asia/Kolkata';
    boundary := (day_date+1)::timestamp at time zone 'Asia/Kolkata';
    closes := case when hours->>'close'='00:00' then boundary else (day_date+(hours->>'close')::time) at time zone 'Asia/Kolkata' end;
    if greatest(arrival, day_date::timestamp at time zone 'Asia/Kolkata') < opens
      or least(departure,boundary)>closes then raise exception 'OUTSIDE_OPENING_HOURS'; end if;
    day_date := day_date+1;
  end loop;
end; $$;
revoke all on function public.require_opening_hours(jsonb,timestamptz,timestamptz) from public,anon,authenticated;

create or replace function public.booking_quote(p_space_id text, p_arrival timestamptz,
  p_departure timestamptz, p_vehicle_type text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.parking_spaces%rowtype; minutes numeric; subtotal numeric; fee numeric; driver_total numeric; available boolean;
begin
  perform public.validate_booking_interval(p_arrival,p_departure);
  select * into s from public.parking_spaces where id = p_space_id and published;
  if not found then raise exception 'SPACE_UNAVAILABLE'; end if;
  if p_vehicle_type is null or not (p_vehicle_type = any(s.supported_vehicles)) then raise exception 'UNSUPPORTED_VEHICLE'; end if;
  perform public.require_opening_hours(s.opening_schedule,p_arrival,p_departure);
  minutes := extract(epoch from (p_departure - p_arrival)) / 60;
  driver_total := pg_catalog.round(s.hourly_price * minutes / 60,2);
  fee := pg_catalog.round(driver_total * 0.05,2);
  subtotal := driver_total - fee;
  select not exists(select 1 from public.bookings b where b.parking_space_id = s.id
    and b.status = 'confirmed' and pg_catalog.tstzrange(b.arrival,b.departure,'[)') && pg_catalog.tstzrange(p_arrival,p_departure,'[)')) into available;
  return pg_catalog.jsonb_build_object('available',available,'duration_minutes',minutes,
    'hourly_rate',s.hourly_price,'parking_subtotal',subtotal,'service_fee_rate',0.05,
    'service_fee',fee,'total',driver_total,'pricing_model','inclusive_v1');
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
  minutes numeric; subtotal numeric; fee numeric; driver_total numeric;
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
  -- SHARE conflicts with UPDATE/DELETE: schedule, price, ownership, publication and vehicles
  -- cannot change between validation and insert. Concurrent bookings still reach the exclusion constraint.
  select * into s from public.parking_spaces where id = p_space_id for share;
  if not found or not s.published then raise exception 'SPACE_UNAVAILABLE'; end if;
  if s.owner_id = driver then raise exception 'SELF_BOOKING'; end if;
  perform public.validate_booking_interval(p_arrival,p_departure);
  if p_vehicle_type is null or not (p_vehicle_type = any(s.supported_vehicles)) then raise exception 'UNSUPPORTED_VEHICLE'; end if;
  if registration is null or registration !~ '^[A-Z0-9][A-Z0-9 -]{3,18}[A-Z0-9]$' then raise exception 'INVALID_REGISTRATION'; end if;
  -- Expected rate is a comparison guard only, NEVER a source for the calculation.
  if p_expected_hourly_rate is distinct from s.hourly_price then raise exception 'PRICE_CHANGED'; end if;
  perform public.require_opening_hours(s.opening_schedule,p_arrival,p_departure);
  minutes := extract(epoch from (p_departure - p_arrival)) / 60;
  driver_total := pg_catalog.round(s.hourly_price * minutes / 60,2);
  fee := pg_catalog.round(driver_total * 0.05,2);
  subtotal := driver_total - fee;
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


create or replace function public.owner_reservations(p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  if p_offset is null or p_offset<0 then raise exception 'INVALID_OFFSET'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r)) from (
    select b.id,b.parking_space_id,b.space_title,b.space_address,b.space_locality,b.space_city,
      b.space_latitude,b.space_longitude,b.arrival,b.departure,b.vehicle_type,b.vehicle_registration,
      b.status,b.payment_status,b.pricing_model,b.hourly_rate,b.parking_subtotal,b.service_fee_rate,b.service_fee,b.total,b.created_at
    from public.bookings b join public.parking_spaces s on s.id=b.parking_space_id
    where s.owner_id=auth.uid() order by b.created_at desc,b.id limit 100 offset p_offset
  ) r),'[]'::jsonb);
end; $$;
revoke all on function public.owner_reservations(integer) from public,anon,authenticated;
grant execute on function public.owner_reservations(integer) to authenticated;

notify pgrst,'reload schema';
commit;
