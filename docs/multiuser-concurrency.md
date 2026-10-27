# Multiuser saving — 2026-10-27

Enable with `NSK_MULTIUSER_ENABLED=true` after applying `migrations/20261027_concurrent_staff.sql`. This additive migration creates an empty table; it does not change any Baserow records or existing KV records.

## Staff

A request-local adapter redirects only `lagpersonal:team:<id>` keys to a D1 CAS document. Reads use D1 when present, otherwise the existing KV list, without writing. The first authorized edit seeds D1. Concurrent additions and unrelated edits merge by stable row ID. Conflicting edits/deletes and duplicate names fail closed. All reads, including coach-linked equipment staff, use the same adapter; unrelated KV keys remain untouched. Legacy KV remains as a pre-migration copy. After staff has been edited, rollback must retain this adapter and flag; older binaries would read stale KV. Do not delete or reset the D1 table during rollback.

## Person cards, equipment and training

The outer wrapper calls the existing authorized handler for both its latest read and atomic revision-checked write. A client sends its confirmed base along with its desired state. Three-way merge applies only the client's changes and preserves unrelated current fields, requests and checklist items. Real same-field conflicts stop without an overwrite. CAS races reread/retry at most four times. Legacy clients without a base retain the old revision check.

Training attendance merges individual membership changes. Goalies and allocations retain normal validation. The client retains failed drafts. An explicit recovery action either reads the latest session or applies the user's changes to a fresh base; it does not blindly replace unrelated changes. Queued saves carry the base captured when the user made the change, so a later queued snapshot cannot undo remote additions already merged by an earlier save.

## Lineups

The editor sends a normalized base of its loaded match configuration and ordered lineup. The existing per-match lease is acquired, then the server rereads and compares the base before any Baserow mutation. Stale editors receive 409, missing bases 428; neither marks a ready match pending. Authorized successful saves return the new base. Legacy direct edits of existing match configurations/lineups are blocked while this mode is enabled; schedule creation cannot create a second existing match. Confirmed partial failures still remain pending and require explicit retry/reload.

## Shift view

Polling compares row identity, shift/period numbers, remaining times and player IDs, as well as done marks. Structural changes refresh the table while retaining the old table during the read; the page does not claim freshness for a stale structure. Local in-flight writes postpone background refresh. Match view refresh also observes a pool closed elsewhere.

## Release and verification

Use `scripts/build-multiuser-addon.mjs` for the additive runtime patch: add its private-scope helpers, replace only the deployed `withPoolFlow` function, then install the wrappers outside the existing handler with the existing Pages-origin adapter. Verify original-code restoration produces the exact previous script before uploading. Preserve bindings, secrets, Durable Object namespace/storage, compatibility and observability. Deploy only merged main. Frontend packaging includes `concurrency-merge.mjs` on both hosts.

Tests simulate overlapping staff reads, stale lineup editors, real local SQLite material CAS writes, independent checklist/card changes, denied access, queued training edits, explicit conflict resolution and remote shift structure changes. No production session is impersonated and no production business data is used for write tests. These checks do not constitute a live load test.
