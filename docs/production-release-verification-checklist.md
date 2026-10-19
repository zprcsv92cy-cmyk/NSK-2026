# NSK production release verification

Status: current production login and selected-team behavior have been manually verified by the owner. Replacing the active Worker remains blocked pending explicit approval and rollback/data-safety verification.

## Verified on 2026-10-19

- Public app: https://zprcsv92cy-cmyk.github.io/NSK-2026/
- Published `config.js` points to `https://nsk-api.peter-hasselberg.workers.dev` and `https://nsk-auth.peter-hasselberg.workers.dev`.
- Published frontend sets `REQUIRE_SCOPED_ROSTER_READS: true`.
- Owner confirmed sign-in and selection of NSK Team 18 and NSK Testlag 2 work.
- Owner confirmed the tested account can edit/save in Team 18 and is denied editing in Testlag 2; the owner reported the tested administrator-account behavior also works as intended.
- Read-only API checks: `/api/auth/me` without credentials returned HTTP 401; `/api/spelare` and `/api/tranare` without credentials returned HTTP 401; both roster endpoints with an invalid Bearer token also returned HTTP 401.
- Active Cloudflare Worker `nsk-api` was last read as version 51, `f08f10de-1932-4888-8d04-1b8314bdef98`, with `NSK_REQUIRE_SCOPED_ROSTER_READS=true` and 100% traffic.
- Uploaded candidate version 53: `365bdd66-8b7a-4fe0-9b1e-479fc1ffbfc1`; expected binding identifiers and required secret names match the recorded production configuration. Candidate is not deployed.
- Candidate artifact SHA-256: `329c986b53a729668b02fa56c8b42af3e7afe8ff06f62e53926d514692af2162`; source commit: `5cdd088a83e47eafa505695ed3450301d57caac1`.
- Preserve the existing `ShiftLock` class and production namespace. No rollback has been executed.

## Remaining blockers before replacing the current Worker

1. The live UI checks were owner-reported; a complete route-by-route authorization and data-isolation audit has not been performed.
2. Live secret functionality has not been independently verified without exposing secret values.
3. Durable Object SQLite migration continuity and rollback/data recovery have not been exercised. Do not replace the existing namespace or guess migration history.
4. The documented rollback target `f36b8b66-a334-4bb5-88e6-b49071b41c8e` has not been exercised. Rolling back Worker code does not restore D1, KV, Baserow, or Durable Object data.
5. Explicit go/no-go approval for deploying the uploaded candidate has not been recorded.

## Safe next steps

1. Keep the currently working production Worker unchanged while reviewing remaining release blockers.
2. Preserve live secrets and existing D1/KV/Durable Object resources.
3. If replacing the Worker remains necessary, obtain explicit approval for this exact candidate and complete rollback/data-safety verification first.
4. After any approved change, rerun non-destructive sign-in, missing/invalid-token, authorized Team 18, and denied cross-team checks.

This checklist records observed checks; it is not itself deployment approval.
