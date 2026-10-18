# NSK production API release and rollback checklist

This is a runbook, **not** authorization to deploy. The production release gate remains active.

## Verified baseline (2026-10-18)

- Worker script: `nsk-api`
- Baseline deployed version: `1eb31da3-dfa4-49d0-a502-b61573feb032`
- Baseline deployment: `a9cea50b-3c5b-4b1f-93db-8a613410b366` (100% traffic)
- Durable Object: `SHIFT_LOCK` / `ShiftLock`, existing migration tag `v1-shift-lock`
- Existing namespace: `27cd8685c58e4b8aa0aaa85a9d47f6ed`
- D1 `AUTH_DB` and KV `ADMIN_KV`, `NSK_TRAINERS` identifiers are declared in `wrangler.api.production.toml`.
- Existing secret bindings include `ADMIN_PASSWORD`, `BASEROW_TOKEN`, `MATCH_PASSWORD`; `BASEROW_DATABASE_ID` is plain text. Do not expose values.

## Read-only live verification (2026-10-18)

Cloudflare Deployments API confirms that deployment `a9cea50b-3c5b-4b1f-93db-8a613410b366` still directs 100% of traffic to version `1eb31da3-dfa4-49d0-a502-b61573feb032`. The immediately preceding known deployment uses `f36b8b66-a334-4bb5-88e6-b49071b41c8e` at 100%; it has **not** been tested as a rollback.

Both the deployed version's resource bindings and the live Worker settings API report the same eight binding names and types:

| Binding | Type | Verified identifier (where applicable) |
| --- | --- | --- |
| `ADMIN_KV` | KV | `7f978e9bbcd04b888e5b0dfbc338ba5d` |
| `NSK_TRAINERS` | KV | `f60b048621ea4aca8d67774f5c9db664` |
| `AUTH_DB` | D1 | `9f937bcb-b0c0-4129-af5b-775cf284dfcb` |
| `SHIFT_LOCK` | Durable Object / `ShiftLock` | `27cd8685c58e4b8aa0aaa85a9d47f6ed` |
| `ADMIN_PASSWORD` | secret_text | Value not read |
| `BASEROW_TOKEN` | secret_text | Value not read |
| `MATCH_PASSWORD` | secret_text | Value not read |
| `BASEROW_DATABASE_ID` | plain_text | Value not read |

**Scope:** read-only API checks only. This confirms existing configuration, **not** preservation across a new Worker upload, integrity of stored records, migration compatibility of a new bundle, rollback execution, or approval to deploy. The release gate remains blocked.

## Before release

1. Re-read live deployments and versions; capture the **current** 100% production version as rollback target. Do not assume the baseline above remains current.
2. Verify release code against live Worker functionality and the existing Durable Object migration; ensure `ShiftLock` keeps its existing namespace. Never introduce a new migration tag or delete an existing binding without a reviewed plan.
3. Verify secrets and environment bindings will be preserved by the proposed upload, without reading or logging secret values.
4. Confirm staff data in `NSK_TRAINERS` and D1 data are protected; have a separate data recovery plan because a Worker version rollback **does not roll back database or Durable Object data**.
5. Run all GitHub checks, including the production API dry-run. The static gate must remain blocked until all release prerequisites are independently satisfied.
6. Document release commit, deployment version, owner, smoke tests and go/no-go decision.

## Deployment and smoke test

Only after the release gate is formally cleared, deploy a reviewed Worker version while preserving all existing bindings. Confirm deployment points to the intended version. Smoke-test read paths, authentication and authorization for NSK Team 18 and NSK Testlag 2, and confirm writes remain team-scoped.

## Rollback if needed

1. Stop further changes and record symptoms.
2. Read current Cloudflare deployment state and confirm the known-good version still exists.
3. Create a Cloudflare Worker deployment using the known-good version at **100% traffic** (the Cloudflare Deployments API supports version percentages summing to 100).
4. Re-read deployment state to confirm 100% traffic has moved to that version.
5. Re-run smoke tests and investigate persistent state separately. Rollback of code does not undo writes to D1, KV, Baserow or Durable Objects.

**Not yet verified:** an actual rollback execution, full upload/binding preservation, persistent-state recovery, and production release approval. Do not represent this runbook as a completed rollback test.
