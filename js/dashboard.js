import { scheduleEditor } from './schedule.js';
import { previewPrice, money } from './booking-rules.js';
import { isDemo, getClient, session } from './auth.js';
import { element } from './ui.js';
import { loadOwnedSpaces, createOwnedSpace, updateOwnedSpace, deleteOwnedSpace, uploadPhoto, validateListing, validatePhoto } from './owner-data.js';

const status = document.querySelector('#owner-status');
const list = document.querySelector('#owner-list');
const form = document.querySelector('#listing-form');
const panel = document.querySelector('#editor');
const controls = document.querySelector('#owner-controls');
const fields = form.querySelector('fieldset');
const schedule = scheduleEditor(document.querySelector('#schedule-editor'));
const standardAmenities = ['EV charging', 'Covered parking', 'Security', 'CCTV camera'];
let photos = [];
let listings = [];
let editing = null;
let createId;
let busy = false;
let refreshVersion = 0;
const formStatus = document.querySelector('#form-status');

function setBusy(value) {
  busy = value;
  fields.disabled = value;
  controls.querySelectorAll('button').forEach(button => { button.disabled = value; });
  list.querySelectorAll('button').forEach(button => { button.disabled = value; });
}
function openEditor(row = null) {
  if (busy) return;
  editing = row;
  createId = crypto.randomUUID(); // Retain ID across failed retries to prevent duplicate creation.
  form.reset();
  formStatus.textContent = '';
  for (const name of ['title', 'description', 'locality', 'city', 'address', 'hourly_price']) form.elements[name].value = row?.[name] ?? '';
  form.elements.parking_rules.value = row?.parking_rules.join('\n') ?? '';
  form.querySelectorAll('[name=amenity]').forEach(input => { input.checked = !!row?.amenities.includes(input.value); });
  form.elements.other_amenities.value = (row?.amenities || []).filter(value => !standardAmenities.includes(value)).join('\n');
  schedule.set(row?.opening_schedule);
  photos.forEach(photo => { if (photo.preview) URL.revokeObjectURL(photo.preview); });
  photos = (row?.image_urls || []).map(url => ({ url }));
  drawPhotos(); updateOwnerPrice();
  form.querySelectorAll('[name=vehicle]').forEach(input => { input.checked = !!row?.supported_vehicles.includes(input.value); });
  form.elements.published.checked = row?.published ?? false;
  form.elements.photo.required = false; // The combined retained/new photo list is validated on save.
  document.querySelector('#editor-title').textContent = row ? 'Edit your space' : 'Add a parking space';

  panel.hidden = false;
  form.elements.title.focus();
}
function render() {
  list.replaceChildren();
  for (const row of listings) {
    const card = element('article', 'owner-card');
    card.append(element('h2', '', row.title), element('p', 'muted', `${row.locality} · ₹${row.hourly_price}/hour (fee included) · ${row.published ? 'Published' : 'Draft'}`));
    const actions = element('div', 'owner-actions');
    const edit = element('button', 'secondary', 'Edit');
    edit.addEventListener('click', () => openEditor(row));
    const publish = element('button', 'secondary', row.published ? 'Unpublish' : 'Publish');
    publish.addEventListener('click', () => mutate(() => updateOwnedSpace(row.id, { published: !row.published }), row.published ? 'Space unpublished.' : 'Space published. Refresh search to see it.'));
    const remove = element('button', 'secondary', 'Delete');
    remove.addEventListener('click', () => {
      if (window.confirm(`Delete “${row.title}”? Listings with booking history cannot be deleted; unpublish them instead. Otherwise deletion is permanent. Uploaded photos are retained for manual cleanup.`)) {
        mutate(() => deleteOwnedSpace(row.id), 'Listing deleted.');
      }
    });
    actions.append(edit, publish, remove);
    card.append(actions);
    list.append(card);
  }
}
async function refresh(message = '') {
  const version = ++refreshVersion;
  status.textContent = 'Loading your spaces…';
  try {
    const rows = await loadOwnedSpaces();
    if (version !== refreshVersion) return;
    listings = rows;
    render();
    status.textContent = message || (rows.length ? `${rows.length} spaces in your dashboard.` : 'No spaces yet. Add your first parking space.');
  } catch (error) { if (version === refreshVersion) status.textContent = `${message ? `${message} ` : ''}${error.message} Use Refresh to retry.`; }
}
async function mutate(action, message) {
  if (busy) return;
  setBusy(true);
  try { await action(); panel.hidden = true; await refresh(message); }
  catch (error) { status.textContent = error.message; }
  finally { setBusy(false); }
}
controls.querySelector('#add-space').addEventListener('click', () => openEditor());
controls.querySelector('#refresh').addEventListener('click', () => { if (!busy) refresh(); });
document.querySelector('#cancel').addEventListener('click', () => { panel.hidden = true; });
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !form.reportValidity()) return;
  const values = new FormData(form);
  const lines = name => values.get(name).split('\n').map(v => v.trim()).filter(Boolean);
  const row = {
    title: values.get('title').trim(), description: values.get('description').trim(),
    locality: values.get('locality').trim(), city: values.get('city').trim(), address: values.get('address').trim(),
    hourly_price: Number(values.get('hourly_price')), supported_vehicles: values.getAll('vehicle'),
    amenities: [...new Set([...values.getAll('amenity'), ...lines('other_amenities')])], parking_rules: lines('parking_rules'), published: form.elements.published.checked
  };
  // If an address moves, discard the old listing pin; existing booking snapshots stay intact.
  if (editing && ['address', 'locality', 'city'].some(key => row[key] !== editing[key])) {
    row.latitude = null; row.longitude = null;
  }
  try { row.opening_schedule = schedule.get(); validateListing(row); if (!photos.length) throw new Error('Add at least one parking photo.'); photos.forEach(photo => { if (photo.file) validatePhoto(photo.file); }); }
  catch (error) { formStatus.textContent = error.message; return; }
  setBusy(true);
  formStatus.textContent = 'Uploading new photos, then saving your space…';
  try {
    // Cache each completed upload on its item so an interrupted save does not upload it again.
    for (const photo of photos) if (!photo.url) photo.url = await uploadPhoto(photo.file);
    row.image_urls = photos.map(photo => photo.url);
    if (editing) await updateOwnedSpace(editing.id, row);
    else await createOwnedSpace(createId, row);
    panel.hidden = true;
    await refresh('Space saved. Published spaces appear in search after refreshing.');
  } catch (error) {
    // Keep all entered values and the selected file for correction/retry.
    formStatus.textContent = `${error.message} If a save was interrupted, refresh your listings before retrying. Uploaded but unused photos may need manual cleanup.`;
  } finally { setBusy(false); }
});

if (isDemo) {
  status.textContent = 'Owner features require Supabase mode. Local demo browsing remains available; login and saves are not simulated. See SUPABASE_SETUP.md.';
} else {
  try {
    const current = await session();
    if (!current) window.location.replace('login.html?next=dashboard');
    else {
      const client = await getClient();
      client.auth.onAuthStateChange((_event, active) => {
        if (active && active.user.id !== current.user.id) {
          window.location.reload();
        } else if (!active) {
          ++refreshVersion;
          controls.hidden = true;
          list.replaceChildren();
          fields.disabled = true;
          status.textContent = 'You are signed out. Log in again to manage spaces.';
        }
      });
      controls.hidden = false;
      await refresh();
    }
  } catch (error) { status.textContent = `${error.message} Reload this page to retry.`; }
}

function updateOwnerPrice() {
  const rate = Number(form.elements.hourly_price.value);
  const target = document.querySelector('#owner-price-preview');
  if (!Number.isFinite(rate) || rate < 0 || !form.elements.hourly_price.value) { target.textContent = 'Your listed hourly price is the driver total, including the platform fee.'; return; }
  const price = previewPrice(rate, 60);
  target.textContent = `Per hour: driver pays ${money(price.total)} · platform fee ${money(price.service_fee)} · you receive ${money(price.parking_subtotal)}. All payments remain simulated.`;
}
form.elements.hourly_price.addEventListener('input', updateOwnerPrice);
function drawPhotos() {
  const list = document.querySelector('#photo-list'); list.replaceChildren();
  photos.forEach((photo, index) => {
    const item = element('div', 'photo-item');
    const image = element('img'); image.src = photo.preview || photo.url; image.alt = `Parking photo ${index + 1}`;
    image.addEventListener('error', () => { image.src = '../assets/parking-fallback.svg'; }, { once: true });
    const remove = element('button', 'secondary', `Remove photo ${index + 1}`); remove.type = 'button';
    remove.addEventListener('click', () => { if (busy) return; if (photo.preview) URL.revokeObjectURL(photo.preview); photos.splice(index, 1); drawPhotos(); form.elements.photo.focus(); });
    item.append(image, remove); list.append(item);
  });
}
form.elements.photo.addEventListener('change', () => {
  if (busy) return;
  const files = Array.from(form.elements.photo.files);
  try {
    files.forEach(validatePhoto); // Reject the entire selection before adding invalid files.
    photos.push(...files.map(file => ({ file, preview: URL.createObjectURL(file) })));
    drawPhotos(); formStatus.textContent = `${photos.length} photos selected. Save space to apply changes.`;
  } catch (error) { formStatus.textContent = error.message; }
  form.elements.photo.value = ''; // Allow another selection, including the same filename.
});
