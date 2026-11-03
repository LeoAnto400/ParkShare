import { protectPage } from './protected-page.js';
import { loadOwnedSpaces } from './owner-data.js';
import { element, parkingImage, confirmDialog } from './ui.js';
import { scheduleView } from './schedule.js';
import { locationActions } from './location.js';
import { showReviews } from './reviews.js';
import { money, previewPrice } from './booking-rules.js';
import { indianTimeToUTC, indianDisplay } from './booking-rules.js';
import { loadBlocks, createBlock, deleteBlock, loadEntryInstructions } from './owner-extras.js';

const id = new URLSearchParams(location.search).get('id');
const status = document.querySelector('#owner-detail-status');
const detail = document.querySelector('#owner-detail');
const panels = document.querySelector('#owner-space-panels');
let ready = false;
// ---- Blocked periods: list, add and remove through guarded RPCs ----
const blockForm = document.querySelector('#block-form');
const blockStatus = document.querySelector('#block-status');
const blockList = document.querySelector('#block-list');
let blockBusy = false;
function setBlockBusy(value) {
  blockBusy = value;
  blockForm.querySelectorAll('input,button').forEach(control => { control.disabled = value; });
  blockList.querySelectorAll('button').forEach(button => { button.disabled = value; });
}
async function drawBlocks(message = '') {
  blockStatus.textContent = 'Loading blocked periods…';
  try {
    const blocks = await loadBlocks(id);
    blockList.replaceChildren(...blocks.map(block => {
      const item = element('li', 'reservation-card');
      item.append(element('p', '', `${indianDisplay(block.starts_at)} → ${indianDisplay(block.ends_at)}`));
      if (block.reason) item.append(element('p', 'muted', `Private note: ${block.reason}`));
      const remove = element('button', 'secondary', 'Remove block');
      remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (blockBusy || !await confirmDialog('Remove this block? Drivers will be able to book these times again.', 'Remove block', 'Keep block')) return;
        setBlockBusy(true);
        try { await deleteBlock(block.id); await drawBlocks('Block removed. Those times are bookable again.'); }
        catch (error) { blockStatus.textContent = error.message; }
        finally { setBlockBusy(false); }
      });
      item.append(remove);
      return item;
    }));
    blockStatus.textContent = message || (blocks.length ? `${blocks.length} upcoming blocked ${blocks.length === 1 ? 'period' : 'periods'}.` : 'No upcoming blocked periods.');
  } catch (error) { blockStatus.textContent = `${message ? `${message} ` : ''}${error.message} Reload to retry.`; }
}
blockForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (blockBusy || !ready || !blockForm.reportValidity()) return;
  setBlockBusy(true);
  blockStatus.textContent = 'Blocking this period…';
  try {
    // datetime-local has no timezone: interpret it explicitly as Asia/Kolkata.
    const start = indianTimeToUTC(blockForm.elements.start.value);
    const end = indianTimeToUTC(blockForm.elements.end.value);
    await createBlock(id, start, end, blockForm.elements.reason.value);
    blockForm.reset();
    await drawBlocks('Period blocked. Drivers now see it as unavailable.');
  } catch (error) { blockStatus.textContent = error.message; }
  finally { setBlockBusy(false); }
});

try {
  const current = await protectPage(`owner-space.html?${new URLSearchParams({ id: id || '' })}`, status, document.querySelector('#main'));
  if (current) {
    const space = (await loadOwnedSpaces()).find(space => space.id === id);
    if (!space) throw new Error('Space not found or you do not own it.');
    document.title = `${space.title} — Owner dashboard`;
    document.querySelector('h1').textContent = space.title;
    const price = previewPrice(space.hourly_price, 60);
    const edit = element('a', 'button', 'Edit this space');
    edit.href = `dashboard.html?${new URLSearchParams({ edit: id })}`;
    detail.append(edit, element('p', 'muted', `${space.published ? 'Published' : 'Draft'} · Reference: ${space.id}`));
    const gallery = element('div', 'gallery');
    gallery.append(...space.image_urls.map(src => parkingImage({ src, alt: 'Owner-provided parking photo' }, space.title)));
    detail.append(gallery, element('h2', '', 'Space details'), element('p', '', space.description),
      element('p', '', `${money(space.hourly_price)} / hour, platform fee included. Owner: ${money(price.parking_subtotal)} · Platform: ${money(price.service_fee)}.`),
      locationActions(space));
    if (space.landmark) detail.append(element('p', '', `Landmark: ${space.landmark}`));
    const limits = sizeLimits(space);
    for (const [heading, values] of [['Supported vehicles',[...space.supported_vehicles, ...limits]],['Amenities',space.amenities],['Parking rules',space.parking_rules]]) {
      const section = element('section'); section.append(element('h3', '', heading));
      const list = element('ul'); values.forEach(value => list.append(element('li', '', value)));
      section.append(values.length ? list : element('p', 'muted', 'None listed.')); detail.append(section);
    }
    detail.append(scheduleView(space.opening_schedule));
    const entry = element('section');
    entry.append(element('h3', '', 'Entry instructions (private)'));
    const entryText = element('p', 'muted', 'Loading…');
    entry.append(entryText); detail.append(entry);
    loadEntryInstructions(id).then(text => { entryText.textContent = text || 'None yet. Add them with “Edit this space”; drivers see them only after confirming a booking.'; entryText.className = text ? '' : 'muted'; })
      .catch(() => { entryText.textContent = 'Could not load entry instructions. Reload to retry.'; });
    const reviews = element('section'); reviews.id = 'reviews-section';
    const reservations = document.querySelector('#reservations-section');
    // Keep the gallery full width, then pair the reservation list with space details.
    const galleryIndex = [...detail.children].indexOf(gallery);
    const right = element('div', 'owner-space-details');
    [...detail.children].slice(galleryIndex + 1).forEach(node => right.append(node));
    const left = element('div', 'owner-space-reservations'); left.append(reservations);
    const overview = element('div', 'owner-space-overview'); overview.append(left, right);
    detail.append(overview);
    const blocks = document.querySelector('#blocks-section');
    const earnings = document.querySelector('#earnings-section');
    panels.append(blocks, reviews, earnings);
    detail.hidden = panels.hidden = false; status.textContent = ''; ready = true;
    await Promise.all([showReviews({ id }, reviews), drawBlocks()]);
    if (location.hash === '#blocks-section') document.querySelector('#blocks-section').scrollIntoView();
  }
} catch (error) {
  status.textContent = `${error.message} Return to Owner dashboard or reload to retry.`;
}

function sizeLimits(space) {
  const limits = [];
  if (space.max_vehicle_length_m != null) limits.push(`Maximum length ${space.max_vehicle_length_m} m`);
  if (space.max_vehicle_height_m != null) limits.push(`Maximum height ${space.max_vehicle_height_m} m`);
  return limits;
}
