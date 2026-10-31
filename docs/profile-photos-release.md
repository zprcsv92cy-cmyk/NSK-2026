# Private player and coach profile photos

Branch: `feat/profile-photos-20261031`. No production roster, cards, grants or photos were written during tests.

## Behavior

- Person cards provide library, camera and remove controls, independently of card editing.
- New personal grant `photos:manage` is shown as **Ändra profilbilder** in user administration. `roster:manage` does not imply photo access. The server-verified primary administrator always has full photo rights. Existing grants are not automatically expanded for other users. Existing team membership, read access and read-only viewer policy still apply.
- A single image appears in the card and in the existing 40 × 44 px roster badge, replacing both player and coach jersey icons. Missing, removed or failed images fall back to `icon-192.png` (the existing NSK knight crest).
- Camera and library inputs accept images. Client decoding, center cropping and JPEG encoding strip original metadata and produce 384 × 384 photos, capped at 96 KiB. JPEG/PNG and formats the device can decode are supported; a decode error leaves the existing photo intact.
- Photos use the existing private D1 binding, in an independent `person_photos` table. No public object URLs or API keys are placed in image sources. Reads and writes require a personal session and verified team/person ownership. Photos are returned through authenticated, no-store JSON and displayed with in-memory blob URLs. Logout revokes these URLs.
- Photo revisions are independent from material/card revisions. Atomic compare-and-swap prevents concurrent overwrites; removal leaves a revision tombstone. Personal image bytes are removed when replaced or deleted.
- Same-page card/list images share one URL. Other signed-in clients check the manifest every 30 seconds while visible and on focus. No photo is written to localStorage, sessionStorage or the view cache.

## Validation

- `node --test scripts/*.test.mjs scripts/*.test.cjs worker/*.test.mjs`: 1,060 passing tests at implementation time, no failures.
- Photo tests use an in-memory SQLite database with the actual migration and SQL, synthetic JPEG bytes, two independent client contexts, invalid sessions, unrelated teams, permission changes, upload/replacement/removal and concurrent writers.
- `NSK_JSDOM_MODULE=/path/to/jsdom/lib/api.js node scripts/person-photos-dom-check.mjs`: actual person-card DOM integration, player and coach controls, permission separation, image propagation, removal and camera input attributes. `jsdom@26` is only a test dependency, not application runtime code.
- API and auth `wrangler@4.156.0 deploy --dry-run` builds pass. No deployment occurs in a dry run.
- Physical iPhone camera/library interaction, HEIC device decoding and visual layout on real iOS remain a release check. The environment's browser cannot open local test fixtures; no production upload was substituted for that check.

## Publication order

1. Apply `migrations/20261031_person_photos.sql` to the intended isolated D1 database, then validate the API with synthetic accounts/roster there. The migration only creates a new table; it never edits roster or existing card rows.
2. Review API and authentication Worker bundles with their existing binding-preservation release procedures. Both Workers must use the updated permission definitions; the API requires the new D1 table.
3. For production release, apply the same create-table migration once, deploy the coordinated API/auth versions, then publish the frontend. Keep existing bindings and secrets. Do not grant photo rights to other accounts automatically.
4. In the signed-in app, verify logo fallback and that the primary administrator can see photo controls. Test actual uploads only in the isolated team/environment until production writes are explicitly intended.
5. On a physical iPhone, verify camera, library, portrait/landscape orientation, replace/remove, small-width layout, and a second signed-in user's refresh. Use synthetic photos/persons in the isolated environment.

No production migration or publication is performed by this change's test workflow. Reverting the frontend/API leaves the photo table intact and does not alter existing cards.
