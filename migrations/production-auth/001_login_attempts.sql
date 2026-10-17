-- Production AUTH_DB only. Apply before enabling the production login guard.
-- Never apply this migration to the staging AUTH_DB.
CREATE TABLE IF NOT EXISTS auth_login_attempts (
  email_key TEXT NOT NULL CHECK (length(email_key) = 64),
  window_start TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  PRIMARY KEY (email_key, window_start)
);
CREATE INDEX IF NOT EXISTS auth_login_attempts_window_idx
  ON auth_login_attempts(window_start);
