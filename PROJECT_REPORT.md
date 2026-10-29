# ParkShare Project Report

ParkShare is a parking-space sharing website developed as a Web Technologies college demonstration. Owners publish available parking spaces, and drivers find a space, check its availability, reserve it, and use a clearly labelled simulated payment flow. The project demonstrates semantic HTML, responsive CSS, JavaScript events and DOM manipulation, asynchronous requests, authentication, relational databases, and database-enforced access control.

This report describes the current implementation through migration 007. New listed prices include the platform fee, the owner form supports multiple photos and weekly opening hours, and coordinate inputs have been removed. Earlier bookings retain their original stored prices. Real payments and withdrawals are outside the implemented scope.

## Project purpose and users

The application connects people who have unused parking spaces with people who need parking for a specific period. It treats each listing as one reservable parking spot.

There are three usage contexts:

| User context | Available functions |
| --- | --- |
| Visitor | Browse published spaces, filter and sort results, view details and reviews, get directions, and request availability/pricing in Supabase mode. |
| Signed-in driver | Create reservations, view personal bookings, simulate payment, cancel eligible bookings, and review completed reservations. |
| Signed-in owner | Create and edit listings, manage photos and opening hours, publish/unpublish spaces, view reservations for owned spaces, and inspect demo earnings. |

Owner and driver are capabilities of the same account system, not separate authentication systems. An account can list its own spaces and book another person's space. Owners cannot reserve their own listings.

## Technology stack

| Technology | Role in ParkShare |
| --- | --- |
| HTML5 | Page structure, navigation landmarks, forms, labels, tables, and native input validation. |
| CSS3 | Shared styling, colors, typography, Grid/Flexbox layouts, responsive behavior, focus indicators, and state presentation. |
| Vanilla JavaScript | Application behavior, validation, events, filtering, calculations, session-aware navigation, and DOM rendering. |
| JavaScript ES modules | Separate responsibilities into reusable modules with explicit imports and exports. |
| Fetch API | AJAX requests for local JSON, listing REST operations, booking reads, and database RPC calls. |
| JSON | Demo listing data, API request/response payloads, and weekly schedule representation. |
| Supabase Auth | Email/password signup and login, access tokens, session persistence, refresh, and logout. |
| Supabase JavaScript SDK | Official SDK used for authentication/session management and Storage uploads. The source currently pins version 2.49.8 through a CDN import. |
| Supabase REST API | Browser access to permitted PostgreSQL data and narrowly scoped database functions. |
| PostgreSQL | Persistent relational data, constraints, indexes, transactions, authoritative pricing, and overlap prevention. |
| SQL and PL/pgSQL | Schema migrations, Row Level Security policies, validation functions, aggregates, and protected mutations. |
| Supabase Storage | Parking-image storage with user-folder write restrictions and upload limits. |
| Google Maps links | External directions and location search generated from structured address/location data. |
| Python 3 | Local configuration generation, static HTTP serving, and the optional local database test runner. |
| Node.js | Development tests and JavaScript syntax checks; not the website's application server. |
| Git | Version control and exclusion of local configuration from tracking. |

There is no PHP, React, Angular, Vue, TypeScript, Express application server, or frontend build framework. No npm build is required to run the website.

The application has no custom backend server. Supabase supplies backend services, while sensitive business rules execute inside PostgreSQL functions. Python's HTTP server only serves files; it does not authenticate users or process reservations.

## Architecture and data flow

The browser loads an HTML page, the shared stylesheet, and the relevant JavaScript modules. Those modules either read local JSON in demo mode or communicate with the NEW ParkShare Supabase project.

The main request path is:

1. A user submits a form or changes a control.
2. JavaScript validates the input and updates loading/disabled states.
3. A data module sends an asynchronous request using `fetch()` or the allowed SDK functionality.
4. Supabase authenticates the request and PostgreSQL applies permissions, constraints, and business rules.
5. The response is parsed as JSON.
6. JavaScript updates the relevant DOM elements without requiring a full page reload.

Listing CRUD remains explicit REST `fetch()` code. Booking, payment, cancellation, and review mutations call protected database functions. Authentication and image uploads use the official SDK.

The browser's price calculation and action eligibility checks improve usability; the database makes the final decision. Hiding a button is not treated as authorization.

## Implemented functionality

### Shared navigation and authentication

Every page uses one shared header renderer with consistent ParkShare branding. The navigation contains Find parking, My spaces, and My bookings. The final control is Log in for a confirmed signed-out state or Logout for a restored signed-in session. During restoration, the header displays a session-checking state; a failed check offers retry instead of assuming a login state.

Signup uses email and password. For the college demo, Confirm email must be disabled manually in the NEW Supabase project. A successful signup redirects only when Supabase returns a valid session. Without a session, the page explains the required configuration.

Protected pages preserve supported return destinations through login. The SDK manages session persistence and refresh. The app does not replace authentication with a localStorage flag. OTP, magic-link, password-reset, resend, invitation, and welcome-email flows are not implemented.

### Discovery and space details

The home page offers a location search and featured listings. Search supports case-insensitive matching across title, address, locality, and city, combined with maximum hourly price, vehicle type, EV charging, and covered-parking filters. Results can be sorted by price in either direction.

Entire listing cards are clickable using native links, including keyboard navigation. Owner edit/publish controls remain separate. Filtering occurs in the browser after listings load. Reset restores the refinements while keeping the chosen location. Loading, empty, and error states have visible feedback and retry controls.

Space details show the gallery, description, address, supported vehicles, amenities, rules, weekly opening hours, rating summary, reviews, and booking form. Photo failures use a local SVG fallback. Demo/sample photos are illustrative rather than evidence of an actual property.

### Owner listing management

My spaces supports creating drafts, editing listings, publishing, unpublishing, and deletion where history permits it. Editable fields include title, description, locality, city, address, hourly price, supported vehicles, amenities, parking rules, photos, publication status, and weekly opening hours.

Amenities have checkboxes for EV charging, Covered parking, Security, and CCTV camera, plus an Others text field with one additional amenity per line. Existing custom amenities are retained when a listing is edited.

Owners can select multiple JPEG, PNG, or WebP photos, with a maximum of 5 MiB per file. Selections accumulate in a preview list; individual photos can be removed before saving. At least one photo is required. The first retained photo becomes the card image. Successful uploads are retained in the editor's retry state so a later failed save need not upload those same items again.

Removing a photo unlinks it from the listing; it does not delete its Storage object. Unlinked images and interrupted uploads may require manual cleanup after checking references. Shared sample images must not be deleted.

Latitude and longitude are no longer entered in the owner form. Existing stored coordinates remain available. If the owner changes the address/locality/city, the old listing pin is cleared so directions use the updated address. Existing booking location snapshots are preserved.

### Weekly opening hours

An owner can choose either the same hours on selected weekdays or different hours for each weekday. Unchecked days are closed. At least one day must be open; unpublishing is the way to stop accepting all new reservations.

Schedules use Monday-to-Sunday ordering and Asia/Kolkata time. A closing time of 00:00 means midnight at the end of that day. A range of 00:00–00:00 means 24-hour opening. Overnight service is represented across adjacent days: Monday 22:00–00:00 and Tuesday 00:00–02:00, for example.

The whole reservation must fit within opening windows, including every crossed date. Both quote and booking creation enforce this in PostgreSQL. Existing listings default to 24/7 until edited. Changing opening hours does not cancel an existing confirmed reservation.

### Reservations and availability

The booking form collects arrival, departure, supported vehicle type, and registration. Arrival must be in the future; duration must be between 30 minutes and seven days. Unsupported vehicles, invalid registration, unpublished listings, self-bookings, and out-of-hours intervals are rejected.

Date/time input is explicitly interpreted as Asia/Kolkata, even when the browser uses another timezone. PostgreSQL stores timestamps using `timestamptz`, and the interface displays them in IST.

Availability checks do not hold a spot. Confirmation checks availability again, and a database exclusion constraint prevents overlapping confirmed reservations even if requests arrive simultaneously. Intervals are half-open: a booking ending at 11:00 permits another starting at 11:00. Cancelled reservations do not block availability.

Each confirmation attempt has an idempotency key. Retrying an uncertain request can recover the original booking instead of creating a duplicate. The database verifies that a reused key matches the same user and request.

### Current pricing model

The owner enters the amount the driver pays per hour, including the platform fee.

| Amount | Calculation |
| --- | --- |
| Driver total | Round(hourly price × duration in minutes ÷ 60, 2) |
| Platform fee | Round(driver total × 0.05, 2) |
| Owner parking amount | Driver total − platform fee |

For ₹100 per hour and a one-hour stay, the driver total is ₹100, the platform fee is ₹5, and the owner amount is ₹95. For ₹40 per hour and 90 minutes, the driver total is ₹60, the platform fee is ₹3, and the owner amount is ₹57.

JavaScript provides a preview, while PostgreSQL calculates the authoritative quote and saved amounts using numeric arithmetic. If the rate changes before confirmation, the driver must review a new quote. Existing reservations retain their stored rate and amounts after later listing edits.

Migration 007 marks historical bookings as `exclusive_v1` and new bookings as `inclusive_v1`. Historical bookings keep their previous added-fee calculation; they are not repriced. The database field `parking_subtotal` represents the stored owner parking amount, which earnings reports sum without another fee deduction.

### Demo checkout and cancellation

Checkout offers two explicit actions: simulate successful payment and simulate failed payment. It displays stored booking amounts and a simulation history. It collects no card number, CVV, UPI ID, or bank information.

Reservation status and payment status are separate:

| Field | Values |
| --- | --- |
| Reservation status | `confirmed`, `cancelled` |
| Payment status | `unpaid`, `demo_failed`, `demo_paid`, `demo_refunded` |

A failed simulated payment leaves the reservation confirmed and its spot reserved. It can be retried. A later failed request cannot downgrade an already successful payment. Idempotent request handling prevents repeated submissions from duplicating successful payment records.

Only the booking's driver can simulate payment or cancel. Cancellation is allowed only before arrival. It releases availability and preserves history. Paid cancellation records a simulated refund; unpaid/failed history remains otherwise. Payment and cancellation lock the same booking row to prevent inconsistent concurrent transitions.

All money-related activity is labelled: **Demo payment — no real money is collected.** No automatic pending-payment expiry, real refund, or withdrawal system is implemented.

### Driver bookings and owner reservations

My bookings displays the signed-in user's driver reservations with upcoming, active, past, and cancelled filters. Categories are derived from timestamps and reservation status; they do not require a scheduled database job. Drivers can view details, resume eligible checkout, and cancel eligible upcoming bookings.

The owner dashboard lists spaces under a single Owner dashboard heading. Clicking a space opens its protected management page with full listing details, a read-only reservation history and category filters, and daily/monthly earnings selected by arrival date in Asia/Kolkata. The former combined reservations and earnings sections have moved off the main dashboard. Owners cannot mark a driver's booking paid, cancel it, or change its stored prices/status. Reservations remain viewable after a listing is unpublished.

Below the space cards, Account earnings combines total, today’s and this month’s owner earnings across all owned spaces, including unpublished listings. It uses the same protected records and period rules as the card figures, without additional requests or another fee deduction.

Each space card displays total, today’s and this month’s completed demo-paid owner earnings, using arrival dates in Asia/Kolkata. Values come from the protected owner earnings breakdown, exclude pending/refunded/ineligible bookings, and refresh with Refresh listings.

Each space card also displays a booking overview: the most recently ended confirmed reservation, the next confirmed arrival, and a current reservation when one is active. Times are shown in Asia/Kolkata with links to booking details. Cancelled bookings are excluded. Empty states distinguish no past/upcoming bookings from a failed data request. Refresh listings retrieves new records; local time categories update every 30 seconds.

### Demo earnings

Each owner space detail page separates completed confirmed demo-paid earnings, upcoming/active paid amounts pending completion, related platform fees, refunds, and excluded unpaid/failed or otherwise ineligible bookings.

Totals use stored booking amounts, once per booking. Receipt existence is checked without joining repeated payment attempts into multiplied totals. Listing and arrival-date filters are supported. Date boundaries use full Asia/Kolkata calendar days. Aggregate totals cover all matching bookings, while the breakdown displays pages of 50 records.

The reporting function derives the owner from `auth.uid()` and does not accept an arbitrary owner identity. It does not provide payouts.

### Reviews and directions

A driver can review a confirmed reservation after departure. There is one review per booking, with an integer rating from 1 to 5 and trimmed text of 10–1000 characters. Saving again edits the existing review; only its driver can edit or delete it.

Public review functions return ratings, comments, and dates without booking IDs, driver IDs, registration numbers, or account details. Cards are labelled Verified booking. Unpublished listings retain their review history but hide it from public reads. Listing rating summaries are fetched in batches rather than once per card.

Directions links use stored coordinates when available, otherwise the full address/locality/city. ParkShare generates fixed Google Maps URLs from structured data, opens them with safe new-tab attributes, and does not request browser geolocation. Copy address provides success feedback and a selectable manual-copy fallback when clipboard access fails.

## Database structure and security

| Table or service | Main responsibility |
| --- | --- |
| `auth.users` | Supabase-managed account identities. |
| `public.parking_spaces` | Listing ownership, descriptions, address, hourly price, vehicles, amenities, rules, photo URLs, publication state, legacy coordinates, and weekly schedule. |
| `public.bookings` | Driver/listing references, time interval, vehicle information, reservation/payment states, retry key, price snapshots, location snapshots, and pricing model. |
| `public.demo_payment_events` | Append-only simulation history with booking/actor references, request keys, outcome, amount, and timestamps. |
| `public.booking_reviews` | One driver review per historical booking, with rating, comment, and timestamps. |
| `storage.buckets` and `storage.objects` | Supabase-managed image storage metadata and policies for the parking-images bucket. |

One user can own many spaces and create many bookings. A space can have many non-overlapping reservations. A booking can have multiple payment-history events and at most one review.

Row Level Security controls which rows a browser session can read or change. Listing owners are enforced with database ownership checks rather than UI visibility. Drivers read their own bookings; owners read bookings associated with owned spaces. Unrelated users cannot read private reservations or payment history. Public reads are restricted to published listings and safe review projections.

Protected functions derive identity from `auth.uid()`, use restricted execution grants, and use safe search paths where needed. Booking creation calculates amounts from database values; it does not trust client-supplied totals or user IDs. Direct writes to sensitive booking/payment/review tables are restricted. Foreign keys retain history instead of cascading it away when a listing is removed.

The frontend uses only a browser-safe publishable key. Authentication tokens are managed by the SDK. DOM content is rendered with `textContent` rather than interpreting user comments or listing fields as HTML. Storage uploads are limited to permitted formats/size and paths under the current user's folder.

The parking-images bucket is public: an uploaded image is not private merely because its listing is a draft. The publishable key is browser-visible by design; security depends on Auth, RLS, grants, and function checks, not on hiding frontend configuration.

## File by file reference

All paths below are relative to `C:\Users\leoan\projects\ParkShare`.

### HTML pages

| File | Purpose |
| --- | --- |
| `pages/index.html` | Home page with hero illustration, location-search form, featured listings, and explanation of the parking flow. |
| `pages/search.html` | Search results, location input, price/vehicle/amenity filters, sorting, and loading/error containers. |
| `pages/space.html` | Individual listing details, gallery, amenities/rules, reservation form, and containers extended with hours, directions, and reviews. |
| `pages/signup.html` | Name/email/password signup form and status feedback. |
| `pages/login.html` | Email/password login form and return-destination flow. |
| `pages/dashboard.html` | Owner dashboard with clickable listing cards, booking overviews, and listing CRUD/editor. |
| `pages/owner-space.html` | Protected full listing details, scoped reservation history, daily/monthly earnings, and detailed earnings filters for one owned space. |
| `pages/confirmation.html` | Protected persisted booking-details page with relevant driver/owner links and payment history. |
| `pages/my-bookings.html` | Protected driver booking list with category filters and permitted actions. |
| `pages/checkout.html` | Simulated checkout actions, stored booking breakdown, retry controls, receipt, and history. |
| `pages/review.html` | Protected rating/comment editor, deletion control, and public-review preview. |

### JavaScript modules

| File | Purpose |
| --- | --- |
| `js/config.js` | Generated local module exporting data source, project URL, and publishable key. Ignored by Git; not a secret store. |
| `js/data.js` | Validates configuration, loads demo JSON or published Supabase listings, maps database fields, validates responses, and batches rating-summary requests. |
| `js/ui.js` | Shared DOM element creation, safe text insertion, listing-card rendering, photo rendering, and image fallback handling. |
| `js/home.js` | Loads featured spaces on the home page and handles loading/retry states. |
| `js/search.js` | Combines filters, sorts results, updates counts/cards, manages location URL parameters, and handles reset/retry events. |
| `js/space.js` | Loads one listing by ID, populates details/gallery, and connects booking, opening-hours, location, and review components. |
| `js/auth.js` | Creates the official Supabase client, exposes session helpers, and manages the SDK boundary for authentication. |
| `js/auth-page.js` | Handles login/signup validation, password confirmation, disabled submit states, errors, and real-session redirects. |
| `js/nav.js` | Builds the same brand/navbar on every page, restores account state, updates Login/Logout, and signs out through the SDK. |
| `js/protected-page.js` | Guards private pages, redirects signed-out users, explains demo-mode limits, and clears private content on account changes. |
| `js/owner-data.js` | Validates owner listing/photo input, performs authenticated listing REST CRUD, and uploads images through the SDK. |
| `js/dashboard.js` | Controls the owner editor and listing cards, populates existing values, collects amenities/hours, previews owner income, and manages photo selection/removal/save retries. |
| `js/schedule.js` | Defines weekday ordering/default hours, validates schedules, builds the daily/custom editor, and renders public opening hours. |
| `js/booking-rules.js` | Shared interval/registration validation, explicit IST conversion, inclusive price preview, money/date formatting, and allowed login-return destinations. |
| `js/booking-data.js` | Shared REST/RPC request helper, database-error mapping, authoritative quote requests, reservation creation, and protected booking lookup. |
| `js/booking.js` | Booking form controller: preview, quote invalidation, availability check, login handoff, confirmation, and idempotent retry state. |
| `js/booking-state.js` | Determines upcoming/active/past/cancelled categories, payment/cancellation action eligibility, and payment labels for presentation. |
| `js/booking-view.js` | Shared rendering of booking details, historical/current pricing labels, directions, and simulated payment history. |
| `js/confirmation.js` | Loads a persisted booking, displays its details/history, and offers checkout or owner/driver navigation as appropriate. |
| `js/management-data.js` | Fetches paginated driver bookings, owner reservations, and payment history; calls payment/cancellation functions. |
| `js/owner-card-earnings.js` | Loads protected earnings pages once for all space cards and groups total/daily/monthly stored owner amounts. |
| `js/owner-booking-summary.js` | Groups owner reservations by space and renders last/current/next summaries without counting cancelled bookings. |
| `js/reservations-list.js` | Shared driver/owner reservation-list controller with filters, counts, refresh, details links, cancellation, and eligible review links. |
| `js/checkout.js` | Controls simulated success/failure, receipt display, safe retry keys, current payment state, and history refresh. |
| `js/owner-space.js` | Loads one owned space, renders full details and reviews, and requests protected daily/monthly earnings totals. |
| `js/earning-periods.js` | Calculates India calendar defaults and inclusive monthly date ranges. |
| `js/earnings.js` | Handles owner earnings filters, aggregate metrics, date input, booking breakdown rendering, and pagination. |
| `js/reviews.js` | Review eligibility/text validation, summary labels, public review fetching/rendering, refresh, and pagination. |
| `js/review-page.js` | Loads the driver's eligible booking/review, saves or deletes it through RPC, and refreshes the public preview. |
| `js/location.js` | Validates legacy coordinates, assembles full addresses, creates encoded map/directions links, and handles copy/manual-copy feedback. |

### Styling and local data

| File | Purpose |
| --- | --- |
| `css/styles.css` | Shared visual design and responsive rules for all pages, cards, forms, navigation, booking states, earnings tables, schedules, and photo previews. |
| `data/spaces.json` | Eight fictional demonstration listings around Manipal and Udupi for local browsing. |
| `assets/neighborhood.svg` | Home-page neighborhood/parking illustration. |
| `assets/parking-fallback.svg` | Local fallback when a listing image cannot load. |

### SQL migrations

Apply these in sequence to the NEW project. Later migrations replace selected functions from earlier stages, so the newest applied definition determines current behavior.

| File | Purpose |
| --- | --- |
| `sql/001_schema.sql` | Initial parking-space schema, field constraints, and published-listing read permissions. |
| `sql/002_seed.sql` | Inserts the fictional sample listings. |
| `sql/003_owners_and_storage.sql` | Adds listing ownership, owner CRUD grants/RLS, and the parking-images bucket with upload policies. |
| `sql/004_reservations.sql` | Introduces bookings, interval validation, participant reads, overlap exclusion, authoritative quote/create functions, and idempotency. Its original pricing is superseded for new bookings by 007. |
| `sql/005_demo_payments_and_management.sql` | Adds payment status/history, protected payment simulation and cancellation, and paginated owner reservations. |
| `sql/006_earnings_reviews_locations.sql` | Adds review schema/functions, public rating summaries, owner earnings, coordinates, and booking-location snapshots. |
| `sql/007_listing_hours_inclusive_pricing.sql` | Adds validated weekly schedules, enforces opening windows, changes new booking prices to include the fee, preserves historical pricing markers, and updates owner projections. |

Important exposed functions include `booking_quote`, `create_booking`, `simulate_booking_payment`, `cancel_booking`, `owner_reservations`, `owner_earnings`, `save_booking_review`, `delete_booking_review`, `rating_summaries`, and `public_space_reviews`. Internal helpers validate intervals/schedules, enforce opening windows, and snapshot locations.

### Tests

| File | Purpose |
| --- | --- |
| `tests/auth-page.test.mjs` | Tests real-session signup redirects, no-session configuration feedback, and login/error behavior using mocks. |
| `tests/data.test.mjs` | Tests demo/REST reads, configuration validation, field mapping, rating batching, and failure handling. |
| `tests/owner.test.mjs` | Tests owner validation, authenticated request behavior, denied responses, and image-upload boundaries. |
| `tests/booking.test.mjs` | Tests timezone conversion, duration/registration rules, current price preview, safe redirects, API payloads, retry consistency, and error mapping. |
| `tests/management.test.mjs` | Tests booking categories/action eligibility, private read paging, and payment/cancellation request structure. |
| `tests/owner-card-earnings.test.mjs` | Tests per-space totals, eligibility exclusions, IST boundaries and protected pagination. |
| `tests/owner-booking-summary.test.mjs` | Tests per-space grouping, cancellation exclusion, last/next selection, empty results, and arrival/departure boundaries. |
| `tests/reviews-location.test.mjs` | Tests review eligibility/limits, coordinates, encoded directions, and clipboard fallback behavior. |
| `tests/nav.test.mjs` | Tests shared header replacement and correct Login/Logout or session-error controls. |
| `tests/earning-periods.test.mjs` | Tests IST date boundaries, month lengths, and safe owner-detail login return paths. |
| `tests/schedule.test.mjs` | Tests daily/custom schedule validation, midnight rules, and inclusive price rounding. |
| `tests/run_sql_checks.py` | Starts a disposable local PostgreSQL instance, applies migrations, checks constraints/permissions/business rules, and stops/removes the test database. Uses minimal Supabase auth/storage stubs, never the real project. |

### Configuration and documentation

| File | Purpose |
| --- | --- |
| `.env` | Local source for the data mode, NEW Supabase URL, and browser-safe publishable key. Values are not included in this report. |
| `.gitignore` | Excludes `.env`, generated `js/config.js`, Python caches, and common local-system files from Git. |
| `scripts/configure.py` | Validates the three supported settings and writes the generated browser configuration module. This is a local utility, not a backend. |
| `README.md` | Project overview, running instructions, implementation history, and demonstration/testing guidance. Older sections describe earlier stages; the 007 section defines current pricing/editor behavior. |
| `SUPABASE_SETUP.md` | Manual NEW-project setup, migration order, authentication setting, permissions, and live testing instructions. |
| `AGENTS.md` | Repository-specific development constraints and preservation/security requirements for future changes. |
| `PROJECT_REPORT.md` | This consolidated account of the current project, architecture, and file responsibilities. |

The documentation references `.env.example`, but that template is absent from the inspected working tree. The existing local `.env` is present. A fresh checkout therefore needs a configuration file containing the three supported settings rather than relying on a missing template.

## Running and demonstrating the project

From PowerShell:

```powershell
cd C:\Users\leoan\projects\ParkShare
python scripts/configure.py
python -m http.server 5500 --bind 127.0.0.1
```

Open `http://127.0.0.1:5500/pages/index.html`. Keep the server terminal running. ES modules and JSON loading require HTTP rather than double-clicking an HTML file.

For persistent features, configure `DATA_SOURCE=supabase` with only the NEW project's root HTTPS URL and publishable key, apply migrations 001 through 007 manually in order, and disable Confirm email before testing signup. Do not rerun earlier successful migrations indiscriminately. No migration is automatically applied by the website.

For local demonstration browsing, use `DATA_SOURCE=demo` and regenerate configuration. Demo mode reads fictional JSON and supports browsing and price previews; it does not fake successful authentication, reservations, payments, reviews, or earnings.

A useful classroom sequence is:

1. Show the common navbar, home search, combined filters, and details page.
2. Sign in as an owner and demonstrate amenities, several photos, a ₹100 hourly rate, and custom opening hours.
3. Use a separate driver account to check an open interval and confirm a booking. Explain the ₹95 owner/₹5 platform split.
4. Use a second driver to request the same interval and demonstrate rejection.
5. Simulate failure then success, show the pending owner amount, cancel before arrival, and show the simulated refund and reopened availability.
6. Use a separate completed reservation to demonstrate review save/edit/delete and completed earnings. Prepare it before class: the minimum reservation duration is 30 minutes and database time controls eligibility.

For explaining Web Technologies concepts, show `pages/dashboard.html` for forms, `css/styles.css` for Grid/media queries, `js/search.js` for array filtering and events, `js/ui.js` for DOM updates, `js/owner-data.js` for AJAX CRUD, and migrations 004/007 for database enforcement.

## Testing status and practical limits

The latest completed implementation checks passed 20 JavaScript tests, syntax checks, local HTML reference/ID checks, and disposable PostgreSQL checks across all seven migrations. Database checks covered stored-price earnings, owner isolation, review eligibility/privacy, coordinate constraints, booking/payment/cancellation behavior, weekly schedule boundaries, overnight gaps, and inclusive pricing. An isolated browser fixture also verified editor save/reopen behavior for amenities, photo removal, and schedule mode/day selections.

These checks do not establish that the NEW hosted Supabase project has been migrated or that its live configuration is correct. Hosted signup/session behavior, PostgREST integration, real Storage uploads, and two-account browser flows still need the manual checklist after setup. The local database runner uses auth/storage stubs rather than the hosted services. Earlier documentation test counts refer to earlier stages.

Current limits include simulated money only, one spot per listing, one opening interval per open day, no real-time push synchronization, no owner approval workflow, no admin panel, no email notifications, no automatic orphan-image cleanup, and no embedded map or geocoding service. Refresh controls retrieve changes made in other sessions; time-category labels update locally. There is no production deployment included in this stage.

The local static server can serve files from its root, so `.env` is not a suitable place for secret/service-role keys or passwords. Generated frontend configuration is visible to browsers. Only publishable configuration belongs in this project, and any eventual deployment must exclude local configuration/source files that should not be served.
