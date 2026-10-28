import { element } from './ui.js';
import { indianDisplay, money } from './booking-rules.js';
import { paymentLabels } from './booking-state.js';

export function bookingDetails(booking) {
  const details = element('dl', 'reservation-details');
  const values = [
    ['Reference', booking.id], ['Space', booking.space_title], ['Address', booking.space_address],
    ['Arrival', indianDisplay(booking.arrival)], ['Departure', indianDisplay(booking.departure)],
    ['Vehicle', `${booking.vehicle_type} · ${booking.vehicle_registration}`],
    ['Hourly rate', money(booking.hourly_rate)], ['Parking charge', money(booking.parking_subtotal)],
    ['Service fee (5%)', money(booking.service_fee)], ['Total', money(booking.total)],
    ['Reservation', booking.status], ['Demo payment', paymentLabels[booking.payment_status] || 'Unavailable — run migration 005']
  ];
  for (const [label, value] of values) details.append(element('dt', '', label), element('dd', '', value));
  return details;
}
export function historyView(events) {
  const section = element('section', 'payment-history');
  section.append(element('h2', '', 'Demo payment history'));
  if (!events.length) section.append(element('p', '', 'No simulated payment attempts recorded.'));
  const list = element('ul');
  for (const event of events) {
    list.append(element('li', '', `${indianDisplay(event.created_at)} · ${paymentLabels[event.outcome] || event.outcome} · ${money(event.amount)} · Receipt ${event.id}`));
  }
  section.append(list, element('p', 'muted', 'Demo payment — no real money is collected. Refund entries are simulations only.'));
  return section;
}
