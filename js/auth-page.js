import { getClient, isDemo, session } from './auth.js';

const form = document.querySelector('#auth-form');
const status = document.querySelector('#auth-status');
const signup = document.body.dataset.page === 'signup';
const submit = form.querySelector('button');
if (isDemo) {
  form.hidden = true;
  status.textContent = 'You are browsing local demo data. Authentication and owner writes require Supabase mode. Follow SUPABASE_SETUP.md to configure the new ParkShare project.';
} else {
  try { if (await session()) window.location.replace('dashboard.html'); }
  catch (error) { status.textContent = error.message; }
}
let busy = false;
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !form.reportValidity()) return;
  const values = new FormData(form);
  const password = values.get('password');
  if (signup && password !== values.get('confirm-password')) {
    status.textContent = 'The passwords do not match.';
    form.elements['confirm-password'].focus();
    return;
  }
  if (signup && !values.get('name').trim()) { status.textContent = 'Enter your name.'; return; }
  busy = true;
  submit.disabled = true;
  status.textContent = signup ? 'Creating your account…' : 'Signing in…';
  try {
    const client = await getClient();
    const credentials = { email: values.get('email').trim(), password };
    const result = signup
      ? await client.auth.signUp({ ...credentials, options: { data: { name: values.get('name').trim() },
        emailRedirectTo: new URL('login.html', window.location.href).href } })
      : await client.auth.signInWithPassword(credentials);
    if (result.error) throw result.error;
    // Confirmation-enabled signup has no session: never claim the user is logged in.
    if (result.data.session) window.location.assign('dashboard.html');
    else {
      status.textContent = 'Check your inbox for a confirmation link, then log in. If this address already has an account, use Log in. No signed-in session has been created.';
      form.reset();
    }
  } catch (error) {
    status.textContent = error.message || 'Authentication failed. Please try again.';
  } finally { busy = false; submit.disabled = false; }
});
