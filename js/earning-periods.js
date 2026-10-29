export function indiaToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function monthRange(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0,4)) < 1000) throw new Error('Choose a valid month.');
  const [year, number] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, number, 0)).getUTCDate();
  // Send calendar strings; the protected SQL function applies India midnight boundaries.
  return { from: `${month}-01`, to: `${month}-${lastDay}` };
}
