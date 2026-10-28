-- Run manually in the NEW ParkShare project AFTER 004. No real payment gateway.
begin;
alter table public.bookings add column if not exists payment_status text not null default 'unpaid';
alter table public.bookings add column if not exists cancelled_at timestamptz;
alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings add constraint bookings_payment_status_check
  check (payment_status in ('unpaid','demo_failed','demo_paid','demo_refunded')
    and (payment_status <> 'demo_refunded' or status = 'cancelled')
    and (status <> 'cancelled' or payment_status <> 'demo_paid'));

create table if not exists public.demo_payment_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_key uuid unique,
  requested_outcome text not null check (requested_outcome in ('success','failure','refund')),
  outcome text not null check (outcome in ('demo_paid','demo_failed','demo_refunded')),
  amount numeric(12,2) not null check (amount >= 0 and amount <> 'NaN'::numeric),
  is_simulation boolean not null default true check (is_simulation = true),
  created_at timestamptz not null default now()
);
create index if not exists payment_events_booking_idx on public.demo_payment_events(booking_id,created_at);
create unique index if not exists payment_once_paid on public.demo_payment_events(booking_id) where outcome = 'demo_paid';
create unique index if not exists payment_once_refunded on public.demo_payment_events(booking_id) where outcome = 'demo_refunded';
alter table public.demo_payment_events enable row level security;
revoke all on public.demo_payment_events from public, anon, authenticated;
grant select on public.demo_payment_events to authenticated;
drop policy if exists "Participants read demo payment history" on public.demo_payment_events;
create policy "Participants read demo payment history" on public.demo_payment_events for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id
    and (b.driver_id = (select auth.uid()) or exists (
      select 1 from public.parking_spaces s where s.id = b.parking_space_id and s.owner_id = (select auth.uid())
    ))));
-- Preserve participant RLS from 004 and continue to forbid direct booking writes.
revoke all on public.bookings from public, anon, authenticated;
grant select on public.bookings to authenticated;

create or replace function public.simulate_booking_payment(p_booking_id uuid, p_outcome text, p_request_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare driver uuid := auth.uid(); b public.bookings%rowtype; e public.demo_payment_events%rowtype;
begin
  if driver is null then raise exception 'LOGIN_REQUIRED'; end if;
  if p_request_key is null or p_outcome is null or p_outcome not in ('success','failure') then raise exception 'INVALID_PAYMENT_REQUEST'; end if;
  -- Retry-key lock first, booking lock second. Cancellation takes only the booking lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_key::text,1));
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.driver_id <> driver then raise exception 'BOOKING_FORBIDDEN'; end if;
  select * into e from public.demo_payment_events where request_key = p_request_key;
  if found then
    if e.booking_id <> b.id or e.actor_id <> driver or e.requested_outcome <> p_outcome then raise exception 'PAYMENT_KEY_MISMATCH'; end if;
    -- Return the original receipt AND current booking state (it may now be cancelled/refunded).
    return pg_catalog.jsonb_build_object('booking',pg_catalog.to_jsonb(b),'event',pg_catalog.to_jsonb(e),'replayed',true);
  end if;
  if b.status <> 'confirmed' or b.departure <= pg_catalog.clock_timestamp() then raise exception 'PAYMENT_NOT_ALLOWED'; end if;
  if b.payment_status = 'demo_paid' then
    -- A failed request can never downgrade success, even with a new key.
    select * into e from public.demo_payment_events where booking_id = b.id and outcome = 'demo_paid';
    return pg_catalog.jsonb_build_object('booking',pg_catalog.to_jsonb(b),'event',pg_catalog.to_jsonb(e),'replayed',true);
  end if;
  update public.bookings set payment_status = case when p_outcome = 'success' then 'demo_paid' else 'demo_failed' end
    where id = b.id returning * into b;
  insert into public.demo_payment_events(booking_id,actor_id,request_key,requested_outcome,outcome,amount)
    values(b.id,driver,p_request_key,p_outcome,b.payment_status,b.total) returning * into e;
  return pg_catalog.jsonb_build_object('booking',pg_catalog.to_jsonb(b),'event',pg_catalog.to_jsonb(e),'replayed',false);
end;
$$;
revoke all on function public.simulate_booking_payment(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.simulate_booking_payment(uuid,text,uuid) to authenticated;

create or replace function public.cancel_booking(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare driver uuid := auth.uid(); b public.bookings%rowtype;
begin
  if driver is null then raise exception 'LOGIN_REQUIRED'; end if;
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.driver_id <> driver then raise exception 'BOOKING_FORBIDDEN'; end if;
  if b.status = 'cancelled' then return pg_catalog.to_jsonb(b); end if;
  if b.status <> 'confirmed' or b.arrival <= pg_catalog.clock_timestamp() then raise exception 'CANCELLATION_NOT_ALLOWED'; end if;
  if b.payment_status = 'demo_paid' then
    insert into public.demo_payment_events(booking_id,actor_id,requested_outcome,outcome,amount)
      values(b.id,driver,'refund','demo_refunded',b.total);
  end if;
  update public.bookings set status = 'cancelled', cancelled_at = pg_catalog.clock_timestamp(),
    payment_status = case when payment_status = 'demo_paid' then 'demo_refunded' else payment_status end
    where id = b.id returning * into b;
  -- The existing exclusion constraint ignores cancelled rows, releasing the spot atomically.
  return pg_catalog.to_jsonb(b);
end;
$$;
revoke all on function public.cancel_booking(uuid) from public, anon, authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;

-- Owner-only, read-only, paged API. No arbitrary owner ID and no auth.users join.
create or replace function public.owner_reservations(p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  if p_offset is null or p_offset < 0 then raise exception 'INVALID_OFFSET'; end if;
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)) from (
    select b.id,b.parking_space_id,b.space_title,b.space_address,b.arrival,b.departure,
      b.vehicle_type,b.vehicle_registration,b.status,b.payment_status,b.hourly_rate,
      b.parking_subtotal,b.service_fee_rate,b.service_fee,b.total,b.created_at
    from public.bookings b join public.parking_spaces s on s.id = b.parking_space_id
    where s.owner_id = auth.uid() order by b.created_at desc,b.id limit 100 offset p_offset
  ) r),'[]'::jsonb);
end;
$$;
revoke all on function public.owner_reservations(integer) from public, anon, authenticated;
grant execute on function public.owner_reservations(integer) to authenticated;
commit;
