# Production API binding preservation gate

This document is **not** permission to deploy. A successful Wrangler `--dry-run` proves only that a bundle can be built; it does not prove existing bindings survive an upload.

## Live inventory (read-only Cloudflare settings, 2026-10-18)

| Binding | Type | Verified resource |
| --- | --- | --- |
| ADMIN_KV | kv_namespace | `7f978e9bbcd04b888e5b0dfbc338ba5d` |
| NSK_TRAINERS | kv_namespace | `f60b048621ea4aca8d67774f5c9db664` |
| AUTH_DB | d1 | `9f937bcb-b0c0-4129-af5b-775cf284dfcb` |
| SHIFT_LOCK | durable_object_namespace | `ShiftLock`, existing namespace `27cd8685c58e4b8aa0aaa85a9d47f6ed` |
| ADMIN_PASSWORD | secret_text | Present; value not accessed |
| BASEROW_TOKEN | secret_text | Present; value not accessed |
| MATCH_PASSWORD | secret_text | Present; value not accessed |
| BASEROW_DATABASE_ID | plain_text | Present; value not reproduced |

## Verified Wrangler preservation behavior

Cloudflare's Wrangler command documentation states that existing secrets are not deleted by deployments and that `--keep-vars` preserves variables configured outside the Wrangler manifest. The production manifest now declares `[secrets].required` for `ADMIN_PASSWORD`, `BASEROW_TOKEN`, and `MATCH_PASSWORD`; it does not include their values. The existing plain-text `BASEROW_DATABASE_ID` is absent from the manifest, so an approved deploy must use `--keep-vars` and verify the value remains configured, without printing it.

**Candidate command for a separately approved release only** (do not execute while the gate remains active):

```sh
npx --yes wrangler@4 deploy --config wrangler.api.production.toml --keep-vars
```

Cloudflare reference: https://developers.cloudflare.com/workers/wrangler/commands/workers/ and https://developers.cloudflare.com/workers/wrangler/configuration/ . This is a preservation method, **not** a complete release authorization or proof that the uploaded version is safe.

## Blocking gap

`wrangler.api.production.toml` declares KV, D1, and Durable Object bindings, does **not** declare the plain-text `BASEROW_DATABASE_ID`; it now declares the three required secret **names** but not their values. Do not assume that a Wrangler upload retains omitted bindings or that `--dry-run` validates retention. Do not copy live secret values into GitHub, workflow logs, or TOML.

## Required before enabling release

1. Select and review an upload path that explicitly preserves existing secrets and plain-text configuration without revealing values. Check the exact API/Wrangler behavior for the selected method and version.
2. Before any upload, capture the live binding **names and types** (not values) and confirm the exact four persistent resource identities above.
3. Compare the proposed uploaded binding metadata with the full eight-binding inventory. Reject any missing/renamed binding, changed resource ID, or new Durable Object namespace/migration.
4. Confirm the proposed Worker source matches the intended live behavior, and capture the currently active 100% deployment as rollback target.
5. After a separately approved release, read the new version's binding metadata and deployment traffic allocation, compare all eight bindings again, and run scoped smoke tests.
6. If any binding differs, stop and roll back the Worker version; investigate persistent data separately.

The release gate remains active until these checks have been carried out. No upload or deployment was performed by writing this document.
