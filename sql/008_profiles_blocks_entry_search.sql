-- NEW ParkShare only. Apply manually after 001–007. Never run against old projects.
-- Adds: user profiles (name + phone), listing landmark and vehicle size limits,
-- private entry instructions, owner-blocked periods, schedule/booking conflict
-- protection, public busy-slot reads and availability-aware search.
begin;
set local search_path = public, extensions, pg_catalog;

-- ---------------------------------------------------------------------------
-- 1. Profiles. One row per account, created automatically from signup metadata.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (pg_catalog.length(full_name) <= 100),
  phone text check (phone is null or phone ~ '^\+?[0-9]{10,15}$'),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select, insert (id, full_name, phone), update (full_name, phone) on public.profiles to authenticated;
create policy "Read own profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "Insert own profile" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "Update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create function public.touch_profile() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := pg_catalog.now(); return new; end; $$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_profile();

-- Signup sends { name, phone } as user metadata. Invalid phone metadata must
-- never block account creation, so it is stored as null and can be fixed later.
create function public.create_profile_for_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  phone text := nullif(pg_catalog.btrim(meta->>'phone'), '');
begin
  if phone is not null and phone !~ '^\+?[0-9]{10,15}$' then phone := null; end if;
  insert into public.profiles (id, full_name, phone)
  values (new.id, pg_catalog.left(pg_catalog.btrim(coalesce(meta->>'name', '')), 100), phone)
  on conflict (id) do nothing;
  return new;
end; $$;
revoke all on function public.create_profile_for_user() from public, anon, authenticated;
create trigger on_auth_user_created_profile after insert on auth.users
  for each row execute function public.create_profile_for_user();
-- Existing accounts receive an empty-phone profile they can complete on the Profile page.
insert into public.profiles (id, full_name)
select u.id, pg_catalog.left(pg_catalog.btrim(coalesce(u.raw_user_meta_data->>'name', '')), 100)
from auth.users u on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Listing landmark and optional vehicle size limits (metres).
-- ---------------------------------------------------------------------------
alter table public.parking_spaces
  add column landmark text check (landmark is null or pg_catalog.length(pg_catalog.btrim(landmark)) between 1 and 120),
  add column max_vehicle_length_m numeric(4,2) check (max_vehicle_length_m is null or (max_vehicle_length_m > 0 and max_vehicle_length_m <= 20)),
  add column max_vehicle_height_m numeric(4,2) check (max_vehicle_height_m is null or (max_vehicle_height_m > 0 and max_vehicle_height_m <= 10));
grant insert (landmark, max_vehicle_length_m, max_vehicle_height_m),
  update (landmark, max_vehicle_length_m, max_vehicle_height_m) on public.parking_spaces to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Private entry instructions. Never part of the public listing row.
-- ---------------------------------------------------------------------------
create table public.space_entry_instructions (
  parking_space_id text primary key references public.parking_spaces(id) on delete cascade,
  instructions text not null check (pg_catalog.length(pg_catalog.btrim(instructions)) between 1 and 1000),
  updated_at timestamptz not null default now()
);
alter table public.space_entry_instructions enable row level security;
revoke all on public.space_entry_instructions from public, anon, authenticated;
grant select on public.space_entry_instructions to authenticated;
create policy "Owners read own entry instructions" on public.space_entry_instructions for select to authenticated
  using (exists (select 1 from public.parking_spaces s where s.id = parking_space_id and s.owner_id = (select auth.uid())));

create function public.set_space_entry_instructions(p_space_id text, p_instructions text)
returns void language plpgsql security definer set search_path = '' as $$
declare cleaned text := nullif(pg_catalog.btrim(p_instructions), '');
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  if not exists (select 1 from public.parking_spaces s where s.id = p_space_id and s.owner_id = auth.uid()) then
    raise exception 'SPACE_FORBIDDEN';
  end if;
  if cleaned is null then
    delete from public.space_entry_instructions where parking_space_id = p_space_id;
    return;
  end if;
  if pg_catalog.length(cleaned) > 1000 then raise exception 'INVALID_ENTRY_INSTRUCTIONS'; end if;
  insert into public.space_entry_instructions (parking_space_id, instructions) values (p_space_id, cleaned)
  on conflict (parking_space_id) do update set instructions = excluded.instructions, updated_at = pg_catalog.now();
end; $$;
revoke all on function public.set_space_entry_instructions(text, text) from public, anon, authenticated;
grant execute on function public.set_space_entry_instructions(text, text) to authenticated;

-- Released only for confirmed bookings that have not yet ended, to that booking's
-- driver or the space owner. Batched so a bookings list needs one request.
create function public.booking_entry_instructions(p_booking_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  if p_booking_ids is null or pg_catalog.cardinality(p_booking_ids) > 100 then raise exception 'INVALID_REQUEST'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('booking_id', b.id, 'instructions', i.instructions))
    from public.bookings b
    join public.parking_spaces s on s.id = b.parking_space_id
    join public.space_entry_instructions i on i.parking_space_id = b.parking_space_id
    where b.id = any(p_booking_ids) and b.status = 'confirmed' and b.departure > pg_catalog.now()
      and (b.driver_id = auth.uid() or s.owner_id = auth.uid())), '[]'::jsonb);
end; $$;
revoke all on function public.booking_entry_instructions(uuid[]) from public, anon, authenticated;
grant execute on function public.booking_entry_instructions(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Owner-blocked periods (the owner needs the space). Non-overlapping, and
--    never on top of a confirmed booking.
-- ---------------------------------------------------------------------------
create table public.space_blocks (
  id uuid primary key default gen_random_uuid(),
  parking_space_id text not null references public.parking_spaces(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text check (reason is null or pg_catalog.length(pg_catalog.btrim(reason)) between 1 and 200),
  created_at timestamptz not null default now(),
  check (isfinite(starts_at) and isfinite(ends_at) and ends_at > starts_at and ends_at - starts_at <= interval '366 days'),
  constraint space_blocks_no_overlap exclude using gist (
    parking_space_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  )
);
create index space_blocks_space_idx on public.space_blocks(parking_space_id);
alter table public.space_blocks enable row level security;
revoke all on public.space_blocks from public, anon, authenticated;
grant select on public.space_blocks to authenticated;
create policy "Owners read own blocks" on public.space_blocks for select to authenticated
  using (exists (select 1 from public.parking_spaces s where s.id = parking_space_id and s.owner_id = (select auth.uid())));

create function public.create_space_block(p_space_id text, p_starts_at timestamptz, p_ends_at timestamptz, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.parking_spaces%rowtype; k public.space_blocks%rowtype;
  reason text := nullif(pg_catalog.btrim(p_reason), '');
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  -- NO KEY UPDATE conflicts with create_booking's FOR SHARE lock, so a new block
  -- and a new booking for the same space are serialized and cannot both succeed.
  select * into s from public.parking_spaces where id = p_space_id for no key update;
  if not found or s.owner_id is distinct from auth.uid() then raise exception 'SPACE_FORBIDDEN'; end if;
  if p_starts_at is null or p_ends_at is null or not isfinite(p_starts_at) or not isfinite(p_ends_at)
      or p_ends_at <= p_starts_at or p_ends_at <= pg_catalog.now() or p_ends_at - p_starts_at > interval '366 days'
      or (reason is not null and pg_catalog.length(reason) > 200) then
    raise exception 'INVALID_BLOCK';
  end if;
  if exists (select 1 from public.bookings b where b.parking_space_id = s.id and b.status = 'confirmed'
      and pg_catalog.tstzrange(b.arrival, b.departure, '[)') && pg_catalog.tstzrange(p_starts_at, p_ends_at, '[)')) then
    raise exception 'BLOCK_CONFLICTS_BOOKING';
  end if;
  begin
    insert into public.space_blocks (parking_space_id, starts_at, ends_at, reason)
    values (s.id, p_starts_at, p_ends_at, reason) returning * into k;
  exception when exclusion_violation then raise exception 'BLOCK_OVERLAP' using errcode = 'P0001';
  end;
  return pg_catalog.to_jsonb(k);
end; $$;
revoke all on function public.create_space_block(text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.create_space_block(text, timestamptz, timestamptz, text) to authenticated;

create function public.delete_space_block(p_block_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  delete from public.space_blocks k using public.parking_spaces s
  where k.id = p_block_id and s.id = k.parking_space_id and s.owner_id = auth.uid();
  if not found then raise exception 'SPACE_FORBIDDEN'; end if;
end; $$;
revoke all on function public.delete_space_block(uuid) from public, anon, authenticated;
grant execute on function public.delete_space_block(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Schedule changes may not strand a confirmed booking that has not ended.
-- ---------------------------------------------------------------------------
-- Boolean wrapper around 007's checker, for filters and triggers.
create function public.within_opening_hours(schedule jsonb, arrival timestamptz, departure timestamptz)
returns boolean language plpgsql set search_path = '' as $$
begin
  perform public.require_opening_hours(schedule, arrival, departure);
  return true;
exception when raise_exception then return false;
end; $$;
revoke all on function public.within_opening_hours(jsonb, timestamptz, timestamptz) from public, anon, authenticated;

create function public.guard_schedule_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Only the remaining part of an active booking needs to stay inside the new hours.
  if new.opening_schedule is distinct from old.opening_schedule and exists (
      select 1 from public.bookings b
      where b.parking_space_id = new.id and b.status = 'confirmed' and b.departure > pg_catalog.now()
        and not public.within_opening_hours(new.opening_schedule, greatest(b.arrival, pg_catalog.now()), b.departure)) then
    raise exception 'SCHEDULE_CONFLICTS_BOOKING';
  end if;
  return new;
end; $$;
revoke all on function public.guard_schedule_change() from public, anon, authenticated;
create trigger parking_spaces_schedule_guard before update of opening_schedule on public.parking_spaces
  for each row execute function public.guard_schedule_change();

-- ---------------------------------------------------------------------------
-- 6. Quote and booking also respect owner blocks (otherwise unchanged from 007).
-- ---------------------------------------------------------------------------
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
  -- Still a yes/no answer only: no booking rows, block reasons or identities are disclosed.
  select not exists(select 1 from public.bookings b where b.parking_space_id = s.id
      and b.status = 'confirmed' and pg_catalog.tstzrange(b.arrival,b.departure,'[)') && pg_catalog.tstzrange(p_arrival,p_departure,'[)'))
    and not exists(select 1 from public.space_blocks k where k.parking_space_id = s.id
      and pg_catalog.tstzrange(k.starts_at,k.ends_at,'[)') && pg_catalog.tstzrange(p_arrival,p_departure,'[)'))
    into available;
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
  -- SHARE conflicts with UPDATE/DELETE and with create_space_block's NO KEY UPDATE:
  -- schedule, price, publication and blocks cannot change between validation and insert.
  select * into s from public.parking_spaces where id = p_space_id for share;
  if not found or not s.published then raise exception 'SPACE_UNAVAILABLE'; end if;
  if s.owner_id = driver then raise exception 'SELF_BOOKING'; end if;
  perform public.validate_booking_interval(p_arrival,p_departure);
  if p_vehicle_type is null or not (p_vehicle_type = any(s.supported_vehicles)) then raise exception 'UNSUPPORTED_VEHICLE'; end if;
  if registration is null or registration !~ '^[A-Z0-9][A-Z0-9 -]{3,18}[A-Z0-9]$' then raise exception 'INVALID_REGISTRATION'; end if;
  -- Expected rate is a comparison guard only, NEVER a source for the calculation.
  if p_expected_hourly_rate is distinct from s.hourly_price then raise exception 'PRICE_CHANGED'; end if;
  perform public.require_opening_hours(s.opening_schedule,p_arrival,p_departure);
  if exists (select 1 from public.space_blocks k where k.parking_space_id = s.id
      and pg_catalog.tstzrange(k.starts_at,k.ends_at,'[)') && pg_catalog.tstzrange(p_arrival,p_departure,'[)')) then
    raise exception 'SPACE_BLOCKED';
  end if;
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

-- ---------------------------------------------------------------------------
-- 7. Public availability reads: time ranges only, never who booked or why blocked.
-- ---------------------------------------------------------------------------
create function public.space_busy_intervals(p_space_id text, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
      or p_to <= p_from or p_to - p_from > interval '31 days' then raise exception 'INVALID_RANGE'; end if;
  if not exists (select 1 from public.parking_spaces where id = p_space_id and published) then raise exception 'SPACE_UNAVAILABLE'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('start', greatest(x.s, p_from), 'end', least(x.e, p_to), 'kind', x.kind) order by x.s)
    from (
      select b.arrival s, b.departure e, 'booked' kind from public.bookings b
      where b.parking_space_id = p_space_id and b.status = 'confirmed' and b.arrival < p_to and b.departure > p_from
      union all
      select k.starts_at, k.ends_at, 'blocked' from public.space_blocks k
      where k.parking_space_id = p_space_id and k.starts_at < p_to and k.ends_at > p_from
    ) x), '[]'::jsonb);
end; $$;
revoke all on function public.space_busy_intervals(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.space_busy_intervals(text, timestamptz, timestamptz) to anon, authenticated;

-- Search filter: published spaces whose hours cover the whole period and that have
-- no confirmed booking or owner block overlapping it.
create function public.available_space_ids(p_arrival timestamptz, p_departure timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.validate_booking_interval(p_arrival, p_departure);
  return coalesce((select jsonb_agg(s.id order by s.id) from public.parking_spaces s
    where s.published
      and public.within_opening_hours(s.opening_schedule, p_arrival, p_departure)
      and not exists (select 1 from public.bookings b where b.parking_space_id = s.id and b.status = 'confirmed'
        and pg_catalog.tstzrange(b.arrival, b.departure, '[)') && pg_catalog.tstzrange(p_arrival, p_departure, '[)'))
      and not exists (select 1 from public.space_blocks k where k.parking_space_id = s.id
        and pg_catalog.tstzrange(k.starts_at, k.ends_at, '[)') && pg_catalog.tstzrange(p_arrival, p_departure, '[)'))
  ), '[]'::jsonb);
end; $$;
revoke all on function public.available_space_ids(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.available_space_ids(timestamptz, timestamptz) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
