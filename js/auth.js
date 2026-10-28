import { DATA_SOURCE, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { configuration } from './data.js';

export const isDemo = DATA_SOURCE === 'demo';
let clientPromise;
export async function getClient() {
  if (isDemo) throw new Error('Sign in and owner features require Supabase mode. Demo mode supports browsing only.');
  const url = configuration();
  // Load the official SDK only when needed; demo browsing has no CDN dependency.
  if (!clientPromise) {
    clientPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm')
      .then(({ createClient }) => createClient(url.href, SUPABASE_PUBLISHABLE_KEY,
        { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }))
      .catch(() => { clientPromise = null; throw new Error('Could not load the authentication SDK. Check your connection and reload.'); });
  }
  return clientPromise;
}

export async function session() {
  const client = await getClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error('Could not restore your session. Please sign in again.');
  return data.session;
}

export async function requireSession() {
  const current = await session();
  if (!current) throw new Error('Your session has expired. Please sign in again. Your form has not been cleared.');
  return current;
}
