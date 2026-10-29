-- Register active pool writes so deletion can take a stable snapshot of child rows.
CREATE TABLE IF NOT EXISTS pool_flow_operations (
 operation_id TEXT PRIMARY KEY,
 pool_id INTEGER NOT NULL,
 lease_until INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pool_flow_operations_by_pool ON pool_flow_operations(pool_id,lease_until);
