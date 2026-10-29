# ParkShare — demo and Supabase listing reads

- Work only in this new ParkShare directory. Do not modify the older application.
- Use semantic HTML5, separate CSS3, and vanilla JavaScript ES modules. No frameworks, TypeScript, UI libraries, or build frameworks. The official Supabase JavaScript SDK is allowed for auth/session management and Storage.
- Keep code readable for a Web Technologies student; explain meaningful AJAX, event, filtering, and DOM behavior in comments.
- No PHP. Use fetch() for JSON and Supabase REST; no backend; keep listing CRUD as explicit fetch requests. Keep demo mode enabled initially.
- Dedicated NEW ParkShare Supabase project only. Never connect to, query, migrate, or modify old ParkNest resources; never reuse their credentials or data.
- SQL is prepared locally and run manually by the user. Do not automatically run remote database commands or associate this repository with an old CLI project.
- Frontend accepts only a browser-safe publishable key, never secrets, service-role keys, or passwords. Validate configuration first; never silently fall back to demo.
- Current stage: auth, owner dashboard/CRUD, image uploads, dual-source browsing, and local migrations. Current additions: single-spot reservations, authoritative quotes, overlap prevention and pricing. Current additions: simulated checkout, driver My Bookings/cancellation, and read-only owner reservations. Future: real payments and admin tools.
- Scope includes signup/login/logout, SDK sessions, owner drafts and published listings, and user-folder Storage uploads. Reservations, clearly labelled demo payments, My Bookings and driver cancellation are allowed. No real payment gateway, financial credential collection, embedded maps or admin panel. Demo earnings, verified booking reviews and external directions links are allowed.
- Label demo data and unverified availability. Demo mode allows price previews only; persistent reservations require Supabase. Never imply real payment: use explicit demo_paid/demo_refunded labels and “Demo payment — no real money is collected.”
- Use textContent for data, accessible labels/focus, responsive layouts, and local image fallbacks.
- Serve through HTTP for testing; file:// cannot reliably load modules or JSON.

- Use migration 003 after 001 and 002. Preserve ownerless sample rows. Enforce ownership with RLS, not UI visibility. Never transfer owner_id.
- JPEG/PNG/WebP uploads only, maximum 5 MiB, under user-id/unique-name. Never delete shared sample images. Document retained/orphan upload cleanup.
- College-demo auth uses email/password only with Confirm email disabled manually in the NEW project. Redirect only on a real SDK session; otherwise explain the setting. No OTP, magic-link, resend, reset, invitation, or welcome-email flows. Keep SDK persistence/refresh and ownership/RLS.

- Run migration 004 manually after 003 in the NEW project. Never execute remote migrations automatically.
- One spot per listing. Store UTC timestamptz; parse/display input explicitly as Asia/Kolkata (+05:30). Confirmed intervals are [arrival, departure); 30 minutes through 7 days, arrival in the future.
- All booking writes go through create_booking with auth.uid(), authoritative numeric pricing, row locks and a GiST exclusion constraint. No direct client table writes. Quote responses must never disclose other bookings or identities.
- Current pricing (007): listed hourly price includes the platform fee. Round driver total (rate × minutes / 60) to 2 decimals; fee = round(total × 5%, 2); owner parking_subtotal = total − fee. Preserve historical pre-007 bookings and their exclusive_v1 split. Require review if the rate changes. Snapshot amounts on bookings.
- Preserve idempotency keys across uncertain retries and validate identity/request matches. Preserve history with restrictive listing FK deletion; owners unpublish instead.

- Apply 005 manually after 004 in the NEW project. Existing bookings backfill unpaid without changing stored prices or reservation status.
- Payment state is separate from reservation status. Failed simulation keeps the spot confirmed; no automatic expiration/holds. Only the driver may simulate or cancel.
- Protect mutations with SECURITY DEFINER RPCs, empty search_path, qualified objects, auth.uid() checks, booking FOR UPDATE locks and restricted execute grants. No direct table writes.
- Cancellation only before arrival; repeated cancellation is safe. Paid cancellation records demo_refunded (no real refund); unpaid/failed history remains. Keep append-only private simulation history and request-key retry validation.
- Owners only view reservations for their spaces, never mark paid/cancel/alter booking prices or statuses. Derive time categories in JavaScript; database time remains authoritative for mutations.

- Apply 006 manually after 005 in the NEW project. No remote migrations or database resets.
- Earnings derive the owner from auth.uid(), use stored booking prices and paid receipts once per booking, and never subtract the service fee again from the stored owner subtotal. Completed confirmed demo_paid = earnings; upcoming/active demo_paid = pending. Refunds and unpaid/failed/cancelled records are excluded. Filter ARRIVAL dates using inclusive Asia/Kolkata calendar days.
- Reviews are one per historical booking, driver-only after confirmed departure; rating integer 1–5, trimmed text 10–1000 characters. Only guarded RPCs may mutate. Public projections omit booking/account IDs and expose only published spaces. Owners cannot edit driver reviews. Batch card rating queries.
- Coordinates are optional paired latitude/longitude with finite range checks; never invent/geocode them. New bookings snapshot the listing location; pre-006 bookings retain their original address with locality/city backfilled at migration time, and no invented coordinates. Google Maps links use encoded structured data and no explicit origin. Clipboard failure must offer manual copy.
- Demo JSON has no persisted reviews/earnings. Keep honest unavailable states. No real money, withdrawals, email notifications, admin panel or deployment.

- Apply 007 manually after 006. No coordinate inputs in the owner form; retain existing database coordinates/history. Amenity choices: EV charging, Covered parking, Security, CCTV camera, plus Others. Keep multiple photos editable; removal only unlinks from the listing, never deletes shared Storage objects. Retain successfully uploaded URLs across retries and document orphan cleanup.
- opening_schedule is a Monday–Sunday JSON array with daily/custom mode, null for closed days, and open/close HH:mm for each open day. At least one open day; daily mode shares hours across selected days. 00:00 closing means end-of-day midnight, 00:00–00:00 means 24h. Split overnight availability across adjacent days. Existing listings default 24/7; owners can edit all days/times later.
- Quote and create_booking enforce the entire interval within opening windows in Asia/Kolkata, including every crossed day. Keep the listing SHARE lock, exclusion constraint, authorization and retry behavior. Schedule changes affect new bookings, not existing confirmed reservations. Do not trust only browser validation.
