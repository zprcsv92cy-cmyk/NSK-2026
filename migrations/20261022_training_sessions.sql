-- Shared training sessions: migration for an isolated D1 environment only.
-- Do not apply to production before auth and team-scoped API tests pass.
CREATE TABLE IF NOT EXISTS training_sessions (
  team_id TEXT NOT NULL,
  training_date TEXT NOT NULL,
  selected_players_json TEXT NOT NULL DEFAULT '[]',
  selected_coaches_json TEXT NOT NULL DEFAULT '[]',
  goalies_json TEXT NOT NULL DEFAULT '[]',
  goalie_count INTEGER NOT NULL DEFAULT 0 CHECK (goalie_count BETWEEN 0 AND 2),
  allocation_json TEXT NOT NULL DEFAULT '[]',
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (team_id, training_date),
  CHECK (length(team_id) BETWEEN 1 AND 100),
  CHECK (training_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
CREATE INDEX IF NOT EXISTS training_sessions_updated_idx ON training_sessions(team_id, updated_at);
