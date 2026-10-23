-- Apply to isolated D1 first; production requires an approved migration.
ALTER TABLE training_sessions ADD COLUMN hall TEXT NOT NULL DEFAULT '' CHECK (hall IN ('','Lilla Hallen','Stora hallen'));
ALTER TABLE training_sessions ADD COLUMN shirt_color_count INTEGER NOT NULL DEFAULT 3 CHECK (shirt_color_count BETWEEN 2 AND 4);
