-- Apply to the AUTH_DB D1 database before deploying the updated training API.
ALTER TABLE training_sessions ADD COLUMN hall TEXT NOT NULL DEFAULT '';
ALTER TABLE training_sessions ADD COLUMN shirt_color_count INTEGER NOT NULL DEFAULT 3;
