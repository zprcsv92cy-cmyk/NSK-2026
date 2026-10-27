CREATE TABLE IF NOT EXISTS concurrent_staff (
 team_id TEXT PRIMARY KEY,
 rows_json TEXT NOT NULL,
 revision INTEGER NOT NULL
);
