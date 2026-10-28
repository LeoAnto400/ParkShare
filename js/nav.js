import { getClient, isDemo, session } from './auth.js';
import { element } from './ui.js';

const nav = document.querySelector('nav');
const account = element('span', 'account-nav');
nav.append(account);
function draw(current) {
  account.replaceChildren();
  const link = element('a', '', current ? 'My spaces' : 'Log in');
  link.href = current ? 'dashboard.html' : 'login.html';
  account.append(link);
  if (current) {
    const bookings = element('a', '', 'My bookings');
    bookings.href = 'my-bookings.html';
    account.append(bookings);
    const logout = element('button', 'link-button', 'Log out');
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
