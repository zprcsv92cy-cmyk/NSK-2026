# NSK production API – upload-only release

This repository intentionally separates uploading a Cloudflare Worker version from routing traffic to it.

## Current boundary (2026-10-20)

- Last verified live `nsk-api` version: `7434d756-524c-43c4-95b2-73cc942a256b` (100%).
- `main` contains guarded personal write code for poolspel, matchkonfiguration, laguppställningar and tränarval. The new write flags remain **false** in both `config.js` and `wrangler.api.production.toml`.
- Production read scopes are **true**. Do not disable these during a rollout.
- Both workers use `AUTH_DB` ID `9f937bcb-b0c0-4129-af5b-775cf284dfcb`.
- Keep the current production version available for rollback. These notes do not authorize a traffic cutover.

## Stage a new version (no production traffic)

1. Confirm **all** CI checks are green for an exact `main` commit, and inspect changes since the last production deployment.
2. The repository must have GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` with the minimum Cloudflare permissions for version upload and settings read. No secret values belong in source or logs.
3. From Actions run **Stage production API version (no traffic)** on `main`, enter the full 40-character commit SHA and type `UPLOAD_ONLY`.
4. The workflow refuses a SHA mismatch; checks personal-write flags are off; runs authorization tests; verifies live D1, KV, Durable Object and required secret bindings; performs a Wrangler dry run; and runs `wrangler versions upload`. **It does not call** `wrangler deploy` or `wrangler versions deploy`.
5. Record the generated version ID from the successful run. Verify the active deployment still routes 100% to the previous version.

## Before any traffic cutover

- Check the new uploaded version contains all existing routes, auth checks, binding IDs, ShiftLock migration/ownership, and secrets; no KV or D1 data should be replaced.
- Confirm the `nsk-auth` session verifier is compatible with the uploaded Worker (live sessions, not forged tokens).
- Verify personal read endpoints, Team 18 authorized writes and Testlag 2 denied writes using controlled test records and server responses. A read-only dry run alone does **not** prove the write path.
- Ensure the frontend and Worker flags are enabled **together** for each feature; otherwise preserve the legacy Adminläge path.
- Have a tested rollback to the previous Worker deployment and compatible frontend configuration.
- Require a separate, explicit decision to change production traffic. This workflow never does so.

## Important limitation

An upload-only version is *not* a deployment. Merging the workflow into `main` does not upload or activate any Worker version. Cloudflare and GitHub Pages are independent release targets.
