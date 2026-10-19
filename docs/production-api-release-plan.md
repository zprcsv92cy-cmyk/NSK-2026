# NSK Production API Release Plan

## Current production (read-only verified 2026-10-19)
- Worker: `nsk-api`
- Active version: `f08f10de-1932-4888-8d04-1b8314bdef98` (version 51; 100% traffic)
- Active scoped-roster flag: `NSK_REQUIRE_SCOPED_ROSTER_READS=true`

## Candidate (uploaded, not deployed)
- Worker version: `365bdd66-8b7a-4fe0-9b1e-479fc1ffbfc1` (version 53)
- Source candidate: GitHub Actions artifact from `main`, commit `5cdd088a83e47eafa505695ed3450301d57caac1`
- SHA-256 of downloaded artifact: `329c986b53a729668b02fa56c8b42af3e7afe8ff06f62e53926d514692af2162`
- Flag: `NSK_REQUIRE_SCOPED_ROSTER_READS=true`
- Candidate bindings and secret names read back from Cloudflare and match the expected production identifiers.
- Existing `ShiftLock` class, SQLite export, namespace ID, and migration tag `v1-shift-lock` are present.
- Status: uploaded and statically verified; not deployed, not a production approval.

## Rollback candidate
- Worker version: `f36b8b66-a334-4bb5-88e6-b49071b41c8e`
- Status: binding comparison verified; rollback not executed.
- A Worker version rollback does not restore D1, KV, Baserow, or Durable Object data changed after deployment.

## Verified production resource identifiers
- AUTH_DB: `9f937bcb-b0c0-4129-af5b-775cf284dfcb`
- ADMIN_KV: `7f978e9bbcd04b888e5b0dfbc338ba5d`
- NSK_TRAINERS: `f60b048621ea4aca8d67774f5c9db664`
- SHIFT_LOCK namespace: `27cd8685c58e4b8aa0aaa85a9d47f6ed`, class `ShiftLock`
- BASEROW_DATABASE_ID: `589073`
- Secret names: `ADMIN_PASSWORD`, `BASEROW_TOKEN`, `MATCH_PASSWORD` (values never read or logged)

## Outstanding release requirements
- Verify rollback/data-recovery procedures for existing Durable Object SQLite, D1, KV, and Baserow data.
- Confirm secret functionality without exposing secret values.
- Complete non-destructive production smoke checks for login, personal authorization, and Team 18/Testlag 2 isolation.
- Obtain explicit production release approval.
- Ensure the release gate and required GitHub checks pass.

## Deployment policy
- Dry-runs, binding comparisons, and successful uploads do not constitute production approval.
- Do not deploy or roll back while a release requirement remains unverified.
- Do not replace the existing Durable Object namespace or invent a new migration.
- Keep production unchanged until all release requirements are satisfied.

## Scoped-roster behavior
The currently active Worker already has `NSK_REQUIRE_SCOPED_ROSTER_READS=true`. The uploaded version 53 candidate uses the same flag and has matching resource identifiers. Before promoting it, verify that the published GitHub Pages frontend sends the personal Bearer token and selected team on roster reads, and run non-destructive production checks for authorized Team 18 access and denied cross-team access. Do not use an unauthenticated legacy roster request as a success test; the required flag should fail closed.

## Frontend publishing verification
- GitHub Pages source was previously confirmed as `main` / `/(root)`; merging frontend changes to main may publish immediately.
- Before any frontend change, record the public Pages URL, served `config.js`, and prior frontend commit.
- Verify `REQUIRE_SCOPED_ROSTER_READS=true` and that authenticated roster requests carry a personal Bearer token and selected team.
- If frontend rollback is needed, restore the known-good `config.js` through the protected main PR process and verify publication completes.
