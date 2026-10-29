import { getClient, isDemo, session } from './auth.js';
import { element } from './ui.js';

const nav = document.querySelector('nav[aria-label="Main navigation"]');
const account = nav.querySelector('.account-nav');
// The same three destinations are present on every page, even before session loading.
for (const link of nav.querySelectorAll('a')) {
  if (new URL(link.href).pathname === window.location.pathname) link.setAttribute('aria-current', 'page');
}
function draw(current) {
  account.replaceChildren();
  if (!current) {
    const link = element('a', '', 'Log in');
    link.href = 'login.html';
    if (new URL(link.href).pathname === window.location.pathname) link.setAttribute('aria-current', 'page');
    account.append(link);
  }
  if (current) {
    const logout = element('button', 'nav-logout', 'Logout');
    logout.type = 'button';
    logout.addEventListener('click', async () => {
      logout.disabled = true;
      try {
        const client = await getClient();
        const { error } = await client.auth.signOut();
        if (error) throw error;
        window.location.assign('index.html');
      } catch { logout.disabled = false; logout.textContent = 'Logout failed — retry'; }
    });
    account.append(logout);
  }
}
draw(null);
if (!isDemo) {
  try {
    const client = await getClient();
    client.auth.onAuthStateChange((_event, current) => draw(current));
    draw(await session());
  } catch { account.title = 'Session unavailable. Open login to retry.'; }
}
