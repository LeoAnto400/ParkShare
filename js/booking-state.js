// Categories are derived from timestamps, not a job that rewrites reservation status.
export function bookingCategory(booking, now = Date.now()) {
  if (booking.status === 'cancelled') return 'cancelled';
  if (booking.status !== 'confirmed') return 'unknown';
  if (Date.parse(booking.departure) <= now) return 'past';
  if (Date.parse(booking.arrival) <= now) return 'active';
  return 'upcoming';
}
export const canCancel = (booking, now = Date.now()) => bookingCategory(booking, now) === 'upcoming';
export const canPay = (booking, now = Date.now()) => booking.status === 'confirmed'
  && Date.parse(booking.departure) > now && ['unpaid', 'demo_failed'].includes(booking.payment_status);
export const paymentLabels = {
  unpaid: 'Unpaid', demo_failed: 'Payment failed',
  demo_paid: 'Paid — simulated; no real money collected', demo_refunded: 'Refunded — no real refund'
};
