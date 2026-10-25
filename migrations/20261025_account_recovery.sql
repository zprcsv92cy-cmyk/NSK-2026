CREATE TABLE IF NOT EXISTS auth_password_reset_tokens (
 token_hash TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL,
 used_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS auth_password_reset_user ON auth_password_reset_tokens(user_id);
CREATE TABLE IF NOT EXISTS auth_recovery_requests (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
 requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 handled_at TEXT
);
CREATE TABLE IF NOT EXISTS auth_account_rate_limits (
 rate_key TEXT NOT NULL,
 window_start TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(rate_key,window_start)
);
