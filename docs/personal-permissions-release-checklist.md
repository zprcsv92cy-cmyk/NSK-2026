# NSK personal-permissions release checklist (2026-10-20)

**Status: NO-GO.** This document is preparation, not authorization to merge or deploy. PR #206 remains draft.

## 1. Immutable baseline (refresh immediately before any cutover)
- Confirm `main` commit and release candidate SHA; re-run all CI after reconciling the release branch with `main`.
- Query Cloudflare deployment traffic and capture the 100% active Worker version. Previously observed: `7434d756-524c-43c4-95b2-73cc942a256b`; **do not assume it remains current**.
- Record live frontend Pages deployment ID, app version, service-worker cache epoch, and production hostname. Verify a known-good frontend artifact is available for rollback.
- Read back Worker D1, KV, Durable Object bindings, secrets *names only*, and six permission/read flags. Compare with the candidate. Never print secret values or session tokens.
- Run the read-only preflight and verify its exact run URL, job result, and checked version.

## 2. Isolated authenticated write/read-back (required, not yet done)
- Provision a disposable **isolated** Baserow workspace/database with the expected table schemas and disposable team/pool records. Never use production Baserow token or production table IDs for writes.
- Provision isolated D1 auth tables with one disposable test user, a hashed test session, Team 18 membership, and `pool:create` grant. Provision a second test identity with only Testlag 2 membership; no shared admin credentials.
- Bind the candidate Preview exclusively to those isolated resources; verify resource IDs differ from production. Do not copy real user data or production credentials.
- Exercise the **exact candidate SHA**: authenticated Team 18 pool create (201), read-back, update, delete/cleanup; Testlag 2 unauthorized create (403) with zero mutation; anonymous and invalid token (401); expired session (401); logout; roster/lineup/match/shift/coach permissions as applicable.
- Record HTTP statuses, test fixture IDs, GitHub run URL and candidate Worker version. Do not log bearer tokens. Assert cleanup and zero remaining test records.
- **Stop** if any write is routed to production Baserow or if resource isolation cannot be proven.

## 3. Browser and deployment compatibility (required)
- Test all pages on desktop and iPhone with personal login, permissions per team, sign-out and re-login, reload, offline/cache transition, and direct navigation.
- Explicitly test both API/frontend ordering cases: old frontend with candidate API, candidate frontend with old API. If either breaks authenticated writes, arrange a controlled maintenance window or implement compatibility; do not independently publish one half.
- Confirm shared Adminläge control disappears and Mitt konto appears; verify read-only users cannot write, Team 18 writes work, and Testlag 2 writes are denied.

## 4. Recovery and rollback (required)
- Before cutover, capture verified restore points for Baserow data, D1, KV and any relevant Durable Object state. Confirm restore ownership and method; Worker rollback alone does not restore these stores.
- Identify last known-good **frontend Pages deployment ID** and **Worker version ID**. Document exact operator rollback commands and verify access in an isolated environment; do not guess production IDs or run rollback against production as a test.
- Rehearse joint frontend + Worker rollback in isolation and verify auth, roster, pool, lineup, shifts and cache invalidation after rollback.
- Define abort triggers: unauthorized write, failed login, cross-team leakage, broken shift/match flow, stale assets, binding drift, missing backups or unexpected production version.

## 5. Release decision
- Only after evidence for sections 1–4 is attached to PR #206, reconcile with `main`, rerun green checks on the exact merged candidate, and explicitly approve coordinated production cutover.
- Deploy in a controlled sequence with immediate read-only monitoring and post-release permission smoke tests. Preserve the old frontend and Worker IDs until stability is verified.
- **Never merge or route production traffic based only on static tests, anonymous Preview 401 checks, or upload-only success.**

## Evidence record (fill in before GO)
| Gate | Evidence URL / ID | Result |
| --- | --- | --- |
| Exact SHA and green CI | pending | BLOCKED |
| Live production baseline | pending refresh | BLOCKED |
| Isolated authenticated write/read-back | pending | BLOCKED |
| Denied cross-team write | pending exact Preview | BLOCKED |
| Browser + cache and old/new compatibility | pending | BLOCKED |
| Data snapshots + isolated rollback rehearsal | pending | BLOCKED |
| Coordinated cutover approval | pending | BLOCKED |
