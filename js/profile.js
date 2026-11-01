import { protectPage } from './protected-page.js';
import { loadProfile, saveProfile } from './profile-data.js';

const status = document.querySelector('#profile-status');
const form = document.querySelector('#profile-form');
const save = form.querySelector('button[type=submit]');
let busy = false;

async function load(current) {
  status.textContent = 'Loading your profile…';
  try {
    const profile = await loadProfile();
    form.elements.email.value = current.user.email || '';
    form.elements.full_name.value = profile?.full_name || current.user.user_metadata?.name || '';
    form.elements.phone.value = profile?.phone || '';
    form.hidden = false;
    status.textContent = profile?.phone ? '' : 'Add your phone number to complete your profile.';
  } catch (error) { status.textContent = `${error.message} Reload to retry.`; }
}

// Submit sends JSON through fetch(); the page does not reload.
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !form.reportValidity()) return;
  busy = true; save.disabled = true;
  status.textContent = 'Saving your profile…';
  try {
    const saved = await saveProfile({ full_name: form.elements.full_name.value, phone: form.elements.phone.value });
    form.elements.full_name.value = saved.full_name;
    form.elements.phone.value = saved.phone;
    status.textContent = 'Profile saved.';
  } catch (error) { status.textContent = error.message; }
  finally { busy = false; save.disabled = false; }
});

try {
  const current = await protectPage('profile.html', status, form);
  if (current) await load(current);
} catch (error) { status.textContent = `${error.message} Reload to retry.`; }
