import { request } from './booking-data.js';
import { indiaToday } from './earning-periods.js';
import { element } from './ui.js';
import { money } from './booking-rules.js';

export function groupCardEarnings(rows, day) {
  const result = new Map();
  for (const row of rows) {
    // The protected RPC determines eligibility using paid receipts and database time.
    if (row.earnings_category !== 'completed') continue;
    const amount = Math.round(Number(row.parking_subtotal) * 100);
    const arrivalDay = indiaToday(new Date(row.arrival));
    const totals = result.get(row.parking_space_id) || { total: 0, daily: 0, monthly: 0 };
    totals.total += amount;
    if (arrivalDay === day) totals.daily += amount;
    if (arrivalDay.slice(0, 7) === day.slice(0, 7)) totals.monthly += amount;
    result.set(row.parking_space_id, totals);
  }
  return result;
}

export async function loadCardEarnings() {
  const rows = [];
  let asOf;
  // Read the protected breakdown in pages once for all cards, not per listing.
  for (let offset = 0; ; offset += 50) {
    const page = await request('rpc/owner_earnings', { p_offset: offset }, true);
    if (!Array.isArray(page?.rows) || !page.as_of) throw new Error('Invalid earnings response.');
    asOf ||= page.as_of;
    rows.push(...page.rows);
    if (page.rows.length < 50) break;
  }
  const day = indiaToday(new Date(asOf));
  return { day, totals: groupCardEarnings(rows, day) };
}

export function accountEarningsTotals(totalsBySpace) {
  const result = { total: 0, daily: 0, monthly: 0 };
  // Values are already integer paise from owner-authorized booking records.
  for (const totals of totalsBySpace.values()) {
    for (const key of ['total', 'daily', 'monthly']) result[key] += totals[key];
  }
  return result;
}

export function cardEarningsView(report, spaceId, account = false) {
  const section = element('section', account ? 'account-earnings card-earnings' : 'card-earnings');
  section.append(element(account ? 'h2' : 'h3', '', account ? 'Account earnings' : 'Earnings'));
  if (account) section.append(element('p', 'muted', 'Combined owner earnings across all your parking spaces, including unpublished spaces.'));
  if (!report) {
    section.append(element('p', 'muted', 'Earnings unavailable. Use Refresh listings to retry.'));
    return section;
  }
  const totals = account ? accountEarningsTotals(report.totals) : report.totals.get(spaceId) || { total: 0, daily: 0, monthly: 0 };
  const list = element('dl', 'card-earnings-grid');
  for (const [label, value] of [['Total earnings', totals.total], ['Daily earnings (today)', totals.daily], ['Monthly earnings (this month)', totals.monthly]]) {
    const item = element('div');
    item.append(element('dt', '', label), element('dd', '', money(value / 100)));
    list.append(item);
  }
  section.append(list, element('p', 'muted', `Completed demo-paid owner amounts. Arrival dates in Asia/Kolkata; today is ${report.day}. Refresh listings for updates.`),
    element('p', 'muted', 'Demo payment — no real money is collected.'));
  return section;
}
