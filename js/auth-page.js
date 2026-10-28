import { getClient, isDemo, session } from './auth.js';
import { authDestination } from './booking-rules.js';

const form = document.querySelector('#auth-form');
const status = document.querySelector('#auth-status');
const signup = document.body.dataset.page === 'signup';
const submit = form.querySelector('button');
const destination = authDestination(window.location.search || '');
// Keep the selected spot/times when switching between signup and login.
if (destination !== 'dashboard.html') {
  const other = document.querySelector(signup ? 'a[href="login.html"]' : 'a[href="signup.html"]');
  if (other) other.href = `${signup ? 'login' : 'signup'}.html?${new URLSearchParams({ returnTo: destination })}`;
}
if (isDemo) {
  form.hidden = true;
  status.textContent = 'You are browsing local demo data. Authentication and owner writes require Supabase mode. Follow SUPABASE_SETUP.md to configure the new ParkShare project.';
} else {
  try { if (await session()) window.location.replace(destination); }
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
      ? await client.auth.signUp({ ...credentials, options: { data: { name: values.get('name').trim() } } })
      : await client.auth.signInWithPassword(credentials);
    if (result.error) throw result.error;
    // Supabase must issue a real session; disabling Confirm email is a dashboard setting.
    if (result.data?.session?.access_token && result.data.session.user?.id) window.location.assign(destination);
    else {
      status.textContent = signup
        ? 'No signed-in session was returned. For this college demo, disable “Confirm email” in the NEW ParkShare Supabase project’s Authentication settings, save, then test with a new account. If already registered, use Log in. No email resend has been requested.'
        : 'Login did not return a valid session. Please try signing in again.';
    }
  } catch (error) {
    status.textContent = error.message || 'Authentication failed. Please try again.';
  } finally { busy = false; submit.disabled = false; }
});
