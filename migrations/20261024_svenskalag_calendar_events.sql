-- Separate calendar cache; never mutates training_sessions or poolspel.
-- Run only after reviewing existing production D1 schema and backup.
CREATE TABLE IF NOT EXISTS svenskalag_calendar_events (
 team_id TEXT NOT NULL,
 event_key TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN ('training','pool','match')),
 event_date TEXT NOT NULL,
 event_json TEXT NOT NULL,
 source TEXT NOT NULL DEFAULT 'svenskalag',
 manually_edited INTEGER NOT NULL DEFAULT 0 CHECK(manually_edited IN (0,1)),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(team_id,event_key)
);
CREATE INDEX IF NOT EXISTS idx_svenskalag_calendar_events_team_date
 ON svenskalag_calendar_events(team_id,event_date);
