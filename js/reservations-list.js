import { protectPage } from './protected-page.js';
import { loadMyBookings, loadOwnerReservations, cancelBooking } from './management-data.js';
import { entryInstructions } from './booking-data.js';
import { bookingCategory, canCancel, canPay } from './booking-state.js';
import { bookingDetails, entryInstructionsView } from './booking-view.js';
import { element, confirmDialog } from './ui.js';
import { eligibleReview } from './reviews.js';

const root = document.querySelector('#reservations-section');
const owner = root.dataset.audience === 'owner';
const scoped = root.dataset.spaceScoped === 'true';
const spaceId = new URLSearchParams(location.search).get('id');
const status = root.querySelector('[data-status]');
const list = root.querySelector('[data-list]');
const filter = root.querySelector('[data-category]');
const listingFilter = root.querySelector('[data-listing]');
const refresh = root.querySelector('[data-refresh]');
const controls = root.querySelector('[data-controls]');
let bookings = [], busy = false;
// Drivers: private entry instructions for confirmed, not-yet-ended bookings (one batched request).
let instructions = new Map(), instructionsFailed = false;
function draw() {
  const category = filter.value;
  const selected = listingFilter?.value || '';
  const forListing = bookings.filter(b => !selected || b.parking_space_id === selected);
  for (const option of filter.options) {
    const count = forListing.filter(b => option.value === 'all' || (option.value === 'current-upcoming'
      ? ['active', 'upcoming'].includes(bookingCategory(b)) : bookingCategory(b) === option.value)).length;
    option.textContent = `${option.dataset.label} (${count})`;
  }
  const visible = forListing.filter(b => category === 'all' || (category === 'current-upcoming'
    ? ['active', 'upcoming'].includes(bookingCategory(b)) : bookingCategory(b) === category));
  list.replaceChildren();
  if (!visible.length) list.append(element('p', 'status', 'No reservations match this filter.'));
  for (const booking of visible) {
    const card = element('article', 'reservation-card');
    card.append(element('h3', '', booking.space_title), element('span', 'status-badge', bookingCategory(booking)), bookingDetails(booking));
    if (!owner && booking.status === 'confirmed' && Date.parse(booking.departure) > Date.now())
      card.append(entryInstructionsView(booking, instructions.get(booking.id) ?? '', instructionsFailed));
    const actions = element('div', 'owner-actions');
    const details = element('a', 'button secondary', 'View booking details');
    details.href = `confirmation.html?${new URLSearchParams({ booking: booking.id })}`;
    actions.append(details);
    if (!owner && eligibleReview(booking)) {
      const review = element('a', 'button secondary', 'Review / edit review');
      review.href = `review.html?${new URLSearchParams({ booking: booking.id })}`;
      actions.append(review);
    }
    if (!owner && canPay(booking)) {
      const pay = element('a', 'button', booking.payment_status === 'demo_failed' ? 'Retry payment' : 'Complete payment');
      pay.href = `checkout.html?${new URLSearchParams({ booking: booking.id })}`;
      actions.append(pay);
    }
    if (!owner && canCancel(booking)) {
      const cancel = element('button', 'secondary', 'Cancel reservation');
      cancel.type = 'button'; cancel.disabled = busy;
      cancel.addEventListener('click', async () => {
        // The modal dialog provides keyboard access and focus management.
        if (busy || !await confirmDialog(`Cancel reservation ${booking.id}? The spot will be released. Any paid amount is marked refunded; no real refund occurs.`, 'Cancel reservation', 'Keep reservation')) return;
        setBusy(true);
        status.textContent = 'Cancelling reservation…';
        try {
          await cancelBooking(booking.id);
          await load('Reservation cancelled. The slot is released. Any refund is simulated; no real money moves.');
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
    if (scoped) bookings = bookings.filter(booking => booking.parking_space_id === spaceId);
    if (!owner) {
      const live = bookings.filter(b => b.status === 'confirmed' && Date.parse(b.departure) > Date.now()).map(b => b.id);
      try { instructions = await entryInstructions(live); instructionsFailed = false; }
      catch { instructions = new Map(); instructionsFailed = true; } // Never hide bookings because of this.
    }
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
  const current = await protectPage(scoped ? `owner-space.html?${new URLSearchParams({ id: spaceId || '' })}` : owner ? 'dashboard.html' : 'my-bookings.html', status, list);
  if (current) {
    controls.hidden = false;
    await load();
    // Update categories at time boundaries without a background database job.
    setInterval(() => { if (!busy) draw(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !busy) draw(); });
  }
} catch (error) { status.textContent = `${error.message} Reload this page to retry.`; }
