import { SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { configuration } from './data.js';
import { requireSession } from './auth.js';
import { validateProfile } from './profile-rules.js';

// Explicit REST fetch() for the signed-in user's own profile row. RLS limits every
// request to id = auth.uid(); the id filter below only makes the intent visible.
async function profileRequest(method, body) {
  const current = await requireSession();
  const url = new URL('/rest/v1/profiles', configuration());
  if (method !== 'POST') url.searchParams.set('id', `eq.${current.user.id}`);
  url.searchParams.set('select', 'id,full_name,phone,updated_at');
  let response;
  try {
    response = await fetch(url, { method, headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${current.access_token}`,
      'Content-Type': 'application/json', Prefer: 'return=representation'
    }, ...(body ? { body: JSON.stringify(method === 'POST' ? { ...body, id: current.user.id } : body) } : {}) });
  } catch { throw new Error('Network failure. Your profile was not confirmed as saved. Reload before retrying.'); }
  if (!response.ok) throw new Error(`Profile request failed (HTTP ${response.status}). Check your session and that migration 008 has been applied.`);
  let rows;
  try { rows = await response.json(); } catch { throw new Error('Invalid response from the profile service.'); }
  if (!Array.isArray(rows) || rows.some(row => row?.id !== current.user.id)) throw new Error('Unexpected profile response. Sign in again.');
  return rows;
}

export async function loadProfile() {
  return (await profileRequest('GET'))[0] || null;
}

export async function saveProfile(values) {
  const clean = validateProfile(values);
  // Accounts created before migration 008 are backfilled, but create the row if it is still missing.
  const updated = await profileRequest('PATCH', clean);
  return updated[0] || (await profileRequest('POST', clean))[0];
}
