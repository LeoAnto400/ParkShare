import { DATA_SOURCE, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

export function configuration() {
  if (!['demo', 'supabase'].includes(DATA_SOURCE)) throw new Error('Set DATA_SOURCE to demo or supabase in js/config.js.');
  if (DATA_SOURCE === 'demo') return null;
  let url;
  try { url = new URL(SUPABASE_URL); } catch { /* Explained below. */ }
  if (!url || url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname)
      || url.username || url.password || url.search || url.hash || url.port || url.pathname !== '/') {
    throw new Error('Configure the NEW ParkShare project URL in js/config.js. See SUPABASE_SETUP.md.');
  }
  // Only modern browser-safe keys; never secret keys or legacy JWT keys.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error('Set the NEW project’s browser-safe sb_publishable_ key in js/config.js. Never use a secret key or database password.');
  }
  return url;
}

async function requestJSON(url, options = {}) {
  let response;
  try { response = await fetch(url, options); } catch {
    throw new Error('Network request failed. Check your connection, local HTTP server, and NEW project URL in js/config.js.');
  }
  if (!response.ok) {
    // Do not display response bodies or configuration values that may contain secrets.
    throw new Error(`Could not load listings (HTTP ${response.status}). Check the source, publishable key, table grants and RLS. See SUPABASE_SETUP.md.`);
  }
  try { return await response.json(); } catch {
    throw new Error('The data source returned invalid JSON. Check the JSON file or REST endpoint.');
  }
}

const text = value => typeof value === 'string' && value.trim().length > 0;
const texts = value => Array.isArray(value) && value.every(text);
function validate(space) {
  const valid = space && ['id', 'title', 'description', 'locality', 'city', 'address'].every(key => text(space[key]))
    && /^[a-z0-9-]+$/.test(space.id)
    && typeof space.price === 'number' && Number.isFinite(space.price) && space.price >= 0
    && texts(space.vehicles) && space.vehicles.length > 0 && space.vehicles.every(v => ['Car', 'Bike', 'SUV'].includes(v))
    && texts(space.amenities) && texts(space.rules) && typeof space.featured === 'boolean'
    && Array.isArray(space.photos) && space.photos.length > 0
    && space.photos.every(photo => photo && text(photo.src) && /^https:\/\//.test(photo.src) && text(photo.alt));
  if (!valid) throw new Error('A parking listing contains invalid or missing fields. Check the sample data or database schema.');
  return space;
}

// Map database columns once, keeping the existing page scripts independent of SQL.
function mapRow(row) {
  if (!row || row.published !== true || !Array.isArray(row.image_urls)) throw new Error('The database returned an invalid or unpublished listing.');
  return {
    id: row.id, title: row.title, description: row.description,
    locality: row.locality, city: row.city, address: row.address,
    latitude: row.latitude ?? null, longitude: row.longitude ?? null,
    openingSchedule: row.opening_schedule,
    ownerId: row.owner_id || null, price: row.hourly_price, vehicles: row.supported_vehicles,
    amenities: row.amenities, rules: row.parking_rules, featured: row.featured,
    photos: row.image_urls.map(src => ({ src, alt: row.owner_id ? 'Owner-provided parking photo' : 'Illustrative sample photo, not the actual property' }))
  };
}

async function readSpaces(id) {
  const base = configuration(); // Validate before any request. Never silently switch modes.
  let data;
  if (!base) {
    data = await requestJSON(new URL('../data/spaces.json', import.meta.url));
  } else {
    const url = new URL('/rest/v1/parking_spaces', base);
    url.searchParams.set('select', '*');
    url.searchParams.set('published', 'eq.true');
    url.searchParams.set('order', 'id.asc');
    if (id !== undefined) {
      url.searchParams.set('id', `eq.${id}`);
      url.searchParams.set('limit', '1');
    }
    // Publishable keys belong in apikey, not a Bearer JWT header. RLS enforces access.
    data = await requestJSON(url, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } });
  }
  if (!Array.isArray(data)) throw new Error('Expected a list of parking spaces from the data source.');
  const spaces = data.map(item => validate(base ? mapRow(item) : item));
  if (new Set(spaces.map(space => space.id)).size !== spaces.length) throw new Error('Listing IDs must be unique.');
  // Batch rating reads in groups of 100, never one AJAX request per card.
  if (base) {
    try {
      for (let offset = 0; offset < spaces.length; offset += 100) {
        const chunk = spaces.slice(offset, offset + 100);
        const ratings = await requestJSON(new URL('/rest/v1/rpc/rating_summaries', base), {
          method: 'POST', headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_space_ids: chunk.map(space => space.id) })
        });
        if (!Array.isArray(ratings) || ratings.some(r => !Number.isInteger(r.review_count) || r.review_count < 0)) throw new Error('Invalid ratings response');
        const byId = new Map(ratings.map(r => [r.space_id, r]));
        chunk.forEach(space => { space.rating = byId.get(space.id); });
      }
    } catch {
      // A reviews outage must not hide listings or masquerade as zero reviews.
      spaces.forEach(space => { space.ratingsUnavailable = true; });
    }
  }
  return id === undefined ? spaces : spaces.filter(space => space.id === id);
}

export async function loadSpaces() { return readSpaces(); }
export async function loadSpace(id) {
  if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) return null;
  const spaces = await readSpaces(id);
  return spaces[0] || null;
}
