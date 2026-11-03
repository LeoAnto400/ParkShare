-- Run manually in the NEW ParkShare Supabase project after migration 008.
-- Keep the seed rows and any history, but remove the fictional spaces from public browsing.
begin;

update public.parking_spaces
set published = false,
    featured = false
where id in ('pn-001', 'pn-002', 'pn-003', 'pn-004', 'pn-005', 'pn-006', 'pn-007', 'pn-008')
  and owner_id is null;

commit;
