-- Run manually in the NEW ParkShare project only, after 001–005. No reset.
begin;
alter table public.parking_spaces add column latitude double precision,
  add column longitude double precision,
  add constraint parking_coordinates check (
    (latitude is null and longitude is null) or
    (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180));
grant insert(latitude,longitude), update(latitude,longitude) on public.parking_spaces to authenticated;

-- Preserve location at reservation time, even if the owner later edits/unpublishes.
alter table public.bookings add column space_latitude double precision,
  add column space_longitude double precision, add column space_locality text, add column space_city text;
update public.bookings b set space_locality=s.locality, space_city=s.city
  from public.parking_spaces s where s.id=b.parking_space_id;
create function public.snapshot_booking_location() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  select s.latitude,s.longitude,s.locality,s.city
    into new.space_latitude,new.space_longitude,new.space_locality,new.space_city
    from public.parking_spaces s where s.id=new.parking_space_id;
  return new;
end; $$;
revoke all on function public.snapshot_booking_location() from public,anon,authenticated;
create trigger booking_location before insert on public.bookings
  for each row execute function public.snapshot_booking_location();

create table public.booking_reviews (
  booking_id uuid primary key references public.bookings(id) on delete restrict,
  parking_space_id text not null references public.parking_spaces(id) on delete restrict,
  driver_id uuid not null references auth.users(id) on delete restrict,
  rating integer not null check (rating between 1 and 5),
  comment text not null check (comment=btrim(comment) and char_length(comment) between 10 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index booking_reviews_space_idx on public.booking_reviews(parking_space_id,created_at desc,booking_id);
alter table public.booking_reviews enable row level security;
revoke all on public.booking_reviews from public,anon,authenticated;
grant select on public.booking_reviews to authenticated;
create policy "Drivers read their own reviews" on public.booking_reviews for select to authenticated
  using (driver_id=(select auth.uid()));
-- No table write grants/policies. Every mutation checks the historical booking.
create function public.save_booking_review(p_booking_id uuid,p_rating numeric,p_comment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; r public.booking_reviews%rowtype; trimmed text := regexp_replace(p_comment, '^\s+|\s+$', '', 'g');
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  select * into b from public.bookings where id=p_booking_id for update;
  if not found or b.driver_id<>auth.uid() then raise exception 'BOOKING_FORBIDDEN'; end if;
  if b.status<>'confirmed' or b.departure>pg_catalog.clock_timestamp() then raise exception 'REVIEW_INELIGIBLE'; end if;
  if p_rating is null or p_rating not between 1 and 5 or p_rating<>trunc(p_rating)
    or p_comment is null or char_length(trimmed) not between 10 and 1000 then
    raise exception 'INVALID_REVIEW';
  end if;
  -- A second save edits the one review; concurrent requests serialize on booking.
  insert into public.booking_reviews(booking_id,parking_space_id,driver_id,rating,comment)
    values(b.id,b.parking_space_id,b.driver_id,p_rating::integer,trimmed)
    on conflict(booking_id) do update set rating=excluded.rating,comment=excluded.comment,updated_at=pg_catalog.clock_timestamp()
    returning * into r;
  return pg_catalog.to_jsonb(r);
end; $$;
create function public.delete_booking_review(p_booking_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype;
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  select * into b from public.bookings where id=p_booking_id for update;
  if not found or b.driver_id<>auth.uid() then raise exception 'BOOKING_FORBIDDEN'; end if;
  delete from public.booking_reviews where booking_id=b.id and driver_id=auth.uid();
end; $$;
revoke all on function public.save_booking_review(uuid,numeric,text), public.delete_booking_review(uuid) from public,anon,authenticated;
grant execute on function public.save_booking_review(uuid,numeric,text), public.delete_booking_review(uuid) to authenticated;

-- Explicit public projections never return review/booking/account identifiers.
create function public.rating_summaries(p_space_ids text[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if p_space_ids is null or cardinality(p_space_ids)>100 then raise exception 'INVALID_REVIEW_QUERY'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r)) from (
    select s.id as space_id,count(v.booking_id) as review_count,round(avg(v.rating),1) as average_rating
    from public.parking_spaces s left join public.booking_reviews v on v.parking_space_id=s.id
    where s.published and s.id=any(p_space_ids) group by s.id
  ) r),'[]'::jsonb);
end; $$;
create function public.public_space_reviews(p_space_id text,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if p_offset is null or p_offset<0 then raise exception 'INVALID_OFFSET'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r)) from (
    select v.rating,v.comment,v.created_at,v.updated_at from public.booking_reviews v
    join public.parking_spaces s on s.id=v.parking_space_id
    where s.id=p_space_id and s.published order by v.created_at desc,v.booking_id limit 20 offset p_offset
  ) r),'[]'::jsonb);
end; $$;
revoke all on function public.rating_summaries(text[]),public.public_space_reviews(text,integer) from public,anon,authenticated;
grant execute on function public.rating_summaries(text[]),public.public_space_reviews(text,integer) to anon,authenticated;

create function public.owner_earnings(p_space_id text default null,p_from date default null,p_to date default null,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  if p_offset is null or p_offset<0 or (p_from is not null and not isfinite(p_from))
    or (p_to is not null and not isfinite(p_to)) or p_from>p_to then raise exception 'INVALID_EARNINGS_FILTER'; end if;
  -- Date inputs are inclusive ARRIVAL dates in India, represented as a half-open UTC range.
  -- EXISTS checks receipts without multiplying rows by failed/retried attempts.
  with selected as (
    select b.id,b.parking_space_id,b.space_title,b.arrival,b.departure,b.status,b.payment_status,
      b.parking_subtotal,b.service_fee,b.total,
      case
        when b.status='confirmed' and b.payment_status='demo_paid' and exists
          (select 1 from public.demo_payment_events e where e.booking_id=b.id and e.outcome='demo_paid')
          then case when b.departure<=now() then 'completed' else 'pending' end
        when b.payment_status='demo_refunded' then 'refunded'
        else 'excluded' end as earnings_category
    from public.bookings b join public.parking_spaces s on s.id=b.parking_space_id
    where s.owner_id=auth.uid() and (p_space_id is null or s.id=p_space_id)
      and (p_from is null or b.arrival >= (p_from::timestamp at time zone 'Asia/Kolkata'))
      and (p_to is null or b.arrival < ((p_to+1)::timestamp at time zone 'Asia/Kolkata'))
  ), totals as (
    select count(*) as booking_count,
      coalesce(sum(parking_subtotal) filter(where earnings_category='completed'),0) as completed_owner,
      coalesce(sum(service_fee) filter(where earnings_category='completed'),0) as completed_platform,
      coalesce(sum(parking_subtotal) filter(where earnings_category='pending'),0) as pending_owner,
      coalesce(sum(service_fee) filter(where earnings_category='pending'),0) as pending_platform,
      coalesce(sum(total) filter(where earnings_category='refunded'),0) as refunded_total,
      coalesce(sum(parking_subtotal) filter(where earnings_category='refunded'),0) as refunded_owner,
      coalesce(sum(service_fee) filter(where earnings_category='refunded'),0) as refunded_platform,
      count(*) filter(where earnings_category='excluded') as excluded_count,
      coalesce(sum(total) filter(where earnings_category='excluded'),0) as excluded_total
    from selected
  ) select jsonb_build_object('totals',(select to_jsonb(t) from totals t),
      'rows',coalesce((select jsonb_agg(to_jsonb(r)) from
        (select * from selected order by arrival desc,id limit 50 offset p_offset) r),'[]'::jsonb),
      'as_of',now()) into result;
  return result;
end; $$;
revoke all on function public.owner_earnings(text,date,date,integer) from public,anon,authenticated;
grant execute on function public.owner_earnings(text,date,date,integer) to authenticated;

-- Extend the existing owner projection with safe location snapshots only.
create or replace function public.owner_reservations(p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  if p_offset is null or p_offset<0 then raise exception 'INVALID_OFFSET'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r)) from (
    select b.id,b.parking_space_id,b.space_title,b.space_address,b.space_locality,b.space_city,
      b.space_latitude,b.space_longitude,b.arrival,b.departure,b.vehicle_type,b.vehicle_registration,
      b.status,b.payment_status,b.hourly_rate,b.parking_subtotal,b.service_fee_rate,b.service_fee,b.total,b.created_at
    from public.bookings b join public.parking_spaces s on s.id=b.parking_space_id
    where s.owner_id=auth.uid() order by b.created_at desc,b.id limit 100 offset p_offset
  ) r),'[]'::jsonb);
end; $$;
revoke all on function public.owner_reservations(integer) from public,anon,authenticated;
grant execute on function public.owner_reservations(integer) to authenticated;
notify pgrst,'reload schema';
commit;
