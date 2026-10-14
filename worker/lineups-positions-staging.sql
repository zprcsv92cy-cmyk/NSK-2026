CREATE TABLE IF NOT EXISTS auth_lineup_positions_staging (lineup_id TEXT PRIMARY KEY, team_id TEXT NOT NULL, positions_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_lineup_positions_team ON auth_lineup_positions_staging(team_id);
