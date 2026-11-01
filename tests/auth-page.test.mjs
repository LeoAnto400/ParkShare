import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { authDestination } from '../js/booking-rules.js';
import { normalizePhone } from '../js/profile-rules.js';

const source = (await readFile(new URL('../js/auth-page.js', import.meta.url), 'utf8')).replace(/^import .*;$/gm, '');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function run(signup, result, phone = '+91 98765-43210') {
  let handler;
  const calls = [];
  const redirects = [];
  const status = { textContent: '' };
  const button = { disabled: false };
  const form = { querySelector: () => button, reportValidity: () => true,
    addEventListener: (_type, fn) => { handler = fn; }, elements: {} };
  const document = { body: { dataset: { page: signup ? 'signup' : 'login' } },
    querySelector: selector => selector === '#auth-form' ? form : status };
  class FormData {
    get(key) { return { email: 'student@example.com', password: 'test-only-password',
      'confirm-password': 'test-only-password', name: 'Student', phone }[key]; }
  }
  const client = { auth: {
    signUp: async payload => { calls.push({ method: 'signUp', payload }); return result; },
    signInWithPassword: async payload => { calls.push({ method: 'signInWithPassword', payload }); return result; }
  } };
  await new AsyncFunction('getClient', 'isDemo', 'session', 'document', 'window', 'FormData', 'authDestination', 'normalizePhone', source)(
    async () => client, false, async () => null, document,
    { location: { assign: url => redirects.push(url), replace: url => redirects.push(url) } }, FormData, authDestination, normalizePhone);
  await handler({ preventDefault() {} });
  return { calls, redirects, status, button };
}

test('password signup redirects with real session, without email redirect options', async () => {
  const state = await run(true, { data: { session: { access_token: 'fake-token', user: { id: 'test-user' } } }, error: null });
  assert.deepEqual(state.redirects, ['dashboard.html']);
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].method, 'signUp');
  assert.deepEqual(Object.keys(state.calls[0].payload.options), ['data']);
  assert.deepEqual(state.calls[0].payload.options.data, { name: 'Student', phone: '+919876543210' });
  assert.equal(state.button.disabled, false);
});
test('no-session signup explains manual configuration and does not resend or redirect', async () => {
  for (const session of [null, {}]) {
    const state = await run(true, { data: { session }, error: null });
    assert.deepEqual(state.redirects, []);
    assert.match(state.status.textContent, /disable.*Confirm email/);
    assert.equal(state.calls.length, 1);
    assert.equal(state.button.disabled, false);
  }
});
test('password login still redirects; errors remain visible', async () => {
  const state = await run(false, { data: { session: { access_token: 'fake-token', user: { id: 'test-user' } } }, error: null });
  assert.equal(state.calls[0].method, 'signInWithPassword');
  assert.deepEqual(state.redirects, ['dashboard.html']);
  const failed = await run(true, { data: {}, error: new Error('User already registered') });
  assert.equal(failed.status.textContent, 'User already registered');
  assert.deepEqual(failed.redirects, []);
});
test('signup rejects an invalid phone number before contacting the auth service', async () => {
  const state = await run(true, { data: { session: { access_token: 'fake-token', user: { id: 'test-user' } } }, error: null }, '12345');
  assert.equal(state.calls.length, 0);
  assert.deepEqual(state.redirects, []);
  assert.match(state.status.textContent, /10–15 digits/);
});
