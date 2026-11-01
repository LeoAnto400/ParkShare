"""Disposable LOCAL PostgreSQL integration checks; never reads .env or contacts Supabase.
Usage: python tests/run_sql_checks.py --pg-bin "C:\\Program Files\\PostgreSQL\\17\\bin"
Supabase auth/storage schemas are minimal stubs; hosted JWT/Storage behavior needs live checks.
"""
import argparse
import json
from pathlib import Path
import socket
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--pg-bin', required=True)
args = parser.parse_args()
bin_path = Path(args.pg_bin)
root = Path(__file__).resolve().parents[1]
flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
def run(name, *params, input=None, check=True):
    if name == 'pg_ctl':
        # A detached Windows postgres process can inherit pipe handles and keep
        # subprocess.communicate() waiting forever. Use a real file for pg_ctl.
        with tempfile.TemporaryFile(mode='w+', encoding='utf-8') as output:
            result = subprocess.run([str(bin_path / name), *map(str, params)],
                                    stdout=output, stderr=output, text=True, creationflags=flags, timeout=90)
            output.seek(0)
            result.stdout = output.read()
            result.stderr = ''
            if check and result.returncode:
                raise RuntimeError(result.stdout)
            return result
    result = subprocess.run([str(bin_path / name), *map(str, params)], input=input,
                            capture_output=True, text=True, encoding='utf-8', creationflags=flags)
    if check and result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result

owner = '00000000-0000-0000-0000-000000000001'
driver = '00000000-0000-0000-0000-000000000002'
other = '00000000-0000-0000-0000-000000000003'
def bid(n): return f'10000000-0000-0000-0000-{n:012d}'

with tempfile.TemporaryDirectory(prefix='parkshare-sql-') as tmp:
    data = Path(tmp) / 'data'
    run('initdb', '-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '-E', 'UTF8')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    started = False
    try:
        run('pg_ctl', '-D', data, '-l', Path(tmp) / 'postgres.log', '-o', f'-h 127.0.0.1 -p {port}', '-w', 'start')
        started = True
        def sql(query, user=None, role=None, error=None):
            prefix = ''
            if role or user:
                prefix = f"set role {role or 'authenticated'}; set request.jwt.claim.sub='{user or ''}';\n"
            result = run('psql', '-X', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres',
                         '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-q', input=prefix+query, check=not error)
            if error:
                assert result.returncode and error in result.stderr, result.stderr
            return result.stdout.strip()
        def obj(query, user=None, role=None): return json.loads(sql(query, user, role))
        sql("""
          create role anon; create role authenticated;
          create schema auth; create schema storage; create schema extensions;
          create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb);
          create function auth.uid() returns uuid language sql stable as
            $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
          grant usage on schema auth to anon,authenticated;
          grant execute on function auth.uid() to anon,authenticated;
          create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
          create table storage.objects(id uuid primary key,bucket_id text,name text);
          alter table storage.objects enable row level security;
          create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
        """)
        for migration in sorted((root / 'sql').glob('*.sql')):
            sql(migration.read_text(encoding='utf-8'))
        assert sql('select count(*) from public.parking_spaces where owner_id is null;') == '8'
        sql(f"insert into auth.users values ('{owner}'),('{driver}'),('{other}');")
        sql(f"""insert into public.parking_spaces(id,owner_id,title,description,locality,city,address,hourly_price,supported_vehicles,image_urls,published,latitude,longitude)
          values('test-space','{owner}','Test space','Test description','Locality','City','Address',100,array['Car'],array['https://example.test/photo.jpg'],true,12,74),
          ('other-space','{other}','Other space','Test description','Locality','City','Address',100,array['Car'],array['https://example.test/photo.jpg'],true,null,null);""")
        records = [
            (1, "'2020-01-01T18:30:00Z'", 'confirmed', 'demo_paid', 100),
            (2, "now()+interval '3 days'", 'confirmed', 'demo_paid', 200),
            (3, "now()+interval '4 days'", 'cancelled', 'demo_refunded', 300),
            (4, "'2020-01-01T17:00:00Z'", 'confirmed', 'unpaid', 400),
            (5, "now()+interval '5 days'", 'confirmed', 'demo_failed', 500),
            (6, "now()+interval '6 days'", 'cancelled', 'unpaid', 600),
        ]
        for n, arrival, status, payment, subtotal in records:
            sql(f"""insert into public.bookings(id,idempotency_key,parking_space_id,driver_id,space_title,space_address,arrival,departure,
              vehicle_type,vehicle_registration,status,payment_status,hourly_rate,parking_subtotal,service_fee_rate,service_fee,total)
              values('{bid(n)}',gen_random_uuid(),'test-space','{driver}','Test space','Snapshot address',({arrival})::timestamptz,
              ({arrival})::timestamptz+interval '1 hour','Car','KA20AB1234','{status}','{payment}',100,{subtotal},.05,{subtotal*.05},{subtotal*1.05});""")
        for n in [1,2,3]:
            sql(f"""insert into public.demo_payment_events(booking_id,actor_id,request_key,requested_outcome,outcome,amount)
              values('{bid(n)}','{driver}',gen_random_uuid(),'success','demo_paid',{n*105});""")
        sql(f"""insert into public.demo_payment_events(booking_id,actor_id,request_key,requested_outcome,outcome,amount)
          values('{bid(1)}','{driver}',gen_random_uuid(),'failure','demo_failed',105),
          ('{bid(1)}','{driver}',gen_random_uuid(),'failure','demo_failed',105),
          ('{bid(3)}','{driver}',null,'refund','demo_refunded',315);""")
        totals = obj('select public.owner_earnings();', owner)['totals']
        assert totals == dict(booking_count=6,completed_owner=100,completed_platform=5,pending_owner=200,pending_platform=10,
                             refunded_total=315,refunded_owner=300,refunded_platform=15,excluded_count=3,excluded_total=1575), totals
        assert obj('select public.owner_earnings();', other)['totals']['booking_count'] == 0
        assert obj("select public.owner_earnings('test-space');", other)['rows'] == []
        assert obj("select public.owner_earnings(null,'2020-01-02','2020-01-02');", owner)['totals']['completed_owner'] == 100
        assert obj("select public.owner_earnings(null,'2020-01-01','2020-01-01');", owner)['totals']['booking_count'] == 1
        sql("select public.owner_earnings(null,'2020-02-01','2020-01-01');", owner, error='INVALID_EARNINGS_FILTER')
        sql('select public.owner_earnings();', role='anon', error='permission denied')
        print('PASS earnings: stored subtotals/fees, deduplication, exclusions, owner isolation and IST midnight boundaries')

        review_call = f"select public.save_booking_review('{bid(1)}',4,'  Good parking entrance.  ');"
        assert obj(review_call, driver)['comment'] == 'Good parking entrance.'
        sql(review_call, owner, error='BOOKING_FORBIDDEN')
        sql(review_call, other, error='BOOKING_FORBIDDEN')
        for n in [2,3]:
            sql(f"select public.save_booking_review('{bid(n)}',4,'Good parking entrance.');", driver, error='REVIEW_INELIGIBLE')
        for rating in ['0','6','2.5',"'NaN'::numeric"]:
            sql(f"select public.save_booking_review('{bid(1)}',{rating},'Good parking entrance.');", driver, error='INVALID_REVIEW')
        for comment in ["'short'", "repeat('a',1001)", "E'\t\t\t\t\t\t\t\t\t\t'"]:
            sql(f"select public.save_booking_review('{bid(1)}',4,{comment});", driver, error='INVALID_REVIEW')
        sql(f"select public.save_booking_review('{bid(1)}',5,'Updated parking review.');", driver)
        assert sql('select count(*) from public.booking_reviews;', driver) == '1'
        assert sql('select count(*) from public.booking_reviews;', owner) == '0'
        public_rows = obj("select public.public_space_reviews('test-space');", role='anon')
        assert set(public_rows[0]) == {'rating','comment','created_at','updated_at'}
        assert obj("select public.rating_summaries(array['test-space']);", role='anon')[0]['average_rating'] == 5
        sql(f"select public.delete_booking_review('{bid(1)}');", owner, error='BOOKING_FORBIDDEN')
        sql("update public.parking_spaces set published=false where id='test-space';", owner)
        assert obj("select public.public_space_reviews('test-space');", role='anon') == []
        assert sql('select count(*) from public.booking_reviews;', driver) == '1'
        sql("update public.parking_spaces set published=true where id='test-space';", owner)
        sql(f"select public.delete_booking_review('{bid(1)}');", driver)
        assert obj("select public.rating_summaries(array['test-space']);", role='anon')[0]['review_count'] == 0
        sql('select * from public.booking_reviews;', role='anon', error='permission denied')
        for table in ['booking_reviews','bookings','demo_payment_events']:
            sql(f'delete from public.{table};', driver, error='permission denied')
        print('PASS reviews: ownership, eligibility, rating/text limits, single-row editing, delete, public privacy and archived history')

        for assignment in ['latitude=91','longitude=181','latitude=null',"latitude='NaN'::float8"]:
            sql(f"update public.parking_spaces set {assignment} where id='test-space';", owner, error='parking_coordinates')
        sql("update public.parking_spaces set latitude=0,longitude=0 where id='test-space';", owner)
        assert sql(f"select space_latitude from public.bookings where id='{bid(1)}';", driver) == '12'
        sql("update public.parking_spaces set latitude=null,longitude=null where id='test-space';", owner)
        print('PASS coordinates: pair/range/NaN constraints, owner grants, existing snapshots unaffected by edits')

        # Exercise existing creation/payment retry/cancellation with the new snapshot trigger.
        call = f"select public.create_booking('test-space',now()+interval '10 days',now()+interval '10 days 1 hour','Car','KA20AB1234','{bid(99)}',100);"
        booking = obj(call, driver)
        assert booking['space_locality'] == 'Locality' and booking['total'] == 100 and booking['parking_subtotal'] == 95 and booking['service_fee'] == 5
        new_id = booking['id']
        pay = f"select public.simulate_booking_payment('{new_id}','success','{bid(100)}');"
        first, repeated = obj(pay, driver), obj(pay, driver)
        assert first['event']['id'] == repeated['event']['id']
        assert obj('select public.owner_earnings();', owner)['totals']['pending_owner'] == 295
        cancelled = obj(f"select public.cancel_booking('{new_id}');", driver)
        assert cancelled['payment_status'] == 'demo_refunded'
        assert obj('select public.owner_earnings();', owner)['totals']['pending_owner'] == 200
        print('PASS regression: booking creation, location snapshot, payment retry, cancellation and earnings reconciliation')
        # 008 forbids schedule edits that strand a confirmed booking, so release the
        # remaining future bookings before exercising arbitrary weekly schedules.
        sql("update public.bookings set status='cancelled',cancelled_at=now(),payment_status=case when payment_status='demo_paid' then 'demo_refunded' else payment_status end where parking_space_id='test-space' and status='confirmed' and departure>now();")
        # Weekly hours are enforced by both quote and create, independently of browser timezone.
        monday = "((date_trunc('week', now() at time zone 'Asia/Kolkata') + interval '14 days') at time zone 'Asia/Kolkata')"
        def hours_quote(start, end):
            return f"select public.booking_quote('test-space',{monday}+interval '{start}',{monday}+interval '{end}','Car');"
        daily = dict(mode='daily', days=[dict(open='09:00',close='17:00')]*5+[None,None])
        def set_hours(schedule):
            sql("update public.parking_spaces set opening_schedule='"+json.dumps(schedule)+"'::jsonb where id='test-space';", owner)
        set_hours(daily)
        assert obj(hours_quote('9 hours','10 hours'),role='anon')['total']==100
        assert obj(hours_quote('16 hours','17 hours'),role='anon')['parking_subtotal']==95
        sql(hours_quote('8 hours','10 hours'),role='anon',error='OUTSIDE_OPENING_HOURS')
        sql(hours_quote('16 hours','18 hours'),role='anon',error='OUTSIDE_OPENING_HOURS')
        sql(hours_quote('6 days 9 hours','6 days 10 hours'),role='anon',error='OUTSIDE_OPENING_HOURS')
        sql(f"select public.create_booking('test-space',{monday}+interval '8 hours',{monday}+interval '10 hours','Car','KA20AB1234','{bid(101)}',100);",driver,error='OUTSIDE_OPENING_HOURS')
        custom=dict(mode='custom',days=[dict(open='22:00',close='00:00'),dict(open='00:00',close='02:00')]+[None]*5)
        set_hours(custom)
        assert obj(hours_quote('23 hours','1 day 1 hour'),role='anon')['total']==200
        custom['days'][1]['open']='00:30'
        set_hours(custom)
        sql(hours_quote('23 hours','1 day 1 hour'),role='anon',error='OUTSIDE_OPENING_HOURS')
        invalid_schedules=[dict(mode='daily',days=[None]*7),dict(mode='custom',days=[dict(open='22:00',close='02:00')]+[None]*6),
                           dict(mode='daily',days=[dict(open='09:00',close='17:00'),dict(open='10:00',close='17:00')]+[None]*5)]
        for invalid in invalid_schedules:
            sql("update public.parking_spaces set opening_schedule='"+json.dumps(invalid)+"'::jsonb where id='test-space';",owner,error='valid_weekly_schedule')
        sql("update public.parking_spaces set image_urls=array['https://example.test/one.jpg','https://example.test/two.png'],amenities=array['EV charging','CCTV camera','Custom amenity'] where id='test-space';",owner)
        assert sql("select cardinality(image_urls) from public.parking_spaces where id='test-space';",owner)=='2'
        assert sql(f"select total from public.bookings where id='{bid(1)}';",driver)=='105.00'
        print('PASS weekly schedules: daily/custom, closed days, end boundary, midnight coverage, invalid schedules, quote/create enforcement; multi-photo editing and preserved history')

        # ---- 008: profiles, listing fields, entry instructions, blocks, conflicts, availability reads ----
        newbie = '00000000-0000-0000-0000-000000000004'
        sql(f"""insert into auth.users values ('{newbie}','{{"name":"  New Driver ","phone":"+919876543210"}}');""")
        assert obj(f"select to_jsonb(p) from public.profiles p where id='{newbie}';")['phone'] == '+919876543210'
        sql("insert into auth.users values ('00000000-0000-0000-0000-000000000005','{\"name\":\"Bad\",\"phone\":\"call me\"}');")
        assert sql("select coalesce(phone,'none') from public.profiles where id='00000000-0000-0000-0000-000000000005';") == 'none'
        assert sql('select count(*) from public.profiles;', newbie) == '1'
        assert sql('select full_name from public.profiles;', newbie) == 'New Driver'
        sql("update public.profiles set phone='12ab';", newbie, error='profiles_phone_check')
        sql("update public.profiles set full_name='Renamed',phone='9876543210';", newbie)
        assert sql(f"select count(*) from public.profiles where id='{newbie}';", driver) == '0'
        sql('select * from public.profiles;', role='anon', error='permission denied')
        print('PASS profiles: created from signup metadata, invalid phone tolerated as null, own-row RLS and phone format')

        sql("update public.parking_spaces set landmark='Opposite KMC gate',max_vehicle_length_m=4.8,max_vehicle_height_m=2.1 where id='test-space';", owner)
        for bad in ['max_vehicle_height_m=11', 'max_vehicle_length_m=0', "landmark='   '"]:
            sql(f"update public.parking_spaces set {bad} where id='test-space';", owner, error='check')
        assert obj("select to_jsonb(s) from public.parking_spaces s where id='test-space';", role='anon')['landmark'] == 'Opposite KMC gate'
        print('PASS listing fields: landmark and vehicle size limits with range checks and public read')

        sql("update public.parking_spaces set opening_schedule='"+json.dumps(dict(mode='daily',days=[dict(open='00:00',close='00:00')]*7))+"'::jsonb where id='test-space';", owner)
        t0 = "(date_trunc('hour', now()) + interval '20 days')"
        def at(offset): return f"({t0}+interval '{offset}')"
        booked = obj(f"select public.create_booking('test-space',{at('0 hours')},{at('1 hour')},'Car','KA20AB1234','{bid(200)}',100);", driver)['id']
        sql(f"select public.create_space_block('test-space',{at('30 minutes')},{at('2 hours')},'Family visit');", owner, error='BLOCK_CONFLICTS_BOOKING')
        block = obj(f"select public.create_space_block('test-space',{at('2 hours')},{at('4 hours')},'Family visit');", owner)
        sql(f"select public.create_space_block('test-space',{at('3 hours')},{at('5 hours')},null);", owner, error='BLOCK_OVERLAP')
        sql(f"select public.create_space_block('test-space',{at('6 hours')},{at('7 hours')},null);", other, error='SPACE_FORBIDDEN')
        sql(f"select public.create_space_block('test-space',{at('7 hours')},{at('6 hours')},null);", owner, error='INVALID_BLOCK')
        sql(f"insert into public.space_blocks(parking_space_id,starts_at,ends_at) values('test-space',{at('8 hours')},{at('9 hours')});", owner, error='permission denied')
        quote = obj(f"select public.booking_quote('test-space',{at('3 hours')},{at('5 hours')},'Car');", role='anon')
        assert quote['available'] is False and 'reason' not in quote
        assert obj(f"select public.booking_quote('test-space',{at('4 hours')},{at('5 hours')},'Car');", role='anon')['available'] is True
        sql(f"select public.create_booking('test-space',{at('3 hours')},{at('5 hours')},'Car','KA20AB1234','{bid(201)}',100);", driver, error='SPACE_BLOCKED')
        busy = obj(f"select public.space_busy_intervals('test-space',{at('-1 hour')},{at('6 hours')});", role='anon')
        assert [b['kind'] for b in busy] == ['booked','blocked'] and all(set(b) == {'start','end','kind'} for b in busy), busy
        sql(f"select public.space_busy_intervals('test-space',{at('0 hours')},{at('40 days')});", role='anon', error='INVALID_RANGE')
        free = obj(f"select public.available_space_ids({at('10 hours')},{at('11 hours')});", role='anon')
        assert 'test-space' in free and 'other-space' in free, free
        assert 'test-space' not in obj(f"select public.available_space_ids({at('2 hours')},{at('3 hours')});", role='anon')
        assert 'test-space' not in obj(f"select public.available_space_ids({at('0 hours')},{at('1 hour')});", role='anon')
        assert 'other-space' in obj(f"select public.available_space_ids({at('0 hours')},{at('1 hour')});", role='anon')
        print('PASS blocks: booking conflicts, overlap, ownership, quote/create enforcement, private reasons, busy reads and availability search')

        narrow = dict(mode='daily', days=[dict(open='09:00',close='09:30')]*7)
        sql("update public.parking_spaces set opening_schedule='"+json.dumps(narrow)+"'::jsonb where id='test-space';", owner, error='SCHEDULE_CONFLICTS_BOOKING')
        sql("update public.parking_spaces set title='Renamed test space' where id='test-space';", owner)
        print('PASS schedule guard: hours that strand a confirmed booking are rejected; other edits still allowed')

        sql("select public.set_space_entry_instructions('test-space','  Gate code 4512. Bay 3.  ');", owner)
        sql("select public.set_space_entry_instructions('test-space','x');", other, error='SPACE_FORBIDDEN')
        assert obj(f"select public.booking_entry_instructions(array['{booked}']::uuid[]);", driver) == [dict(booking_id=booked, instructions='Gate code 4512. Bay 3.')]
        assert obj(f"select public.booking_entry_instructions(array['{booked}']::uuid[]);", owner)[0]['instructions'] == 'Gate code 4512. Bay 3.'
        assert obj(f"select public.booking_entry_instructions(array['{booked}']::uuid[]);", other) == []
        assert sql('select count(*) from public.space_entry_instructions;', driver) == '0'
        assert sql('select count(*) from public.space_entry_instructions;', owner) == '1'
        sql(f"select public.booking_entry_instructions(array['{booked}']::uuid[]);", role='anon', error='permission denied')
        assert 'Gate code' not in sql("select to_jsonb(s)::text from public.parking_spaces s where id='test-space';", role='anon')
        sql(f"select public.cancel_booking('{booked}');", driver)
        assert obj(f"select public.booking_entry_instructions(array['{booked}']::uuid[]);", driver) == []
        sql("select public.set_space_entry_instructions('test-space','   ');", owner)
        assert sql('select count(*) from public.space_entry_instructions;', owner) == '0'
        print('PASS entry instructions: owner-only writes, released only to the confirmed driver/owner, hidden after cancellation')

        sql(f"select public.delete_space_block('{block['id']}');", other, error='SPACE_FORBIDDEN')
        sql(f"select public.delete_space_block('{block['id']}');", owner)
        assert obj(f"select public.booking_quote('test-space',{at('3 hours')},{at('5 hours')},'Car');", role='anon')['available'] is True
        sql("update public.parking_spaces set opening_schedule='"+json.dumps(narrow)+"'::jsonb where id='test-space';", owner)
        print('PASS release: deleted blocks and cancelled bookings free the space and the schedule again')
        print('All eight migrations and local database checks passed. Hosted Supabase integration remains manual.')
    finally:
        if started:
            run('pg_ctl', '-D', data, '-m', 'immediate', '-w', 'stop')
