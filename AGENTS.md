# ParkShare — demo and Supabase listing reads

- Work only in this new ParkShare directory. Do not modify the older application.
- Use semantic HTML5, separate CSS3, and vanilla JavaScript ES modules. No frameworks, TypeScript, UI libraries, or build frameworks. The official Supabase JavaScript SDK is allowed for auth/session management and Storage.
- Keep code readable for a Web Technologies student; explain meaningful AJAX, event, filtering, and DOM behavior in comments.
- No PHP. Use fetch() for JSON and Supabase REST; no backend; keep listing CRUD as explicit fetch requests. Keep demo mode enabled initially.
- Dedicated NEW ParkShare Supabase project only. Never connect to, query, migrate, or modify old ParkNest resources; never reuse their credentials or data.
- SQL is prepared locally and run manually by the user. Do not automatically run remote database commands or associate this repository with an old CLI project.
- Frontend accepts only a browser-safe publishable key, never secrets, service-role keys, or passwords. Validate configuration first; never silently fall back to demo.
- Current stage: auth, owner dashboard/CRUD, image uploads, dual-source browsing, and local migrations. Current additions: single-spot reservations, authoritative quotes, overlap prevention and pricing. Current additions: simulated checkout, driver My Bookings/cancellation, and read-only owner reservations. Future: real payments and admin tools.
- Scope includes signup/login/logout, SDK sessions, owner drafts and published listings, and user-folder Storage uploads. Reservations, clearly labelled demo payments, My Bookings and driver cancellation are allowed. No real payment gateway, financial credential collection, earnings, reviews, maps or admin panel.
- Label demo data and unverified availability. Demo mode allows price previews only; persistent reservations require Supabase. Never imply real payment: use explicit demo_paid/demo_refunded labels and “Demo payment — no real money is collected.”
- Use textContent for data, accessible labels/focus, responsive layouts, and local image fallbacks.
- Serve through HTTP for testing; file:// cannot reliably load modules or JSON.

- Use migration 003 after 001 and 002. Preserve ownerless sample rows. Enforce ownership with RLS, not UI visibility. Never transfer owner_id.
- JPEG/PNG/WebP uploads only, maximum 5 MiB, under user-id/unique-name. Never delete shared sample images. Document retained/orphan upload cleanup.
- College-demo auth uses email/password only with Confirm email disabled manually in the NEW project. Redirect only on a real SDK session; otherwise explain the setting. No OTP, magic-link, resend, reset, invitation, or welcome-email flows. Keep SDK persistence/refresh and ownership/RLS.

- Run migration 004 manually after 003 in the NEW project. Never execute remote migrations automatically.
- One spot per listing. Store UTC timestamptz; parse/display input explicitly as Asia/Kolkata (+05:30). Confirmed intervals are [arrival, departure); 30 minutes through 7 days, arrival in the future.
- All booking writes go through create_booking with auth.uid(), authoritative numeric pricing, row locks and a GiST exclusion constraint. No direct client table writes. Quote responses must never disclose other bookings or identities.
- Price: actual duration per minute; round subtotal to 2 decimals, round 5% service fee to 2 decimals, add them. Require review if the rate changes. Snapshot amounts on bookings.
- Preserve idempotency keys across uncertain retries and validate identity/request matches. Preserve history with restrictive listing FK deletion; owners unpublish instead.

- Apply 005 manually after 004 in the NEW project. Existing bookings backfill unpaid without changing stored prices or reservation status.
- Payment state is separate from reservation status. Failed simulation keeps the spot confirmed; no automatic expiration/holds. Only the driver may simulate or cancel.
- Protect mutations with SECURITY DEFINER RPCs, empty search_path, qualified objects, auth.uid() checks, booking FOR UPDATE locks and restricted execute grants. No direct table writes.
- Cancellation only before arrival; repeated cancellation is safe. Paid cancellation records demo_refunded (no real refund); unpaid/failed history remains. Keep append-only private simulation history and request-key retry validation.
- Owners only view reservations for their spaces, never mark paid/cancel/alter booking prices or statuses. Derive time categories in JavaScript; database time remains authoritative for mutations.
