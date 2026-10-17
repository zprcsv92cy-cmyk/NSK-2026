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
