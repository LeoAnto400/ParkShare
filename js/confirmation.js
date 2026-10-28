import { protectPage } from './protected-page.js';
import { getBooking } from './booking-data.js';
import { paymentHistory } from './management-data.js';
import { bookingDetails, historyView } from './booking-view.js';
import { canPay } from './booking-state.js';
import { element } from './ui.js';

const status = document.querySelector('#confirmation-status');
const content = document.querySelector('#confirmation');
const retry = document.querySelector('#confirmation-retry');
const id = new URLSearchParams(window.location.search).get('booking');
let current;
async function load() {
  retry.hidden = true;
  content.replaceChildren();
  status.textContent = 'Loading your reservation…';
  try {
    const booking = await getBooking(id);
    status.textContent = booking.status === 'confirmed'
      ? 'Reservation confirmed. No real payment has been collected.'
      : 'Reservation cancelled. No real money has been collected or refunded.';
    content.append(bookingDetails(booking), element('p', 'demo-disclaimer', 'Demo payment — no real money is collected.'));
    const links = element('div', 'owner-actions');
    if (booking.driver_id === current.user.id) {
      const my = element('a', 'button secondary', 'My bookings'); my.href = 'my-bookings.html'; links.append(my);
      if (canPay(booking) || ['demo_paid', 'demo_refunded'].includes(booking.payment_status)) {
        const checkout = element('a', 'button', canPay(booking) ? 'Complete / retry demo payment' : 'View simulated receipt');
        checkout.href = `checkout.html?${new URLSearchParams({ booking: id })}`; links.append(checkout);
      }
    } else {
      const owner = element('a', 'button secondary', 'Back to owner reservations'); owner.href = 'dashboard.html#reservations-section'; links.append(owner);
    }
    content.append(links);
    try { content.append(historyView(await paymentHistory(id))); }
    catch { content.append(element('p', '', 'Payment history could not be loaded. Retry to refresh.')); retry.hidden = false; }
  } catch (error) { status.textContent = error.message; retry.hidden = false; }
}
retry.addEventListener('click', load);
try {
  current = await protectPage(`confirmation.html?${new URLSearchParams({ booking: id || '' })}`, status, content);
  if (current) await load();
} catch (error) { status.textContent = `${error.message} Reload to retry.`; }
