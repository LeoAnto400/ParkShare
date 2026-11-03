import { isDemo, session } from './auth.js';
import { getQuote, reserve } from './booking-data.js';
import { simulatePayment } from './management-data.js';
import { indianTimeToUTC, validateInterval, registrationNumber, previewPrice, money, indianDisplay } from './booking-rules.js';
import { element } from './ui.js';

export function setupBooking(space) {
  const form = document.querySelector('#booking-form');
  const status = document.querySelector('#booking-status');
  const breakdown = document.querySelector('#booking-breakdown');
  const book = document.querySelector('#confirm-reservation');
  const check = document.querySelector('#check-availability');
  const invoice = document.querySelector('#invoice-panel');
  const invoiceDetails = document.querySelector('#invoice-details');
  const pay = document.querySelector('#complete-payment');
  const cancel = document.querySelector('#cancel-booking');
  const fields = form.querySelector('fieldset');
  const params = new URLSearchParams(window.location.search);
  const key = `parkshare-booking-attempt:${space.id}`;
  let quote = null, busy = false, revision = 0, pending = null, locked = false;
  // Only the request needed for a safe retry is stored; passwords and tokens stay in the auth SDK.
  try { pending = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { pending = null; }
  const inputTime = value => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp + 330 * 60000).toISOString().slice(0, 16) : '';
  };
  form.elements.arrival.value = params.get('arrival') || inputTime(pending?.request?.p_arrival);
  form.elements.departure.value = params.get('departure') || inputTime(pending?.request?.p_departure);
  form.elements.vehicle.replaceChildren(...space.vehicles.map(type => {
    const option = element('option', '', type); option.value = type; return option;
  }));
  if (space.vehicles.includes(pending?.request?.p_vehicle_type)) form.elements.vehicle.value = pending.request.p_vehicle_type;
  else if (space.vehicles.includes(params.get('vehicle'))) form.elements.vehicle.value = params.get('vehicle');
  if (pending) {
    // Older saved attempts may not yet have a payment key or invoice snapshot.
    if (!pending.paymentKey) { pending.paymentKey = crypto.randomUUID(); pending.started = true; }
    pending.quote ||= previewPrice(pending.request.p_expected_hourly_rate,
      validateInterval(pending.request.p_arrival, pending.request.p_departure, 0));
    locked = Boolean(pending.started);
    try { sessionStorage.setItem(key, JSON.stringify(pending)); }
    catch { status.textContent = 'Could not save the retry details. Keep this page open and retry here.'; }
  }
  if (book) book.disabled = true;
  if (isDemo) status.textContent = 'Price previews are available. Reservations require the connected ParkShare service.';

  function inputData() {
    const arrival = indianTimeToUTC(form.elements.arrival.value);
    const departure = indianTimeToUTC(form.elements.departure.value);
    validateInterval(arrival, departure);
    const vehicle = form.elements.vehicle.value;
    if (!space.vehicles.includes(vehicle)) throw new Error('Select a supported vehicle.');
    return { p_space_id: space.id, p_arrival: arrival, p_departure: departure, p_vehicle_type: vehicle };
  }
  function displayPrice(price, label) {
    breakdown.replaceChildren(element('h3', '', label));
    for (const [name, value] of [['Duration', `${price.duration_minutes} minutes`], ['Hourly price (fee included)', money(price.hourly_rate)],
      ['Owner parking amount', money(price.parking_subtotal)], ['Included platform fee (5% of total)', money(price.service_fee)], ['Total', money(price.total)]]) {
      breakdown.append(element('p', '', `${name}: ${value}`));
    }
  }
  function drawInvoice(attempt) {
    const request = attempt.request, amount = attempt.quote;
    invoiceDetails.replaceChildren(
      element('h3', '', space.title),
      element('p', '', `Arrival: ${indianDisplay(request.p_arrival)}`),
      element('p', '', `Departure: ${indianDisplay(request.p_departure)}`),
      element('p', '', `Vehicle: ${request.p_vehicle_type} · ${request.p_registration}`),
      element('p', '', `Parking amount: ${money(amount.parking_subtotal)}`),
      element('p', '', `Included platform fee: ${money(amount.service_fee)}`),
      element('p', 'invoice-total', `Total due: ${money(amount.total)}`),
      element('p', 'muted', 'This checkout records a simulated payment. No real money is collected.')
    );
    invoice.hidden = false;
    if (pay) pay.disabled = busy;
    if (cancel) cancel.disabled = busy || locked;
  }
  function setBusy(value) {
    busy = value;
    if (fields) fields.disabled = value || Boolean(pending);
    if (check) check.disabled = value || Boolean(pending);
    if (book) book.disabled = value || !quote?.available || isDemo || Boolean(pending);
    if (pay) pay.disabled = value;
    if (cancel) cancel.disabled = value || locked;
  }
  function preview() {
    ++revision; quote = null; if (book) book.disabled = true;
    if (pending) return;
    try {
      const data = inputData();
      displayPrice(previewPrice(space.hourly_price ?? space.price, validateInterval(data.p_arrival, data.p_departure)), 'Estimated price');
      status.textContent = 'Check availability for a current quote. The check does not hold the spot.';
    } catch (error) { breakdown.replaceChildren(); status.textContent = error.message; }
  }
  form.addEventListener('input', preview);
  form.addEventListener('submit', event => event.preventDefault());
  check.addEventListener('click', async () => {
    if (busy || pending) return;
    quote = null; if (book) book.disabled = true;
    try {
      const data = inputData();
      if (isDemo) { displayPrice(previewPrice(space.hourly_price ?? space.price, validateInterval(data.p_arrival, data.p_departure)), 'Estimated price'); status.textContent = 'Availability checks require the connected ParkShare service.'; return; }
      const version = revision;
      setBusy(true); status.textContent = 'Checking availability and current price…';
      const result = await getQuote(data);
      if (version !== revision) return;
      quote = result;
      displayPrice(result, 'Current quote');
      status.textContent = result.available
        ? 'Available now. Review the invoice before continuing. This check does not hold the spot.'
        : 'Unavailable for part of those times. Choose different times.';
    } catch (error) { status.textContent = error.message; }
    finally { setBusy(false); }
  });

  async function complete() {
    if (!pending || busy) return;
    pending.started = true; locked = true;
    try { sessionStorage.setItem(key, JSON.stringify(pending)); }
    catch { locked = false; pending.started = false; status.textContent = 'Could not save payment retry details. Keep this page open and retry here.'; return; }
    setBusy(true); status.textContent = 'Creating your reservation and completing payment…';
    try {
      const current = await session();
      if (!current || current.user.id !== pending.userId) throw new Error('Log in with the account that prepared this booking to continue.');
      // Both calls use persistent request keys so an uncertain network retry cannot duplicate the booking or payment.
      const booking = await reserve(pending.request);
      const result = await simulatePayment(booking.id, 'success', pending.paymentKey);
      if (!result?.booking || result.booking.id !== booking.id || result.booking.driver_id !== current.user.id
          || result.booking.payment_status !== 'demo_paid') {
        throw new Error('Payment could not be confirmed. Use Complete payment to safely retry this same request.');
      }
      sessionStorage.removeItem(key); pending = null;
      window.location.assign(`my-bookings.html?${new URLSearchParams({ booking: booking.id })}`);
    } catch (error) {
      status.textContent = `${error.message} Use Complete payment to retry this same request.`;
      // Clear only errors that prove the reservation was rejected before creation.
      if (['PRICE_CHANGED','SLOT_TAKEN','INVALID_INTERVAL','UNSUPPORTED_VEHICLE','INVALID_REGISTRATION','SELF_BOOKING','SPACE_UNAVAILABLE','OUTSIDE_OPENING_HOURS','SPACE_BLOCKED'].includes(error.code)) {
        sessionStorage.removeItem(key); pending = null; locked = false; invoice.hidden = true; quote = null;
      }
    } finally { setBusy(false); if (pending) drawInvoice(pending); }
  }
  book.addEventListener('click', async () => {
    if (busy || !quote?.available || pending || isDemo) return;
    try {
      const data = inputData();
      const registration = registrationNumber(form.elements.registration.value);
      setBusy(true);
      const current = await session();
      if (!current) {
        // Preserve only the selected space and times in the URL; registration stays out of browser history.
        const returnTo = `space.html?${new URLSearchParams({ id: space.id, arrival: form.elements.arrival.value,
          departure: form.elements.departure.value, vehicle: form.elements.vehicle.value })}`;
        window.location.assign(`login.html?${new URLSearchParams({ returnTo })}`);
        return;
      }
      if (space.ownerId === current.user.id) throw new Error('You cannot reserve your own parking space.');
      pending = { userId: current.user.id, request: { ...data, p_registration: registration,
        p_expected_hourly_rate: quote.hourly_rate, p_idempotency_key: crypto.randomUUID() },
        quote, paymentKey: crypto.randomUUID(), started: false };
      sessionStorage.setItem(key, JSON.stringify(pending));
      if (fields) fields.disabled = true;
      drawInvoice(pending);
      status.textContent = 'Review the reservation details and invoice. Nothing is reserved until you complete payment.';
    } catch (error) { status.textContent = error.message || 'Enable session storage to safely continue. No reservation was created.'; pending = null; }
    finally { setBusy(false); }
  });
  pay.addEventListener('click', complete);
  cancel.addEventListener('click', () => {
    if (busy || locked) return;
    sessionStorage.removeItem(key); pending = null; invoice.hidden = true;
    if (fields) fields.disabled = false;
    setBusy(false);
    status.textContent = 'Booking cancelled. No reservation was created.';
  });
  if (pending) {
    form.elements.registration.value = pending.request.p_registration || '';
    if (fields) fields.disabled = true;
    drawInvoice(pending);
    status.textContent = 'Review the saved invoice and complete payment to continue this booking.';
  } else if (form.elements.arrival.value && form.elements.departure.value) preview();
}
