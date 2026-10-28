import { request } from './booking-data.js';
import { isDemo } from './auth.js';
import { element } from './ui.js';
import { indianDisplay } from './booking-rules.js';

export function eligibleReview(booking, now = Date.now()) {
  return booking.status === 'confirmed' && new Date(booking.departure).getTime() <= now;
}
export function validateReview(rating, comment) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || [...comment.trim()].length < 10 || [...comment.trim()].length > 1000)
    throw new Error('Choose an integer rating from 1 to 5 and write 10–1000 characters after trimming.');
}
export const ratingLabel = summary => summary?.review_count > 0
  ? `${Number(summary.average_rating).toFixed(1)} / 5 · ${summary.review_count} reviews` : 'No reviews yet';

export async function showReviews(space, root) {
  root.replaceChildren(element('h2', '', 'Verified booking reviews'));
  const summary = element('p');
  const status = element('p', 'status'); status.setAttribute('role', 'status');
  const list = element('div', 'review-list');
  const refresh = element('button', 'secondary', 'Refresh reviews'); refresh.type = 'button';
  const more = element('button', 'secondary', 'Load more reviews'); more.type = 'button'; more.hidden = true;
  root.append(summary, status, list, refresh, more);
  if (isDemo) {
    summary.textContent = 'No reviews yet'; status.textContent = 'Reviews require Supabase and a completed reservation. Demo reviews are not invented or saved.';
    refresh.hidden = true; return;
  }
  let offset = 0, busy = false;
  async function load(reset) {
    if (busy) return;
    busy = true; refresh.disabled = more.disabled = true; status.textContent = 'Loading reviews…';
    try {
      // Refresh the average and page together after any edit/delete or explicit refresh.
      const [summaries, rows] = await Promise.all([
        request('rpc/rating_summaries', { p_space_ids: [space.id] }),
        request('rpc/public_space_reviews', { p_space_id: space.id, p_offset: reset ? 0 : offset })
      ]);
      summary.textContent = ratingLabel(summaries[0]);
      if (reset) { list.replaceChildren(); offset = 0; }
      for (const review of rows) {
        const card = element('article', 'review-card');
        card.append(element('h3', '', `${review.rating} / 5 · Verified booking`), element('p', '', review.comment),
          element('p', 'muted', `Updated ${indianDisplay(review.updated_at)}`));
        list.append(card); // textContent keeps stored user text inert, including HTML-like text.
      }
      offset += rows.length; more.hidden = rows.length < 20;
      status.textContent = !summaries.length ? 'This space is not publicly viewable. Reviews remain stored but are hidden from public reads.'
        : offset ? `${offset} reviews shown. Reviewers are publicly anonymous.` : 'No reviews yet.';
    } catch (error) { status.textContent = `${error.message} Use Refresh reviews to retry.`; }
    finally { busy = false; refresh.disabled = more.disabled = false; }
  }
  refresh.addEventListener('click', () => load(true)); more.addEventListener('click', () => load(false));
  await load(true);
}
