// Node's built-in test runner only; no dependency and no real network requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dataURL = new URL('../js/data.js', import.meta.url);
const source = await readFile(dataURL, 'utf8');
const samples = JSON.parse(await readFile(new URL('../data/spaces.json', import.meta.url), 'utf8'));
let version = 0;
async function moduleFor(mode = 'demo', url = 'https://newparksharetest.supabase.co', key = 'sb_publishable_testonly') {
  const code = source.replace(/^import .*config.js';/m,
    `const DATA_SOURCE=${JSON.stringify(mode)}, SUPABASE_URL=${JSON.stringify(url)}, SUPABASE_PUBLISHABLE_KEY=${JSON.stringify(key)};`)
    .replaceAll('import.meta.url', JSON.stringify(dataURL.href));
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${version++}`);
}
function row(s) {
  return { ...s, hourly_price: s.price, supported_vehicles: s.vehicles,
    parking_rules: s.rules, image_urls: s.photos.map(p => p.src), published: true };
}
test('data module: demo, REST, validation, and failure behavior', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let payload = samples;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: new URL(url), options });
    return { ok: true, json: async () => payload };
  };
  try {
    const demo = await moduleFor();
    assert.equal((await demo.loadSpaces()).length, 8);
    assert.equal(calls.at(-1).url.pathname.endsWith('/data/spaces.json'), true);
    assert.equal((await demo.loadSpace('pn-001')).title, samples[0].title);
    assert.equal(await demo.loadSpace('unknown'), null);
    const before = calls.length;
    assert.equal(await demo.loadSpace('bad&filter'), null);
    assert.equal(calls.length, before);

    for (const args of [['wrong'], ['supabase', 'https://YOUR_NEW_PARKSHARE_PROJECT_REF.supabase.co'],
      ['supabase', 'https://newparksharetest.supabase.co', 'YOUR_NEW_PARKSHARE_PUBLISHABLE_KEY'],
      ['supabase', 'https://newparksharetest.supabase.co', 'sb_secret_testonly'],
      ['supabase', 'http://newparksharetest.supabase.co']]) {
      const invalid = await moduleFor(...args);
      await assert.rejects(invalid.loadSpaces());
    }
    assert.equal(calls.length, before, 'invalid configuration must not fetch');

    const remote = await moduleFor('supabase');
    payload = samples.map(row);
    assert.deepEqual((await remote.loadSpaces()).map(s => s.price), samples.map(s => s.price));
    const request = calls.at(-1);
    assert.equal(request.url.hostname, 'newparksharetest.supabase.co');
    assert.equal(request.url.searchParams.get('published'), 'eq.true');
    assert.equal(request.options.headers.apikey, 'sb_publishable_testonly');
    assert.equal(request.options.headers.Authorization, undefined);
    payload = [row(samples[0])];
    assert.equal((await remote.loadSpace('pn-001')).id, 'pn-001');
    assert.equal(calls.at(-1).url.searchParams.get('id'), 'eq.pn-001');
    assert.equal(calls.at(-1).url.searchParams.get('limit'), '1');
    payload = [];
    assert.deepEqual(await remote.loadSpaces(), []);
    assert.equal(await remote.loadSpace('missing'), null);
    for (const bad of [{}, [null], [{ ...row(samples[0]), published: false }],
      [{ ...row(samples[0]), hourly_price: -1 }], [{ ...row(samples[0]), image_urls: [] }]]) {
      payload = bad;
      await assert.rejects(remote.loadSpaces());
    }
    globalThis.fetch = async () => ({ ok: false, status: 403 });
    await assert.rejects(remote.loadSpaces(), /HTTP 403/);
    globalThis.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(remote.loadSpaces(), /Network request failed/);
    globalThis.fetch = async () => ({ ok: true, json: async () => { throw new Error('bad JSON'); } });
    await assert.rejects(remote.loadSpaces(), /invalid JSON/);
  } finally { globalThis.fetch = originalFetch; }
});
