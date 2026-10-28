import { isDemo, getClient, session } from './auth.js';
import { element } from './ui.js';
import { loadOwnedSpaces, createOwnedSpace, updateOwnedSpace, deleteOwnedSpace, uploadPhoto, validateListing, validatePhoto } from './owner-data.js';

const status = document.querySelector('#owner-status');
const list = document.querySelector('#owner-list');
const form = document.querySelector('#listing-form');
const panel = document.querySelector('#editor');
const controls = document.querySelector('#owner-controls');
const fields = form.querySelector('fieldset');
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
  for (const name of ['title', 'description', 'locality', 'city', 'address', 'hourly_price', 'latitude', 'longitude']) form.elements[name].value = row?.[name] ?? '';
  form.elements.parking_rules.value = row?.parking_rules.join('\n') ?? '';
  form.elements.amenities.value = row?.amenities.join('\n') ?? '';
  form.querySelectorAll('[name=vehicle]').forEach(input => { input.checked = !!row?.supported_vehicles.includes(input.value); });
  form.elements.published.checked = row?.published ?? false;
  form.elements.photo.required = !row;
  document.querySelector('#editor-title').textContent = row ? 'Edit your space' : 'Add a parking space';
  document.querySelector('#photo-help').textContent = row ? 'Leave empty to keep current photos. Selecting a photo replaces the listing’s photos. JPEG, PNG or WebP; maximum 5 MiB.' : 'Choose a JPEG, PNG or WebP photo; maximum 5 MiB. Required for a new space.';
  panel.hidden = false;
  form.elements.title.focus();
}
function render() {
  list.replaceChildren();
  for (const row of listings) {
    const card = element('article', 'owner-card');
    card.append(element('h2', '', row.title), element('p', 'muted', `${row.locality} · ₹${row.hourly_price}/hour · ${row.published ? 'Published' : 'Draft'}`));
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
    latitude: values.get('latitude').trim() === '' ? null : Number(values.get('latitude')),
    longitude: values.get('longitude').trim() === '' ? null : Number(values.get('longitude')),
    amenities: lines('amenities'), parking_rules: lines('parking_rules'), published: form.elements.published.checked
  };
  const photo = form.elements.photo.files[0];
  try { validateListing(row); if (photo) validatePhoto(photo); else if (!editing) throw new Error('Choose a photo.'); }
  catch (error) { formStatus.textContent = error.message; return; }
  setBusy(true);
  formStatus.textContent = photo ? 'Uploading photo, then saving your space…' : 'Saving your space…';
  try {
    row.image_urls = photo ? [await uploadPhoto(photo)] : editing.image_urls;
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
