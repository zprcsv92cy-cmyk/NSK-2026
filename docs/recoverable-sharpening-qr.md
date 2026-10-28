# Recoverable personal sharpening QR codes

Active capabilities remain SHA-256 hashes for public verification. Authorized equipment managers and the primary administrator can recover the current token from `token_ciphertext`, encrypted with AES-256-GCM. The dedicated `NSK_QR_LINK_KEY` Worker secret is 32 random bytes represented as 64 lowercase hexadecimal characters. The authenticated additional data binds ciphertext to team, person and link revision. Preserve this secret during deployments; changing it requires re-encrypting stored capabilities or explicit per-player renewal.

Apply `migrations/20261027_recoverable_qr.sql` once after checking `PRAGMA table_info(sharpening_links)` for the new column. This additive migration and the Worker secret do not alter any existing token hash. Deploy the sharpening handler into the existing API addon without changing unrelated production routes or bindings.

GET `/api/sharpening/link?team_id=...` returns metadata only. GET with `person_id` returns the current token only after existing session, membership, equipment-role and roster checks. Responses are private and not cacheable. `action: mode` transfers responsibility without rotating an active capability. `action: renew` explicitly replaces it. `action: restore` imports a legacy saved token only when it hashes to the currently active capability. Disabled, replaced and wrong-player tokens cannot be restored.

Legacy rows remain valid. Opening cards, fetching a QR list and printing never generate or renew links. The UI shows when an old hash-only row needs a saved list import or one explicit renewal. Tokens are held only in the mounted page's memory. The QR generator runs locally; no QR service receives capabilities. Creating a list performs reads; a separate synchronous Print button opens an A4 preview, avoiding mobile popup blocking after asynchronous requests. Existing requests, skate settings and sharpening history are retained.

## Coach QR cards

Coach management requests use `kind=coach` with a numeric `person_id`; omitted kind retains the existing player behavior. The server validates the person against the corresponding team roster table. Stored coach link and history IDs use `coach:<id>`, while player IDs remain unchanged. Public links resolve kind from the trusted stored row, never from a caller-supplied public parameter. Profiles and orders use the existing `coach:<id>` profile and `kind: coach` order identity.

Apply the additive, idempotent `migrations/20261028_coach_sharpening.sql` before the handler update. It adds coach-only completion triggers and preserves existing player triggers, tokens and history. The migration imports old completed coach orders with an unknown completion date. Deploy only the sharpening handler and its roster lookup route into the active API; retain all unrelated source, settings, bindings and secrets. Publish the frontend after the API supports kind-aware requests.

The client includes coaches in selection, searching, QR reads and the same small NSK print signs. Loading or printing a list does not create or renew links. Choose Create QR explicitly for a coach who has no active link. Legacy saved lists without `kind` continue to address players.
