import { element } from './ui.js';
import { defaultSchedule } from './schedule.js';

// India has a fixed UTC+05:30 offset (no daylight saving), so plain arithmetic is exact.
const IST_OFFSET = 330 * 60000;
const DAY = 24 * 60 * 60000;
export const istDate = ms => new Date(ms + IST_OFFSET).toISOString().slice(0, 10);
export const istTime = ms => new Date(ms + IST_OFFSET).toISOString().slice(11, 16);
export const dayStart = date => Date.parse(`${date}T00:00:00+05:30`);
const minutes = hhmm => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
// Monday = 0 … Sunday = 6, matching opening_schedule.days and PostgreSQL isodow - 1.
const weekdayIndex = date => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

/** Opening window for one IST calendar day, or null when the space is closed. */
export function dayWindow(schedule, date) {
  const hours = (schedule || defaultSchedule()).days[weekdayIndex(date)];
  if (!hours) return null;
  const start = dayStart(date);
  return { start: start + minutes(hours.open) * 60000,
    end: hours.close === '00:00' ? start + DAY : start + minutes(hours.close) * 60000 };
}

/**
 * Browser mirror of PostgreSQL require_opening_hours: every IST day the
 * half-open interval [start, end) touches must be open for the touched part.
 * Used for previews and demo-mode filtering; the database stays authoritative.
 */
export function fitsSchedule(schedule, startMs, endMs) {
  if (!(endMs > startMs)) return false;
  for (let date = istDate(startMs); date <= istDate(endMs - 1); date = istDate(dayStart(date) + DAY)) {
    const window = dayWindow(schedule, date);
    if (!window) return false;
    const from = Math.max(startMs, dayStart(date)), to = Math.min(endMs, dayStart(date) + DAY);
    if (from < window.start || to > window.end) return false;
  }
  return true;
}

/** Booked/blocked ranges that still matter: anything that has already ended no longer makes the space unavailable. */
export function upcomingBusy(busy, now = Date.now()) {
  return busy.filter(taken => taken.end > now);
}

/** Free ranges inside one day's opening window after removing busy intervals and the past. */
export function freeSlots(schedule, busy, date, now = Date.now()) {
  const window = dayWindow(schedule, date);
  if (!window) return [];
  let slots = [{ start: Math.max(window.start, now), end: window.end }].filter(s => s.end > s.start);
  for (const taken of [...busy].sort((a, b) => a.start - b.start)) {
    slots = slots.flatMap(slot => {
      if (taken.end <= slot.start || taken.start >= slot.end) return [slot];
      return [{ start: slot.start, end: taken.start }, { start: taken.end, end: slot.end }].filter(s => s.end > s.start);
    });
  }
  return slots;
}

function rangeLabel(range, date) {
  const end = range.end >= dayStart(date) + DAY ? 'midnight' : istTime(range.end);
  return `${istTime(Math.max(range.start, dayStart(date)))}–${end}`;
}

/**
 * Next-N-days availability list. `busy` items are { start, end, kind } in ms;
 * kind is 'booked' or 'blocked'. Pass verified=false when busy data is unknown (demo mode).
 */
export function availabilityView(schedule, busy, { days = 7, now = Date.now(), verified = true } = {}) {
  const section = element('section', 'availability');
  section.append(element('h2', '', `Availability — next ${days} days (IST)`));
  if (!verified) section.append(element('p', 'demo-note', 'Opening hours only. Existing bookings are not checked in demo mode.'));
  const list = element('ul', 'availability-list');
  let date = istDate(now);
  for (let i = 0; i < days; i++, date = istDate(dayStart(date) + DAY)) {
    const label = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(dayStart(date) + 12 * 3600000));
    const item = element('li');
    item.append(element('strong', '', label));
    const window = dayWindow(schedule, date);
    const chips = element('div', 'chips');
    if (!window) chips.append(element('span', 'chip slot-closed', 'Closed'));
    else {
      const today = busy.filter(b => b.start < dayStart(date) + DAY && b.end > dayStart(date));
      // Start today's free time at the next quarter hour so labels read 12:30, not 12:26.
      const free = freeSlots(schedule, today, date, Math.ceil(now / 900000) * 900000);
      if (!free.length) chips.append(element('span', 'chip slot-closed', 'No free time left'));
      free.forEach(slot => chips.append(element('span', 'chip slot-free', `Free ${rangeLabel(slot, date)}`)));
      upcomingBusy(today, now).forEach(taken => chips.append(element('span', 'chip slot-taken',
        `Unavailable ${rangeLabel(taken, date)} · ${taken.kind === 'blocked' ? 'owner blocked' : 'booked'}`)));
    }
    item.append(chips);
    list.append(item);
  }
  section.append(list);
  return section;
}
