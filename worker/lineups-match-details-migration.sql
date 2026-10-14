CREATE TABLE IF NOT EXISTS auth_lineup_match_details_staging (lineup_id TEXT PRIMARY KEY, team_id TEXT NOT NULL, match_date TEXT, opponent TEXT, start_time TEXT, gathering_time TEXT);
CREATE INDEX IF NOT EXISTS idx_lineup_match_details_team ON auth_lineup_match_details_staging(team_id);
