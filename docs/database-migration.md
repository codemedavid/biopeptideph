# Database and ImageKit migration

The local export is in `migration-backups/supabase-2026-09-16/` (ignored by Git because it contains customer data). The current SQL target is PostgreSQL. No source records are modified by these scripts.

Destination supplied: Supabase project `qjaldxpvjeyvaowwkmmw` (`https://qjaldxpvjeyvaowwkmmw.supabase.co`). ImageKit endpoint: `https://ik.imagekit.io/jl17byaav`. The public Supabase anon key cannot import SQL, and an ImageKit account ID/endpoint cannot authorize uploads. Use the destination SQL editor or a privileged database connection for import, and an ImageKit private API key for uploads.

## Export

```sh
node --env-file=.env scripts/export-migration.mjs migration-backups/supabase-2026-09-16
node scripts/build-migration.mjs migration-backups/supabase-2026-09-16
```

Use a fresh directory for each new export. Freeze application writes for the final export: REST pagination is not a database snapshot. Each table is paginated, checked against the API's exact row count, and saved with a SHA-256 checksum. Original numeric JSON values are preserved in the SQL.

The backup includes table JSON, API schema metadata, accessible auth profiles, storage bucket metadata, downloaded storage files, a manifest, and historical migrations from this repository. Downloaded assets use hashed filenames; the manifest maps them to original bucket/object names and MIME types.

## Move images to ImageKit

Create an ignored `.env.imagekit.local` file containing `IMAGEKIT_PRIVATE_KEY=...`. Use a server-side private key, never a Vite-prefixed environment variable.

```sh
node --env-file=.env.imagekit.local scripts/upload-migration-imagekit.mjs migration-backups/supabase-2026-09-16
node scripts/build-migration.mjs migration-backups/supabase-2026-09-16 --imagekit
```

Uploads use ImageKit's [server upload API](https://imagekit.io/docs/api-reference/upload-file/upload-file). The uploader checkpoints successful files in `imagekit-url-map.json` and skips them on reruns. All uploads are private. Only images referenced by table records are uploaded, deduplicated by SHA-256; unreferenced objects stay in the complete local archive. The current snapshot has 972 image references backed by 965 unique images. PDFs and other files remain in the backup and need a destination storage decision. External Google Drive/Pexels links and local app assets retain their existing URLs.

`migration-imagekit.sql` replaces matching Supabase image URLs, including URLs inside JSON/text, with stable website paths `/api/media/<sha256>`. Original JSON exports remain unchanged. It also generates the server-only allowlist `api/_lib/image-assets.json`. Ship that file and the media route together. Do not store expiring signed URLs in the database.

## Private delivery and bandwidth

The website validates the existing shopper/admin session, then redirects directly to a signed ImageKit URL. Image bytes travel from ImageKit to the browser, avoiding an image proxy through the website server. Payment proofs are admin-only; catalog images accept valid shopper or admin sessions. Ordinary cross-site embeds and direct website-route navigation are rejected through Fetch Metadata checks, in addition to session authorization.

Links expire in 5–10 minutes, using stable five-minute signing windows to improve reuse. As agreed, a copied signed link can be opened elsewhere until it expires; visible images can always be saved. ImageKit [private files and signed URLs](https://imagekit.io/docs/media-delivery-basic-security) are access controls, not DRM. Do not configure public named transformations that bypass the intended private-file restrictions.

Only four resize widths are signed: 320, 640, 960 and 1600. Delivery uses automatic format negotiation, quality 75 and no upscaling. Product/cart images load lazily and use smaller sizes; hero images request 1600px. Useful browser/CDN caching remains enabled to reduce repeat bandwidth. Authenticated catalog redirects use private caching for four minutes; payment-proof redirects are not cached. There are no random cache-busting URLs or unlimited transformation parameters.

Set `IMAGEKIT_PRIVATE_KEY` in the deployed API's server environment. It must not enter the frontend bundle. Local development also needs this environment variable loaded by the API process. The original upload controls still upload to Supabase; moving future uploads to ImageKit requires a separate authenticated upload endpoint and a persistent asset registry. This integration covers the exported snapshot.

Verification and cleanup commands:

```sh
node --env-file=.env.imagekit.local scripts/check-imagekit-delivery.mjs migration-backups/supabase-2026-09-16
node --env-file=.env.imagekit.local scripts/cleanup-imagekit-migration.mjs migration-backups/supabase-2026-09-16
# After reviewing the generated cleanup plan:
node --env-file=.env.imagekit.local scripts/cleanup-imagekit-migration.mjs migration-backups/supabase-2026-09-16 --apply
```

Cleanup removes only this migration's superseded public uploads and requests a CDN purge. It verifies local archive checksums first and never deletes the source Supabase objects. Keep those source objects until the database/app cutover and PDF migration are complete.

## Import into an empty PostgreSQL database

```sh
psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -f migration-backups/supabase-2026-09-16/migration-imagekit.sql
```

Before ImageKit upload, use `migration.sql` instead. The SQL creates new public tables, loads records, adds discoverable primary keys, and verifies row counts in one transaction. Existing tables cause an error; it does not overwrite or delete destination data. Use a disposable destination for the first import.

All created tables have RLS enabled with no policies. Restore the required source access policies before using the destination app; this avoids exposing customer records through Supabase's public API during setup.

The export's `verification.json` records a test restore into PGlite, comparisons of every restored row and column against the original JSON, and checksum verification of every downloaded storage file. To repeat with a temporary PGlite installation:

```sh
PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite/dist/index.js \
  node scripts/verify-migration.mjs migration-backups/supabase-2026-09-16
```

Add `--imagekit` to verify the rewritten SQL and generate `verification-imagekit.json`.

## Scope and remaining work

This is a data recovery migration, **not a complete production schema dump**. Direct PostgreSQL access failed DNS resolution. REST exposes table types, nullability, and primary-key hints but does not provide enough metadata to reliably recreate all defaults, foreign keys, checks, unique constraints, indexes, triggers, SQL functions, RLS policies, grants, sequences, roles, or unexposed schemas. These are deliberately not guessed. Historical migrations are reference material, not an automatically verified replacement for the live schema.

Obtain a working Supabase session-pooler connection string to create a full `pg_dump` before final cutover. Auth profile JSON does not include password hashes or a restorable full auth schema. Storage objects are separate from SQL. Review exported session/access settings before production use and restore the necessary schema/security behavior before exposing the destination app. The current frontend and backend still use Supabase; this task prepares migration artifacts and does not switch the application connection or uploads.
