# NSK API production rollback baseline

Verified from the Cloudflare Workers API on 2026-10-17. This is a **read-only baseline**, not a deployment approval.

| Item | Verified value |
| --- | --- |
| Worker | `nsk-api` |
| Active version number | 42 |
| Active version ID | `95247668-0e10-4ba3-b6c5-469ed37a986c` |
| Active deployment ID | `17408693-062c-4f71-b36e-9eb37881536e` |
| Active traffic | 100% |
| Version created | 2026-10-13 15:02:54 UTC |
| Durable Object export | `ShiftLock` |
| Durable Object binding | `SHIFT_LOCK` |
| Existing KV bindings | `ADMIN_KV`, `NSK_TRAINERS` |
| Existing secret bindings | `ADMIN_PASSWORD`, `BASEROW_TOKEN`, `MATCH_PASSWORD` |
| Existing plain-text binding | `BASEROW_DATABASE_ID` |

Additional read-only Cloudflare verification (2026-10-17):
- Durable Object namespace `27cd8685c58e4b8aa0aaa85a9d47f6ed` is named `nsk-api_ShiftLock`.
- Namespace class is `ShiftLock` and its owning script is `nsk-api`.
- The namespace object-list API returned at least one object (count 1 on a limited page).
- This does not verify migration history or a rollback execution; preserve the existing namespace.

The Cloudflare version API confirms the active v42 code exports a `ShiftLock` class. It does **not** establish migration history or prove that a new deployment will retain existing Durable Object state.

## Before release

1. Verify that `wrangler.api.production.toml` preserves the exact live KV namespace IDs and `ShiftLock` class ownership.
2. Verify Durable Object migrations for the existing `ShiftLock` class; do not add an unreviewed `new_classes` migration for an existing class.
3. Verify the four existing Baserow/password bindings are preserved by the deployment mechanism, without exposing secret values.
4. Verify `AUTH_DB` can be attached without dropping existing bindings, and validate session authorization against production D1.
5. Compare existing routes with the candidate API; confirm no legacy admin mutation path bypasses personal authorization.
6. Verify that the previous version ID remains available as a rollback target, and confirm the documented Cloudflare deployment/rollback procedure.
7. Run the release preflight and an approved rollout with monitored read and write smoke checks.

**Do not deploy** until every item is verified. A previous version ID is a rollback reference, not proof of a successful rollback.

## Rollback procedure (documented, not executed)

Cloudflare's Workers deployment API supports creating a deployment with a `versions` array containing a previously uploaded `version_id` and traffic `percentage`. This confirms an API mechanism for redeploying an existing version, **not** that a rollback has been exercised successfully.

1. Before rollout, read `GET /accounts/{account_id}/workers/scripts/nsk-api/deployments` and save the current 100% version.
2. If rollback is needed, an authorized operator can use `POST /accounts/{account_id}/workers/scripts/nsk-api/deployments` with `versions: [{ "version_id": "95247668-0e10-4ba3-b6c5-469ed37a986c", "percentage": 100 }]` and the API's other required deployment fields. Validate the exact API request against current Cloudflare documentation before use.
3. Read deployments again and verify that the target version receives 100% of traffic.
4. Run read-only API smoke checks, then authorized application checks. If state migrations occurred, reverting Worker code alone may not revert Durable Object or D1 data.

Do **not** run a rollback simply to test the procedure on live production. Migration history remains unverified.

## Source audit: ShiftLock (2026-10-17)

The `main` branch's `worker/production-api-v42-reference.js` defines `var ShiftLock = class { ... }` and explicitly exports `ShiftLock` alongside the default Worker handler. The current `wrangler.api.production.toml` binds `SHIFT_LOCK` to `class_name = "ShiftLock"`, but has no `[[migrations]]` declaration.

This matches the existing deployed class name and namespace owner, **but is not proof of migration continuity**. No migration tag should be guessed. Before a new Worker version is uploaded, obtain authoritative migration history from the original deployment artifacts or Cloudflare and verify whether this already-created class can be deployed without a new migration entry. Preserve the existing namespace ID and stored objects.
