import { protectPage } from './protected-page.js';
import { request } from './booking-data.js';
import { loadOwnedSpaces } from './owner-data.js';
import { element } from './ui.js';
import { indianDisplay, money } from './booking-rules.js';

const status = document.querySelector('#earnings-status');
const content = document.querySelector('#earnings-content');
const form = document.querySelector('#earnings-filter');
const totals = document.querySelector('#earnings-totals');
const table = document.querySelector('#earnings-rows');
const previous = document.querySelector('#earnings-previous');
const next = document.querySelector('#earnings-next');
let offset = 0, busy = false, filters = {};
async function load(newOffset) {
  if (busy) return;
  busy = true; form.querySelector('fieldset').disabled = true; previous.disabled = next.disabled = true;
  status.textContent = 'Loading demo earnings…';
  // Clear previous figures so a failed request cannot display stale totals under new filters.
  totals.replaceChildren(); table.replaceChildren();
  try {
    const result = await request('rpc/owner_earnings', { ...filters, p_offset: newOffset }, true);
    offset = newOffset;
    const t = result.totals;
    const metrics = [
      ['Completed owner earnings', t.completed_owner], ['Completed platform fees', t.completed_platform],
      ['Owner amount pending completion', t.pending_owner], ['Platform fees pending completion', t.pending_platform],
      ['Demo refunded driver total (excluded)', t.refunded_total], ['Refunded owner amount (excluded)', t.refunded_owner],
      ['Refunded platform fees (excluded)', t.refunded_platform], [`Other excluded driver totals (${t.excluded_count} unpaid/failed or other ineligible bookings)`, t.excluded_total]
    ];
    for (const [label, value] of metrics) {
      const card = element('div', 'metric'); card.append(element('dt', '', label), element('dd', '', money(value))); totals.append(card);
    }
    for (const b of result.rows) {
      const row = element('tr');
      for (const value of [b.id, indianDisplay(b.arrival), b.space_title, money(b.parking_subtotal), money(b.service_fee), money(b.total), b.payment_status, b.status, b.earnings_category])
        row.append(element('td', '', value));
      table.append(row);
    }
    status.textContent = t.booking_count ? `${t.booking_count} matching bookings. Showing ${offset + 1}–${offset + result.rows.length}. Calculated ${indianDisplay(result.as_of)}.` : 'No bookings match these arrival-date and listing filters.';
    previous.disabled = offset === 0; next.disabled = offset + result.rows.length >= t.booking_count;
  } catch (error) { status.textContent = `${error.message} Select Apply / refresh to retry.`; }
  finally { busy = false; form.querySelector('fieldset').disabled = false; }
}
form.addEventListener('submit', event => {
  event.preventDefault(); if (busy || !form.reportValidity()) return;
  const from = form.elements.from.value, to = form.elements.to.value;
  if (from && to && from > to) { status.textContent = 'Arrival start date must be on or before the end date.'; return; }
  // Send calendar dates, not browser-local Date conversions. SQL applies Asia/Kolkata.
  filters = { p_space_id: form.elements.space.value || null, p_from: from || null, p_to: to || null };
  load(0);
});
previous.addEventListener('click', () => load(Math.max(0, offset - 50)));
next.addEventListener('click', () => load(offset + 50));
try {
  const current = await protectPage('dashboard.html', status, content);
  if (current) {
    for (const space of await loadOwnedSpaces()) form.elements.space.append(new Option(space.title, space.id));
    content.hidden = false; await load(0);
  }
} catch (error) { status.textContent = `${error.message} Reload to retry.`; }
