import { SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { configuration } from './data.js';
import { isDemo, requireSession } from './auth.js';

const messages = {
  INVALID_INTERVAL: 'Choose future times for a duration between 30 minutes and 7 days.',
  SPACE_UNAVAILABLE: 'This space is no longer published. Please choose another space.',
  UNSUPPORTED_VEHICLE: 'This space does not support the selected vehicle.',
  INVALID_REGISTRATION: 'Check your vehicle registration number.',
  SELF_BOOKING: 'You cannot reserve your own parking space.',
  PRICE_CHANGED: 'The hourly price changed. Check availability again and review the updated quote before confirming.',
  SLOT_TAKEN: 'Someone reserved this spot first. Please choose different times.',
  LOGIN_REQUIRED: 'Please log in to confirm your reservation.',
  RETRY_KEY_MISMATCH: 'This retry key belongs to a different request. Restore the original request or begin a new attempt.',
  INVALID_RETRY_KEY: 'A reservation retry key is required.',
  BOOKING_FORBIDDEN: 'Booking not found or you are not its driver.',
  PAYMENT_NOT_ALLOWED: 'Demo payment is not allowed for cancelled or ended reservations.',
  INVALID_PAYMENT_REQUEST: 'Choose one of the two demo payment actions.',
  PAYMENT_KEY_MISMATCH: 'This payment retry key belongs to a different request. Retry the original action.',
  CANCELLATION_NOT_ALLOWED: 'Only confirmed reservations that have not started can be cancelled.'
};
export async function request(path, body, authenticated = false) {
  if (isDemo) throw new Error('Persistent reservations require Supabase mode. Demo mode provides price previews only.');
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
  if (authenticated) headers.Authorization = `Bearer ${(await requireSession()).access_token}`;
  let response;
  try {
    response = await fetch(new URL(`/rest/v1/${path}`, configuration()), {
      method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {})
    });
  } catch { throw new Error('Connection interrupted. If confirming, use Retry this reservation to retrieve the same attempt. Do not start a new attempt until its result is known.'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('Unexpected response. Retry the same reservation attempt if confirmation was interrupted.'); }
  if (!response.ok) {
    const code = Object.keys(messages).find(key => data?.message === key);
    const error = new Error(messages[code] || `Reservation request failed (HTTP ${response.status}). Check your session and migrations 004–005; retry the same attempt if its outcome is unknown.`);
    error.code = code || String(response.status);
    throw error;
  }
  return data;
}
export async function getQuote(requestData) {
  const quote = await request('rpc/booking_quote', requestData);
  if (typeof quote?.available !== 'boolean' || !['hourly_rate','duration_minutes','parking_subtotal','service_fee_rate','service_fee','total'].every(key => typeof quote[key] === 'number' && Number.isFinite(quote[key]) && quote[key] >= 0)) throw new Error('Invalid quote returned by the service.');
  return quote;
}
export async function reserve(requestData) {
  const booking = await request('rpc/create_booking', requestData, true);
  if (!booking?.id || !booking.arrival || !booking.departure) throw new Error('Confirmation response was incomplete. Retry this same attempt.');
  return booking;
}
export async function getBooking(id) {
  if (!/^[a-f0-9-]{36}$/.test(id || '')) throw new Error('Invalid booking reference.');
  const rows = await request(`bookings?${new URLSearchParams({ id: `eq.${id}`, select: '*' })}`, null, true);
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Reservation not found or you do not have permission to view it.');
  return rows[0];
}
