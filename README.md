# ParkShare — parking discovery and Supabase reads

A Web Technologies class demonstration built with semantic HTML5, CSS3, and vanilla JavaScript. Eight fictional parking listings around Manipal and Udupi demonstrate finding and comparing spaces. Addresses are invented; availability is not checked. This separate rebuild lives entirely in ParkShare.

## Run

Local values live in `.env` (ignored by Git). On a fresh clone, copy `.env.example` to `.env` first. Run the configuration script below after every edit; it generates ignored `js/config.js`. This is a local utility, not a backend or build framework. Only use the new project URL and publishable key. `.env` and generated browser config are not secret storage: the browser sees the key, and the simple static server can serve files in this folder. Never put passwords or secret keys here. Exclude `.env` from any deployed files.

With Python 3 installed, run in PowerShell:

```powershell
cd C:\Users\leoan\projects\ParkShare
python scripts/configure.py
python -m http.server 5500 --bind 127.0.0.1
```

Open http://127.0.0.1:5500/index.html. Keep the terminal running; Ctrl+C stops it. If only the Windows Python launcher is available, replace `python` with `py`. If the port is occupied, use 5501 in both the command and URL.

Do not double-click HTML files: file:// cannot reliably load JSON or ES modules. The command serves static files only, not an application backend. Demo mode requires no credentials, npm install, build, or environment variables. For optional Supabase mode, follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) to create a NEW, separate project; never reuse the old ParkNest resources.

## Files to study

```text
index.html                  Home, semantic sections, native GET search form
search.html                 Labeled filters and results containers
space.html                  Detail structure and informational booking panel
css/styles.css              Variables, Flexbox, Grid, responsive media queries
js/config.js                Demo/Supabase switch and NEW-project placeholders
js/data.js                  Shared fetch, config/data validation, REST mapping
sql/001_schema.sql          Table, constraints, RLS, anonymous read-only policy
sql/002_seed.sql            Eight fictional rows; safe to rerun
SUPABASE_SETUP.md           Manual NEW-project setup and troubleshooting
js/ui.js                    DOM creation, textContent, card rendering, fallback
js/home.js                  Featured listings and retry event
js/search.js                Events, combined filters, sorting, URL handling, reset
js/space.js                 ID lookup, detail DOM updates, error handling
data/spaces.json            Eight fictional listings with consistent fields
assets/neighborhood.svg     Original local hero illustration
assets/parking-fallback.svg Original local image fallback
AGENTS.md                   Future-session technology and scope constraints
```

Trace AJAX: page imports `loadSpaces()` → `fetch()` requests JSON → `await` parses it → page filters the array → `renderCards()` creates DOM nodes → `replaceChildren()` updates results without a reload. `textContent` treats user input and listing data as text, not HTML. Event listeners connect form changes to this process. The home GET form transfers location in the URL; `URLSearchParams` reads it.

## Features and behavior

- Home hero, featured spaces, navigation, concept steps, and footer.
- Case-insensitive location substring matching against title, locality, city, and address. Submit Search or Enter to apply location edits; blank location shows all areas.
- Maximum hourly price, vehicle, EV, and covered-parking filters combine with AND and update immediately. Price sorting works in both directions.
- Reset restores the maximum listing price (at least ₹100), all vehicles, no amenities, and featured order, while preserving location. Clear location and submit to explore all areas.
- Loading, no-results, and loading-error states with retry; safe DOM updates and accessible labels, focus indicators, skip links, and live result counts.
- Detail photos, description, address, vehicles, amenities, rules, and a clearly informational booking panel. Details-to-search preserves location; other refinements are not persisted.
- Fixed Unsplash photo URLs are illustrative, not actual properties. Failed photos switch to a local SVG. Core functionality needs only the local server. There are no external fonts or styles. Supabase mode dynamically loads the official SDK for auth and Storage; demo browsing needs no SDK.

## Manual testing checklist

1. Submit Manipal from home: URL contains `location=Manipal`, four results. Udupi has four; Malpe has one.
2. In Manipal, select EV and covered: only Green Lane remains. Select Bike: no results. Reset: four Manipal results and location retained.
3. Set Manipal maximum price to ₹35: Courtyard and Lakeside remain. Sort ascending (₹10, ₹35) and descending (₹35, ₹10).
4. Follow a card and Back to search. Try `space.html?id=pn-001`, `space.html?id=unknown`, and `space.html`.
5. Block `*spaces.json*` in browser DevTools and reload search. Unblock and click Retry loading: results return without a reload. Throttle the network to inspect the loading state.
6. Block `images.unsplash.com` and reload: local fallback illustrations replace photos; details remain usable.
7. Inspect at 375px, 768px, and 1440px widths. Check no horizontal overflow, stacked grids, and readable controls. Tab through controls and activate them with the keyboard.

## Previous-stage browser verification

Browser checks covered the home form's location transfer, combined amenity/vehicle filters, no results, reset preserving location, both sort directions, valid details, and missing/invalid IDs. Temporarily removing JSON verified the loading-error state and successful Retry recovery. JavaScript syntax checks passed. Home was visually inspected at the available viewport. Full mobile/tablet/desktop device emulation, screen-reader testing, and throttled loading timing were not available; use the manual checklist for these.

The image fallback was also verified in the browser by temporarily assigning a missing photo URL; the original data was restored afterward.

## Remaining stages

Availability, reservations, payments, admin features, and service-fee calculations remain deferred. No fake booking success is shown. PHP and frontend frameworks are prohibited.

## Current data stage

`js/config.js` defaults to demo. Supabase mode uses the NEW project REST API with an apikey header, published-only queries, and a dedicated single-ID lookup. Database columns map into the existing UI format. Browser filtering/sorting remains unchanged. Invalid configuration, failed requests, and invalid data produce visible errors with retry, never a silent fallback. An empty table is valid and shows empty states.

Repository inspection found no existing Supabase configuration or CLI association. No old project or remote database was accessed. Local mocked REST tests can be run with `node tests/data.test.mjs`; they never contact Supabase. Live database schema execution, RLS permissions, and new-project REST verification remain pending your manual setup.

Current-stage checks passed: JavaScript syntax, mocked demo and REST reads, configuration rejection before requests, published query and ID parameters, field mapping, empty data, malformed rows/JSON, HTTP errors and network failures. Local HTML links, branding, and seed ID consistency were also checked. No current-stage browser/device retest or live PostgreSQL execution was performed; the browser checks above describe the previous stage.

## Authentication and owner stage

New pages: `signup.html`, `login.html`, and `dashboard.html`. Signup collects name/email/password/confirmation; email confirmation may be required before login. SDK-managed sessions restore automatically. Signed-out dashboard visitors go to login, which returns to the dashboard. Demo mode shows a browse-only explanation without fake login or saving.

Run `sql/003_owners_and_storage.sql` manually in the NEW project, following the owner-stage instructions in [SUPABASE_SETUP.md](SUPABASE_SETUP.md). It preserves samples, adds ownership, replaces listing RLS policies, and configures the public parking-images bucket with user-folder writes and 5 MiB JPEG/PNG/WebP limits.

Owners can create/edit drafts, publish/unpublish, and delete with confirmation. Forms retain values on failure. Photos upload before listing saves. No automatic photo deletion occurs: replaced images, deleted-listing images, and failed/interrupted-save uploads may remain for manual cleanup. Public images are not private even for drafts.

Class study examples:
- `js/auth-page.js`: native form validation, password confirmation, loading/duplicate-submit guard, honest confirmation handling.
- `js/auth.js`: official SDK initialization, session restoration and refresh (no custom password/token storage code).
- `js/nav.js`: session-driven DOM navigation and logout.
- `js/dashboard.js`: DOM creation, form population, event listeners and save states.
- `js/owner-data.js`: explicit authenticated fetch CRUD with apikey and Bearer access-token headers; field/photo validation and SDK uploads.
- `sql/003_owners_and_storage.sql`: grants, RLS USING/WITH CHECK, immutable ownership through column privileges, folder-scoped Storage policies.

Dependency: official `@supabase/supabase-js` 2.49.8 from jsDelivr ESM, dynamically imported only in Supabase mode. Internet access to this CDN is needed for auth. Keep this dependency version reviewed before deployment. No PHP or framework has been introduced.

Owner-stage local verification: `node tests/data.test.mjs` and `node tests/owner.test.mjs` pass. Tests mock the SDK/network boundary and verify listing validation, photo type/size limits, authenticated headers, owner filters, CRUD methods, empty denied-write responses, user-folder upload paths, and upload failures. All JavaScript syntax checks and local links/assets across six HTML pages pass. Configuration still contains placeholders, so no live signup/login, session restoration, SQL migration, RLS, Storage, or two-user API checks were performed. Browser automation was unavailable for this stage; responsive layouts and full UI interaction require the manual checklist. Mocked denials do not prove database permissions: run the two-user checks in SUPABASE_SETUP.md after migration.
