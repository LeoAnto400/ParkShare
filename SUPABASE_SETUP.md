# ParkShare: NEW Supabase project setup

The site starts in local demo mode. Do not reuse, query, migrate, or modify the old ParkNest project. No remote commands run automatically.

1. Open [Supabase Dashboard](https://supabase.com/dashboard) and sign in.
2. Select your organization, choose **New project**, and name it **ParkShare**. Create a separate project, not a rename of the old one.
3. Choose a strong database password and preferred region. Store the password privately; NEVER put it in frontend files or Git. This website does not need the password.
4. Wait for provisioning to finish.
5. Confirm the selected project is the NEW **ParkShare** project, with a new project reference, before running any SQL. Never use the old project's SQL Editor.
6. Open **SQL Editor**, paste all of [sql/001_schema.sql](sql/001_schema.sql) into a new query, and run it. Then paste and run [sql/002_seed.sql](sql/002_seed.sql). Run schema before seed. The seed uses `ON CONFLICT (id) DO NOTHING`, so reruns neither duplicate nor overwrite existing IDs.
7. Open **Table Editor → public → parking_spaces**. Confirm eight fictional rows, `pn-001` through `pn-008`, all published and three featured. IDs come from this repository's JSON; nothing is copied from an old database.
8. Find the NEW project URL in its **Connect** dialog or API/Data API settings. Under **Settings → API Keys**, copy the **Publishable key** beginning `sb_publishable_`. Labels may vary. Never copy a secret key, service-role key, legacy JWT key, or database password; this implementation accepts only modern publishable keys.
9. Edit the local `.env` file (ignored by Git). On a fresh clone, copy `.env.example` to `.env`. Replace the URL and key placeholders with the NEW project's values:

   ```dotenv
   DATA_SOURCE=demo
   SUPABASE_URL=https://YOUR_NEW_PARKSHARE_PROJECT_REF.supabase.co
   SUPABASE_PUBLISHABLE_KEY=YOUR_NEW_PARKSHARE_PUBLISHABLE_KEY
   ```

   Only public values belong here. The browser sees the publishable key; `.env` does not make frontend credentials secret. Never enter database passwords or secret/service-role keys. The static server can serve files in its folder, so exclude `.env` from deployment.
10. Set `DATA_SOURCE=supabase`, save, then run `python scripts/configure.py`. This validates and generates ignored `js/config.js`, which the static site imports. Rerun after each `.env` edit and hard-refresh the browser. Never edit the generated file directly. Supabase failures never silently load demo data.
11. Start a local HTTP server:

    ```powershell
    cd C:\Users\leoan\projects\ParkShare
    python -m http.server 5500 --bind 127.0.0.1
    ```

    Open [the website](http://127.0.0.1:5500/pages/index.html). Use `py` if that is your Python launcher. Keep the terminal running. Do not double-click HTML files; modules and fetch require HTTP.
12. Open browser DevTools → **Network → Fetch/XHR**, then reload. Inspect the `parking_spaces` request and confirm HTTP 200 with eight rows. Its hostname MUST match the NEW project's URL: `https://<new-project-reference>.supabase.co/rest/v1/parking_spaces`. It includes `published=eq.true`; details also include an ID filter and `limit=1`. The publishable key is sent in `apikey`, not a Bearer JWT header. Seeing `spaces.json` means demo mode is active or config is cached; hard reload after editing.

## Permissions and manual verification

The schema enables Row Level Security, grants `anon` SELECT only, and allows reading only published rows. Anonymous INSERT, UPDATE, and DELETE are not permitted. Migration 003 below extends these permissions for signed-in owners.

In the NEW project's Table Editor, optionally set one sample's `published` to false. Reload search: it should disappear; its direct detail URL should show not found. Restore it afterward. SQL Editor uses elevated access, so seeing rows there does not verify anonymous permissions. Live REST and RLS testing remains pending until you configure your new project.

## Troubleshooting

| Problem | Check |
| --- | --- |
| Missing configuration | Replace both placeholders in `.env`, then run `python scripts/configure.py`; use root HTTPS `*.supabase.co` and an `sb_publishable_` key. Check DATA_SOURCE spelling. Validation runs before requests. |
| Network failure | Check internet, project provisioning/paused status, hostname, local server, and browser blockers. |
| HTTP 401/403 | Confirm URL and key belong to the same NEW project. Check grants/RLS. Never disable RLS or use a secret key. |
| HTTP 404 / missing table | Run schema in the NEW project; confirm `public.parking_spaces` exists and the Data API is enabled with public schema exposed. |
| HTTP 200 with empty array | Run seed; confirm published rows and anonymous SELECT policy. RLS can hide rows without an error. Clear search location and filters. |
| No featured spaces | Ensure intended rows have both featured and published set to true. |
| Invalid data | Compare required fields with the seed: nonnegative numeric price, vehicle/amenity/rule arrays, nonempty HTTPS image URL array, and boolean flags. |
| Photos unavailable | Remote photo access may be blocked; the local SVG fallback keeps cards usable. |
| Retry still fails | Fix the cause and retry. Regenerate config and reload the page after changing `.env` because ES modules are loaded once per page. |

**Supabase Storage is separate from the database.** Browsing existing samples does not need a bucket. Owner uploads require the parking-images bucket configured by migration 003 below.

Official references: [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [REST API](https://supabase.com/docs/guides/api/creating-routes), [database security](https://supabase.com/docs/guides/database/secure-data).

## Owner/auth stage — exact actions in the NEW project

1. Confirm again that the dashboard project is the NEW ParkShare project. Keep the old ParkNest project untouched.
2. For a fresh database, run `001_schema.sql`, `002_seed.sql`, then `003_owners_and_storage.sql` in SQL Editor. If 001/002 were already applied, run only 003. Do not rerun 001 after 003, because it restores earlier read-only grants. Migration 003 is rerunnable, preserves all listing rows, and leaves seeded owner_id values null. It replaces policies on parking_spaces and installs dedicated Storage policies without changing other buckets.
3. Inspect Storage → parking-images: public bucket; maximum file size 5,242,880 bytes (5 MiB); allowed MIME types image/jpeg, image/png, image/webp. SVG is not allowed. The SQL configures these settings. Uploads, replacements, and deletion must use the authenticated user's UUID as their first folder segment. Photos are publicly readable, including photos attached to drafts; never upload private images.
4. In the NEW ParkShare project, open **Authentication → Sign In / Providers → Email** (some dashboard versions label this Providers or Sign-in methods). Keep Email/password signup enabled, turn **Confirm email OFF**, and **Save** before creating a new test account. Set minimum password length to at least 8. This is a manual dashboard change; frontend code cannot disable project email confirmation. If left enabled, Supabase itself may send a signup email even though this app has no send/resend action.
5. No email-confirmation redirect URL is required for this password-only demo. You can keep Site URL set to `http://127.0.0.1:5500`; old login redirect allowlist entries are unused. Signup no longer supplies emailRedirectTo, and the SDK does not consume URL-based sessions. SDK session persistence and automatic refresh remain enabled. Do not configure OTP, magic-link, reset-password, invitation, or custom welcome-email flows.
6. Set `.env` to Supabase mode with ONLY the NEW project's URL and publishable key. Run `python scripts/configure.py`, then `python -m http.server 5500 --bind 127.0.0.1`. Hard-refresh. Do not share tokens, passwords, or secret keys.
7. After saving Confirm email OFF, open pages/signup.html and register a **new** test User A with an email address you control. Signup should return a real session and open the owner dashboard immediately, with no email step. Repeat for a new User B in a separate private browser profile. If signup returns no session, the app shows the configuration message and does not redirect or resend emails. Check the setting in the NEW project and test with a fresh account; existing registered users should use Log in. Previously unconfirmed accounts are not repaired automatically. Never put passwords in source files.
8. As A, add a space and upload a small JPEG/PNG/WebP. Save as draft, edit it, publish it, refresh search, unpublish it, and delete it with confirmation. Reopen the browser to check session restoration. Log out and visit pages/dashboard.html: it should route to login. Demo mode should keep browsing functional and explain that auth/writes are unavailable.

### Two-user permissions checklist (live verification required)

- As anonymous and B: A's published listing is readable; A's draft is absent. Direct public detail URLs must not expose drafts. As A: dashboard includes both own drafts and published rows; ownerless samples never appear there.
- Use browser DevTools Network to inspect the requests. Owner fetch requests must target the NEW hostname and carry apikey plus the current session Bearer access token. Never copy tokens into documentation, chat, or committed files.
- In B's local test browser, use an API client with B's current session token to PATCH or DELETE `/rest/v1/parking_spaces?id=eq.<A-listing-id>`. RLS must change zero rows (commonly an empty response, not necessarily an HTTP error). Confirm A's row is unchanged. Trying to insert with owner_id=A must fail; changing owner_id on an existing B row must fail. Do not weaken RLS to make requests pass.
- As B, attempt Storage upload to `A-user-id/probe.jpg`, overwrite an A object, and delete an A object through Storage API calls. All must fail. B's own folder uploads should succeed. Verify files in A's folder are unchanged. Test oversized and SVG uploads: bucket restrictions must reject them even if frontend validation is bypassed.
- Table Editor/SQL Editor uses elevated permissions and is not a valid test of anonymous or B access. Review `pg_policies` and grants there, but run access tests with the actual user's token.

### Cleanup and recovery

Uploads use unique filenames and do not overwrite images. Editing with a new photo replaces the listing's image URLs, but the old object stays. Deleting a listing does not delete any photo, and a failed save after upload can leave an unused object. This intentionally avoids deleting shared sample photos or a photo from a save whose network response was lost. Clean up verified-unused objects manually in the NEW project's Storage dashboard; do not delete objects still referenced by a listing. If a save's response was interrupted, refresh the dashboard before retrying. A stable ID during retries prevents duplicate new listings, but a saved row may need reopening to continue editing.

If login fails, check that Confirm email is OFF in the NEW project, use a fresh test account or the correct existing credentials, and check password policy, Email provider settings, rate limits, and CDN connectivity. No reset/resend email action is provided. If owner writes fail, confirm migration 003 was run after 001 and that the session is active. If uploads fail, check bucket MIME/size settings and folder policies. Never fix permissions by using a service-role key or disabling RLS.

Official references: [Auth state changes](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

Password-only demo reference: [Supabase general authentication configuration](https://supabase.com/docs/guides/auth/general-configuration). Disabling Confirm email automatically confirms new signups; it does not replace real authentication or database permissions.

## Reservation stage — migration 004 and exact demo

1. Open the **NEW ParkShare** project and confirm its name/reference. Do not touch old ParkNest resources.
2. If migrations 001–003 are already applied, run only the complete [004_reservations.sql](sql/004_reservations.sql) in SQL Editor. For a fresh database run **001 → 002 → 003 → 004**. Do not rerun 001/003 after later stages. Migration 004 installs btree_gist in the extensions schema and creates bookings, constraints, RLS and RPCs without deleting existing data. If extension installation fails, enable btree_gist in Database → Extensions in this NEW project, then rerun 004.
3. Keep **Confirm email OFF**, email/password signup enabled, and the existing Storage configuration. No new email settings are needed. No payment integration or secret key is required.
4. Keep the NEW project URL/publishable key and DATA_SOURCE=supabase in `.env`. Run `python scripts/configure.py`, start `python -m http.server 5500 --bind 127.0.0.1`, and hard-refresh the website.
5. In Table Editor confirm bookings exists. Inspect its exclusion constraint and RLS policy in the database. Direct anonymous/authenticated INSERT, UPDATE and DELETE privileges must be absent. Only authenticated callers may execute create_booking; visitors may execute booking_quote. The SQL Editor's elevated access is not a user permission test.

### Demonstration using two accounts

1. Log in as A in one browser and B in a private profile. Choose the ownerless seeded **Ajjarkad Covered Corner (pn-006, ₹40/hour)** so neither is its owner. Pick a future date, arrival 10:00 and departure 11:30 IST, Car and registration KA20AB1234. Check availability: ₹60 parking + ₹3 fee = ₹63. If the rate was changed since seed, use any ₹40 listing or set a dedicated owner's test listing to ₹40; don't overwrite unrelated data.
2. Before confirming, check the same slot as B. Both may see available: a check does not hold the spot. Click Confirm in both browsers as closely together as possible. Exactly one reservation must succeed; the other must be told the slot was taken. Verify only one confirmed row exists for that interval in Table Editor.
3. In the successful browser, refresh the confirmation page. The same reference, amounts, vehicle and times must reload. Bookmark its URL for this demo. No payment has been collected.
4. As the other user, try 11:00–12:00: unavailable. Try **11:30–12:00**: available and reservable (adjacent endpoints). Use a different future day for repeated demos to avoid your earlier reservations.
5. Try yesterday, departure before arrival, 29 minutes, and more than 7 days: rejected. Test a cross-midnight interval such as 23:30–01:00 the next day. Temporarily change your browser/device timezone: entered times must still mean India and confirmation must still say Asia/Kolkata.
6. Sign out, choose fresh times and check availability. Confirm takes you to login. After logging in, the spot/times/vehicle must be restored, Confirm disabled, and a fresh quote required. Reenter registration (it is intentionally not stored in the return URL).
7. For a price-change test, A creates and publishes an owned listing at ₹40. B checks a 90-minute quote. A changes rate to ₹50. B confirms: no reservation should be inserted; B is told to recheck/review. The new quote is ₹75 + ₹3.75 = ₹78.75, and B must explicitly confirm it. A cannot reserve this own listing.
8. After B books A's listing, A's Delete action must fail with an explanation to unpublish instead. Unpublishing stops new reservations but retains existing confirmation/history. Editing the listing price must not change B's saved booking amounts.

### Direct API and retry checks (NEW project only)

Use DevTools → Network to inspect booking_quote and create_booking. Do not publish tokens, registration numbers, or private booking responses. The UI uses the current SDK session; the following console example uses the same exported API without copying keys. Run only in your local ParkShare page, with a signed-in test user, a fresh future interval, and a non-owned listing:

```js
const bookingAPI = await import('./js/booking-data.js');
const selection = {
  p_space_id: 'pn-006',
  p_arrival: new Date('2030-01-01T10:00:00+05:30').toISOString(),
  p_departure: new Date('2030-01-01T11:30:00+05:30').toISOString(),
  p_vehicle_type: 'Car'
}; // Choose a future date that is free before running.
const quote = await bookingAPI.getQuote(selection);
const attempt = { ...selection, p_registration: 'KA20AB1234',
  p_idempotency_key: crypto.randomUUID(), p_expected_hourly_rate: quote.hourly_rate };
const original = await bookingAPI.reserve(attempt);
const retry = await bookingAPI.reserve(attempt);
console.assert(original.id === retry.id); // same reservation, no duplicate
```

- Reuse that key with a different time or registration: RETRY_KEY_MISMATCH, no new row. B reusing A's key must not get A's confirmation. Do not share bearer tokens; use B's own signed-in browser.
- Repeat concurrent requests with DIFFERENT keys for the same free slot in A and B browsers. The database exclusion constraint, not browser state, must allow exactly one. For repeatable overlap racing in one test account, `Promise.allSettled([bookingAPI.reserve({...attempt,p_idempotency_key:crypto.randomUUID()}), bookingAPI.reserve({...attempt,p_idempotency_key:crypto.randomUUID()})])` on a fresh unbooked interval must also yield one success. This supplements, not replaces, the two-account check.
- Change p_expected_hourly_rate to a different number: PRICE_CHANGED, not a discounted booking. Adding driver_id, total, status or fee arguments must fail function signature resolution. Direct REST table inserts/updates/deletes must be denied. Send unsupported vehicle types or own-space IDs directly to verify server rejection, not just form behavior.
- A driver can GET their own bookings; a space owner can GET bookings for their spaces. B requesting A's ownerless-sample booking by ID must see no rows. Opening someone else's confirmation URL must show not found/permission denied. The public quote response must contain only availability and numeric pricing, no registrations, booking rows or identities.
- After applying 005, use My bookings to cancel a disposable upcoming reservation as its driver. Its slot should become available while its history remains. Direct status updates must still be denied.
- For lost-response recovery, temporarily disconnect the browser after submitting, reconnect, and use **Retry this reservation** in the SAME tab/account. The persisted attempt key must recover the original booking if committed. Do not create a new attempt while unsure; session storage is not shared across tabs. No automatic emails or payments occur.

### Rules and troubleshooting

One listing = one spot. Confirmed ranges use [arrival,departure), 30 minutes to 7 days, with future arrival. All inputs/display use Asia/Kolkata; timestamps are sent as UTC ISO strings. Numeric database subtotal is rounded to two decimals; 5% fee on that rounded subtotal is separately rounded; total is their sum. Quotes are not holds. A row lock prevents concurrent owner edits bypassing creation rules; the exclusion constraint catches competing inserts. A per-attempt advisory lock serializes identical retry keys. Functions set an empty search_path, qualify database objects, derive auth.uid(), and restrict execution grants.

HTTP 404 for RPC means migration 004 is missing or the Data API schema cache needs refreshing. An unavailable space may have been unpublished. PRICE_CHANGED requires a new availability check and explicit review. SLOT_TAKEN requires different times. If the browser reports uncertain outcome, retry the same attempt; do not assume failure means no row was created. Booking history prevents physical listing deletion; unpublish instead. Existing confirmed reservations are not automatically cancelled by unpublishing.

Local JavaScript/mock tests passed; live SQL execution, RLS isolation, simultaneous requests, actual persistence and browser UI behavior remain pending your setup. No remote migration or live booking was executed by the agent.

References: [PostgreSQL range exclusion constraints](https://www.postgresql.org/docs/current/rangetypes.html), [Supabase function security](https://supabase.com/docs/guides/database/functions).

## Demo payments and booking management — migration 005

### Exact setup

1. In Supabase Dashboard, explicitly select the **NEW ParkShare project**, not the old ParkNest project.
2. If 001–004 are already applied, run only [005_demo_payments_and_management.sql](sql/005_demo_payments_and_management.sql) in SQL Editor. For a fresh project run **001 → 002 → 003 → 004 → 005**. Never reset the database or rerun older privilege migrations over newer ones. Migration 005 is rerunnable; it preserves existing rows, prices and reservation statuses, and adds unpaid as the initial payment status.
3. Check bookings has payment_status/cancelled_at and demo_payment_events exists. Existing reservations should be unpaid. RLS is enabled and direct anon/authenticated writes are denied. The RPCs are simulate_booking_payment, cancel_booking and owner_reservations; execute permission is authenticated-only. Do not disable RLS or use a service-role key.
4. Keep **Confirm email OFF** and Email/password signup enabled. No emails, real gateway, cards, UPI IDs, bank details or new secrets are needed. Existing parking-images settings are unchanged.
5. With only the NEW project URL/publishable key and DATA_SOURCE=supabase in `.env`, run:

   ```powershell
   cd C:\Users\leoan\projects\ParkShare
   python scripts/configure.py
   python -m http.server 5500 --bind 127.0.0.1
   ```

   Open http://127.0.0.1:5500/pages/index.html and hard-refresh. Authenticated navigation now includes My bookings. In demo mode these pages explain that persistence requires Supabase.

### Walkthrough: one owner and two drivers

1. Use three accounts in separate browser profiles: Owner O, Driver A and Driver B. Sign up with email/password using controlled test addresses; no confirmation-email step. O publishes a space at ₹40/hour.
2. A reserves that space on a future day for 90 minutes. Confirm ₹60 subtotal + ₹3 service fee = ₹63. My bookings → Upcoming must show it after refresh. Open its details, then Complete/retry demo payment.
3. Click **Simulate failed payment**. Expect demo_failed, while reservation stays confirmed. B checking the same interval must still see unavailable. The failure message explains that A must cancel to release the slot.
4. A clicks **Simulate successful payment**. Expect a receipt-style summary and demo_paid. Reload checkout and My bookings: stored amounts/status/history must persist. The banner must always say “Demo payment — no real money is collected.” There is no real receipt/gateway verification.
5. O opens owner dashboard → Reservations. Select the listing and Upcoming. The row and count should appear, with vehicle registration and demo payment state, but no payment/cancellation controls or unrelated driver account information. View booking details to see stored prices/history. Another owner must not see O's reservations.
6. A cancels the upcoming reservation through My bookings and confirms the native dialog. Expect cancelled + demo_refunded, a retained payment/refund history, and clear “no real refund” text. B can now reserve the released interval. Cancelling an unpaid or failed reservation must preserve unpaid/demo_failed history instead.
7. Test the Upcoming/Active/Past/Cancelled filters. At arrival the category becomes Active; at departure it becomes Past. For a short live demo, create a booking beginning in a few minutes and verify Active after waiting. Use already-ended test records for Past. Device clock affects presentation only; the database clock controls payment/cancellation eligibility. Cancellation is unavailable/rejected at or after arrival. Demo payment is rejected at/after departure and on cancelled reservations.
8. Unpublish O's listing: existing driver/owner reservations and details must remain viewable through snapshots and RLS. Existing reservations are not automatically cancelled. Physical listing deletion with history remains blocked.

### Direct API, retries and race checks

Run these only against disposable test reservations in the NEW project. Use the signed-in local website and its SDK session, never paste bearer tokens into shared documents or chat. You can inspect requests in DevTools Network or import the API in the console:

```js
const management = await import('./js/management-data.js');
const bookingId = 'REPLACE_WITH_YOUR_TEST_BOOKING_UUID';
const requestKey = crypto.randomUUID();
const first = await management.simulatePayment(bookingId, 'success', requestKey);
const repeated = await management.simulatePayment(bookingId, 'success', requestKey);
console.assert(first.event.id === repeated.event.id);
```

- Same key/outcome must yield the same recorded event, not another charge. Reusing a key with a different outcome/booking must fail. A new failure request after demo_paid must leave it demo_paid and must not create a failure record. A second success with a new key must not create another paid record.
- A network interruption may hide a successful response. Checkout retains the key/outcome in same-tab sessionStorage, scoped to user and booking. Reopen checkout and use **Retry previous simulation** before starting a new action. A failed result that WAS received may be followed by a new explicit success/failure attempt. Replays are read-only recovery and may return the original event after cancellation/expiry alongside current booking status.
- For an upcoming unpaid test booking, run `Promise.allSettled([management.simulatePayment(bookingId, 'success', crypto.randomUUID()), management.cancelBooking(bookingId)])`. Final state must be cancelled with either unpaid (cancel won; payment rejected) or demo_refunded (payment won; then cancellation refunded it). It must never be cancelled + demo_paid. Check events for no duplicate paid/refunded rows.
- Repeat cancellation twice: same cancelled booking, at most one refund event. Active/past cancellation must fail in the RPC even if frontend controls are bypassed. Cancelled/ended bookings must reject NEW payment attempts. Failed payment leaves confirmed reservation blocking availability.
- B must not read A's booking/payment history unless B owns that space. O can read only bookings/history for O's spaces, and must be rejected if O calls payment/cancellation on a driver's reservation. RLS allows only participants to read. Do not use SQL Editor or Table Editor's elevated identity as proof of user permissions.
- Direct REST INSERT/PATCH/DELETE on bookings and demo_payment_events using a normal user token must fail. Adding client total/driver_id/status parameters to the RPC should fail signature matching. The RPC reads b.total and auth.uid(); no client monetary amount or identity is accepted.
- Owner endpoint derives owner from auth.uid(), pages results and returns only operational reservation/vehicle/price fields. It does not query auth.users, email, passwords or tokens. Driver list explicitly filters driver_id in addition to RLS, so a person who is also an owner sees only their own driver bookings in My bookings.

### Troubleshooting and limits

Missing RPC/column errors mean migration 005 or a Data API schema refresh is needed. Keep the new migration after 004. Refresh lists to see changes from other windows. If a simulation response is uncertain, recover the same attempt rather than changing outcome. Payment history can be viewed even after a listing is unpublished. History is never deleted by these features. No automatic expiry, pending-payment holds, real refunds, real payments, email notifications or admin panel are added by migration 005. Migration 006 below adds demo earnings, reviews and external directions.

Local tests passed for category boundaries, eligibility helpers, safe destinations, paging and authenticated API payloads/retries, plus previous auth/booking/owner/data tests. SQL transitions, cancellation releasing the exclusion constraint, true idempotency, payment/cancellation races, RLS isolation and browser layout remain **live manual verification pending**. No remote migration or payment/cancellation request was run by the agent.
## Migration 006: earnings, verified reviews and directions

1. Select the dedicated **NEW ParkShare** project in Supabase. Verify its name/project reference against your own `.env`; never use the old ParkNest project.
2. In **Authentication → Sign In / Providers → Email**, turn **Confirm email OFF** and save before testing a new email/password signup. If the dashboard places the toggle under Authentication settings, use the same Confirm email toggle in this NEW project. Keep Email/password enabled. No OTP, magic-link, reset, invitation, resend or welcome-email flow is added.
3. In SQL Editor, ensure `001_schema.sql`, `002_seed.sql`, `003_owners_and_storage.sql`, `004_reservations.sql`, then `005_demo_payments_and_management.sql` have already succeeded. For an existing project do not rerun earlier migrations unnecessarily. Run the complete `sql/006_earnings_reviews_locations.sql` once, manually. It is transactional and adds columns/table/functions, not a database reset. If it succeeds, do not rerun it; if it rolls back, fix the reported issue first. It also requests a PostgREST schema refresh.
4. Keep `.env` configured with `DATA_SOURCE=supabase`, this NEW project's HTTPS URL and its browser-safe `sb_publishable_...` key. Never add secret/service-role keys or passwords. Run `python scripts/configure.py`, then `python -m http.server 5500 --bind 127.0.0.1`; open `http://127.0.0.1:5500/pages/index.html`. Keep your existing `.env` keys private; they were not modified by this addition.
5. Refresh the website. Use separate owner and driver accounts/browser profiles. For offline JSON browsing, explicitly set `DATA_SOURCE=demo` and rerun the config script; earnings and review persistence are unavailable, without fake saves or fake ratings.

### Data and permission behavior

`owner_earnings(p_space_id,p_from,p_to,p_offset)` derives identity from `auth.uid()`. It returns aggregate totals and 50 breakdown rows. Date filters refer to **booking arrival**, inclusive India calendar days, converted server-side to `[start midnight, day-after-end midnight)` in Asia/Kolkata. Totals cover all filtered rows, not only the current page. Completed and pending categories require confirmed `demo_paid` bookings plus a stored paid receipt. `EXISTS` avoids multiplying amounts by receipt attempts. Owner = stored subtotal, platform = stored fee, driver = stored total. Refunded amounts are separate, and unpaid/failed/cancelled bookings never inflate earnings. This is a demo report, with no withdrawal controls.

`booking_reviews` has restrictive booking/listing/user foreign keys, one primary-key review per booking, rating/text checks, and own-driver read RLS. Clients have no table write grants. `save_booking_review` locks and checks the booking; subsequent saves update that one review. `delete_booking_review` checks driver ownership and is repeat-safe. Public functions return only rating/comment/dates, and batched listing ID/count/average summaries, restricted to published spaces. Public reads never select a driver's or booking's ID. Deleting/unpublishing a listing cannot discard booking/review history; unpublish it instead. Public comment text is user-authored: users should not type private information into it.

Coordinates must be both NULL or both finite/in-range. Existing listings keep NULL coordinates. New bookings snapshot coordinates, locality and city without changing the existing address snapshot. Older bookings get locality/city from their current listing at migration time and keep their original address; coordinates stay NULL. Directions fall back to full address. Owner edits cannot change saved booking destinations. To obtain coordinates, right-click the parking entrance in Google Maps, copy the displayed latitude/longitude pair, and verify the pin before saving. No map API key or geocoding service is used. See [Google Maps URL documentation](https://developers.google.com/maps/documentation/urls/get-started).

### Manual hosted testing checklist (NEW project only)

- [ ] Signup creates an SDK session directly when Confirm email is off; login, refresh persistence and logout still work. Without a session, signup explains the setting rather than sending/resending mail.
- [ ] Owner A sees only A's earnings. Owner B gets zero results when asking for A's listing ID; anonymous calls are denied. Use real user sessions, not SQL Editor's elevated role, to verify RLS and grants.
- [ ] Stored subtotal 100 + fee 5 = driver 105. Completed paid owner earnings = 100, not 95. Upcoming/active paid 100 stays pending. Unpaid/failed/cancelled/refunded amounts stay excluded. Failure/success retries do not duplicate earnings. Repeated cancellation creates at most one refund and releases availability.
- [ ] Arrival at 00:00 IST is included in that day's filter; just before midnight belongs to the previous day. End-date filter includes the whole day. Invalid date order shows an error; another browser timezone gives the same results. Empty filters and pagination work.
- [ ] Only the completed booking's driver can save/edit/delete. Active/upcoming/cancelled reviews fail via RPC too. Ratings 0/6/2.5 and whitespace/short/overlong comments fail. Second save edits one review; direct table writes fail. Other drivers and the listing owner cannot change it.
- [ ] Save/edit/delete refresh the public preview average/count. Public Network responses contain only the documented safe fields, no private booking/user identifiers. HTML-looking comments render as text. Anonymous users cannot read `booking_reviews` directly. Unpublish hides public reviews while preserving private history.
- [ ] Single/out-of-range coordinates fail UI and database checks. Zero/zero is valid, both blank is valid. Directions use coordinates when present and encoded address/locality/city otherwise. New-tab links use noopener/noreferrer, no origin is supplied, clipboard success/denial both provide feedback. Existing reservations keep their saved destination after listing edits.
- [ ] Existing listing CRUD/uploads, quotes, overlap rejection, idempotent reservation creation, demo payments, cancellation, owner read-only reservations and local JSON browsing still work. No real payment, withdrawal, email or deployment action exists.

Prepare a legitimate completed reservation before the presentation (minimum duration 30 minutes); server time controls eligibility. Changing the browser clock does not bypass the RPC. Do not modify production timestamps or weaken policies to make the demo faster.

Local test status is reported in the implementation response. Local PostgreSQL auth/storage stubs cannot prove hosted JWT, PostgREST, Storage, or account-session behavior; the hosted checklist remains pending until you apply 006 and test with your NEW project.
