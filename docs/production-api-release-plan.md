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
