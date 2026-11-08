CREATE TABLE IF NOT EXISTS cup_plans (
 team_id TEXT NOT NULL,
 cup_id TEXT NOT NULL,
 cup_json TEXT NOT NULL,
 notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'Planerad',
 revision INTEGER NOT NULL DEFAULT 1,
 updated_by TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (team_id, cup_id)
);
