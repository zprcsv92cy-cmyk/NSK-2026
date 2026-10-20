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

## Verified isolated and staged candidates (2026-10-20)
- Release candidate source commit: `f63ccf314ce530adff0284f767e3096995e6f20f`
- Preview `nsk-personal-release-20261020` deployed and anonymous API smoke checks passed ([GitHub run](https://github.com/zprcsv92cy-cmyk/NSK-2026/actions/runs/39366845601)).
- Production upload-only Worker version: `534ec56e-45e9-4aa9-9014-ed95da45935a` ([GitHub run](https://github.com/zprcsv92cy-cmyk/NSK-2026/actions/runs/39367027050)).
- Cloudflare readback confirms candidate has all three personal-write guards ON and all three scoped-read guards ON, with the same D1, KV, Durable Object and secret binding names/IDs as the active Worker.
- Cloudflare readback also confirms active Worker `7434d756-524c-43c4-95b2-73cc942a256b` remains at 100% traffic.
- User reported successful personal authentication and Team 18 allowed / Testlag 2 denied tests previously; this report is recorded, but is not a full live test of this release candidate's authenticated writes with production resources.

## Go/no-go: NO-GO for production traffic switch yet
1. The released webpage immediately enables personal-token writes when `config.js` changes, but the currently active API has these guards OFF. Publishing it ahead of the API risks breaking writes.
2. The reverse order also risks breaking writes: the older client sends Adminläge tokens, which the candidate API disallows for personalized routes.
3. The Preview does not contain a seeded auth database or independent writable Baserow test data, so successful authenticated write/read-back against this exact candidate is not verified.
4. A version rollback is possible in principle, but actual restoration of stateful Baserow/D1/KV/Durable Object data has not been exercised. A frontend version rollback also needs coordinated cache invalidation.
5. Deploy only after a concrete coordinated cutover sequence and recovery procedure have been reviewed and the release gate is cleared.

**Do not merge this draft PR solely on the basis of green static tests or an upload-only Cloudflare version.**

## Production auth database read-only verification (2026-10-20)
- The active `nsk-api` deployment remains `7434d756-524c-43c4-95b2-73cc942a256b` at 100%.
- Its `AUTH_DB` binding points to `nsk-auth-production` (database ID `9f937bcb-b0c0-4129-af5b-775cf284dfcb`).
- Read-only Cloudflare D1 inspection confirms auth tables exist: `auth_users`, `auth_sessions`, `auth_team_memberships`, `auth_user_permissions`, `auth_global_admins`, `auth_login_attempts`, and `auth_setup_tokens`.
- Aggregate counts only: one enabled user, three currently valid sessions, one team membership, and nine permission grants. The single membership is `NSK Team 18` with role `team_admin`; its grants match the expected permission vocabulary (read, roster, pool create/finish/reopen, lineup, matches, shifts, users).
- No session tokens or personal data were read or exposed. No database rows were changed.
- This confirms the production auth schema and permission vocabulary are present. It does **not** prove that an authenticated request through the exact new Worker version can safely complete a Baserow write and read-back.
- The live authenticated end-to-end check is still blocked because no controlled test account/session and isolated writable Baserow fixture are provisioned for the exact candidate. Do not use a real team/player mutation as a substitute.

## Test execution report — 2026-10-20, PR #206
Tested release commit: `e26df834a3623562eb8dc2d9f531d23ced05eadf`.

### Passed
- GitHub team-authorization workflow: all jobs green, including authenticated policy tests, isolated D1-session verifier, cross-team enforcement and permissions matrix ([run](https://github.com/zprcsv92cy-cmyk/NSK-2026/actions/runs/39370993867)).
- Worker build, dry-run, source/static release verification, app-version and production baseline workflows: green for the exact same commit.
- Isolated Cloudflare Preview deployed from that commit, with no production resources or traffic ([run](https://github.com/zprcsv92cy-cmyk/NSK-2026/actions/runs/39370988563)).
- Preview smoke tests: 8 anonymous scoped GET denials, 7 anonymous POST/PATCH denials, plus 6 invalid-token denials; all received 401 (21 network cases).
- In-process **real Worker router** test: authorized Team 18 session completed a simulated pool POST (201) via a fake D1 session and mocked Baserow response. Testlag 2-only session was rejected (403), with no mocked Baserow mutation.
- Real production Cloudflare bindings inspected read-only; live API version `7434d756-524c-43c4-95b2-73cc942a256b` still has 100% traffic.
- Existing production auth D1 tables, aggregate membership/session counts and permission vocabulary reviewed read-only without token extraction or data changes.

### Not yet testable / no-go blockers
- No **real authenticated successful write + read-back** through this exact Preview with isolated writable test Baserow and seeded isolated D1 user/session. Simulated Worker tests do not replace this.
- No verified two-version frontend/API compatibility during the switchover or tested joint rollback of Pages and Worker.
- No proof of recoverable Baserow/KV/DO data snapshot and restoration. Code rollback does not restore persistent data.
- Preview intentionally lacks production Baserow credentials and should not be pointed at live rows to satisfy tests.
- Do not merge, enable traffic, or claim release ready based solely on green synthetic tests.

