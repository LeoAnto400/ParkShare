import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indianTimeToUTC, validateInterval, registrationNumber, previewPrice, authDestination, indianDisplay } from '../js/booking-rules.js';

test('Indian wall time converts independently of browser timezone, including midnight', () => {
  const old = process.env.TZ;
  try {
    for (const tz of ['UTC','America/New_York','Asia/Tokyo']) {
      process.env.TZ = tz;
      assert.equal(indianTimeToUTC('2030-01-01T00:15'), '2029-12-31T18:45:00.000Z');
      assert.equal(indianTimeToUTC('2030-01-01T23:30'), '2030-01-01T18:00:00.000Z');
    }
  } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
  assert.throws(() => indianTimeToUTC('2030-02-30T12:00'));
  assert.throws(() => indianTimeToUTC('bad'));
  assert.match(indianDisplay('2029-12-31T18:45:00Z'), /Asia\/Kolkata/);
});
test('duration limits and pricing preview', () => {
  const now = Date.parse('2029-01-01T00:00:00Z');
  const start = indianTimeToUTC('2030-01-01T23:30');
  const end = indianTimeToUTC('2030-01-02T01:00');
  assert.equal(validateInterval(start,end,now),90);
  assert.deepEqual(previewPrice(40,90), { hourly_rate:40,duration_minutes:90,parking_subtotal:60,service_fee_rate:0.05,service_fee:3,total:63 });
  for (const minutes of [-1,0,29,10081]) assert.throws(() => validateInterval(start,new Date(Date.parse(start)+minutes*60000).toISOString(),now));
  for (const minutes of [30,10080]) assert.equal(validateInterval(start,new Date(Date.parse(start)+minutes*60000).toISOString(),now),minutes);
  assert.throws(() => validateInterval(start,end,Date.parse(start)));
  assert.throws(() => validateInterval('bad',end,now));
  assert.equal(registrationNumber(' ka20 ab1234 '),'KA20 AB1234');
  assert.throws(() => registrationNumber('<script>'));
  assert.throws(() => registrationNumber(''));
});
test('login return destinations stay local and retain selections', () => {
  const path = 'space.html?id=pn-001&arrival=2030-01-01T12%3A00&departure=2030-01-01T13%3A00';
  assert.equal(authDestination(`?${new URLSearchParams({returnTo:path})}`),path);
  for (const value of ['https://evil.example','//evil.example','javascript:alert(1)','space.html?id=../bad','other.html?id=a']) {
    assert.equal(authDestination(`?${new URLSearchParams({returnTo:value})}`),'dashboard.html');
  }
});
test('booking AJAX sends only requested RPC fields, keeps retries identical, and maps conflicts', async () => {
  const source = (await readFile(new URL('../js/booking-data.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
  const prefix = `const SUPABASE_PUBLISHABLE_KEY='sb_publishable_fake'; const isDemo=false;
    const configuration=()=>new URL('https://newprojecttest.supabase.co');
    const requireSession=async()=>({access_token:'test-token'});`;
  const api = await import('data:text/javascript;base64,'+Buffer.from(prefix+source).toString('base64'));
  const original = globalThis.fetch;
  const calls=[];
  let result = {...previewPrice(40,90),available:true};
  globalThis.fetch=async(url,options)=>{calls.push({url:new URL(url),options});return {ok:true,json:async()=>result};};
  const inputs={p_space_id:'pn-006',p_arrival:'2030-01-01T04:30:00Z',p_departure:'2030-01-01T06:00:00Z',p_vehicle_type:'Car'};
  try {
    assert.equal((await api.getQuote(inputs)).total,63);
    assert.equal(calls[0].url.pathname,'/rest/v1/rpc/booking_quote');
    assert.equal(calls[0].options.headers.Authorization,undefined);
    result={id:'test-booking',arrival:inputs.p_arrival,departure:inputs.p_departure};
    const attempt={...inputs,p_registration:'KA20AB1234',p_expected_hourly_rate:40,p_idempotency_key:'test-key'};
    await api.reserve(attempt); await api.reserve(attempt);
    assert.equal(calls[1].options.body,calls[2].options.body);
    assert.equal(calls[1].options.headers.Authorization,'Bearer test-token');
    assert.equal(JSON.parse(calls[1].options.body).driver_id,undefined);
    globalThis.fetch=async()=>({ok:false,status:400,json:async()=>({message:'SLOT_TAKEN'})});
    await assert.rejects(api.reserve(attempt),error=>error.code==='SLOT_TAKEN');
    globalThis.fetch=async()=>({ok:false,status:400,json:async()=>({message:'PRICE_CHANGED'})});
    await assert.rejects(api.reserve(attempt),error=>error.code==='PRICE_CHANGED');
    globalThis.fetch=async()=>{throw new Error('offline');};
    await assert.rejects(api.reserve(attempt),/Retry this reservation/);
  } finally {globalThis.fetch=original;}
});
