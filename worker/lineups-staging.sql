CREATE TABLE IF NOT EXISTS auth_lineups_staging (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, match_name TEXT NOT NULL, goalie_id TEXT, player_ids TEXT NOT NULL, coach_ids TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_auth_lineups_staging_team ON auth_lineups_staging(team_id);
