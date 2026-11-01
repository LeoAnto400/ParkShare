import { request } from './booking-data.js';

// Owner-only extras that live outside the public listing row: private entry
// instructions and blocked periods. Reads use REST + RLS; writes use guarded RPCs.

export async function loadEntryInstructions(spaceId) {
  const rows = await request(`space_entry_instructions?${new URLSearchParams({ parking_space_id: `eq.${spaceId}`, select: 'instructions' })}`, null, true);
  if (!Array.isArray(rows)) throw new Error('Invalid entry instructions response.');
  return rows[0]?.instructions || '';
}
export function validateEntryInstructions(text) {
  const value = String(text ?? '').trim();
  if (value.length > 1000) throw new Error('Entry instructions can be at most 1000 characters.');
  return value;
}
// An empty value removes the instructions.
export const saveEntryInstructions = (spaceId, text) => request('rpc/set_space_entry_instructions',
  { p_space_id: spaceId, p_instructions: validateEntryInstructions(text) }, true);

export function validateBlock(startISO, endISO, reason, now = Date.now()) {
  const start = Date.parse(startISO), end = Date.parse(endISO);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('Choose an end time after the start time.');
  if (end <= now) throw new Error('A block must end in the future.');
  if (end - start > 366 * 24 * 3600000) throw new Error('A single block can cover at most one year.');
  const cleaned = String(reason ?? '').trim();
  if (cleaned.length > 200) throw new Error('Keep the private note to 200 characters or fewer.');
  return { p_starts_at: new Date(start).toISOString(), p_ends_at: new Date(end).toISOString(), p_reason: cleaned || null };
}
export async function loadBlocks(spaceId) {
  const params = new URLSearchParams({ parking_space_id: `eq.${spaceId}`, ends_at: `gt.${new Date().toISOString()}`,
    select: 'id,starts_at,ends_at,reason', order: 'starts_at.asc', limit: '200' });
  const rows = await request(`space_blocks?${params}`, null, true);
  if (!Array.isArray(rows)) throw new Error('Invalid blocked periods response.');
  return rows;
}
export const createBlock = (spaceId, startISO, endISO, reason) =>
  request('rpc/create_space_block', { p_space_id: spaceId, ...validateBlock(startISO, endISO, reason) }, true);
export const deleteBlock = id => request('rpc/delete_space_block', { p_block_id: id }, true);
