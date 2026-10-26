CREATE TABLE IF NOT EXISTS equipment_boards (
 team_id TEXT PRIMARY KEY,
 board_json TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision > 0),
 updated_by TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
