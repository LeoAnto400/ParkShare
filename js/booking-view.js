import { element } from './ui.js';
import { indianDisplay, money } from './booking-rules.js';
import { paymentLabels } from './booking-state.js';
import { locationActions } from './location.js';

export function bookingDetails(booking) {
  const details = element('dl', 'reservation-details');
  const values = [
    ['Reference', booking.id], ['Space', booking.space_title], ['Address', booking.space_address],
    ['Arrival', indianDisplay(booking.arrival)], ['Departure', indianDisplay(booking.departure)],
    ['Vehicle', `${booking.vehicle_type} · ${booking.vehicle_registration}`],
    ['Hourly rate', money(booking.hourly_rate)], ['Owner parking amount', money(booking.parking_subtotal)],
    [booking.pricing_model === 'inclusive_v1' ? 'Included platform fee (5% of total)' : 'Service fee (5% added under original pricing)', money(booking.service_fee)], ['Total', money(booking.total)],
    ['Reservation', booking.status], ['Demo payment', paymentLabels[booking.payment_status] || 'Unavailable — run migration 005']
  ];
  for (const [label, value] of values) details.append(element('dt', '', label), element('dd', '', value));
  const section = element('div');
  section.append(details, locationActions({ address: booking.space_address, locality: booking.space_locality,
    city: booking.space_city, latitude: booking.space_latitude, longitude: booking.space_longitude }));
  return section;
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
