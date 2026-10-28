import { protectPage } from './protected-page.js';
import { getBooking } from './booking-data.js';
import { paymentHistory, simulatePayment } from './management-data.js';
import { canPay } from './booking-state.js';
import { bookingDetails, historyView } from './booking-view.js';
import { element } from './ui.js';
import { money } from './booking-rules.js';

const id = new URLSearchParams(window.location.search).get('booking');
const status = document.querySelector('#checkout-status');
const content = document.querySelector('#checkout-content');
const actions = document.querySelector('#checkout-actions');
const success = document.querySelector('#simulate-success');
const failure = document.querySelector('#simulate-failure');
const retry = document.querySelector('#payment-retry');
const refresh = document.querySelector('#checkout-refresh');
const history = document.querySelector('#checkout-history');
let current, booking, pending = null, busy = false, storageKey;

function draw() {
  content.replaceChildren(bookingDetails(booking));
  const description = {
    unpaid: 'This reservation is confirmed and unpaid. The spot stays reserved until you cancel it.',
    demo_failed: 'The simulated payment failed. Your reservation is still confirmed and the spot stays reserved until you cancel. Retry when ready.',
    demo_paid: 'Demo payment successful. This is a simulated receipt, not a verified real payment.',
    demo_refunded: 'Demo refund recorded. The reservation is cancelled. No real refund occurs.'
  };
  const note = element('p', 'status', description[booking.payment_status] || 'Payment state unavailable. Run migration 005.');
  if (booking.status === 'cancelled' && booking.payment_status !== 'demo_refunded') note.textContent = 'Reservation cancelled. Earlier unpaid/failed payment history is preserved. No demo payment can be made.';
  content.append(note);
  if (booking.payment_status === 'demo_paid') content.append(element('p', '', `Simulated receipt total: ${money(booking.total)}. No real money was collected.`));
  actions.hidden = booking.driver_id !== current.user.id;
  success.disabled = busy || !!pending || !canPay(booking);
  failure.disabled = busy || !!pending || !canPay(booking);
  retry.hidden = !pending;
  retry.disabled = busy;
  refresh.disabled = busy;
  if (!canPay(booking) && !['demo_paid','demo_refunded'].includes(booking.payment_status)) {
    content.append(element('p', 'muted', 'Demo payment is available only for confirmed reservations that have not ended.'));
  }
}
async function load() {
  busy = true; refresh.disabled = true;
  success.disabled = true; failure.disabled = true; retry.disabled = true;
  status.textContent = 'Loading stored reservation and demo payment history…';
  try {
    booking = await getBooking(id);
    if (booking.driver_id !== current.user.id) throw new Error('Only the booking’s driver can use checkout. Owners can view reservation details from their dashboard.');
    history.replaceChildren(historyView(await paymentHistory(id)));
    status.textContent = pending ? 'A previous simulation may have completed. Use Retry previous simulation to recover that exact request.' : 'Choose an explicit simulation below. No payment details are requested.';
  } catch (error) {
    booking = null; actions.hidden = true; content.replaceChildren(); history.replaceChildren();
    status.textContent = `${error.message} Use Refresh to retry.`;
  } finally { busy = false; refresh.disabled = false; if (booking) draw(); }
}
async function send() {
  if (busy || !pending) return;
  busy = true; draw(); status.textContent = 'Recording simulated payment…';
  try {
    const result = await simulatePayment(id, pending.outcome, pending.key);
    if (!result?.booking || result.booking.id !== id || result.booking.driver_id !== current.user.id) throw new Error('Unexpected payment response. Retry the same simulation to recover its result.');
    booking = result.booking;
    sessionStorage.removeItem(storageKey); pending = null;
    status.textContent = booking.payment_status === 'demo_paid'
      ? result.event?.outcome === 'demo_paid'
        ? `Demo payment successful. Receipt ${result.event.id}. No real money is collected.`
        : 'This reservation now has a successful demo payment. See payment history for its receipt. No real money is collected.'
      : booking.payment_status === 'demo_refunded'
        ? 'This reservation has been cancelled and demo-refunded. No real refund occurs.'
        : booking.status === 'cancelled' ? 'This reservation is cancelled. Its simulation history is preserved.'
          : 'Simulated payment failed. The reservation remains confirmed and the slot stays reserved. You can retry or cancel before arrival.';
    try { history.replaceChildren(historyView(await paymentHistory(id))); }
    catch { history.replaceChildren(element('p', '', 'Result recorded, but history could not be refreshed. Use Refresh.')); }
  } catch (error) {
    // Keep the exact key/outcome on network failures, including across page reloads.
    if (['BOOKING_FORBIDDEN','PAYMENT_NOT_ALLOWED','INVALID_PAYMENT_REQUEST'].includes(error.code)) {
      sessionStorage.removeItem(storageKey); pending = null;
    }
    status.textContent = `${error.message} ${pending ? 'Use Retry previous simulation; do not choose a new outcome until this attempt is resolved.' : 'Refresh for the current reservation status.'}`;
  } finally { busy = false; if (booking) draw(); }
}
function start(outcome) {
  if (busy || pending || !booking || !canPay(booking)) return;
  pending = { key: crypto.randomUUID(), outcome };
  try { sessionStorage.setItem(storageKey, JSON.stringify(pending)); }
  catch { pending = null; status.textContent = 'Enable session storage for safe simulation retries. No request was sent.'; return; }
  send();
}
success.addEventListener('click', () => start('success'));
failure.addEventListener('click', () => start('failure'));
retry.addEventListener('click', send);
refresh.addEventListener('click', () => { if (!busy) load(); });
try {
  current = await protectPage(`checkout.html?${new URLSearchParams({ booking: id || '' })}`, status, document.querySelector('#checkout-private'));
  if (current) {
    storageKey = `parkshare-demo-payment:${current.user.id}:${id}`;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (saved && /^[a-f0-9-]{36}$/.test(saved.key) && ['success','failure'].includes(saved.outcome)) pending = saved;
    } catch { /* Storage errors are explained when attempting a new simulation. */ }
    refresh.hidden = false;
    await load();
  }
} catch (error) { status.textContent = `${error.message} Reload to retry.`; }
