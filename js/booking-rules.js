// datetime-local has no timezone. Append India's explicit offset, never browser-local time.
export function indianTimeToUTC(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Enter both dates and times in Asia/Kolkata time.');
  const date = new Date(`${value}:00+05:30`);
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + 330 * 60000).toISOString().slice(0,16) !== value) throw new Error('Enter a valid calendar date and time.');
  return date.toISOString();
}
export function validateInterval(arrival, departure, now = Date.now()) {
  const start = Date.parse(arrival), end = Date.parse(departure);
  const minutes = (end - start) / 60000;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= now) throw new Error('Arrival must be in the future.');
  if (minutes < 30 || minutes > 10080) throw new Error('Choose a duration from 30 minutes to 7 days, with departure after arrival.');
  return minutes;
}
export function registrationNumber(value) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9 -]{3,18}[A-Z0-9]$/.test(normalized)) throw new Error('Enter a registration of 5–20 letters, numbers, spaces or hyphens (for example KA20AB1234).');
  return normalized;
}
export function previewPrice(rate, minutes) {
  // Integer paise avoids common binary floating-point rounding errors in the preview.
  const totalPaise = Math.round(Math.round(rate * 100) * minutes / 60);
  const feePaise = Math.round(totalPaise * 5 / 100);
  const subtotalPaise = totalPaise - feePaise;
  return { hourly_rate: rate, duration_minutes: minutes, parking_subtotal: subtotalPaise / 100,
    service_fee_rate: 0.05, service_fee: feePaise / 100, total: totalPaise / 100 };
}
export const money = value => `₹${Number(value).toFixed(2)}`;
export const indianDisplay = value => new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short'
}).format(new Date(value)) + ' IST (Asia/Kolkata)';

// Only these local pages can be a post-login destination; never redirect to an external URL.
export function authDestination(search) {
  const value = new URLSearchParams(search).get('returnTo');
  if (!value) return 'dashboard.html';
  if (['my-bookings.html', 'dashboard.html'].includes(value)) return value;
  const match = value.match(/^(space|confirmation|checkout|review)\.html\?([^#]+)$/);
  if (!match) return 'dashboard.html';
  const params = new URLSearchParams(match[2]);
  const id = params.get(match[1] === 'space' ? 'id' : 'booking');
  return id && /^[a-z0-9-]+$/.test(id) ? value : 'dashboard.html';
}
