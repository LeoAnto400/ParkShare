import { element } from './ui.js';

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const defaultSchedule = () => ({ mode: 'daily', days: DAYS.map(() => ({ open: '00:00', close: '00:00' })) });
export function validateSchedule(schedule) {
  if (!schedule || !['daily', 'custom'].includes(schedule.mode) || !Array.isArray(schedule.days) || schedule.days.length !== 7 || !schedule.days.some(Boolean))
    throw new Error('Choose at least one open day and a valid weekly schedule.');
  let daily;
  for (const day of schedule.days) {
    if (day === null) continue;
    if (!day || !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.open) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.close)) throw new Error('Enter opening and closing times for each open day.');
    if (day.close !== '00:00' && day.close <= day.open) throw new Error('Closing time must follow opening time. Use 00:00 for midnight at the end of the day. Split overnight hours across two days.');
    const pair = `${day.open}-${day.close}`;
    if (schedule.mode === 'daily' && daily && daily !== pair) throw new Error('Daily mode must use the same hours on every selected day.');
    daily = pair;
  }
  return schedule;
}
export function scheduleView(schedule = defaultSchedule()) {
  validateSchedule(schedule);
  const section = element('section');
  section.append(element('h2', '', 'Opening hours (Asia/Kolkata)'));
  const list = element('ul');
  schedule.days.forEach((hours, i) => list.append(element('li', '', `${DAYS[i]}: ${hours ? hours.open === '00:00' && hours.close === '00:00' ? 'Open 24 hours' : `${hours.open}–${hours.close === '00:00' ? 'midnight' : hours.close}` : 'Closed'}`)));
  section.append(list);
  return section;
}

export function scheduleEditor(root) {
  const mode = root.querySelector('[name=schedule_mode]');
  const common = root.querySelector('[data-common-hours]');
  const days = root.querySelector('[data-schedule-days]');
  const rows = DAYS.map((day, i) => {
    const row = element('div', 'schedule-row');
    const label = element('label', 'checkbox');
    const enabled = element('input'); enabled.type = 'checkbox'; enabled.name = `day_${i}`;
    label.append(enabled, document.createTextNode(day));
    const inputs = ['open', 'close'].map(kind => {
      const label = element('label', 'schedule-time', `${kind === 'open' ? 'Opens' : 'Closes'} `);
      const input = element('input'); input.type = 'time'; input.step = '60'; input.value = kind === 'open' ? '09:00' : '18:00';
      input.setAttribute('aria-label', `${day} ${kind === 'open' ? 'opening' : 'closing'} time`);
      label.append(input); row.append(label); return input;
    });
    row.prepend(label); days.append(row);
    enabled.addEventListener('change', refresh);
    return { enabled, inputs, row };
  });
  function refresh() {
    common.hidden = mode.value !== 'daily';
    rows.forEach(({ enabled, inputs }) => inputs.forEach(input => {
      input.parentElement.hidden = mode.value === 'daily'; input.disabled = mode.value === 'daily' || !enabled.checked;
      input.required = mode.value === 'custom' && enabled.checked;
    }));
    common.querySelectorAll('input').forEach(input => { input.disabled = mode.value !== 'daily'; input.required = mode.value === 'daily'; });
  }
  mode.addEventListener('change', refresh);
  return {
    set(schedule = defaultSchedule()) {
      mode.value = schedule.mode;
      const first = schedule.days.find(Boolean) || { open: '09:00', close: '18:00' };
      root.querySelector('[name=daily_open]').value = first.open;
      root.querySelector('[name=daily_close]').value = first.close;
      rows.forEach(({ enabled, inputs }, i) => {
        enabled.checked = !!schedule.days[i];
        inputs[0].value = schedule.days[i]?.open || first.open; inputs[1].value = schedule.days[i]?.close || first.close;
      }); refresh();
    },
    get() {
      return validateSchedule({ mode: mode.value, days: rows.map(({ enabled, inputs }) => !enabled.checked ? null : {
        open: mode.value === 'daily' ? root.querySelector('[name=daily_open]').value : inputs[0].value,
        close: mode.value === 'daily' ? root.querySelector('[name=daily_close]').value : inputs[1].value
      }) });
    }
  };
}
