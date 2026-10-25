# ParkShare — demo and Supabase listing reads

- Work only in this new ParkShare directory. Do not modify the older application.
- Use semantic HTML5, separate CSS3, and vanilla JavaScript ES modules. No frameworks, TypeScript, UI libraries, or build frameworks. The official Supabase JavaScript SDK is allowed for auth/session management and Storage.
- Keep code readable for a Web Technologies student; explain meaningful AJAX, event, filtering, and DOM behavior in comments.
- No PHP. Use fetch() for JSON and Supabase REST; no backend; keep listing CRUD as explicit fetch requests. Keep demo mode enabled initially.
- Dedicated NEW ParkShare Supabase project only. Never connect to, query, migrate, or modify old ParkNest resources; never reuse their credentials or data.
- SQL is prepared locally and run manually by the user. Do not automatically run remote database commands or associate this repository with an old CLI project.
- Frontend accepts only a browser-safe publishable key, never secrets, service-role keys, or passwords. Validate configuration first; never silently fall back to demo.
- Current stage: auth, owner dashboard/CRUD, image uploads, dual-source browsing, and local migrations. Future: bookings, payments, admin tools.
- Scope includes signup/login/logout, SDK sessions, owner drafts and published listings, and user-folder Storage uploads. No bookings, payments, or admin dashboard.
- Label demo data and unverified availability. Keep the booking panel explicitly informational.
- Use textContent for data, accessible labels/focus, responsive layouts, and local image fallbacks.
- Serve through HTTP for testing; file:// cannot reliably load modules or JSON.

- Use migration 003 after 001 and 002. Preserve ownerless sample rows. Enforce ownership with RLS, not UI visibility. Never transfer owner_id.
- JPEG/PNG/WebP uploads only, maximum 5 MiB, under user-id/unique-name. Never delete shared sample images. Document retained/orphan upload cleanup.
