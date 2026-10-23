-- Provenance for calendar-created training sessions; existing sessions remain unmarked.
CREATE TABLE IF NOT EXISTS training_calendar_imports (
  team_id TEXT NOT NULL,
  training_date TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(team_id,training_date)
);
CREATE INDEX IF NOT EXISTS training_calendar_imports_month_idx ON training_calendar_imports(team_id,training_date);
