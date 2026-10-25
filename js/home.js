import { loadSpaces } from './data.js';
import { renderCards } from './ui.js';

const status = document.querySelector('#home-status');
const retry = document.querySelector('#home-retry');
async function loadFeatured() {
  retry.hidden = true;
  status.textContent = 'Loading featured spaces…';
  try {
    const spaces = await loadSpaces();
    renderCards(document.querySelector('#featured'), spaces.filter(space => space.featured));
    status.textContent = '';
  } catch {
    status.textContent = 'We couldn’t load the featured spaces. Check your local server and try again.';
    retry.hidden = false;
  }
}
retry.addEventListener('click', loadFeatured);
loadFeatured();
