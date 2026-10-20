# Production personal-permissions cutover — 2026-10-20

Owner approval has been received to switch from shared Adminläge to personal team permissions, but approval alone does not guarantee safe implementation.

## Prepared, not released
- Frontend `config.js`: personal pool, match, roster and coach-selection switches on in THIS BRANCH ONLY.
- Production Worker manifest: pool, match and coach-selection guards on in THIS BRANCH ONLY.
- The active Worker remains version `7434d756-524c-43c4-95b2-73cc942a256b` at 100% from the last read; capture again at release time.
- Existing staged Worker `c4a7024e-6621-4e7d-8b88-7ef3cdecd670` has write switches OFF; it is **not** a complete cutover release.
- Isolated Preview is live and has passed anonymous 401 read/write tests. These tests do not establish a successful authenticated write with the same runtime/data bindings as production.

## Blockers before merging/publishing
1. The eight legacy `admin-mode.js` imports now hide the shared control and show Mitt konto when all personal switches are enabled. `pool-team-editor.js` now uses the personal pool grant during cutover, and `db.js` prevents shift/matchcode fallbacks without a personal session. **Still required:** full browser end-to-end checks for all pages, logout, cache transitions and existing match functionality; do not treat unit tests as production proof.
2. Release-branch feature-flag tests now expect all switches on and pass. The existing upload-only GitHub workflow still requires switches OFF; create a reviewed release-specific process rather than bypassing this safeguard.
3. Publish the frontend and Worker as one coordinated transition. Turning on the frontend first sends personal tokens to the old API; turning on the Worker first may reject existing admin-token requests. Use a safe compatibility phase or planned controlled cutover.
4. Preserve `AUTH_DB`, `ADMIN_KV`, `NSK_TRAINERS`, the existing `SHIFT_LOCK` namespace and migration history, and all secrets. A Worker-version rollback does not recover changed D1/KV/Baserow/Durable Object data.
5. Confirm how to return to the last working frontend and Worker version together, then verify positive authorized Team 18 writes, denied Testlag 2 writes and continued function of shifts, lineup, coach selections and match UI. The existing preview tests verify anonymous denial, not successful personal saves in production.
6. Recheck GitHub checks, live Worker traffic/bindings and release gate immediately before cutover.

**Do not merge this PR or deploy its manifest until these checks are satisfied.**
