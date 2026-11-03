import { scheduleView } from './schedule.js';
import { loadSpace } from './data.js';
import { element, parkingImage, nearLandmark } from './ui.js';
import { setupBooking } from './booking.js';
import { locationActions } from './location.js';
import { showReviews } from './reviews.js';
import { availabilityView, istDate, dayStart } from './availability.js';
import { busyIntervals } from './booking-data.js';
import { isDemo } from './auth.js';

const params = new URLSearchParams(window.location.search);
const id = params.get('id');
const status = document.querySelector('#detail-status');
const retry = document.querySelector('#retry');
const location = params.get('location');
if (location) document.querySelector('#back').href = `search.html?${new URLSearchParams({ location })}`;

async function load() {
  retry.hidden = true;
  if (!id) {
    status.textContent = 'No space selected. Follow “Back to search” to choose a parking space.';
    return;
  }
  status.textContent = 'Loading space details…';
  try {
    const space = await loadSpace(id);
    if (!space) {
      status.textContent = 'This space could not be found. Follow “Back to search” to explore the demonstration listings.';
      return;
    }
    document.title = `${space.title} — ParkShare`;
    for (const field of ['title', 'address', 'description']) document.querySelector(`#${field}`).textContent = space[field];
    document.querySelector('#locality').textContent = `${space.locality} · ${space.city}`;
    const landmark = document.querySelector('#landmark');
    landmark.textContent = space.landmark ? nearLandmark(space.landmark) : ''; landmark.hidden = !space.landmark;
    const limits = [];
    if (space.maxLength != null) limits.push(`Max length ${space.maxLength} m`);
    if (space.maxHeight != null) limits.push(`Max height ${space.maxHeight} m`);
    document.querySelector('#size-limits').replaceChildren(...(limits.length ? limits : ['No size limit listed']).map(text => element('span', 'chip', text)));
    document.querySelector('#price').textContent = `₹${space.price}`;
    document.querySelector('#gallery').replaceChildren(...space.photos.map(photo => parkingImage(photo, space.title)));
    for (const field of ['vehicles', 'amenities']) document.querySelector(`#${field}`).replaceChildren(...space[field].map(text => element('span', 'chip', text)));
    document.querySelector('#rules').replaceChildren(...space.rules.map(rule => element('li', '', rule)));
    document.querySelector('#space').hidden = false;
    document.querySelector('#opening-hours')?.remove();
    const hours = scheduleView(space.openingSchedule); hours.id = 'opening-hours';
    document.querySelector('#rules').closest('section').after(hours);
    document.querySelector('#availability')?.remove();
    hours.after(await availabilitySection(space));
    setupBooking(space);
    status.textContent = '';
    document.querySelector('#location-actions')?.remove();
    const directions = locationActions(space); directions.id = 'location-actions';
    document.querySelector('#address').after(directions);
    document.querySelector('#reviews')?.remove();
    const reviews = element('section'); reviews.id = 'reviews';
    document.querySelector('#space').append(reviews);
    await showReviews(space, reviews);
  } catch (error) {
    status.textContent = error.message;
    retry.hidden = false;
  }
}
retry.addEventListener('click', load);
load();

// Next 7 days of free / booked / owner-blocked times. Demo mode has no booking data,
// so it shows opening hours only and says so. The booking quote stays authoritative.
async function availabilitySection(space) {
  const from = dayStart(istDate(Date.now()));
  const to = from + 7 * 24 * 3600000;
  let busy = [], verified = !isDemo, failed = false;
  if (!isDemo) {
    try { busy = await busyIntervals(space.id, new Date(from).toISOString(), new Date(to).toISOString()); }
    catch { verified = false; failed = true; }
  }
  const section = availabilityView(space.openingSchedule, busy, { verified });
  section.id = 'availability';
  if (failed) section.querySelector('.demo-note').textContent = 'Booked times could not be loaded. Reload to retry; the quote still checks availability.';
  return section;
}
