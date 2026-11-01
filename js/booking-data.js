import { SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { configuration } from './data.js';
import { isDemo, requireSession } from './auth.js';

const messages = {
  OUTSIDE_OPENING_HOURS: 'Choose times entirely within the space’s opening hours (Asia/Kolkata).',
  REVIEW_INELIGIBLE: 'Only a completed, confirmed reservation can be reviewed.',
  INVALID_REVIEW: 'Choose an integer rating from 1 to 5 and write 10–1000 characters after trimming.',
  INVALID_EARNINGS_FILTER: 'Check the arrival date range; the start must not be after the end.',
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
  CANCELLATION_NOT_ALLOWED: 'Only confirmed reservations that have not started can be cancelled.',
  SPACE_BLOCKED: 'The owner has blocked part of those times. Please choose different times.',
  BLOCK_CONFLICTS_BOOKING: 'That period overlaps a confirmed booking. Block a different period; existing bookings are never cancelled by a block.',
  BLOCK_OVERLAP: 'That period overlaps one of your existing blocks. Remove or adjust the existing block first.',
  INVALID_BLOCK: 'Choose an end time after the start time, in the future, within one year, and a reason of at most 200 characters.',
  SPACE_FORBIDDEN: 'Space not found or you do not own it.',
  SCHEDULE_CONFLICTS_BOOKING: 'These opening hours would leave a confirmed booking outside the new hours. Keep the booked times open, or ask the driver to cancel first.',
  INVALID_RANGE: 'Availability can be shown for at most 31 days at a time.',
  INVALID_ENTRY_INSTRUCTIONS: 'Entry instructions can be at most 1000 characters.',
  INVALID_REQUEST: 'Too many bookings requested at once. Refresh to retry.'
};
// Exposed so other AJAX helpers (owner REST writes) can show the same friendly text.
export const messageFor = code => messages[code];
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
  if (response.ok && response.status === 204) return null; // Void RPCs (review deletion) have no JSON body.
  let data;
  try { data = await response.json(); } catch { throw new Error('Unexpected response. Retry the same reservation attempt if confirmation was interrupted.'); }
  if (!response.ok) {
    const code = Object.keys(messages).find(key => data?.message === key);
    const error = new Error(messages[code] || `Data request failed (HTTP ${response.status}). Check your session and migrations 004–008; retry the same attempt if its outcome is unknown.`);
    error.code = code || String(response.status);
    throw error;
  }
  return data;
}
export async function getQuote(requestData) {
  const quote = await request('rpc/booking_quote', requestData);
  if (quote?.pricing_model !== 'inclusive_v1') throw new Error('Apply migration 007 in the NEW ParkShare project before booking. Listed prices now include the platform fee.');
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

// Busy time ranges for a published space, as millisecond timestamps. No identities or reasons.
export async function busyIntervals(spaceId, fromISO, toISO) {
  const rows = await request('rpc/space_busy_intervals', { p_space_id: spaceId, p_from: fromISO, p_to: toISO });
  if (!Array.isArray(rows) || rows.some(r => !['booked', 'blocked'].includes(r?.kind))) throw new Error('Invalid availability response.');
  return rows.map(r => ({ start: Date.parse(r.start), end: Date.parse(r.end), kind: r.kind }));
}
// Search filter: IDs of published spaces that can take the whole period.
export async function availableSpaceIds(arrivalISO, departureISO) {
  const ids = await request('rpc/available_space_ids', { p_arrival: arrivalISO, p_departure: departureISO });
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) throw new Error('Invalid availability response.');
  return new Set(ids);
}
// Private entry instructions for the signed-in driver's (or owner's) confirmed bookings, in one request.
export async function entryInstructions(bookingIds) {
  const ids = [...new Set(bookingIds)].slice(0, 100);
  if (!ids.length) return new Map();
  const rows = await request('rpc/booking_entry_instructions', { p_booking_ids: ids }, true);
  if (!Array.isArray(rows)) throw new Error('Invalid entry instructions response.');
  return new Map(rows.map(row => [row.booking_id, row.instructions]));
}
