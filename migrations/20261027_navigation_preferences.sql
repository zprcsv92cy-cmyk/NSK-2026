CREATE TABLE IF NOT EXISTS auth_navigation_preferences (
 user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
 shortcuts_json TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
