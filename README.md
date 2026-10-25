# ParkNest — stage one

A Web Technologies class demonstration built with semantic HTML5, CSS3, and vanilla JavaScript. Eight fictional parking listings around Manipal and Udupi demonstrate finding and comparing spaces. Addresses are invented; availability is not checked. This separate rebuild lives entirely in ParkShare.

## Run

With Python 3 installed, run in PowerShell:

```powershell
cd C:\Users\leoan\projects\ParkShare
python -m http.server 5500 --bind 127.0.0.1
```

Open http://127.0.0.1:5500/index.html. Keep the terminal running; Ctrl+C stops it. If only the Windows Python launcher is available, replace `python` with `py`. If the port is occupied, use 5501 in both the command and URL.

Do not double-click HTML files: file:// cannot reliably load JSON or ES modules. The command serves static files only, not an application backend. No npm install, build, credentials, or environment variables are required.

## Files to study

```text
index.html                  Home, semantic sections, native GET search form
search.html                 Labeled filters and results containers
space.html                  Detail structure and informational booking panel
css/styles.css              Variables, Flexbox, Grid, responsive media queries
js/data.js                  Shared async fetch, HTTP checks, JSON parsing
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
- Reset restores ₹100, all vehicles, no amenities, and featured order, while preserving location. Clear location and submit to explore all areas.
- Loading, no-results, and loading-error states with retry; safe DOM updates and accessible labels, focus indicators, skip links, and live result counts.
- Detail photos, description, address, vehicles, amenities, rules, and a clearly informational booking panel. Details-to-search preserves location; other refinements are not persisted.
- Fixed Unsplash photo URLs are illustrative, not actual properties. Failed photos switch to a local SVG. Core functionality needs only the local server. There are no external fonts, styles, or scripts.

## Manual testing checklist

1. Submit Manipal from home: URL contains `location=Manipal`, four results. Udupi has four; Malpe has one.
2. In Manipal, select EV and covered: only Green Lane remains. Select Bike: no results. Reset: four Manipal results and location retained.
3. Set Manipal maximum price to ₹35: Courtyard and Lakeside remain. Sort ascending (₹10, ₹35) and descending (₹35, ₹10).
4. Follow a card and Back to search. Try `space.html?id=pn-001`, `space.html?id=unknown`, and `space.html`.
5. Block `*spaces.json*` in browser DevTools and reload search. Unblock and click Retry loading: results return without a reload. Throttle the network to inspect the loading state.
6. Block `images.unsplash.com` and reload: local fallback illustrations replace photos; details remain usable.
7. Inspect at 375px, 768px, and 1440px widths. Check no horizontal overflow, stacked grids, and readable controls. Tab through controls and activate them with the keyboard.

## Verification

Browser checks covered the home form's location transfer, combined amenity/vehicle filters, no results, reset preserving location, both sort directions, valid details, and missing/invalid IDs. Temporarily removing JSON verified the loading-error state and successful Retry recovery. JavaScript syntax checks passed. Home was visually inspected at the available viewport. Full mobile/tablet/desktop device emulation, screen-reader testing, and throttled loading timing were not available; use the manual checklist for these.

The image fallback was also verified in the browser by temporarily assigning a missing photo URL; the original data was restored afterward.

## Remaining stages

Authentication, owner listing management, Supabase database and photo storage, availability, reservations, payments, and service-fee calculations are deferred. No fake booking success is shown. Replace the small `js/data.js` module when adding Supabase. PHP is not needed now.
