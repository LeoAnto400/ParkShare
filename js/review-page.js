import { protectPage } from './protected-page.js';
import { getBooking, request } from './booking-data.js';
import { eligibleReview, validateReview, showReviews } from './reviews.js';

const id = new URLSearchParams(location.search).get('booking');
const status = document.querySelector('#review-status');
const content = document.querySelector('#review-content');
const form = document.querySelector('#review-form');
const remove = document.querySelector('#delete-review');
let busy = false;
function setBusy(value) { busy = value; form.querySelector('fieldset').disabled = value; remove.disabled = value; }
try {
  const current = await protectPage(`review.html?${new URLSearchParams({ booking: id || '' })}`, status, content);
  if (current) {
    const booking = await getBooking(id);
    if (booking.driver_id !== current.user.id || !eligibleReview(booking)) throw new Error('Only the driver of a completed, confirmed reservation can review it.');
    document.querySelector('#review-space').textContent = booking.space_title;
    const link = document.querySelector('#view-reviewed-space');
    link.href = `space.html?${new URLSearchParams({ id: booking.parking_space_id })}`;
    async function reload() {
      const rows = await request(`booking_reviews?${new URLSearchParams({ booking_id: `eq.${id}`, select: 'rating,comment' })}`, null, true);
      form.elements.rating.value = rows[0]?.rating || '';
      form.elements.comment.value = rows[0]?.comment || '';
      remove.hidden = !rows.length;
      await showReviews({ id: booking.parking_space_id }, document.querySelector('#review-preview'));
    }
    await reload(); content.hidden = false; status.textContent = 'One review per completed booking. Saving again edits your review.';
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy || !form.reportValidity()) return;
      try {
        const rating = Number(form.elements.rating.value), comment = form.elements.comment.value.trim();
        validateReview(rating, comment); setBusy(true); status.textContent = 'Saving review…';
        await request('rpc/save_booking_review', { p_booking_id: id, p_rating: rating, p_comment: comment }, true);
        await reload(); status.textContent = 'Review saved. Open the space to see the updated rating and review count; refresh any already-open listing pages.';
      } catch (error) { status.textContent = error.message; }
      finally { setBusy(false); }
    });
    remove.addEventListener('click', async () => {
      if (busy || !confirm('Delete your review? You can write another review for this booking later.')) return;
      setBusy(true); status.textContent = 'Deleting review…';
      try {
        await request('rpc/delete_booking_review', { p_booking_id: id }, true); await reload();
        status.textContent = 'Review deleted. Open the space for its updated rating and count; refresh any already-open listing pages.';
      } catch (error) { status.textContent = error.message; }
      finally { setBusy(false); }
    });
  }
} catch (error) { status.textContent = `${error.message} Reload to retry.`; }
