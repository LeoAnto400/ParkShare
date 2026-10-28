import { request } from './booking-data.js';
import { requireSession } from './auth.js';

function rows(value) {
  if (!Array.isArray(value)) throw new Error('Unexpected list response. Reload to retry.');
  return value;
}
export async function loadMyBookings() {
  const current = await requireSession();
  const result = [];
  // Fetch every page rather than showing counts from a truncated first response.
  for (let offset = 0; ; offset += 100) {
    const params = new URLSearchParams({ select: '*', driver_id: `eq.${current.user.id}`,
      order: 'created_at.desc,id.asc', limit: '100', offset: String(offset) });
    const page = rows(await request(`bookings?${params}`, null, true));
    if (page.some(row => row.driver_id !== current.user.id)) throw new Error('Unexpected booking ownership in response.');
    result.push(...page);
    if (page.length < 100) return result;
  }
}
export async function loadOwnerReservations() {
  const result = [];
  for (let offset = 0; ; offset += 100) {
    const page = rows(await request('rpc/owner_reservations', { p_offset: offset }, true));
    result.push(...page);
    if (page.length < 100) return result;
  }
}
export async function paymentHistory(id) {
  const result = [];
  for (let offset = 0; ; offset += 100) {
    const params = new URLSearchParams({ booking_id: `eq.${id}`,
      select: 'id,requested_outcome,outcome,amount,is_simulation,created_at',
      order: 'created_at.asc,id.asc', limit: '100', offset: String(offset) });
    const page = rows(await request(`demo_payment_events?${params}`, null, true));
    result.push(...page);
    if (page.length < 100) return result;
  }
}
export const simulatePayment = (bookingId, outcome, key) => request('rpc/simulate_booking_payment', {
  p_booking_id: bookingId, p_outcome: outcome, p_request_key: key
}, true);
export const cancelBooking = id => request('rpc/cancel_booking', { p_booking_id: id }, true);
