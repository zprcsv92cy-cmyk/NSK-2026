# NSK production release verification

Status: BLOCKED — no deployment or rollback approved.

## Verified
- PR #138: five GitHub Actions checks passed on 817771c (latest checked head).
- nsk-api active version: 1eb31da3-dfa4-49d0-a502-b61573feb032.
- Rollback candidate: f36b8b66-a334-4bb5-88e6-b49071b41c8e.
- Version bindings match for AUTH_DB, ADMIN_KV, NSK_TRAINERS, SHIFT_LOCK, and secret binding names.
- nsk-auth has AUTH_DB binding.
- No Pages projects were returned in the connected Cloudflare account.

## Blockers
- Determine actual frontend hosting, deployment and rollback procedure.
- Confirm Durable Object SQLite data preservation under rollback.
- Confirm live secrets remain functional after rollback; names alone do not prove this.
- Verify non-destructive production UI/API behavior and team isolation.
- PR #138 is ready for review and mergeable; coordinate PR #137 before merge or deployment.
- Obtain explicit approval for the exact release.

## Deployment order after all checks pass
1. Record production version IDs and verified rollback instructions.
2. Deploy API with NSK_REQUIRE_SCOPED_ROSTER_READS=false.
3. Publish frontend with REQUIRE_SCOPED_ROSTER_READS=true and verify personal Bearer and selected-team isolation.
4. Enable API flag true only after frontend verification; verify missing credentials fail closed.
5. Stop rollout on any failed verification.

Documentation only; this file does not authorize deployment.
