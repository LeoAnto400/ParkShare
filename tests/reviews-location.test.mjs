import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { coordinates, mapLinks, fullAddress, locationActions } from '../js/location.js';

const source = (await readFile(new URL('../js/reviews.js', import.meta.url), 'utf8')).replace(/^import .*;$/gm, '');
const reviews = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
test('review eligibility at exact end, cancellation and trimmed validation', () => {
  const b = { status: 'confirmed', departure: '2030-01-01T00:00:00Z' };
  const end = Date.parse(b.departure);
  assert.equal(reviews.eligibleReview(b, end - 1), false);
  assert.equal(reviews.eligibleReview(b, end), true);
  assert.equal(reviews.eligibleReview({ ...b, status: 'cancelled' }, end), false);
  for (const rating of [0, 6, 2.5, NaN]) assert.throws(() => reviews.validateReview(rating, 'A useful parking review'));
  for (const comment of ['          ', '123456789', 'a'.repeat(1001)]) assert.throws(() => reviews.validateReview(5, comment));
  assert.doesNotThrow(() => reviews.validateReview(4, '  Convenient parking entrance.  '));
  assert.equal(reviews.ratingLabel({ review_count: 0 }), 'No reviews yet');
});
test('coordinates enforce pairs, finite ranges, and zero coordinates', () => {
  assert.deepEqual(coordinates('', ''), { latitude: null, longitude: null });
  assert.deepEqual(coordinates(0, 0), { latitude: 0, longitude: 0 });
  assert.deepEqual(coordinates('-90', '180'), { latitude: -90, longitude: 180 });
  for (const pair of [[1, ''], ['', 2], [91, 20], [20, -181], [Infinity, 0], ['no', '20']]) assert.throws(() => coordinates(...pair));
});
test('Google links use structured destination encoding and no fabricated origin', () => {
  const place = { address: 'A & B #4 / entrance', locality: 'ಮಣಿಪಾಲ', city: 'Udupi' };
  const links = mapLinks(place);
  const url = new URL(links.directions);
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.searchParams.get('destination'), fullAddress(place));
  assert.equal(url.searchParams.get('origin'), null);
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(fullAddress({address:'Entrance, Manipal, Udupi',locality:'Manipal',city:'Udupi'}),'Entrance, Manipal, Udupi');
  assert.equal(new URL(mapLinks({ ...place, latitude: 0, longitude: 0 }).map).searchParams.get('query'), '0,0');
});
test('copy-address success, denied clipboard fallback and safe external links', async () => {
  const oldDocument = globalThis.document;
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  globalThis.document = { createElement: tag => ({ tag, children: [], events: {}, attrs: {},
    append(...children) { this.children.push(...children); },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, fn) { this.events[k] = fn; },
    focus() { this.focused = true; }, select() { this.selected = true; }
  }) };
  let copied;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async value => { copied = value; } } } });
  try {
    const root = locationActions({ address: 'Entrance 1', locality: 'Manipal', city: 'Udupi' });
    const button = root.children.find(c => c.tag === 'button');
    const fallback = root.children.find(c => c.tag === 'textarea');
    for (const link of root.children.filter(c => c.tag === 'a')) {
      assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener noreferrer');
    }
    await button.events.click(); assert.equal(copied, 'Entrance 1, Manipal, Udupi'); assert.equal(fallback.hidden, true);
    navigator.clipboard.writeText = async () => { throw new Error('denied'); };
    await button.events.click(); assert.equal(fallback.hidden, false); assert.equal(fallback.selected, true);
    delete navigator.clipboard;
    await button.events.click(); assert.equal(fallback.focused, true);
  } finally {
    globalThis.document = oldDocument;
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator;
  }
});
