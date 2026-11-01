// Pure validation shared by signup and the Profile page. The database repeats
// the same phone check (profiles_phone_check), so this is for instant feedback only.
export function normalizePhone(value) {
  const phone = String(value ?? '').replace(/[\s()-]/g, '');
  if (!/^\+?[0-9]{10,15}$/.test(phone)) {
    throw new Error('Enter a phone number of 10–15 digits, optionally starting with + (for example +919876543210).');
  }
  return phone;
}

export function validateProfile(values) {
  const fullName = String(values.full_name ?? '').trim();
  if (!fullName || fullName.length > 100) throw new Error('Enter your name (1–100 characters).');
  return { full_name: fullName, phone: normalizePhone(values.phone) };
}
