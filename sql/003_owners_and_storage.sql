-- Run manually ONLY in the NEW ParkShare project, after 001 and 002.
begin;
alter table public.parking_spaces add column if not exists owner_id uuid references auth.users(id) on delete set null;
create index if not exists parking_spaces_owner_idx on public.parking_spaces(owner_id);
alter table public.parking_spaces enable row level security;
-- Replace this table's policies so permissive policies cannot bypass ownership.
do $$ declare policy_row record; begin
  for policy_row in select policyname from pg_policies where schemaname = 'public' and tablename = 'parking_spaces'
  loop execute format('drop policy %I on public.parking_spaces', policy_row.policyname); end loop;
end $$;
revoke all on public.parking_spaces from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.parking_spaces to anon, authenticated;
grant insert (id,owner_id,title,description,locality,city,address,hourly_price,supported_vehicles,amenities,parking_rules,image_urls,published,featured) on public.parking_spaces to authenticated;
-- Ownership, ID, timestamps, and featured status are not editable by clients.
grant update (title,description,locality,city,address,hourly_price,supported_vehicles,amenities,parking_rules,image_urls,published) on public.parking_spaces to authenticated;
grant delete on public.parking_spaces to authenticated;
create policy "Read published or own" on public.parking_spaces for select to anon, authenticated
  using (published or owner_id = (select auth.uid()));
create policy "Insert own" on public.parking_spaces for insert to authenticated
  with check (owner_id = (select auth.uid()) and featured = false);
create policy "Update own" on public.parking_spaces for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Delete own" on public.parking_spaces for delete to authenticated
  using (owner_id = (select auth.uid()));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('parking-images','parking-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage RLS is managed by Supabase. These policies affect this bucket only.
drop policy if exists "ParkShare photo read" on storage.objects;
drop policy if exists "ParkShare photo insert" on storage.objects;
drop policy if exists "ParkShare photo update" on storage.objects;
drop policy if exists "ParkShare photo delete" on storage.objects;
drop policy if exists "ParkShare photo write guard" on storage.objects;
create policy "ParkShare photo read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'parking-images');
create policy "ParkShare photo insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'parking-images' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "ParkShare photo update" on storage.objects for update to authenticated
  using (bucket_id = 'parking-images' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'parking-images' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "ParkShare photo delete" on storage.objects for delete to authenticated
  using (bucket_id = 'parking-images' and (storage.foldername(name))[1] = (select auth.uid()::text));
-- Restrictive write gates neutralize any older broad Storage write policies for this bucket.
drop policy if exists "ParkShare insert guard" on storage.objects;
drop policy if exists "ParkShare update guard" on storage.objects;
drop policy if exists "ParkShare delete guard" on storage.objects;
create policy "ParkShare insert guard" on storage.objects as restrictive for insert to public
  with check (bucket_id <> 'parking-images' or (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "ParkShare update guard" on storage.objects as restrictive for update to public
  using (bucket_id <> 'parking-images' or (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id <> 'parking-images' or (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "ParkShare delete guard" on storage.objects as restrictive for delete to public
  using (bucket_id <> 'parking-images' or (storage.foldername(name))[1] = (select auth.uid()::text));
commit;
