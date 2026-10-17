# Isolated Baserow integration gate

This guide applies only to the isolated Cloudflare Preview `nsk-isolated-integration-20261018`. Do not use production Baserow data or tokens.

## Baserow prerequisites

1. In Baserow, create a **new empty database** for NSK integration testing. Never duplicate rows from the live NSK database.
2. Create the following ten tables, with the field names and types expected by the Worker: `lag`, `spelare`, `tranare`, `poolspel`, `matcher`, `laguppstallningar`, `bytesschema`, `malvaktsstatistik`, `spelaretranare`, `matchkonfiguration`. Reproduce the necessary schema, not production records.
3. Create only synthetic test rows and synthetic users. Include two separate teams for authorization tests.
4. Generate a dedicated Baserow database token with access **only** to this new database and only the permissions needed for tests. Never commit the token or paste it in a PR.
5. Record the new database ID and each of its ten table IDs. Confirm none equals a production table ID.

## Preview bindings

Set these on the Preview deployment, not the parent production Worker:

- `NSK_ISOLATED_MODE`: plain text `true`.
- `BASEROW_DATABASE_ID`: the **new** test database ID.
- `BASEROW_TABLE_IDS`: JSON mapping all ten table names above to their **new numeric** table IDs.
- `BASEROW_TOKEN`: Preview-only secret with test-database scope.
- `AUTH_DB`: D1 `b94c8dba-34be-4cff-a4e9-892caf4e3ddd`.
- `ADMIN_KV`: KV `8b079c75ed6c4d4695476f1de24089fd`.
- `NSK_TRAINERS`: KV `e8772468a0004f0ea78b02a5251eadf7`.
- `ADMIN_PASSWORD` and `MATCH_PASSWORD`: unique Preview-only secrets, never inherited from production.
- `SHIFT_LOCK`: Preview-isolated Durable Object binding; verify isolation before any write tests.

**Do not deploy the real Worker until all bindings are explicitly reviewed.** Preview deployments can inherit parent bindings. Use the Preview deployment API's `env` map, then read back the deployment and verify every resource identifier. Delete any obsolete Preview deployment that references production resources.

## Acceptance gate

- Missing or malformed Baserow configuration returns HTTP 503 before network access.
- No Baserow table ID in the Preview mapping matches any production table ID.
- Unauthenticated and forged-token shift writes return HTTP 401.
- Cross-team and missing-personal-permission shift writes return HTTP 403.
- Authorized synthetic-team writes work, with idempotent saves and serialized concurrent shift completion.
- Read back the isolated D1/KV/Baserow test records and confirm production resources are untouched.
- Keep production deployment unchanged until the gate passes.
