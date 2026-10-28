import { SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { configuration } from './data.js';
import { requireSession, getClient } from './auth.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export function validatePhoto(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP photo. SVG is not allowed.');
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error('Photo size must be greater than zero and no more than 5 MiB.');
}
export function validateListing(row) {
  for (const field of ['title', 'description', 'locality', 'city', 'address']) {
    if (typeof row[field] !== 'string' || !row[field].trim()) throw new Error('Complete all required text fields.');
  }
  if (!Number.isFinite(row.hourly_price) || row.hourly_price < 0 || row.hourly_price > 999999.99
      || Math.abs(row.hourly_price * 100 - Math.round(row.hourly_price * 100)) > 0.00001) throw new Error('Enter a price from ₹0 to ₹999999.99 with at most two decimal places.');
  if (!Array.isArray(row.supported_vehicles) || !row.supported_vehicles.length || row.supported_vehicles.some(v => !['Car', 'Bike', 'SUV'].includes(v))) throw new Error('Select at least one supported vehicle.');
  for (const field of ['amenities', 'parking_rules']) {
    if (!Array.isArray(row[field]) || row[field].some(v => typeof v !== 'string' || !v.trim())) throw new Error('Amenities and rules must contain nonempty text.');
  }
}

// All listing operations remain visible fetch() AJAX, with SDK-managed access tokens.
async function request(method, id, body) {
  const current = await requireSession();
  const url = new URL('/rest/v1/parking_spaces', configuration());
  url.searchParams.set('owner_id', `eq.${current.user.id}`);
  if (id) url.searchParams.set('id', `eq.${id}`);
  if (method === 'GET') url.searchParams.set('order', 'created_at.desc');
  let response;
  try {
    response = await fetch(url, { method, headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${current.access_token}`,
      'Content-Type': 'application/json', Prefer: 'return=representation'
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
  } catch { throw new Error('Network failure. Your changes were not confirmed. Reload your listings before retrying a save.'); }
  if (!response.ok) {
    if (method === 'DELETE' && response.status === 409) throw new Error('This listing has booking history and cannot be deleted. Unpublish it to stop new reservations; existing bookings are retained.');
    throw new Error(`Listing request failed (HTTP ${response.status}). Check your session and run the required migrations in the new project.`);
  }
  let rows;
  try { rows = await response.json(); } catch { throw new Error('Invalid response from the listing service. Refresh before retrying.'); }
  if (!Array.isArray(rows) || rows.some(row => !row || row.owner_id !== current.user.id)) throw new Error('Unexpected listing response. Refresh and sign in again.');
  for (const row of rows) {
    validateListing(row);
    if (typeof row.id !== 'string' || typeof row.published !== 'boolean' || !Array.isArray(row.image_urls)
        || !row.image_urls.length || row.image_urls.some(url => typeof url !== 'string' || !url.startsWith('https://'))) {
      throw new Error('The service returned an invalid listing. Check its required fields.');
    }
  }
  if (method !== 'GET' && rows.length !== 1) throw new Error('No listing changed. It may have been deleted or you may not own it.');
  return rows;
}
export const loadOwnedSpaces = () => request('GET');
export const updateOwnedSpace = (id, body) => request('PATCH', id, body);
export const deleteOwnedSpace = id => request('DELETE', id);
export async function createOwnedSpace(id, body) {
  const current = await requireSession();
  return request('POST', null, { ...body, id, owner_id: current.user.id, featured: false });
}
export async function uploadPhoto(file) {
  validatePhoto(file);
  const current = await requireSession();
  const client = await getClient();
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
  const path = `${current.user.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage.from('parking-images').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error('Photo upload failed. Check the 5 MiB limit, file type, and Storage policies. Nothing was saved to the listing.');
  return client.storage.from('parking-images').getPublicUrl(path).data.publicUrl;
}
