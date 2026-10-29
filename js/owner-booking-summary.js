import { element } from './ui.js';
import { indianDisplay } from './booking-rules.js';

// Group once for all listing cards. Cancelled reservations are not parking visits.
export function summarizeOwnerBookings(bookings, now = Date.now()) {
  const summaries = new Map();
  for (const booking of bookings) {
    if (booking.status !== 'confirmed') continue;
    const arrival = Date.parse(booking.arrival), departure = Date.parse(booking.departure);
    if (!Number.isFinite(arrival) || !Number.isFinite(departure) || departure <= arrival) continue;
    const summary = summaries.get(booking.parking_space_id) || { last: null, next: null, current: null };
    if (departure <= now) {
      if (!summary.last || departure > Date.parse(summary.last.departure)) summary.last = booking;
    } else if (arrival > now) {
      if (!summary.next || arrival < Date.parse(summary.next.arrival)) summary.next = booking;
    } else {
      summary.current = booking;
    }
    summaries.set(booking.parking_space_id, summary);
  }
  return summaries;
}

export function renderBookingSummary(root, summary, error = false) {
  const signature = JSON.stringify([error, summary?.last, summary?.current, summary?.next]);
  // Keep links/focus in place when a timer tick has not changed any displayed booking.
  if (root.dataset.summarySignature === signature) return;
  root.dataset.summarySignature = signature;
  root.replaceChildren(element('h3', '', 'Booking overview'));
  if (error) {
    root.append(element('p', 'muted', 'Booking information could not be loaded. Use Refresh listings to retry.'));
    return;
  }
  const entries = [['Last booking', summary?.last, 'No past bookings yet.']];
  if (summary?.current) entries.push(['Currently parked', summary.current, '']);
  entries.push(['Next booking', summary?.next, 'No upcoming bookings.']);
  for (const [label, booking, empty] of entries) {
    const item = element('div', 'booking-overview-item');
    item.append(element('h4', '', label));
    if (booking) {
      item.append(element('p', '', `Arrival: ${indianDisplay(booking.arrival)}`),
        element('p', '', `Departure: ${indianDisplay(booking.departure)}`));
      const link = element('a', 'text-link', 'View booking details');
      link.href = `confirmation.html?${new URLSearchParams({ booking: booking.id })}`;
      link.setAttribute('aria-label', `View ${label.toLowerCase()} details`);
      item.append(link);
    } else item.append(element('p', 'muted', empty));
    root.append(item);
  }
  root.append(element('p', 'muted', 'Times in Asia/Kolkata. Cancelled bookings excluded.'));
}
