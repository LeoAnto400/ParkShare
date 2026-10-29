import test from 'node:test';
import assert from 'node:assert/strict';
import { indiaToday, monthRange } from '../js/earning-periods.js';
import { authDestination } from '../js/booking-rules.js';

test('daily default uses India midnight and month ranges cover full calendar months', () => {
  assert.equal(indiaToday(new Date('2030-01-31T18:29:59Z')), '2030-01-31');
  assert.equal(indiaToday(new Date('2030-01-31T18:30:00Z')), '2030-02-01');
  assert.deepEqual(monthRange('2028-02'), {from:'2028-02-01',to:'2028-02-29'});
  assert.deepEqual(monthRange('2030-02'), {from:'2030-02-01',to:'2030-02-28'});
  assert.deepEqual(monthRange('2030-12'), {from:'2030-12-01',to:'2030-12-31'});
  for (const input of ['2030-13', '2030-00', '', 'invalid']) assert.throws(() => monthRange(input));
});
test('owner detail login return stays on the selected local space', () => {
  assert.equal(authDestination('?returnTo=owner-space.html%3Fid%3Dtest-space'), 'owner-space.html?id=test-space');
  assert.equal(authDestination('?returnTo=https://example.com/owner-space.html?id=test'), 'dashboard.html');
});
