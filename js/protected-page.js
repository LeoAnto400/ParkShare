import { isDemo, session, getClient } from './auth.js';

export async function protectPage(destination, status, privateContent) {
  if (isDemo) {
    status.textContent = 'Local demo mode supports browsing and price previews only. Bookings, demo payments, earnings and reviews require Supabase mode.';
    return null;
  }
  const current = await session();
  if (!current) {
    window.location.replace(`login.html?${new URLSearchParams({ returnTo: destination })}`);
    return null;
  }
  const client = await getClient();
  // Clear private content when another tab signs out or switches accounts.
  client.auth.onAuthStateChange((_event, active) => {
    if (!active || active.user.id !== current.user.id) {
      privateContent.replaceChildren();
      privateContent.hidden = true;
      window.location.reload();
    }
  });
  return current;
}
