import { protectPage } from './protected-page.js';
import { loadOwnedSpaces } from './owner-data.js';
import { element, parkingImage } from './ui.js';
import { scheduleView } from './schedule.js';
import { locationActions } from './location.js';
import { showReviews } from './reviews.js';
import { request } from './booking-data.js';
import { money, previewPrice } from './booking-rules.js';
import { indiaToday, monthRange } from './earning-periods.js';

const id = new URLSearchParams(location.search).get('id');
const status = document.querySelector('#owner-detail-status');
const detail = document.querySelector('#owner-detail');
const panels = document.querySelector('#owner-space-panels');
const form = document.querySelector('#period-form');
const periodStatus = document.querySelector('#period-status');
const results = document.querySelector('#period-results');
let ready = false, busy = false;
async function loadPeriods() {
  if (!ready || busy || !form.reportValidity()) return;
  busy = true; form.querySelector('button').disabled = true;
  results.replaceChildren(); periodStatus.textContent = 'Loading daily and monthly earnings…';
  try {
    const day = form.elements.day.value, month = form.elements.month.value;
    const range = monthRange(month);
    const reports = await Promise.all([
      request('rpc/owner_earnings', { p_space_id: id, p_from: day, p_to: day }, true),
      request('rpc/owner_earnings', { p_space_id: id, p_from: range.from, p_to: range.to }, true)
    ]);
    for (const [index, report] of reports.entries()) {
      const card = element('article', 'metric');
      card.append(element('h3', '', index === 0 ? `Daily · ${day}` : `Monthly · ${month}`));
      for (const [label, value] of [['Owner earnings',report.totals.completed_owner],['Platform fees on completed bookings',report.totals.completed_platform],
        ['Owner amount pending completion',report.totals.pending_owner],['Refunded driver total (excluded)',report.totals.refunded_total]])
        card.append(element('p', '', `${label}: ${money(value)}`));
      card.append(element('p', 'muted', `${report.totals.booking_count} reservations in this arrival-date period.`));
      results.append(card);
    }
    periodStatus.textContent = 'Amounts use stored booking prices. Unpaid, failed and cancelled bookings do not count as earnings.';
  } catch (error) { periodStatus.textContent = `${error.message} Use Update earnings to retry.`; }
  finally { busy = false; form.querySelector('button').disabled = false; }
}
form.addEventListener('submit', event => { event.preventDefault(); loadPeriods(); });
try {
  const current = await protectPage(`owner-space.html?${new URLSearchParams({ id: id || '' })}`, status, document.querySelector('#main'));
  if (current) {
    const space = (await loadOwnedSpaces()).find(space => space.id === id);
    if (!space) throw new Error('Space not found or you do not own it.');
    document.title = `${space.title} — Owner dashboard`;
    document.querySelector('h1').textContent = space.title;
    const price = previewPrice(space.hourly_price, 60);
    const edit = element('a', 'button', 'Edit this space');
    edit.href = `dashboard.html?${new URLSearchParams({ edit: id })}`;
    detail.append(edit, element('p', 'muted', `${space.published ? 'Published' : 'Draft'} · Reference: ${space.id}`));
    const gallery = element('div', 'gallery');
    gallery.append(...space.image_urls.map(src => parkingImage({ src, alt: 'Owner-provided parking photo' }, space.title)));
    detail.append(gallery, element('h2', '', 'Space details'), element('p', '', space.description),
      element('p', '', `${money(space.hourly_price)} / hour, platform fee included. Owner: ${money(price.parking_subtotal)} · Platform: ${money(price.service_fee)}.`),
      locationActions(space));
    for (const [heading, values] of [['Supported vehicles',space.supported_vehicles],['Amenities',space.amenities],['Parking rules',space.parking_rules]]) {
      const section = element('section'); section.append(element('h3', '', heading));
      const list = element('ul'); values.forEach(value => list.append(element('li', '', value)));
      section.append(values.length ? list : element('p', 'muted', 'None listed.')); detail.append(section);
    }
    detail.append(scheduleView(space.opening_schedule));
    const reviews = element('section'); detail.append(reviews);
    detail.hidden = panels.hidden = false; status.textContent = ''; ready = true;
    const today = indiaToday(); form.elements.day.value = today; form.elements.month.value = today.slice(0,7);
    await Promise.all([loadPeriods(), showReviews({ id }, reviews)]);
  }
} catch (error) {
  status.textContent = `${error.message} Return to Owner dashboard or reload to retry.`;
}
