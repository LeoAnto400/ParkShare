import { element } from './ui.js';

export function coordinates(latitude, longitude) {
  const empty = value => value === null || value === undefined || String(value).trim() === '';
  if (empty(latitude) && empty(longitude)) return { latitude: null, longitude: null };
  if (empty(latitude) || empty(longitude)) throw new Error('Enter both latitude and longitude, or leave both empty.');
  const lat = Number(latitude), lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    throw new Error('Latitude must be −90 to 90 and longitude −180 to 180.');
  return { latitude: lat, longitude: lng };
}
export function fullAddress(location) {
  const parts = (location.address || '').split(',').map(part => part.trim()).filter(Boolean);
  for (const value of [location.locality, location.city]) {
    if (value && !parts.some(part => part.toLowerCase() === value.trim().toLowerCase())) parts.push(value.trim());
  }
  return parts.join(', ');
}
export function mapLinks(location) {
  const { latitude, longitude } = coordinates(location.latitude, location.longitude);
  const destination = latitude === null ? fullAddress(location) : `${latitude},${longitude}`;
  // Fixed Google host + encoded structured data; owners cannot inject a link or origin.
  return {
    directions: `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination })}`,
    map: `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: destination })}`
  };
}
export function locationActions(location) {
  const root = element('div', 'location-actions');
  root.append(element('p', '', fullAddress(location)));
  try {
    const links = mapLinks(location);
    for (const [key, label] of [['directions', 'Get directions'], ['map', 'Open in Google Maps']]) {
      const link = element('a', 'button secondary', label);
      link.href = links[key]; link.target = '_blank'; link.rel = 'noopener noreferrer';
      root.append(link);
    }
  } catch { root.append(element('p', 'muted', 'Invalid coordinates. Ask the owner to correct this location.')); }
  const copy = element('button', 'secondary', 'Copy address'); copy.type = 'button';
  const feedback = element('p', 'muted'); feedback.setAttribute('role', 'status');
  const fallback = element('textarea'); fallback.readOnly = true; fallback.hidden = true;
  fallback.value = fullAddress(location); fallback.setAttribute('aria-label', 'Address to copy manually');
  copy.addEventListener('click', async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(fullAddress(location));
      fallback.hidden = true; feedback.textContent = 'Address copied.';
    } catch {
      feedback.textContent = 'Automatic copy was unavailable or denied. Copy the selected address using Ctrl+C, ⌘C, or your device’s Copy action.';
      fallback.hidden = false; fallback.focus(); fallback.select();
    }
  });
  root.append(copy, feedback, fallback);
  return root;
}
