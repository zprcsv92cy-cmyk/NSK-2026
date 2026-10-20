# Production personal-permissions cutover — 2026-10-20

Owner approval has been received to switch from shared Adminläge to personal team permissions, but approval alone does not guarantee safe implementation.

## Prepared, not released
- Frontend `config.js`: personal pool, match, roster and coach-selection switches on in THIS BRANCH ONLY.
- Production Worker manifest: pool, match and coach-selection guards on in THIS BRANCH ONLY.
- The active Worker remains version `7434d756-524c-43c4-95b2-73cc942a256b` at 100% from the last read; capture again at release time.
- Existing staged Worker `c4a7024e-6621-4e7d-8b88-7ef3cdecd670` has write switches OFF; it is **not** a complete cutover release.
- Isolated Preview is live and has passed anonymous 401 read/write tests. These tests do not establish a successful authenticated write with the same runtime/data bindings as production.

## Blockers before merging/publishing
1. Eight pages still load `admin-mode.js`: startsida, truppen, skapapoolspel, laguppstallning, bytesschema, matchvy, malvaktsstatistik and lag. The shared Adminläge flow must be removed or replaced with equivalent personal feature checks on every route, without losing working shift and match functionality.
2. The existing upload-only GitHub workflow asserts personal-write flags are false. Replace its assumptions with a separately reviewed release workflow and account for current feature-flag tests expecting off.
3. Publish the frontend and Worker as one coordinated transition. Turning on the frontend first sends personal tokens to the old API; turning on the Worker first may reject existing admin-token requests. Use a safe compatibility phase or planned controlled cutover.
4. Preserve `AUTH_DB`, `ADMIN_KV`, `NSK_TRAINERS`, the existing `SHIFT_LOCK` namespace and migration history, and all secrets. A Worker-version rollback does not recover changed D1/KV/Baserow/Durable Object data.
5. Confirm how to return to the last working frontend and Worker version together, then verify positive authorized Team 18 writes, denied Testlag 2 writes and continued function of shifts, lineup, coach selections and match UI.
6. Recheck GitHub checks, live Worker traffic/bindings and release gate immediately before cutover.

**Do not merge this PR or deploy its manifest until these checks are satisfied.**
