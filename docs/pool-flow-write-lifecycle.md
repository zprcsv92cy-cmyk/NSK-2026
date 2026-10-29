# Pool writes and resumable deletion

Apply `migrations/20261029_pool_flow_operations.sql` to the existing `AUTH_DB` before deploying the updated `worker/pool-flow-api.js`. The migration only creates an operation table and index; it does not update team, match, auth or equipment records.

Every personally authorized pool write registers a request-local UUID with a five-minute expiry using a conditional INSERT that rejects an existing deletion marker. Independent match writes may register concurrently. The entry is removed in `finally`; expired entries are ignored by deletion and removed by a later write if a Worker stopped before cleanup.

Deletion atomically creates its marker only when no unexpired write entries exist. It acquires the existing deletion lease before reading child rows. The initial `plan_json = 'null'` marker blocks new writes while the child-row snapshot is built. Only an array plan can represent a completed deletion. A failed planning attempt removes its placeholder without deleting any child rows, allowing a later normal write or retry.

The saved plan still deletes children before the parent in batches of 15, treats already missing rows as complete, and resumes from the stored step. A busy save or deletion returns HTTP 409; it does not queue or automatically retry the user's mutation.

Regression coverage in `scripts/pool-flow-api.test.mjs` holds requests at deterministic boundaries to verify an active write blocks deletion, an older authorized request cannot register after the marker, failed planning releases its marker, and independent matches can still save concurrently. All tests use local fixtures.
