import { loadSpaces } from './data.js';
import { renderCards } from './ui.js';

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
let spaces = [];
let loaded = false;
locationInput.value = new URLSearchParams(window.location.search).get('location') || '';

function updateResults() {
  document.querySelector('#price-value').textContent = `₹${price.value}`;
  if (!loaded) return;
  const location = locationInput.value.trim();
  const query = location.toLowerCase();
  // Every condition must pass: location AND price AND vehicle AND amenities.
  const matches = spaces.filter(space => {
    const searchable = `${space.title} ${space.locality} ${space.city} ${space.address}`.toLowerCase();
    return searchable.includes(query)
      && space.price <= Number(price.value)
      && (!vehicle.value || space.vehicles.includes(vehicle.value))
      && (!ev.checked || space.amenities.includes('EV charging'))
      && (!covered.checked || space.amenities.includes('Covered parking'));
  });
  if (sort.value === 'asc') matches.sort((a, b) => a.price - b.price);
  if (sort.value === 'desc') matches.sort((a, b) => b.price - a.price);
  count.textContent = `${matches.length} ${matches.length === 1 ? 'space' : 'spaces'}${location ? ` near ${location}` : ' to explore'}`;
  status.textContent = matches.length ? '' : 'No spaces match just yet. Try another location or reset your filters.';
  renderCards(results, matches, location);
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
  updateResults();
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
    updateResults();
  } catch (error) {
    count.textContent = 'Spaces unavailable';
    status.textContent = error.message;
    retry.hidden = false;
  } finally {
    results.setAttribute('aria-busy', 'false');
  }
}
retry.addEventListener('click', load);
load();
