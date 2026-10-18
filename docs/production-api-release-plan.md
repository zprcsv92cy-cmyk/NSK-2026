# NSK Production API Release Plan

## Current production
- Worker: nsk-api
- Active version: 1eb31da3-dfa4-49d0-a502-b61573feb032

## Rollback candidate
- Worker version: f36b8b66-a334-4bb5-88e6-b49071b41c8e
- Status: binding comparison verified; rollback not executed

## Verified binding comparison
- AUTH_DB: 9f937bcb-b0c0-4129-af5b-775cf284dfcb
- ADMIN_KV: 7f978e9bbcd04b888e5b0dfbc338ba5d
- NSK_TRAINERS: f60b048621ea4aca8d67774f5c9db664
- SHIFT_LOCK: present in both versions
- BASEROW_DATABASE_ID: 589073
- Secret names: ADMIN_PASSWORD, BASEROW_TOKEN, MATCH_PASSWORD

## Outstanding release requirements
- Verify that rollback preserves existing Durable Object SQLite data.
- Verify that existing live secrets remain available after rollback.
- Verify application behavior against production data without destructive writes.
- Obtain explicit production release approval.
- Confirm a documented rollback procedure before deployment.

## Deployment policy
- Dry-runs and automated tests do not constitute production approval.
- Do not deploy or roll back while any release requirement remains unverified.
- Do not create a new Durable Object migration or replace existing storage.
- Keep production unchanged until all release requirements are satisfied.


## Coordinated scoped-roster rollout

1. Deploy the API candidate with `NSK_REQUIRE_SCOPED_ROSTER_READS=false`. The Worker scopes requests that carry an Authorization header; legacy clients without one retain existing behavior during this compatibility phase.
2. Publish the frontend with `REQUIRE_SCOPED_ROSTER_READS=true`. Verify the new frontend sends the personal Bearer token and selected team for roster reads, and that Team 18/Testlag 2 isolation works.
3. Only after frontend publication and verification, deploy the Worker with `NSK_REQUIRE_SCOPED_ROSTER_READS=true`. This forces all roster GETs through the scoped authorization handler, so old clients without a personal session fail closed.
4. Verify the production endpoints and UI after each phase. Do not proceed if the authorized team cannot be resolved or roster/staff data is incomplete.

This sequence is a deployment plan, not authorization to deploy. The existing secret, Durable Object SQLite, binding, rollback, and release-approval checks above remain mandatory.
