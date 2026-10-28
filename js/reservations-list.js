import { protectPage } from './protected-page.js';
import { loadMyBookings, loadOwnerReservations, cancelBooking } from './management-data.js';
import { bookingCategory, canCancel, canPay } from './booking-state.js';
import { bookingDetails } from './booking-view.js';
import { element } from './ui.js';

const root = document.querySelector('#reservations-section');
const owner = root.dataset.audience === 'owner';
const status = root.querySelector('[data-status]');
const list = root.querySelector('[data-list]');
const filter = root.querySelector('[data-category]');
const listingFilter = root.querySelector('[data-listing]');
const refresh = root.querySelector('[data-refresh]');
const controls = root.querySelector('[data-controls]');
let bookings = [], busy = false;
function draw() {
  const category = filter.value;
  const selected = listingFilter?.value || '';
  const forListing = bookings.filter(b => !selected || b.parking_space_id === selected);
  for (const option of filter.options) {
    const count = forListing.filter(b => option.value === 'all' || bookingCategory(b) === option.value).length;
    option.textContent = `${option.dataset.label} (${count})`;
  }
  const visible = forListing.filter(b => category === 'all' || bookingCategory(b) === category);
  list.replaceChildren();
  if (!visible.length) list.append(element('p', 'status', 'No reservations match this filter.'));
  for (const booking of visible) {
    const card = element('article', 'reservation-card');
    card.append(element('h3', '', booking.space_title), element('span', 'status-badge', bookingCategory(booking)), bookingDetails(booking));
    const actions = element('div', 'owner-actions');
    const details = element('a', 'button secondary', 'View booking details');
    details.href = `confirmation.html?${new URLSearchParams({ booking: booking.id })}`;
    actions.append(details);
    if (!owner && canPay(booking)) {
      const pay = element('a', 'button', booking.payment_status === 'demo_failed' ? 'Retry demo payment' : 'Complete demo payment');
      pay.href = `checkout.html?${new URLSearchParams({ booking: booking.id })}`;
      actions.append(pay);
    }
    if (!owner && canCancel(booking)) {
      const cancel = element('button', 'secondary', 'Cancel reservation');
      cancel.type = 'button'; cancel.disabled = busy;
      cancel.addEventListener('click', async () => {
        // Browser confirmation provides keyboard access and focus management.
        if (busy || !window.confirm(`Cancel reservation ${booking.id}? The spot will be released. Any demo-paid amount is marked demo-refunded; no real refund occurs.`)) return;
        setBusy(true);
        status.textContent = 'Cancelling reservation…';
        try {
          await cancelBooking(booking.id);
          await load('Reservation cancelled. The slot is released. Any demo refund is simulated; no real money moves.');
        } catch (error) { status.textContent = `${error.message} Refresh to check the current status; retrying cancellation is safe.`; }
        finally { setBusy(false); }
      });
      actions.append(cancel);
    }
    card.append(actions);
    list.append(card);
  }
}
function setBusy(value) {
  busy = value; refresh.disabled = value; filter.disabled = value;
  if (listingFilter) listingFilter.disabled = value;
  list.querySelectorAll('button').forEach(button => { button.disabled = value; });
}
async function load(message = '') {
  setBusy(true); status.textContent = 'Loading reservations…';
  try {
    bookings = await (owner ? loadOwnerReservations() : loadMyBookings());
    if (listingFilter) {
      const previous = listingFilter.value;
      listingFilter.replaceChildren(new Option('All spaces with reservations', ''));
      const spaces = new Map(bookings.map(b => [b.parking_space_id,b.space_title]));
      for (const [id, title] of spaces) listingFilter.append(new Option(title,id));
      if (spaces.has(previous)) listingFilter.value = previous;
    }
    draw();
    status.textContent = message || `${bookings.length} reservations loaded. Times shown in Asia/Kolkata.`;
  } catch (error) { bookings = []; list.replaceChildren(); status.textContent = `${message ? `${message} ` : ''}${error.message} Use Refresh to retry.`; }
  finally { setBusy(false); }
}
filter.addEventListener('change', draw);
listingFilter?.addEventListener('change', draw);
refresh.addEventListener('click', () => { if (!busy) load(); });
try {
  const current = await protectPage(owner ? 'dashboard.html' : 'my-bookings.html', status, list);
  if (current) {
    controls.hidden = false;
    await load();
    // Update categories at time boundaries without a background database job.
    setInterval(() => { if (!busy) draw(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !busy) draw(); });
  }
} catch (error) { status.textContent = `${error.message} Reload this page to retry.`; }
