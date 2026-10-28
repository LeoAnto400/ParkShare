import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bookingCategory, canCancel, canPay } from '../js/booking-state.js';
import { authDestination } from '../js/booking-rules.js';

const booking = { id: 'test-booking', status: 'confirmed', payment_status: 'unpaid',
  arrival: '2030-01-01T04:30:00Z', departure: '2030-01-01T06:00:00Z' };
test('time categories and permitted driver actions at exact boundaries', () => {
  const before = Date.parse(booking.arrival) - 1, start = Date.parse(booking.arrival), end = Date.parse(booking.departure);
  assert.equal(bookingCategory(booking,before),'upcoming');
  assert.equal(bookingCategory(booking,start),'active');
  assert.equal(bookingCategory(booking,end),'past');
  assert.equal(bookingCategory({...booking,status:'cancelled'},before),'cancelled');
  assert.equal(canCancel(booking,before),true);
  assert.equal(canCancel(booking,start),false);
  assert.equal(canCancel(booking,end),false);
  assert.equal(canPay(booking,start),true);
  assert.equal(canPay(booking,end),false);
  assert.equal(canPay({...booking,payment_status:'demo_failed'},before),true);
  for (const payment_status of ['demo_paid','demo_refunded']) assert.equal(canPay({...booking,payment_status},before),false);
  assert.equal(canPay({...booking,status:'cancelled'},before),false);
});
test('new login destinations stay on local pages', () => {
  for (const target of ['my-bookings.html','dashboard.html','checkout.html?booking=abc-123']) {
    assert.equal(authDestination(`?${new URLSearchParams({returnTo:target})}`),target);
  }
  assert.equal(authDestination('?returnTo=https://example.com/checkout.html'),'dashboard.html');
});
test('management API pages own reads and sends authorized mutations without client money/identity', async () => {
  const source = (await readFile(new URL('../js/management-data.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
  const prefix = `const requireSession=async()=>({user:{id:'driver-a'}}); const request=(...args)=>globalThis.managementRequest(...args);`;
  const api = await import('data:text/javascript;base64,'+Buffer.from(prefix+source).toString('base64'));
  const calls=[];
  globalThis.managementRequest=async(path,body,auth)=>{
    calls.push({path,body,auth});
    if(path.startsWith('bookings?')) {
      const params=new URLSearchParams(path.split('?')[1]);
      assert.equal(params.get('driver_id'),'eq.driver-a');
      return params.get('offset')==='0' ? Array.from({length:100},(_,i)=>({id:String(i),driver_id:'driver-a'})) : [{id:'last',driver_id:'driver-a'}];
    }
    if(path==='rpc/owner_reservations') return body.p_offset===0 ? [{...booking}] : [];
    if(path.startsWith('demo_payment_events?')) return [];
    return {booking:{...booking,payment_status:'demo_paid'}};
  };
  try {
    assert.equal((await api.loadMyBookings()).length,101);
    assert.equal((await api.loadOwnerReservations()).length,1);
    await api.paymentHistory('test-booking');
    await api.simulatePayment('test-booking','failure','same-key');
    await api.simulatePayment('test-booking','failure','same-key');
    const paymentCalls=calls.filter(c=>c.path==='rpc/simulate_booking_payment');
    assert.deepEqual(paymentCalls[0].body,paymentCalls[1].body);
    assert.deepEqual(Object.keys(paymentCalls[0].body).sort(),['p_booking_id','p_outcome','p_request_key']);
    await api.cancelBooking('test-booking');
    assert.deepEqual(calls.at(-1).body,{p_booking_id:'test-booking'});
    assert.ok(calls.every(c=>c.auth===true));
    globalThis.managementRequest=async()=>[{driver_id:'driver-b'}];
    await assert.rejects(api.loadMyBookings(),/ownership/);
  } finally {delete globalThis.managementRequest;}
});
