import { isDemo, session } from './auth.js';
import { getQuote, reserve } from './booking-data.js';
import { indianTimeToUTC, validateInterval, registrationNumber, previewPrice, money } from './booking-rules.js';
import { element } from './ui.js';

export function setupBooking(space) {
  const form = document.querySelector('#booking-form');
  const status = document.querySelector('#booking-status');
  const breakdown = document.querySelector('#booking-breakdown');
  const confirm = document.querySelector('#confirm-reservation');
  const retry = document.querySelector('#retry-reservation');
  const check = document.querySelector('#check-availability');
  const params = new URLSearchParams(window.location.search);
  const key = `parkshare-booking-attempt:${space.id}`;
  let quote = null, busy = false, revision = 0, pending = null;
  // Only a reservation request is stored, never a password or access token. SDK owns auth.
  try { pending = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { pending = null; }
  form.elements.arrival.value = params.get('arrival') || '';
  form.elements.departure.value = params.get('departure') || '';
  form.elements.vehicle.replaceChildren(...space.vehicles.map(type => {
    const option = element('option', '', type); option.value = type; return option;
  }));
  if (space.vehicles.includes(params.get('vehicle'))) form.elements.vehicle.value = params.get('vehicle');
  confirm.disabled = true;
  retry.hidden = !pending;
  if (pending) status.textContent = 'An earlier attempt may have completed. Retry it to recover its result before starting another reservation.';
  else if (isDemo) status.textContent = 'Demo mode: price preview only. Availability checks and persistent reservations require Supabase mode.';

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
    for (const [name, value] of [['Duration', `${price.duration_minutes} minutes`], ['Hourly rate', money(price.hourly_rate)],
      ['Parking charge', money(price.parking_subtotal)], ['Service fee (5%)', money(price.service_fee)], ['Total', money(price.total)]]) {
      breakdown.append(element('p', '', `${name}: ${value}`));
    }
  }
  function setBusy(value) {
    busy = value;
    form.querySelector('fieldset').disabled = value;
    retry.disabled = value;
    confirm.disabled = value || !quote?.available || isDemo || !!pending;
  }
  function preview() {
    ++revision; quote = null; confirm.disabled = true;
    try {
      const data = inputData();
      displayPrice(previewPrice(space.price, validateInterval(data.p_arrival,data.p_departure)), 'Estimated price');
      status.textContent = pending ? 'Recover the previous attempt using Retry this reservation first.' : 'Check availability for an authoritative quote. A check does not hold the spot.';
    } catch (error) { breakdown.replaceChildren(); status.textContent = error.message; }
  }
  form.addEventListener('input', preview);
  form.addEventListener('submit', event => event.preventDefault());
  check.addEventListener('click', async () => {
    if (busy || pending) return;
    quote = null; confirm.disabled = true;
    try {
      const data = inputData();
      if (isDemo) { displayPrice(previewPrice(space.price,validateInterval(data.p_arrival,data.p_departure)), 'Demo estimate'); status.textContent = 'Availability is not checked in demo mode. Switch to Supabase mode for reservations.'; return; }
      const version = revision;
      setBusy(true); status.textContent = 'Checking availability and current price…';
      const result = await getQuote(data);
      if (version !== revision) return;
      quote = result;
      displayPrice(result, 'Current database quote');
      status.textContent = result.available ? 'Available now. Review this quote, then confirm. This check does not hold the spot. No payment will be collected.' : 'This spot is reserved for part of those times. Please choose different times.';
    } catch (error) { status.textContent = error.message; }
    finally { setBusy(false); }
  });

  async function submitAttempt() {
    if (!pending || busy) return;
    setBusy(true); status.textContent = 'Confirming your reservation…';
    try {
      const current = await session();
      if (!current || current.user.id !== pending.userId) throw new Error('Log in with the account that started this attempt to recover its result.');
      const booking = await reserve(pending.request);
      sessionStorage.removeItem(key); pending = null;
      window.location.assign(`confirmation.html?${new URLSearchParams({ booking: booking.id })}`);
    } catch (error) {
      status.textContent = error.message;
      // Only explicit database rejection proves no booking was created. Network/unknown errors retain key.
      if (['PRICE_CHANGED','SLOT_TAKEN','INVALID_INTERVAL','UNSUPPORTED_VEHICLE','INVALID_REGISTRATION','SELF_BOOKING','SPACE_UNAVAILABLE'].includes(error.code)) {
        sessionStorage.removeItem(key); pending = null; quote = null;
      }
      retry.hidden = !pending;
    } finally { setBusy(false); }
  }
  retry.addEventListener('click', submitAttempt);
  confirm.addEventListener('click', async () => {
    if (busy || !quote?.available || pending || isDemo) return;
    setBusy(true);
    try {
      const data = inputData();
      const registration = registrationNumber(form.elements.registration.value);
      const current = await session();
      if (!current) {
        // Preserve non-sensitive selection in the URL; do not put a registration in browser history.
        const returnTo = `space.html?${new URLSearchParams({ id: space.id, arrival: form.elements.arrival.value,
          departure: form.elements.departure.value, vehicle: form.elements.vehicle.value })}`;
        window.location.assign(`login.html?${new URLSearchParams({ returnTo })}`);
        return;
      }
      if (space.ownerId === current.user.id) throw new Error('You cannot reserve your own parking space.');
      pending = { userId: current.user.id, request: { ...data, p_registration: registration,
        p_expected_hourly_rate: quote.hourly_rate, p_idempotency_key: crypto.randomUUID() } };
      try { sessionStorage.setItem(key, JSON.stringify(pending)); }
      catch { pending = null; throw new Error('Enable session storage to safely recover reservation retries. No booking was sent.'); }
      retry.hidden = false;
    } catch (error) { status.textContent = error.message; }
    finally { setBusy(false); }
    if (pending) await submitAttempt();
  });
  if (form.elements.arrival.value && form.elements.departure.value) preview();
}
