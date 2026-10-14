CREATE TABLE IF NOT EXISTS auth_lineup_units_staging (lineup_id TEXT PRIMARY KEY, team_id TEXT NOT NULL, units_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_lineup_units_team ON auth_lineup_units_staging(team_id);
