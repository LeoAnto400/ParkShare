import { loadSpaces } from './data.js';
import { renderCards } from './ui.js';
import { isDemo } from './auth.js';
import { availableSpaceIds } from './booking-data.js';
import { indianTimeToUTC, validateInterval } from './booking-rules.js';
import { fitsSchedule } from './availability.js';

const locationInput = document.querySelector('#location');
const price = document.querySelector('#price');
const vehicle = document.querySelector('#vehicle');
const ev = document.querySelector('#ev');
const covered = document.querySelector('#covered');
const sort = document.querySelector('#sort');
const results = document.querySelector('#results');
const status = document.querySelector('#search-status');
const count = document.querySelector('#results-count');
const retry = document.querySelector('#retry');
const arrivalInput = document.querySelector('#filter-arrival');
const departureInput = document.querySelector('#filter-departure');
const periodNote = document.querySelector('#period-note');
let spaces = [];
let loaded = false;
// Period filter state: null = no period chosen; otherwise a Set of space IDs free for it.
let availableIds = null;
let periodVersion = 0;
const urlParams = new URLSearchParams(window.location.search);
arrivalInput.value = urlParams.get('arrival') || '';
departureInput.value = urlParams.get('departure') || '';
locationInput.value = new URLSearchParams(window.location.search).get('location') || '';

function updateResults() {
  document.querySelector('#price-value').textContent = `₹${price.value}`;
  if (!loaded) return;
  const location = locationInput.value.trim();
  const query = location.toLowerCase();
  // Every condition must pass: location AND price AND vehicle AND amenities.
  const matches = spaces.filter(space => {
    const searchable = `${space.title} ${space.locality} ${space.city} ${space.address} ${space.landmark || ''}`.toLowerCase();
    return searchable.includes(query)
      && space.price <= Number(price.value)
      && (!vehicle.value || space.vehicles.includes(vehicle.value))
      && (!ev.checked || space.amenities.includes('EV charging'))
      && (!covered.checked || space.amenities.includes('Covered parking'))
      && (!availableIds || availableIds.has(space.id));
  });
  if (sort.value === 'asc') matches.sort((a, b) => a.price - b.price);
  if (sort.value === 'desc') matches.sort((a, b) => b.price - a.price);
  count.textContent = `${matches.length} ${matches.length === 1 ? 'space' : 'spaces'}${location ? ` near ${location}` : ' to explore'}`;
  status.textContent = matches.length ? '' : spaces.length
    ? 'No spaces match just yet. Try another location or reset your filters.'
    : 'No owner listings have been published yet.';
  renderCards(results, matches, location, availableIds ? { arrival: arrivalInput.value, departure: departureInput.value, vehicle: vehicle.value } : { vehicle: vehicle.value });
}

// Prevent a form navigation so AJAX results update on the same page.
document.querySelector('#search-form').addEventListener('submit', event => {
  event.preventDefault();
  const url = new URL(window.location.href);
  const location = locationInput.value.trim();
  if (location) url.searchParams.set('location', location);
  else url.searchParams.delete('location');
  window.history.replaceState(null, '', url);
  updateResults();
});
document.querySelector('#filters').addEventListener('input', updateResults);
sort.addEventListener('change', updateResults);
document.querySelector('#reset').addEventListener('click', () => {
  // Reset refinements, deliberately preserving the user's location.
  document.querySelector('#filters').reset();
  sort.value = 'recommended';
  refreshPeriod();
});
async function load() {
  loaded = false;
  retry.hidden = true;
  results.setAttribute('aria-busy', 'true');
  status.textContent = 'Loading parking spaces…';
  count.textContent = 'Finding spaces…';
  try {
    spaces = await loadSpaces();
    // Owner prices may exceed the original demo range. Default/reset must include them.
    const maximum = Math.max(100, ...spaces.map(space => Math.ceil(space.price / 5) * 5));
    price.max = String(maximum);
    price.defaultValue = String(maximum);
    price.value = String(maximum);
    document.querySelector('.range-ends span:last-child').textContent = `₹${maximum}`;
    loaded = true;
    await refreshPeriod();
  } catch (error) {
    count.textContent = 'Spaces unavailable';
    status.textContent = error.message;
    retry.hidden = false;
  } finally {
    results.setAttribute('aria-busy', 'false');
  }
}
// Date/time filter. Supabase mode asks the database which spaces can take the whole
// period (opening hours, confirmed bookings and owner blocks). Demo mode can only
// check opening hours locally and labels the result as unverified.
async function refreshPeriod() {
  const version = ++periodVersion;
  availableIds = null;
  if (!arrivalInput.value && !departureInput.value) {
    periodNote.textContent = 'Add both times to see only spaces free for the whole period.';
    updateResults(); return;
  }
  let arrival, departure;
  try {
    arrival = indianTimeToUTC(arrivalInput.value);
    departure = indianTimeToUTC(departureInput.value);
    validateInterval(arrival, departure);
  } catch (error) { periodNote.textContent = `${error.message} The period filter is not applied.`; updateResults(); return; }
  if (isDemo) {
    availableIds = new Set(spaces.filter(space => fitsSchedule(space.openingSchedule, Date.parse(arrival), Date.parse(departure))).map(space => space.id));
    periodNote.textContent = 'Preview mode checks opening hours only; existing reservations are not included.';
    updateResults(); return;
  }
  periodNote.textContent = 'Checking which spaces are free for the whole period…';
  try {
    const ids = await availableSpaceIds(arrival, departure);
    if (version !== periodVersion) return; // A newer period was chosen meanwhile.
    availableIds = ids;
    periodNote.textContent = 'Showing spaces open and free for the whole period. Booking re-checks it.';
  } catch (error) {
    if (version !== periodVersion) return;
    periodNote.textContent = `${error.message} Showing all spaces instead.`;
  }
  updateResults();
}
for (const input of [arrivalInput, departureInput]) input.addEventListener('change', () => { if (loaded) refreshPeriod(); });
retry.addEventListener('click', load);
load();
