# Personal permission audit — 2026-10-27

A coach with `roster:manage` was denied by a legacy role ceiling in both `auth.js` and the shared API/auth policy. The same ceiling blocked pool creation, shift checks, match management, closing and reopening pools. The shared rule now accepts explicit grants for known non-viewer member roles. No role grants a feature by itself. Viewer memberships remain read-only, unknown roles fail closed, and other-team access is denied. Account management still requires its separately assigned `users:manage` grant.

The browser mirrors the shared policy. Existing roster permission refresh runs on focus and every 15 seconds; opening a person card fetches current server edit flags. Every protected write verifies the server session and current database permissions again. Revocation therefore blocks the next write even while an old editor is still open. Card data never authorizes its own write.

Verification covers every delegated feature for every non-viewer role; missing grants, unknown roles, viewers and foreign teams; player and coach card writes; revoking a grant with the same session; removing team membership; disabled, expired and revoked sessions through both auth and API identity verification. Session cases use a disposable local SQLite database, not production records.

Existing regression coverage also verifies equipment staff may edit skates without changing jersey/position/hand unless roster permission is assigned; player QR capability scope, renewal and disabled-link rejection; primary-administrator-only private skills with PIN; and delegated user managers cannot modify the protected primary account. No QR-management or private-skills privilege is gained from this policy change.

Deploy the same function to the existing `nsk-api` and `nsk-auth` Workers, preserving all other deployed code, bindings and secrets. Publish the browser changes from main. No production permission records, player cards, Baserow records or personal QR links need changing. An end-to-end save using Joakim's own authenticated browser remains a user-side check; no session was impersonated or minted for production verification.
