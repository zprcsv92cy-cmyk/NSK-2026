CREATE TABLE IF NOT EXISTS cup_source_cache (
 cup_id TEXT PRIMARY KEY, cup_json TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cup_sync_state (
 id INTEGER PRIMARY KEY CHECK(id=1), day TEXT NOT NULL, directory_json TEXT NOT NULL,
 pending_json TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0,
 lease_until TEXT NOT NULL DEFAULT '', lease_token TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT '', last_error TEXT NOT NULL DEFAULT ''
);
