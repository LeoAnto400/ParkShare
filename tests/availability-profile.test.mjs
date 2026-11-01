import test from 'node:test';
import assert from 'node:assert/strict';
import { fitsSchedule, freeSlots, dayWindow, istDate, istTime } from '../js/availability.js';
import { normalizePhone, validateProfile } from '../js/profile-rules.js';
import { readFile } from 'node:fs/promises';

const ist = value => Date.parse(`${value}+05:30`);
const weekdays = { mode: 'daily', days: [...Array(5).fill({ open: '09:00', close: '17:00' }), null, null] };

test('browser schedule check mirrors the database rules (IST, closed days, midnight, overnight)', () => {
  // 2026-11-02 is a Monday.
  assert.equal(fitsSchedule(weekdays, ist('2026-11-02T09:00'), ist('2026-11-02T10:00')), true);
  assert.equal(fitsSchedule(weekdays, ist('2026-11-02T16:00'), ist('2026-11-02T17:00')), true, 'ends exactly at closing');
  assert.equal(fitsSchedule(weekdays, ist('2026-11-02T08:00'), ist('2026-11-02T10:00')), false);
  assert.equal(fitsSchedule(weekdays, ist('2026-11-02T16:00'), ist('2026-11-02T18:00')), false);
  assert.equal(fitsSchedule(weekdays, ist('2026-11-08T09:00'), ist('2026-11-08T10:00')), false, 'Sunday closed');
  const overnight = { mode: 'custom', days: [{ open: '22:00', close: '00:00' }, { open: '00:00', close: '02:00' }, null, null, null, null, null] };
  assert.equal(fitsSchedule(overnight, ist('2026-11-02T23:00'), ist('2026-11-03T01:00')), true);
  overnight.days[1] = { open: '00:30', close: '02:00' };
  assert.equal(fitsSchedule(overnight, ist('2026-11-02T23:00'), ist('2026-11-03T01:00')), false, 'gap after midnight');
  assert.equal(fitsSchedule(undefined, ist('2026-11-08T03:00'), ist('2026-11-08T04:00')), true, 'missing schedule = 24/7 default');
  assert.equal(dayWindow(weekdays, '2026-11-08'), null);
});

test('free slots subtract booked/blocked ranges and the past, in IST', () => {
  const busy = [{ start: ist('2026-11-02T11:00'), end: ist('2026-11-02T12:00') }, { start: ist('2026-11-02T13:30'), end: ist('2026-11-02T14:00') }];
  const slots = freeSlots(weekdays, busy, '2026-11-02', ist('2026-11-02T09:30'));
  assert.deepEqual(slots.map(s => `${istTime(s.start)}-${istTime(s.end)}`), ['09:30-11:00', '12:00-13:30', '14:00-17:00']);
  assert.deepEqual(freeSlots(weekdays, [], '2026-11-08', 0), []);
  assert.equal(istDate(ist('2026-11-02T23:59')), '2026-11-02');
});

test('phone and profile validation used by signup and the profile page', () => {
  assert.equal(normalizePhone('+91 98765-43210'), '+919876543210');
  assert.equal(normalizePhone('(0820) 252 1234'), '08202521234');
  for (const bad of ['', '12345', 'call me', '+91 98765 43210 99999']) assert.throws(() => normalizePhone(bad), /10–15 digits/);
  assert.deepEqual(validateProfile({ full_name: '  Asha  ', phone: '9876543210' }), { full_name: 'Asha', phone: '9876543210' });
  assert.throws(() => validateProfile({ full_name: '   ', phone: '9876543210' }), /name/);
});

test('owner block validation and new listing fields', async () => {
  const source = (await readFile(new URL('../js/owner-extras.js', import.meta.url), 'utf8')).replace(/^import .*;$/gm, 'const request = async () => null;');
  const extras = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const now = Date.parse('2026-11-01T00:00:00Z');
  assert.deepEqual(extras.validateBlock('2026-11-02T04:30:00.000Z', '2026-11-02T06:30:00.000Z', '  Family  ', now),
    { p_starts_at: '2026-11-02T04:30:00.000Z', p_ends_at: '2026-11-02T06:30:00.000Z', p_reason: 'Family' });
  assert.equal(extras.validateBlock('2026-11-02T04:30:00Z', '2026-11-02T06:30:00Z', '   ', now).p_reason, null);
  assert.throws(() => extras.validateBlock('2026-11-02T06:30:00Z', '2026-11-02T04:30:00Z', '', now), /after the start/);
  assert.throws(() => extras.validateBlock('2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z', '', now), /future/);
  assert.throws(() => extras.validateBlock('2026-11-02T00:00:00Z', '2027-12-02T00:00:00Z', '', now), /one year/);
  assert.throws(() => extras.validateEntryInstructions('x'.repeat(1001)), /1000/);
  assert.equal(extras.validateEntryInstructions('  Gate 4  '), 'Gate 4');

  const ownerSource = (await readFile(new URL('../js/owner-data.js', import.meta.url), 'utf8')).replace(/^import .*;$/gm, '')
    + '\nfunction validateSchedule(){}';
  const owner = await import('data:text/javascript;base64,' + Buffer.from(ownerSource).toString('base64'));
  const row = { title: 'P', description: 'D', locality: 'L', city: 'C', address: 'A', hourly_price: 20,
    supported_vehicles: ['Car'], amenities: [], parking_rules: [] };
  owner.validateListing({ ...row, landmark: 'Near the temple', max_vehicle_length_m: 4.8, max_vehicle_height_m: 2.1 });
  owner.validateListing({ ...row, landmark: null, max_vehicle_length_m: null, max_vehicle_height_m: null });
  for (const patch of [{ landmark: '  ' }, { landmark: 'x'.repeat(121) }, { max_vehicle_length_m: 0 }, { max_vehicle_length_m: 21 },
    { max_vehicle_height_m: 10.5 }, { max_vehicle_height_m: 2.123 }, { max_vehicle_length_m: Number.NaN }]) {
    assert.throws(() => owner.validateListing({ ...row, ...patch }), undefined, JSON.stringify(patch));
  }
});
