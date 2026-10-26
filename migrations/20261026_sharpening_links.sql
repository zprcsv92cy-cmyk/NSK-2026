CREATE TABLE IF NOT EXISTS sharpening_links (
 team_id TEXT NOT NULL,
 person_id TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('parent','player','off')),
 token_hash TEXT UNIQUE,
 revision INTEGER NOT NULL,
 next_request_at INTEGER NOT NULL DEFAULT 0,
 updated_by TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(team_id,person_id)
);
