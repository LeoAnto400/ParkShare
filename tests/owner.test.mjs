import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// No real credentials or requests: replace imports with a fake SDK/session boundary.
const source = (await readFile(new URL('../js/owner-data.js', import.meta.url), 'utf8'))
  .replace(/^import .*;$/gm, '');
const prefix = `
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_fake';
const configuration=()=>new URL('https://testnewproject.supabase.co');
const requireSession=async()=>globalThis.ownerTestSession;
const getClient=async()=>globalThis.ownerTestClient;
`;
const api = await import('data:text/javascript;base64,' + Buffer.from(prefix + source).toString('base64'));
const row = { id: 'test-id', owner_id: 'user-a', title: 'Parking', description: 'A space',
  locality: 'Manipal', city: 'Manipal', address: 'Test address', hourly_price: 20,
  supported_vehicles: ['Car'], amenities: [], parking_rules: [], published: false,
  image_urls: ['https://example.com/photo.jpg'] };

test('owner validation, authenticated AJAX, denied mutations, and uploads', async () => {
  const original = globalThis.fetch;
  globalThis.ownerTestSession = { user: { id: 'user-a' }, access_token: 'fake-access-token' };
  const calls = [];
  let responseRows = [row];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: new URL(url), options });
    return { ok: true, json: async () => responseRows };
  };
  try {
    api.validateListing(row);
    for (const patch of [{ title: ' ' }, { hourly_price: -1 }, { hourly_price: 1.001 }, { hourly_price: 1000000 }, { supported_vehicles: [] }]) {
      assert.throws(() => api.validateListing({ ...row, ...patch }));
    }
    for (const file of [{ type: 'image/svg+xml', size: 50 }, { type: 'image/png', size: 5242881 }, { type: 'image/jpeg', size: 0 }]) assert.throws(() => api.validatePhoto(file));
    api.validatePhoto({ type: 'image/webp', size: 5242880 });
    assert.equal((await api.loadOwnedSpaces()).length, 1);
    assert.equal(calls.at(-1).url.searchParams.get('owner_id'), 'eq.user-a');
    assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer fake-access-token');
    assert.equal(calls.at(-1).options.headers.apikey, 'sb_publishable_fake');
    await api.createOwnedSpace('test-id', row);
    assert.equal(JSON.parse(calls.at(-1).options.body).owner_id, 'user-a');
    await api.updateOwnedSpace('test-id', { published: true });
    assert.equal(calls.at(-1).options.method, 'PATCH');
    await api.deleteOwnedSpace('test-id');
    assert.equal(calls.at(-1).options.method, 'DELETE');
    responseRows = [];
    await assert.rejects(api.updateOwnedSpace('other-owner-id', { published: true }), /No listing changed/);
    responseRows = [{ ...row, owner_id: 'user-b' }];
    await assert.rejects(api.loadOwnedSpaces(), /Unexpected listing response/);
    let uploadPath;
    globalThis.ownerTestClient = { storage: { from: bucket => {
      assert.equal(bucket, 'parking-images');
      return { upload: async (path, file, options) => {
        uploadPath = path; assert.equal(options.upsert, false); return { error: null };
      }, getPublicUrl: path => ({ data: { publicUrl: `https://example.com/${path}` } }) };
    } } };
    await api.uploadPhoto({ type: 'image/png', size: 100 });
    assert.match(uploadPath, /^user-a\/[a-z0-9-]+\.png$/);
    globalThis.ownerTestClient.storage.from = () => ({ upload: async () => ({ error: new Error('denied') }) });
    await assert.rejects(api.uploadPhoto({ type: 'image/png', size: 100 }), /Photo upload failed/);
  } finally {
    globalThis.fetch = original;
    delete globalThis.ownerTestSession;
    delete globalThis.ownerTestClient;
  }
});
