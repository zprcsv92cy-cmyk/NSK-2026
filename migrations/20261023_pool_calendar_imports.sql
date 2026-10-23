-- Provenance for calendar-created poolspels. This table alone never deletes a poolspel.
-- Each Baserow pool row can be associated with exactly one importing team.
CREATE TABLE IF NOT EXISTS pool_calendar_imports (
  pool_id INTEGER PRIMARY KEY,
  team_id TEXT NOT NULL,
  pool_date TEXT NOT NULL,
  import_month TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (pool_id > 0),
  CHECK (length(pool_date) = 10),
  CHECK (length(import_month) = 7)
);
CREATE INDEX IF NOT EXISTS pool_calendar_imports_team_month_idx
  ON pool_calendar_imports(team_id, import_month);
