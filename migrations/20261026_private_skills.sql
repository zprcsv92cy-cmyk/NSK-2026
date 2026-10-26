-- Private assessments: separate from shared person cards, training records and schedules.
CREATE TABLE IF NOT EXISTS private_skills_boards (
 team_id TEXT PRIMARY KEY,
 cards_json TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 revision INTEGER NOT NULL CHECK(revision > 0),
 updated_by TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
