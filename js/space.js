import { loadSpace } from './data.js';
import { element, parkingImage } from './ui.js';
import { setupBooking } from './booking.js';

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
    document.querySelector('#price').textContent = `₹${space.price}`;
    document.querySelector('#gallery').replaceChildren(...space.photos.map(photo => parkingImage(photo, space.title)));
    for (const field of ['vehicles', 'amenities']) document.querySelector(`#${field}`).replaceChildren(...space[field].map(text => element('span', 'chip', text)));
    document.querySelector('#rules').replaceChildren(...space.rules.map(rule => element('li', '', rule)));
    document.querySelector('#space').hidden = false;
    setupBooking(space);
    status.textContent = '';
  } catch (error) {
    status.textContent = error.message;
    retry.hidden = false;
  }
}
retry.addEventListener('click', load);
load();
