CREATE TABLE IF NOT EXISTS pool_flow_deletions(pool_id INTEGER PRIMARY KEY,team_row_id INTEGER NOT NULL,plan_json TEXT NOT NULL,step INTEGER NOT NULL DEFAULT 0,lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS pool_flow_saves(pool_id INTEGER NOT NULL,lag_no INTEGER NOT NULL,match_no INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'ready',lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(pool_id,lag_no,match_no));
CREATE TABLE IF NOT EXISTS pool_flow_calendar(pool_id INTEGER PRIMARY KEY);
INSERT OR IGNORE INTO pool_flow_calendar(pool_id) SELECT pool_id FROM pool_calendar_imports;
CREATE TABLE IF NOT EXISTS pool_flow_equipment(pool_id INTEGER PRIMARY KEY,coach_id INTEGER,revision INTEGER NOT NULL DEFAULT 1);
