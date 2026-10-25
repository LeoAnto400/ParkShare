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

    Open [the website](http://127.0.0.1:5500/index.html). Use `py` if that is your Python launcher. Keep the terminal running. Do not double-click HTML files; modules and fetch require HTTP.
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
4. Under Authentication → Providers / Sign-in methods, enable Email/password signup. Keep email confirmation enabled for the normal flow. Set minimum password length to at least 8; the form also enforces 8 at signup. Stronger project rules are honored through Supabase error responses.
5. Under Authentication → URL Configuration, set Site URL to `http://127.0.0.1:5500` and add `http://127.0.0.1:5500/login.html` to Redirect URLs. If using localhost or another port, add the exact corresponding origin and login.html redirect. For deployment, add your HTTPS site/login URL. Signup sends its current origin's login.html as emailRedirectTo. Use the normal Supabase confirmation email template; the SDK processes the confirmation redirect and restores the session. Expired confirmation links require a new confirmation flow through your project, not a simulated login.
6. Set `.env` to Supabase mode with ONLY the NEW project's URL and publishable key. Run `python scripts/configure.py`, then `python -m http.server 5500 --bind 127.0.0.1`. Hard-refresh. Do not share tokens, passwords, or secret keys.
7. Open signup.html and register test User A using an email inbox you control. Follow the confirmation email and log in. With confirmation enabled, successful signup alone does not produce a session. Repeat with a different controlled email for User B in a separate private browser profile. Do not invent real people's accounts. For classroom-only testing you can create/confirm test users in Authentication → Users in the NEW project's dashboard; never add passwords to source files. Email rate limits may require waiting or configuring your own SMTP service.
8. As A, add a space and upload a small JPEG/PNG/WebP. Save as draft, edit it, publish it, refresh search, unpublish it, and delete it with confirmation. Reopen the browser to check session restoration. Log out and visit dashboard.html: it should route to login. Demo mode should keep browsing functional and explain that auth/writes are unavailable.

### Two-user permissions checklist (live verification required)

- As anonymous and B: A's published listing is readable; A's draft is absent. Direct public detail URLs must not expose drafts. As A: dashboard includes both own drafts and published rows; ownerless samples never appear there.
- Use browser DevTools Network to inspect the requests. Owner fetch requests must target the NEW hostname and carry apikey plus the current session Bearer access token. Never copy tokens into documentation, chat, or committed files.
- In B's local test browser, use an API client with B's current session token to PATCH or DELETE `/rest/v1/parking_spaces?id=eq.<A-listing-id>`. RLS must change zero rows (commonly an empty response, not necessarily an HTTP error). Confirm A's row is unchanged. Trying to insert with owner_id=A must fail; changing owner_id on an existing B row must fail. Do not weaken RLS to make requests pass.
- As B, attempt Storage upload to `A-user-id/probe.jpg`, overwrite an A object, and delete an A object through Storage API calls. All must fail. B's own folder uploads should succeed. Verify files in A's folder are unchanged. Test oversized and SVG uploads: bucket restrictions must reject them even if frontend validation is bypassed.
- Table Editor/SQL Editor uses elevated permissions and is not a valid test of anonymous or B access. Review `pg_policies` and grants there, but run access tests with the actual user's token.

### Cleanup and recovery

Uploads use unique filenames and do not overwrite images. Editing with a new photo replaces the listing's image URLs, but the old object stays. Deleting a listing does not delete any photo, and a failed save after upload can leave an unused object. This intentionally avoids deleting shared sample photos or a photo from a save whose network response was lost. Clean up verified-unused objects manually in the NEW project's Storage dashboard; do not delete objects still referenced by a listing. If a save's response was interrupted, refresh the dashboard before retrying. A stable ID during retries prevents duplicate new listings, but a saved row may need reopening to continue editing.

If login fails, check email confirmation, password policy, Email provider settings, rate limits, URL allowlist, and CDN connectivity. If owner writes fail, confirm migration 003 was run after 001 and that the session is active. If uploads fail, check bucket MIME/size settings and folder policies. Never fix permissions by using a service-role key or disabling RLS.

Official references: [Auth state changes](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
