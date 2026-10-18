# NSK production release verification

Status: BLOCKED — no production deployment or rollback executed.

## Verified
- API phased rollout source merged in PR #138; frontend feature flag is still in open PR #173.
- GitHub Pages source confirmed by repository owner: `main` / `/(root)`. A frontend merge may trigger production publication.
- PR #174 merged the publishing and frontend rollback documentation.
- PR #175 merged a non-deploying release-candidate verification workflow.
- PR #175 check run 39155205777 passed and uploaded `nsk-api-scoped-candidate` artifact 12146981689; built bundle includes `NSK_REQUIRE_SCOPED_ROSTER_READS` and Authorization logic.
- Cloudflare Worker `nsk-api` live deployment remains version 48 (`1eb31da3-dfa4-49d0-a502-b61573feb032`) at 100% traffic.
- Cloudflare uploaded version 49 (`1a33f0b6-a0eb-4494-9c3e-cfb182d7ca4a`) is not deployed. Versions 48 and 49 have the **same script ETag**, so version 49 must not be assumed to contain the new code.
- Version 49 bindings include existing AUTH_DB, ADMIN_KV, NSK_TRAINERS, SHIFT_LOCK, and three expected secret names. This does not prove secret functionality or script equivalence to GitHub.
- Existing earlier rollback candidate `f36b8b66-a334-4bb5-88e6-b49071b41c8e` was identified but has not been exercised.

## Remaining release blockers
1. Build/upload a **new** Worker version from the verified artifact, without automatically deploying it. Verify script identity and bindings against the candidate and production.
2. Validate the exact Worker script, runtime behavior and credentials using non-destructive tests; a successful CI bundle alone is insufficient.
3. Verify Durable Object SQLite data and migration/rollback compatibility, and confirm existing live secrets function after rollback. Never replace namespaces or migrate data as part of this rollout.
4. Record public frontend URL, current served config and known-good frontend commit; verify UI/API team isolation in production without destructive writes.
5. Obtain explicit go/no-go approval for the specific production deployment and document an executable rollback plan.

## Controlled rollout after blockers clear
1. Record currently active Cloudflare version and rollback target.
2. Deploy the newly verified API with `NSK_REQUIRE_SCOPED_ROSTER_READS=false`; confirm legacy clients remain compatible and authenticated reads are scoped.
3. Merge frontend PR #173 into `main` to publish `REQUIRE_SCOPED_ROSTER_READS=true`; verify personal Bearer token and selected-team isolation.
4. Only then deploy API with `NSK_REQUIRE_SCOPED_ROSTER_READS=true`; verify missing/invalid credentials fail closed.
5. Stop and roll back code (without changing D1/KV/DO data) on failed verification.

Documentation only; this file does not authorize deployment.
