import { getClient, isDemo, session } from './auth.js';
import { element } from './ui.js';

// One header renderer owns both branding and navigation on every page.
// Replacing the content also removes any stale links left in cached page HTML.
const header = document.querySelector('[data-site-header]') || document.querySelector('header.header');
const brand = element('a', 'brand');
brand.href = 'index.html';
brand.setAttribute('aria-label', 'ParkShare home');
const mark = element('span', 'brand-mark', 'P');
mark.setAttribute('aria-hidden', 'true');
mark.append(element('span', '', '↗'));
brand.append(mark, document.createTextNode('ParkShare'), element('span', 'brand-dot', '.'));
const nav = element('nav');
nav.setAttribute('aria-label', 'Main navigation');
function pageLink(label, destination) {
  const link = element('a', '', label);
  link.href = destination;
  if (new URL(destination, window.location.href).pathname === window.location.pathname) link.setAttribute('aria-current', 'page');
  return link;
}
nav.append(pageLink('Find parking', 'search.html'), pageLink('My spaces', 'dashboard.html'), pageLink('My bookings', 'my-bookings.html'));
const account = element('span', 'account-nav');
account.setAttribute('aria-live', 'polite');
nav.append(account);
header.replaceChildren(brand, nav);

function draw(current) {
  account.removeAttribute('aria-busy');
  if (!current) {
    account.replaceChildren(pageLink('Log in', 'login.html'));
    return;
  }
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
  // Exactly one account control; never append a second login/logout item.
  account.replaceChildren(logout);
}
let subscribed = false;
let sessionVersion = 0;
async function restoreAccount() {
  account.setAttribute('aria-busy', 'true');
  account.replaceChildren(element('span', 'nav-loading', 'Checking session…'));
  try {
    const client = await getClient();
    if (!subscribed) {
      client.auth.onAuthStateChange((_event, current) => { sessionVersion++; draw(current); });
      subscribed = true;
    }
    const version = sessionVersion;
    const current = await session();
    // A newer sign-in/sign-out event must not be overwritten by an older read.
    if (version === sessionVersion) draw(current);
  } catch {
    account.removeAttribute('aria-busy');
    const retry = element('button', 'nav-logout', 'Retry account');
    retry.type = 'button';
    retry.title = 'Could not check your session. Retry to load Login or Logout.';
    retry.addEventListener('click', restoreAccount);
    account.replaceChildren(retry);
  }
}
if (isDemo) draw(null);
else await restoreAccount();
