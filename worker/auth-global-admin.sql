-- Production-only role source. Never derive global administration from client claims.
CREATE TABLE IF NOT EXISTS auth_global_admins (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
