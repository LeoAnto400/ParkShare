import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSchedule, validateSchedule } from '../js/schedule.js';
import { previewPrice } from '../js/booking-rules.js';

test('daily/custom schedules validate days, hours, midnight and closed days', () => {
  assert.doesNotThrow(() => validateSchedule(defaultSchedule()));
  const schedule = { mode: 'custom', days: [{open:'22:00',close:'00:00'}, {open:'00:00',close:'02:00'}, null,null,null,null,null] };
  assert.doesNotThrow(() => validateSchedule(schedule));
  assert.throws(() => validateSchedule({...schedule, mode:'daily'}));
  for (const days of [[], Array(7).fill(null), [{open:'22:00',close:'02:00'},...Array(6).fill(null)],
    [{open:'25:00',close:'00:00'},...Array(6).fill(null)], [{open:'09:00',close:'09:00'},...Array(6).fill(null)]])
    assert.throws(() => validateSchedule({mode:'custom',days}));
});
test('inclusive pricing conserves driver total after rounding', () => {
  assert.deepEqual(previewPrice(100,60), {hourly_rate:100,duration_minutes:60,parking_subtotal:95,service_fee_rate:.05,service_fee:5,total:100});
  for (const [rate,minutes] of [[40,90],[0.01,30],[19.99,47],[0,60],[999999.99,10080]]) {
    const price = previewPrice(rate,minutes);
    assert.equal(Math.round((price.parking_subtotal+price.service_fee)*100),Math.round(price.total*100));
    assert.equal(Math.round(price.service_fee*100),Math.round(Math.round(price.total*100)*.05));
  }
});
