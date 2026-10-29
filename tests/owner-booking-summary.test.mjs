import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeOwnerBookings } from '../js/owner-booking-summary.js';

test('owner summaries choose latest ended and earliest future bookings per space, ignoring cancellation', () => {
  const now = Date.parse('2030-01-01T06:00:00Z');
  const booking = (id, start, end, space = 'a', status = 'confirmed') => ({
    id, parking_space_id: space, status,
    arrival: new Date(now + start * 60000).toISOString(), departure: new Date(now + end * 60000).toISOString()
  });
  const rows = [booking('later',120,180), booking('old',-120,-90), booking('cancelled',10,40,'a','cancelled'),
    booking('last',-60,0), booking('next',30,60), booking('active',0,30), booking('other',-90,-30,'b')];
  const result = summarizeOwnerBookings(rows, now);
  assert.equal(result.get('a').last.id, 'last');
  assert.equal(result.get('a').next.id, 'next');
  assert.equal(result.get('a').current.id, 'active');
  assert.equal(result.get('b').last.id, 'other');
  assert.equal(result.get('b').next, null);
  assert.equal(summarizeOwnerBookings([], now).size, 0);
  const after = summarizeOwnerBookings(rows, now + 30 * 60000);
  assert.equal(after.get('a').last.id, 'active');
  assert.equal(after.get('a').current.id, 'next');
  assert.equal(after.get('a').next.id, 'later');
});
