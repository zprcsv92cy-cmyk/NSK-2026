-- Independent from person-card/material revisions. Existing roster/card rows are untouched.
CREATE TABLE IF NOT EXISTS person_photos (
 team_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK (kind IN ('player','coach')),
 person_id TEXT NOT NULL,
 photo TEXT CHECK (photo IS NULL OR length(photo) <= 131072),
 revision INTEGER NOT NULL CHECK (revision > 0),
 PRIMARY KEY (team_id,kind,person_id)
);
